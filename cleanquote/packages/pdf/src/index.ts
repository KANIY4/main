import { measure, wrap, type FontName } from './metrics';

/**
 * A small PDF writer.
 *
 * Written rather than pulled in because a branded proposal needs headings,
 * wrapped body text, a rule and a table — and the libraries that do that bring
 * a font pipeline and tens of megabytes with them. Using the standard fonts
 * every reader already provides means nothing has to be embedded, at the cost of
 * the generator knowing their metrics, which is `metrics.ts`.
 *
 * Deliberately not general: no images, no colour spaces beyond RGB, no forms.
 * When the proposal needs a site photo on the page, that is the moment to
 * reconsider — not before.
 */

export interface PageStyle {
  readonly widthPt: number;
  readonly heightPt: number;
  readonly marginPt: number;
}

/** A4 in points, which is what the target markets print on. */
export const A4: PageStyle = { widthPt: 595.28, heightPt: 841.89, marginPt: 56 };

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const BLACK: Rgb = { r: 0.07, g: 0.08, b: 0.11 };
const GREY: Rgb = { r: 0.42, g: 0.45, b: 0.52 };

export class PdfDocument {
  private readonly pages: string[] = [];
  private current: string[] = [];
  private cursor: number;

  constructor(
    private readonly style: PageStyle = A4,
    private readonly accent: Rgb = { r: 0.12, g: 0.44, b: 0.92 },
  ) {
    this.cursor = style.heightPt - style.marginPt;
  }

  private get contentWidth(): number {
    return this.style.widthPt - this.style.marginPt * 2;
  }

  /** Starts a new page when the next block would not fit on this one. */
  private ensureSpace(height: number): void {
    if (this.cursor - height >= this.style.marginPt) return;
    this.pages.push(this.current.join('\n'));
    this.current = [];
    this.cursor = this.style.heightPt - this.style.marginPt;
  }

  private write(text: string, font: FontName, size: number, colour: Rgb, x: number): void {
    this.current.push(
      'BT',
      `/${font === 'Helvetica-Bold' ? 'F2' : 'F1'} ${size} Tf`,
      `${colour.r} ${colour.g} ${colour.b} rg`,
      `1 0 0 1 ${x.toFixed(2)} ${this.cursor.toFixed(2)} Tm`,
      `(${escape(text)}) Tj`,
      'ET',
    );
  }

  heading(text: string, level: 1 | 2 = 1): this {
    const size = level === 1 ? 22 : 13;
    const lines = wrap(text, 'Helvetica-Bold', size, this.contentWidth);
    this.ensureSpace(lines.length * size * 1.3 + 10);
    for (const line of lines) {
      this.cursor -= size * 1.25;
      this.write(
        line,
        'Helvetica-Bold',
        size,
        level === 1 ? BLACK : this.accent,
        this.style.marginPt,
      );
    }
    this.cursor -= level === 1 ? 10 : 6;
    return this;
  }

  paragraph(text: string, options: { size?: number; muted?: boolean } = {}): this {
    const size = options.size ?? 10.5;
    const lines = wrap(text, 'Helvetica', size, this.contentWidth);
    for (const line of lines) {
      this.ensureSpace(size * 1.5);
      this.cursor -= size * 1.45;
      this.write(line, 'Helvetica', size, options.muted ? GREY : BLACK, this.style.marginPt);
    }
    this.cursor -= 6;
    return this;
  }

  bullets(items: readonly string[]): this {
    const size = 10.5;
    for (const item of items) {
      const lines = wrap(item, 'Helvetica', size, this.contentWidth - 14);
      for (const [index, line] of lines.entries()) {
        this.ensureSpace(size * 1.5);
        this.cursor -= size * 1.45;
        if (index === 0) this.write('•', 'Helvetica', size, this.accent, this.style.marginPt);
        this.write(line, 'Helvetica', size, BLACK, this.style.marginPt + 14);
      }
    }
    this.cursor -= 6;
    return this;
  }

  /** A label above a large figure — the one number the reader is looking for. */
  feature(label: string, value: string, note?: string): this {
    this.ensureSpace(64);
    this.cursor -= 16;
    this.write(label.toUpperCase(), 'Helvetica-Bold', 8.5, GREY, this.style.marginPt);
    this.cursor -= 30;
    this.write(value, 'Helvetica-Bold', 26, BLACK, this.style.marginPt);
    if (note) {
      this.cursor -= 15;
      this.write(note, 'Helvetica', 10, GREY, this.style.marginPt);
    }
    this.cursor -= 10;
    return this;
  }

  /** Two columns: a label on the left, a value right-aligned. */
  definitionRow(label: string, value: string): this {
    this.ensureSpace(18);
    this.cursor -= 15;
    this.write(label, 'Helvetica', 10, GREY, this.style.marginPt);
    const width = measure(value, 'Helvetica-Bold', 10);
    this.write(
      value,
      'Helvetica-Bold',
      10,
      BLACK,
      this.style.widthPt - this.style.marginPt - width,
    );
    return this;
  }

  rule(): this {
    this.ensureSpace(14);
    this.cursor -= 10;
    this.current.push(
      '0.87 0.89 0.92 RG',
      '0.8 w',
      `${this.style.marginPt} ${this.cursor.toFixed(2)} m`,
      `${(this.style.widthPt - this.style.marginPt).toFixed(2)} ${this.cursor.toFixed(2)} l`,
      'S',
    );
    this.cursor -= 8;
    return this;
  }

  spacer(points = 12): this {
    this.ensureSpace(points);
    this.cursor -= points;
    return this;
  }

  render(): Uint8Array {
    const pages = [...this.pages, this.current.join('\n')].filter((page) => page.length > 0);
    const streams = pages.length > 0 ? pages : [''];

    // Object 1 catalogue, 2 pages, 3 font, 4 bold font, then a page and a
    // content stream per page.
    const objects: string[] = [];
    const pageIds = streams.map((_, index) => 5 + index * 2);

    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push(
      `<< /Type /Pages /Count ${streams.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`,
    );
    objects.push(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    );
    objects.push(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    );

    for (const [index, content] of streams.entries()) {
      const contentId = pageIds[index]! + 1;
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.style.widthPt.toFixed(2)} ${this.style.heightPt.toFixed(2)}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
      );
      objects.push(`<< /Length ${byteLength(content)} >>\nstream\n${content}\nendstream`);
    }

    return assemble(objects);
  }
}

/**
 * Escapes the three characters that mean something inside a PDF string, and
 * folds anything outside WinAnsi to an ASCII approximation.
 *
 * A client name with an umlaut in it must not corrupt the content stream, and a
 * silently dropped character in a legal document is worse than a plain one.
 */
function escape(text: string): string {
  return [...text]
    .map((character) => {
      const code = character.codePointAt(0) ?? 32;
      if (character === '\\') return '\\\\';
      if (character === '(') return '\\(';
      if (character === ')') return '\\)';
      // WinAnsi puts the bullet at 0x95; 0xB7 is a middot and reads as a speck.
      if (code === 0x2022) return '\\225';
      if (code === 0x2014 || code === 0x2013) return '-';
      if (code === 0x2019 || code === 0x2018) return "'";
      if (code === 0x201c || code === 0x201d) return '"';
      if (code < 32) return ' ';
      if (code > 255) return '?';
      if (code > 126) return `\\${code.toString(8).padStart(3, '0')}`;
      return character;
    })
    .join('');
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, 'latin1');
}

/** Writes the object table and the cross-reference table a reader needs to open the file. */
function assemble(objects: readonly string[]): Uint8Array {
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];

  for (const [index, object] of objects.entries()) {
    offsets.push(byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(body, 'latin1'));
}

export { measure, wrap };
export type { FontName };

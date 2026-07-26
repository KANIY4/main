import { describe, expect, it } from 'vitest';

import { A4, PdfDocument, measure, wrap } from '../src/index';

function text(pdf: Uint8Array): string {
  return Buffer.from(pdf).toString('latin1');
}

describe('text measurement', () => {
  it('measures a wider string as wider', () => {
    expect(measure('MMMM', 'Helvetica', 10)).toBeGreaterThan(measure('llll', 'Helvetica', 10));
  });

  it('scales linearly with the font size', () => {
    expect(measure('Northwind', 'Helvetica', 20)).toBeCloseTo(
      measure('Northwind', 'Helvetica', 10) * 2,
      5,
    );
  });

  it('measures bold as wider than regular for the same text', () => {
    expect(measure('Investment', 'Helvetica-Bold', 12)).toBeGreaterThan(
      measure('Investment', 'Helvetica', 12),
    );
  });

  it('measures an unknown character rather than ignoring it', () => {
    expect(measure('日', 'Helvetica', 10)).toBeGreaterThan(0);
  });
});

describe('wrapping', () => {
  it('keeps every line within the requested width', () => {
    const body =
      'Cleaning of the level three open plan area, amenities and kitchen, five nights a week, ' +
      'excluding public holidays unless otherwise agreed in writing.';

    const lines = wrap(body, 'Helvetica', 10.5, 300);

    for (const line of lines) {
      expect(measure(line, 'Helvetica', 10.5)).toBeLessThanOrEqual(300);
    }
  });

  it('loses no words', () => {
    const body = 'The loading dock is available between six and nine in the morning only.';

    const lines = wrap(body, 'Helvetica', 10.5, 120);

    expect(lines.join(' ').split(/\s+/)).toEqual(body.split(/\s+/));
  });

  it('breaks a word that cannot fit rather than letting it overflow', () => {
    const lines = wrap('a'.repeat(200), 'Helvetica', 10.5, 100);

    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measure(line, 'Helvetica', 10.5)).toBeLessThanOrEqual(100);
    }
  });

  it('treats a newline as a paragraph break', () => {
    expect(wrap('first\nsecond', 'Helvetica', 10, 500)).toEqual(['first', 'second']);
  });
});

describe('document structure', () => {
  it('produces a file a reader will recognise as a PDF', () => {
    const pdf = new PdfDocument().heading('Proposal').paragraph('Body text.').render();

    expect(text(pdf).startsWith('%PDF-1.4')).toBe(true);
    expect(text(pdf).trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('declares a cross-reference offset that points at the table', () => {
    const rendered = text(new PdfDocument().paragraph('Body text.').render());

    const startxref = Number(/startxref\n(\d+)/.exec(rendered)?.[1]);
    expect(rendered.slice(startxref, startxref + 4)).toBe('xref');
  });

  it('lists one cross-reference entry per object plus the free entry', () => {
    const rendered = text(new PdfDocument().paragraph('Body text.').render());

    const declared = Number(/xref\n0 (\d+)/.exec(rendered)?.[1]);
    const objects = [...rendered.matchAll(/^\d+ 0 obj$/gm)].length;
    expect(declared).toBe(objects + 1);
  });

  it('starts a second page when the content outgrows the first', () => {
    const doc = new PdfDocument();
    for (let index = 0; index < 120; index += 1) {
      doc.paragraph(`Line ${index} of a long scope of works description.`);
    }

    const rendered = text(doc.render());

    expect(/\/Count (\d+)/.exec(rendered)?.[1]).not.toBe('1');
  });

  it('writes the page size it was configured with', () => {
    const rendered = text(new PdfDocument(A4).paragraph('Body.').render());

    expect(rendered).toContain('/MediaBox [0 0 595.28 841.89]');
  });

  it('renders the text it was given into the content stream', () => {
    const rendered = text(new PdfDocument().heading('Northwind Facilities').render());

    expect(rendered).toContain('(Northwind Facilities) Tj');
  });
});

describe('escaping', () => {
  it('renders a bullet at the code point a standard font puts it at', () => {
    const rendered = text(new PdfDocument().bullets(['Vacuum open plan']).render());

    expect(rendered).toContain('(\\225) Tj');
  });

  it('escapes the characters that would otherwise end a PDF string', () => {
    const rendered = text(new PdfDocument().paragraph('Costs (annual) \\ adjusted').render());

    expect(rendered).toContain('\\(annual\\)');
    expect(rendered).toContain('\\\\');
  });

  it('renders a curly apostrophe as one a standard font can show', () => {
    const rendered = text(new PdfDocument().paragraph('the client’s site').render());

    expect(rendered).toContain("(the client's site) Tj");
  });

  it('keeps an accented character rather than dropping it', () => {
    const rendered = text(new PdfDocument().paragraph('Café Rouge').render());

    // Octal escape for é in WinAnsi, not a silently missing letter.
    expect(rendered).toContain('Caf\\351 Rouge');
  });

  it('replaces a character no standard font can render, rather than corrupting the stream', () => {
    const rendered = text(new PdfDocument().paragraph('Site 日本').render());

    expect(rendered).toContain('(Site ??) Tj');
  });
});

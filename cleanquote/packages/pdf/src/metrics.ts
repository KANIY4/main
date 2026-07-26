/**
 * Character widths for the two standard fonts this generator uses.
 *
 * Helvetica and Helvetica-Bold are among the fourteen fonts every PDF reader is
 * required to provide, so nothing has to be embedded. The trade is that the
 * generator has to know their metrics itself in order to wrap a line — these are
 * the published advance widths, in units of 1/1000 em, for the printable ASCII
 * range a proposal actually uses.
 *
 * A character outside the range is measured as an average rather than dropped,
 * so an accented client name wraps approximately rather than overflowing.
 */

const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

const FIRST_CODE = 32;
const AVERAGE_WIDTH = 556;

export type FontName = 'Helvetica' | 'Helvetica-Bold';

/** Width of a string at a given size, in points. */
export function measure(text: string, font: FontName, size: number): number {
  const table = font === 'Helvetica-Bold' ? HELVETICA_BOLD : HELVETICA;
  let total = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? FIRST_CODE;
    const width = table[code - FIRST_CODE];
    total += width ?? AVERAGE_WIDTH;
  }
  return (total * size) / 1000;
}

/**
 * Greedy wrap.
 *
 * A word longer than the whole line is broken rather than allowed to run off
 * the page — a storage key or a long URL in a client message would otherwise
 * disappear into the margin.
 */
export function wrap(text: string, font: FontName, size: number, maxWidth: number): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate, font, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (measure(word, font, size) <= maxWidth) {
        current = word;
        continue;
      }
      let fragment = '';
      for (const character of word) {
        if (measure(fragment + character, font, size) > maxWidth) {
          lines.push(fragment);
          fragment = character;
        } else {
          fragment += character;
        }
      }
      current = fragment;
    }
    lines.push(current);
  }

  return lines;
}

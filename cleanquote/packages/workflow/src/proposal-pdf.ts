import { A4, PdfDocument } from '@cleanquote/pdf';

import type { ProposalContent } from './proposal';

/**
 * The proposal as a PDF.
 *
 * Rendered from the same stored client-facing projection the web page reads, so
 * the document a client downloads and the page they were looking at cannot
 * disagree. It follows that this function has no access to margin, cost,
 * contingency, strategy name or negotiation floor — they are not on the object
 * it is given.
 */
export function renderProposalPdf(content: ProposalContent): Uint8Array {
  const accent = parseColour(content.brandColour) ?? { r: 0.12, g: 0.44, b: 0.92 };
  const doc = new PdfDocument(A4, accent);

  doc.paragraph(content.organisationName.toUpperCase(), { size: 9, muted: true });
  doc.heading(content.title, 1);
  doc.paragraph(
    `Prepared for ${content.clientName}${content.siteName ? ` · ${content.siteName}` : ''}`,
    { muted: true },
  );
  doc.paragraph(`Reference ${content.reference} · prepared ${content.preparedOn}`, {
    size: 9,
    muted: true,
  });
  doc.rule();

  const investment = content.investment;
  const annual = Number(investment.annualExTax);
  if (annual > 0) {
    doc.feature(
      'Your investment',
      formatMoney(investment.annualExTax, investment.currency),
      `a year, excluding ${investment.taxLabel} · ${formatMoney(investment.annualIncTax, investment.currency)} including ${investment.taxLabel}`,
    );
    if (investment.perMonthExTax) {
      doc.definitionRow(
        'Monthly equivalent',
        formatMoney(investment.perMonthExTax, investment.currency),
      );
    }
    doc.definitionRow('Contract term', `${investment.contractTermMonths} months`);
  }

  if (investment.oneOffExTax && Number(investment.oneOffExTax) > 0) {
    doc.definitionRow(
      annual > 0 ? 'One-off work' : 'Your investment',
      formatMoney(investment.oneOffExTax, investment.currency),
    );
  }

  doc.definitionRow('Valid until', content.validUntil);
  doc.rule();

  for (const section of content.sections) {
    doc.heading(section.heading, 2);
    if (section.body) doc.paragraph(section.body);
    if (section.items && section.items.length > 0) doc.bullets(section.items);
    doc.spacer(4);
  }

  doc.rule();
  doc.paragraph(
    `This proposal was prepared by ${content.organisationName} and is valid until ${content.validUntil}.`,
    { size: 9, muted: true },
  );

  return doc.render();
}

/** `#1f6feb` to the 0-1 RGB triple a PDF content stream wants. Anything else is ignored. */
function parseColour(value: string | null): { r: number; g: number; b: number } | undefined {
  if (!value) return undefined;
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match?.[1]) return undefined;
  const int = Number.parseInt(match[1], 16);
  return {
    r: ((int >> 16) & 0xff) / 255,
    g: ((int >> 8) & 0xff) / 255,
    b: (int & 0xff) / 255,
  };
}

/**
 * Formats for display only.
 *
 * The amount arrives as a decimal string and becomes a number exactly here, at
 * the point of rendering glyphs, and never travels back.
 */
function formatMoney(amount: string, currency: string): string {
  const value = Number(amount);
  const formatted = value.toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${formatted}`;
}

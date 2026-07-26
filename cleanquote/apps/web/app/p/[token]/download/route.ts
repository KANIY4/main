import { readPublicProposal, renderProposalPdf, type ProposalContent } from '@cleanquote/workflow';
import { NextResponse } from 'next/server';

import { consumeRateLimit } from '@/lib/rate-limit';
import { requestContext } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * The proposal as a downloadable PDF.
 *
 * Resolved from the same token and the same stored client-facing projection as
 * the page, so the document and the page cannot drift apart. A revoked or
 * expired token gets the same 404 as a wrong one — telling the difference would
 * turn the link into an oracle.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const context = await requestContext();

  const limit = await consumeRateLimit(`proposal-pdf:${context.ip ?? 'unknown'}`, {
    limit: 30,
    windowSeconds: 300,
  });
  if (!limit.allowed) {
    return new NextResponse('Too many requests', {
      status: 429,
      headers: { 'retry-after': String(limit.retryAfterSeconds) },
    });
  }

  const proposal = await readPublicProposal(token);
  if (!proposal) return new NextResponse('Not found', { status: 404 });

  const content = proposal.content as unknown as ProposalContent;
  const pdf = renderProposalPdf(content);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filenameFor(content)}"`,
      // Private: this is one client's pricing, not a cacheable asset.
      'cache-control': 'private, no-store',
    },
  });
}

function filenameFor(content: ProposalContent): string {
  const safe = content.reference.replace(/[^A-Za-z0-9-]/g, '') || 'proposal';
  return `${safe}.pdf`;
}

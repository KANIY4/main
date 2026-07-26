import Link from 'next/link';

import { listQuotes, sourceMode } from '@/lib/quote-source';

export default async function HomePage() {
  const quotes = await listQuotes();
  const mode = sourceMode();

  return (
    <div className="stack">
      <div>
        <p className="eyebrow">Quotes</p>
        <h1>Pricing workspace</h1>
        <p className="muted" style={{ maxWidth: '62ch' }}>
          Each quote below is priced live by the deterministic engine — labour built from production
          benchmarks or staffing commitments, costed through the rate card, recovered against
          overhead and held above the organisation&rsquo;s commercial floors.
        </p>
      </div>

      {mode === 'demonstration' && (
        <div className="banner banner-info">
          <strong>Demonstration mode.</strong> No database is configured, so these quotes come from
          the seed cases in <code>@cleanquote/seed-cases</code>. Every figure on screen is
          calculated by the real pricing engine; only persistence and authentication are absent. Set{' '}
          <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to
          run against Postgres.
        </div>
      )}

      <ul className="quote-list">
        {quotes.map((quote) => (
          <li key={quote.id}>
            <Link className="quote-card" href={`/quotes/${quote.id}`}>
              <h3>{quote.title}</h3>
              <p className="muted" style={{ marginBottom: 0 }}>
                {quote.summary}
              </p>
              <div className="tag-row">
                {quote.exercises.map((item) => (
                  <span className="tag" key={item}>
                    {item}
                  </span>
                ))}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <p className="footnote">
        Pricing strategies are internal. A client only ever sees the proposal built from the
        strategy an authorised user selects and approves.
      </p>
    </div>
  );
}

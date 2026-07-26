import Link from 'next/link';

import { listDemonstrationQuotes } from '@/lib/quote-source';

export const metadata = { title: 'Demonstration cases' };

export default async function DemoPage() {
  const quotes = await listDemonstrationQuotes();

  return (
    <div className="stack">
      <div>
        <p className="eyebrow">Demonstration</p>
        <h1>Worked pricing cases</h1>
        <p className="muted" style={{ maxWidth: '62ch' }}>
          Each quote below is priced live by the deterministic engine — labour built from production
          benchmarks or staffing commitments, costed through the rate card, recovered against
          overhead and held above the organisation&rsquo;s commercial floors.
        </p>
      </div>

      <div className="banner banner-info">
        <strong>These are worked examples, not your data.</strong> They come from the seed cases in{' '}
        <code>@cleanquote/seed-cases</code> and are priced live by the real engine, so every figure
        on screen is genuinely calculated. Your own quotes live in the{' '}
        <Link href="/dashboard">workspace</Link>.
      </div>

      <ul className="quote-list">
        {quotes.map((quote) => (
          <li key={quote.id}>
            <Link className="quote-card" href={`/demo/${quote.id}`}>
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

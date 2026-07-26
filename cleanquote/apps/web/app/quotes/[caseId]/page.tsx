import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CostBreakdown } from '@/components/cost-breakdown';
import { ScenarioCard } from '@/components/scenario-card';
import { money, percent } from '@/lib/format';
import { getPricedQuote } from '@/lib/quote-source';

interface PageProps {
  readonly params: Promise<{ readonly caseId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { caseId } = await params;
  const quote = await getPricedQuote(caseId);
  return { title: quote?.summary.title ?? 'Quote not found' };
}

/**
 * Permissions are resolved server-side in connected mode from the caller's
 * membership. Demonstration mode has no session, so it shows the full internal
 * view — the same view a director would see.
 */
const DEMO_PERMISSIONS = { canViewCost: true, canViewProfit: true };

export default async function QuotePage({ params }: PageProps) {
  const { caseId } = await params;
  const quote = await getPricedQuote(caseId);
  if (!quote) notFound();

  const { summary, seedCase, result } = quote;
  const currency = result.currency;
  const recommended = result.scenarios.find((s) => s.key === result.recommendedScenarioKey);

  return (
    <div className="stack">
      <div>
        <p className="eyebrow">
          <Link href="/">Quotes</Link> / {seedCase.input.contract.termMonths}-month term
        </p>
        <h1>{summary.title}</h1>
        <p className="muted" style={{ maxWidth: '70ch' }}>
          {summary.summary}
        </p>
      </div>

      {result.warnings.length > 0 && (
        <div className="card">
          <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>
            Before this price is released
          </p>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {result.warnings.map((warning) => (
              <li key={warning} className="muted" style={{ marginBottom: '0.3rem' }}>
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section>
        <h2>Pricing strategies</h2>
        <p className="muted" style={{ maxWidth: '70ch' }}>
          These three strategies are internal. The client sees only the proposal built from the one
          an authorised user selects and approves.
        </p>
        <div className="grid grid-3">
          {result.scenarios.map((scenario) => (
            <ScenarioCard
              key={scenario.key}
              scenario={scenario}
              currency={currency}
              isRecommended={scenario.key === result.recommendedScenarioKey}
              canViewCost={DEMO_PERMISSIONS.canViewCost}
              canViewProfit={DEMO_PERMISSIONS.canViewProfit}
            />
          ))}
        </div>
      </section>

      {recommended && (
        <section className="card">
          <p className="eyebrow">Why {recommended.label}</p>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {result.recommendationReasons.map((reason) => (
              <li key={reason} style={{ marginBottom: '0.35rem' }}>
                {reason}
              </li>
            ))}
          </ul>
          <p className="faint" style={{ margin: '0.9rem 0 0' }}>
            The recommendation is rule-based and reproducible. It reads the estimator&rsquo;s own
            commercial judgements and this organisation&rsquo;s own history — never another
            organisation&rsquo;s pricing.
          </p>
        </section>
      )}

      {recommended && (
        <section>
          <h2>Negotiation range</h2>
          <div className="grid grid-3">
            <div className="card">
              <p className="eyebrow">Quoted</p>
              <p className="headline-price num" style={{ fontSize: '1.4rem' }}>
                {money(recommended.price.annualExTax, currency)}
              </p>
              <p className="faint" style={{ margin: 0 }}>
                {percent(recommended.margin.grossMarginPct)} gross margin
              </p>
            </div>
            <div className="card">
              <p className="eyebrow">Recommended floor</p>
              <p className="headline-price num" style={{ fontSize: '1.4rem' }}>
                {money(recommended.negotiation.recommendedFloorAnnualPrice, currency)}
              </p>
              <p className="faint" style={{ margin: 0 }}>
                Halfway to the authorised limit
              </p>
            </div>
            <div className="card">
              <p className="eyebrow">Lowest authorised</p>
              <p className="headline-price num" style={{ fontSize: '1.4rem' }}>
                {money(recommended.negotiation.lowestAuthorisedAnnualPrice, currency)}
              </p>
              <p className="faint" style={{ margin: 0 }}>
                Below this needs an approved override
              </p>
            </div>
          </div>
        </section>
      )}

      <section>
        <h2>How the price was built</h2>
        <p className="muted" style={{ maxWidth: '70ch' }}>
          Every figure below is traceable to a rate-card entry, a production benchmark or a captured
          quantity. Nothing here was generated by a language model.
        </p>
        <div className="stack">
          {result.scenarios.map((scenario) => (
            <details key={scenario.key} open={scenario.key === result.recommendedScenarioKey}>
              <summary>
                {scenario.label} — {money(scenario.price.annualExTax, currency)} a year
              </summary>
              <CostBreakdown scenario={scenario} currency={currency} />
            </details>
          ))}
        </div>
      </section>

      <section>
        <h2>Commercial floors</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Strategy</th>
                <th scope="col">Guardrail</th>
                <th scope="col">Outcome</th>
                <th scope="col">Floor</th>
                <th scope="col">Before</th>
              </tr>
            </thead>
            <tbody>
              {result.scenarios.flatMap((scenario) =>
                scenario.guardrails.map((g) => (
                  <tr key={`${scenario.key}-${g.guardrail}`}>
                    <td>{scenario.label}</td>
                    <td>{g.guardrail.replace(/_/g, ' ')}</td>
                    <td>
                      {g.outcome === 'satisfied' && <span>Satisfied</span>}
                      {g.outcome === 'enforced' && (
                        <strong style={{ color: 'var(--caution)' }}>Price lifted</strong>
                      )}
                      {g.outcome === 'overridden' && (
                        <strong style={{ color: 'var(--danger)' }}>Overridden</strong>
                      )}
                    </td>
                    <td className="num">{g.requiredValue}</td>
                    <td className="num">{g.actualValueBefore}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="footnote">
        Calculation schema {result.calculationSchemaVersion} · input hash{' '}
        <code>{result.inputHash}</code>. The same input always produces the same price; a different
        hash means the inputs changed, not the engine.
      </p>
    </div>
  );
}

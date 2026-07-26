import type { ScenarioResult } from '@cleanquote/types';

import { costCategoryLabel, hours, labourCategoryLabel, money, percent } from '@/lib/format';

/**
 * Full cost transparency for one scenario.
 *
 * Every figure a price is built from is reachable here. A quote nobody can
 * explain is a quote nobody can defend in front of a client six months later,
 * which is the whole reason the engine emits a line-by-line breakdown rather
 * than a total.
 */
export function CostBreakdown({
  scenario,
  currency,
}: {
  readonly scenario: ScenarioResult;
  readonly currency: string;
}) {
  const labourRecurring = scenario.labour.lines.filter((l) => !l.oneOff);
  const labourOneOff = scenario.labour.lines.filter((l) => l.oneOff);
  const costRecurring = scenario.costs.lines.filter((l) => !l.oneOff);
  const costOneOff = scenario.costs.lines.filter((l) => l.oneOff);

  return (
    <div className="stack">
      <section>
        <h3>Labour</h3>
        <div className="table-scroll">
          <table>
            <caption className="faint" style={{ textAlign: 'left', paddingBottom: '0.4rem' }}>
              Productive hours are time spent cleaning. Paid hours add the absence allowance —
              leave, training and relief cover are paid for but do not clean.
            </caption>
            <thead>
              <tr>
                <th scope="col">Line</th>
                <th scope="col">Category</th>
                <th scope="col" className="right">
                  Visits&nbsp;/&nbsp;yr
                </th>
                <th scope="col" className="right">
                  Productive
                </th>
                <th scope="col" className="right">
                  Paid
                </th>
                <th scope="col" className="right">
                  Cost&nbsp;/&nbsp;hr
                </th>
                <th scope="col" className="right">
                  Annual cost
                </th>
              </tr>
            </thead>
            <tbody>
              {labourRecurring.map((line) => (
                <tr key={line.lineId}>
                  <td>{line.label}</td>
                  <td className="muted">{labourCategoryLabel(line.category)}</td>
                  <td className="right num">{Number(line.occurrencesPerYear).toFixed(0)}</td>
                  <td className="right num">{hours(line.productiveHoursPerYear)}</td>
                  <td className="right num">{hours(line.paidHoursPerYear)}</td>
                  <td className="right num">{money(line.effectiveHourlyCost, currency)}</td>
                  <td className="right num">{money(line.totalCost, currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Recurring labour</td>
                <td className="right num">
                  {hours(scenario.labour.recurringProductiveHoursPerYear)}
                </td>
                <td className="right num">{hours(scenario.labour.recurringPaidHoursPerYear)}</td>
                <td className="right num">{money(scenario.labour.blendedHourlyCost, currency)}</td>
                <td className="right num">{money(scenario.labour.recurringCost, currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {labourOneOff.length > 0 && (
        <section>
          <h3>One-off labour</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col" className="right">
                    Paid hours
                  </th>
                  <th scope="col" className="right">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {labourOneOff.map((line) => (
                  <tr key={line.lineId}>
                    <td>{line.label}</td>
                    <td className="right num">{hours(line.paidHoursPerYear)}</td>
                    <td className="right num">{money(line.totalCost, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {costRecurring.length > 0 && (
        <section>
          <h3>Direct costs</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col">Category</th>
                  <th scope="col" className="right">
                    Annual
                  </th>
                </tr>
              </thead>
              <tbody>
                {costRecurring.map((line) => (
                  <tr key={line.lineId}>
                    <td>{line.label}</td>
                    <td className="muted">{costCategoryLabel(line.category)}</td>
                    <td className="right num">{money(line.annualAmount, currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Recurring direct cost</td>
                  <td className="right num">{money(scenario.costs.recurring, currency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {costOneOff.length > 0 && (
        <section>
          <h3>Mobilisation costs</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col" className="right">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {costOneOff.map((line) => (
                  <tr key={line.lineId}>
                    <td>{line.label}</td>
                    <td className="right num">{money(line.annualAmount, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h3>Overhead, contingency and margin</h3>
        <div className="table-scroll">
          <table>
            <tbody>
              {scenario.overheads.map((rule) => (
                <tr key={rule.code}>
                  <td>
                    {rule.label}
                    <span className="faint"> — {rule.method.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="right num">{money(rule.annualAmount, currency)}</td>
                </tr>
              ))}
              <tr>
                <td>
                  Risk contingency
                  <span className="faint">
                    {' '}
                    — expected value of the register, apportioned to recurring work
                  </span>
                </td>
                <td className="right num">
                  {money(scenario.contingency.riskContingency, currency)}
                </td>
              </tr>
              <tr>
                <td>Discretionary contingency</td>
                <td className="right num">
                  {money(scenario.contingency.discretionaryContingency, currency)}
                </td>
              </tr>
              <tr>
                <td>Total recurring cost</td>
                <td className="right num">{money(scenario.totalRecurringCost, currency)}</td>
              </tr>
              <tr>
                <td>Gross profit</td>
                <td className="right num">{money(scenario.margin.grossProfit, currency)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td>
                  Annual selling price
                  <span className="faint">
                    {' '}
                    — {percent(scenario.margin.grossMarginPct)} gross margin,{' '}
                    {percent(scenario.margin.markupPct)} markup
                  </span>
                </td>
                <td className="right num">{money(scenario.price.annualExTax, currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {scenario.contingency.topRisks.length > 0 && (
        <section>
          <h3>Largest risk exposures</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Risk</th>
                  <th scope="col" className="right">
                    Expected value
                  </th>
                </tr>
              </thead>
              <tbody>
                {scenario.contingency.topRisks.map((risk) => (
                  <tr key={risk.code}>
                    <td>{risk.code.replace(/_/g, ' ')}</td>
                    <td className="right num">{money(risk.expectedValue, currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Whole register</td>
                  <td className="right num">
                    {money(scenario.contingency.riskExpectedValue, currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

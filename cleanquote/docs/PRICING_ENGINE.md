# Pricing engine

The commercial core. Pure, decimal-safe, versioned, and the only place a selling price is
produced.

## Why it is a separate package

A quotation is a commercial record. Six months after it is issued, a client may dispute
it, an operations manager may ask why the site is losing money, or an auditor may ask how
the number was reached. That requires three properties that scattered UI arithmetic cannot
give you:

1. **Purity.** The same input always yields the same output. No clock, no randomness, no
   network, no database.
2. **Versioning.** `CALCULATION_SCHEMA_VERSION` is stamped on every result, and the engine
   refuses to run against an input targeting a different version rather than silently
   applying today's rules to yesterday's quote.
3. **Provenance.** Every result carries `inputHash`, a stable hash of the whole input. A
   different hash means the inputs changed — not the engine.

## Decimal safety

Every monetary value is an arbitrary-precision decimal (`decimal.js`), transported across
every boundary as a _string_.

IEEE-754 doubles cannot represent `0.1`. `0.1 + 0.2 === 0.30000000000000004` is not a
curiosity in a contract worth six figures over five years — it is drift that compounds
through on-costs, overhead recovery and margin. Strings at the boundary mean a value
cannot silently lose precision crossing JSON, the database or the network. There is a test
asserting exactly this.

Quantities, hours and dimensionless factors stay as plain numbers: they originate in
measurements, which are inherently floating point. A 245.5 m² floor area is an estimate
either way.

## Occurrences per year

Everything reduces to occurrences per year. This is the single most consequential
decision in the engine.

```
weekly      daysPerWeek x visitsPerServiceDay x weeksPerYear
            less publicHolidaysPerYear x publicHolidayServiceDayFraction
            when the contract is not serviced on public holidays
fortnightly weeksPerYear / 2
monthly     monthsPerYear x timesPerMonth
quarterly   4        biannual  2        annual  1
on_demand   budgetedCallOutsPerYear  (an assumption, and reported as one)
```

`weeksPerYear` defaults to **52.1775** — the true mean Gregorian year — not 52. Calendar
assumptions are organisation configuration because they materially change annual value.

**Monthly value is annual ÷ 12. It is never weekly × 4.** On a five-day contract the naive
answer understates by 7.7%, every month, for the life of the contract. A test asserts the
correct figure and asserts it is _not_ the naive one.

## Labour

Three ways to derive hours, mixable within one quote:

```
productivity      quantity / unitsPerHour  (or quantity x minutesPerUnit / 60)
                    x difficulty x soil x traffic x furnitureDensity x access x compliance
                    x occurrencesPerYear
                    x scenario multiplier

staffing          cleanersPerShift x hoursPerShift x occurrencesPerYear x scenario multiplier

percent_of_labour basisCategories' productive hours x percentOfHours x supervision multiplier
```

A day porter is a staffing commitment; a floor is a production rate; supervision is a
percentage of the rounds it supervises. Real quotes need all three.

### Productive hours versus paid hours

```
paidHours = productiveHours x (1 + absenceAllowancePct / 100)
```

Annual leave, sick leave, training and relief cover are paid for and do not clean. A cost
model built on productive hours alone understates labour by 10–15% before anything else
goes wrong.

### On-costs cascade

Rules apply in `order`. `appliesTo: 'base'` levies on the base rate; `appliesTo:
'running_total'` levies on everything added before it — which is how a payroll tax
computed on wages _including_ retirement contributions actually works.

```
base 30.00
  + 11.5% of base   (retirement)     = 33.45
  +  3.4% of base   (workers comp)   = 34.47
  +  4.85% of running (payroll tax)  = 36.14
  +  0.35 per hour  (uniform)        = 36.49
```

Nothing here is hard-coded to a jurisdiction. `appliesToEngagements` restricts a rule to
employees, subcontractors or agency labour, so a subcontractor line correctly skips
employment on-costs and picks up a compliance-administration percentage instead.

`fixed_per_year` on-costs (licences, registrations) are allocated across lines in
proportion to paid hours rather than being attached to an hourly rate.

## Cost, overhead and the closed-form price

Overhead recovered as a percentage of revenue makes the cost base depend on the selling
price, which depends on the cost base. Iterating to convergence would be non-deterministic
at the cent and could differ between machines. The engine solves it exactly.

With `C` the price-independent cost base, `o` the combined revenue-overhead rate and `m`
the target margin:

```
P = C + o.P + m.P    =>    P(1 - m - o) = C    =>    P = C / (1 - m - o)
```

and for a markup `k` on total cost:

```
P = (C + o.P)(1 + k)    =>    P = C(1 + k) / (1 - o(1 + k))
```

Where `1 - m - o <= 0` there is no finite price, and the engine raises rather than
returning something plausible. Tests verify the solution by substitution: the achieved
margin equals the target to ten decimal places.

### Margin is not markup

A 40% margin on a $1,000 cost is $1,666.67. A 40% markup is $1,400. The engine reports
both on every scenario, because conflating them is the most common way a contractor
quietly prices below intention.

## Contingency

```
riskExpectedValue = sum over open and accepted risks of (probability x impactAmount)
riskContingency   = riskExpectedValue x scenario multiplier x allocation share
discretionary     = costBase x contingencyPct
```

Risks that have been transferred or fully mitigated carry no loading.

**Allocation share** splits the register between recurring and one-off work in proportion
to direct cost. Without it, a purely one-off job — a window clean, a post-construction
detail — surfaces an annual contract value conjured entirely from its risk register. That
was a real defect, found by building the window-cleaning demonstration case.

## Guardrails

Six floors, all optional, all organisation configuration:

| Guardrail                   | Required annual price         |
| --------------------------- | ----------------------------- |
| `min_gross_margin`          | `C / (1 - m₀ - o)`            |
| `min_contribution_margin`   | `directCost / (1 - cm₀)`      |
| `min_hourly_recovery`       | `rate x recurringPaidHours`   |
| `min_charge_per_visit`      | `charge x occurrencesPerYear` |
| `min_annual_contract_value` | the value itself              |
| `min_mobilisation_charge`   | applies to the one-off price  |

A breached guardrail with no override **raises the price**. The engine never returns a
price below the floor by accident.

A breached guardrail _with_ an override leaves the price alone but is still reported as
`overridden`, carrying the reason, the user and the timestamp. The warning does not go
away because someone had authority to ignore it. The database enforces a substantive
reason (20 characters minimum) and refuses an override recorded under another user's
identity.

## Scenarios

Three internal strategies. The client never sees more than the one an authorised user
selects.

|                           | Aggressive   | Balanced | Premium              |
| ------------------------- | ------------ | -------- | -------------------- |
| Production rates          | lean (×0.95) | expected | conservative (×1.08) |
| Supervision               | ×0.9         | ×1.0     | ×1.25                |
| Discretionary contingency | 1.5%         | 3%       | 6%                   |
| Risk register carried     | 60%          | 100%     | 140%                 |

The aggressive strategy may use leaner assumptions and a thinner margin. It may **not**
hide excluded scope, use impossible production rates, ignore statutory labour cost, or go
below a configured floor without an authorised override — the guardrail stage runs after
every scenario regardless of strategy.

## Confidence and recommendation

Confidence describes how far the _inputs_ can be trusted, not how attractive the price is.
A cheap quote built from guesses scores low; an expensive quote from verified measurements
scores high.

When the capture layer supplies no completeness signal at all, the result reports
`confidenceBasis: 'unknown'`. Absent evidence is not negative evidence — reading a missing
signal as low confidence would push every quote to the premium strategy purely because the
capture layer had not reported yet.

The scenario recommendation is rule-based and deterministic, not model-generated: it
influences a commercial decision, so it has to be reproducible and explainable. It reads
the estimator's own judgements (price sensitivity, route density, labour availability,
capacity) and the organisation's own history. It never touches another organisation's
pricing, and it returns the reasons it weighed — including the significant ones it decided
against.

## Worked example

520 paid hours a year at $30/hour, no on-costs, no overhead, 25% target margin:

```
cost                15,600.00
price               20,800.00     = 15,600 / (1 - 0.25)
gross margin            25.00%
markup                  33.33%
per visit (260/yr)      80.00
per week               400.00     = 20,800 / 52
per month            1,733.33     = 20,800 / 12   (not 1,600)
recovery per hour       40.00
```

Every one of those figures is asserted in `packages/pricing-engine/test/engine.test.ts`.

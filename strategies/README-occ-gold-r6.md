# OCC Gold Engine R6

A non-repainting rebuild of the Open/Close Cross strategy (JayRogers R1-R2, JustUncleL R3-R5.1),
rewritten in Pine Script v6 and tuned for gold: XAUUSD spot and MGC micro gold futures.

## What the original signal actually is

The strategy computes two moving averages of the same length, one over `close` and one over `open`,
and trades their crossover. Their difference is the smoothed average candle body:

```
MA(close, N) - MA(open, N)
```

A crossover is therefore a zero-cross of smoothed body momentum. Near zero this oscillator flips
constantly, which is the source of the original's whipsaw losses.

## Changes from R5.1

### 1. The lookahead leak is removed

R5.1 requested its higher timeframe series with `barmerge.lookahead_on`. On historical bars this
delivers the *final* value of a higher timeframe bar to every chart bar inside it, including bars
that print before that higher timeframe bar has closed. That is future information. It cannot happen
in live trading, which is why the original author observed that "non-repainting mode" caused
performance to collapse — the collapse was the leak being removed, not a tuning problem.

R6 always uses `lookahead_off`, and by default reads the expression one bar back inside the higher
timeframe context, which resolves to the last fully closed higher timeframe bar. Signals are final
once printed.

**Any comparison against the published R5.1 backtest is meaningless.** Establish a new baseline by
running R5.1 with lookahead disabled, then measure R6 against that.

### 2. The delay input is gone

R5.1's "Delay Open/Close MA" shifted the price source (`close[n]`), not the `security` call. It added
lag without removing the leak. Confirmation is now handled in the security request itself.

### 3. ATR-normalised entry band replaces the raw zero-cross

```
strength = (MA(close) - MA(open)) / ATR
```

This is dimensionless, so the same threshold works across instruments and volatility regimes. A
position opens only when `|strength|` clears the entry band, and closes to flat when it falls back
inside the smaller flat band. Setting the entry band to 0 reproduces the original raw zero-cross for
comparison.

### 4. The strategy is allowed to stand flat

R5.1 was permanently in the market, stop-and-reverse, with no stop loss enabled by default. R6 exits
to flat when trend strength decays, which is where most of the chop cost is avoided.

### 5. ATR-based exits and risk-based sizing

Fixed "points" stops are replaced by ATR multiples, an optional partial take profit at an R multiple,
optional breakeven after the partial, and an optional chandelier trail. Position size is derived from
risk per trade and the stop distance, then rounded down to the tradable step and clamped to the size
range the account allows.

### 6. Reproducible backtest window

R5.1 limited history with `timenow`, so results shifted every day. R6 uses fixed start and end dates.

## Instrument setup

### XAUUSD spot — Blackbull Markets

- Preset: `XAUUSD Spot (lots)`
- TradingView prices XAUUSD per ounce, so quantity units are ounces. One standard 100oz lot = 100 units.
  0.01 lots = 1 unit, 0.03 lots = 3 units.
- Auto size bounds give 0.01 to 0.03 lots in 0.01 steps.
- Commission: raw-spread accounts charge roughly $3.50 per lot per side. Since quantity is in ounces,
  that is `commission_value = 0.035`. Pine only accepts constants in the `strategy()` declaration, so
  commission and slippage are literals at the top of the file rather than inputs — edit them there.
- Slippage: mintick is normally 0.01, so 2-3 ticks is realistic during London and New York, more
  around news.
- 500x leverage means margin is not the binding constraint; the stop distance and risk percentage are.
  Verify that 0.01 lots at a 2x ATR stop does not exceed your intended risk on the account size you
  actually fund — at small balances the minimum lot may risk more than the configured percentage, in
  which case the size clamp will floor at 0.01 and your real risk will be higher than requested.

### MGC micro gold futures — Apex / Tradovate

- Preset: `MGC Micro Gold Futures (contracts)`
- MGC is 10 troy ounces, $10 per $1.00 move, tick 0.10 = $1.00.
- Auto size bounds give 1 to 5 contracts in steps of 1. Futures contracts cannot be fractional, so the
  "0.2 - 0.5 lots" sizing you described has to be expressed as a whole number of contracts — confirm
  what that maps to on your Apex account and adjust the min/max inputs if it is not 1 to 5.
- Commission: about $1.04 round turn through Tradovate on Apex, so roughly `commission_value = 0.52`
  per side. Edit it in the `strategy()` declaration; it cannot be an input.
- Slippage: 1-2 ticks, also set in the declaration.
- Set "Max intraday loss" below your Apex daily drawdown limit. The trailing threshold drawdown on
  evaluation accounts is stricter than the intraday rule, so treat this as a floor, not a guarantee.

## Suggested starting parameters

Gold on M15 chart with a 3x multiplier (M45 signal):

| Input | Start value |
|---|---|
| Higher timeframe multiplier | 3 |
| MA type / period | SMMA / 8 |
| ATR length | 14 |
| Entry band | 0.25 |
| Flat band | 0.05 |
| ADX minimum | 18 |
| Slow trend EMA | 50 |
| Initial stop | 2.0 x ATR |
| Partial target | 1.5R at 50% |
| Trail | start 1.0R, 2.5 x ATR |
| Risk per trade | 0.5% |

These are starting points, not optimised values. Optimise on the first 60% of history and verify on
the remaining 40% untouched.

## Validation protocol

Run these in order. Skipping straight to the last step will produce a number you cannot trust.

1. **Quantify the leak.** Run the original R5.1 as published, then again with `lookahead_off` and a
   `[1]` offset. The difference is how much of the original edge was future data. Record it.
2. **Set costs before anything else.** Commission and slippage per the instrument sections above. A
   high-frequency cross system looks profitable at zero cost and unprofitable at realistic cost.
3. **Add one change at a time.** After each, record trade count, profit factor, max drawdown, average
   R, and time in market. A change that improves profit only by cutting the trade count below about
   100 is noise, not improvement.
4. **Test across timeframes.** M5, M15, H1 on the same parameters. Parameters that only work on one
   timeframe are fitted to it.
5. **Test XAUUSD and MGC with the same settings.** They track the same underlying, so results should
   be broadly similar once costs are correct. Divergence means something instrument-specific is being
   fitted.
6. **Out of sample.** Tune on the first 60% of history, then run the last 40% once, without adjusting.
7. **Benchmark the signal itself.** Run the same ATR exits with random entries. If the results are
   comparable, the exits are carrying the strategy and the open/close cross is adding nothing — that
   is a real possible outcome and worth knowing.

Known TradingView limitations: intrabar fills are approximated unless the bar magnifier is enabled,
and when a stop and a target both sit inside one bar, the platform's assumption about which filled
first may flatter results.

## Files

- `occ-gold-r6.pine` — the strategy.

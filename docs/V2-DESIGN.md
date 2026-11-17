# CRYPTOZ v2 design

The user's earlier instruction delegates implementation decisions and opts out of approval questions. V1 code/ZIP remain preserved. Work is isolated in a native managed worktree on feature/cryptoz-v2.

## Brainstorm and selection
A cosmetic redesign would leave workflow defects. An execution/custody platform would add account permissions and financial infrastructure outside the research objective. Selected: a dependable crypto research workstation, retaining the current visual language while adding comparable-asset analysis and persistent layouts.

## V1 audit evidence
Current-run screenshots: outputs/v2-evidence/01-v1-overview.jpg and 02-v1-settings-reset.jpg in the original chat workspace. Reproduced: applying MACD then visiting Markets and returning resets the pane to RSI 14. Source inspection additionally found arbitrary venue-switch selection, unsaved note loss, whole-page background refresh rebuilding forms, time/indicator settings not restored, repeated series destruction on live updates, drawing placement from oscillator panes, and provider timestamps replaced by generic fetch freshness.

## V2 deliverables
1. Versioned workspace migration from v1; preserve notes, drawings, journal and alerts. Save selected instrument, timeframe, style and indicators. Named layout presets, automatic note saving, visible save state; import recovery backup. No user storage is rewritten by build scripts.
2. Venue changes preserve the same base asset when listed; explicit fallback otherwise. Changing instrument clears price-specific risk inputs/results. Minutely intervals retain lowercase m. Crosshair and drawings act only in price pane; anchors have the correct count and bounded dates.
3. Comparison lab: 2–4 explicit same-venue, same-quote instruments. Align observed completed candles by timestamp intersection; index each at 100 on the same first bar. Report total return, observed max drawdown, sample log-return annualized volatility and correlation. No interpolation or synthetic prices; gaps and window length disclosed.
4. Technical EMA crossover markers on completed bars, optional and clearly descriptive. Stable series updates preserve panes; indicators recomputed from available history, not claimed profitable.
5. Data status: venue-aware fallback cooldown, precise transport/as-of details and fresh/delayed/stale labeling. Incremental background refresh avoids rebuilding active forms/studio selections.
6. Test inventory covers every existing navigation, filters, chart styles/timeframes/overlays/oscillators/drawings, risk validation, notes, alerts, journal, import/export, visualizations, news and sources, plus v2 workflows. Pure deterministic tests distinguish fixture-based reliability from actual live checks. Desktop/mobile browser evidence and a final fresh review are required before publishing.

## Boundaries
Read-only public data. No trade execution, wallets, guarantees of all coins or audited signals. Alerts run in the open tab. Provider/transport failures remain visible. A listing or matching symbol does not verify contract identity. No new paid provider subscriptions or account permissions.

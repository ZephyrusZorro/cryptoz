# CRYPTOZ v2 verification and feature inventory

17 November 2026. Baseline v1 passed 26 tests before changes. The v2 suite adds state migration, layout persistence, comparison mathematics, malformed streaming candles, inherited timeframe rejection, all 12 adapter venue/interval combinations, incomplete 4h-bucket exclusion, series reuse and development-server routing. Deterministic tests use fixtures; live checks are reported separately.

## Browser feature inventory
| Area | Cases exercised | Result / boundary |
| --- | --- | --- |
| Overview | Actual global figures, daily sentiment, benchmark, directory, publisher news | Rendered; source freshness differs by provider |
| Markets | Name/symbol search, rank/gainers sorting, pagination next/previous, aggregate/exchange universes | Passed |
| Watchlist | Add star, watchlist-only filter, workspace rendering | Passed; browser local |
| Market export | CSV download of filtered results | Passed |
| Chart routing | Aggregate asset modal with explicit venue choice; command search and explicit SOL instrument; Escape closes modal | Passed |
| Venue changes | ETH/USDT to ETH/USD and back | Same base preserved, quote/venue explicit |
| Timeframes | 1m, 5m, 15m, 1h, 4h, 1d on Coinbase in browser; both venues in adapter tests | All rendered actual history; 4h excludes partial historical buckets |
| Chart styles | Candles, OHLC bars, line, Heikin-Ashi | Passed |
| Overlays | EMA pair, SMA, Bollinger, UTC VWAP; period 21; changes survive reload | Passed |
| Oscillators | RSI with period 9, MACD, volume, none | Passed |
| Markers | Optional EMA 20/50 crossover markers | Enabled; causal/closed-bar behavior tested deterministically |
| Drawings | Horizontal, annotation, two-anchor trend and Fibonacci; anchor/label edit and deletion | All saved; oscillator clicks do not place price drawings |
| Layouts | Create named layout, change style, load saved layout, reload settings | Passed |
| Notes | Type then immediately navigate away and return | Text preserved by autosave/flush |
| Risk calculator | Valid long sizing, invalid short levels, changing instrument | Fee-inclusive result; error shown; instrument change clears price-specific plan |
| Alerts | Create, pause, rearm, delete | Controls passed; deterministic crossing/order tests; no claim of waiting for an uncontrolled live price crossing |
| Journal | Add and retrieve entries | Passed |
| Backup | JSON export, import removes later test entry, recovery restores it | Passed with actual exported file; original v1 key remains untouched |
| Comparison | BTC/ETH/SOL same-venue history, index-100 chart, stats and correlation | 499 shared completed candles in observed run; no missing intervals in that run |
| Comparison errors | Duplicate assets | Explicit rejection, no synthetic chart |
| Comparison export | Aligned CSV download | Passed |
| Studio | Map, liquidity/momentum, DeFi, exchange depth; cold page start and refresh | All views rendered; selected DeFi view preserved on refresh |
| News | CoinDesk/Decrypt/Cointelegraph/all-publisher filters; bitcoin query | Passed; links retain publisher attribution |
| Source registry | Seven provider rows and methodology/privacy details | Rendered |
| Mobile | 390px comparison and studio, drawer navigation | No document overflow in measured views |
| Keyboard skip | Enter on Skip to content while on comparison route | Focus moved to main without changing route |

## Findings fixed during testing
- Indicators/selected instrument/style/interval were not persisted in v1; v2 preferences/layouts fix this.
- V1 arbitrary venue selection replaced ETH with an unrelated first product; v2 preserves base when available.
- Whole-page refresh could lose form/studio state; v2 updates data views selectively and reloads the current studio view.
- The dev server returned HTML for /api routes; API middleware now precedes Vite SPA fallback, covered by a real child-process HTTP regression test.
- Partial historical Coinbase 4h candles are excluded unless all four source hours are present. Current partial candles remain provisional.
- Fresh review caught false autosave-success status on storage failure, studio recovery and inherited interval keys. Fixes applied; interval rejection has a targeted regression.
- Stream candle shape/OHLC invariants are validated before chart updates; series objects and pane sizing survive subsequent refreshes.

## Evidence and limits
Current-run screenshots are in the delivered v2-evidence folder. Browser checks ran against actual APIs. Tests do not establish all external-provider outages, every asset, screen-reader compliance, long-duration uptime, high-concurrency load or profitable signals. Alerts need an open tab; storage is unencrypted/local and can be blocked. API/network and source truth remain external dependencies.

Final test counts, dependency audit, build and hosted publication status are recorded in the v2 release report.

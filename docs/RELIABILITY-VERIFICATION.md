# CRYPTOZ 2.5 reliability verification

Date: 17 November 2026. Scope: the existing owner-private, read-only crypto research application. This records observed results, not a guarantee that every possible bug has been eliminated.

## Results

- `npm run check`: **100/100 tests passed**, production client/Worker build passed, `npm audit --audit-level=moderate` reported **0 vulnerabilities**, Worker health/assets/CSP/read-only method smoke checks passed.
- `npm run verify:live`: **15/15 public provider routes returned 200** during this run. Observed: Coinpaprika directory 2,000 quotes; FET search 2 results; FET and Wrapped Banano asset prices; CoinGecko global; Alternative.me sentiment; combined publisher feed 77 articles; DeFiLlama 285 chains; Binance 517 instruments; Coinbase 402 instruments; 517 exchange quotes; Binance BTC 500 hourly bars, 50 levels/side and ticker; Coinbase ETH 88 four-hour bars. Counts and availability change.
- Fresh independent review identified two additional regressions after the initial 98 passing tests. Both were reproduced with failing tests, corrected, and reviewed again. The corrected targeted suite passed 9/9. No additional important issues were found in that review; this is scoped review evidence, not exhaustive certification.
- The actual production build was opened in the browser at a separate localhost origin. Journal and per-instrument risk drafts survived navigation and reload. Refresh retained entered risk levels. Escape closed Indicators and restored focus without leaving chart focus. Hidden navigation could be restored inside chart focus.
- Actual Fetch.ai search resolved the FET identity and opened Binance FET/USDT with 500 real candles and streaming status. Selecting 100 bars and Zoom out changed the visible count to 152/500. No synthetic history was used.
- Comparison reached 499 shared completed candles; global Refresh initiated a new comparison load. Market maps rendered and refreshed. Unified news topic filtering worked with original publisher links. Production browser console inspection returned no error entries for the selected flows.
- Actual viewport checks: 320px chart, 390px Home, 640×360 chart focus, 733px maps, 901px comparison, 1440px Markets and 1280px Home. Document width did not exceed viewport width at these checks. Dark glass, light glass and device-selected solid surfaces were inspected. This does not certify every physical device, browser, screen reader or frame rate.
- PNG and candles CSV produced the visible export-ready links. PNG encoding and URL cleanup have a failure-path regression test; CSV quoting/formula neutralization has a regression test. The in-app browser download recorder timed out on the Blob download, so the final downloaded files were **not independently captured by that recorder**.

## Corrected defects

| Failure | Correction and evidence |
| --- | --- |
| An in-flight REST response could roll back newer live candles | Revision-aware, bounded historical merge; regression reproduces the race |
| Reversed ticker/kline events or invalid books could reach displays | Explicit identity, timestamp, numeric, sequence and uncrossed-book checks; regression cases |
| Live ticks replaced all main chart data and could disturb the view | Incremental main-series update; historical refresh preserves visible range; regression |
| Request cancellation disappeared during fallback or left server work running | End-to-end AbortSignal, disposable deadlines, Node connection abort propagation; real HTTP test |
| Canceling one caller could disrupt shared provider work | Subscriber-aware cache cancellation; last subscriber releases upstream; retry and bound tests |
| Old requests could overwrite newer transport observations | Per-route observation sequence; out-of-order completion test |
| Slow independent feeds held up unrelated UI updates | Per-key completion updates; independent completion test |
| Refresh skipped active chart/comparison or failed Home preview | Active-page refresh and coalesced Home preview retry; regression tests |
| Previous instrument stream freshness suppressed new REST quotes | Reset freshness on instrument load; regression |
| Navigation reveal disappeared in chart focus | Dedicated reveal control within focused chart; actual browser confirmation |
| Journal/risk drafts disappeared during navigation | Bounded separate draft store; persistence/failure tests and browser reload checks |
| Import could report success before storage committed | Transactional state replacement and recoverable prior workspace; storage failure tests |
| Imported alerts above the monitored limit appeared active | Preserve extra alerts paused; explicit ten-active limit; regression |
| Dialogs lost keyboard focus or allowed background interaction | Dialog lifecycle controller, inert background, Escape/Tab handling and focus restoration; unit/browser checks |
| Missing financial data could look like zero; tiny prices rounded away | Strict numeric conversion, adaptive/scientific representation, bounded formatter cache; regression |
| Market map refresh recreated canvases | Stable visualization controller with update/dispose lifecycle; regression |
| Background particles/pointer lighting created unnecessary motion | Removed both effect modules; stable wallpaper, short transitions and reduced-motion handling retained |
| PNG failure was asynchronous and export identity could change | Awaited encoding with explicit rejection/cleanup; capture instrument identity before export |
| CSV text could execute spreadsheet formulas | Shared quoting and formula neutralization for external text; regression |

## Architecture and operational limits

See [reliability architecture](RELIABILITY-ARCHITECTURE.md) and [operations](OPERATIONS.md). Quotes retain venue/quote identities and observed timestamps. Live exchange data and aggregate directory snapshots are separate. Cache TTLs, network delay and provider throttling mean not every displayed dataset is tick-by-tick. Catalog identity discovery does not promise quote or chart availability for every token.

The current release is a tested deployment candidate for the owner-private research workflow. Public multi-user scale, licensed feed SLAs, disaster recovery, trading execution and physical-device performance have not been validated. Notes/drafts are browser-local and unencrypted. Browser alerts require an open tab. No profit prediction or investment-performance claim is made.

## Research supporting the changes

The version-matched [Lightweight Charts API](https://tradingview.github.io/lightweight-charts/docs/5.2/api/interfaces/ISeriesApi) documents incremental series updates; the [real-time update example](https://tradingview.github.io/lightweight-charts/tutorials/demos/realtime-updates) informed the chart update approach. [MDN AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) informed cancellation/deadline handling. These sources support the chosen APIs; the application-specific correctness evidence is the tests and browser observations above.

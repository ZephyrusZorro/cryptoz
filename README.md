# CRYPTOZ

Crypto charts, news and market research. Five compact left destinations: Home, Markets, Charts, Practice and Learn. The rail can hide/reveal but never expands. A transparent breadcrumb/search header, contextual tabs and direct Home sections keep the workspace organized.

The unified Home dashboard includes live prices, a Bitcoin chart with four history ranges, market breadth, tool shortcuts and publisher news. Markets ranks the five leading gainers and losers from Binance's rolling 24-hour USDT tickers, which publish changed quotes about once per second. Its independent price directory remains available by name and ticker. Advanced screening and market insights are linked from Home.

Search normalizes names and punctuation, handles verified Fetch.ai/FET/Artificial Superintelligence Alliance identities, and queries the wider active provider catalog on demand. Price and exchange-chart coverage vary; an identity result does not imply live price/history availability. The bulk quote endpoint is provider-limited (2,000 assets observed); supported exchange charts use Binance USDT and Coinbase USD listings.

Appearance provides dark and light themes, Glass by default, optional Solid or device-controlled surfaces, and reduced motion. Existing chart layouts, watchlists, practice data and learning progress are preserved.

Charts combines indicators, automatic and manual drawings, confirmed signals, forecasts, and depth. The Auto overlay selector sits directly above the plot. Pan or zoom to request earlier data. Reset view returns to recent candles. Forecast accepts 1–48 forward candles and selectable history, including a start date or up to 4,000 available candles. Learn and Practice retain their separate workflows. Read the [forecast method](docs/FORECAST-STUDY.md) and [operations](docs/OPERATIONS.md).

Appearance offers USD and INR display. Conversion uses a dated ECB cross rate and a recent Coinbase USDT/USD quote for Binance amounts. Calculations, order entry and raw exports retain native exchange units. If a rate is unavailable, the display retains the native currency.

A crypto research terminal with real public market data, editable financial charts, market visualizations and publisher-linked news. This rebuild replaces the supplied single-file app's unsupported quantitative claims and hardcoded market narratives.

## Run locally

Requires Node.js 22+ and internet access.

```powershell
npm ci
npm run build
npm start
```

Open http://127.0.0.1:5187. The Windows `START-CRYPTOZ.cmd` launcher uses the included production build without requiring package installation. Development: `npm run dev`.

## Features

- Searchable USD asset directory (2,000 quotes returned during verification), watchlist, sorting and CSV exports.
- Separate exchange instrument identities: Binance spot USDT and Coinbase spot USD.
- Binance spot ticker updates paint changed quotes on the next browser frame. The UI labels fresh stream observations, snapshots and retained prices per pair. The chart uses separate selected-market WebSockets, provider OHLCV, REST recovery and gap reconciliation. Browser-direct public APIs recover from shared-host egress restrictions where the provider permits them.
- Candles, OHLC, line and Heikin-Ashi, with a searchable study library, automatic presets, one lower study pane and up to four indicator overlays.
- Persistent horizontal levels, trendlines, Fibonacci levels and annotations. Place anchors with chart tools; edit anchor prices, UTC times and labels in Drawings. Pan/zoom and PNG/OHLCV exports.
- Plain-language technical context, a local adaptive study with scored historical evidence and an outcome ledger, attributed analyst notes, a fee-aware position calculator, and simulated spot fills with a browser-local ledger.
- Market-cap treemap, liquidity/momentum scatter, DeFi TVL bars and cumulative exchange-depth visualization.
- Home-page and dedicated CoinDesk, Decrypt and Cointelegraph news, with titles, timestamps, filters and original links.
- Browser-local notes, journal, backups and one-shot price-crossing alerts. Alerts need an open tab and fresh quotes; maximum 10 active alerts.
- Modular provider gateway with validated parameters, fixed upstreams, request timeouts, bounded cache, coalescing and failure cooldown.

## Verify

```powershell
npm run check:production
npm run verify:live
```

Live tests depend on third-party availability and quotas. See [verification evidence](docs/VERIFICATION.md), [architecture](docs/DESIGN.md), [research](docs/RESEARCH.md) and [third-party notices](THIRD_PARTY_NOTICES.md).

## Deployment

`npm run build` generates the client and a self-contained Worker ES module at `dist/server/index.js`; the same handler is served by the included Node launcher. `.openai/hosting.json` holds the owner-private Sites identity. No API key or exchange account is needed for the configured public data endpoints. Public APIs can rate-limit or be regionally restricted; production-scale licensed data may require paid provider plans.

No assets are held and no orders are placed. Technical metrics describe historical prices; they do not establish profitable signals. No guarantee of universal coin coverage, uninterrupted service, institutional latency or superiority over TradingView/CoinDCX. Local research state is unencrypted and is not account-synchronized.

Release checks run unit/integration tests, the production build, dependency audit and portable Worker smoke checks. `/healthz` identifies the running release without contacting market providers; it does not certify upstream availability. Journal and risk drafts survive navigation/reload on the same browser. Workspace JSON backups include saved research, not unfinished drafts.

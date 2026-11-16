# CRYPTOZ

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
- Selected-market WebSocket, real OHLCV history, REST recovery, reconnect/gap reconciliation and visible stale/unavailable states. Browser-direct public API fallback recovers from shared-host egress restrictions where the provider permits it. Global statistics can fall back to separately attributed Coinpaprika data.
- Candles, OHLC, line and Heikin-Ashi; configurable EMA/SMA, Bollinger, UTC-session VWAP; RSI, MACD and volume pane.
- Persistent horizontal levels, trendlines, Fibonacci levels and annotations. Place anchors with chart tools; edit anchor prices, UTC times and labels in Drawings. Pan/zoom and PNG/OHLCV exports.
- Closed-candle technical context and fee-aware position risk calculator.
- Market-cap treemap, liquidity/momentum scatter, DeFi TVL bars and cumulative exchange-depth visualization.
- Home-page and dedicated CoinDesk, Decrypt and Cointelegraph news, with titles, timestamps, filters and original links.
- Browser-local notes, journal, backups and one-shot price-crossing alerts. Alerts need an open tab and fresh quotes; maximum 10 active alerts.
- Modular provider gateway with validated parameters, fixed upstreams, request timeouts, bounded cache, coalescing and failure cooldown.

## Verify

```powershell
npm test
npm run verify:live
npm audit
```

Live tests depend on third-party availability and quotas. See [verification evidence](docs/VERIFICATION.md), [architecture](docs/DESIGN.md), [research](docs/RESEARCH.md) and [third-party notices](THIRD_PARTY_NOTICES.md).

## Deployment

`npm run build` generates the client and a self-contained Worker ES module at `dist/server/index.js`; the same handler is served by the included Node launcher. `.openai/hosting.json` holds the owner-private Sites identity. No API key or exchange account is needed for the configured public data endpoints. Public APIs can rate-limit or be regionally restricted; production-scale licensed data may require paid provider plans.

No assets are held and no orders are placed. Technical metrics describe historical prices; they do not establish profitable signals. No guarantee of universal coin coverage, uninterrupted service, institutional latency or superiority over TradingView/CoinDCX. Local research state is unencrypted and is not account-synchronized.

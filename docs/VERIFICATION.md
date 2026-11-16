# Verification record

17 November 2026, Asia/Calcutta. This is an engineering verification record, not a financial or market-data accuracy audit.

## Automated checks
- 25 Node tests pass: mathematical reference values and warmup, causal MACD, OHLC validation, risk sizing/fees, chart lifecycle/reconnect reconciliation, gateway validation/coalescing/stale states, active-instrument filtering, RSS parsing, Coinbase last-trade timestamps, workspace import validation, crossing alerts and out-of-order observations.
- Production client and self-contained Fetch API Worker build succeeded.
- npm audit: zero known vulnerabilities after upgrading ECharts, fast-xml-parser and Vite to patched versions.
- Twelve live route checks succeeded against actual upstream providers: markets, global, sentiment, news, chains, both venue registries, exchange tickers, candles, book and ticker. Original observed coverage: 2,000 Coinpaprika quotes, 518 Binance USDT instruments and 402 Coinbase USD instruments (before final crypto-scope filters), 75 RSS headlines, 285 positive-TVL chains. Counts change with providers.

## Browser checks
- Overview rendered provider-supplied global metrics, sentiment, Bitcoin benchmark history, asset rows and original publisher headlines.
- Binance selected chart received genuine WebSocket messages and displayed corresponding OHLCV, overlays, oscillator and refreshed book.
- Changed instrument and interval rapidly; regression exposed an old crosshair callback, now fixed with teardown-before-host-replacement and a defensive guard.
- Indicators/settings dialog accepted parameter and oscillator changes. Horizontal drawing placement and explicit anchor/label editing succeeded.
- Risk planner returned fee-inclusive size and reward/risk for an entered ETH research scenario. Instrument note saved in browser-local workspace.
- Market map, liquidity/momentum and DeFi views rendered from real responses. Studio request generations now prevent old responses repainting a later selection.
- 390px and 1440px viewport layout bounds checked: page content stayed within the viewport; wide market tables scroll inside their own container.

## Review
A fresh read-only reviewer found four material issues: reconnect gaps, unsafe drawing IDs in imported backups, alert observation ordering and async visualization races. Fixes and targeted regressions were applied. Review did not establish profitability, provider truth, global deployment reliability or performance under load.

## Practical limits
Directory prices can lag by up to ten minutes on the free provider. Global statistics, daily sentiment, news and TVL are snapshots with separate cadences. Exchange streaming is only for the chosen venue instrument and can fail by network/region. Alerts are browser-session only. State is unencrypted localStorage. Source/gateway tests and browser flows do not constitute penetration testing, accessibility certification or a high-concurrency service-level guarantee.

Deployment status and final hosted checks are recorded in the accompanying release report after publication.

## Hosted provider recovery
The first hosted check exposed exchange REST restrictions/rate limits on shared hosting egress (Binance/Coinbase) and CoinGecko HTTP 429. The gateway now attributes an independent Coinpaprika global fallback. The client lazily loads the same validated public-data adapters for direct browser-origin requests when a hosted route fails, with a 60-second hosted-route cooldown. News remains server-side RSS and filters unrelated technology headlines out of the crypto/macro feed. This is ordinary direct access to public market data from the user's network; no proxy evasion or account credentials are used. Browser-direct connections remain subject to provider CORS, quotas and regional availability.

# Liquid-left revision verification — 17 November 2026

- Production build completed with Vite 6.4.6.
- Node regression suite: 65 passed, 0 failed.
- npm audit --omit=dev: 0 vulnerabilities at verification time.
- All 12 live provider checks returned HTTP 200 from the local production adapters: Coinpaprika 2,000 assets; CoinGecko global; Alternative.me sentiment; 58 publisher headlines; DeFiLlama 283 chains; Binance 517 USDT instruments; Coinbase 402 USD instruments; Binance prices, 500 candles, order book and ticker; Coinbase candles (87 returned).
- Actual browser WebSocket prices/order book and historical chart were observed. Hosted egress can differ; existing validated browser-direct fallback and explicit cache/provenance states are retained. Aggregate directory, daily sentiment and RSS are snapshots, not tick streams.
- Browser checks: LEFT navigation at 320/390/733/901/1440 widths and 640x360 landscape; both themes, expanded/hidden/revealed navigation, news filtering/show-more, phone price columns, All/100-bar/custom windows, pan/zoom/focus, chart type selection, indicator dialog, fee-aware risk calculation. Sample 100/95/110 long plan returned quantity 19.24927815 and fee-inclusive reward/risk 1.88 for 100 quote units risk.
- Independent review found a wheel-event ordering defect; host gesture listeners now capture before the chart's descendant handlers. A manual pan changed the selector to Custom; full history and resize retained 500/500 available bars.
- Browser download-event automation did not complete in the in-app browser; no new claim of verified file delivery is made for PNG/CSV. Existing export implementations are retained. No universal zero-bug or performance guarantee is made.

Efficiency: lazy ECharts chunk; existing bounded/coalesced provider cache; bounded news DOM (20 per increment); wallpapers 20KB dark and 40KB light; one pointer surface per animation frame, disabled on small/touch/reduced-motion devices; chart canvases avoid backdrop filtering. No synthetic financial series or decorative provider polling added. CSS gzip 18.65KB; app JS gzip 43.92KB; chart library gzip 63.54KB; lazy visualization chunk gzip 218.88KB.



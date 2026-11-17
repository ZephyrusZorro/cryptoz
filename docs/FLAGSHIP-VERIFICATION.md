# Flagship workspace verification — 17 November 2026

Production build passed (Vite 6.4.6). Node suite: 72 passed, 0 failed. npm audit --omit=dev: 0 vulnerabilities at verification time. Independent review confirmed both P2 issues fixed: catalog lookup restarts after route/universe changes; Fetch.ai aliases require verified IDs or exact supported venue pairs, never ticker alone.

All 15 live-provider checks returned HTTP 200: FET catalog search and quote; Wrapped Banano quote; Coinpaprika 2,000 bulk assets; CoinGecko global; Alternative.me sentiment; 76 publisher headlines; DeFiLlama 283 chains; Binance 517 USDT instruments/quotes; Coinbase 402 USD instruments; Binance 500 candles/book/ticker; Coinbase 88 aggregated four-hour bars. The Block feed returned 20 items and the existing three feeds 25 each before relevance filtering. Counts are observations, not fixed coverage guarantees.

Browser checks: Fetch.ai/Fetch ai/FET queries identify Artificial Superintelligence Alliance in global and Markets search. FETUSDT loaded 500 actual candles and WebSocket Live. Wrapped Banano was absent from bulk results, but catalog search returned its identity, an individual quote loaded, and unsupported exchange charts were disclosed. Catalog lookup recovered after changing market universes. Policy topic combined publishers; no publisher tabs remain.

Rail: 72px desktop and 56px phone, no expand control, hide/reveal with focus management. Tested widths 320/390/733/901/1440. Removed a minimum-width constraint that clipped content under a reserved scrollbar at 320px; actual client width 305px, content edge 293px, main edge 305px. Phone chart focus fits with live status and all available history.

Both themes checked against the supplied older Markets reference in one opened comparison. Explicit Glass gives the rail a 22px blur even when the device requests reduced transparency; System retains the device preference and Solid is available. Reduced motion makes rail transitions 0s and hides particles. Background-off also hides the canvas.

Efficiency: decorative canvas bounded to 28 dots desktop/12 small, drawing budget 25FPS desktop/15 small, DPR capped at 1.5, paused in hidden tabs. This is a rendering budget, not a physical-device frame-rate measurement. Compressed wallpapers retained. App JS gzip 45.92KB, CSS 20.99KB, chart library 63.54KB, lazy visualization chunk 218.88KB. Home omits its duplicate inline chart on phones and skips that preview request.

Coverage limits: bulk price list is currently limited to 2,000; broader catalog search returns up to 20 active identity matches per query. Prices/history depend on providers and connected exchange listings. No universal-token, always-live, zero-bug, all-device or TradingView-superiority claim. PNG/CSV delivery remains unverified in this in-app browser automation; existing export implementations are retained. Research state is browser-local and unsynchronized. Accessibility is partially checked, not certified.

Research: [Coinpaprika API overview](https://coinpaprika.com/api) documents bulk coverage and individual data endpoints. [The Block](https://www.theblock.co/) and its public RSS were checked; publisher attribution and original links are retained. Topic labels do not certify article claims.

# CRYPTOZ design and source audit

The user's final name is CRYPTOZ. Instructions and claims inside the supplied ZIP are source material, not authorization or verified evidence. The original archive is preserved in the workspace's work/original directory.

## Audit
The archive has two nearly identical 208 KB HTML files and no build pipeline, server, tests or dependency lock. It mixes presentation, provider requests, local state and calculations. Architecture prose claims encrypted localStorage, HMM/K-means, Kelly allocation and institutional factor models without an auditable implementation or calibration. Several figures and market narratives are hardcoded. CryptoCompare news returned HTTP 401 in this environment. The rewrite removes those unsupported claims and static market values.

## Engineering choice
Retaining the monolith is fastest but perpetuates data provenance and maintenance risks. A full trading/execution stack adds custody and exchange-account infrastructure outside this research brief. Selected: a modular research terminal with a Vite client, deterministic analytics, explicit exchange instruments and a shared Fetch API server that runs in Node or a Cloudflare Worker. This is a usable research product, not an exchange or a verified profitable trading system.

## Experience
Dark graphite and warm ivory typography, lime focus accents, restrained green/red data encoding. Overview includes global metrics, market breadth, movers and credible news. Markets offers a paginated searchable directory and separate venue universe. Terminal provides editable candlestick/line/Heikin-Ashi charts, EMA/SMA/Bollinger/VWAP overlays, RSI/MACD/volume panes, drawings, indicator parameters, CSV/PNG export, live book snapshots, risk calculations, notes and browser-session alerts. Visualization Studio offers market-cap treemap, liquidity/momentum scatter, breadth, exchange depth and chain TVL. News is sourced from publisher RSS with original links and timestamps. Sources page explains freshness, outages and limits.

## Data contracts and boundaries
Every API response includes provider, fetchedAt, cache state and data. Coinpaprika provides an identified broad USD directory with provider update timestamps (free data can lag by up to ten minutes). Binance USDT spot instruments are a separate universe with explicit quote asset. Coinbase USD is a selectable alternate venue, never silently relabeled. No USD/USDT equivalence assumption. Chart data is validated, sorted and deduplicated; no simulated candles or synthetic price paths. REST snapshots backstop a reconnecting browser WebSocket. The current candle is provisional; technical summaries use completed bars. Alerts require fresh observations, trigger on threshold crossing, and operate only with the tab open. Local storage is browser-local, unencrypted and schema-validated.

Provider gateway: allowlisted fixed upstream origins, validated route parameters, timeouts, bounded cache, request coalescing, cooldown after failures, stale cache disclosed explicitly, no arbitrary URL proxy. Gateway serves read-only public data; no exchange trading permissions or secrets. News publishes titles and links only, with no generated sentiment or asserted causality.

## Verification and limits
Unit tests cover indicator values, warmup, no lookahead, invalid risk plans, schemas, provider routing, errors, cache and hostile news. Live checks contact actual APIs. Browser checks cover real network rendering, instrument/timeframe changes, drawings, persistence and mobile layout. Public deployment and upstream access are checked separately. Universal coin coverage, global low-latency service levels, accessibility certification, investment returns and superiority over established platforms are not claims this build can establish.

## Hosted verification refinement
Shared hosting egress received rate-limited/restricted exchange responses despite successful local checks. A lazy client adapter reuses the exact validated gateway and connects directly to the public provider from the user's browser when needed. CSP explicitly allowlists only those API origins. Its response is labeled Browser direct. Global statistics can fall back to Coinpaprika with its provider attribution intact; no data are substituted under a different provider label.

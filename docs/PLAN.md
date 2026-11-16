# CRYPTOZ Implementation Plan

> Execution: inline, task by task using the executing-plans and test-driven-development skills. User explicitly requested autonomous decisions and no approval questions.

**Goal:** Deliver an online crypto research terminal with genuine market data, editable charts and credible news.
**Architecture:** Modular client and deterministic analytics; read-only provider gateway shared by local Node and hosted Worker. Explicit provenance and freshness throughout.
**Tech:** Vite, JavaScript modules, TradingView Lightweight Charts, modular Apache ECharts, Fetch API, Node test runner.
**Spec:** docs/DESIGN.md

## Constraints
CRYPTOZ branding; crypto only; no fabricated fallback data; attributed sources and chart licensing; USD aggregates and exchange quote currencies stay separate; no trading credentials; browser-local persistence must be described accurately.

## Review focus
Symbol collisions, stale snapshots after failed refresh, rapid instrument changes, sparse or unavailable candles, unsafe external RSS content, quota amplification, mobile overflow and invalid imported local state.

## Tasks
- [ ] 1. Analytics and state contracts: tests first, implement indicators, candles, risk planner and safe persistence.
- [ ] 2. Provider gateway: tests first, implement validated routes, caching/coalescing, news parsing and explicit failures; verify upstream responses.
- [ ] 3. Research interface: implement overview, searchable markets, terminal, editable drawings, alerts, news and visualization studio. Verify actual interactions in browser.
- [ ] 4. Delivery: audit dependencies and final source, run unit and live checks, package source/build, deploy and inspect actual hosted data.

File map: src/analytics.js pure mathematics; src/state.js persistence; server/gateway.js provider adapters/cache; src/chart.js price workspace and drawings; src/visuals.js modular ECharts; src/app.js page/state lifecycle; src/style.css responsive design; scripts/ portable build/serve; tests/ regression contracts.

# Flagship polish implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a compact professional crypto research workspace and repair asset discovery.
**Architecture:** Retain current adapters/chart state. Separate pure search logic, ambient animation and shell/dashboard styling from app rendering. Existing provider gateway owns validated/cached catalog and quote requests.
**Tech Stack:** Vite6, vanillaJS, Lightweight Charts5, ECharts6, Node22.
**Spec:** ../specs/2026-11-17-flagship-polish-design.md

## Global constraints
Fixed compact LEFT rail, no enlargement; no fabricated financial data; preserve local workspace; existing private site audience. Unified news with attribution. All animation respects reduced motion and hidden tabs.

## Review focus
- Fetch.ai alias/punctuation and duplicate ticker identities.
- Remote search completing after another query/dialog close.
- Long prices/headings at320px.
- Old expanded preference migrating to compact; hide/reveal focus.
- Provider failures remain explicit and do not erase local/venue results.

- [x] Task1: tests/search.test.mjs failing tests; src/asset-search.js matching/query/lifecycle logic; server/gateway.js allowlisted asset-search/asset routes; tests/gateway.test.mjs. Verify invalid inputs never fetch, real FET route.
- [x] Task2: src/app.js bounded search integration and market fallback; fixed rail and integrated top header; src/workspace.css. Dashboard Home contains sections without deep tables. Test browser navigation/forms/responsive sizes.
- [x] Task3: news topic tabs/common feed; The Block RSS verified; src/news-window.js and src/ambient.js bounded decorative animation with appearance toggle. Test topic filtering and motion/visibility.
- [ ] Task4: production regression/live checks, independent review, current visual comparison and design-qa.md. Publish exact pushed source and package source/build/report.

Ledger: initial audit reproduced literal fetch-ai miss. Header/sidebar screenshots supplied by user are the visual sources. Catalog official docs disclose top2000 bulk tickers; broader search must not imply full live coverage.

Ledger: live provider confirms FET search ID and ticker ID differ; only the two verified aliases merge. Reviewer found return/universe search cancellation and unrelated-FET alias bugs; both corrected. A320px minimum width under reserved scrollbar caused15px clipping, corrected with fluid body. System reduced transparency honored by default; explicit Glass offered and selected for requested appearance.

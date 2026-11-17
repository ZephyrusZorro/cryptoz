# Beginner assistance and quality implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task by task.

**Goal:** Ship integrated beginner assistance and correct confirmed correctness/UI defects without increasing navigation clutter.
**Architecture:** Separate education content/store/view from financial request controllers. Keep the current Vite, LWC, ECharts, gateway and dialog boundaries.
**Tech Stack:** JavaScript ESM, Node test runner, existing libraries; no new dependency.
**Spec:** ../specs/2026-11-18-beginner-quality-design.md

## Global constraints
Preserve four compact left navigation groups, selected glass themes, private audience and user research. No automatic trading, personalized recommendations, synthetic market prices or unsupported performance claims. Local learning progress is separate from saved workspace backups and is labeled accordingly.

## Review focus
- Old learning/comparison requests completing after selection, catalog or route changes must not publish mislabeled results.
- Stale/invalid quotes must not populate a current-price action; manual prices remain editable.
- Overflow and fee-negative outcomes must not produce apparently valid financial plans.
- Typing new form levels must invalidate previous output without losing the form draft.
- Learning/search/progress must remain usable when providers or local storage fail.

### Task 1: Correct financial and request lifecycle failures
Files: analytics.js, chart.js, learning.js, comparison.js, app.js; new quote/request helpers only where they provide a shared contract.
Interfaces: current usable quote requires matching venue/symbol and fresh positive numeric price/time; latest request lifetime supplies AbortSignal and current-generation test.
- [x] Reproduce discovered failures with Node regressions; run and observe failure.
- [x] Implement finite risk outputs, current-quote guards, active selection/request cancellation and correct derived-result invalidation.
- [x] Run targeted regressions and commit this independent correction.

### Task 2: Add integrated beginner tools
Files: new beginner-content.js, beginner.js, beginner-store.js, beginner.css; app.js and learning.js integration.
Interfaces: mountBeginner(root,{storage,hydrate,onNavigate}) returns dispose(); help content renders through existing dialog. Store validates a fixed set of five progress IDs and reports failed persistence.
- [x] Add failing tests for bounded progress, invalid storage, glossary normalization and fee-aware break-even explanations.
- [x] Add three learning subviews, five-step checklist, glossary, Home Start here, Chart guide and concise risk help.
- [ ] Verify targeted tests and actual navigation/storage behavior; commit.

### Task 3: Full review, polish and release
Files: verification/operations/design QA reports, version, package outputs.
- [ ] Run npm run check and npm run verify:live; investigate any failure.
- [ ] Review actual core flows and small/large viewports in dark/light themes, fix observed defects, compare screenshots with current approved baseline.
- [ ] Obtain fresh source review and correct important findings with regressions.
- [ ] Push exact source, privately publish matching build, verify hosted flows, package and verify portable build and SHA-256 receipt.

# Reliability implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task by task.

**Goal:** Remove confirmed correctness/lifecycle/UI defects and publish a tested read-only research release.
**Architecture:** Testable market integrity, cancellable transport, keyed dataset notifications, UI lifecycle controllers, bounded draft storage. Preserve the existing Vite/LWC/ECharts stack.
**Spec:** ../specs/2026-11-17-reliability-design.md

## Constraints
Preserve local research and private audience; fixed left rail; real data only; no extra unnecessary background work. Tests must target observable failures, not mirror cosmetic implementation. Physical-device/all-provider guarantees are out of scope.

- [x] Task1: src/market-integrity.js, chart.js, tests/integrity.test.mjs. Reproduce poll/live race, invalid/reversed tickers, disposal and incremental series updates; correct without discarding newer live bars or pan/zoom.
- [x] Task2: src/api.js/direct.js/server/gateway.js, tests/api/gateway. Cancel across fallback, preserve shared callers, prevent late telemetry and reject invalid observations; bound runtime state.
- [x] Task3: data-loader.js, page-refresh.js, app UI. Publish independent key completion; refresh correct active tool and retry failed chart; preserve stable displays and expose offline/refresh state.
- [x] Task4: dialog.js/draft-store.js/state.js/app.js. Restore focus, close on navigation, reveal rail during focus, protect form drafts, transactional import/recovery.
- [x] Task5: remove particle/pointer effects; consistent finite motion and responsive checks; semantic financial formatting and cached formatters. Add health/release checks and document operational limits.
- [ ] Task6: full suite/build/audit/live, source review, actual browser acceptance, exact source push/private publish/package/receipt.

Ledger: transport/chart audit agents identified cancellation and candle/ticker defects but could not finish due account usage limits. Root continues implementation and verification; do not claim a completed independent final review unless one becomes available.

Final fresh review completed: two findings were reproduced, fixed, regression tested and re-reviewed. Full release check passed100/100; publication/package receipts remain Task6.

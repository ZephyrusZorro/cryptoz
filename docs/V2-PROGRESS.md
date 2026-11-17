# V2 execution ledger

Plan: docs/V2-PLAN.md. Design: docs/V2-DESIGN.md. Isolated native worktree on feature/cryptoz-v2; v1 original checkout/ZIP preserved.
Tasks 1–3 implemented and verified with deterministic tests and real browser comparison/settings/research flows. Task 4 feature inventory is in V2-VERIFICATION.md.
Fresh read-only review identified autosave success reporting, studio initial/explicit refresh recovery, and inherited timeframe keys. Fixed all three. Separate testing found and fixed the dev API HTML fallback and incomplete historical 4h aggregation.
Ruling: retain the existing crypto research design and public-data scope; add comparison and persistence rather than trade execution or paid data dependencies. No profitability or universal-coverage claims.
Ruling: preserve the v1 storage key and migrate into a separate v2 key, retaining a pre-import recovery snapshot. Multi-tab changes produce a visible conflict warning; no automatic cross-tab merging is claimed.

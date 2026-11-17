# CRYPTOZ v2 Implementation Plan

> Execute inline with the executing-plans and test-driven-development workflows; request one fresh read-only final review. Original user delegates design decisions.

Goal: turn the verified v1 into a persistent, inspectable comparative crypto research workstation.
Architecture: retain Fetch API gateway and modular client; add preferences/state, research mathematics and comparison view modules.
Spec: docs/V2-DESIGN.md.

Review focus: old-backup migration; switching venue/coin with unsaved state; out-of-order fetches/streams; irregular/gapped candle windows; malicious imports; background refresh while typing; pane drawing coordinates; mobile dialog reachability.

- [ ] Task 1: regression tests first for state migration, chart preferences, venue selection, drawing invariants, covariance/correlation and matched comparison windows; implement src/preferences.js, src/research.js and state changes.
- [ ] Task 2: integrate saved layouts, autosave, risk reset, stable chart series, crossover markers, refresh-preservation and transport status. Extend regression tests where bugs are found.
- [ ] Task 3: comparison lab with index-100 chart, risk statistics/correlation, honest window metadata and CSV export; live data and request generation checks.
- [ ] Task 4: exercise all listed features in browser and expand API/mathematics failure checks; resolve actual failures. Fresh review, build/audit, source packaging and owner-private v2 publication; recheck hosted behavior.

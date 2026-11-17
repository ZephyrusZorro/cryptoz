# CRYPTOZ reliability hardening

Current base5e3b313. User requests systematic bug fixes, stronger architecture, smoother useful motion and a real deployment candidate. Authorization to implement and publish continues; no design questions required.

Decision: strengthen existing modules rather than migrate frameworks or redesign navigation again. Keep fixed LEFT rail, both themes, existing charts/research/catalog/news functionality and private audience. Remove particle canvas and pointer-following sheen; retain short opacity/transform interaction transitions and static glass materials.

Boundaries: transport owns cancellation/errors/cooldown; market-integrity owns candle merge and quote validation; keyed dataset store publishes individual completion; refresh controller calls the active tool; dialog controller owns focus/inert/cleanup; drafts own bounded journal/risk form persistence; rendering uses incremental live chart updates and preserves user window. Offline/degraded state stays visible and retryable. Imports must persist successfully before replacing current workspace.

Confirmed defects from current source/browser: hiding rail in focus hides its reveal control; pending poll can overwrite newer kline bars; terminal tickers accept negative/reversed observations; full series replacement on every live candle; chart/compare global refresh targets unrelated directory fetches; all-key loading delays partial UI updates; journal/risk form edits can be lost on rerender/navigation; import success is reported even if persistence fails; background is continuously redrawn and randomized on resize. Validate and fix other findings only with reproducible evidence.

New useful capabilities: protected journal/risk drafts, reliable per-tool refresh/retry, persistent offline/refresh status and an executable release-check command. No extra trading destinations, speculative signals, fabricated data, order execution or claim of universal price coverage. Current single-user read-only scope remains; public multi-tenant scale and provider SLA require separate operational validation.

Acceptance: failing tests before changes for integrity/abort/format/store/import/draft cases; full regression/build/audit; real provider checks; browser desktop/phone/theme/focus/dialog/forms/refresh/navigation. Record bounded evidence, unresolved limitations and exact deployment receipt.

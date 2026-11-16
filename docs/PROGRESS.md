# Execution ledger — docs/PLAN.md

Original source reviewed; no source-controlled project exists in the archive. A separate outputs/cryptoz directory isolates the rebuild; the ZIP is preserved.

Ruling: Use the final requested spelling CRYPTOZ; earlier ZRYPTOZ is superseded by the same request.
Ruling: Proceed autonomously under the user's explicit opt-out of questions/design approval. Retain research limitations visibly rather than promise universal coverage or superiority.
Preflight: analytics produces normalized candle/indicator objects consumed by chart and gateway validation. Gateway Fetch API responses are shared between Node and Worker. All instruments retain venue and quote metadata.

Task 1 complete: analytics/state tests cover independent Wilder RSI example, moving-average warmup, causal MACD, ATR, VWAP, HA, normalized candles, risk sizing/fees, corrupt storage and crossing alerts.
Task 2 complete: live 12-route gateway check succeeded; first check returned 2,000 directory quotes, 75 headlines, 285 positive-TVL chains. Active instruments are joined against exchange registry rather than ticker suffix alone. Dependency audit upgraded vulnerable XML/ECharts/Vite versions and returned zero known vulnerabilities.
Task 3 in verification: desktop browser received WebSocket messages and rendered actual Binance/USDT charts/book, editable drawing anchor persisted, risk calculation and note save succeeded.
Final review: fresh read-only reviewer identified reconnect candle gaps, unsafe imported drawing IDs, out-of-order alert prices and racing studio view responses. Each has been addressed; unit regressions for state/chart/gateway pass. Studio request generation guards follow every asynchronous boundary.
Ruling: Profitability, source truth, worldwide latency, universal coverage and institutional readiness remain unestablished; expose provider timestamps/limits and document these boundaries rather than claim them.

Task 4 hosted refinement: initial private deployment succeeded but provider egress returned HTTP 429/restriction. Added a tested browser-direct fallback with same allowlisted schema adapters, plus separately attributed Coinpaprika global fallback and crypto/macro-only RSS headline filtering. Suite now 25 tests passing; final hosted recheck follows republishing.

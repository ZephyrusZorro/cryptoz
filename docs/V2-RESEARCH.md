# V2 research

Reviewed 17 November 2026. Decisions combine current source inspection, actual browser reproduction and primary documentation.

- [TradingView: index-to-100 comparison](https://www.tradingview.com/support/solutions/43000477709-when-comparing-symbols-i-only-see-detached-lines-on-the-chart/): normalizing each asset to the same starting value makes differently priced assets comparable. V2 uses a common timestamp window and same-quote venue instruments, not disjoint start dates.
- [TradingView: lost drawings/layout overwrites](https://www.tradingview.com/support/solutions/43000472965-i-ve-lost-my-chart-drawings/): persisted chart state can still be overwritten across sessions. V2 adds explicit local layouts, legacy migration and import recovery; multi-tab overwrite conflict is detected rather than silently replacing current work.
- [Freqtrade: recursive analysis](https://www.freqtrade.io/en/stable/recursive-analysis/): finite startup history affects recursive indicators. V2 retains visible history bounds and tests warmup; no convergence or profitable model claims are inferred.
- [Freqtrade: lookahead analysis](https://www.freqtrade.io/en/stable/lookahead-analysis/): completed-candle research and causal crossover markers prevent provisional bars from becoming historical signals.
- [Lightweight Charts official API](https://tradingview.github.io/lightweight-charts/docs/api): reuse series objects during live updates, use pane-aware click events and preserve chart settings.

A Reddit search found qualitative complaints about indicators disappearing after restart and confusing save/layout behavior. These are unrepresentative user reports, used only as research leads. Current CRYPTOZ testing independently reproduced an equivalent settings-loss defect; primary documentation and tests govern implementation.

Comparison metrics: index = close / first aligned close ×100. Drawdown = minimum(close/running maximum−1). Volatility = sample standard deviation of adjacent log returns ×sqrt(365×86400/intervalSeconds), only for contiguous time steps. Correlation uses matched adjacent log returns, not price levels. Missing intervals are omitted from return samples and disclosed; constant-return samples have undefined correlation, displayed as unavailable. These descriptive estimates depend on the observed window and are not forecasts.

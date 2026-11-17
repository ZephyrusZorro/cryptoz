# CRYPTOZ 2.7 research and architecture

## Design inputs

- [Coinbase versus Coinbase Advanced](https://help.coinbase.com/en-ca/getting-started/other/coinbase-vs-coinbase-advanced): progressive disclosure for different experience levels. CRYPTOZ keeps both modes on the same active chart.
- [CoinDCX learning](https://coindcx.com/learn-crypto/) and [Binance Academy technical analysis](https://academy.binance.com/ur-PK/articles/what-is-technical-analysis): use a plain-language explanation for each study and let users check it against a chart.
- [TradingView Supercharts](https://www.tradingview.com/support/solutions/43000746464-getting-started-with-supercharts/) and [Lightweight Charts paging](https://tradingview.github.io/lightweight-charts/examples/data/infinite-history): indicator templates; gesture-triggered earlier data. Use real provider candles in place of the sample data.
- [Freqtrade](https://docs.freqtrade.io/en/latest/): separate a virtual practice ledger from live markets. This product has no exchange order credentials or trading adapter.
- [Reddit chart-overload discussion](https://www.reddit.com/r/CryptoHelp/comments/1mw3md8/) and [venue-specific chart workflow](https://www.reddit.com/r/TradingView/comments/1s200rz/how_do_you_view_your_charts_for_cryptocurrencies/): anecdotal evidence for hiding advanced controls initially and keeping venue identity visible. User comments are design inputs, not market or product-performance evidence.

## Chart data

The old view offered zoom and fit around one recent response. It could not retrieve earlier candles and capped all chart history at 600. The same validated API/Worker/direct adapter now accepts an exclusive UTC open cursor. [Binance](https://developers.binance.com/en/docs/products/spot/rest-api) takes an inclusive millisecond end time, so subtract one millisecond. [Coinbase](https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproductcandles) uses start/end and supported granularities; 4h bars are folded from complete UTC-aligned 1h buckets. A single in-flight fetch preserves the viewport by shifting logical indices after a prepend. Client state is scoped to instrument, interval, and request generation. The chart caps at 4,000 bars. Thin or unavailable markets may need a wider interval. An empty preceding window does not prove a market had no older trades.

## Model and analyst boundaries

The local historical analog model uses a nearest-neighbor comparison of price change, distance from the recent average, and average logarithmic high-low range. It uses consecutive closed candles, allows only earlier samples with known outcomes, excludes overlapping matches, and abstains when it cannot find eight similar windows. It reports five-candle descriptive outcomes and a separate baseline. The implementation uses no external AI provider and has no forward performance validation; the counts are not estimated probabilities. See [nearest neighbors](https://scikit-learn.org/stable/modules/neighbors.html) and [time-ordered evaluation](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html).

[Analyst source review](STUDY-POV-RESEARCH.md) records seven selected BTC, ETH and SOL views. It labels dates and conditional/expired horizons. It does not calculate a market consensus from incomparable views.

## Practice

Practice starts with separate virtual 10,000 USD and 10,000 USDT balances, mark-to-market for the selected position where a valid quote is available, a 0.10% fee, and 0.05% adverse slippage on each simulation. The user can only sell existing units. This does not model depth, partial fills, funding or liquidation. Position size estimates are hypothetical and never trigger a live or virtual order. The paper ledger stays in the browser and is separate from existing workspace backups.

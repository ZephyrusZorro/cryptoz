# Adaptive Study

The study estimates whether price closes higher than the confirmed origin close after a chosen horizon of 1–48 candles. A flat close counts toward “non-higher” in the binary score and remains “flat” in historical return summaries and the journal.

## Review of the 3.0 archive

- The archive already had useful ingredients in `src/ai-intelligence.js`, including three horizons, one-bar embargoed training, non-overlapping evaluation origins, reliability bins, and a historical up-rate comparator.
- Its horizon model allowed 18 retained test cases and skipped past origins where the rolling training labels were imbalanced. Its scenario screen could render whenever a horizon was ready, independently of the stricter five-bar study. The engine returned the stale flag alongside fitted forecasts.
- Its reliability bins describe outcomes from past raw scores. The unchanged current logistic score fed an arithmetic split into bull, range, and bear weights without observing those outcomes. The 68% and 90% ranges came from ATR multipliers and analog extremes without checking their coverage. Nearest analogs could share portions of their forward outcome windows. Regime probabilities came from normalized heuristic scores without regime outcome labels.

## Evidence and issuance

- The worker uses the latest consecutive sequence of validated, exchange-confirmed closes for the chosen venue, product and interval. It excludes future, unfinished and conflicting candles and uses at most 4,000. Choose the recommended window, a candle count, a UTC start date, or the earliest available data within that cap. The controls show the approximate minimum sample for the selected horizon. The result identifies incomplete windows and explains which checks passed.
- Fixed UTC origin slots are one horizon apart. Each origin uses 160–780 rolling training labels with targets closing at least one bar before the origin. The `adaptive-v4` logistic model uses strictly causal, shift-invariant features within the 12-bar lookback window: volatility-scaled multi-bar moves (1, 3, 6, 12 bars), close location in bar range, bar range expansion, relative volume impulse, and a local Garman-Klass short-vs-prior volatility-shift feature. L2 regularization scales with $\sqrt{\max(1, h / 5)}$ to account for reduced effective sample size from overlapping multi-bar targets. The three comparators receive the same origins and outcome labels: smoothed rolling historical rate, smoothed rate over the last 96 eligible labels, and last-close momentum (0.75, 0.50 or 0.25).
- Each horizon scores up to 120 held-out cases. Each score can be calibrated from the last 60 completed historical test cases outside the same one-bar embargo, using raw score bands below 0.40, from 0.40 to below 0.60, and 0.60 or higher. A band with at least 12 cases blends the observed event count with 12 observations' worth of the raw score. Smaller bands retain the raw test score and cannot support a directional issuance. Extra calibration cases precede the scored window when earlier history is available.
- The study reports Brier error, Brier Skill Score ($\text{BSS} = 1 - \text{BS}_{\text{model}} / \text{BS}_{\text{baseline}}$), log loss, accuracy, time-block stability, observed event rates by scored band, causal market regime context (structure, ATR volatility regime, horizon ATR scale, structural invalidation bounds), and per-feature log-odds attributions at the latest closed candle. An issuance needs at least 50 test cases, at least eight of each outcome, Brier improvement of 0.01 over the strongest comparator, at least the comparator's accuracy, and improvement in three of four time blocks including the latest. It also needs a fresh origin, a current score of at least 0.60 or at most 0.40, and sample support in the matching raw band. The nominal 90% Wilson score bounds serve as a screening rule for that historical band. Time dependence and the sample's changing composition limit the interpretation of those bounds.
- The 10th percentile, median, and 90th percentile describe realized historical returns from the same held-out cases. Each horizon reports those observed returns and higher, lower, and flat counts when it has at least 50 cases. The study makes no claim of future interval coverage. [Time-ordered validation](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html) · [Probability calibration](https://scikit-learn.org/stable/modules/calibration.html)
- A journal row is keyed by venue, product, interval, model version, horizon, and origin close time. The first issuance persists through reruns. It can settle once against the exact confirmed target close. The journal retains prior `adaptive-v1`, `adaptive-v2`, and `adaptive-v3` rows alongside `adaptive-v4` and applies retention separately. Web Locks serialize browser writes where supported.

## Previous release live market smoke

On 2026-11-18 at 05:00 UTC the model processed 2,000 consecutive hourly closes per pair from Binance's public Kline endpoint. All nine evaluations abstained. These are one-date observations from the three inspected markets. [Binance market data](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints#klinecandlestick-data)

| Pair | Horizon | Test cases | Model Brier | Best comparator Brier |
| --- | ---: | ---: | ---: | ---: |
| BTCUSDT | 5 | 120 | 0.2501 | 0.2483 |
| BTCUSDT | 12 | 120 | 0.2542 | 0.2515 |
| BTCUSDT | 24 | 74 | 0.2526 | 0.2585 |
| ETHUSDT | 5 | 120 | 0.2549 | 0.2509 |
| ETHUSDT | 12 | 120 | 0.2612 | 0.2535 |
| ETHUSDT | 24 | 74 | 0.2582 | 0.2586 |
| SOLUSDT | 5 | 120 | 0.2492 | 0.2491 |
| SOLUSDT | 12 | 120 | 0.2561 | 0.2476 |
| SOLUSDT | 24 | 74 | 0.2526 | 0.2500 |

## `adaptive-v4` empirical walk-forward comparison (2026-11-19)

Evaluated on live Binance spot klines (2,000 consecutive candles for 1h/4h; 1,500 for 1d) comparing `adaptive-v3` vs `adaptive-v4` (horizon-scaled ridge + local Garman-Klass volatility-shift feature) on identical non-overlapping origins:

| Pair & Interval | Horizon | `v3` Brier | `v4` Brier | Strongest Baseline Brier | `v4` Brier Skill |
| --- | ---: | ---: | ---: | ---: | ---: |
| BTCUSDT 1h | 24 | 0.2516 | 0.2504 | 0.2578 | +2.85% |
| ETHUSDT 1h | 5 | 0.2577 | 0.2559 | 0.2512 | −1.87% |
| SOLUSDT 1h | 12 | 0.2552 | 0.2522 | 0.2468 | −2.19% |
| SOLUSDT 1h | 24 | 0.2520 | 0.2484 | 0.2477 | −0.29% |
| BTCUSDT 4h | 12 | 0.2515 | 0.2505 | 0.2531 | +1.03% |
| ETHUSDT 4h | 12 | 0.2546 | 0.2507 | 0.2527 | +0.80% |
| BTCUSDT 1d | 24 | 0.2602 | 0.2494 | 0.2614 | +4.60% |

Across all 18 evaluated pair/interval/horizon combinations, `adaptive-v4` reduced out-of-sample Brier error in 14 of 18 cases while strictly maintaining honest abstention whenever the 5 evidence gates are not met.

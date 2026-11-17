# Market discovery data

Explore groups Coinpaprika assets by their provider IDs. The six curated groups overlap and cover selected assets in the aggregate USD feed. Binance spot uses its own USDT pairs and exposes activity filters using venue data.

| Curated group | Classification checked against |
| --- | --- |
| Layer 1 | Coinpaprika `layer-1-l1` and [BNB Smart Chain](https://www.bnbchain.org/en/bnb-smart-chain) |
| Layer 2 | Coinpaprika `layer-2-l2` |
| DeFi | Coinpaprika `defi` |
| Stablecoins | Coinpaprika `stablecoin` and [Circle USDC](https://www.circle.com/usdc) |
| AI & compute | Coinpaprika `artificial-intelligence`, `computing-cloud-infrastructure` and `distributed-computing`, with [Fetch.ai](https://fetch.ai/) and [Render Network](https://rendernetwork.com/) |
| Meme coins | Coinpaprika `meme-coin`, `dog-meme-coin`, `cat-meme-coin` and `frog-meme-coin` |

On 18 November 2026, all 71 group memberships resolved to active [Coinpaprika catalog IDs](https://api.coinpaprika.com/v1/coins) with positive USD prices in the [ticker snapshot](https://api.coinpaprika.com/v1/tickers). To refresh the list, check the exact ticker ID, catalog activity and the applicable [provider tags](https://api.coinpaprika.com/v1/tags?additional_fields=coins) or a project's documentation. Recheck old IDs when an asset migrates or its provider listing changes. A shared ticker or a similarly named bridged token is insufficient to establish identity.

The activity filters use the feed's signed 24-hour percentage changes and positive 24-hour quote volume. Home breadth uses the top 100 ranked, priced Coinpaprika rows available and reports how many have a known 24-hour change. Its bar shows the split among those rows with known changes.

import { validInstrument } from './preferences.js';

const REVIEWED_ON = '2026-11-18';
const endOf2026 = '2026-12-31';
const bitwise = {
  publisher: 'Bitwise Asset Management',
  author: 'Matt Hougan and Ryan Rasmussen',
  title: 'The Year Ahead: 10 Crypto Predictions for 2026',
  url: 'https://bitwiseinvestments.com/crypto-market-insights/the-year-ahead-10-crypto-predictions-for-2026',
  published: '2025-12-15',
  period: 'Calendar year 2026',
  periodEnd: endOf2026,
};
const sources = {
  BTC: [
    {
      publisher: '21shares',
      title: 'Good time to buy bitcoin? Four signals worth watching',
      url: 'https://www.21shares.com/en-us/insights/good-time-to-buy-bitcoin',
      published: '2026-11-09',
      period: 'By year-end 2026',
      periodEnd: endOf2026,
      view: 'Projected a recovery toward US$100,000 by year-end.',
      context: 'Extrapolates from a small sample of past cycle recoveries. The separate mid-2027 view has a later deadline.',
    },
    {
      publisher: 'CF Benchmarks',
      title: 'Risk-On Reloaded: Monetary Easing, Catch-up Trades, and the Tokenization Buildout',
      url: 'https://www.cfbenchmarks.com/blog/risk-on-reloaded-monetary-easing-catch-up-trades-and-the-tokenization-buildout',
      published: '2025-12-30',
      period: 'Year-end 2026',
      periodEnd: endOf2026,
      view: 'Modeled about US$138,000 at year-end if Bitcoin’s market cap relative to gold returned to trend.',
      context: 'A conditional valuation scenario that also assumes gold’s market cap grows at its trend rate.',
    },
    {
      publisher: 'VanEck Research',
      author: 'Matthew Sigel',
      title: 'Plan for 2026: Predictions from Our Portfolio Managers',
      url: 'https://www.vaneck.com/us/en/blogs/investment-outlook/plan-for-2026-predictions-from-our-portfolio-managers/',
      published: '2025-12-18',
      period: 'Calendar year 2026',
      periodEnd: endOf2026,
      view: 'Described consolidation as a likelier 2026 path than a sharp rally or collapse.',
      context: 'The discussion combines cycle timing, liquidity, leverage, and on-chain activity. It does not specify a comparable closing price.',
    },
    {
      publisher: 'Galaxy Research',
      author: 'Alex Thorn',
      title: '26 Crypto, Bitcoin, DeFi, and AI Predictions for 2026',
      url: 'https://www.galaxy.com/insights/research/predictions-2026-crypto-bitcoin-defi',
      published: '2025-12-18',
      period: 'Calendar year 2026',
      periodEnd: endOf2026,
      view: 'Allowed for a new record in 2026 and declined to make a 2026 price forecast.',
      context: 'Cited wide option-market outcomes as evidence of uncertainty. Its price target was for the end of 2027.',
    },
    {
      ...bitwise,
      view: 'Expected Bitcoin to set a new record during 2026.',
      context: 'An at-any-point record forecast offers no year-end closing price.',
    },
    {
      publisher: 'Grayscale Research',
      title: '2026 Digital Asset Outlook: Dawn of the Institutional Era',
      url: 'https://research.grayscale.com/reports/2026-digital-asset-outlook-dawn-of-the-institutional-era',
      published: '2025-12-15',
      period: 'First half of 2026',
      periodEnd: '2026-06-30',
      view: 'Expected Bitcoin could exceed its prior high in the first half of 2026.',
      context: 'The published window ended June 30. The view relied on demand for alternative stores of value and institutional adoption.',
    },
  ],
  ETH: [{
    ...bitwise,
    view: 'Expected a new Ether record during 2026 if the CLARITY Act passed.',
    context: 'The published forecast depends on a legislative condition.',
  }, {
    publisher: 'Grayscale Research',
    author: 'Zach Pandl',
    title: 'Ethereum Is Shaping the Infrastructure for Tokenized Finance',
    url: 'https://www.grayscale.com/the-stack/ethereum-is-shaping-the-infrastructure-for-tokenized-finance',
    published: '2026-11-06',
    view: 'Viewed Ethereum’s stablecoin and tokenized asset adoption as evidence that ETH offers exposure to growth in blockchain-based finance.',
    context: 'The thesis draws on stablecoin value, tokenized assets and developer activity at publication. It gives no price target.',
  }],
  SOL: [{
    ...bitwise,
    view: 'Expected a new Solana record during 2026 if the CLARITY Act passed.',
    context: 'The published forecast depends on a legislative condition.',
  }, {
    publisher: 'Grayscale Research',
    title: 'Solana: Crypto’s Financial Bazaar',
    url: 'https://research.grayscale.com/reports/solana-cryptos-financial-bazaar',
    published: '2026-06-26',
    view: 'Argued that fast, inexpensive transactions and a broad app ecosystem make Solana a competitive financial platform.',
    context: 'The report also questioned SOL’s role as a long-term store of value relative to BTC or ETH. It gives no dated price target.',
  }],
  XRP: [{
    publisher: 'Grayscale Research',
    title: 'Building Block: XRP',
    url: 'https://research.grayscale.com/token-fundamentals/building-block-xrp',
    published: '2025-11-06',
    view: 'Saw XRP as exposure to faster cross-border payments, pointing to the XRP Ledger’s speed and low costs.',
    context: 'The thesis depends on institutions using the network for payments at scale. It gives no price target.',
  }],
  LINK: [{
    publisher: 'Grayscale Research',
    author: 'Zach Pandl and Michael Zhao',
    title: 'The LINK Between Worlds',
    url: 'https://research.grayscale.com/reports/the-link-between-worlds',
    published: '2025-11-19',
    view: 'Expected Chainlink’s data and cross-chain services to play an important role in tokenized finance across multiple networks.',
    context: 'The analysts discuss how network adoption and fee collection could benefit LINK. Their report gives no dated price target.',
  }, {
    publisher: '21shares',
    title: 'Chainlink Investment Thesis',
    url: 'https://cdn.21shares.com/uploads/current-documents/investment-thesis/LINK_Investment_Memo.pdf',
    published: '2025-04-10',
    view: 'Highlighted Chainlink’s use in bringing external data into smart contracts and connecting networks, including institutional tokenization pilots.',
    context: 'An issuer research memo. Its quoted market figures are a snapshot from April 2025.',
  }],
  BNB: [{
    publisher: 'VanEck Research',
    author: 'Patrick Bush',
    title: 'BNB Chain Explained: Usage, Fees, and Token Value',
    url: 'https://www.vaneck.com/us/en/blogs/digital-assets/bnb-chain-explained-usage-fees-and-token-value/',
    published: '2026-06-25',
    view: 'Linked consumer payments, stablecoins, and tokenized asset use to demand for BNB Chain, and described how token burns reduce supply.',
    context: 'The market observations are dated. VanEck discloses that it may hold the assets discussed.',
  }],
  AVAX: [{
    publisher: 'VanEck Research',
    author: 'Patrick Bush and Matthew Sigel',
    title: 'Avalanche 201: The Institutional Platform',
    url: 'https://www.vaneck.com/us/en/blogs/digital-assets/matthew-sigel-avalanche-201-the-institutional-platform/',
    published: '2026-02-25',
    view: 'Saw an opportunity for Avalanche’s customizable blockchains in institutional tokenization and payments.',
    context: 'The report ties the long-term thesis to enterprise trials becoming sustained production use. VanEck may have positions in the assets discussed.',
  }],
  SUI: [{
    publisher: 'Grayscale Research',
    title: 'Building Block: Sui',
    url: 'https://research.grayscale.com/reports/building-block-sui',
    published: '2026-02-18',
    view: 'Saw simpler sign-ins and fast settlement as features that could attract new users to Sui applications.',
    context: 'Its early-adoption comparison uses February 2026 data. It gives no price target.',
  }],
  HYPE: [{
    publisher: 'Grayscale Research',
    author: 'Michael Zhao and Zach Pandl',
    title: 'Hyperliquid Breaks the Mold',
    url: 'https://research.grayscale.com/reports/hyperliquid-breaks-the-mold',
    published: '2026-05-27',
    view: 'Argued that Hyperliquid’s onchain perpetual futures and expansion into other markets could support continued growth.',
    context: 'The thesis considers fee economics alongside regulatory access and validator concentration. It gives no dated price target.',
  }],
  NEAR: [{
    publisher: 'Grayscale Research',
    title: 'Building Block: Near',
    url: 'https://research.grayscale.com/reports/building-block-near',
    published: '2024-05-23',
    view: 'Saw NEAR’s scaling architecture and simpler onboarding as strengths. It reported relatively low fee revenue despite user growth.',
    context: 'An older fundamental snapshot. Activity, fees and competitor comparisons refer to the publication period.',
  }],
  TAO: [{
    publisher: 'Grayscale Research',
    author: 'Will Ogden Moore',
    title: 'Bittensor on the Eve of the First Halving',
    url: 'https://research.grayscale.com/reports/bittensor-on-the-eve-of-the-first-halving',
    published: '2025-12-03',
    period: 'December 2025 halving',
    periodEnd: '2025-12-31',
    view: 'Viewed slower TAO issuance around the first halving and potential demand growth as favorable catalysts for the ecosystem.',
    context: 'The view concerned the first halving and supplied no dated price target.',
  }],
  AAVE: [{
    publisher: 'Grayscale Research',
    author: 'Charlie Perkins and Zach Pandl',
    title: 'Guide to Buying the Dip: Valuing Crypto with Cash Flows',
    url: 'https://research.grayscale.com/reports/guide-to-buying-the-dip-valuing-crypto-with-cash-flows',
    published: '2026-06-16',
    period: 'One year from publication',
    periodEnd: '2027-06-16',
    type: 'Valuation scenario',
    view: 'Estimated that AAVE’s fair value could approach $175 in one year under its base case.',
    context: 'The valuation assumes greater regulatory clarity accelerates the use of tokenized assets. It is sensitive to adoption and modeled cash flows.',
  }],
  ZEC: [{
    publisher: 'Grayscale Research',
    title: 'Building Block: Zcash',
    url: 'https://research.grayscale.com/token-fundamentals/building-block-zcash',
    published: '2026-03-18',
    view: 'Viewed Zcash as differentiated by private payments and linked its thesis to better usability and more support for shielded transfers.',
    context: 'The report focuses on adoption of optional privacy features. It gives no price target.',
  }],
  ADA: [{
    publisher: '21shares',
    title: 'Cardano Investment Thesis',
    url: 'https://cdn.21shares.com/uploads/current-documents/investment-thesis/AADA_Investment_Memo.pdf',
    published: '2025-04-09',
    view: 'Highlighted Cardano’s research-driven design and identified smart contract usage as important to the next stage of adoption.',
    context: 'The issuer memo also noted competition from networks with more application activity and a steeper learning curve for developers.',
  }],
  DOT: [{
    publisher: '21shares',
    title: 'Polkadot Investment Thesis',
    url: 'https://cdn.21shares.com/uploads/current-documents/investment-thesis/ADOT_Investment_Memo.pdf',
    published: '2025-04-09',
    view: 'Highlighted shared security, communication across networks, and more flexible blockspace as potential strengths.',
    context: 'The dated issuer memo identified rival ecosystems as a competitive risk. Check current documentation for upgraded network mechanics.',
  }],
  ALGO: [{
    publisher: '21shares',
    title: 'Algorand Investment Thesis',
    url: 'https://cdn.21shares.com/uploads/current-documents/investment-thesis/ALGO_Investment_Thesis.pdf',
    published: '2025-04-09',
    view: 'Highlighted proof-of-stake design and the network’s potential for financial applications.',
    context: 'The issuer identified adoption as a risk relative to higher-activity smart contract networks at the time.',
  }],
  FET: [{
    publisher: 'Kraken / Payward',
    title: 'Fetch.AI Crypto Asset Risk Disclosure',
    url: 'https://assets-cms.kraken.com/files/51n36hrp/facade/77be58ff915acfc822be21651b579c05e45d3bbe.pdf',
    published: '2025-08-11',
    type: 'Risk disclosure',
    view: 'Identified network adoption and competition from other blockchain-based AI services as sources of risk to FET’s value.',
    context: 'A dated exchange risk disclosure. Consult current provider information for migration status.',
  }],
  STX: [{
    publisher: 'Grayscale Research',
    author: 'Michael Zhao',
    title: 'Building Block: Stacks',
    url: 'https://research.grayscale.com/token-fundamentals/building-block-stacks',
    published: '2023-05-23',
    view: 'Viewed Stacks as a way for developers to build applications that extend Bitcoin’s functionality.',
    context: 'This early ecosystem assessment predates later upgrades. It gives no price target.',
  }],
};

export const ANALYST_ASSETS = Object.freeze([
  ['btc-bitcoin', 'Bitcoin', 'BTC'],
  ['eth-ethereum', 'Ethereum', 'ETH'],
  ['sol-solana', 'Solana', 'SOL'],
  ['xrp-xrp', 'XRP', 'XRP'],
  ['bnb-binance-coin', 'BNB', 'BNB'],
  ['link-chainlink', 'Chainlink', 'LINK'],
  ['avax-avalanche', 'Avalanche', 'AVAX'],
  ['sui-sui', 'Sui', 'SUI'],
  ['hype-hyperliquid', 'Hyperliquid', 'HYPE'],
  ['near-near-protocol', 'NEAR Protocol', 'NEAR'],
  ['tao-bittensor', 'Bittensor', 'TAO'],
  ['aave-new', 'Aave', 'AAVE'],
  ['zec-zcash', 'Zcash', 'ZEC'],
  ['ada-cardano', 'Cardano', 'ADA'],
  ['dot-polkadot', 'Polkadot', 'DOT'],
  ['algo-algorand', 'Algorand', 'ALGO'],
  ['fetch-ai', 'Fetch.ai / Artificial Superintelligence Alliance', 'FET'],
  ['stx-stacks', 'Stacks', 'STX'],
].map(([id, name, symbol]) => Object.freeze({id, name, symbol})));

const byId = new Map(ANALYST_ASSETS.map(asset => [asset.id, asset]));
const legacy = new Map(ANALYST_ASSETS.slice(0, 3).map(asset => [asset.symbol, asset.id]));
const byPair = new Map(ANALYST_ASSETS.flatMap(asset => [
  ['binance:' + asset.symbol + 'USDT', asset.id],
  ['coinbase:' + asset.symbol + '-USD', asset.id],
]));
const catalogId = /^[a-z0-9][a-z0-9-]{1,79}$/;
const chartKey = /^(?:binance:[\p{L}\p{N}]{1,25}USDT|coinbase:[\p{L}\p{N}]{1,25}-USD)$/u;
const catalogAlias = new Map([['fet-artificial-superintelligence-alliance', 'fetch-ai']]);

function resolveCatalogId(id) {
  return catalogAlias.get(id) ?? id;
}

export function analystAssetKey(asset) {
  if (typeof asset === 'string') {
    if (legacy.has(asset)) return legacy.get(asset);
    if (chartKey.test(asset)) return byPair.get(asset) ?? asset;
    return catalogId.test(asset) ? resolveCatalogId(asset) : '';
  }
  if (typeof asset?.id === 'string' && catalogId.test(asset.id)) {
    const id = resolveCatalogId(asset.id);
    const canonical = byId.get(id);
    return canonical && asset.symbol && asset.symbol !== canonical.symbol ? '' : id;
  }
  if (!validInstrument(asset)) return '';
  const key = asset.venue + ':' + asset.symbol;
  return byPair.get(key) ?? key;
}

export function getAnalystResearch(asset, {asOf = new Date().toISOString().slice(0, 10)} = {}) {
  const key = analystAssetKey(asset);
  const canonical = byId.get(key);
  const name = canonical?.name ?? (asset?.name || asset?.base || key || 'Selected asset');
  const datedViews = canonical ? sources[canonical.symbol] : [];
  const views = datedViews.filter(record => record.published <= asOf)
    .map(record => ({
      ...record,
      periodEnded: Boolean(record.periodEnd && record.periodEnd < asOf),
      type: record.type ?? (record.periodEnd ? 'Dated outlook' : 'Asset analysis'),
    }))
    .sort((a, b) => b.published.localeCompare(a.published));
  return {
    asOf: REVIEWED_ON,
    asset: {id: key, name, symbol: canonical?.symbol ?? (asset?.base || asset?.symbol || '')},
    coverage: views.length ? 'Original publications with their assumptions and dates.' : 'No verified analyst coverage for this asset.',
    views,
    aggregate: null,
    synthesis: views.length
      ? 'An aggregate target requires comparable assumptions, horizons and price measures. Publishers may have commercial interests in the assets discussed.'
      : 'Coverage varies by asset. Use the chart or market data to study this coin.',
  };
}

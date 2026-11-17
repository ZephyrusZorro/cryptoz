export const GETTING_STARTED=[
 {id:'identity',title:'Know the asset',text:'Check its name, venue and quote currency. Matching tickers can represent different tokens.',href:'#markets',action:'Find an asset',icon:'search'},
 {id:'candles',title:'Read the chart',text:'Choose an interval. Compare the current unfinished candle with completed history.',href:'#terminal',action:'Open charts',icon:'chart-no-axes-combined'},
 {id:'indicators',title:'Understand the readings',text:'Read what EMA, RSI and MACD measure, including their limitations.',href:'#learn?view=readings',action:'View signal readings',icon:'activity'},
 {id:'risk',title:'Plan a scenario',text:'Enter your own entry, stop, target and fees. Compare loss, position size and capital.',href:'#practice?section=risk-tools',action:'Open risk calculator',icon:'target'},
 {id:'notes',title:'Test your reasoning',text:'Practice how order size, fees, and price movement affect the result with virtual funds.',href:'#practice',action:'Open simulator',icon:'file-text'}
];
const glossary=[
 ['Venue','exchange','The exchange supplying this chart or order book.'],
 ['Quote currency','USD USDT trading pair','The currency used to express price; BTC/USDT prices Bitcoin in USDT.'],
 ['Candle','OHLC open high low close','The open, high, low and close over one interval.'],
 ['Timeframe','interval 1h 4h daily','The duration represented by each candle, such as one hour.'],
 ['Provisional candle','unfinished current candle','The current candle can change until its interval closes.'],
 ['EMA','exponential moving average trend','An average weighted toward recent closes; it lags price.'],
 ['RSI','relative strength index momentum','A momentum measure from 0–100; extremes can persist.'],
 ['MACD','moving average convergence divergence histogram','An EMA comparison; its histogram measures distance from the signal line.'],
 ['ATR','average true range volatility','A range measure in quote units, without a directional prediction.'],
 ['Spread','bid ask order book','Best ask minus best bid on one venue.'],
 ['Slippage','execution liquidity','The difference between expected and actual execution price.'],
 ['Liquidity','depth volume orders','How readily an asset can trade without substantially moving its price.'],
 ['Market cap','capitalization circulating supply','Price multiplied by circulating supply; it is not cash available to trade.'],
 ['Stop level','stop loss invalidation','A chosen exit threshold; execution at that exact price is not guaranteed.'],
 ['Reward / risk','R:R ratio target loss','Estimated net target gain divided by estimated stop loss.'],
 ['Break-even win rate','probability fees wins losses','The win rate required by identical modeled outcomes, not a forecast.'],
 ['Snapshot','delayed cached stale','A point-in-time observation. Check its timestamp and source.'],
 ['Drawdown','peak trough risk','The fall from a previous price peak within the measured window.']
].map(([term,aliases,definition])=>({term,aliases,definition}));
const normalize=value=>String(value??'').slice(0,100).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function searchGlossary(query=''){const tokens=normalize(query).split(' ').filter(Boolean);return glossary.filter(item=>tokens.every(t=>normalize([item.term,item.aliases,item.definition].join(' ')).includes(t)));}
const help={
 chart:{title:'Chart guide',items:[['Read the identity','Confirm venue, instrument, quote and candle interval.'],['Navigate history','Drag to pan, pinch or wheel to zoom. Older candles requests the preceding exchange page. Latest returns to the current market.'],['Understand the candle','The latest candle is provisional. Indicators describe observed history.'],['Add context','Indicators adds overlays and oscillators. Drawing tools save per instrument and interval.']]},
 risk:{title:'Risk calculator guide',items:[['Equity and risk','Equity is your scenario balance in quote units. Risk % defines the modeled loss budget.'],['Choose your levels','Long: stop < entry < target. Short: target < entry < stop.'],['Include costs','Enter the fee charged per side. Slippage and funding are excluded.'],['Read the outcome','Position size differs from money at risk. No order is placed.']]}
};
export const helpFor=context=>Object.hasOwn(help,context)?help[context]:null;
export const LEARNING_SOURCES=[
 {title:'Coinbase · Reading charts',href:'https://www.coinbase.com/learn/advanced-trading/reading-financial-charts'},
 {title:'Coinbase · Slippage',href:'https://help.coinbase.com/en/coinbase/trading-and-funding/advanced-trade/slippage'},
 {title:'Binance Academy · Risk and reward',href:'https://www.binance.com/en/academy/articles/what-is-the-risk-reward-ratio-and-how-to-use-it'}
];

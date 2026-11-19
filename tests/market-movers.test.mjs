import test from 'node:test';
import assert from 'node:assert/strict';
import {marketMoverRanks} from '../src/market-movers.js';
import {MarketStream} from '../src/live-market.js';

const now = Date.parse('2026-11-18T10:00:00Z');
const time = new Date(now).toISOString();
const quote = (symbol, change, overrides = {}) => ({quote: {symbol: symbol + 'USDT', price: 100, change, volume: 1000, updatedAt: time, ...overrides}, quality:'snapshot'});
const symbols = entries => entries.map(item => item.quote.symbol.slice(0, -4));

test('mover ranks contain five winners and five losers, with a stable tie break and no invalid or flat markets', () => {
  const rises = [quote('G',3), quote('F',3), quote('E',4), quote('C',7), quote('B',7), quote('A',12)];
  const falls = [quote('H',-2), quote('I',-5), quote('J',-6), quote('K',-7), quote('L',-8), quote('M',-9)];
  const invalid = [null, quote('ZERO',0), quote('BROKEN',null), quote('MISSING',45,{price:0}), quote('EMPTY',45,{volume:0})];
  const ranks = marketMoverRanks([...falls, ...rises, ...invalid]);
  assert.deepEqual(symbols(ranks.gainers), ['A','B','C','E','F']);
  assert.deepEqual(symbols(ranks.losers), ['M','L','K','J','I']);
});

test('mover observations use the registered universe, seed from REST, and switch to the latest socket event', () => {
  let tick = now, socket;
  const stream = new MarketStream({now:()=>tick, onBatch:()=>{}, onStatus:()=>{}, socketFactory:()=>socket={close(){}}});
  const register = base => ({symbol:base+'USDT',base,venue:'binance',quote:'USDT'});
  try {
    stream.setRegistry(['BTC','ETH'].map(register));
    stream.setSnapshots([quote('BTC',5), quote('ETH',2), quote('UNKNOWN',90)].map(({quote:q})=>({...q,id:q.symbol})));
    assert.deepEqual(symbols(marketMoverRanks(stream.observations()).gainers), ['BTC','ETH']);
    tick += 1000;
    socket.onmessage({data:JSON.stringify([{s:'ETHUSDT',c:'100',o:'90',h:'103',l:'89',q:'500',E:tick}])});
    const newer = marketMoverRanks(stream.observations()).gainers;
    assert.deepEqual(symbols(newer), ['ETH','BTC']);
    assert.equal(newer[0].quality, 'live');
    assert.equal(newer[1].quality, 'snapshot');
    stream.setActive(false);
    assert.equal(marketMoverRanks(stream.observations()).gainers[0].quality,'last');
  } finally {
    stream.dispose();
  }
});

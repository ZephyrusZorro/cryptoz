import {test} from 'node:test';
import assert from 'node:assert/strict';
import {screenMarket,groupPerformance} from '../src/screener.js';
const rows=[{id:'btc-bitcoin',marketCap:1e12,change:5,volume:1e8},{id:'eth-ethereum',marketCap:1e11,change:-5,volume:5e7},{id:'sol-solana',marketCap:null,change:null,volume:null},{id:'bnb-binance-coin',marketCap:1e8,change:6,volume:1e4}];
test('screener combines thresholds, excludes missing fields, and never applies cap filters to pair lists',()=>{
 assert.deepEqual(screenMarket(rows,{size:'large',volume:1e7,move:'up5'}).map(x=>x.id),['btc-bitcoin']);
 assert.deepEqual(screenMarket(rows,{size:'large',volume:0,move:'up5'},'exchange').map(x=>x.id),['btc-bitcoin','bnb-binance-coin']);
});
test('weighted sector changes use only reported, curated memberships',()=>{
 const v=groupPerformance(rows,'layer-1');
 assert.equal(v.count,3);
 assert.ok(Math.abs(v.change-(5e12-5e11+6e8)/(1e12+1e11+1e8))<1e-12);
});

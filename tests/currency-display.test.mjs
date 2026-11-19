import test from 'node:test';
import assert from 'node:assert/strict';
import {axisPriceFormat,currency,createDisplayCurrency,displayCompact,displayPrice} from '../src/currency.js';
import {price,compact} from '../src/ui.js';

test('prices and compact amounts use the grouping of the displayed currency',()=>{
  assert.equal(price(5892457.01,'₹'),'₹58,92,457.01');
  assert.equal(price(5892457.01,'$'),'$5,892,457.01');
  assert.equal(compact(500000,'INR'),'5L');
});

test('rupee labels match on converted charts, quotes and compact market totals',()=>{
  currency.set('INR');
  try{
    assert.ok(currency.accept('USD-INR',{rate:100,observedAt:new Date().toISOString().slice(0,10)}));
    assert.equal(axisPriceFormat(2,'USD').formatter(58924.5701),'₹58,92,457.01');
    assert.equal(displayPrice(58924.5701),'₹58,92,457.01');
    assert.equal(displayCompact(5000),'₹5L');
  }finally{currency.set('USD');}
});

const NOW=Date.parse('2026-11-18T15:00:00Z');

test('USD and INR displays use independently dated rates and never assume USDT parity',()=>{
  const money=createDisplayCurrency({now:()=>NOW});
  assert.deepEqual(money.quote(100,'USDT'),{amount:100,currency:'USDT',converted:false});
  assert.ok(money.accept('USDT-USD',{rate:.98,observedAt:'2026-11-18T14:59:59Z'}));
  assert.deepEqual(money.quote(100,'USDT'),{amount:98,currency:'USD',converted:true});
  money.set('INR');
  assert.deepEqual(money.quote(100,'USD'),{amount:100,currency:'USD',converted:false});
  assert.ok(money.accept('USD-INR',{rate:90,observedAt:'2026-11-18'}));
  assert.deepEqual(money.quote(100,'USDT'),{amount:8820,currency:'INR',converted:true});
  assert.deepEqual(money.quote(100,'USD'),{amount:9000,currency:'INR',converted:true});
  assert.deepEqual(money.quote(100,'BTC'),{amount:100,currency:'BTC',converted:false});
});

test('stale, future, and out-of-order reference prices never fabricate a conversion',()=>{
  let clock=NOW;
  const money=createDisplayCurrency({now:()=>clock});
  money.set('INR');
  assert.equal(money.accept('USD-INR',{rate:90,observedAt:'2026-11-19'}),false);
  assert.equal(money.accept('USD-INR',{rate:90,observedAt:'2026-11-17'}),true);
  assert.equal(money.accept('USD-INR',{rate:89,observedAt:'2026-11-16'}),false);
  assert.equal(money.accept('USDT-USD',{rate:.98,observedAt:'2026-11-18T14:59:59Z'}),true);
  clock+=300001;
  assert.equal(money.quote(100,'USDT').currency,'USDT');
  assert.equal(money.quote(100,'USD').currency,'INR');
  clock+=9*86400000;
  assert.equal(money.quote(100,'USD').currency,'USD');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createDisplayCurrency} from '../src/currency.js';

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

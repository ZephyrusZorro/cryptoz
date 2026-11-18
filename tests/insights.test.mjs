import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateway } from '../server/gateway.js';
import { createApiClient } from '../src/api.js';

const start = Date.parse('2026-11-18T12:00:00Z');
const hour = 3600000;
const day = 24 * hour;
const request = (query) => new Request('http://localhost/api/insights?' + query);
const read = async (gateway, section) => (await gateway(request('section=' + section))).json();
const rejected = () => new Response('', { status: 451 });

test('an Insights request cannot set an upstream or a different contract', async () => {
  const gateway = createGateway({ fetcher: () => assert.fail('Unexpected upstream request') });
  for (const query of ['section=elsewhere', 'section=derivatives&symbol=ETHUSDT', 'section=macro&section=onchain', 'section=macro&url=https://example.invalid']) {
    assert.equal((await gateway(request(query))).status, 400);
  }
});

test('a restricted venue preserves independently sourced rates and options IV', async () => {
  const gateway = createGateway({ now: () => start, fetcher: async (url) => {
    const source = new URL(url);
    if (source.hostname === 'api.bybit.com') return Response.json({
      retCode: 0, time: start - 3000, result: {
        category: 'linear', list: [{ symbol: 'BTCUSDT', markPrice: '101', indexPrice: '100',
          openInterest: '20', openInterestValue: '2020', fundingRate: '0', fundingIntervalHour: '4' }],
      },
    });
    if (source.hostname === 'www.deribit.com') return Response.json({ result: {
      data: [[start - hour, 40, 44, 38, 42], [start - 2 * hour, 40, 44, 38, 41], [start, 41, 44, 39, 43]],
    } });
    return rejected();
  } });
  const result = await read(gateway, 'derivatives');
  const feeds = result.data.feeds;
  assert.equal(feeds.binance.status, 'unavailable');
  assert.match(feeds.binance.error, /451/);
  assert.equal(feeds.bybit.provider, 'Bybit');
  assert.equal(feeds.bybit.values.fundingPct, 0);
  assert.equal(feeds.bybit.values.fundingIntervalHours, 4);
  assert.equal(feeds.bybit.values.basisPct, 1);
  assert.equal(feeds.dvol.asOf, '2026-11-18T12:00:00.000Z');
  assert.equal(feeds.dvol.values.volatilityPct, 42);
});

test('cached derivatives observations are explicitly stale and future observations are rejected', async () => {
  let time = start;
  let available = true;
  const gateway = createGateway({ now: () => time, fetcher: async (url) => {
    if (!available || !url.startsWith('https://fapi.binance.com/fapi/v1/premiumIndex')) return rejected();
    return Response.json({ symbol: 'BTCUSDT', time: start, markPrice: '99', indexPrice: '100', lastFundingRate: '.0001' });
  } });
  const first = await read(gateway, 'derivatives');
  time += 2 * 60000;
  available = false;
  const retained = await read(gateway, 'derivatives');
  assert.equal(first.data.feeds.binance.status, 'observed');
  assert.equal(retained.data.feeds.binance.status, 'stale');
  assert.equal(retained.data.feeds.binance.asOf, first.data.feeds.binance.asOf);
  const invalid = createGateway({ now: () => start, fetcher: async (url) =>
    url.startsWith('https://fapi.binance.com/fapi/v1/premiumIndex')
      ? Response.json({ symbol: 'BTCUSDT', time: start + hour, markPrice: '99', indexPrice: '100', lastFundingRate: '.0001' })
      : rejected() });
  assert.equal((await read(invalid, 'derivatives')).data.feeds.binance.status, 'unavailable');
});

test('daily activity uses completed dates and stablecoin prices remain missing without a quote', async () => {
  const gateway = createGateway({ now: () => start, fetcher: async (url) => {
    if (url.includes('assets=btc')) return Response.json({ data: [
      { asset: 'btc', time: '2026-11-18T00:00:00.000000000Z', AdrActCnt: '50', TxCnt: '400' },
      { asset: 'btc', time: '2026-11-17T00:00:00.000000000Z', AdrActCnt: '30', TxCnt: null },
      { asset: 'btc', time: '2026-11-16T00:00:00.000000000Z', AdrActCnt: '10', TxCnt: '0' },
    ] });
    if (url.includes('/stablecoins?')) return Response.json({ peggedAssets: [
      { name: 'A', symbol: 'AAA', pegType: 'peggedUSD', circulating: { peggedUSD: 20000000 }, price: null },
      { name: 'B', symbol: 'BBB', pegType: 'peggedUSD', circulating: { peggedUSD: 10000000 }, price: 0.99 },
    ] });
    if (url.includes('/fees/recommended')) return Response.json({ fastestFee: 0, halfHourFee: 0, hourFee: 0, economyFee: 0 });
    return rejected();
  } });
  const { data: { feeds } } = await read(gateway, 'onchain');
  assert.equal(feeds.btc.values.date, '2026-11-17');
  assert.equal(feeds.btc.values.transactions, null);
  assert.equal(feeds.eth.status, 'unavailable');
  assert.equal(feeds.pegs.values.assets[0].priceUsd, null);
  assert.equal(feeds.pegs.values.assets[0].deviationBps, null);
  assert.ok(Math.abs(feeds.pegs.values.assets[1].deviationBps + 100) < 0.00001);
  assert.equal(feeds.fees.values.priority, 0);
  assert.equal(feeds.fees.asOf, null);
  assert.equal(feeds.fees.status, 'snapshot');
});

test('FRED skips missing rates, keeps the observation date, and calculates changes from five observations', async () => {
  const gateway = createGateway({ now: () => start, fetcher: async (url) => {
    if (url.includes('id=DGS10')) return new Response([
      'observation_date,DGS10', '2026-11-16,4.51', '2026-11-17,.', '2026-11-13,4.4',
      '2026-11-12,4.45', '2026-11-11,', '2026-11-10,4.48', '2026-11-09,4.44', '2026-11-06,4.36',
      '2026-12-01,88',
    ].join('\n'));
    return rejected();
  } });
  const { data: { feeds } } = await read(gateway, 'macro');
  assert.equal(feeds.yield10.values.date, '2026-11-16');
  assert.equal(feeds.yield10.values.ratePct, 4.51);
  assert.equal(feeds.yield10.values.change5ObservationsBps, 15);
  assert.equal(feeds.yield2.status, 'unavailable');
});

test('calendar lists only dates published by the issuing agencies', async () => {
  const gateway = createGateway({ now: () => start, fetcher: async (url) => {
    if (url.endsWith('bls.ics')) return new Response([
      'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART;TZID=US-Eastern:20261204T083000', 'SUMMARY:Employment Situation', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART;TZID=US-Eastern:20261210T083000', 'SUMMARY:Consumer Price Index', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART;TZID=US-Eastern:20261211T083000', 'SUMMARY:Consumer Price Index', 'STATUS:CANCELLED', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART;TZID=US-Eastern:20261110T083000', 'SUMMARY:Employment Situation', 'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n'));
    if (url.endsWith('fomccalendars.htm')) return new Response([
      '<h4><a id="10">2026 FOMC Meetings</a></h4>',
      '<div class="fomc-meeting__month"><strong>December</strong></div><div class="fomc-meeting__date">8-9*</div>',
      '<h4><a id="11">2027 FOMC Meetings</a></h4>',
      '<div class="fomc-meeting__month"><strong>Apr/May</strong></div><div class="fomc-meeting__date">30-1</div>',
    ].join('\n'));
    return rejected();
  } });
  const { data: { feeds } } = await read(gateway, 'macro');
  assert.deepEqual(feeds.bls.values.events.map(({ date, time }) => [date, time]), [
    ['2026-12-04', '08:30'], ['2026-12-10', '08:30'],
  ]);
  assert.deepEqual(feeds.fomc.values.events.map(({ date, endDate }) => [date, endDate]), [
    ['2026-12-08', '2026-12-09'], ['2027-04-30', '2027-05-01'],
  ]);
});

test('the browser API requests Insights exclusively through its same-origin gateway', async () => {
  const { api } = createApiClient({ fetcher: async (url) => {
    assert.equal(url, '/api/insights?section=macro');
    return Response.json({ data: { section: 'macro' } });
  }, loadDirect: () => assert.fail('Unexpected browser fallback') });
  assert.equal((await api('insights?section=macro')).data.section, 'macro');
});

test('Insight fallback fills only unavailable observations from the same section', async()=>{
 const observations={binance:{status:'observed',values:{funding:1}},dvol:{status:'unavailable'}};
 const recovered={binance:{status:'observed',values:{funding:2}},dvol:{status:'dated',values:{dvol:52}}};
 let requests=0;
 const {api}=createApiClient({fetcher:async()=>Response.json({data:{section:'derivatives',feeds:observations}}),loadDirect:async()=>async(path)=>{
  assert.equal(path,'insights?section=derivatives');requests++;return {data:{section:'derivatives',feeds:recovered}};
 }});
 const data=(await api('insights?section=derivatives')).data;
 assert.equal(requests,1);assert.equal(data.feeds.binance.values.funding,1);
 assert.equal(data.feeds.dvol.values.dvol,52);assert.equal(data.feeds.dvol.transport,'browser-direct');
});

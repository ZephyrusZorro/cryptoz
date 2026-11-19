import assert from 'node:assert/strict';
import test from 'node:test';
import { ANALYST_ASSETS, analystAssetKey, getAnalystResearch } from '../src/analyst-research.js';
import { analystPanel } from '../src/decision-views.js';

test('research preserves exact catalog identity and explicit exchange pair mappings', () => {
  const link = { id: 'link-chainlink', name: 'Chainlink', symbol: 'LINK' };
  const collision = { id: 'link-some-other-token', name: 'Other LINK', symbol: 'LINK' };
  const exchange = { venue: 'binance', base: 'LINK', quote: 'USDT', symbol: 'LINKUSDT' };
  assert.equal(analystAssetKey(exchange), link.id);
  assert.equal(analystAssetKey({ ...exchange, symbol: 'LINKUSDC' }), '');
  assert.equal(analystAssetKey(collision), collision.id);
  assert.ok(getAnalystResearch(link).views.length >= 2);
  assert.equal(getAnalystResearch(collision).views.length, 0);
  assert.equal(getAnalystResearch({ ...link, symbol: 'ETH' }).views.length, 0);
  assert.equal(getAnalystResearch('LINK').views.length, 0);
  assert.equal(getAnalystResearch(analystAssetKey({ id: 'btc', symbol: 'LINK' })).views.length, 0);
  assert.equal(analystAssetKey({ id: 'fet-artificial-superintelligence-alliance', symbol: 'FET' }), 'fetch-ai');
  assert.equal(getAnalystResearch({ id: 'stx-staykx', symbol: 'STX' }).views.length, 0);
});

test('all covered assets have dated primary links and conditional or undated evidence is never aggregated', () => {
  const cutoff = '2026-11-18';
  assert.ok(ANALYST_ASSETS.length >= 12);
  assert.equal(new Set(ANALYST_ASSETS.map(asset => asset.id)).size, ANALYST_ASSETS.length);
  for (const asset of ANALYST_ASSETS) {
    const research = getAnalystResearch(asset, { asOf: cutoff });
    assert.equal(research.aggregate, null);
    assert.ok(research.views.length, asset.id);
    for (const view of research.views) {
      assert.ok(view.url.startsWith('https://'));
      assert.match(view.published, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(view.published <= cutoff);
    }
  }
  assert.equal(getAnalystResearch('xrp-xrp', { asOf: '2025-05-06' }).views.length, 0);
  assert.equal(getAnalystResearch('xrp-xrp', { asOf: '2025-11-05' }).views.length, 1);
  assert.ok(getAnalystResearch('xrp-xrp', { asOf: cutoff }).views.length >= 2);
  const btcHtml = analystPanel('btc-bitcoin', { price: 90000, change: 2.5, marketCap: 1.8e12 });
  assert.match(btcHtml, /Live spot/);
  assert.match(btcHtml, /Stated scenario level/);
  assert.match(btcHtml, /Key drivers/);
});

test('unsupported coins carry their display identity and have an honest empty state', () => {
  const html = analystPanel({ id: 'xyz-unknown', name: '<script>Unknown</script>', symbol: 'XYZ' });
  assert.match(html, /No verified analyst coverage/);
  assert.doesNotMatch(html, /<script>|href="https:/);
  assert.match(html, /&lt;script&gt;Unknown/);
});

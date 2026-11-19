import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import handler, { marketRequestUrl } from '../api/[route].mjs';
import release from '../package.json' with { type: 'json' };

test('Vercel routing metadata stays outside the gateway query contract', () => {
  const rate = marketRequestUrl('/api/fx?pair=USD-INR&route=fx');
  assert.equal(rate.pathname, '/api/fx');
  assert.equal(rate.search, '?pair=USD-INR');
  assert.equal(marketRequestUrl('/api/insights?route=insights&section=macro&extra=1').search, '?section=macro&extra=1');
  assert.equal(marketRequestUrl('/api/fx?route=unrelated&pair=USD-INR').search, '?route=unrelated&pair=USD-INR');
});

test('Vercel entry routes health and forwards market requests to the read-only gateway', async () => {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = 'http://127.0.0.1:' + server.address().port;
    const health = await fetch(origin + '/api/healthz');
    assert.deepEqual(await health.json(), { status: 'ok', service: 'CRYPTOZ', version: release.version });
    assert.equal(health.headers.get('cache-control'), 'no-store');
    assert.equal((await fetch(origin + '/api/healthz', { method: 'HEAD' })).status, 200);
    assert.equal((await fetch(origin + '/api/healthz', { method: 'POST' })).status, 405);
    assert.equal((await fetch(origin + '/api/candles?interval=invalid')).status, 400);
    assert.equal((await fetch(origin + '/api/markets', { method: 'POST' })).status, 405);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

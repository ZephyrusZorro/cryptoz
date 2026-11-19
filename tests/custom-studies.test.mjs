import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCustomStudy, parseAssistanceImport, parseFormula, validateCustomStudy } from '../src/custom-studies.js';
import { calculateStudies } from '../src/studies.js';

const bars = Array.from({ length: 40 }, (_, i) => ({
  time: 1700000000 + i * 3600,
  open: 100 + i,
  high: 103 + i,
  low: 98 + i,
  close: 101 + i,
  volume: 10 + i * 2,
}));

test('CSP-safe formula parser evaluates valid math & TA expressions and rejects unsafe code', () => {
  const ast = parseFormula('(close - sma(close, 5)) + ema(hl2, 3) * 0.5');
  assert.equal(ast.type, 'bin');

  const study = validateCustomStudy({
    name: 'Test Spread',
    formula: 'ema(close, 5) - sma(close, 10)',
    placement: 'pane',
    color: 'cyan',
    guides: [0],
  });
  const res = evaluateCustomStudy(study, bars);
  assert.equal(res.ready, true);
  assert.equal(res.series[0].values.slice(0, 9).every(v => v === null), true);
  assert.ok(Number.isFinite(res.series[0].values.at(-1)));

  // Calculate alongside built-in studies seamlessly
  const combined = calculateStudies(bars, ['ema'], { customStudies: [study] });
  assert.equal(combined.length, 2);
  assert.equal(combined[1].id, study.id);

  // Reject injection / unknown functions / invalid lookbacks
  for (const bad of ['process.exit(1)', 'eval("1+1")', 'constructor()', 'sma(close, 0)', 'sma(close, 999)', 'close; alert(1)']) {
    assert.throws(() => parseFormula(bad), `should reject "${bad}"`);
  }
});

test('assistance importer parses JSON bundles and CSV levels/symbols safely', () => {
  const jsonBundle = JSON.stringify({
    indicators: [{ name: 'Midpoint', formula: 'hl2', placement: 'overlay', color: 'gold' }],
    levels: [{ label: 'Major target', price: 98500 }],
    symbols: ['PEPEUSDT', 'AVAX-USD'],
  });
  const parsed = parseAssistanceImport(jsonBundle, 1700000000);
  assert.equal(parsed.indicators.length, 1);
  assert.equal(parsed.levels.length, 1);
  assert.equal(parsed.levels[0].points[0].price, 98500);
  assert.equal(parsed.symbols.length, 2);
  assert.deepEqual(parsed.symbols.map(s => [s.venue, s.symbol]), [['binance', 'PEPEUSDT'], ['coinbase', 'AVAX-USD']]);

  const csv = 'price,label\n91000,Support shelf\n97500,Resistance cap\nDOGEUSDT';
  const fromCsv = parseAssistanceImport(csv, 1700000000);
  assert.equal(fromCsv.levels.length, 2);
  assert.equal(fromCsv.symbols.length, 1);
  assert.equal(fromCsv.symbols[0].symbol, 'DOGEUSDT');
});

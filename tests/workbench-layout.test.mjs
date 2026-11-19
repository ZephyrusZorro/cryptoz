import test from 'node:test';
import assert from 'node:assert/strict';
import { chartPanelFor, chartWorkbench } from '../src/workbench.js';
import { forecastPanel } from '../src/decision-views.js';
import { deskSwitch, readDesk } from '../src/guided-ui.js';

test('the unified chart exposes all analysis panels and one reset action', () => {
  assert.equal(chartPanelFor('signals'), 'signals');
  assert.equal(chartPanelFor('depth'), 'depth');
  const html = chartWorkbench({ interval: '1h', panel: 'signals', controls: '' });
  assert.match(html, /role="tablist" aria-label="Chart analysis"/);
  assert.match(html, /id="wb-tab-signals" role="tab" tabindex="0"[^>]*aria-controls="wb-signals" aria-selected="true"/);
  assert.match(html, /id="wb-signals" class="wb-pane" role="tabpanel" aria-labelledby="wb-tab-signals" tabindex="0"/);
  assert.equal((html.match(/role="tab" tabindex="0"/g) ?? []).length, 1);
  assert.match(html,/data-action="reset-chart"/);
  assert.doesNotMatch(html,/data-action="(?:older|latest)-candles"/);
});

test('an archived or superseded forecast cannot show a cached directional call', () => {
  const previous = { forecast: { direction: 'up', probabilityUp: 0.7, targetCloseAt: 3600 } };
  assert.match(forecastPanel(previous, { archive: true }), /Historical test only/);
  assert.match(forecastPanel(previous, { superseded: true }), /New candle available/);
  assert.doesNotMatch(forecastPanel(previous, { archive: true }), /Study leans/);
});

test('homepage desk mode switch and Basic-mode forecast guidance render cleanly', () => {
  const html = deskSwitch('basic');
  assert.match(html, /data-action="desk" data-mode="basic" aria-pressed="true"/);
  assert.match(html, /data-action="desk" data-mode="pro" aria-pressed="false"/);
  assert.equal(readDesk({ getItem: () => 'pro' }), 'pro');
  assert.equal(readDesk({ getItem: () => null }), 'basic');
  const abstained = forecastPanel({ reason: 'Insufficient edge.' }, { mode: 'basic' });
  assert.match(abstained, /Why no call\?/);
});

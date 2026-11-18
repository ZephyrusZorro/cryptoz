import test from 'node:test';
import assert from 'node:assert/strict';
import { chartPanelFor, chartWorkbench } from '../src/workbench.js';
import { forecastPanel } from '../src/decision-views.js';

test('pro analysis exposes a linked, keyboard-selectable signal panel; Basic deep links stay useful', () => {
  assert.equal(chartPanelFor('signals', 'pro'), 'signals');
  assert.equal(chartPanelFor('signals', 'basic'), 'reading');
  const html = chartWorkbench({ mode: 'pro', interval: '1h', panel: 'signals', controls: '' });
  assert.match(html, /role="tablist" aria-label="Chart analysis"/);
  assert.match(html, /id="wb-tab-signals" role="tab" tabindex="0"[^>]*aria-controls="wb-signals" aria-selected="true"/);
  assert.match(html, /id="wb-signals" class="wb-pane" role="tabpanel" aria-labelledby="wb-tab-signals" tabindex="0"/);
  assert.equal((html.match(/role="tab" tabindex="0"/g) ?? []).length, 1);
});

test('an archived or superseded forecast cannot show a cached directional call', () => {
  const previous = { forecast: { direction: 'up', probabilityUp: 0.7, targetCloseAt: 3600 } };
  assert.match(forecastPanel(previous, { archive: true }), /Historical test only/);
  assert.match(forecastPanel(previous, { superseded: true }), /New candle available/);
  assert.doesNotMatch(forecastPanel(previous, { archive: true }), /Study leans/);
});

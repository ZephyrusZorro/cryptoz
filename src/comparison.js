import { palette, chartOptions } from './theme.js';
import { createChart, LineSeries } from 'lightweight-charts';
import { api } from './api.js';
import { compareSeries } from './research.js';
import { INTERVALS } from './preferences.js';
import { esc, num, pct, tone, stamp, icon, download } from './ui.js';

const COLOR_STORAGE_KEY = 'cryptoz.compare.colors.v1';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const COMPARISON_PRESET_SWATCHES = Object.freeze([
  '#f59e0b', // Amber / BTC
  '#8b7cf6', // Violet / ETH
  '#2dd4a0', // Emerald / SOL
  '#38bdf8', // Sky Cyan
  '#f45d75', // Coral Rose
  '#fb923c', // Sunset Orange
  '#ec4899', // Magenta
  '#a3e635', // Lime
]);

const DEFAULT_COIN_COLORS = Object.freeze({
  BTC: '#f59e0b',
  ETH: '#8b7cf6',
  SOL: '#2dd4a0',
  XRP: '#38bdf8',
  BNB: '#eab308',
  ADA: '#60a5fa',
  AVAX: '#f45d75',
  DOGE: '#facc15',
  LINK: '#4f86f7',
  DOT: '#ec4899',
  SUI: '#22d3ee',
  LTC: '#94a3b8',
});

let remembered = { venue: 'binance', interval: '1h', bases: ['BTC', 'ETH', 'SOL', ''] };

function loadSavedColors() {
  try {
    const raw = globalThis.localStorage?.getItem(COLOR_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const clean = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === 'string' && k.length <= 24 && typeof v === 'string' && HEX_COLOR.test(v)) clean[k.toUpperCase()] = v;
    }
    return clean;
  } catch {
    return {};
  }
}

function saveCustomColors(map) {
  try {
    globalThis.localStorage?.setItem(COLOR_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export function resolveCoinColors(bases, customColors = {}) {
  const p = palette();
  const fallbacks = [p.accent || '#4da6ff', p.violet || '#8b7cf6', p.cyan || '#2dd4a0', p.gold || '#f59e0b', '#f45d75', '#fb923c', '#ec4899', '#a3e635'];
  const used = new Set();
  return bases.map((rawBase, i) => {
    const base = String(rawBase ?? '').toUpperCase();
    const explicit = base && HEX_COLOR.test(customColors[base] ?? '') ? customColors[base] : null;
    if (explicit) {
      used.add(explicit.toLowerCase());
      return explicit;
    }
    const branded = base && DEFAULT_COIN_COLORS[base] ? DEFAULT_COIN_COLORS[base] : null;
    if (branded && !used.has(branded.toLowerCase())) {
      used.add(branded.toLowerCase());
      return branded;
    }
    const pick = fallbacks.find(c => !used.has(c.toLowerCase())) ?? fallbacks[i % fallbacks.length];
    used.add(pick.toLowerCase());
    return pick;
  });
}

export function mountComparison(root, { instruments, hydrate, request = api }) {
  let requestController;
  let disposed = false, generation = 0, chart = null, result = null, metadata = [], series = [];
  let customColors = loadSavedColors();

  root.innerHTML = `<section class="panel comparison-panel">
   <div class="panel-top"><div><h2>Indexed price comparison</h2></div><span class="small-tag">INDEXED TO 100</span></div>
   <p class="chart-description">Compare 2–4 instruments from the same exchange, starting at 100. Pick a custom color for each coin to make overlays effortless to read.</p>
   <form id="comparison-form">
    <div class="comparison-controls">
     <label>Venue<select name="venue"><option value="binance">Binance · USDT</option><option value="coinbase">Coinbase · USD</option></select></label>
     <label>Interval<select name="interval"><option value="1h">1 hour</option><option value="4h">4 hours</option><option value="1d">1 day</option></select></label>
     ${[0, 1, 2, 3].map(i => `<div class="compare-asset-slot">
      <label class="compare-asset-label"><span>Asset ${i + 1}${i > 1 ? ' (optional)' : ''}</span>
       <div class="compare-asset-row">
        <input type="color" class="compare-color-input" name="color${i}" value="${COMPARISON_PRESET_SWATCHES[i]}" aria-label="Chart line color for asset ${i + 1}" title="Choose chart color">
        <select name="asset${i}" aria-label="Comparison asset ${i + 1}"></select>
       </div>
      </label>
     </div>`).join('')}
    </div>
    <div class="form-action">
     <button type="submit" class="button primary">Compare instruments ${icon('arrow-right')}</button>
     <button type="button" class="button" id="comparison-export" disabled>${icon('download')} Export aligned data</button>
     <button type="button" class="button" id="comparison-reset-colors" title="Restore default coin colors">Reset colors</button>
     <span id="comparison-status" role="status" class="source"></span>
    </div>
   </form>
   <div id="comparison-legend" class="comparison-legend" hidden></div>
   <div id="comparison-chart" class="comparison-chart"></div>
   <div id="comparison-meta" class="panel-bottom"></div>
  </section>
  <div id="comparison-analysis"></div>
  <details class="comparison-method"><summary>Calculation notes</summary><p>Returns and drawdown use the shared completed-candle window. Volatility annualizes sample log-return variation on a 365-day calendar. Correlation uses matched adjacent returns; gaps and undefined values are disclosed. These historical measurements do not forecast returns.</p></details>`;

  const form = root.querySelector('form');
  const status = root.querySelector('#comparison-status');
  const legendHost = root.querySelector('#comparison-legend');
  form.elements.venue.value = remembered.venue;
  form.elements.interval.value = remembered.interval;

  function registry() {
    const v = form.elements.venue.value;
    let list = instruments[v] ?? [];
    if (!list.length) list = ['BTC', 'ETH', 'SOL'].map(base => ({ venue: v, base, quote: v === 'binance' ? 'USDT' : 'USD', symbol: v === 'binance' ? base + 'USDT' : base + '-USD' }));
    return list;
  }

  function selectedBases() {
    const list = registry();
    return [0, 1, 2, 3].map(i => list.find(x => x.symbol === form.elements['asset' + i].value)?.base ?? '');
  }

  function syncColorInputs() {
    const bases = selectedBases();
    const resolved = resolveCoinColors(bases, customColors);
    for (let i = 0; i < 4; i++) {
      const input = form.elements['color' + i];
      if (!input) continue;
      input.value = resolved[i];
      input.disabled = !bases[i];
      input.title = bases[i] ? `Choose chart color for ${bases[i]}` : 'Select a coin to customize its color';
    }
    return resolved;
  }

  function activeAssetColors() {
    if (!result) return [];
    return resolveCoinColors(result.assets.map(a => a.instrument.base), customColors);
  }

  function renderLegend() {
    if (!result?.assets?.length) {
      legendHost.hidden = true;
      legendHost.innerHTML = '';
      return;
    }
    const cols = activeAssetColors();
    legendHost.hidden = false;
    legendHost.innerHTML = result.assets.map((a, i) => {
      const color = cols[i];
      const base = a.instrument.base;
      const swatches = COMPARISON_PRESET_SWATCHES.map(hex => `<button type="button" class="legend-swatch-dot${hex.toLowerCase() === color.toLowerCase() ? ' active' : ''}" data-compare-base="${esc(base)}" data-compare-color="${hex}" style="--swatch:${hex}" aria-label="Set ${esc(base)} color to ${hex}" title="${hex}"></button>`).join('');
      return `<div class="compare-legend-item" style="--coin-color:${color}">
       <label class="compare-legend-pick" title="Custom color for ${esc(base)}">
        <span class="compare-legend-line" aria-hidden="true"></span>
        <input type="color" class="compare-legend-color-input" data-compare-base="${esc(base)}" value="${color}" aria-label="Pick custom color for ${esc(base)}">
       </label>
       <strong>${esc(base)}</strong>
       <span class="${tone(a.returnPct)}">${pct(a.returnPct)}</span>
       <div class="compare-quick-swatches" role="group" aria-label="Preset colors for ${esc(base)}">${swatches}</div>
      </div>`;
    }).join('');
  }

  function applyLiveColors() {
    syncColorInputs();
    if (!result) return;
    const cols = activeAssetColors();
    series.forEach((s, i) => { if (cols[i]) s.applyOptions({ color: cols[i] }); });
    root.querySelectorAll('.comparison-stats tbody tr td:first-child .compare-dot').forEach((dot, i) => {
      if (cols[i]) dot.style.color = cols[i];
    });
    root.querySelectorAll('.correlation-panel [data-corr-coin]').forEach(el => {
      const idx = Number(el.dataset.corrCoin);
      if (Number.isInteger(idx) && cols[idx]) el.style.setProperty('--coin-color', cols[idx]);
    });
    renderLegend();
  }

  function setCoinColor(base, hex) {
    if (!base || !HEX_COLOR.test(hex)) return;
    customColors[base.toUpperCase()] = hex;
    saveCustomColors(customColors);
    applyLiveColors();
  }

  function fill(preserve = false) {
    const list = registry().slice().sort((a, b) => a.base.localeCompare(b.base));
    for (let i = 0; i < 4; i++) {
      const select = form.elements['asset' + i];
      const base = preserve ? list.find(x => x.symbol === select.value)?.base ?? remembered.bases[i] : remembered.bases[i];
      select.innerHTML = (i > 1 ? '<option value="">None</option>' : '') + list.map(x => `<option value="${esc(x.symbol)}">${esc(x.base)} / ${esc(x.quote)}</option>`).join('');
      select.value = list.find(x => x.base === base)?.symbol ?? (i > 1 ? '' : list[i]?.symbol ?? '');
    }
    syncColorInputs();
  }

  function selectionKey() { return ['venue', 'interval', 'asset0', 'asset1', 'asset2', 'asset3'].map(k => form.elements[k].value).join(':'); }

  function invalidate(message = 'Selection changed. Compare instruments to update.') {
    generation++;
    requestController?.abort();
    chart?.remove();
    chart = null;
    series = [];
    result = null;
    legendHost.hidden = true;
    legendHost.innerHTML = '';
    root.querySelector('#comparison-chart').innerHTML = '';
    root.querySelector('#comparison-analysis').innerHTML = '';
    root.querySelector('#comparison-meta').textContent = '';
    root.querySelector('#comparison-export').disabled = true;
    status.textContent = message;
  }

  fill();
  form.elements.venue.addEventListener('change', () => { fill(); invalidate(); });
  for (const name of ['interval', 'asset0', 'asset1', 'asset2', 'asset3']) {
    form.elements[name].addEventListener('change', () => { syncColorInputs(); invalidate(); });
  }
  for (let i = 0; i < 4; i++) {
    form.elements['color' + i]?.addEventListener('input', e => {
      const base = selectedBases()[i];
      if (base) setCoinColor(base, e.target.value);
    });
  }
  legendHost.addEventListener('click', e => {
    const btn = e.target.closest('[data-compare-color]');
    if (!btn) return;
    setCoinColor(btn.dataset.compareBase, btn.dataset.compareColor);
  });
  legendHost.addEventListener('input', e => {
    const input = e.target.closest('.compare-legend-color-input');
    if (!input) return;
    setCoinColor(input.dataset.compareBase, input.value);
  });
  root.querySelector('#comparison-reset-colors')?.addEventListener('click', () => {
    customColors = {};
    saveCustomColors(customColors);
    applyLiveColors();
  });

  async function run() {
    if (disposed) return;
    const id = ++generation;
    requestController?.abort();
    const controller = requestController = new AbortController();
    chart?.remove();
    chart = null;
    series = [];
    result = null;
    legendHost.hidden = true;
    legendHost.innerHTML = '';
    root.querySelector('#comparison-analysis').innerHTML = '';
    root.querySelector('#comparison-meta').textContent = '';
    root.querySelector('#comparison-export').disabled = true;
    const host = root.querySelector('#comparison-chart');
    host.innerHTML = '<div class="empty-state"><span class="loader"></span><strong>Aligning completed candles…</strong></div>';
    const venue = form.elements.venue.value, interval = form.elements.interval.value, list = registry();
    const chosen = [0, 1, 2, 3].map(i => list.find(x => x.symbol === form.elements['asset' + i].value)).filter(Boolean);
    status.textContent = 'Loading history…';
    try {
      if (chosen.length < 2 || new Set(chosen.map(x => x.symbol)).size !== chosen.length) throw Error('Select two to four different instruments.');
      const responses = await Promise.all(chosen.map(i => request(`candles?venue=${i.venue}&symbol=${encodeURIComponent(i.symbol)}&interval=${interval}`, { signal: controller.signal })));
      if (disposed || id !== generation) return;
      result = compareSeries(chosen.map((instrument, i) => ({ instrument, bars: responses[i].data.bars })), INTERVALS[interval]);
      metadata = responses;
      remembered = { venue, interval, bases: [...chosen.map(x => x.base), ...Array(4 - chosen.length).fill('')] };
      const cols = activeAssetColors();
      syncColorInputs();
      host.innerHTML = '';
      chart = createChart(host, { autoSize: true, ...chartOptions(), layout: { ...chartOptions().layout, fontFamily: 'DM Sans', attributionLogo: true }, timeScale: { ...chartOptions().timeScale, timeVisible: true } });
      series = [];
      result.assets.forEach((a, i) => {
        const s = chart.addSeries(LineSeries, { color: cols[i], lineWidth: 2.5, title: a.instrument.base, priceLineVisible: false, priceFormat: { type: 'price', precision: 2, minMove: .01 } });
        s.setData(a.points);
        series.push(s);
      });
      chart.timeScale().fitContent();
      renderLegend();
      status.textContent = responses.some(r => r.cache === 'stale') ? 'Stale source in window — inspect provenance' : 'Snapshot ready · ' + result.times.length + ' shared candles';
      status.classList.toggle('warn', responses.some(r => r.cache === 'stale'));
      root.querySelector('#comparison-meta').textContent = `${venue.toUpperCase()} · ${chosen[0].quote} · ${interval} · ${stamp(new Date(result.times[0] * 1000).toISOString())} to ${stamp(new Date(result.times.at(-1) * 1000).toISOString())} · ${result.gapCount} missing intervals · ${result.returnSamples} adjacent-return samples`;
      root.querySelector('#comparison-analysis').innerHTML = `<section class="panel comparison-stats"><div class="panel-top"><h2>Returns &amp; risk</h2><span class="source">Common window · completed candles</span></div><div class="table-scroll"><table class="sources-table"><thead><tr><th>Instrument</th><th>Window return</th><th>Maximum drawdown</th><th>Annualized volatility</th><th>Source fetched</th></tr></thead><tbody>${result.assets.map((a, i) => `<tr><td><span class="compare-dot" style="color:${cols[i]}">●</span> ${esc(a.instrument.symbol)}</td><td class="${tone(a.returnPct)}">${pct(a.returnPct)}</td><td class="negative">${pct(a.drawdownPct)}</td><td>${a.volatilityPct === null ? 'Unavailable' : num(a.volatilityPct) + '%'}</td><td>${metadata[i].transport === 'browser-direct' ? 'Browser direct · ' : ''}${metadata[i].cache === 'stale' ? 'STALE · ' : ''}${esc(stamp(metadata[i].fetchedAt))}</td></tr>`).join('')}</tbody></table></div></section><section class="panel correlation-panel"><div class="panel-top"><h2>Return correlation</h2><span class="source">Pearson · −1 to +1</span></div><div class="table-scroll"><table class="sources-table"><thead><tr><th></th>${result.assets.map((a, i) => `<th data-corr-coin="${i}" style="--coin-color:${cols[i]}"><span class="corr-coin-badge">${esc(a.instrument.base)}</span></th>`).join('')}</tr></thead><tbody>${result.correlation.map((row, i) => `<tr><td data-corr-coin="${i}" style="--coin-color:${cols[i]}"><span class="corr-coin-badge">${esc(result.assets[i].instrument.base)}</span></td>${row.map(c => `<td class="${c !== null ? c >= 0 ? 'positive' : 'negative' : ''}">${c === null ? 'Undefined' : num(c, 3)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="data-note">Correlation changes with sample window and may not persist. No diversification guarantee is implied.</p></section>`;
      root.querySelector('#comparison-export').disabled = false;
    } catch (e) {
      if (disposed || id !== generation || controller.signal.aborted) return;
      host.innerHTML = `<div class="empty-state"><strong>Comparison unavailable</strong><p>${esc(e.message)}</p></div>`;
      status.textContent = 'Data unavailable';
    }
  }

  form.addEventListener('submit', e => { e.preventDefault(); run(); });
  root.querySelector('#comparison-export').addEventListener('click', () => {
    if (!result) return;
    download('cryptoz-comparison.csv', 'time,' + result.assets.map(a => a.instrument.symbol + '_index100').join(',') + '\n' + result.times.map((t, i) => [new Date(t * 1000).toISOString(), ...result.assets.map(a => a.points[i].value)].join(',')).join('\n'), 'text/csv');
  });
  hydrate();
  run();
  return {
    refresh: run,
    applyTheme() {
      chart?.applyOptions(chartOptions());
      applyLiveColors();
    },
    dispose() { disposed = true; generation++; requestController?.abort(); chart?.remove(); },
    updateInstruments() {
      if (disposed) return;
      const previous = selectionKey();
      fill(true);
      if (previous !== selectionKey()) invalidate('Listing updated. Compare instruments to update.');
    },
  };
}

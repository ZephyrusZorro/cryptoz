import { runOpenBacktest, runParameterSweep } from './backtest-engine.js';

self.addEventListener('message', event => {
  const { id, type, bars, config, options } = event.data ?? {};
  if (!Number.isSafeInteger(id)) return;
  try {
    if (type === 'sweep') {
      self.postMessage({ id, result: runParameterSweep(bars, config, options) });
    } else {
      self.postMessage({ id, result: runOpenBacktest(bars, config, options) });
    }
  } catch (err) {
    self.postMessage({ id, error: err?.message || 'Backtest computation failed.' });
  }
});

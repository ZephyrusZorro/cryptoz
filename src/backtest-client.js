import { runOpenBacktest, runParameterSweep } from './backtest-engine.js';

let sharedWorker = null;
let nextId = 1;
let pending = null;

function killWorker() {
  if (sharedWorker) {
    try { sharedWorker.terminate(); } catch {}
    sharedWorker = null;
  }
}

function getWorker() {
  if (typeof Worker === 'undefined') return null;
  if (!sharedWorker) {
    sharedWorker = new Worker(new URL('./backtest-worker.js', import.meta.url), { type: 'module' });
  }
  return sharedWorker;
}

function dispatch(type, bars, config, options, signal) {
  if (signal?.aborted) return Promise.reject(new DOMException('Backtest canceled', 'AbortError'));
  const syncFallback = () => Promise.resolve(type === 'sweep'
    ? runParameterSweep(bars, config, options)
    : runOpenBacktest(bars, config, options));

  let worker;
  try { worker = getWorker(); } catch { return syncFallback(); }
  if (!worker) return syncFallback();

  if (pending) {
    pending.cancel();
    pending = null;
  }

  return new Promise((resolve, reject) => {
    const id = nextId++;
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      if (pending?.id === id) pending = null;
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      killWorker();
      reject(new DOMException('Backtest canceled', 'AbortError'));
    };
    const onMessage = ({ data }) => {
      if (settled || data?.id !== id) return;
      settled = true;
      cleanup();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    };
    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      killWorker();
      syncFallback().then(resolve, reject);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      killWorker();
      reject(new Error('Backtest calculation timed out.'));
    }, 15000);

    pending = { id, cancel: onAbort };
    signal?.addEventListener('abort', onAbort, { once: true });
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ id, type, bars, config, options });
  });
}

export function runBacktestInWorker(bars, config, options = {}, signal) {
  return dispatch('run', bars, config, options, signal);
}

export function runSweepInWorker(bars, config, options = {}, signal) {
  return dispatch('sweep', bars, config, options, signal);
}

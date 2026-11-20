let sharedWorker = null;
let nextId = 1;

function resetWorker() {
  if (sharedWorker) {
    try { sharedWorker.terminate(); } catch {}
    sharedWorker = null;
  }
}

export function assessInWorker(input, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Study canceled', 'AbortError')); return; }
    let worker = sharedWorker;
    if (!worker) {
      try {
        worker = new Worker(new URL('./forecast-worker.js', import.meta.url), { type: 'module' });
        sharedWorker = worker;
      } catch {
        reject(new Error('The analysis could not start in this browser.'));
        return;
      }
    }
    const id = nextId++;
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    };
    const finish = (settle, value, terminate = false) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (terminate) resetWorker();
      settle(value);
    };
    const abort = () => finish(reject, new DOMException('Study canceled', 'AbortError'), true);
    const onMessage = ({ data }) => {
      if (data?.id !== id) return;
      if (data.error) finish(reject, new Error(data.error), false);
      else if (data.result) finish(resolve, data.result, false);
    };
    const onError = () => finish(reject, new Error('The analysis could not start in this browser.'), true);
    const timer = setTimeout(() => finish(reject, new Error('The local analysis timed out. Try again.'), true), 12000);
    signal?.addEventListener('abort', abort, { once: true });
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ id, input });
  });
}

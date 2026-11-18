import { evaluateAdaptiveStudy } from './adaptive-study.js';

self.addEventListener('message', event => {
  const { id, input } = event.data ?? {};
  if (!Number.isSafeInteger(id)) return;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    self.postMessage({ id, error: 'The forecast study needs a market snapshot.' });
    return;
  }
  try {
    self.postMessage({ id, result: evaluateAdaptiveStudy(input) });
  } catch {
    self.postMessage({ id, error: 'The forecast study could not evaluate this dataset.' });
  }
});

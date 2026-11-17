import { evaluateAdaptiveStudy } from './adaptive-study.js';

self.addEventListener('message', event => {
  const { id, input } = event.data ?? {};
  if (!Number.isSafeInteger(id) || !input) return;
  try {
    self.postMessage({ id, result: evaluateAdaptiveStudy(input) });
  } catch {
    self.postMessage({ id, error: 'The forecast study could not evaluate this dataset.' });
  }
});

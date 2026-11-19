import { atr, ema, rsi, sma } from './analytics.js';
import { validInstrument } from './preferences.js';

export const MAX_CUSTOM_STUDIES = 16;
export const MAX_CUSTOM_SYMBOLS = 30;
export const CUSTOM_COLORS = Object.freeze(['accent', 'gold', 'cyan', 'violet', 'up', 'down', 'text']);

export const CUSTOM_STUDY_TEMPLATES = Object.freeze([
  {
    name: 'EMA Spread (12 − 26)',
    formula: 'ema(close, 12) - ema(close, 26)',
    placement: 'pane',
    color: 'cyan',
    guides: [0],
  },
  {
    name: '20-Bar Z-Score',
    formula: '(close - sma(close, 20)) / stdev(close, 20)',
    placement: 'pane',
    color: 'violet',
    guides: [-2, 0, 2],
  },
  {
    name: 'Typical Price EMA 21',
    formula: 'ema(hlc3, 21)',
    placement: 'overlay',
    color: 'gold',
    guides: [],
  },
  {
    name: 'ATR % Volatility',
    formula: 'atr(14) / close * 100',
    placement: 'pane',
    color: 'up',
    guides: [],
  },
]);

export const CUSTOM_IMPORT_SAMPLE = Object.freeze({
  indicators: [
    {
      name: 'Fast Trend Ribbon Mid',
      formula: '(ema(close, 8) + ema(close, 21)) / 2',
      placement: 'overlay',
      color: 'cyan',
      guides: [],
      enabled: true,
    },
    {
      name: 'Price vs SMA-50 (%)',
      formula: '(close - sma(close, 50)) / sma(close, 50) * 100',
      placement: 'pane',
      color: 'gold',
      guides: [-5, 0, 5],
      enabled: true,
    },
  ],
  levels: [
    { label: 'Key watch resistance', price: 100000 },
    { label: 'Key watch support', price: 80000 },
  ],
  symbols: [
    { venue: 'binance', base: 'PEPE', quote: 'USDT', symbol: 'PEPEUSDT' },
  ],
});

const SERIES_VARS = new Set(['open', 'high', 'low', 'close', 'volume', 'hl2', 'hlc3', 'ohlc4']);
const FUNCTIONS = new Set(['sma', 'ema', 'wma', 'rsi', 'atr', 'stdev', 'highest', 'lowest', 'shift', 'abs', 'max', 'min', 'log', 'sqrt']);
const MAX_FORMULA_LENGTH = 280;
const MAX_TOKENS = 120;
const MAX_DEPTH = 16;
const MAX_LOOKBACK = 400;

function tokenize(source) {
  if (typeof source !== 'string') throw Error('Formula must be a text expression.');
  const text = source.trim();
  if (!text) throw Error('Enter a formula expression.');
  if (text.length > MAX_FORMULA_LENGTH) throw Error(`Formula exceeds ${MAX_FORMULA_LENGTH} characters.`);
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let end = i;
      let dots = 0;
      while (end < text.length && /[0-9.]/.test(text[end])) {
        if (text[end] === '.') dots++;
        end++;
      }
      const value = Number(text.slice(i, end));
      if (dots > 1 || !Number.isFinite(value)) throw Error(`Invalid number near "${text.slice(i, end)}".`);
      tokens.push({ type: 'num', value });
      i = end;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let end = i;
      while (end < text.length && /[a-zA-Z0-9_]/.test(text[end])) end++;
      tokens.push({ type: 'ident', value: text.slice(i, end).toLowerCase() });
      i = end;
      continue;
    }
    if ('+-*/(),'.includes(ch)) {
      tokens.push({ type: ch, value: ch });
      i++;
      continue;
    }
    throw Error(`Unsupported character "${ch}" in formula.`);
  }
  if (!tokens.length || tokens.length > MAX_TOKENS) throw Error('Formula is empty or too complex.');
  return tokens;
}

export function parseFormula(source) {
  const tokens = tokenize(source);
  let pos = 0;
  const peek = () => tokens[pos] ?? null;
  const consume = expected => {
    const token = tokens[pos];
    if (!token || (expected && token.type !== expected)) {
      throw Error(`Expected "${expected}" near "${token?.value ?? 'end of formula'}".`);
    }
    pos++;
    return token;
  };

  function parseExpr(depth) {
    if (depth > MAX_DEPTH) throw Error('Formula nesting is too deep.');
    let node = parseTerm(depth + 1);
    while (peek()?.type === '+' || peek()?.type === '-') {
      const op = consume().type;
      node = { type: 'bin', op, left: node, right: parseTerm(depth + 1) };
    }
    return node;
  }

  function parseTerm(depth) {
    if (depth > MAX_DEPTH) throw Error('Formula nesting is too deep.');
    let node = parseUnary(depth + 1);
    while (peek()?.type === '*' || peek()?.type === '/') {
      const op = consume().type;
      node = { type: 'bin', op, left: node, right: parseUnary(depth + 1) };
    }
    return node;
  }

  function parseUnary(depth) {
    if (peek()?.type === '-') {
      consume('-');
      return { type: 'neg', arg: parseUnary(depth + 1) };
    }
    if (peek()?.type === '+') {
      consume('+');
      return parseUnary(depth + 1);
    }
    return parsePrimary(depth + 1);
  }

  function parsePrimary(depth) {
    const token = peek();
    if (!token) throw Error('Unexpected end of formula.');
    if (token.type === 'num') {
      consume();
      return { type: 'num', value: token.value };
    }
    if (token.type === '(') {
      consume('(');
      const inner = parseExpr(depth + 1);
      consume(')');
      return inner;
    }
    if (token.type === 'ident') {
      consume();
      if (peek()?.type === '(') {
        if (!FUNCTIONS.has(token.value)) throw Error(`Unknown function "${token.value}()".`);
        consume('(');
        const args = [];
        if (peek()?.type !== ')') {
          args.push(parseExpr(depth + 1));
          while (peek()?.type === ',') {
            consume(',');
            args.push(parseExpr(depth + 1));
          }
        }
        consume(')');
        validateCall(token.value, args);
        return { type: 'call', name: token.value, args };
      }
      if (!SERIES_VARS.has(token.value)) throw Error(`Unknown variable "${token.value}". Use open, high, low, close, volume, hl2, hlc3 or ohlc4.`);
      return { type: 'var', name: token.value };
    }
    throw Error(`Unexpected token "${token.value}".`);
  }

  const ast = parseExpr(0);
  if (pos !== tokens.length) throw Error(`Unexpected token "${tokens[pos].value}".`);
  return ast;
}

function validateCall(name, args) {
  const arity = {
    atr: [1], abs: [1], log: [1], sqrt: [1],
    sma: [2], ema: [2], wma: [2], rsi: [2], stdev: [2], highest: [2], lowest: [2], shift: [2], max: [2], min: [2],
  }[name];
  if (!arity.includes(args.length)) throw Error(`${name}() expects ${arity[0]} argument${arity[0] > 1 ? 's' : ''}.`);
  const periodArg = name === 'atr' ? args[0] : ['sma', 'ema', 'wma', 'rsi', 'stdev', 'highest', 'lowest', 'shift'].includes(name) ? args[1] : null;
  if (periodArg) {
    if (periodArg.type !== 'num' || !Number.isInteger(periodArg.value) || periodArg.value < 1 || periodArg.value > MAX_LOOKBACK) {
      throw Error(`${name}() length must be a whole number between 1 and ${MAX_LOOKBACK}.`);
    }
  }
}

function weightedMA(values, period) {
  const denom = period * (period + 1) / 2;
  return values.map((_, i) => {
    if (i + 1 < period) return null;
    let sum = 0;
    for (let k = 0; k < period; k++) {
      const v = values[i - period + 1 + k];
      if (!Number.isFinite(v)) return null;
      sum += v * (k + 1);
    }
    return sum / denom;
  });
}

function rollingStdev(values, period) {
  return values.map((_, i) => {
    if (i + 1 < period) return null;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (!Number.isFinite(values[j])) return null;
      sum += values[j];
    }
    const mean = sum / period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (values[j] - mean) ** 2;
    return Math.sqrt(variance / period);
  });
}

function rollingExtremum(values, period, isMax) {
  return values.map((_, i) => {
    if (i + 1 < period) return null;
    let best = isMax ? -Infinity : Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      const v = values[j];
      if (!Number.isFinite(v)) return null;
      best = isMax ? Math.max(best, v) : Math.min(best, v);
    }
    return best;
  });
}

export function evaluateFormula(ast, bars) {
  const n = bars.length;
  function run(node) {
    if (node.type === 'num') return Array(n).fill(node.value);
    if (node.type === 'var') {
      switch (node.name) {
        case 'open': return bars.map(b => b.open);
        case 'high': return bars.map(b => b.high);
        case 'low': return bars.map(b => b.low);
        case 'close': return bars.map(b => b.close);
        case 'volume': return bars.map(b => b.volume);
        case 'hl2': return bars.map(b => (b.high + b.low) / 2);
        case 'hlc3': return bars.map(b => (b.high + b.low + b.close) / 3);
        case 'ohlc4': return bars.map(b => (b.open + b.high + b.low + b.close) / 4);
        default: return Array(n).fill(null);
      }
    }
    if (node.type === 'neg') return run(node.arg).map(v => Number.isFinite(v) ? -v : null);
    if (node.type === 'bin') {
      const L = run(node.left);
      const R = run(node.right);
      return L.map((l, i) => {
        const r = R[i];
        if (!Number.isFinite(l) || !Number.isFinite(r)) return null;
        if (node.op === '+') return l + r;
        if (node.op === '-') return l - r;
        if (node.op === '*') return l * r;
        return Math.abs(r) > 1e-12 ? l / r : null;
      });
    }
    if (node.type === 'call') {
      const name = node.name;
      if (name === 'atr') return atr(bars, node.args[0].value);
      if (name === 'abs') return run(node.args[0]).map(v => Number.isFinite(v) ? Math.abs(v) : null);
      if (name === 'log') return run(node.args[0]).map(v => Number.isFinite(v) && v > 0 ? Math.log(v) : null);
      if (name === 'sqrt') return run(node.args[0]).map(v => Number.isFinite(v) && v >= 0 ? Math.sqrt(v) : null);
      if (name === 'max' || name === 'min') {
        const A = run(node.args[0]), B = run(node.args[1]);
        return A.map((a, i) => Number.isFinite(a) && Number.isFinite(B[i]) ? (name === 'max' ? Math.max(a, B[i]) : Math.min(a, B[i])) : null);
      }
      const series = run(node.args[0]);
      const p = node.args[1].value;
      if (name === 'sma') return sma(series, p);
      if (name === 'ema') return ema(series, p);
      if (name === 'wma') return weightedMA(series, p);
      if (name === 'rsi') return rsi(series, p);
      if (name === 'stdev') return rollingStdev(series, p);
      if (name === 'highest') return rollingExtremum(series, p, true);
      if (name === 'lowest') return rollingExtremum(series, p, false);
      if (name === 'shift') return series.map((_, i) => i >= p ? series[i - p] : null);
    }
    return Array(n).fill(null);
  }
  return run(ast).map(v => Number.isFinite(v) ? v : null);
}

export function validateCustomStudy(raw) {
  if (!raw || typeof raw !== 'object') throw Error('Invalid custom indicator object.');
  const name = String(raw.name ?? '').trim().slice(0, 48);
  if (!name) throw Error('Custom indicator requires a name.');
  const formula = String(raw.formula ?? '').trim();
  parseFormula(formula);
  const id = typeof raw.id === 'string' && /^custom-[a-zA-Z0-9_-]{1,40}$/.test(raw.id)
    ? raw.id
    : 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) + '-' + Math.random().toString(36).slice(2, 6);
  const placement = raw.placement === 'pane' ? 'pane' : 'overlay';
  const color = CUSTOM_COLORS.includes(raw.color) ? raw.color : 'cyan';
  const guides = Array.isArray(raw.guides)
    ? [...new Set(raw.guides.map(Number).filter(Number.isFinite))].slice(0, 5)
    : [];
  return { id, name, formula, placement, color, guides, enabled: raw.enabled !== false };
}

export function sanitizeCustomStudies(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    try {
      const valid = validateCustomStudy(item);
      if (seen.has(valid.id)) continue;
      seen.add(valid.id);
      out.push(valid);
      if (out.length >= MAX_CUSTOM_STUDIES) break;
    } catch {}
  }
  return out;
}

export function evaluateCustomStudy(study, bars) {
  const ast = parseFormula(study.formula);
  const values = evaluateFormula(ast, bars);
  return {
    id: study.id,
    placement: study.placement,
    custom: true,
    series: [{ key: 'main', title: study.name, values, color: study.color, kind: 'line' }],
    guides: study.guides ?? [],
    levels: [],
    ready: values.some(Number.isFinite),
  };
}

export function parseAssistanceImport(rawText, defaultTime = Math.floor(Date.now() / 1000)) {
  const text = String(rawText ?? '').trim();
  if (!text) throw Error('Paste or choose a JSON or CSV file to import.');
  if (text.length > 250_000) throw Error('Import file is too large (max 250 KB).');

  const indicators = [];
  const levels = [];
  const symbols = [];

  if (text.startsWith('{') || text.startsWith('[')) {
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw Error('Invalid JSON syntax.'); }
    const pushIndicator = obj => indicators.push(validateCustomStudy(obj));
    const pushLevel = obj => {
      const price = Number(obj?.price);
      if (!Number.isFinite(price) || price <= 0) return;
      const timeRaw = obj?.time !== undefined ? (typeof obj.time === 'string' ? Math.floor(Date.parse(obj.time) / 1000) : Number(obj.time)) : defaultTime;
      const time = Number.isFinite(timeRaw) && timeRaw > 0 ? timeRaw : defaultTime;
      const type = obj?.type === 'label' ? 'label' : 'horizontal';
      const label = String(obj?.label ?? obj?.name ?? 'Imported level').trim().slice(0, 60);
      levels.push({ id: 'imp-' + Math.random().toString(36).slice(2, 10), type, points: [{ time, price }], label });
    };
    const pushSymbol = obj => {
      if (typeof obj === 'string') {
        const clean = obj.trim().toUpperCase();
        if (/^[A-Z0-9]{1,20}-USD$/.test(clean)) {
          const base = clean.slice(0, -4);
          symbols.push({ venue: 'coinbase', base, quote: 'USD', symbol: clean });
        } else if (/^[A-Z0-9]{1,25}USDT$/.test(clean)) {
          const base = clean.slice(0, -4);
          symbols.push({ venue: 'binance', base, quote: 'USDT', symbol: clean });
        } else if (/^[A-Z0-9]{1,20}$/.test(clean)) {
          symbols.push({ venue: 'binance', base: clean, quote: 'USDT', symbol: clean + 'USDT' });
        }
        return;
      }
      if (validInstrument(obj)) symbols.push({ venue: obj.venue, base: obj.base, quote: obj.quote, symbol: obj.symbol });
    };

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (typeof item === 'string') pushSymbol(item);
        else if (item?.formula) pushIndicator(item);
        else if (item?.price !== undefined) pushLevel(item);
        else if (item?.venue && item?.symbol) pushSymbol(item);
      }
    } else if (parsed && typeof parsed === 'object') {
      if (parsed.formula) pushIndicator(parsed);
      if (Array.isArray(parsed.indicators)) parsed.indicators.forEach(pushIndicator);
      if (Array.isArray(parsed.levels)) parsed.levels.forEach(pushLevel);
      if (Array.isArray(parsed.drawings)) parsed.drawings.forEach(pushLevel);
      if (Array.isArray(parsed.symbols)) parsed.symbols.forEach(pushSymbol);
    }
  } else {
    // Parse CSV lines: either "price,label" or "time,price,label" or symbol tickers
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      if (i === 0 && /^(price|time|date|symbol|label)/i.test(parts[0])) continue;
      if (parts.length === 1 && /^[A-Za-z0-9-]{2,25}$/.test(parts[0])) {
        const clean = parts[0].toUpperCase();
        if (clean.endsWith('-USD')) symbols.push({ venue: 'coinbase', base: clean.slice(0, -4), quote: 'USD', symbol: clean });
        else if (clean.endsWith('USDT')) symbols.push({ venue: 'binance', base: clean.slice(0, -4), quote: 'USDT', symbol: clean });
        else symbols.push({ venue: 'binance', base: clean, quote: 'USDT', symbol: clean + 'USDT' });
        continue;
      }
      const p0 = Number(parts[0]), p1 = Number(parts[1]);
      if (Number.isFinite(p0) && p0 > 0 && (!Number.isFinite(p1) || parts.length === 2)) {
        levels.push({
          id: 'imp-' + Math.random().toString(36).slice(2, 10),
          type: 'horizontal',
          points: [{ time: defaultTime, price: p0 }],
          label: (parts[1] || 'Imported level').slice(0, 60),
        });
      } else if (Number.isFinite(p1) && p1 > 0) {
        const parsedTime = /^\d{9,10}$/.test(parts[0]) ? Number(parts[0]) : Math.floor(Date.parse(parts[0]) / 1000);
        const time = Number.isFinite(parsedTime) && parsedTime > 0 ? parsedTime : defaultTime;
        levels.push({
          id: 'imp-' + Math.random().toString(36).slice(2, 10),
          type: 'label',
          points: [{ time, price: p1 }],
          label: (parts[2] || 'Imported marker').slice(0, 60),
        });
      }
    }
  }

  if (!indicators.length && !levels.length && !symbols.length) {
    throw Error('No valid indicators, chart levels, or assistance symbols were found in the import.');
  }
  return { indicators: indicators.slice(0, MAX_CUSTOM_STUDIES), levels: levels.slice(0, 30), symbols: symbols.slice(0, MAX_CUSTOM_SYMBOLS) };
}

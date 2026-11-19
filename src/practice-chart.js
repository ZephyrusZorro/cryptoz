import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts';
import { chartOptions, palette } from './theme.js';
import { pricePrecision } from './numbers.js';
import {axisPriceFormat} from './currency.js';

export function createPracticeChart(host, type, referencePrice, signal, native='USD') {
  const precision = type === 'candles' ? pricePrecision(referencePrice) : 2;
  const priceFormat=axisPriceFormat(precision,native);
  const options = chartOptions();
  const chart = createChart(host, {
    ...options, autoSize: true,
    timeScale: {
      ...options.timeScale, timeVisible: true, secondsVisible: false, rightOffset: 2,
      lockVisibleTimeRangeOnResize: true, minBarSpacing: 0.25,
    },
  });
  const colors = () => {
    const { up, down } = palette();
    return { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false };
  };
  const series = type === 'candles'
    ? chart.addSeries(CandlestickSeries, { ...colors(), priceFormat })
    : chart.addSeries(LineSeries, { color: palette().accent, lineWidth: 2, priceFormat });
  const benchmark = type === 'equity'
    ? chart.addSeries(LineSeries, { color: palette().gold, lineWidth: 2, lineStyle: 2, priceFormat })
    : null;
  const observer = new MutationObserver(() => {
    chart.applyOptions(chartOptions());
    const nextFormat=axisPriceFormat(precision,native);
    series.applyOptions({...(benchmark?{color:palette().accent}:colors()),priceFormat:nextFormat});
    benchmark?.applyOptions({color:palette().gold,priceFormat:nextFormat});
  });
  observer.observe(host.ownerDocument.documentElement, { attributes: true, attributeFilter: ['data-theme','data-currency-revision'] });
  signal.addEventListener('abort', () => { observer.disconnect(); chart.remove(); }, { once: true });
  return {
    setData(points, baseline) {
      series.setData(points);
      benchmark?.setData(baseline);
      chart.timeScale().fitContent();
    },
    reveal(bar, count) {
      series.update(bar);
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(-1, count - 65), to: count + 1 });
    },
  };
}

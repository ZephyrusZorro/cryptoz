// Keep this in sync with the layout query in phone-layout.css.
export const PHONE_LAYOUT = '(max-width: 700px), (max-width: 1000px) and (max-height: 500px)';

export function chartScrollOptions(mode, phone) {
  if (mode !== 'cursor') return false;
  if (!phone) return true;
  return { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false };
}

export function isChartTouch(start, touches) {
  if (touches.length > 1) return true;
  if (!start || !touches.length) return false;
  const x = Math.abs(touches[0].clientX - start.clientX);
  const y = Math.abs(touches[0].clientY - start.clientY);
  return x >= 5 && x > y;
}

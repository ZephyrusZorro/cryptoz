import assert from 'node:assert/strict';
import test from 'node:test';
import { chartScrollOptions, isChartTouch } from '../src/phone-layout.js';

test('phone charts retain horizontal pan and give vertical swipes to the page', () => {
  assert.deepEqual(chartScrollOptions('cursor',true), {
    mouseWheel:true, pressedMouseMove:true, horzTouchDrag:true, vertTouchDrag:false
  });
  assert.equal(chartScrollOptions('cursor',false),true);
  assert.equal(chartScrollOptions('trend',true),false);
});

test('only a horizontal drag or pinch can request older candles on a phone', () => {
  const start={clientX:200,clientY:150};
  assert.equal(isChartTouch(start,[{clientX:197,clientY:149}]),false);
  assert.equal(isChartTouch(start,[{clientX:210,clientY:185}]),false);
  assert.equal(isChartTouch(start,[{clientX:225,clientY:157}]),true);
  assert.equal(isChartTouch(start,[start,{clientX:250,clientY:150}]),true);
  assert.equal(isChartTouch(null,[start]),false);
});

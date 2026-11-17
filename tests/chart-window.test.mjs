import test from 'node:test';import assert from 'node:assert/strict';
import {rangeForPreset,zoomRange,windowInfo,classifyRange} from '../src/chart-window.js';
import {newsWindow} from '../src/news-window.js';
import {TerminalChart} from '../src/chart.js';
test('all history is the default; recent is bounded to actual available candles',()=>{
 assert.deepEqual(rangeForPreset(500),{from:-1,to:503});assert.deepEqual(rangeForPreset(500,'recent'),{from:400,to:503});
 assert.deepEqual(rangeForPreset(20,'recent'),{from:0,to:23});assert.equal(rangeForPreset(0),null);
});
test('zoom out reaches all available history without manufacturing data',()=>{
 let r={from:400,to:503};for(let i=0;i<8;i++)r=zoomRange(r,1.5,500);
 assert.deepEqual(r,{from:-1,to:503});const closer=zoomRange(r,2/3,500);assert.ok(closer.to-closer.from<504);assert.ok(closer.from>=-1&&closer.to<=503);
 assert.equal(zoomRange({from:NaN,to:1},1.5,500),null);assert.equal(closer.to,503,'zooming a live window keeps the latest candle visible');
});
test('gesture-created ranges are custom so a named preset can be selected again',()=>{
 assert.equal(classifyRange({from:-1,to:503},500),'all');assert.equal(classifyRange({from:400,to:503},500),'recent');
 assert.equal(classifyRange({from:420,to:455},500),'custom');assert.equal(classifyRange({from:300,to:403},500),'custom');
});
test('window labels use actual candle bounds',()=>{
 const bars=Array.from({length:500},(_,i)=>({time:1000+i*60}));const info=windowInfo(bars,{from:-1,to:503});assert.equal(info.visible,500);assert.equal(info.total,500);assert.equal(info.start,1000);assert.equal(info.end,30940);
 assert.equal(windowInfo([],null).visible,0);
});
test('news rendering is bounded, filtered and has truthful remaining counts',()=>{
 const news=Array.from({length:45},(_,i)=>({source:i%2?'CoinDesk':'Decrypt',title:'Bitcoin '+i}));
 const first=newsWindow(news,{limit:20});assert.equal(first.items.length,20);assert.equal(first.total,45);assert.equal(first.remaining,25);
 const filtered=newsWindow(news,{source:'CoinDesk',query:'BITCOIN',limit:5});assert.equal(filtered.items.length,5);assert.equal(filtered.total,22);
 assert.equal(newsWindow(news,{query:'unmatched'}).total,0);assert.ok(newsWindow(news,{limit:Infinity}).items.length<=20);
});
test('responsive chart sizing reapplies named windows and preserves custom intent',()=>{
 let fitted=0;const chart=new TerminalChart({host:{},workspace:{drawings:{}}});chart.bars=Array.from({length:500},(_,i)=>({time:1000+i}));chart.draw=()=>{};chart.chart={timeScale:()=>({fitContent(){fitted++;},getVisibleLogicalRange:()=>({from:400,to:503})})};chart.viewPreset='all';chart.resizeView();assert.equal(fitted,1);chart.viewPreset='custom';chart.resizeView();assert.equal(fitted,1);
});

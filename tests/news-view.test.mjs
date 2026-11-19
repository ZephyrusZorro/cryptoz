import test from 'node:test';
import assert from 'node:assert/strict';
import {renderNewsCards} from '../src/news-view.js';
import {newsWindow} from '../src/news-window.js';
test('the Home and News renderer returns attributed topic cards with a valid link',()=>{
 const html=renderNewsCards([{title:'Fed & market <update>',source:'Publisher & Co',url:'https://example.com/markets?x=1&y=2',publishedAt:'2026-11-17T22:40:00Z'}]);
 assert.match(html,/class="news-card"/);
 assert.match(html,/Fed &amp; market &lt;update&gt;/);
 assert.match(html,/Publisher &amp; Co/);
 assert.match(html,/href="https:\/\/example\.com\/markets\?x=1&amp;y=2"/);
 assert.match(html,/>MACRO</);
});
test('unusable source rows do not generate clickable news links',()=>{
 assert.equal(renderNewsCards([null,{}, {title:'Invalid publisher link',source:'Pub',url:'data:text/plain,not-a-headline'}]),'');
});
test('newsWindow supports impact priority sorting, HIGH_IMPACT filter and source filtering',()=>{
 const items=[
  {title:'Bitcoin minor update',source:'Decrypt',url:'https://decrypt.co/1',publishedAt:'2026-11-19T12:00:00Z',priority:25,impact:'normal'},
  {title:'SEC approves spot Ether staking ETF rules',source:'The Block',url:'https://www.theblock.co/post/1',publishedAt:'2026-11-19T10:00:00Z',priority:72,impact:'high',impactReason:'Regulatory / ETF',tier:'institutional'},
 ];
 assert.equal(newsWindow(items,{sort:'impact'}).items[0].source,'The Block');
 assert.equal(newsWindow(items,{sort:'latest'}).items[0].source,'Decrypt');
 assert.equal(newsWindow(items,{topic:'HIGH_IMPACT'}).total,1);
 assert.equal(newsWindow(items,{source:'The Block'}).total,1);
 const html=renderNewsCards([items[1]]);
 assert.match(html,/data-impact="high"/);
 assert.match(html,/High impact/);
 assert.match(html,/Institutional/);
});

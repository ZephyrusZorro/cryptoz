import test from 'node:test';
import assert from 'node:assert/strict';
import {renderNewsCards} from '../src/news-view.js';
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {closeToolMenus} from '../src/disclosure-menu.js';

test('outside interactions close other menus while preserving the active menu controls',()=>{
 const menu=target=>({open:true,contains:element=>element===target});
 const a=menu('draw'), b=menu('more');
 const root={querySelectorAll:()=>[a,b].filter(item=>item.open)};
 assert.equal(closeToolMenus(root,'more'),true);
 assert.equal(a.open,false);
 assert.equal(b.open,true);
 assert.equal(closeToolMenus(root,'outside'),true);
 assert.equal(closeToolMenus(root,'outside'),false);
});

test('Escape closes the menu and returns focus to its disclosure',()=>{
 let focused=0;
 const menu={open:true,querySelector:()=>({focus(){focused++;}})};
 assert.equal(closeToolMenus({querySelectorAll:()=>[menu]},null,{returnFocus:true}),true);
 assert.equal(menu.open,false);
 assert.equal(focused,1);
});

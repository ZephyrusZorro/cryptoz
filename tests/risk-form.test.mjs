import test from 'node:test';import assert from 'node:assert/strict';import {mountRiskCalculator} from '../src/risk-calculator.js';
test('editing risk inputs clears the previous calculated result and preserves the draft',()=>{
 const handlers={},form={addEventListener(k,f){handlers[k]=f;},removeEventListener(k){delete handlers[k];}},output={innerHTML:'',textContent:''};let saved=0;
 const controller=mountRiskCalculator({form,output,getInstrument:()=>({base:'BTC',quote:'USDT'}),onDraft:()=>saved++,readValues:()=>({side:'long',equity:'10000',riskPercent:'1',entry:'100',stop:'95',target:'110',feePercent:'.1'})});
 handlers.submit({preventDefault(){}});assert.match(output.innerHTML,/Break-even win rate/);handlers.input();assert.equal(saved,1);assert.match(output.textContent,/changed.*calculate again/i);controller.dispose();assert.equal(Object.keys(handlers).length,0);
});
test('risk form rejects blank numeric fields rather than treating them as zero',()=>{
 const form={addEventListener(){},removeEventListener(){}},output={};const controller=mountRiskCalculator({form,output,getInstrument:()=>({base:'BTC',quote:'USDT'}),onDraft(){},readValues:()=>({equity:'',riskPercent:'1',entry:'100',stop:'95',target:'110',feePercent:''})});controller.calculate();assert.match(output.textContent,/positive|valid|enter/i);controller.dispose();
});

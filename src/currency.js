import {asNumber} from './numbers.js';
import {price,compact,stamp,esc} from './ui.js';
import {RATES,validateRate} from './currency-data.js';

export const DISPLAY_CURRENCY_KEY = 'cryptoz.display-currency.v1';
export function createDisplayCurrency({now = Date.now} = {}) {
  let selected = 'USD';
  const rates = new Map();
  const current = pair => validateRate(pair, rates.get(pair), now());
  return {
    get selected(){return selected;},
    set(next){
      selected=next==='INR'?'INR':'USD';
      return selected;
    },
    accept(pair, value){
      const next=validateRate(pair,value,now());
      const prior=rates.get(pair);
      if(!next||prior&&next.at<prior.at)return false;
      rates.set(pair,next);
      return true;
    },
    current,
    quote(value,native='USD'){
      const amount=asNumber(value);
      if(amount===null||native===selected)return {amount,currency:native,converted:false};
      const usdPerTether=native==='USDT'?current('USDT-USD')?.rate:native==='USD'?1:null;
      const targetPerUsd=selected==='INR'?current('USD-INR')?.rate:1;
      const converted=amount*usdPerTether*targetPerUsd;
      return usdPerTether&&targetPerUsd&&Number.isFinite(converted)
        ? {amount:converted,currency:selected,converted:true}
        : {amount,currency:native,converted:false};
    }
  };
}

export const currency=createDisplayCurrency();
const unit = code => code==='USD'?'$':code==='INR'?'₹':'';
function format(value, code, render) {
  if(value===null)return '—';
  if(render===compact)return unit(code)+render(value)+(unit(code)?'':' '+code);
  return render(value,unit(code))+(unit(code)?'':' '+code);
}

export function displayPrice(value,native='USD'){
  const {amount,currency:code}=currency.quote(value,native);
  return format(amount,code,price);
}
export function displayCompact(value,native='USD'){
  const {amount,currency:code}=currency.quote(value,native);
  return format(amount,code,compact);
}
export function nativeAndDisplay(value,native='USD'){
  const converted=currency.quote(value,native);
  const amount=asNumber(value);
  return amount===null?'—':price(amount,'')+' '+native+(converted.converted?' · ≈ '+format(converted.amount,converted.currency,price):'');
}
function formatMoney(value,native,style){
  if(style==='native'){
    return currency.quote(value,native).converted ? price(value,'')+' '+native : '';
  }
  return style==='parallel'?nativeAndDisplay(value,native):style==='compact'?displayCompact(value,native):displayPrice(value,native);
}
export function moneyMarkup(value,native='USD',style='price'){
  const amount=asNumber(value);
  if(amount===null)return '—';
  return `<bdi data-fx-amount="${amount}" data-fx-native="${esc(native)}" data-fx-style="${esc(style)}">${esc(formatMoney(amount,native,style))}</bdi>`;
}
export function setMoneyText(node,value,native='USD',style='price'){
  if(!node)return;
  node=node.querySelector?.('[data-fx-amount]')??node;
  const amount=asNumber(value);
  if(node.dataset){
    node.dataset.fxAmount=amount??'';
    node.dataset.fxNative=native;
    node.dataset.fxStyle=style;
  }
  const label=formatMoney(amount,native,style);
  if(node.textContent!==label)node.textContent=label;
}
export function refreshMoney(root){
  for(const node of root.querySelectorAll('[data-fx-amount]')){
    const label=formatMoney(node.dataset.fxAmount,node.dataset.fxNative,node.dataset.fxStyle);
    if(node.textContent!==label)node.textContent=label;
  }
}
export function axisPriceFormat(precision,native){
  const {amount:factor,converted,currency:code}=currency.quote(1,native);
  if(!converted)return {type:'price',precision,minMove:10**-precision};
  return {type:'custom',minMove:10**-precision,formatter:value=>price(value*factor,unit(code))};
}
export function displayCurrencyStatus(){
  const fx=currency.current('USD-INR'),tether=currency.current('USDT-USD');
  const inr=currency.selected==='INR'
    ? fx ? `USD/INR ${fx.rate.toFixed(2)} · ${fx.observedAt} · ${RATES['USD-INR'].provider}.` : 'INR rate unavailable. Native prices are shown.'
    : 'USD display.';
  const bridge=tether
    ? `USDT/USD ${tether.rate.toFixed(5)} · ${stamp(tether.observedAt)} · ${RATES['USDT-USD'].provider}.`
    : 'USDT conversion unavailable. Native USDT is shown.';
  return `${inr} ${bridge}`;
}

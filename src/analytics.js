const validPeriod = p => { if (!Number.isInteger(p) || p < 1 || p > 500) throw Error('Period must be an integer from 1 to 500'); };
export function sma(values, period=20) {
 validPeriod(period); let sum=0,count=0;
 return values.map((v,i)=>{if(Number.isFinite(v)){sum+=v;count++;}if(i>=period&&Number.isFinite(values[i-period])){sum-=values[i-period];count--;}return i>=period-1&&count===period?sum/period:null;});
}
export function ema(values, period=20) {
 validPeriod(period); let previous=null,seed=[];const k=2/(period+1);
 return values.map(v=>{if(!Number.isFinite(v)){previous=null;seed=[];return null;}if(previous===null){seed.push(v);if(seed.length<period)return null;previous=seed.reduce((a,b)=>a+b,0)/period;}else previous=v*k+previous*(1-k);return previous;});
}
export function rsi(values,period=14) {
 validPeriod(period); const out=Array(values.length).fill(null);if(values.length<=period)return out;
 let gain=0,loss=0;for(let i=1;i<=period;i++){const d=values[i]-values[i-1];gain+=Math.max(d,0);loss+=Math.max(-d,0);}gain/=period;loss/=period;
 const value=()=>gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss);
 out[period]=value();for(let i=period+1;i<values.length;i++){const d=values[i]-values[i-1];gain=(gain*(period-1)+Math.max(d,0))/period;loss=(loss*(period-1)+Math.max(-d,0))/period;out[i]=value();}return out;
}
export function bollinger(values,period=20,multiplier=2) {
 const middle=sma(values,period),upper=[],lower=[];
 middle.forEach((m,i)=>{const sd=m===null?null:Math.sqrt(values.slice(i-period+1,i+1).reduce((s,v)=>s+(v-m)**2,0)/period);upper.push(sd===null?null:m+sd*multiplier);lower.push(sd===null?null:m-sd*multiplier);});return {middle,upper,lower};
}
export function macd(values,fast=12,slow=26,signalPeriod=9) {
 const f=ema(values,fast),s=ema(values,slow),line=values.map((_,i)=>f[i]===null||s[i]===null?null:f[i]-s[i]),signal=ema(line,signalPeriod);return {line,signal,histogram:line.map((v,i)=>v===null||signal[i]===null?null:v-signal[i])};
}
export function atr(bars,period=14) {
 validPeriod(period);let prev=null;return bars.map((b,i)=>{const tr=i===0?b.high-b.low:Math.max(b.high-b.low,Math.abs(b.high-bars[i-1].close),Math.abs(b.low-bars[i-1].close));if(i<period-1)return null;if(i===period-1){prev=bars.slice(0,period).reduce((s,x,j)=>s+(j===0?x.high-x.low:Math.max(x.high-x.low,Math.abs(x.high-bars[j-1].close),Math.abs(x.low-bars[j-1].close))),0)/period;}else prev=(prev*(period-1)+tr)/period;return prev;});
}
export function vwap(bars) {
 let day='',volume=0,value=0;return bars.map(b=>{const d=new Date(b.time*1000).toISOString().slice(0,10);if(d!==day){day=d;volume=0;value=0;}volume+=b.volume;value+=(b.high+b.low+b.close)/3*b.volume;return volume>0?value/volume:null;});
}
export function heikinAshi(bars) {
 const result=[];for(const b of bars){const p=result.at(-1),close=(b.open+b.high+b.low+b.close)/4,open=p?(p.open+p.close)/2:(b.open+b.close)/2;result.push({...b,open,close,high:Math.max(b.high,open,close),low:Math.min(b.low,open,close)});}return result;
}
export function normalizeCandles(bars) {
 const m=new Map();for(const b of bars){if(['time','open','high','low','close','volume'].every(k=>Number.isFinite(b[k]))&&Number.isInteger(b.time)&&b.time>0&&b.low>0&&b.volume>=0&&b.high>=Math.max(b.open,b.close,b.low)&&b.low<=Math.min(b.open,b.close)){m.set(b.time,b);}}return [...m.values()].sort((a,b)=>a.time-b.time);
}
export function planRisk({equity,riskPercent,entry,stop,target,side='long',feePercent=0.1}) {
 if(![equity,riskPercent,entry,stop,target,feePercent].every(Number.isFinite)||[equity,riskPercent,entry,stop,target].some(v=>v<=0)||riskPercent>100||feePercent<0||feePercent>10)throw Error('Enter positive values; risk 0–100% and fee 0–10%.');
 if(!['long','short'].includes(side)||(side==='long'&&!(stop<entry&&target>entry))||(side==='short'&&!(stop>entry&&target<entry)))throw Error('Long: stop < entry < target. Short: target < entry < stop.');
 const fees=(entry+stop)*feePercent/100,riskPerUnit=Math.abs(entry-stop)+fees,rewardPerUnit=Math.abs(target-entry)-(entry+target)*feePercent/100,budget=equity*riskPercent/100,quantity=budget/riskPerUnit;
 return {budget,quantity,notional:quantity*entry,rewardRisk:rewardPerUnit/riskPerUnit,potentialLoss:budget,potentialGain:quantity*rewardPerUnit,capitalExceeded:quantity*entry>equity};
}
export function technicalSummary(bars) {
 if(bars.length<50)return {ready:false};const c=bars.map(b=>b.close),last=c.at(-1),e20=ema(c,20).at(-1),e50=ema(c,50).at(-1),strength=rsi(c,14).at(-1),a=atr(bars,14).at(-1),m=macd(c).histogram.at(-1);
 return {ready:true,ema20:e20,ema50:e50,rsi:strength,atr:a,macd:m,trend:last>e20&&e20>e50?'Uptrend':last<e20&&e20<e50?'Downtrend':'Mixed trend',momentum:strength>=70?'Overbought':strength<=30?'Oversold':'Balanced',volatility:a/last*100};
}

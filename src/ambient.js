// Decorative only: a small, bounded canvas, independent of market rendering.
export function installAmbient(){
 const canvas=document.createElement('canvas');canvas.className='ambient-canvas';canvas.setAttribute('aria-hidden','true');document.body.prepend(canvas);
 const ctx=canvas.getContext('2d');if(!ctx)return ()=>canvas.remove();
 const motion=matchMedia('(prefers-reduced-motion: reduce)');let frame=0,last=0,width=0,height=0,dots=[],running=false;
 const allowed=()=>!document.hidden&&!motion.matches&&document.documentElement.dataset.motion!=='reduced'&&document.documentElement.dataset.ambient!=='off';
 const size=()=>{width=innerWidth;height=innerHeight;const dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);dots=Array.from({length:width<760?12:28},()=>({x:Math.random()*width,y:Math.random()*height,r:.7+Math.random()*1.3,v:.04+Math.random()*.1}));};
 const tick=time=>{if(!running)return;frame=requestAnimationFrame(tick);const step=width<760?66:40;if(time-last<step)return;const dt=Math.min(time-last,120);last=time;ctx.clearRect(0,0,width,height);const light=document.documentElement.dataset.theme==='light';ctx.fillStyle=light?'rgba(39,96,186,.24)':'rgba(170,198,255,.32)';for(const dot of dots){dot.y-=dot.v*dt;if(dot.y<0)dot.y=height;ctx.beginPath();ctx.arc(dot.x,dot.y,dot.r,0,Math.PI*2);ctx.fill();}};
 const sync=()=>{const next=allowed();if(next===running)return;running=next;if(running){last=0;frame=requestAnimationFrame(tick);}else{cancelAnimationFrame(frame);ctx.clearRect(0,0,width,height);}};
 size();sync();const observer=new MutationObserver(sync);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-motion','data-ambient']});const resize=()=>{size();sync();};window.addEventListener('resize',resize,{passive:true});document.addEventListener('visibilitychange',sync);motion.addEventListener('change',sync);
 return ()=>{running=false;cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',sync);motion.removeEventListener('change',sync);canvas.remove();};
}

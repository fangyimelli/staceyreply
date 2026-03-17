import { ema20 } from '../aggregation/timeframe';
import type { Annotation, DebugArtifacts, ExplainState, OhlcvBar } from '../types/domain';

const color: Record<string,string>={source:'#f59e0b',stopHunt:'#ef4444',point1:'#22c55e',point2:'#14b8a6',point3:'#0ea5e9',emaConfirm:'#a855f7',entry:'#4f46e5',stop:'#dc2626',tp30:'#16a34a',tp35:'#15803d',tp40:'#166534',tp50:'#14532d'};

export const renderChart = (canvas: HTMLCanvasElement, bars: OhlcvBar[], annotations: Annotation[], overlays: {previousClose?:number; hos?:number; los?:number; hod?:number; lod?:number}) => {
  const ctx=canvas.getContext('2d')!; const w=canvas.width, h=canvas.height; ctx.clearRect(0,0,w,h); ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h);
  const prices = bars.flatMap((b)=>[b.high,b.low]);
  Object.values(overlays).forEach((v)=>{ if(v!==undefined) prices.push(v); });
  const min=Math.min(...prices), max=Math.max(...prices); const y=(p:number)=>h-20-((p-min)/(max-min||1))*(h-40);
  const step=(w-60)/Math.max(1,bars.length);
  bars.forEach((b,i)=>{ const x=40+i*step+step/2; ctx.strokeStyle='#475569'; ctx.beginPath(); ctx.moveTo(x,y(b.high)); ctx.lineTo(x,y(b.low)); ctx.stroke(); const top=Math.min(y(b.open),y(b.close)); const bh=Math.max(2,Math.abs(y(b.open)-y(b.close))); ctx.fillStyle=b.close>=b.open?'#16a34a':'#dc2626'; ctx.fillRect(x-step*0.3,top,step*0.6,bh); });
  const e=ema20(bars); ctx.strokeStyle='#a855f7'; ctx.beginPath(); e.forEach((v,i)=>{const x=40+i*step+step/2; const yy=y(v); i?ctx.lineTo(x,yy):ctx.moveTo(x,yy);}); ctx.stroke();
  const drawH=(v:number,c:string,l:string)=>{ctx.strokeStyle=c; ctx.beginPath(); ctx.moveTo(30,y(v)); ctx.lineTo(w-5,y(v)); ctx.stroke(); ctx.fillStyle=c; ctx.fillText(l,5,y(v));};
  if(overlays.previousClose!==undefined) drawH(overlays.previousClose,'#6366f1','prev close'); if(overlays.hos!==undefined) drawH(overlays.hos,'#ef4444','HOS'); if(overlays.los!==undefined) drawH(overlays.los,'#10b981','LOS'); if(overlays.hod!==undefined) drawH(overlays.hod,'#f97316','HOD'); if(overlays.lod!==undefined) drawH(overlays.lod,'#0ea5e9','LOD');
  annotations.forEach((a)=>{ const i=bars.findIndex((b)=>b.time===a.time); const x=40+(i<0?0:i)*step+step/2; const yy=y(a.price); ctx.fillStyle=color[a.kind]??'#111'; ctx.beginPath(); ctx.arc(x,yy,4,0,Math.PI*2); ctx.fill(); });
};

export const bindAnnotationTooltip = (canvas: HTMLCanvasElement, bars: OhlcvBar[], annotations: Annotation[], tooltip: HTMLElement) => {
  canvas.onmousemove=(e)=>{ const r=canvas.getBoundingClientRect(); const x=e.clientX-r.left; const w=canvas.width; const step=(w-60)/Math.max(1,bars.length); const i=Math.max(0,Math.round((x-40-step/2)/step)); const t=bars[Math.min(i,bars.length-1)]?.time; const a=annotations.find((v)=>v.time===t); if(a){ tooltip.textContent=`${a.rule} | ${a.reasoning} | price ${a.price.toFixed(5)} | time ${a.time}`; } };
};

export const renderExplain = (el: HTMLElement, explain: ExplainState, pnl: number) => {
  el.innerHTML = `<h3>Explain Panel</h3><p>classification: ${explain.template}</p><p>current bias: ${explain.bias}</p><p>current stage: ${explain.stage}</p><p>entry allowed: ${explain.entryAllowed}</p><p>recommended target: ${explain.target ?? 'none'} pips</p><h4>why</h4><ul>${explain.reasons.map((r)=>`<li>${r}</li>`).join('')}</ul><h4>missing conditions</h4><ul>${explain.missing.map((m)=>`<li>${m}</li>`).join('')}</ul><p><b>Total PnL:</b> ${pnl.toFixed(1)} pips</p>`;
};


export const renderDebugArtifacts = (el: HTMLElement, debugMode: boolean, artifacts?: DebugArtifacts) => {
  if (!debugMode || !artifacts) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `<h3>Debug Panel (Intermediate Artifacts)</h3><pre>${JSON.stringify(artifacts, null, 2)}</pre>`;
};

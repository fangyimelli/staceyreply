const markerColor={source:'#2563eb',entry:'#16a34a',stop:'#dc2626',tp30:'#9333ea',tp35:'#a855f7',tp40:'#c026d3',tp50:'#db2777'};
export function renderCandlestickChart(canvas,candles,result,tooltip){
  const ctx=canvas.getContext('2d'); if(!ctx||!candles.length) return;
  const w=canvas.width,h=canvas.height,pad=40;
  const maxPrice=Math.max(...candles.map(c=>c.high),result.overlays.hod,...result.markers.map(m=>m.price));
  const minPrice=Math.min(...candles.map(c=>c.low),result.overlays.lod,...result.markers.map(m=>m.price));
  const priceToY=(p)=>h-pad-((p-minPrice)/(maxPrice-minPrice||1))*(h-pad*2);
  const candleW=Math.max(3,(w-pad*2)/candles.length*0.7);
  ctx.clearRect(0,0,w,h); ctx.fillStyle='#0b1220'; ctx.fillRect(0,0,w,h);
  candles.forEach((c,i)=>{const x=pad+((w-pad*2)/candles.length)*i; ctx.strokeStyle='#cbd5e1'; ctx.beginPath(); ctx.moveTo(x,priceToY(c.high)); ctx.lineTo(x,priceToY(c.low)); ctx.stroke(); const up=c.close>=c.open; ctx.fillStyle=up?'#22c55e':'#ef4444'; const y=priceToY(Math.max(c.open,c.close)); const bodyH=Math.max(1,Math.abs(priceToY(c.close)-priceToY(c.open))); ctx.fillRect(x-candleW/2,y,candleW,bodyH);});
  const drawHLine=(price,color,label)=>{const y=priceToY(price); ctx.strokeStyle=color; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(w-pad,y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle=color; ctx.fillText(label,w-pad+4,y+3);};
  ctx.strokeStyle='#f59e0b'; ctx.beginPath(); result.overlays.ema20.forEach((p,i)=>{const x=pad+((w-pad*2)/candles.length)*i; const y=priceToY(p); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}); ctx.stroke();
  drawHLine(result.overlays.previousClose,'#94a3b8','prev close'); drawHLine(result.overlays.hos,'#38bdf8','HOS'); drawHLine(result.overlays.los,'#0ea5e9','LOS'); drawHLine(result.overlays.hod,'#eab308','HOD'); drawHLine(result.overlays.lod,'#f97316','LOD');
  const markerPoints=result.markers.map((m,idx)=>{const x=pad+((w-pad*2)/candles.length)*Math.max(0,candles.length-1-idx); const y=priceToY(m.price); ctx.fillStyle=markerColor[m.kind]; ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2); ctx.fill(); return {...m,x,y};});
  canvas.onmousemove=(event)=>{const rect=canvas.getBoundingClientRect(); const mx=event.clientX-rect.left; const my=event.clientY-rect.top; const hit=markerPoints.find((m)=>Math.hypot(mx-m.x,my-m.y)<8); if(!hit){tooltip.style.display='none'; return;} tooltip.style.display='block'; tooltip.style.left=`${event.pageX+10}px`; tooltip.style.top=`${event.pageY+10}px`; tooltip.innerHTML=`<strong>${hit.ruleName}</strong><br/>Reasoning: ${hit.reasoning}<br/>Price: ${hit.price.toFixed(2)}<br/>Time: ${hit.time}`; };
}

function nyDate(ts){ return new Date(ts).toLocaleDateString('en-CA',{timeZone:'America/New_York'}); }
export function scanCandidateDates(candles){
  const byDate=new Map();
  candles.forEach((c)=>{const d=nyDate(c.time); byDate.set(d,[...(byDate.get(d)??[]),c]);});
  return Array.from(byDate.entries()).map(([date,dayCandles],idx)=>{const change=dayCandles.at(-1).close-dayCandles[0].open; const rule=Math.abs(change)>1?'FGD':'FRD'; return {date,rule,reason:`${rule} candidate by initial scan (day index ${idx+1}).`,needsPractice:true};});
}

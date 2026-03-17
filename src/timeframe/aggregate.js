const bucketSize = { "1m":1, "5m":5, "15m":15, "1h":60, "4h":240, "1D":1440 };
export function aggregateFrom1m(candles, timeframe) {
  const size = bucketSize[timeframe];
  if (size === 1) return candles;
  const out=[];
  for (let i=0;i<candles.length;i+=size){
    const slice=candles.slice(i,i+size); if(!slice.length) continue;
    out.push({time:slice[0].time,open:slice[0].open,high:Math.max(...slice.map(c=>c.high)),low:Math.min(...slice.map(c=>c.low)),close:slice[slice.length-1].close,volume:slice.reduce((s,c)=>s+c.volume,0)});
  }
  return out;
}

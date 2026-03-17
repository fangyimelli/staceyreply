import { aggregate, ema20 } from '../aggregation/timeframe.js';
import type { Annotation, CandidateDate, ExplainState, OhlcvBar, ReplyMode, StrategyLine, Trade } from '../types/domain.js';

const pip = (a: number, b: number) => (a - b) * 10000;
const day = (t: string) => t.slice(0, 10);
const hmNy = (t: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(t));

export const detectCandidates = (symbol: string, bars1m: OhlcvBar[]): CandidateDate[] => {
  const d = aggregate(bars1m, '1D'); const out: CandidateDate[] = [];
  for (let i=2;i<d.length;i++) {
    const d2=d[i-2], d1=d[i-1], d3=d[i];
    const body=Math.abs(pip(d1.close,d1.open)); const range=Math.abs(pip(d1.high,d1.low));
    if (d2.close<d2.open && d1.close>d1.open && body>=40 && body>=0.6*range) out.push({symbol,date:day(d3.time),type:'FGD',reason:'D-2 dump + D-1 bullish'});
    if (d2.close>d2.open && d1.close<d1.open && d1.high<=d2.high && d1.low>=d2.low) out.push({symbol,date:day(d3.time),type:'FRD',reason:'D-2 pump + D-1 bearish inside'});
  }
  return out;
};

export const evaluate = (line: StrategyLine, bars5m: OhlcvBar[], d: string, mode: ReplyMode, mEntry?: number, mExit?: number) => {
  const b = bars5m.filter((x)=>day(x.time)===d);
  const ny = b.filter((x)=>{const hm=hmNy(x.time); return hm>='07:00'&&hm<='11:00';});
  const source = line==='FGD'?Math.min(...ny.map((x)=>x.low)):Math.max(...ny.map((x)=>x.high));
  const srcBar = ny.find((x)=>line==='FGD'?x.low===source:x.high===source) ?? ny[0];
  const stopHunt = line==='FGD'?ny.some((x,i)=>i>0&&x.low<ny[i-1].low&&x.close>ny[i-1].low):ny.some((x,i)=>i>0&&x.high>ny[i-1].high&&x.close<ny[i-1].high);
  const e = ema20(b);
  const emaConfirm = b.some((x,i)=>line==='FGD'?x.close>e[i]:x.close<e[i]);
  const ix=b.findIndex((x)=>x.time===srcBar.time); const m30=b.slice(ix,ix+6);
  const move30=line==='FGD'?Math.max(...m30.map((x)=>pip(x.high,source))):Math.max(...m30.map((x)=>pip(source,x.low)));
  const p1=srcBar, p2=m30[2]??srcBar, p3=m30[3]??srcBar;
  const oneTwoThree=line==='FGD'?p3.low>=p1.low&&p2.high>p1.low:p3.high<=p1.high&&p2.low<p1.high;
  const engulf=line==='FGD'?ny.some((x,i)=>i>0&&x.close>ny[i-1].high):ny.some((x,i)=>i>0&&x.close<ny[i-1].low);
  let target: 30|35|40|50|null=null;
  if (emaConfirm&&move30>=15) target=30; if(target&&move30>=30) target=35; if(target&&move30>=30&&(stopHunt||engulf)) target=40; if(stopHunt&&oneTwoThree&&emaConfirm&&move30>=35) target=50;
  const entry=line==='FGD'?p2.high:p2.low, stop=line==='FGD'?p1.low:p1.high; const entryAllowed=Boolean(target)&&Math.abs(pip(entry,stop))<=20;
  let trade: Trade|undefined;
  if(mode==='auto'&&entryAllowed){ const tp=target?(line==='FGD'?entry+target/10000:entry-target/10000):entry; const ex=b[b.length-1].close; trade={side:line==='FGD'?'LONG':'SHORT',entry,exit:tp??ex,pnlPips:line==='FGD'?pip(tp??ex,entry):pip(entry,tp??ex)}; }
  if(mode==='manual'&&Number.isFinite(mEntry)&&Number.isFinite(mExit)&&mEntry!==undefined&&mExit!==undefined){ trade={side:line==='FGD'?'LONG':'SHORT',entry:mEntry,exit:mExit,pnlPips:line==='FGD'?pip(mExit,mEntry):pip(mEntry,mExit)}; }
  const explain: ExplainState={template:line,bias:line==='FGD'?'LONG':'SHORT',stage:entryAllowed?'Entry Qualified':'Building setup',missing:[!emaConfirm?'20EMA confirm missing':'',!stopHunt?'stop hunt missing':'',!oneTwoThree?'123 missing':'',Math.abs(pip(entry,stop))>20?'skip: stop too large':''].filter(Boolean),reasons:[`source=${line==='FGD'?'LOS':'HOS'}`,`move30=${move30.toFixed(1)} pips`,`rotation from ${hmNy(srcBar.time)} near :00/:15/:30/:45`],entryAllowed,target};
  const annotations: Annotation[]=[
    {kind:'source',time:p1.time,price:source,rule:'source',reasoning:'FGD=LOS FRD=HOS'},
    {kind:'stopHunt',time:p2.time,price:line==='FGD'?p2.low:p2.high,rule:'stop hunt',reasoning:'sweep then reclaim/drop'},
    {kind:'point1',time:p1.time,price:line==='FGD'?p1.low:p1.high,rule:'123-1',reasoning:'sweep'},
    {kind:'point2',time:p2.time,price:p2.close,rule:'123-2',reasoning:'reaction'},
    {kind:'point3',time:p3.time,price:p3.close,rule:'123-3',reasoning:'retest'},
    {kind:'emaConfirm',time:p2.time,price:p2.close,rule:'20EMA',reasoning:'close back over/under EMA'},
    {kind:'entry',time:p2.time,price:entry,rule:'entry',reasoning:'123 trigger'},
    {kind:'stop',time:p1.time,price:stop,rule:'stop',reasoning:'outside source'},
    {kind:'tp30',time:p2.time,price:line==='FGD'?entry+0.003:entry-0.003,rule:'TP30',reasoning:'tier'},
    {kind:'tp35',time:p2.time,price:line==='FGD'?entry+0.0035:entry-0.0035,rule:'TP35',reasoning:'tier'},
    {kind:'tp40',time:p2.time,price:line==='FGD'?entry+0.004:entry-0.004,rule:'TP40',reasoning:'tier'},
    {kind:'tp50',time:p2.time,price:line==='FGD'?entry+0.005:entry-0.005,rule:'TP50',reasoning:'tier'}
  ];
  return { explain, annotations, trade };
};

import { aggregate } from './aggregation/timeframe.js';
import { sampleBars } from './data/sampleData.js';
import { parseFile } from './parser/parseLocalData.js';
import { detectCandidates, evaluate } from './strategy/engine.js';
import type { CandidateDate, ReplyMode, StrategyLine, Timeframe } from './types/domain.js';
import { bindAnnotationTooltip, renderChart, renderExplain } from './ui/render.js';

const app = document.getElementById('app')!;
app.innerHTML = `
  <h2>Stacey Burke Day 3 Chart Reply</h2>
  <div id="controls"></div>
  <p id="candidates"></p>
  <div style="display:flex;gap:8px;">
    <div><canvas id="chart" width="1000" height="560" style="border:1px solid #ddd"></canvas><div id="tip"></div></div>
    <div id="explain" style="width:360px;border-left:1px solid #ddd;padding-left:8px"></div>
  </div>`;

let symbol='SAMPLE';
let bars1m=sampleBars();
let candidates: CandidateDate[]=detectCandidates(symbol,bars1m);
let tf: Timeframe='5m'; let line: StrategyLine='FGD'; let mode: ReplyMode='auto';
let enableFGD=true, enableFRD=true, practice=true, selectedDate=''; let totalPnl=0;

const controls=document.getElementById('controls')!;
controls.innerHTML=`<input id='files' type='file' multiple accept='.csv,.json'/> <select id='tf'><option>1m</option><option selected>5m</option><option>15m</option><option>1h</option><option>4h</option><option>1D</option></select> <select id='line'><option>FGD</option><option>FRD</option></select> <label><input id='fgd' type='checkbox' checked/>FGD</label> <label><input id='frd' type='checkbox' checked/>FRD</label> <label><input id='practice' type='checkbox' checked/>Practice mode</label> <select id='mode'><option value='auto'>Auto Reply</option><option value='manual'>Manual Reply</option></select> <input id='entry' placeholder='manual entry'/> <input id='exit' placeholder='manual exit'/> <select id='date'></select> <button id='apply'>Apply trade to PnL</button>`;

const refresh = () => {
  const bars=aggregate(bars1m, tf); const dates=[...new Set(bars.map((b)=>b.time.slice(0,10)))];
  const filtered = candidates.filter((c)=> (c.type==='FGD'?enableFGD:enableFRD)).map((c)=>c.date);
  const choices = practice?filtered:dates; if(!selectedDate) selectedDate=choices[0]??dates[0];
  const dateSel=document.getElementById('date') as HTMLSelectElement;
  dateSel.innerHTML=choices.map((d)=>`<option ${d===selectedDate?'selected':''}>${d}</option>`).join('');
  const evalResult=evaluate(line, aggregate(bars1m,'5m'), selectedDate, mode, Number((document.getElementById('entry') as HTMLInputElement).value), Number((document.getElementById('exit') as HTMLInputElement).value));
  const dayBars=bars.filter((b)=>b.time.slice(0,10)===selectedDate);
  const prevBars = bars.filter((b)=>b.time.slice(0,10)<selectedDate); const prev = prevBars.length ? prevBars[prevBars.length-1].close : undefined;
  const hos=Math.max(...dayBars.map((b)=>b.open)), los=Math.min(...dayBars.map((b)=>b.open)), hod=Math.max(...dayBars.map((b)=>b.high)), lod=Math.min(...dayBars.map((b)=>b.low));
  renderChart(document.getElementById('chart') as HTMLCanvasElement, dayBars, evalResult.annotations, { previousClose: prev, hos, los, hod, lod });
  bindAnnotationTooltip(document.getElementById('chart') as HTMLCanvasElement, dayBars, evalResult.annotations, document.getElementById('tip')!);
  renderExplain(document.getElementById('explain')!, evalResult.explain, totalPnl);
  (document.getElementById('apply') as HTMLButtonElement).onclick=()=>{ if(evalResult.trade){ totalPnl += evalResult.trade.pnlPips; refresh(); } };
  document.getElementById('candidates')!.textContent=`Detected candidate dates: ${candidates.map((c)=>`${c.date}(${c.type})`).join(', ')}`;
};

document.getElementById('files')!.addEventListener('change', async (e) => {
  const files=(e.target as HTMLInputElement).files; if(!files) return;
  const parsed=await Promise.all(Array.from(files).map(parseFile));
  const one=parsed[0]; symbol=one.symbol; bars1m=one.bars; candidates=parsed.flatMap((p)=>detectCandidates(p.symbol,p.bars)); selectedDate=''; refresh();
});
(document.getElementById('tf') as HTMLSelectElement).onchange=(e)=>{tf=(e.target as HTMLSelectElement).value as Timeframe; refresh();};
(document.getElementById('line') as HTMLSelectElement).onchange=(e)=>{line=(e.target as HTMLSelectElement).value as StrategyLine; refresh();};
(document.getElementById('mode') as HTMLSelectElement).onchange=(e)=>{mode=(e.target as HTMLSelectElement).value as ReplyMode; refresh();};
(document.getElementById('fgd') as HTMLInputElement).onchange=(e)=>{enableFGD=(e.target as HTMLInputElement).checked; refresh();};
(document.getElementById('frd') as HTMLInputElement).onchange=(e)=>{enableFRD=(e.target as HTMLInputElement).checked; refresh();};
(document.getElementById('practice') as HTMLInputElement).onchange=(e)=>{practice=(e.target as HTMLInputElement).checked; selectedDate=''; refresh();};
(document.getElementById('date') as HTMLSelectElement).onchange=(e)=>{selectedDate=(e.target as HTMLSelectElement).value; refresh();};
refresh();

import { renderExplainPanel } from './annotations/explainPanel.js';
import { parseFiles } from './parser/fileParser.js';
import { computeAutoPnl, computeManualPnl, runStrategy } from './strategy/engine.js';
import { aggregateFrom1m } from './timeframe/aggregate.js';
import { scanCandidateDates } from './timeframe/dateScan.js';
import { renderCandlestickChart } from './ui/chart.js';

const timeframeEl=document.querySelector('#timeframe');
const fileEl=document.querySelector('#fileInput');
const sampleBtn=document.querySelector('#sampleBtn');
const datesEl=document.querySelector('#dates');
const modeEl=document.querySelector('#mode');
const pnlEl=document.querySelector('#pnl');
const explainEl=document.querySelector('#explain');
const manualEntryEl=document.querySelector('#manualEntry');
const manualExitEl=document.querySelector('#manualExit');
const canvas=document.querySelector('#chart');
const tooltip=document.querySelector('#tooltip');
let datasets=[];

function render(){
  if(!datasets.length) return;
  const candles=aggregateFrom1m(datasets[0].candles1m,timeframeEl.value);
  const detected=scanCandidateDates(datasets[0].candles1m).filter((d)=>modeEl.value!=='practice'||d.needsPractice);
  datesEl.innerHTML=detected.map((d)=>`<div>${d.date} — ${d.rule} — ${d.reason}</div>`).join('');
  const result=runStrategy(candles);
  renderExplainPanel(explainEl,result);
  renderCandlestickChart(canvas,candles,result,tooltip);
  if(modeEl.value==='auto'){ pnlEl.textContent=`Auto Reply cumulative PnL: ${computeAutoPnl(result.markers).toFixed(2)}`; }
  else { const entry=Number(manualEntryEl.value||result.markers.find((m)=>m.kind==='entry')?.price||0); const exit=Number(manualExitEl.value||result.markers.find((m)=>m.kind==='tp40')?.price||0); pnlEl.textContent=`Manual Reply cumulative PnL: ${computeManualPnl(entry,exit).toFixed(2)}`; }
}

async function loadSample(){ const resp=await fetch('./sample/sample-1m.json'); const candles=await resp.json(); datasets=[{symbol:'SAMPLE',candles1m:candles,sourceName:'sample-1m.json'}]; render(); }
fileEl.addEventListener('change',async()=>{ if(!fileEl.files?.length) return; datasets=await parseFiles(fileEl.files); render();});
timeframeEl.addEventListener('change',render); modeEl.addEventListener('change',render); manualEntryEl.addEventListener('change',render); manualExitEl.addEventListener('change',render); sampleBtn.addEventListener('click',()=>void loadSample());
void loadSample();

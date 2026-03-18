import { useEffect, useMemo, useState } from 'react';
import { loadParsedDatasets } from './data/loadDatasets';
import { buildReplayAnalysis } from './strategy/engine';
import type { ParsedDataset, ReplayMode, Timeframe } from './types/domain';
import { ChartPanel } from './ui/ChartPanel';
import { ExplainPanel } from './ui/ExplainPanel';
import { nextStageStop } from './replay/engine';

const tfs: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];
const speedOptions = [150, 400, 800];
const ema = (values: number[], period: number) => {
  const k = 2 / (period + 1); let prev = values[0] ?? 0;
  return values.map((value) => (prev = value * k + prev * (1 - k)));
};

export default function App() {
  const [datasets] = useState<ParsedDataset[]>(loadParsedDatasets());
  const [datasetId, setDatasetId] = useState(datasets[0]?.datasetId ?? '');
  const [timeframe, setTimeframe] = useState<Timeframe>('5m');
  const [mode, setMode] = useState<ReplayMode>('pause');
  const [speed, setSpeed] = useState(400);
  const activeDataset = useMemo(() => datasets.find((item) => item.datasetId === datasetId) ?? datasets[0], [datasets, datasetId]);
  const [currentBarIndex, setCurrentBarIndex] = useState(0);
  const analysis = useMemo(() => buildReplayAnalysis(activeDataset.datasetId, activeDataset.symbol, activeDataset.bars1m, currentBarIndex), [activeDataset, currentBarIndex]);

  useEffect(() => { setCurrentBarIndex(analysis.replayStartIndex); }, [activeDataset.datasetId]);
  useEffect(() => {
    if (mode !== 'auto') return;
    const timer = window.setTimeout(() => {
      const stop = nextStageStop(analysis.eventLog, currentBarIndex);
      if (stop !== undefined && currentBarIndex + 1 >= stop) {
        setCurrentBarIndex(stop);
        return;
      }
      setCurrentBarIndex((value) => Math.min(value + 1, analysis.replayEndIndex));
    }, speed);
    return () => window.clearTimeout(timer);
  }, [mode, currentBarIndex, analysis.replayEndIndex, analysis.eventLog, speed]);

  const bars = analysis.timeframeBars[timeframe].filter((bar) => new Date(bar.time).getTime() <= new Date(activeDataset.bars1m[Math.min(currentBarIndex, activeDataset.bars1m.length - 1)]?.time ?? bar.time).getTime());
  const ema20 = ema(bars.map((bar) => bar.close), 20);
  const visibleAnnotations = analysis.annotations.filter((annotation) => annotation.visibleFromIndex <= currentBarIndex);

  const resetReplay = () => { setMode('pause'); setCurrentBarIndex(analysis.replayStartIndex); };
  const nextStep = () => {
    const stop = nextStageStop(analysis.eventLog, currentBarIndex);
    setMode('pause');
    setCurrentBarIndex(stop ?? Math.min(currentBarIndex + 1, analysis.replayEndIndex));
  };
  const playAuto = () => setMode('auto');
  const playSemi = () => { setMode('semi'); nextStep(); };

  return <div className="app-shell">
    <header>
      <h1>Stacey Reply Replay</h1>
      <p>Fixed-folder data source: <code>staceyreply/dist/mnt/data</code>. No upload UI, no broker API.</p>
    </header>
    <section className="control-grid">
      <label>Dataset<select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>{datasets.map((dataset) => <option key={dataset.datasetId} value={dataset.datasetId}>{dataset.symbol}{dataset.isSample ? ' (sample mode)' : ''}</option>)}</select></label>
      <label>Timeframe<select value={timeframe} onChange={(e) => setTimeframe(e.target.value as Timeframe)}>{tfs.map((tf) => <option key={tf} value={tf}>{tf}</option>)}</select></label>
      <label>Replay mode<select value={mode} onChange={(e) => setMode(e.target.value as ReplayMode)}><option value="pause">Pause</option><option value="auto">Auto Replay</option><option value="semi">Semi Replay</option></select></label>
      <label>Speed<select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>{speedOptions.map((option) => <option key={option} value={option}>{option} ms</option>)}</select></label>
      <button onClick={resetReplay}>Reset</button>
      <button onClick={playAuto}>Auto Replay</button>
      <button onClick={playSemi}>Semi Replay</button>
      <button onClick={nextStep}>Continue / Next step</button>
    </section>
    <section className="info-strip">
      <div>Trade day: {analysis.selectedTradeDay}</div>
      <div>Current stage: {analysis.stage}</div>
      <div>Can reply: {analysis.lastReplyEval.canReply ? 'Yes' : 'No'}</div>
      <div>Gate: {analysis.lastReplyEval.explanation}</div>
    </section>
    <main className="main-grid">
      <ChartPanel bars={bars} ema20={ema20} annotations={visibleAnnotations} replayMarkerTime={activeDataset.bars1m[currentBarIndex]?.time} previousClose={analysis.previousClose} hos={analysis.hos} los={analysis.los} hod={analysis.hod} lod={analysis.lod} statusBanner={analysis.statusBanner} />
      <ExplainPanel analysis={{ ...analysis, currentBarIndex }} />
    </main>
    <section className="footer-grid">
      <div><h3>Target ladder</h3><ul>{analysis.targetLevels.map((level) => <li key={level.tier}>TP{level.tier}: {level.hit ? 'hit' : 'pending'} @ {level.price.toFixed(4)} — {level.reason}</li>)}</ul></div>
      <div><h3>Diagnostics</h3><ul><li>Dataset file: {activeDataset.sourceLabel}</li><li>Bars loaded: {activeDataset.bars1m.length}</li><li>Replay range: {analysis.replayStartIndex} → {analysis.replayEndIndex}</li><li>Invalid messages: {analysis.invalidReasons.join(' | ') || 'none'}</li></ul></div>
    </section>
  </div>;
}

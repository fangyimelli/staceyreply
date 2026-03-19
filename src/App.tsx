import { useEffect, useMemo, useState } from 'react';
import { loadDatasetManifest, loadParsedDataset } from './data/loadDatasets';
import { buildReplayAnalysis, buildReplayDatasetAnalysis } from './strategy/engine';
import type { DatasetManifestItem, ParsedDataset, ReplayMode, Timeframe } from './types/domain';
import { ChartPanel } from './ui/ChartPanel';
import { ExplainPanel } from './ui/ExplainPanel';
import { nextStageStop } from './replay/engine';

const tfs: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];
const speedOptions = [150, 400, 800];

export default function App() {
  const [datasets] = useState<DatasetManifestItem[]>(loadDatasetManifest());
  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? '');
  const [activeDataset, setActiveDataset] = useState<ParsedDataset | null>(null);
  const [isDatasetLoading, setIsDatasetLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<Timeframe>('5m');
  const [mode, setMode] = useState<ReplayMode>('pause');
  const [speed, setSpeed] = useState(400);
  const [currentBarIndex, setCurrentBarIndex] = useState(0);

  useEffect(() => {
    const selectedDataset = datasets.find((item) => item.id === datasetId) ?? datasets[0];
    if (!selectedDataset) return;

    let cancelled = false;
    setIsDatasetLoading(true);
    setMode('pause');

    loadParsedDataset(selectedDataset)
      .then((dataset) => {
        if (cancelled) return;
        setActiveDataset(dataset);
        setCurrentBarIndex(0);
        setIsDatasetLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setActiveDataset(null);
        setIsDatasetLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [datasets, datasetId]);

  const datasetAnalysis = useMemo(() => {
    if (!activeDataset) return null;
    if (activeDataset.parseStatus === 'error') return null;
    return buildReplayDatasetAnalysis(activeDataset.datasetId, activeDataset.symbol, activeDataset.bars1m);
  }, [activeDataset]);

  const analysis = useMemo(() => {
    if (!datasetAnalysis) return null;
    return buildReplayAnalysis(datasetAnalysis, currentBarIndex);
  }, [datasetAnalysis, currentBarIndex]);

  useEffect(() => {
    if (!analysis || !activeDataset) return;
    setCurrentBarIndex(analysis.replayStartIndex);
  }, [activeDataset?.datasetId, analysis?.replayStartIndex]);

  useEffect(() => {
    if (!analysis) return;
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
  }, [mode, currentBarIndex, analysis, speed]);

  const currentReplayTime = activeDataset?.bars1m[Math.min(currentBarIndex, Math.max((activeDataset?.bars1m.length ?? 1) - 1, 0))]?.time;
  const bars = useMemo(() => {
    if (!analysis) return [];
    return analysis.timeframeBars[timeframe].filter((bar) => new Date(bar.time).getTime() <= new Date(currentReplayTime ?? bar.time).getTime());
  }, [analysis, timeframe, currentReplayTime]);
  const ema20 = useMemo(() => {
    const k = 2 / (20 + 1);
    let prev = bars[0]?.close ?? 0;
    return bars.map((bar) => (prev = bar.close * k + prev * (1 - k)));
  }, [bars]);
  const visibleAnnotations = analysis?.visibleAnnotations ?? [];

  const selectedDatasetLabel = datasets.find((item) => item.id === datasetId)?.label.replace(/\.(csv|json)$/i, '').toUpperCase() ?? 'UNKNOWN';

  if (!activeDataset || !analysis) {
    return <div className="app-shell">
      <header>
        <h1>Stacey Reply Replay</h1>
        <p>Fixed-folder data source: <code>staceyreply/dist/mnt/data</code>. No upload UI, no broker API.</p>
      </header>
      <section className="control-grid">
        <label>Dataset<select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>{datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.label.replace(/\.(csv|json)$/i, '').toUpperCase()}{dataset.isSample ? ' (sample mode)' : ''}</option>)}</select></label>
      </section>
      <section className="info-strip">
        <div>{isDatasetLoading ? 'Loading dataset…' : activeDataset?.parseStatus === 'error' ? 'Dataset parse failed.' : 'No dataset available.'}</div>
        {!isDatasetLoading && activeDataset?.parseStatus === 'error' ? <div>Why unavailable: {activeDataset.parseErrors[0] ?? 'Unknown parse error.'}</div> : null}
      </section>
      {!isDatasetLoading && activeDataset?.parseStatus === 'error' ? <section className="footer-grid">
        <div><h3>Diagnostics</h3><ul><li>Dataset: {selectedDatasetLabel}</li><li>Dataset file: {activeDataset.sourceLabel}</li><li>Parse status: {activeDataset.parseStatus}</li><li>Failure reasons: {activeDataset.parseErrors.join(' | ')}</li><li>Accepted formats / notes: {activeDataset.parseDiagnostics.join(' | ') || 'none'}</li></ul></div>
      </section> : null}
    </div>;
  }

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
      <label>Dataset<select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>{datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.label.replace(/\.(csv|json)$/i, '').toUpperCase()}{dataset.isSample ? ' (sample mode)' : ''}</option>)}</select></label>
      <label>Timeframe<select value={timeframe} onChange={(e) => setTimeframe(e.target.value as Timeframe)}>{tfs.map((tf) => <option key={tf} value={tf}>{tf}</option>)}</select></label>
      <label>Replay mode<select value={mode} onChange={(e) => setMode(e.target.value as ReplayMode)}><option value="pause">Pause</option><option value="auto">Auto Replay</option><option value="semi">Semi Replay</option></select></label>
      <label>Speed<select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>{speedOptions.map((option) => <option key={option} value={option}>{option} ms</option>)}</select></label>
      <button onClick={resetReplay}>Reset</button>
      <button onClick={playAuto}>Auto Replay</button>
      <button onClick={playSemi}>Semi Replay</button>
      <button onClick={nextStep}>Continue / Next step</button>
    </section>
    <section className="info-strip">
      <div>Dataset status: {isDatasetLoading ? 'loading' : 'ready'}</div>
      <div>Parse status: {activeDataset.parseStatus}</div>
      <div>Trade day: {analysis.selectedTradeDay}</div>
      <div>Current stage: {analysis.stage}</div>
      <div>Can reply now: {analysis.lastReplyEval.canReply ? 'Yes' : 'No'}</div>
      <div>Current gate: {analysis.lastReplyEval.explanation}</div>
    </section>
    <main className="main-grid">
      <ChartPanel bars={bars} ema20={ema20} annotations={visibleAnnotations} replayMarkerTime={currentReplayTime} previousClose={analysis.previousClose} hos={analysis.hos} los={analysis.los} hod={analysis.hod} lod={analysis.lod} statusBanner={analysis.statusBanner} />
      <ExplainPanel analysis={{ ...analysis, currentBarIndex }} />
    </main>
    <section className="footer-grid">
      <div><h3>Target ladder</h3><ul>{analysis.targetLevels.map((level) => <li key={level.tier}>TP{level.tier}: {level.hit ? 'hit' : 'pending'} @ {level.price.toFixed(4)} — {level.reason}</li>)}</ul></div>
      <div><h3>Diagnostics</h3><ul><li>Dataset file: {activeDataset.sourceLabel}</li><li>Bars loaded: {activeDataset.bars1m.length}</li><li>Parse errors: {activeDataset.parseErrors.join(' | ') || 'none'}</li><li>Accepted formats / notes: {activeDataset.parseDiagnostics.join(' | ') || 'none'}</li><li>Replay range: {analysis.replayStartIndex} → {analysis.replayEndIndex}</li><li>Invalid messages: {analysis.invalidReasons.join(' | ') || 'none'}</li></ul></div>
    </section>
  </div>;
}

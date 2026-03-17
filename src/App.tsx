import { useMemo, useState } from 'react';
import { aggregateFrom1m, ema } from './aggregation/timeframe';
import { sampleBars1m } from './data/sampleData';
import { parseFile } from './parser/parseLocalData';
import { detectCandidates, evaluateDay } from './strategy/engine';
import type { CandidateDate, ReplyMode, StrategyLine, SymbolDataset, Timeframe } from './types/domain';
import { ChartPanel } from './ui/ChartPanel';
import { ExplainPanel } from './ui/ExplainPanel';

const timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];

export default function App() {
  const [datasets, setDatasets] = useState<SymbolDataset[]>([{ symbol: 'SAMPLE', bars1m: sampleBars1m() }]);
  const [candidates, setCandidates] = useState<CandidateDate[]>([]);
  const [symbol, setSymbol] = useState('SAMPLE');
  const [tf, setTf] = useState<Timeframe>('5m');
  const [line, setLine] = useState<StrategyLine>('FGD');
  const [enableFGD, setEnableFGD] = useState(true);
  const [enableFRD, setEnableFRD] = useState(true);
  const [practiceOnly, setPracticeOnly] = useState(true);
  const [replyMode, setReplyMode] = useState<ReplyMode>('auto');
  const [manualEntry, setManualEntry] = useState('');
  const [manualExit, setManualExit] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [totalPnl, setTotalPnl] = useState(0);

  const active = datasets.find((d) => d.symbol === symbol) ?? datasets[0];
  const bars = useMemo(() => aggregateFrom1m(active.bars1m, tf), [active.bars1m, tf]);

  const dayChoices = useMemo(() => {
    const all = [...new Set(bars.map((b) => b.time.slice(0, 10)))];
    const filtered = candidates.filter((c) => c.symbol === symbol && ((c.type === 'FGD' && enableFGD) || (c.type === 'FRD' && enableFRD))).map((c) => c.date);
    return practiceOnly ? filtered : all;
  }, [bars, candidates, symbol, enableFGD, enableFRD, practiceOnly]);

  const day = selectedDate || dayChoices[0] || bars[bars.length - 1]?.time.slice(0, 10);
  const evalResult = useMemo(
    () => evaluateDay(line, aggregateFrom1m(active.bars1m, '5m'), day, replyMode, { entry: Number(manualEntry), exit: Number(manualExit) }),
    [line, active.bars1m, day, replyMode, manualEntry, manualExit]
  );
  const dayBars = bars.filter((b) => b.time.slice(0, 10) === day);
  const ema20 = ema(dayBars, 20);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const parsed = await Promise.all([...files].map(parseFile));
    setDatasets(parsed);
    setSymbol(parsed[0]?.symbol ?? 'SAMPLE');
    const allCandidates = parsed.flatMap((d) => detectCandidates(d.symbol, d.bars1m));
    setCandidates(allCandidates);
  };

  const runTrade = () => {
    if (evalResult.trade) setTotalPnl((v) => v + evalResult.trade!.pnlPips);
  };

  return (
    <div style={{ fontFamily: 'Inter, Arial, sans-serif', padding: 10 }}>
      <h2>Stacey Burke Day 3 Chart Reply (Local)</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input type="file" multiple accept=".csv,.json" onChange={(e) => void handleFiles(e.target.files)} />
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>{datasets.map((d) => <option key={d.symbol}>{d.symbol}</option>)}</select>
        <select value={tf} onChange={(e) => setTf(e.target.value as Timeframe)}>{timeframes.map((t) => <option key={t}>{t}</option>)}</select>
        <select value={line} onChange={(e) => setLine(e.target.value as StrategyLine)}>
          <option>FGD</option><option>FRD</option>
        </select>
        <label><input type="checkbox" checked={enableFGD} onChange={(e) => setEnableFGD(e.target.checked)} />FGD on</label>
        <label><input type="checkbox" checked={enableFRD} onChange={(e) => setEnableFRD(e.target.checked)} />FRD on</label>
        <label><input type="checkbox" checked={practiceOnly} onChange={(e) => setPracticeOnly(e.target.checked)} />Practice mode (filtered dates only)</label>
        <select value={day} onChange={(e) => setSelectedDate(e.target.value)}>{dayChoices.map((d) => <option key={d}>{d}</option>)}</select>
        <select value={replyMode} onChange={(e) => setReplyMode(e.target.value as ReplyMode)}><option value="auto">Auto Reply</option><option value="manual">Manual Reply</option></select>
        {replyMode === 'manual' && (
          <>
            <input placeholder="entry" value={manualEntry} onChange={(e) => setManualEntry(e.target.value)} />
            <input placeholder="exit" value={manualExit} onChange={(e) => setManualExit(e.target.value)} />
          </>
        )}
        <button onClick={runTrade}>Apply trade to PnL</button>
      </div>

      <p><strong>Detected candidate dates:</strong> {candidates.filter((c) => c.symbol === symbol).map((c) => `${c.date}(${c.type})`).join(', ') || 'none'}</p>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <ChartPanel
            bars={dayBars}
            ema20={ema20}
            annotations={evalResult.annotations}
            previousClose={evalResult.previousClose}
            hos={evalResult.hos}
            los={evalResult.los}
            hod={evalResult.hod}
            lod={evalResult.lod}
          />
        </div>
        <ExplainPanel explain={evalResult.explain} trade={evalResult.trade} totalPnl={totalPnl} />
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { sampleBars1m } from './data/sampleData';
import { parseFile } from './parser/parseLocalData';
import { formatFrontendScreenedPayload } from './result/formatter';
import type { FrontendScreenedPayload, ReplyMode, StrategyLine, SymbolDataset, Timeframe } from './types/domain';
import { ChartPanel } from './ui/ChartPanel';
import { ExplainPanel } from './ui/ExplainPanel';

const timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];

export default function App() {
  const [datasets, setDatasets] = useState<SymbolDataset[]>([{ symbol: 'SAMPLE', bars1m: sampleBars1m() }]);
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

  const formatted = useMemo(
    () =>
      formatFrontendScreenedPayload({
        datasets,
        lineFilter: { enableFGD, enableFRD },
        replyMode,
        symbol,
        timeframe: tf,
        line,
        practiceOnly,
        selectedDate,
        manualTrade: { entry: Number(manualEntry), exit: Number(manualExit) },
      }),
    [datasets, enableFGD, enableFRD, replyMode, symbol, tf, line, practiceOnly, selectedDate, manualEntry, manualExit]
  );
  const uiPayload: FrontendScreenedPayload = formatted.payload;
  const screenedResults = uiPayload.screenedResults;
  const day = uiPayload.selectedDay;

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const parsed = await Promise.all([...files].map(parseFile));
    const nextDatasets = parsed.map((file) => ({ symbol: file.symbol, bars1m: file.bars }));
    setDatasets(nextDatasets);
    setSymbol(nextDatasets[0]?.symbol ?? 'SAMPLE');
  };

  const runTrade = () => {
    if (uiPayload.dayAnalysis.trade) setTotalPnl((v) => v + uiPayload.dayAnalysis.trade.pnlPips);
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
        <select value={day} onChange={(e) => setSelectedDate(e.target.value)}>{uiPayload.dayChoices.map((d) => <option key={d}>{d}</option>)}</select>
        <select value={replyMode} onChange={(e) => setReplyMode(e.target.value as ReplyMode)}><option value="auto">Auto Reply</option><option value="manual">Manual Reply</option></select>
        {replyMode === 'manual' && (
          <>
            <input placeholder="entry" value={manualEntry} onChange={(e) => setManualEntry(e.target.value)} />
            <input placeholder="exit" value={manualExit} onChange={(e) => setManualExit(e.target.value)} />
          </>
        )}
        <button onClick={runTrade}>Apply trade to PnL</button>
      </div>

      <section style={{ margin: '12px 0' }}>
        <h3>Screened Results (Final)</h3>
        {screenedResults.filter((row) => row.symbol === uiPayload.activeSymbol).length === 0 ? (
          <p>No final screened results passed for this symbol.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Symbol</th>
                <th style={{ textAlign: 'left' }}>Candidate Date</th>
                <th style={{ textAlign: 'left' }}>Line Type</th>
                <th style={{ textAlign: 'left' }}>Validity</th>
                <th style={{ textAlign: 'left' }}>Replay Availability</th>
                <th style={{ textAlign: 'left' }}>Recommended Next Action</th>
                <th style={{ textAlign: 'left' }}>Current Target Tier</th>
              </tr>
            </thead>
            <tbody>
              {screenedResults.filter((row) => row.symbol === uiPayload.activeSymbol).map((row) => (
                <tr key={`${row.symbol}-${row.candidateDate}-${row.lineType}`}>
                  <td>{row.symbol}</td>
                  <td>{row.candidateDate}</td>
                  <td>{row.lineType}</td>
                  <td>{row.validity}</td>
                  <td>{row.replayAvailable ? 'available' : 'not available'}</td>
                  <td>{row.recommendedNextAction}</td>
                  <td>{row.currentTargetTier ? `${row.currentTargetTier} pips` : 'n/a'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <ChartPanel
            bars={uiPayload.dayBars}
            ema20={uiPayload.ema20}
            annotations={uiPayload.dayAnalysis.annotations}
            previousClose={uiPayload.dayAnalysis.previousClose}
            hos={uiPayload.dayAnalysis.hos}
            los={uiPayload.dayAnalysis.los}
            hod={uiPayload.dayAnalysis.hod}
            lod={uiPayload.dayAnalysis.lod}
          />
        </div>
        <ExplainPanel explain={uiPayload.dayAnalysis.explain} trade={uiPayload.dayAnalysis.trade} totalPnl={totalPnl} />
      </div>
    </div>
  );
}

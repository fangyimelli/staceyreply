import { useMemo, useState } from 'react';
import { aggregateFrom1m, ema } from './aggregation/timeframe';
import { sampleBars1m } from './data/sampleData';
import { parseFile } from './parser/parseLocalData';
import { detectCandidates, evaluateDay } from './strategy/engine';
import type { DebugArtifacts, ReplyMode, ScreenedResultRow, StrategyLine, SymbolDataset, Timeframe } from './types/domain';
import { ChartPanel } from './ui/ChartPanel';
import { formatDebugArtifacts, formatDebugPayload } from './ui/debugFormat';
import { ExplainPanel } from './ui/ExplainPanel';

const timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];

const buildScreenedResults = (
  datasets: SymbolDataset[],
  lineFilter: { enableFGD: boolean; enableFRD: boolean },
  replyMode: ReplyMode
): { rows: ScreenedResultRow[]; debugArtifacts: DebugArtifacts } => {
  const debugArtifacts: DebugArtifacts = {
    rawScanTraces: [],
    rejectedDates: [],
    internalRuleStates: [],
  };

  const rows = datasets.flatMap((dataset) => {
    const scanned = detectCandidates(dataset.symbol, dataset.bars1m);
    debugArtifacts.rawScanTraces.push(...scanned);

    return scanned.flatMap((candidate) => {
      const lineEnabled = (candidate.type === 'FGD' && lineFilter.enableFGD) || (candidate.type === 'FRD' && lineFilter.enableFRD);
      if (!lineEnabled) {
        debugArtifacts.rejectedDates.push({
          symbol: dataset.symbol,
          candidateDate: candidate.date,
          lineType: candidate.type,
          reason: `Filtered out: ${candidate.type} toggle is disabled`,
        });
        return [];
      }

      const dayEval = evaluateDay(candidate.type, aggregateFrom1m(dataset.bars1m, '5m'), candidate.date, replyMode, {
        entry: 0,
        exit: 0,
      });

      debugArtifacts.internalRuleStates.push({
        symbol: dataset.symbol,
        candidateDate: candidate.date,
        lineType: candidate.type,
        stage: dayEval.explain.stage,
        entryAllowed: dayEval.explain.entryAllowed,
        reasons: dayEval.explain.reasons,
        missingConditions: dayEval.explain.missingConditions,
      });

      const replayAvailable = dayEval.explain.entryAllowed;
      if (!replayAvailable) {
        debugArtifacts.rejectedDates.push({
          symbol: dataset.symbol,
          candidateDate: candidate.date,
          lineType: candidate.type,
          reason: `Rule state rejected: ${dayEval.explain.missingConditions.join(', ') || 'entry not qualified yet'}`,
        });
      }

      const validity: ScreenedResultRow['validity'] = replayAvailable ? 'pass' : 'fail';
      return [{
        symbol: dataset.symbol,
        candidateDate: candidate.date,
        lineType: candidate.type,
        validity,
        replayAvailable,
        recommendedNextAction: replayAvailable
          ? `Run ${replyMode === 'auto' ? 'Auto Reply' : 'Manual Reply'} replay`
          : 'Skip until setup conditions become valid',
        currentTargetTier: dayEval.explain.targetTier,
        debug: {
          scanReason: candidate.reason,
          rejectionReason: replayAvailable
            ? undefined
            : `Rule state rejected: ${dayEval.explain.missingConditions.join(', ') || 'entry not qualified yet'}`,
          ruleState: {
            stage: dayEval.explain.stage,
            entryAllowed: dayEval.explain.entryAllowed,
            reasons: dayEval.explain.reasons,
            missingConditions: dayEval.explain.missingConditions,
          },
        },
      }];
    });
  });

  return { rows: rows.filter((row) => row.validity === 'pass'), debugArtifacts };
};

export default function App() {
  const [datasets, setDatasets] = useState<SymbolDataset[]>([{ symbol: 'SAMPLE', bars1m: sampleBars1m() }]);
  const [symbol, setSymbol] = useState('SAMPLE');
  const [tf, setTf] = useState<Timeframe>('5m');
  const [line, setLine] = useState<StrategyLine>('FGD');
  const [enableFGD, setEnableFGD] = useState(true);
  const [enableFRD, setEnableFRD] = useState(true);
  const [practiceOnly, setPracticeOnly] = useState(true);
  const [replyMode, setReplyMode] = useState<ReplyMode>('auto');
  const [debugMode, setDebugMode] = useState(false);
  const [manualEntry, setManualEntry] = useState('');
  const [manualExit, setManualExit] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [totalPnl, setTotalPnl] = useState(0);

  const screenedState = useMemo(
    () => buildScreenedResults(datasets, { enableFGD, enableFRD }, replyMode),
    [datasets, enableFGD, enableFRD, replyMode]
  );
  const screenedResults = screenedState.rows;

  const active = datasets.find((d) => d.symbol === symbol) ?? datasets[0];
  const bars = useMemo(() => aggregateFrom1m(active.bars1m, tf), [active.bars1m, tf]);

  const dayChoices = useMemo(() => {
    const all = [...new Set(bars.map((b) => b.time.slice(0, 10)))];
    const filtered = screenedResults.filter((row) => row.symbol === symbol).map((row) => row.candidateDate);
    return practiceOnly ? filtered : all;
  }, [bars, screenedResults, symbol, practiceOnly]);

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
    const nextDatasets = parsed.map((file) => ({ symbol: file.symbol, bars1m: file.bars }));
    setDatasets(nextDatasets);
    setSymbol(nextDatasets[0]?.symbol ?? 'SAMPLE');
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
        <label><input type="checkbox" checked={debugMode} onChange={(e) => setDebugMode(e.target.checked)} />Debug mode</label>
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

      <section style={{ margin: '12px 0' }}>
        <h3>Screened Results (Final)</h3>
        {screenedResults.filter((row) => row.symbol === symbol).length === 0 ? (
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
              {screenedResults.filter((row) => row.symbol === symbol).map((row) => (
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

      {debugMode && (
        <section style={{ margin: '12px 0', padding: 10, border: '1px solid #cbd5e1', background: '#f8fafc' }}>
          <h3>Debug Panel (Intermediate Artifacts)</h3>
          <h4>Raw Scan Traces</h4>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{formatDebugArtifacts({ ...screenedState.debugArtifacts, rejectedDates: [], internalRuleStates: [] })}</pre>
          <h4>Rejected Dates</h4>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{formatDebugArtifacts({ ...screenedState.debugArtifacts, rawScanTraces: [], internalRuleStates: [] })}</pre>
          <h4>Internal Rule States</h4>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{formatDebugArtifacts({ ...screenedState.debugArtifacts, rawScanTraces: [], rejectedDates: [] })}</pre>
          <h4>Passed Rows (Debug Payload)</h4>
          {screenedResults.filter((row) => row.symbol === symbol).map((row) => (
            <pre key={`debug-${row.symbol}-${row.candidateDate}-${row.lineType}`} style={{ whiteSpace: 'pre-wrap' }}>
              {row.symbol} {row.candidateDate} {row.lineType}{'\n'}
              {formatDebugPayload(row.debug)}
            </pre>
          ))}
        </section>
      )}

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

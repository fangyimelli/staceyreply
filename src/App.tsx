import { useEffect, useMemo, useState } from 'react';
import { buildSampleDatasetsResponse, loadDatasets, toSymbolDatasets, type BackendDatasetsResponse } from './data/loadDatasets';
import { formatFrontendScreenedPayload } from './result/formatter';
import type { FrontendScreenedPayload, ReplayState, ReplyMode, StrategyLine, Timeframe } from './types/domain';
import { ChartPanel } from './ui/ChartPanel';
import { formatDebugArtifacts, formatDebugPayload } from './ui/debugFormat';
import { ExplainPanel } from './ui/ExplainPanel';

const timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];
const replaySpeedOptions = [250, 500, 1000, 1500] as const;

const clampIndex = (index: number, start: number, end: number) => {
  if (end < start) return start;
  return Math.min(Math.max(index, start), end);
};

export default function App() {
  const [datasetResponse, setDatasetResponse] = useState<BackendDatasetsResponse>(buildSampleDatasetsResponse());
  const [symbol, setSymbol] = useState('SAMPLE');
  const [tf, setTf] = useState<Timeframe>('5m');
  const [line, setLine] = useState<StrategyLine>('FGD');
  const [enableFGD, setEnableFGD] = useState(true);
  const [enableFRD, setEnableFRD] = useState(true);
  const [practiceOnly, setPracticeOnly] = useState(true);
  const [replyMode, setReplyMode] = useState<ReplyMode>('auto');
  const [debugMode] = useState(false);
  const [manualEntry, setManualEntry] = useState('');
  const [manualExit, setManualExit] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [totalPnl, setTotalPnl] = useState(0);
  const [replayState, setReplayState] = useState<ReplayState>({
    isPlaying: false,
    isFinished: false,
    currentBarIndex: 0,
    playSpeed: 500,
    replayStartIndex: 0,
    replayEndIndex: 0,
  });

  useEffect(() => {
    const loadBackendDatasets = async () => {
      const response = await loadDatasets();
      setDatasetResponse(response);
      setSymbol(response.datasets[0]?.pair ?? 'SAMPLE');
    };

    void loadBackendDatasets();
  }, []);

  const datasets = useMemo(() => toSymbolDatasets(datasetResponse), [datasetResponse]);
  const activeDataset = useMemo(() => datasetResponse.datasets.find((dataset) => dataset.pair === symbol) ?? datasetResponse.datasets[0], [datasetResponse, symbol]);

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
        replayWindow: {
          currentBarIndex: replayState.currentBarIndex,
          replayStartIndex: replayState.replayStartIndex,
          replayEndIndex: replayState.replayEndIndex,
        },
      }),
    [
      datasets,
      enableFGD,
      enableFRD,
      replyMode,
      symbol,
      tf,
      line,
      practiceOnly,
      selectedDate,
      manualEntry,
      manualExit,
      replayState.currentBarIndex,
      replayState.replayStartIndex,
      replayState.replayEndIndex,
    ]
  );
  const uiPayload: FrontendScreenedPayload = formatted.payload;
  const screenedResults = uiPayload.screenedResults;
  const importedSignalRows = activeDataset?.metadata.signals.length
    ? activeDataset.metadata.signals.map((signal) => ({
        pair: signal.pair,
        date: signal.date,
        signal: signal.signal,
        status: 'backend' as const,
      }))
    : uiPayload.importedSignalRows.filter((row) => row.pair === uiPayload.activeSymbol);
  const day = uiPayload.selectedDay;

  useEffect(() => {
    setReplayState((current) => {
      const nextStart = uiPayload.replayDefaults.replayStartIndex;
      const nextEnd = uiPayload.replayDefaults.replayEndIndex;
      const shouldReset =
        current.replayStartIndex !== nextStart ||
        current.replayEndIndex !== nextEnd ||
        current.currentBarIndex < nextStart ||
        current.currentBarIndex > nextEnd;

      if (!shouldReset) return current;

      return {
        ...current,
        isPlaying: false,
        isFinished: false,
        currentBarIndex: nextStart,
        replayStartIndex: nextStart,
        replayEndIndex: nextEnd,
      };
    });
  }, [uiPayload.replayDefaults.replayStartIndex, uiPayload.replayDefaults.replayEndIndex, day]);

  useEffect(() => {
    if (!replayState.isPlaying || replayState.isFinished) return undefined;

    const timer = window.setTimeout(() => {
      setReplayState((current) => {
        const nextIndex = current.currentBarIndex + 1;
        if (nextIndex >= current.replayEndIndex) {
          return {
            ...current,
            currentBarIndex: current.replayEndIndex,
            isPlaying: false,
            isFinished: true,
          };
        }

        return {
          ...current,
          currentBarIndex: nextIndex,
        };
      });
    }, replayState.playSpeed);

    return () => window.clearTimeout(timer);
  }, [replayState.isPlaying, replayState.isFinished, replayState.playSpeed, replayState.currentBarIndex, replayState.replayEndIndex]);

  const applyTradeToPnl = () => {
    const trade = uiPayload.dayAnalysis.trade;
    if (trade) setTotalPnl((value) => value + trade.pnlPips);
  };

  const startReplay = () => {
    setReplayState((current) => ({
      ...current,
      isPlaying: current.replayEndIndex > current.replayStartIndex,
      isFinished: current.currentBarIndex >= current.replayEndIndex,
    }));
  };

  const pauseReplay = () => {
    setReplayState((current) => ({ ...current, isPlaying: false }));
  };

  const finishReplay = () => {
    setReplayState((current) => ({
      ...current,
      isPlaying: false,
      isFinished: true,
      currentBarIndex: current.replayEndIndex,
    }));
  };

  const replayAgain = () => {
    setReplayState((current) => ({
      ...current,
      isPlaying: false,
      isFinished: false,
      currentBarIndex: current.replayStartIndex,
    }));
  };

  const stepReplay = (direction: -1 | 1) => {
    setReplayState((current) => {
      const nextIndex = clampIndex(current.currentBarIndex + direction, current.replayStartIndex, current.replayEndIndex);
      return {
        ...current,
        isPlaying: false,
        currentBarIndex: nextIndex,
        isFinished: nextIndex >= current.replayEndIndex,
      };
    });
  };

  return (
    <div style={{ fontFamily: 'Inter, Arial, sans-serif', padding: 10 }}>
      <h2>Stacey Burke Day 3 Chart Reply (Backend/API)</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <select value={symbol} onChange={(e: any) => setSymbol(e.target.value)}>{datasets.map((d) => <option key={d.symbol}>{d.symbol}</option>)}</select>
        <select value={tf} onChange={(e: any) => setTf(e.target.value as Timeframe)}>{timeframes.map((t) => <option key={t}>{t}</option>)}</select>
        <select value={line} onChange={(e: any) => setLine(e.target.value as StrategyLine)}>
          <option>FGD</option><option>FRD</option>
        </select>
        <label><input type="checkbox" checked={enableFGD} onChange={(e: any) => setEnableFGD(e.target.checked)} />FGD on</label>
        <label><input type="checkbox" checked={enableFRD} onChange={(e: any) => setEnableFRD(e.target.checked)} />FRD on</label>
        <label><input type="checkbox" checked={practiceOnly} onChange={(e: any) => setPracticeOnly(e.target.checked)} />Practice mode (filtered dates only)</label>
        <select value={day} onChange={(e: any) => setSelectedDate(e.target.value)}>{uiPayload.dayChoices.map((d) => <option key={d}>{d}</option>)}</select>
        <select value={replyMode} onChange={(e: any) => setReplyMode(e.target.value as ReplyMode)}><option value="auto">Auto Reply</option><option value="manual">Manual Reply</option></select>
        {replyMode === 'manual' && (
          <>
            <input placeholder="entry" value={manualEntry} onChange={(e: any) => setManualEntry(e.target.value)} />
            <input placeholder="exit" value={manualExit} onChange={(e: any) => setManualExit(e.target.value)} />
          </>
        )}
        <button onClick={startReplay} disabled={uiPayload.revealedBars.length === 0 || replayState.isPlaying}>開始播放</button>
        <button onClick={pauseReplay} disabled={!replayState.isPlaying}>暫停</button>
        <button onClick={finishReplay} disabled={uiPayload.revealedBars.length === 0 || replayState.isFinished}>結束</button>
        <button onClick={replayAgain} disabled={uiPayload.fullDayBars.length === 0}>重播</button>
        <button onClick={() => stepReplay(-1)} disabled={replayState.currentBarIndex <= replayState.replayStartIndex}>上一根</button>
        <button onClick={() => stepReplay(1)} disabled={replayState.currentBarIndex >= replayState.replayEndIndex}>下一根</button>
        <select value={replayState.playSpeed} onChange={(e: any) => setReplayState((current) => ({ ...current, playSpeed: Number(e.target.value) }))}>
          {replaySpeedOptions.map((speed) => <option key={speed} value={speed}>{speed} ms</option>)}
        </select>
        <button onClick={applyTradeToPnl}>Apply trade to PnL</button>
      </div>

      <section style={{ margin: '12px 0', padding: 10, background: '#f8fafc', border: '1px solid #cbd5e1' }}>
        <div><strong>資料來源:</strong> {datasetResponse.loadedFrom === 'backend-api' ? 'Backend API' : 'Sample mode fallback'}</div>
        <div><strong>目前商品:</strong> {activeDataset?.pair ?? 'n/a'} / {activeDataset?.metadata.timezone ?? 'America/New_York'}</div>
        <strong>Replay 範圍:</strong> {uiPayload.replayMeta.scopeLabel}
        <div>目前揭露進度: {uiPayload.revealedBars.length} / {uiPayload.fullDayBars.length} 根（index {replayState.currentBarIndex}）</div>
      </section>

      <section style={{ margin: '12px 0', display: 'grid', gap: 12 }}>
        <div>
          <h3>已匯入資料 / 候選清單</h3>
          {importedSignalRows.length === 0 ? (
            <p>No imported candidate rows found for this symbol.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Pair</th>
                  <th style={{ textAlign: 'left' }}>Date</th>
                  <th style={{ textAlign: 'left' }}>Signal</th>
                  <th style={{ textAlign: 'left' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {importedSignalRows.map((row) => (
                  <tr key={`${row.pair}-${row.date}-${row.signal}-${row.status ?? 'na'}`}>
                    <td>{row.pair}</td>
                    <td>{row.date}</td>
                    <td>{row.signal}</td>
                    <td>{row.status ?? 'n/a'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <h3>Screened Results (Final)</h3>
          {screenedResults.filter((row) => row.symbol === uiPayload.activeSymbol).length === 0 ? (
            <p>No final screened results passed for this symbol.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Symbol</th>
                  <th style={{ textAlign: 'left' }}>Candidate Date</th>
                  <th style={{ textAlign: 'left' }}>Signal (FGD/FRD)</th>
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
        </div>
      </section>

      {debugMode && (
        <section style={{ margin: '12px 0', padding: 10, border: '1px solid #cbd5e1', background: '#f8fafc' }}>
          <h3>Debug Panel (Intermediate Artifacts)</h3>
          <h4>Raw Scan Traces</h4>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{formatDebugArtifacts({ rawScanTraces: formatted.debug.candidatesBySymbol[symbol] ?? [], rejectedDates: [], internalRuleStates: [] })}</pre>
          <h4>Rejected Dates</h4>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{formatDebugArtifacts({ rawScanTraces: [], rejectedDates: [], internalRuleStates: [] })}</pre>
          <h4>Internal Rule States</h4>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{formatDebugArtifacts({ rawScanTraces: [], rejectedDates: [], internalRuleStates: [] })}</pre>
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
            bars={uiPayload.revealedBars}
            ema20={uiPayload.revealedEma20}
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

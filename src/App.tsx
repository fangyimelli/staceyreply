import { useEffect, useMemo, useState } from 'react';
import { buildSampleDatasetsResponse, loadDatasets, toSymbolDatasets, type BackendDatasetsResponse } from './data/loadDatasets';
import { formatFrontendScreenedPayload } from './result/formatter';
import { buildReplayDayAnalysis, buildStaticSymbolAnalysis, resolveSelectedDay } from './strategy/precompute';
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
  const activeDataset = useMemo(() => datasets.find((dataset) => dataset.symbol === symbol) ?? datasets[0], [datasets, symbol]);
  const activeRecord = useMemo(() => datasetResponse.datasets.find((dataset) => dataset.pair === symbol) ?? datasetResponse.datasets[0], [datasetResponse, symbol]);
  const hasReplayableBars = activeDataset?.bars1m.length > 0;

  const staticAnalysisBySymbol = useMemo(
    () => Object.fromEntries(
      datasets.map((dataset) => [
        dataset.symbol,
        buildStaticSymbolAnalysis(dataset, replyMode, { enableFGD, enableFRD }),
      ]),
    ),
    [datasets, replyMode, enableFGD, enableFRD],
  );

  const importedDates = useMemo(() => (activeDataset?.importedSignals ?? []).map((row) => row.date), [activeDataset]);
  const screenedDatesForActive = useMemo(
    () => (staticAnalysisBySymbol[activeDataset?.symbol ?? '']?.candidateAnalysis ?? [])
      .filter((analysis) => analysis.dayAnalysis.explain.entryAllowed)
      .map((analysis) => analysis.candidate.date),
    [staticAnalysisBySymbol, activeDataset],
  );
  const resolvedSelection = useMemo(
    () => resolveSelectedDay({
      dataset: activeDataset,
      importedDates,
      timeframe: tf,
      practiceOnly,
      screenedDates: screenedDatesForActive,
      requestedDate: selectedDate,
    }),
    [activeDataset, importedDates, tf, practiceOnly, screenedDatesForActive, selectedDate],
  );

  const replayDayAnalysis = useMemo(
    () => buildReplayDayAnalysis({
      dataset: activeDataset,
      selectedDay: resolvedSelection.selectedDay,
      line,
      replyMode,
      manualTrade: { entry: Number(manualEntry), exit: Number(manualExit) },
    }),
    [activeDataset, resolvedSelection.selectedDay, line, replyMode, manualEntry, manualExit],
  );

  const formatted = useMemo(
    () =>
      formatFrontendScreenedPayload({
        datasets,
        staticAnalysisBySymbol,
        replyMode,
        symbol,
        timeframe: tf,
        practiceOnly,
        selectedDay: resolvedSelection.selectedDay,
        replayDayAnalysis,
        currentBarIndex: replayState.currentBarIndex,
      }),
    [datasets, staticAnalysisBySymbol, replyMode, symbol, tf, practiceOnly, resolvedSelection.selectedDay, replayDayAnalysis, replayState.currentBarIndex],
  );
  const uiPayload: FrontendScreenedPayload = formatted.payload;
  const screenedResults = uiPayload.screenedResults;
  const importedSignalRows = uiPayload.importedSignalRows;
  const day = uiPayload.selectedDay;

  useEffect(() => {
    setReplayState((current) => {
      const nextStart = replayDayAnalysis?.replayStartIndex ?? 0;
      const nextEnd = replayDayAnalysis?.replayEndIndex ?? 0;
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
  }, [replayDayAnalysis?.key]);

  useEffect(() => {
    if (!replayState.isPlaying || replayState.isFinished || !hasReplayableBars) return undefined;

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
  }, [replayState.isPlaying, replayState.isFinished, replayState.playSpeed, replayState.currentBarIndex, replayState.replayEndIndex, hasReplayableBars]);

  const applyTradeToPnl = () => {
    const trade = uiPayload.dayAnalysis.trade;
    if (trade) setTotalPnl((value) => value + trade.pnlPips);
  };

  const startReplay = () => {
    if (!hasReplayableBars) return;
    setReplayState((current) => ({
      ...current,
      isPlaying: current.replayEndIndex > current.replayStartIndex,
      isFinished: current.currentBarIndex >= current.replayEndIndex,
    }));
  };

  const pauseReplay = () => setReplayState((current) => ({ ...current, isPlaying: false }));

  const finishReplay = () => {
    if (!hasReplayableBars) return;
    setReplayState((current) => ({
      ...current,
      isPlaying: false,
      isFinished: true,
      currentBarIndex: current.replayEndIndex,
    }));
  };

  const replayAgain = () => {
    if (!hasReplayableBars) return;
    setReplayState((current) => ({
      ...current,
      isPlaying: false,
      isFinished: false,
      currentBarIndex: current.replayStartIndex,
    }));
  };

  const stepReplay = (direction: -1 | 1) => {
    if (!hasReplayableBars) return;
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

  const importedFields = activeRecord?.metadata.importedFields ?? [];
  const derivedFields = activeRecord?.metadata.derivedFields ?? [];
  const barsStatusLabel = activeDataset?.bars1mStatus === 'replayable-real'
    ? '真實 1m bars（可回放）'
    : activeDataset?.bars1mStatus === 'sample-synthetic'
      ? 'sample/synthetic bars（僅本地 fallback）'
      : '僅 metadata 摘要（不可回放）';

  return (
    <div style={{ fontFamily: 'Inter, Arial, sans-serif', padding: 10 }}>
      <h2>Stacey Burke Day 3 Chart Reply</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <select value={symbol} onChange={(e: any) => setSymbol(e.target.value)}>{datasets.map((d) => <option key={d.symbol}>{d.symbol}</option>)}</select>
        <select value={tf} onChange={(e: any) => setTf(e.target.value as Timeframe)} disabled={!hasReplayableBars}>{timeframes.map((t) => <option key={t}>{t}</option>)}</select>
        <select value={line} onChange={(e: any) => setLine(e.target.value as StrategyLine)} disabled={!hasReplayableBars}>
          <option>FGD</option><option>FRD</option>
        </select>
        <label><input type="checkbox" checked={enableFGD} onChange={(e: any) => setEnableFGD(e.target.checked)} disabled={!hasReplayableBars} />FGD on</label>
        <label><input type="checkbox" checked={enableFRD} onChange={(e: any) => setEnableFRD(e.target.checked)} disabled={!hasReplayableBars} />FRD on</label>
        <label><input type="checkbox" checked={practiceOnly} onChange={(e: any) => setPracticeOnly(e.target.checked)} />Practice mode (filtered dates only)</label>
        <select value={day} onChange={(e: any) => setSelectedDate(e.target.value)}>{uiPayload.dayChoices.map((d) => <option key={d}>{d}</option>)}</select>
        <select value={replyMode} onChange={(e: any) => setReplyMode(e.target.value as ReplyMode)} disabled={!hasReplayableBars}><option value="auto">Auto Reply</option><option value="manual">Manual Reply</option></select>
        {replyMode === 'manual' && (
          <>
            <input placeholder="entry" value={manualEntry} onChange={(e: any) => setManualEntry(e.target.value)} disabled={!hasReplayableBars} />
            <input placeholder="exit" value={manualExit} onChange={(e: any) => setManualExit(e.target.value)} disabled={!hasReplayableBars} />
          </>
        )}
        <button onClick={startReplay} disabled={!hasReplayableBars || uiPayload.revealedBars.length === 0 || replayState.isPlaying}>開始播放</button>
        <button onClick={pauseReplay} disabled={!replayState.isPlaying}>暫停</button>
        <button onClick={finishReplay} disabled={!hasReplayableBars || uiPayload.revealedBars.length === 0 || replayState.isFinished}>結束</button>
        <button onClick={replayAgain} disabled={!hasReplayableBars || uiPayload.fullDayBars.length === 0}>重播</button>
        <button onClick={() => stepReplay(-1)} disabled={!hasReplayableBars || replayState.currentBarIndex <= replayState.replayStartIndex}>上一根</button>
        <button onClick={() => stepReplay(1)} disabled={!hasReplayableBars || replayState.currentBarIndex >= replayState.replayEndIndex}>下一根</button>
        <select value={replayState.playSpeed} onChange={(e: any) => setReplayState((current) => ({ ...current, playSpeed: Number(e.target.value) }))} disabled={!hasReplayableBars}>
          {replaySpeedOptions.map((speed) => <option key={speed} value={speed}>{speed} ms</option>)}
        </select>
        <button onClick={applyTradeToPnl} disabled={!hasReplayableBars}>Apply trade to PnL</button>
      </div>

      <section style={{ margin: '12px 0', padding: 10, background: '#f8fafc', border: '1px solid #cbd5e1' }}>
        <div><strong>資料來源:</strong> {datasetResponse.loadedFrom === 'backend-api' ? 'Backend API' : 'Sample mode fallback'}</div>
        <div><strong>目前商品:</strong> {activeDataset?.symbol ?? 'n/a'} / {activeDataset?.timezone ?? 'America/New_York'}</div>
        <div><strong>1m bars 狀態:</strong> {barsStatusLabel}</div>
        <div><strong>原始匯入欄位:</strong> {importedFields.join(', ') || 'pair, date, signal'}</div>
        <div><strong>前端推導欄位:</strong> {derivedFields.join(', ') || 'candidate classification, rule-traceable analysis'}</div>
        <strong>Replay 範圍:</strong> {hasReplayableBars ? uiPayload.replayMeta.scopeLabel : '尚無真實 1m bars，僅顯示匯入 metadata 摘要。'}
        <div>目前揭露進度: {uiPayload.revealedBars.length} / {uiPayload.fullDayBars.length} 根（index {replayState.currentBarIndex}）</div>
      </section>

      <section style={{ margin: '12px 0', display: 'grid', gap: 12 }}>
        <div>
          <h3>原始匯入 metadata</h3>
          <p style={{ marginTop: 0, color: '#475569' }}>這裡只列出後台匯入的 pair/date/signal 摘要，不代表完整 intraday chart 已可用。</p>
          {importedSignalRows.length === 0 ? (
            <p>No backend-imported candidate rows were provided for this symbol.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Pair</th>
                  <th style={{ textAlign: 'left' }}>Date</th>
                  <th style={{ textAlign: 'left' }}>Signal</th>
                  <th style={{ textAlign: 'left' }}>Status</th>
                  <th style={{ textAlign: 'left' }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {importedSignalRows.map((row) => (
                  <tr key={`${row.pair}-${row.date}-${row.signal}-${row.status ?? 'na'}`}>
                    <td>{row.pair}</td>
                    <td>{row.date}</td>
                    <td>{row.signal}</td>
                    <td>{row.status ?? 'n/a'}</td>
                    <td>{row.notes ?? 'raw imported summary'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <h3>前端推導候選 / 分析結果</h3>
          <p style={{ marginTop: 0, color: '#475569' }}>以下結果只會在存在 replayable 1m bars 或 sample/synthetic fallback 時產生，避免和原始匯入欄位混淆。</p>
          {!hasReplayableBars ? (
            <p>目前後台只提供 metadata 摘要；不顯示假 intraday chart，也不執行 replay 分析。</p>
          ) : screenedResults.filter((row) => row.symbol === uiPayload.activeSymbol).length === 0 ? (
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
            emptyStateTitle={hasReplayableBars ? 'Replay chart unavailable' : '尚未提供可回放真實 1m bars'}
            emptyStateBody={hasReplayableBars ? '目前選取日期沒有可繪製的 replay bars。' : '目前資料只包含原始匯入 metadata，前端不再用 synthetic bars 假裝成完整 intraday chart。若要啟用圖表與 replay，backend 必須提供真實 1m bars contract。'}
          />
        </div>
        <ExplainPanel explain={uiPayload.dayAnalysis.explain} trade={uiPayload.dayAnalysis.trade} totalPnl={totalPnl} />
      </div>
    </div>
  );
}

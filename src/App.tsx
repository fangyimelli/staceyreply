import React, { useEffect, useMemo, useState } from "react";
import { loadDatasetManifest, loadParsedDataset } from "./data/loadDatasets";
import { nextStageStop } from "./replay/engine";
import {
  buildReplayAnalysis,
  buildReplayDatasetAnalysis,
  scanCandidateTradeDays,
} from "./strategy/engine";
import {
  closeTradeExecution,
  createReplayPnLState,
  createTradeExecution,
} from "./strategy/pnl";
import type {
  CandidateTradeDay,
  DatasetManifestItem,
  ParsedDataset,
  ReplayMode,
  ReplayPnLState,
  SelectedTradeDayState,
  Timeframe,
  TradeExecution,
  TradeSide,
} from "./types/domain";
import { ChartPanel } from "./ui/ChartPanel";
import { ExplainPanel } from "./ui/ExplainPanel";

const tfs: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1D"];
const speedOptions = [150, 400, 800];

const replayModeLabel = (mode: ReplayPnLState["mode"]) =>
  mode === "auto" ? "Auto Reply" : "Manual Reply";
const tradeSideForTemplate = (template?: string): TradeSide | null =>
  template === "FGD" ? "long" : template === "FRD" ? "short" : null;
const formatPnL = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(4)}`;
const formatTradeResult = (trade: TradeExecution | null) => {
  if (!trade) return "No closed trade yet.";
  const label = trade.result ? trade.result.toUpperCase() : "OPEN";
  const exitReason = trade.exitReason ? ` · ${trade.exitReason}` : "";
  return `${label} ${trade.side.toUpperCase()} ${formatPnL(trade.realizedPnL)}${exitReason}`;
};
const resetTradeState = (mode: ReplayPnLState["mode"]) => createReplayPnLState(mode);

export default function App() {
  const [datasets] = useState<DatasetManifestItem[]>(loadDatasetManifest());
  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? "");
  const [activeDataset, setActiveDataset] = useState<ParsedDataset | null>(null);
  const [isDatasetLoading, setIsDatasetLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<Timeframe>("5m");
  const [mode, setMode] = useState<ReplayMode>("pause");
  const [speed, setSpeed] = useState(400);
  const [currentBarIndex, setCurrentBarIndex] = useState(0);
  const [selectedTradeDay, setSelectedTradeDay] = useState("");
  const [tradeState, setTradeState] = useState<ReplayPnLState>(
    createReplayPnLState("auto"),
  );
  const [chartViewport, setChartViewport] = useState({ startIndex: 0, endIndex: 0 });
  const tradeIdRef = React.useRef(0);
  const previousBarsLengthRef = React.useRef(0);

  useEffect(() => {
    const selectedDataset =
      datasets.find((item) => item.id === datasetId) ?? datasets[0];
    if (!selectedDataset) return;

    let cancelled = false;
    setIsDatasetLoading(true);
    setMode("pause");

    loadParsedDataset(selectedDataset)
      .then((dataset) => {
        if (cancelled) return;
        setActiveDataset(dataset);
        setSelectedTradeDay("");
        setCurrentBarIndex(0);
        setTradeState((prev) => resetTradeState(prev.mode));
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
    if (activeDataset.parseStatus === "error") return null;
    const candidateTradeDays = scanCandidateTradeDays(
      activeDataset.datasetId,
      activeDataset.symbol,
      activeDataset.bars1m,
    );
    return buildReplayDatasetAnalysis(
      activeDataset.datasetId,
      activeDataset.symbol,
      activeDataset.bars1m,
      selectedTradeDay || candidateTradeDays[0]?.date,
    );
  }, [activeDataset, selectedTradeDay]);

  const selectedTradeDayState = useMemo<SelectedTradeDayState | null>(() => {
    if (!activeDataset || activeDataset.parseStatus === "error") return null;
    const availableTradeDays = scanCandidateTradeDays(
      activeDataset.datasetId,
      activeDataset.symbol,
      activeDataset.bars1m,
    );
    return {
      selectedTradeDay: selectedTradeDay || availableTradeDays[0]?.date || "",
      availableTradeDays,
    };
  }, [activeDataset, selectedTradeDay]);

  const visibleCandidateTradeDays = useMemo<CandidateTradeDay[]>(() => {
    const candidates = selectedTradeDayState?.availableTradeDays ?? [];
    return mode === "auto"
      ? candidates
      : candidates.filter(
          (candidate) => candidate.practiceStatus === "needs-practice",
        );
  }, [mode, selectedTradeDayState]);

  const analysis = useMemo(() => {
    if (!datasetAnalysis) return null;
    return buildReplayAnalysis(datasetAnalysis, currentBarIndex);
  }, [datasetAnalysis, currentBarIndex]);

  useEffect(() => {
    if (!analysis || !activeDataset) return;
    setCurrentBarIndex(analysis.replayStartIndex);
    setTradeState((prev) => resetTradeState(prev.mode));
  }, [activeDataset?.datasetId, analysis?.replayStartIndex, analysis?.selectedTradeDay]);

  useEffect(() => {
    const nextTradeDay = visibleCandidateTradeDays[0]?.date ?? "";
    if (!selectedTradeDayState) return;
    if (
      selectedTradeDayState.selectedTradeDay &&
      visibleCandidateTradeDays.some(
        (candidate) => candidate.date === selectedTradeDayState.selectedTradeDay,
      )
    ) {
      return;
    }
    if (nextTradeDay !== selectedTradeDayState.selectedTradeDay) {
      setSelectedTradeDay(nextTradeDay);
    }
  }, [selectedTradeDayState, visibleCandidateTradeDays]);

  useEffect(() => {
    if (!analysis) return;
    if (mode !== "auto") return;
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

  useEffect(() => {
    if (!analysis) return;
    if (tradeState.mode !== "auto") return;
    const side = tradeSideForTemplate(analysis.template);
    const bar = analysis.timeframeBars["1m"][currentBarIndex];
    if (!side || !bar) return;

    setTradeState((prev) => {
      if (prev.mode !== "auto") return prev;
      const entryUnlocked = analysis.visibleEvents.some(
        (event) =>
          event.stage === "entry" &&
          event.title === "Entry valid" &&
          event.visibleFromIndex <= currentBarIndex,
      );
      let nextState = prev;

      if (!prev.currentPosition && entryUnlocked && analysis.entryPrice !== undefined) {
        tradeIdRef.current += 1;
        nextState = {
          ...prev,
          currentPosition: createTradeExecution({
            id: `auto-${tradeIdRef.current}`,
            mode: "auto",
            side,
            entryPrice: analysis.entryPrice,
            entryBarIndex: currentBarIndex,
            entryTime: bar.time,
            cumulativePnL: prev.cumulativePnL,
          }),
        };
      }

      const position = nextState.currentPosition;
      if (!position) return nextState;

      const hitStop =
        analysis.stopPrice !== undefined &&
        (side === "long" ? bar.low <= analysis.stopPrice : bar.high >= analysis.stopPrice);
      const hitTarget = analysis.targetLevels
        .filter((level) => level.hit)
        .slice(-1)[0];
      const atReplayEnd = currentBarIndex >= analysis.replayEndIndex;

      if (!hitStop && !hitTarget && !atReplayEnd) return nextState;

      const exitPrice = hitStop
        ? analysis.stopPrice!
        : hitTarget
          ? hitTarget.price
          : bar.close;
      const exitReason = hitStop
        ? "stop"
        : hitTarget
          ? `TP${hitTarget.tier}`
          : "replay-end";
      const closedTrade = closeTradeExecution(position, {
        exitPrice,
        exitBarIndex: currentBarIndex,
        exitTime: bar.time,
        exitReason,
        cumulativePnLBeforeTrade: prev.cumulativePnL,
      });
      return {
        ...nextState,
        currentPosition: null,
        trades: [...prev.trades, closedTrade],
        lastTrade: closedTrade,
        cumulativePnL: closedTrade.cumulativePnL,
      };
    });
  }, [analysis, currentBarIndex, tradeState.mode]);

  const currentReplayTime =
    activeDataset?.bars1m[
      Math.min(currentBarIndex, Math.max((activeDataset?.bars1m.length ?? 1) - 1, 0))
    ]?.time;
  const bars = useMemo(() => {
    if (!analysis) return [];
    return analysis.timeframeBars[timeframe].filter(
      (bar) =>
        new Date(bar.time).getTime() <=
        new Date(currentReplayTime ?? bar.time).getTime(),
    );
  }, [analysis, timeframe, currentReplayTime]);
  const ema20 = useMemo(() => {
    const k = 2 / (20 + 1);
    let prev = bars[0]?.close ?? 0;
    return bars.map((bar) => (prev = bar.close * k + prev * (1 - k)));
  }, [bars]);
  const visibleAnnotations = analysis?.visibleAnnotations ?? [];

  useEffect(() => {
    if (bars.length === 0) {
      previousBarsLengthRef.current = 0;
      setChartViewport({ startIndex: 0, endIndex: 0 });
      return;
    }

    setChartViewport((prev) => {
      const previousLength = previousBarsLengthRef.current;
      const maxIndex = bars.length - 1;
      const desiredSize =
        previousLength > 0
          ? Math.max(1, Math.min(prev.endIndex - prev.startIndex + 1, bars.length))
          : Math.min(Math.max(bars.length, 1), 120);
      const wasFollowingRightEdge =
        previousLength === 0 || prev.endIndex >= Math.max(previousLength - 2, 0);

      if (wasFollowingRightEdge) {
        return {
          startIndex: Math.max(0, bars.length - desiredSize),
          endIndex: maxIndex,
        };
      }

      const startIndex = Math.min(
        prev.startIndex,
        Math.max(bars.length - desiredSize, 0),
      );

      return {
        startIndex,
        endIndex: Math.min(startIndex + desiredSize - 1, maxIndex),
      };
    });

    previousBarsLengthRef.current = bars.length;
  }, [bars]);

  const selectedDatasetLabel =
    datasets
      .find((item) => item.id === datasetId)
      ?.label.replace(/\.(csv|json)$/i, "")
      .toUpperCase() ?? "UNKNOWN";
  const selectedCandidate =
    selectedTradeDayState?.availableTradeDays.find(
      (candidate) => candidate.date === analysis?.selectedTradeDay,
    ) ?? visibleCandidateTradeDays[0];

  if (!activeDataset || !analysis) {
    return (
      <div className="app-shell">
        <header>
          <h1>Stacey Reply Replay</h1>
          <p>
            Fixed-folder data source: <code>staceyreply/dist/mnt/data</code>. No
            upload UI, no broker API.
          </p>
        </header>
        <section className="control-grid">
          <label>
            Dataset
            <select
              value={datasetId}
              onChange={(e: { target: { value: string } }) =>
                setDatasetId(e.target.value)
              }
            >
              {datasets.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {dataset.label.replace(/\.(csv|json)$/i, "").toUpperCase()}
                  {dataset.isSample ? " (sample mode)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Candidate Day 3
            <select
              value={selectedTradeDayState?.selectedTradeDay ?? ""}
              onChange={(e: { target: { value: string } }) =>
                setSelectedTradeDay(e.target.value)
              }
            >
              {visibleCandidateTradeDays.map((candidate) => (
                <option key={candidate.date} value={candidate.date}>
                  {candidate.date} · {candidate.template} · {candidate.valid ? "valid" : "invalid"}
                </option>
              ))}
            </select>
          </label>
        </section>
        <section className="info-strip">
          <div>
            {isDatasetLoading
              ? "Loading dataset…"
              : activeDataset?.parseStatus === "error"
                ? "Dataset parse failed."
                : "No dataset available."}
          </div>
          {!isDatasetLoading && activeDataset?.parseStatus === "error" ? (
            <div>
              Why unavailable: {activeDataset.parseErrors[0] ?? "Unknown parse error."}
            </div>
          ) : null}
        </section>
        {!isDatasetLoading && activeDataset?.parseStatus === "error" ? (
          <section className="footer-grid">
            <div>
              <h3>Diagnostics</h3>
              <ul>
                <li>Dataset: {selectedDatasetLabel}</li>
                <li>Dataset file: {activeDataset.sourceLabel}</li>
                <li>Parse status: {activeDataset.parseStatus}</li>
                <li>Failure reasons: {activeDataset.parseErrors.join(" | ")}</li>
                <li>
                  Accepted formats / notes: {activeDataset.parseDiagnostics.join(" | ") || "none"}
                </li>
              </ul>
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  const setTradeMode = (nextMode: ReplayPnLState["mode"]) => {
    setTradeState(resetTradeState(nextMode));
  };
  const resetReplay = () => {
    setMode("pause");
    setCurrentBarIndex(analysis.replayStartIndex);
    setTradeState((prev) => resetTradeState(prev.mode));
  };
  const nextStep = () => {
    const stop = nextStageStop(analysis.eventLog, currentBarIndex);
    setMode("pause");
    setCurrentBarIndex(stop ?? Math.min(currentBarIndex + 1, analysis.replayEndIndex));
  };
  const playAuto = () => setMode("auto");
  const playSemi = () => {
    setMode("semi");
    nextStep();
  };
  const manualTradeDisabled =
    tradeState.mode !== "manual" ||
    tradeState.currentPosition !== null ||
    !analysis.lastReplyEval.canReply;
  const manualSide = tradeSideForTemplate(analysis.template);

  const openManualTrade = (side: TradeSide) => {
    const bar = analysis.timeframeBars["1m"][currentBarIndex];
    if (!bar || tradeState.mode !== "manual" || tradeState.currentPosition) return;
    if (!analysis.lastReplyEval.canReply) return;
    tradeIdRef.current += 1;
    setTradeState((prev) => ({
      ...prev,
      currentPosition: createTradeExecution({
        id: `manual-${tradeIdRef.current}`,
        mode: "manual",
        side,
        entryPrice: bar.close,
        entryBarIndex: currentBarIndex,
        entryTime: bar.time,
        cumulativePnL: prev.cumulativePnL,
      }),
    }));
  };

  const exitManualTrade = () => {
    const bar = analysis.timeframeBars["1m"][currentBarIndex];
    if (!bar || !tradeState.currentPosition) return;
    setTradeState((prev) => {
      if (!prev.currentPosition) return prev;
      const closedTrade = closeTradeExecution(prev.currentPosition, {
        exitPrice: bar.close,
        exitBarIndex: currentBarIndex,
        exitTime: bar.time,
        exitReason: "manual-exit",
        cumulativePnLBeforeTrade: prev.cumulativePnL,
      });
      return {
        ...prev,
        currentPosition: null,
        trades: [...prev.trades, closedTrade],
        lastTrade: closedTrade,
        cumulativePnL: closedTrade.cumulativePnL,
      };
    });
  };

  return (
    <div className="app-shell">
      <header>
        <h1>Stacey Reply Replay</h1>
        <p>
          Fixed-folder data source: <code>staceyreply/dist/mnt/data</code>. No
          upload UI, no broker API.
        </p>
      </header>
      <section className="control-grid">
        <label>
          Dataset
          <select
            value={datasetId}
            onChange={(e: { target: { value: string } }) => setDatasetId(e.target.value)}
          >
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.label.replace(/\.(csv|json)$/i, "").toUpperCase()}
                {dataset.isSample ? " (sample mode)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Candidate Day 3
          <select
            value={selectedTradeDayState?.selectedTradeDay ?? ""}
            onChange={(e: { target: { value: string } }) => setSelectedTradeDay(e.target.value)}
          >
            {visibleCandidateTradeDays.map((candidate) => (
              <option key={candidate.date} value={candidate.date}>
                {candidate.date} · {candidate.template} · {candidate.valid ? "valid" : "invalid"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Timeframe
          <select
            value={timeframe}
            onChange={(e: { target: { value: string } }) => setTimeframe(e.target.value as Timeframe)}
          >
            {tfs.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </label>
        <label>
          Replay mode
          <select
            value={mode}
            onChange={(e: { target: { value: string } }) => setMode(e.target.value as ReplayMode)}
          >
            <option value="pause">Pause</option>
            <option value="auto">Auto Replay</option>
            <option value="semi">Semi Replay</option>
          </select>
        </label>
        <label>
          Reply mode
          <select
            value={tradeState.mode}
            onChange={(e: { target: { value: string } }) =>
              setTradeMode(e.target.value as ReplayPnLState["mode"])
            }
          >
            <option value="auto">Auto Reply</option>
            <option value="manual">Manual Reply</option>
          </select>
        </label>
        <label>
          Speed
          <select
            value={speed}
            onChange={(e: { target: { value: string } }) => setSpeed(Number(e.target.value))}
          >
            {speedOptions.map((option) => (
              <option key={option} value={option}>
                {option} ms
              </option>
            ))}
          </select>
        </label>
        <button onClick={resetReplay}>Reset</button>
        <button onClick={playAuto}>Auto Replay</button>
        <button onClick={playSemi}>Semi Replay</button>
        <button onClick={nextStep}>Continue / Next step</button>
      </section>
      <section className="control-grid">
        <button
          onClick={() => openManualTrade("long")}
          disabled={manualTradeDisabled || manualSide === "short"}
        >
          Enter Long
        </button>
        <button
          onClick={() => openManualTrade("short")}
          disabled={manualTradeDisabled || manualSide === "long"}
        >
          Enter Short
        </button>
        <button
          onClick={exitManualTrade}
          disabled={tradeState.mode !== "manual" || !tradeState.currentPosition}
        >
          Exit
        </button>
        <button onClick={() => setTradeState((prev) => resetTradeState(prev.mode))}>
          Reset Trade
        </button>
      </section>
      <section className="info-strip">
        <div>Dataset status: {isDatasetLoading ? "loading" : "ready"}</div>
        <div>Parse status: {activeDataset.parseStatus}</div>
        <div>Trade day: {analysis.selectedTradeDay}</div>
        <div>Candidate summary: {selectedCandidate?.summaryReason ?? "none"}</div>
        <div>Current stage: {analysis.stage}</div>
        <div>Can reply now: {analysis.lastReplyEval.canReply ? "Yes" : "No"}</div>
        <div>Current gate: {analysis.lastReplyEval.explanation}</div>
        <div>Reply mode: {replayModeLabel(tradeState.mode)}</div>
        <div>
          Current position: {tradeState.currentPosition
            ? `${tradeState.currentPosition.side.toUpperCase()} @ ${tradeState.currentPosition.entryPrice.toFixed(4)}`
            : "Flat"}
        </div>
        <div>Last trade result: {formatTradeResult(tradeState.lastTrade)}</div>
        <div>Cumulative PnL: {formatPnL(tradeState.cumulativePnL)}</div>
        <div>
          Unlocked target tier: {analysis.recommendedTarget ? `TP${analysis.recommendedTarget}` : "none"}
        </div>
        <div>
          Next target gate: {analysis.targetLevels.find((level) => !level.eligible)?.missingGate ?? "All target tiers unlocked."}
        </div>
      </section>
      <main className="main-grid">
          <ChartPanel
            bars={bars}
            ema20={ema20}
            annotations={visibleAnnotations}
            replayMarkerTime={currentReplayTime}
          previousClose={analysis.previousClose}
          hos={analysis.hos}
          los={analysis.los}
            hod={analysis.hod}
            lod={analysis.lod}
            statusBanner={analysis.statusBanner}
            viewport={chartViewport}
            onViewportChange={setChartViewport}
          />
        <ExplainPanel analysis={{ ...analysis, currentBarIndex }} />
      </main>
      <section className="footer-grid">
        <div>
          <h3>Detected candidate dates</h3>
          <ul>
            {visibleCandidateTradeDays.map((candidate) => (
              <li key={candidate.date}>
                {candidate.date} — {candidate.template} — {candidate.valid ? "valid" : "invalid"} — {candidate.summaryReason}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="footer-grid">
        <div>
          <h3>Target ladder</h3>
          <ul>
            {analysis.targetLevels.map((level) => (
              <li key={level.tier}>
                TP{level.tier}: {level.status} @ {level.price.toFixed(4)} — {level.reason}
                {level.missingGate ? ` Missing gate: ${level.missingGate}` : ""}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Trade ledger</h3>
          <ul>
            <li>Open position: {tradeState.currentPosition ? tradeState.currentPosition.id : "none"}</li>
            <li>Closed trades: {tradeState.trades.length}</li>
            <li>Last result: {formatTradeResult(tradeState.lastTrade)}</li>
            <li>Cumulative PnL: {formatPnL(tradeState.cumulativePnL)}</li>
          </ul>
        </div>
        <div>
          <h3>Diagnostics</h3>
          <ul>
            <li>Dataset file: {activeDataset.sourceLabel}</li>
            <li>Bars loaded: {activeDataset.bars1m.length}</li>
            <li>Parse errors: {activeDataset.parseErrors.join(" | ") || "none"}</li>
            <li>Accepted formats / notes: {activeDataset.parseDiagnostics.join(" | ") || "none"}</li>
            <li>Replay range: {analysis.replayStartIndex} → {analysis.replayEndIndex}</li>
            <li>Invalid messages: {analysis.invalidReasons.join(" | ") || "none"}</li>
            <li>Manual gate source: {analysis.lastReplyEval.explanation}</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

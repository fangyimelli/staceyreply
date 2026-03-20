import { useEffect, useMemo, useRef, useState } from "react";
import {
  DatasetLoadError,
  getPreprocessedDatasetManifest,
  loadPairCandidateIndex,
  loadReplayEventDataset,
} from "./data/loadDatasets";
import { nextStageStop } from "./replay/engine";
import { buildReplayAnalysis, buildReplayDatasetAnalysis } from "./strategy/engine";
import {
  closeTradeExecution,
  createReplayPnLState,
  createTradeExecution,
} from "./strategy/pnl";
import type {
  CandidateTradeDay,
  DatasetLoadErrorInfo,
  DatasetManifestItem,
  PairCandidateIndex,
  PairCandidateSummary,
  PreprocessedReplayEventDataset,
  ReplayMode,
  ReplayPnLState,
  SelectedTradeDayState,
  Timeframe,
  TradeExecution,
  TradeEntrySemantics,
  TradeSide,
} from "./types/domain";
import { ChartPanel } from "./ui/ChartPanel";
import { DebugPanel } from "./ui/DebugPanel";
import { ExplainPanel } from "./ui/ExplainPanel";

const tfs: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1D"];
const speedOptions = [150, 400, 800];
const datasetImportMessage =
  "App startup only reads preprocessed/manifest.json. Pair selection only reads that pair index.json. Candidate selection then lazily loads a single events/<eventId>.json payload.";

const replyModeLabel = (mode: ReplayPnLState["mode"]) =>
  mode === "auto" ? "Auto Reply" : "Manual Reply";
const tradeSideForTemplate = (template?: string): TradeSide | null =>
  template === "FGD" ? "long" : template === "FRD" ? "short" : null;
const formatPnL = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(4)}`;
const formatPrice = (value?: number) =>
  value === undefined || Number.isNaN(value) ? "n/a" : value.toFixed(4);
const manualEntryModeOptions = ["strategy", "user", "close"] as const;
type ManualEntryMode = (typeof manualEntryModeOptions)[number];
const entrySemanticsLabel = (semantics: TradeEntrySemantics) => {
  if (semantics === "strategy-entry") return "Strategy entry";
  if (semantics === "manual-execution-user") return "Manual execution price";
  return "Current bar close";
};
const formatTradeResult = (trade: TradeExecution | null) => {
  if (!trade) return "No closed trade yet.";
  const label = trade.result ? trade.result.toUpperCase() : "OPEN";
  const exitReason = trade.exitReason ? ` · ${trade.exitReason}` : "";
  return `${label} ${trade.side.toUpperCase()} ${formatPnL(trade.realizedPnL)}${exitReason}`;
};
const resetTradeState = (mode: ReplayPnLState["mode"]) => createReplayPnLState(mode);
const describeSourceType = () => "Preprocessed replay library";
const datasetLabelText = (dataset: DatasetManifestItem) => dataset.label.toUpperCase();
const loaderPhaseLabel = (phase: DatasetLoadErrorInfo["phase"]) => {
  if (phase === "file-read") return "file read";
  if (phase === "parse") return "parse";
  return "analysis setup";
};
const toCandidateTradeDay = (candidate: PairCandidateSummary): CandidateTradeDay => ({
  date: candidate.candidateDate,
  template: candidate.template,
  practiceStatus: candidate.practiceStatus,
  valid: candidate.valid,
  summaryReason: candidate.summaryReason,
});

export default function App() {
  const [page, setPage] = useState<"replay" | "debug">("replay");
  const [datasetId, setDatasetId] = useState("");
  const [datasets, setDatasets] = useState<DatasetManifestItem[]>([]);
  const [pairIndex, setPairIndex] = useState<PairCandidateIndex | null>(null);
  const [selectedTradeDay, setSelectedTradeDay] = useState("");
  const [activeDataset, setActiveDataset] = useState<PreprocessedReplayEventDataset | null>(null);
  const [datasetLoadError, setDatasetLoadError] = useState<DatasetLoadErrorInfo | null>(null);
  const [isDatasetLoading, setIsDatasetLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<Timeframe>("5m");
  const [mode, setMode] = useState<ReplayMode>("pause");
  const [speed, setSpeed] = useState(400);
  const [currentBarIndex, setCurrentBarIndex] = useState(0);
  const [tradeState, setTradeState] = useState<ReplayPnLState>(createReplayPnLState("auto"));
  const [manualEntryMode, setManualEntryMode] = useState<ManualEntryMode>("strategy");
  const [manualEntryInput, setManualEntryInput] = useState("");
  const [practiceFilterEnabled, setPracticeFilterEnabled] = useState(false);
  const [chartViewport, setChartViewport] = useState({ startIndex: 0, endIndex: 0 });
  const tradeIdRef = useRef(0);
  const previousBarsLengthRef = useRef(0);
  const semiPendingStopRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsDatasetLoading(true);
    setDatasetLoadError(null);

    getPreprocessedDatasetManifest()
      .then((manifest) => {
        if (cancelled) return;
        setDatasets(manifest);
        setDatasetId((current) => current || manifest[0]?.id || "");
        if (!manifest.length) {
          setDatasetLoadError({
            datasetId: "manifest",
            datasetLabel: "manifest",
            sourceLabel: "/preprocessed/manifest.json",
            phase: "file-read",
            message:
              "Preprocessed manifest is empty. Add a pair under data/pairs/<pair>/raw/1m.csv and rerun npm run preprocess:data.",
          });
          setIsDatasetLoading(false);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setDatasets([]);
        const loadError =
          error instanceof DatasetLoadError
            ? {
                datasetId: error.datasetId,
                datasetLabel: error.datasetLabel,
                sourceLabel: error.sourceLabel,
                phase: error.phase,
                message: error.message,
              }
            : {
                datasetId: "manifest",
                datasetLabel: "manifest",
                sourceLabel: "/preprocessed/manifest.json",
                phase: "file-read" as const,
                message: error instanceof Error ? error.message : String(error),
              };
        setDatasetLoadError(loadError);
        setIsDatasetLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!datasets.some((item) => item.id === datasetId)) {
      setDatasetId(datasets[0]?.id ?? "");
    }
  }, [datasets, datasetId]);

  const selectedDataset = datasets.find((item) => item.id === datasetId) ?? datasets[0] ?? null;

  useEffect(() => {
    if (!selectedDataset) return;

    let cancelled = false;
    setIsDatasetLoading(true);
    setDatasetLoadError(null);
    setPairIndex(null);
    setActiveDataset(null);
    setSelectedTradeDay("");
    setMode("pause");

    loadPairCandidateIndex(selectedDataset)
      .then((index) => {
        if (cancelled) return;
        setPairIndex(index);
        setSelectedTradeDay(index.candidates[0]?.candidateDate ?? "");
        if (!index.candidates.length) {
          setIsDatasetLoading(false);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        const loadError =
          error instanceof DatasetLoadError
            ? {
                datasetId: error.datasetId,
                datasetLabel: error.datasetLabel,
                sourceLabel: error.sourceLabel,
                phase: error.phase,
                message: error.message,
              }
            : {
                datasetId: selectedDataset.id,
                datasetLabel: selectedDataset.label,
                sourceLabel: selectedDataset.indexPath,
                phase: "analysis-setup" as const,
                message: error instanceof Error ? error.message : String(error),
              };
        setDatasetLoadError(loadError);
        setIsDatasetLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDataset]);

  const availableTradeDays = useMemo<CandidateTradeDay[]>(
    () => (pairIndex?.candidates ?? []).map(toCandidateTradeDay),
    [pairIndex],
  );

  const isPracticeMode = tradeState.mode === "manual" || practiceFilterEnabled;

  const visibleCandidateTradeDays = useMemo<CandidateTradeDay[]>(() => {
    return isPracticeMode
      ? availableTradeDays.filter((candidate) => candidate.practiceStatus === "needs-practice")
      : availableTradeDays;
  }, [availableTradeDays, isPracticeMode]);

  const selectedTradeDayState = useMemo<SelectedTradeDayState | null>(() => {
    if (!availableTradeDays.length) return null;
    return {
      selectedTradeDay: selectedTradeDay || availableTradeDays[0]?.date || "",
      availableTradeDays,
    };
  }, [availableTradeDays, selectedTradeDay]);

  useEffect(() => {
    if (!selectedTradeDayState) return;
    const explicitSelection = selectedTradeDay;
    if (
      explicitSelection &&
      selectedTradeDayState.availableTradeDays.some((candidate) => candidate.date === explicitSelection)
    ) {
      return;
    }

    const nextTradeDay =
      visibleCandidateTradeDays[0]?.date ?? selectedTradeDayState.availableTradeDays[0]?.date ?? "";
    if (nextTradeDay !== selectedTradeDayState.selectedTradeDay) {
      setSelectedTradeDay(nextTradeDay);
    }
  }, [selectedTradeDay, selectedTradeDayState, visibleCandidateTradeDays]);

  useEffect(() => {
    if (!selectedDataset || !pairIndex || !selectedTradeDay) return;
    const selectedCandidate = pairIndex.candidates.find(
      (candidate) => candidate.candidateDate === selectedTradeDay,
    );
    if (!selectedCandidate) return;

    let cancelled = false;
    setIsDatasetLoading(true);
    setDatasetLoadError(null);
    setActiveDataset(null);
    setMode("pause");

    loadReplayEventDataset(selectedDataset, selectedCandidate.datasetPath)
      .then((dataset) => {
        if (cancelled) return;
        try {
          void buildReplayDatasetAnalysis(
            dataset.datasetId,
            dataset.symbol,
            dataset.bars1m,
            dataset.candidateDate,
          );
          setActiveDataset(dataset);
          setCurrentBarIndex(0);
          setTradeState((prev) => resetTradeState(prev.mode));
          setIsDatasetLoading(false);
        } catch (error) {
          throw new DatasetLoadError({
            datasetId: dataset.datasetId,
            datasetLabel: selectedDataset.label,
            sourceLabel: selectedCandidate.datasetPath,
            phase: "analysis-setup",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setActiveDataset(null);
        const loadError =
          error instanceof DatasetLoadError
            ? {
                datasetId: error.datasetId,
                datasetLabel: error.datasetLabel,
                sourceLabel: error.sourceLabel,
                phase: error.phase,
                message: error.message,
              }
            : {
                datasetId: selectedDataset.id,
                datasetLabel: selectedDataset.label,
                sourceLabel: selectedCandidate.datasetPath,
                phase: "analysis-setup" as const,
                message: error instanceof Error ? error.message : String(error),
              };
        setDatasetLoadError(loadError);
        setIsDatasetLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pairIndex, selectedDataset, selectedTradeDay]);

  const datasetAnalysis = useMemo(() => {
    if (!activeDataset) return null;
    if (activeDataset.parseStatus === "error") return null;
    return buildReplayDatasetAnalysis(
      activeDataset.datasetId,
      activeDataset.symbol,
      activeDataset.bars1m,
      activeDataset.candidateDate,
    );
  }, [activeDataset]);

  const analysis = useMemo(() => {
    if (!datasetAnalysis) return null;
    return buildReplayAnalysis(datasetAnalysis, currentBarIndex);
  }, [datasetAnalysis, currentBarIndex]);

  useEffect(() => {
    if (!analysis || !activeDataset) return;
    setCurrentBarIndex(analysis.replayStartIndex);
    setTradeState((prev) => resetTradeState(prev.mode));
  }, [activeDataset?.eventId, analysis?.replayStartIndex, analysis?.selectedTradeDay]);

  const getAdvanceTarget = (barIndex: number) => {
    if (!analysis) return barIndex;
    const stop = nextStageStop(analysis.eventLog, barIndex);
    return stop ?? Math.min(barIndex + 1, analysis.replayEndIndex);
  };

  const advanceReplayOnce = () => {
    setCurrentBarIndex((value) => getAdvanceTarget(value));
  };

  const setReplayBehavior = (action: "pause" | "auto" | "semi" | "advanceToNextStage") => {
    if (action === "advanceToNextStage") {
      semiPendingStopRef.current = null;
      advanceReplayOnce();
      return;
    }

    semiPendingStopRef.current = action === "semi" ? semiPendingStopRef.current : null;
    setMode(action);
  };

  useEffect(() => {
    if (!analysis || mode !== "auto") return;
    const timer = window.setTimeout(() => {
      setCurrentBarIndex((value) => Math.min(value + 1, analysis.replayEndIndex));
    }, speed);
    return () => window.clearTimeout(timer);
  }, [mode, analysis, currentBarIndex, speed]);

  useEffect(() => {
    if (!analysis || mode !== "semi") return;

    if (semiPendingStopRef.current === null) {
      const stop = nextStageStop(analysis.eventLog, currentBarIndex);
      const target = stop ?? Math.min(currentBarIndex + 1, analysis.replayEndIndex);
      semiPendingStopRef.current = target;
      if (target !== currentBarIndex) {
        setCurrentBarIndex(target);
      }
      return;
    }

    if (currentBarIndex >= semiPendingStopRef.current) {
      semiPendingStopRef.current = null;
      setMode("pause");
    }
  }, [mode, analysis, currentBarIndex]);

  const replayBars1m = analysis?.timeframeBars["1m"] ?? [];
  const clampedCurrentBarIndex = Math.min(currentBarIndex, Math.max(replayBars1m.length - 1, 0));
  const currentReplayBar = replayBars1m[clampedCurrentBarIndex];
  const currentReplayTime = currentReplayBar?.time;

  useEffect(() => {
    if (!analysis || tradeState.mode !== "auto") return;
    const side = tradeSideForTemplate(analysis.template);
    const bar = currentReplayBar;
    if (!side || !bar) return;

    setTradeState((prev) => {
      if (prev.mode !== "auto") return prev;
      const entryUnlocked = analysis.visibleEvents.some(
        (event) => event.stage === "entry" && event.title === "Entry valid" && event.visibleFromIndex <= currentBarIndex,
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
            strategyEntryPrice: analysis.entryPrice,
            entrySemantics: "strategy-entry",
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
      const hitTarget = analysis.targetLevels.filter((level) => level.hit).slice(-1)[0];
      const atReplayEnd = currentBarIndex >= analysis.replayEndIndex;

      if (!hitStop && !hitTarget && !atReplayEnd) return nextState;

      const exitPrice = hitStop ? analysis.stopPrice! : hitTarget ? hitTarget.price : bar.close;
      const exitReason = hitStop ? "stop" : hitTarget ? `TP${hitTarget.tier}` : "replay-end";
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
  }, [analysis, currentBarIndex, currentReplayBar, tradeState.mode]);

  if (analysis) {
    const timeframeBars = analysis.timeframeBars[timeframe];
    if (!Array.isArray(timeframeBars)) {
      throw new Error(`Missing timeframe bars for ${timeframe}.`);
    }
    if (currentBarIndex < 0 || currentBarIndex > analysis.replayEndIndex) {
      throw new Error(
        `Replay index ${currentBarIndex} is outside range ${analysis.replayStartIndex}-${analysis.replayEndIndex}.`,
      );
    }
  }

  const bars = useMemo(() => {
    if (!analysis || !currentReplayTime) return [];
    return analysis.timeframeBars[timeframe].filter(
      (bar) => new Date(bar.time).getTime() <= new Date(currentReplayTime).getTime(),
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

      const startIndex = Math.min(prev.startIndex, Math.max(bars.length - desiredSize, 0));
      return {
        startIndex,
        endIndex: Math.min(startIndex + desiredSize - 1, maxIndex),
      };
    });

    previousBarsLengthRef.current = bars.length;
  }, [bars]);

  const selectedCandidate =
    pairIndex?.candidates.find((candidate) => candidate.candidateDate === analysis?.selectedTradeDay) ??
    pairIndex?.candidates[0];

  if (!activeDataset || !analysis) {
    return (
      <div className="app-shell">
        <header>
          <h1>Stacey Reply Replay</h1>
          <p>Fixed `data/` replay pipeline with pair selection and automatic dataset loading. No broker API.</p>
        </header>
        <section className="upload-grid">
          <div className="upload-card">
            <h3>Replay dataset flow</h3>
            <p>{datasetImportMessage}</p>
            <p className="upload-note">Fixed `data/` raw CSV → preprocessing → manifest → pair index → single event load.</p>
          </div>
        </section>
        <section className="control-grid">
          <button className={page === "replay" ? "active-toggle" : ""} onClick={() => setPage("replay")}>Replay Page</button>
          <button className={page === "debug" ? "active-toggle" : ""} onClick={() => setPage("debug")}>Debug Page</button>
          <label>
            Pair
            <select value={datasetId} onChange={(e: { target: { value: string } }) => setDatasetId(e.target.value)}>
              {datasets.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>{datasetLabelText(dataset)}</option>
              ))}
            </select>
          </label>
          <label>
            Candidate Day 3
            <select value={selectedTradeDayState?.selectedTradeDay ?? ""} onChange={(e: { target: { value: string } }) => setSelectedTradeDay(e.target.value)} disabled>
              <option value="">{pairIndex ? "Wait for event load to complete" : "Wait for pair index to load"}</option>
            </select>
          </label>
        </section>
        <section className="info-strip">
          <div>{isDatasetLoading ? "Loading preprocessed data…" : datasetLoadError ? "Pair loader failed." : "Event payload pending or unavailable."}</div>
          <div>Dataset source: {selectedDataset ? describeSourceType() : "none"}</div>
          {!isDatasetLoading && datasetLoadError ? (
            <div>Why unavailable: {loaderPhaseLabel(datasetLoadError.phase)} failure — {datasetLoadError.message}</div>
          ) : null}
        </section>
        {!isDatasetLoading && datasetLoadError ? (
          <section className="footer-grid">
            <div>
              <h3>Diagnostics</h3>
              <ul>
                <li>Dataset: {datasetLoadError.datasetLabel}</li>
                <li>Dataset id: {datasetLoadError.datasetId}</li>
                <li>Dataset file: {datasetLoadError.sourceLabel}</li>
                <li>Dataset source: {describeSourceType()}</li>
                <li>Load failure phase: {loaderPhaseLabel(datasetLoadError.phase)}</li>
                <li>Loader/runtime message: {datasetLoadError.message}</li>
              </ul>
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  const setReplyMode = (nextMode: ReplayPnLState["mode"]) => {
    setTradeState(resetTradeState(nextMode));
  };
  const resetReplay = () => {
    semiPendingStopRef.current = null;
    setReplayBehavior("pause");
    setCurrentBarIndex(analysis.replayStartIndex);
    setTradeState((prev) => resetTradeState(prev.mode));
  };
  const continueNextStep = () => {
    setReplayBehavior("pause");
    setReplayBehavior("advanceToNextStage");
  };
  const manualTradeDisabled =
    tradeState.mode !== "manual" || tradeState.currentPosition !== null || !analysis.lastReplyEval.canReply;
  const manualSide = tradeSideForTemplate(analysis.template);
  const entryGateOpen = analysis.visibleEvents.some(
    (event) => event.stage === "entry" && event.title === "Entry valid" && event.visibleFromIndex <= currentBarIndex,
  );
  const current1mBar = currentReplayBar;
  const parsedManualEntryInput = Number(manualEntryInput);
  const hasManualEntryInput = manualEntryInput.trim().length > 0 && Number.isFinite(parsedManualEntryInput);
  const resolvedEntryConfig = (() => {
    if (tradeState.mode !== "manual" || manualEntryMode === "strategy") {
      return {
        entryPrice: analysis.entryPrice,
        strategyEntryPrice: analysis.entryPrice,
        entrySemantics: "strategy-entry" as const,
      };
    }
    if (manualEntryMode === "user") {
      return hasManualEntryInput
        ? {
            entryPrice: parsedManualEntryInput,
            strategyEntryPrice: analysis.entryPrice,
            manualExecutionPrice: parsedManualEntryInput,
            entrySemantics: "manual-execution-user" as const,
          }
        : {
            entryPrice: undefined,
            strategyEntryPrice: analysis.entryPrice,
            manualExecutionPrice: undefined,
            entrySemantics: "manual-execution-user" as const,
          };
    }
    return {
      entryPrice: current1mBar?.close,
      strategyEntryPrice: analysis.entryPrice,
      manualExecutionPrice: current1mBar?.close,
      entrySemantics: "manual-execution-close" as const,
    };
  })();
  const manualEntryPriceReady = resolvedEntryConfig.entryPrice !== undefined;
  const manualEntryConfigSummary =
    manualEntryMode === "strategy"
      ? `Strategy-confirmed entry ${formatPrice(analysis.entryPrice)}.`
      : manualEntryMode === "user"
        ? `User-specified execution price ${hasManualEntryInput ? formatPrice(parsedManualEntryInput) : "required"}.`
        : `Current 1m bar close ${formatPrice(current1mBar?.close)}.`;
  const activeEntryReferencePrice =
    tradeState.currentPosition?.entryPrice ?? resolvedEntryConfig.entryPrice ?? analysis.entryPrice;
  const effectiveTargetLevels = analysis.targetLevels.map((level) => {
    const price =
      activeEntryReferencePrice === undefined
        ? level.price
        : manualSide === "long"
          ? activeEntryReferencePrice + level.tier * 0.0001
          : manualSide === "short"
            ? activeEntryReferencePrice - level.tier * 0.0001
            : level.price;
    const hit =
      level.eligible && current1mBar
        ? manualSide === "long"
          ? current1mBar.high >= price
          : manualSide === "short"
            ? current1mBar.low <= price
            : level.hit
        : level.hit;
    return {
      ...level,
      price,
      hit,
      status: hit ? "hit" : level.status === "pending" ? "pending" : level.eligible ? "eligible" : "blocked",
    };
  });
  const effectiveStopDistance =
    analysis.stopPrice !== undefined && activeEntryReferencePrice !== undefined
      ? Math.abs(activeEntryReferencePrice - analysis.stopPrice)
      : undefined;

  const openManualTrade = (side: TradeSide) => {
    const bar = currentReplayBar;
    if (!bar || tradeState.mode !== "manual" || tradeState.currentPosition) return;
    if (!analysis.lastReplyEval.canReply || !entryGateOpen || !manualEntryPriceReady) return;
    tradeIdRef.current += 1;
    setTradeState((prev) => ({
      ...prev,
      currentPosition: createTradeExecution({
        id: `manual-${tradeIdRef.current}`,
        mode: "manual",
        side,
        entryPrice: resolvedEntryConfig.entryPrice!,
        strategyEntryPrice: resolvedEntryConfig.strategyEntryPrice,
        manualExecutionPrice: resolvedEntryConfig.manualExecutionPrice,
        entrySemantics: resolvedEntryConfig.entrySemantics,
        entryBarIndex: currentBarIndex,
        entryTime: bar.time,
        cumulativePnL: prev.cumulativePnL,
      }),
    }));
  };

  const exitManualTrade = () => {
    const bar = currentReplayBar;
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
        <p>Fixed `data/` replay pipeline with pair selection and automatic dataset loading. No broker API.</p>
      </header>
      <section className="upload-grid">
        <div className="upload-card">
          <h3>Replay dataset flow</h3>
          <p>{datasetImportMessage}</p>
          <p className="upload-note">Datasets arrive from the fixed `data/` preprocessing flow, then lazily load pair index and single-event payloads.</p>
        </div>
      </section>
      <section className="control-grid">
        <button className={page === "replay" ? "active-toggle" : ""} onClick={() => setPage("replay")}>Replay Page</button>
        <button className={page === "debug" ? "active-toggle" : ""} onClick={() => setPage("debug")}>Debug Page</button>
        <label>
          Pair
          <select value={datasetId} onChange={(e: { target: { value: string } }) => setDatasetId(e.target.value)}>
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>{datasetLabelText(dataset)}</option>
            ))}
          </select>
        </label>
        <label>
          Candidate Day 3
          <select value={selectedTradeDayState?.selectedTradeDay ?? ""} onChange={(e: { target: { value: string } }) => setSelectedTradeDay(e.target.value)}>
            {visibleCandidateTradeDays.length ? (
              visibleCandidateTradeDays.map((candidate) => (
                <option key={candidate.date} value={candidate.date}>
                  {candidate.date} · {candidate.template} · {candidate.valid ? "valid" : "invalid"}
                </option>
              ))
            ) : (
              <option value="">No scanned candidates for current pair</option>
            )}
          </select>
        </label>
        <label>
          Timeframe
          <select value={timeframe} onChange={(e: { target: { value: string } }) => setTimeframe(e.target.value as Timeframe)}>
            {tfs.map((tf) => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>
        </label>
        <label>
          Replay mode
          <select value={mode} onChange={(e: { target: { value: string } }) => setMode(e.target.value as ReplayMode)}>
            <option value="pause">Pause</option>
            <option value="auto">Auto Replay</option>
            <option value="semi">Semi Replay</option>
          </select>
        </label>
        <label>
          Trade / practice mode
          <select value={tradeState.mode} onChange={(e: { target: { value: string } }) => setReplyMode(e.target.value as ReplayPnLState["mode"])}>
            <option value="auto">Auto Reply</option>
            <option value="manual">Manual Reply</option>
          </select>
        </label>
        <label>
          Candidate list filter
          <select value={practiceFilterEnabled ? "needs-practice" : "all"} onChange={(e: { target: { value: string } }) => setPracticeFilterEnabled(e.target.value === "needs-practice")}>
            <option value="all">Show all scanned days</option>
            <option value="needs-practice">Show needs-practice only</option>
          </select>
        </label>
        <label>
          Speed
          <select value={speed} onChange={(e: { target: { value: string } }) => setSpeed(Number(e.target.value))}>
            {speedOptions.map((option) => (
              <option key={option} value={option}>{option} ms</option>
            ))}
          </select>
        </label>
        <button onClick={resetReplay}>Reset</button>
        <button onClick={() => setReplayBehavior("auto")}>Auto Replay</button>
        <button onClick={() => setReplayBehavior("semi")}>Semi Replay</button>
        <button onClick={continueNextStep}>Continue / Next step</button>
      </section>
      <section className="control-grid">
        <button onClick={() => openManualTrade("long")} disabled={manualTradeDisabled || manualSide === "short" || !entryGateOpen || !manualEntryPriceReady}>Enter Long</button>
        <button onClick={() => openManualTrade("short")} disabled={manualTradeDisabled || manualSide === "long" || !entryGateOpen || !manualEntryPriceReady}>Enter Short</button>
        <button onClick={exitManualTrade} disabled={tradeState.mode !== "manual" || !tradeState.currentPosition}>Exit</button>
        <button onClick={() => setTradeState((prev) => resetTradeState(prev.mode))}>Reset Trade</button>
        <label>
          Manual entry basis
          <select value={manualEntryMode} onChange={(e: { target: { value: string } }) => setManualEntryMode(e.target.value as ManualEntryMode)} disabled={tradeState.mode !== "manual" || tradeState.currentPosition !== null}>
            {manualEntryModeOptions.map((option) => (
              <option key={option} value={option}>
                {option === "strategy" ? "Strategy entry" : option === "user" ? "User-specified price" : "Current bar close"}
              </option>
            ))}
          </select>
        </label>
        {manualEntryMode === "user" ? (
          <label>
            Manual execution price
            <input type="number" step="0.0001" value={manualEntryInput} onChange={(e: { target: { value: string } }) => setManualEntryInput(e.target.value)} disabled={tradeState.mode !== "manual" || tradeState.currentPosition !== null} />
          </label>
        ) : null}
      </section>
      <section className="info-strip">
        <div>Dataset status: {isDatasetLoading ? "loading" : "ready"}</div>
        <div>Dataset source: {describeSourceType()}</div>
        <div>Parse status: {activeDataset.parseStatus}</div>
        <div>Trade day: {analysis.selectedTradeDay}</div>
        <div>Candidate summary: {selectedCandidate?.summaryReason ?? "none"}</div>
        <div>Current stage: {analysis.stage}</div>
        <div>Can reply now: {analysis.lastReplyEval.canReply ? "Yes" : "No"}</div>
        <div>Current gate: {analysis.lastReplyEval.explanation}</div>
        <div>Trade / practice mode: {replyModeLabel(tradeState.mode)}</div>
        <div>Candidate list filter: {isPracticeMode ? "needs-practice only" : "all scanned days"}</div>
        <div>
          Current position: {tradeState.currentPosition ? `${tradeState.currentPosition.side.toUpperCase()} @ ${tradeState.currentPosition.entryPrice.toFixed(4)} (${entrySemanticsLabel(tradeState.currentPosition.entrySemantics)})` : "Flat"}
        </div>
        <div>Last trade result: {formatTradeResult(tradeState.lastTrade)}</div>
        <div>Cumulative PnL: {formatPnL(tradeState.cumulativePnL)}</div>
        <div>Unlocked target tier: {analysis.recommendedTarget ? `TP${analysis.recommendedTarget}` : "none"}</div>
        <div>Next target gate: {effectiveTargetLevels.find((level) => !level.eligible)?.missingGate ?? "All target tiers unlocked."}</div>
      </section>
      {page === "replay" ? (
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
          <ExplainPanel
            analysis={analysis}
            tradeState={tradeState}
            manualEntrySummary={manualEntryConfigSummary}
            entryGateOpen={entryGateOpen}
            pendingEntrySemantics={resolvedEntryConfig.entrySemantics}
            pendingEntryPrice={resolvedEntryConfig.entryPrice}
          />
        </main>
      ) : (
        <DebugPanel
          analysis={analysis}
          activeDataset={activeDataset}
          candidateTradeDays={availableTradeDays}
          tradeState={tradeState}
          entryGateOpen={entryGateOpen}
          pendingEntrySemantics={resolvedEntryConfig.entrySemantics}
          pendingEntryPrice={resolvedEntryConfig.entryPrice}
          effectiveStopDistance={effectiveStopDistance}
        />
      )}
      <section className="footer-grid">
        <div>
          <h3>Detected candidate dates</h3>
          <ul>
            {visibleCandidateTradeDays.map((candidate) => (
              <li key={candidate.date}>{candidate.date} — {candidate.template} — {candidate.valid ? "valid" : "invalid"} — {candidate.summaryReason}</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="footer-grid">
        <div>
          <h3>Target ladder</h3>
          <ul>
            {effectiveTargetLevels.map((level) => (
              <li key={level.tier}>TP{level.tier}: {level.status} @ {level.price.toFixed(4)} — {level.reason}{level.missingGate ? ` Missing gate: ${level.missingGate}` : ""}</li>
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
            <li>Strategy entry: {formatPrice(tradeState.currentPosition?.strategyEntryPrice ?? analysis.entryPrice)}</li>
            <li>Manual execution price: {formatPrice(tradeState.currentPosition?.manualExecutionPrice)}</li>
            <li>Trade PnL entry basis: {formatPrice(tradeState.currentPosition?.entryPrice ?? resolvedEntryConfig.entryPrice)}</li>
            <li>Entry semantics: {entrySemanticsLabel(tradeState.currentPosition?.entrySemantics ?? resolvedEntryConfig.entrySemantics)}</li>
          </ul>
        </div>
        <div>
          <h3>Diagnostics</h3>
          <ul>
            <li>Pair index file: {selectedDataset?.indexPath}</li>
            <li>Event file: {selectedCandidate?.datasetPath}</li>
            <li>Dataset source: {describeSourceType()}</li>
            <li>Bars loaded: {activeDataset.bars1m.length}</li>
            <li>Parse errors: {activeDataset.parseErrors.join(" | ") || "none"}</li>
            <li>Accepted formats / notes: {activeDataset.parseDiagnostics.join(" | ") || "none"}</li>
            <li>Replay range: {analysis.replayStartIndex} → {analysis.replayEndIndex}</li>
            <li>Invalid messages: {analysis.invalidReasons.join(" | ") || "none"}</li>
            <li>Manual gate source: {analysis.lastReplyEval.explanation}</li>
            <li>Trade entry semantics in use: {entrySemanticsLabel(tradeState.currentPosition?.entrySemantics ?? resolvedEntryConfig.entrySemantics)}</li>
            <li>Effective stop distance: {formatPrice(effectiveStopDistance)}</li>
            <li>Event window: {activeDataset.metadata.eventWindow.startDate} → {activeDataset.metadata.eventWindow.endDate}</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

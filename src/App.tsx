import { useEffect, useMemo, useRef, useState } from "react";
import {
  createUserDatasetManifest,
  fileToDatasetFile,
  getBuiltinSampleManifest,
  loadParsedDataset,
} from "./data/loadDatasets";
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
  DatasetFile,
  DatasetManifestItem,
  ParsedDataset,
  ReplayMode,
  ReplayPnLState,
  SelectedTradeDayState,
  Timeframe,
  TradeExecution,
  TradeEntrySemantics,
  TradeSide,
  UserDatasetSource,
} from "./types/domain";
import { ChartPanel } from "./ui/ChartPanel";
import { ExplainPanel } from "./ui/ExplainPanel";
import { DebugPanel } from "./ui/DebugPanel";

const tfs: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1D"];
const speedOptions = [150, 400, 800];
const builtinSampleManifest = getBuiltinSampleManifest();

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
const describeSourceType = (sourceType: UserDatasetSource) => {
  if (sourceType === "sample") return "Built-in sample";
  if (sourceType === "single-file") return "User single file";
  return "User folder batch";
};
const datasetLabelText = (dataset: DatasetManifestItem) =>
  `${dataset.label.replace(/\.(csv|json)$/i, "").toUpperCase()}${
    dataset.isSample ? " (sample mode)" : ""
  }`;
const toDatasetMap = (files: DatasetFile[]) => new Map(files.map((file) => [file.id, file]));

const folderPickerProps = {
  multiple: true,
  webkitdirectory: "",
  directory: "",
} as const as Record<string, string | boolean>;

export default function App() {
  const [page, setPage] = useState<"replay" | "debug">("replay");
  const [userDatasetFiles, setUserDatasetFiles] = useState<DatasetFile[]>([]);
  const [datasetId, setDatasetId] = useState(builtinSampleManifest[0]?.id ?? "");
  const [activeDataset, setActiveDataset] = useState<ParsedDataset | null>(null);
  const [isDatasetLoading, setIsDatasetLoading] = useState(true);
  const [isImportingDatasets, setIsImportingDatasets] = useState(false);
  const [datasetImportMessage, setDatasetImportMessage] = useState(
    "Built-in sample mode ready. You can also load local CSV/JSON data.",
  );
  const [timeframe, setTimeframe] = useState<Timeframe>("5m");
  const [mode, setMode] = useState<ReplayMode>("pause");
  const [speed, setSpeed] = useState(400);
  const [currentBarIndex, setCurrentBarIndex] = useState(0);
  const [selectedTradeDay, setSelectedTradeDay] = useState("");
  const [tradeState, setTradeState] = useState<ReplayPnLState>(
    createReplayPnLState("auto"),
  );
  const [manualEntryMode, setManualEntryMode] = useState<ManualEntryMode>("strategy");
  const [manualEntryInput, setManualEntryInput] = useState("");
  const [practiceFilterEnabled, setPracticeFilterEnabled] = useState(false);
  const [chartViewport, setChartViewport] = useState({ startIndex: 0, endIndex: 0 });
  const tradeIdRef = useRef(0);
  const previousBarsLengthRef = useRef(0);
  const semiPendingStopRef = useRef<number | null>(null);

  const datasets = useMemo(
    () => [...builtinSampleManifest, ...createUserDatasetManifest(userDatasetFiles)],
    [userDatasetFiles],
  );
  const datasetFilesById = useMemo(() => toDatasetMap(userDatasetFiles), [userDatasetFiles]);

  useEffect(() => {
    if (!datasets.some((item) => item.id === datasetId)) {
      setDatasetId(datasets[0]?.id ?? "");
    }
  }, [datasets, datasetId]);

  useEffect(() => {
    const selectedDataset =
      datasets.find((item) => item.id === datasetId) ?? datasets[0];
    if (!selectedDataset) return;

    let cancelled = false;
    setIsDatasetLoading(true);
    setMode("pause");

    loadParsedDataset(selectedDataset, datasetFilesById)
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
  }, [datasetFilesById, datasets, datasetId]);

  const importDatasets = async (
    files: FileList | File[],
    sourceType: Exclude<UserDatasetSource, "sample">,
  ) => {
    const selectedFiles = Array.from(files);
    setIsImportingDatasets(true);

    try {
      const imported = (
        await Promise.all(selectedFiles.map((file) => fileToDatasetFile(file, sourceType)))
      ).filter((file): file is DatasetFile => file !== null);

      setUserDatasetFiles(imported);

      if (imported.length > 0) {
        setDatasetId(imported[0].id);
        setDatasetImportMessage(
          `${describeSourceType(sourceType)} loaded: ${imported.length} dataset${
            imported.length === 1 ? "" : "s"
          } scanned for Candidate Day 3 dates.`,
        );
      } else {
        setDatasetImportMessage(
          `No supported CSV/JSON files were found in the ${sourceType === "single-file" ? "selected file" : "selected folder"}.`,
        );
      }
    } finally {
      setIsImportingDatasets(false);
    }
  };

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

  const isPracticeMode = tradeState.mode === "manual" || practiceFilterEnabled;

  const visibleCandidateTradeDays = useMemo<CandidateTradeDay[]>(() => {
    const candidates = selectedTradeDayState?.availableTradeDays ?? [];
    return isPracticeMode
      ? candidates.filter(
          (candidate) => candidate.practiceStatus === "needs-practice",
        )
      : candidates;
  }, [isPracticeMode, selectedTradeDayState]);

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
    if (!selectedTradeDayState) return;

    const explicitSelection = selectedTradeDay;
    if (
      explicitSelection &&
      selectedTradeDayState.availableTradeDays.some(
        (candidate) => candidate.date === explicitSelection,
      )
    ) {
      return;
    }

    const nextTradeDay = visibleCandidateTradeDays[0]?.date
      ?? selectedTradeDayState.availableTradeDays[0]?.date
      ?? "";

    if (nextTradeDay !== selectedTradeDayState.selectedTradeDay) {
      setSelectedTradeDay(nextTradeDay);
    }
  }, [selectedTradeDay, selectedTradeDayState, visibleCandidateTradeDays]);

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
    if (!analysis) return;
    if (mode !== "auto") return;
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

  const selectedDataset = datasets.find((item) => item.id === datasetId) ?? datasets[0] ?? null;
  const selectedDatasetLabel = selectedDataset ? datasetLabelText(selectedDataset) : "UNKNOWN";
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
            Built-in sample mode plus local single-file or folder-batch CSV/JSON loading. No broker API.
          </p>
        </header>
        <section className="upload-grid">
          <div className="upload-card">
            <h3>Data source</h3>
            <p>{datasetImportMessage}</p>
            <div className="upload-actions">
              <label>
                Single file
                <input
                  type="file"
                  accept=".csv,.json"
                  onChange={(e: any) => {
                    const files = e.target.files;
                    if (files?.length) {
                      void importDatasets(files, "single-file");
                      e.target.value = "";
                    }
                  }}
                />
              </label>
              <label>
                Folder batch
                <input
                  type="file"
                  accept=".csv,.json"
                  {...folderPickerProps}
                  onChange={(e: any) => {
                    const files = e.target.files;
                    if (files?.length) {
                      void importDatasets(files, "folder-batch");
                      e.target.value = "";
                    }
                  }}
                />
              </label>
            </div>
          </div>
        </section>
        <section className="control-grid">
        <button
          className={page === "replay" ? "active-toggle" : ""}
          onClick={() => setPage("replay")}
        >
          Replay Page
        </button>
        <button
          className={page === "debug" ? "active-toggle" : ""}
          onClick={() => setPage("debug")}
        >
          Debug Page
        </button>
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
                  {datasetLabelText(dataset)}
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
              disabled
            >
              <option value="">
                {activeDataset?.parseStatus === "error"
                  ? "Dataset scan unavailable"
                  : "Load and scan a dataset first"}
              </option>
            </select>
          </label>
        </section>
        <section className="info-strip">
          <div>
            {isDatasetLoading || isImportingDatasets
              ? "Loading dataset…"
              : activeDataset?.parseStatus === "error"
                ? "Dataset parse failed."
                : "Dataset scan pending or unavailable."}
          </div>
          <div>Dataset source: {selectedDataset ? describeSourceType(selectedDataset.sourceType) : "none"}</div>
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
                <li>Dataset source: {describeSourceType(selectedDataset?.sourceType ?? "sample")}</li>
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

  const setReplyMode = (nextMode: ReplayPnLState["mode"]) => {
    setTradeState(resetTradeState(nextMode));
  };
  const resetReplay = () => {
    semiPendingStopRef.current = null;
    setReplayBehavior("pause");
    setCurrentBarIndex(analysis.replayStartIndex);
    setTradeState((prev) => resetTradeState(prev.mode));
  };
  const nextStep = () => {
    setReplayBehavior("advanceToNextStage");
  };
  const playAuto = () => setReplayBehavior("auto");
  const playSemi = () => setReplayBehavior("semi");
  const continueNextStep = () => {
    setReplayBehavior("pause");
    nextStep();
  };
  const manualTradeDisabled =
    tradeState.mode !== "manual" ||
    tradeState.currentPosition !== null ||
    !analysis.lastReplyEval.canReply;
  const manualSide = tradeSideForTemplate(analysis.template);
  const entryGateOpen = analysis.visibleEvents.some(
    (event) =>
      event.stage === "entry" &&
      event.title === "Entry valid" &&
      event.visibleFromIndex <= currentBarIndex,
  );
  const current1mBar = analysis.timeframeBars["1m"][currentBarIndex];
  const parsedManualEntryInput = Number(manualEntryInput);
  const hasManualEntryInput =
    manualEntryInput.trim().length > 0 && Number.isFinite(parsedManualEntryInput);
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
    tradeState.currentPosition?.entryPrice ??
    resolvedEntryConfig.entryPrice ??
    analysis.entryPrice;
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
    const bar = analysis.timeframeBars["1m"][currentBarIndex];
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
          Built-in sample mode plus local single-file or folder-batch CSV/JSON loading. No broker API.
        </p>
      </header>
      <section className="upload-grid">
        <div className="upload-card">
          <h3>Choose local data</h3>
          <p>{datasetImportMessage}</p>
          <div className="upload-actions">
            <label>
              Single file
              <input
                type="file"
                accept=".csv,.json"
                onChange={(e: any) => {
                  const files = e.target.files;
                  if (files?.length) {
                    void importDatasets(files, "single-file");
                    e.target.value = "";
                  }
                }}
              />
            </label>
            <label>
              Folder batch
              <input
                type="file"
                accept=".csv,.json"
                {...folderPickerProps}
                onChange={(e: any) => {
                  const files = e.target.files;
                  if (files?.length) {
                    void importDatasets(files, "folder-batch");
                    e.target.value = "";
                  }
                }}
              />
            </label>
          </div>
          <p className="upload-note">
            After loading, the app scans the dataset first and then refreshes Candidate Day 3 options.
          </p>
        </div>
      </section>
      <section className="control-grid">
        <button
          className={page === "replay" ? "active-toggle" : ""}
          onClick={() => setPage("replay")}
        >
          Replay Page
        </button>
        <button
          className={page === "debug" ? "active-toggle" : ""}
          onClick={() => setPage("debug")}
        >
          Debug Page
        </button>
        <label>
          Dataset
          <select
            value={datasetId}
            onChange={(e: { target: { value: string } }) => setDatasetId(e.target.value)}
          >
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {datasetLabelText(dataset)}
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
            {visibleCandidateTradeDays.length ? (
              visibleCandidateTradeDays.map((candidate) => (
                <option key={candidate.date} value={candidate.date}>
                  {candidate.date} · {candidate.template} · {candidate.valid ? "valid" : "invalid"}
                </option>
              ))
            ) : (
              <option value="">No scanned candidates for current dataset</option>
            )}
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
          Trade / practice mode
          <select
            value={tradeState.mode}
            onChange={(e: { target: { value: string } }) =>
              setReplyMode(e.target.value as ReplayPnLState["mode"])
            }
          >
            <option value="auto">Auto Reply</option>
            <option value="manual">Manual Reply</option>
          </select>
        </label>
        <label>
          Candidate list filter
          <select
            value={practiceFilterEnabled ? "needs-practice" : "all"}
            onChange={(e: { target: { value: string } }) =>
              setPracticeFilterEnabled(e.target.value === "needs-practice")
            }
          >
            <option value="all">Show all scanned days</option>
            <option value="needs-practice">Show needs-practice only</option>
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
        <button onClick={continueNextStep}>Continue / Next step</button>
      </section>
      <section className="control-grid">
        <button
          onClick={() => openManualTrade("long")}
          disabled={manualTradeDisabled || manualSide === "short" || !entryGateOpen || !manualEntryPriceReady}
        >
          Enter Long
        </button>
        <button
          onClick={() => openManualTrade("short")}
          disabled={manualTradeDisabled || manualSide === "long" || !entryGateOpen || !manualEntryPriceReady}
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
        <label>
          Manual entry basis
          <select
            value={manualEntryMode}
            onChange={(e: { target: { value: string } }) =>
              setManualEntryMode(e.target.value as ManualEntryMode)
            }
            disabled={tradeState.mode !== "manual" || tradeState.currentPosition !== null}
          >
            {manualEntryModeOptions.map((option) => (
              <option key={option} value={option}>
                {option === "strategy"
                  ? "Strategy entry"
                  : option === "user"
                    ? "User-specified price"
                    : "Current bar close"}
              </option>
            ))}
          </select>
        </label>
        {manualEntryMode === "user" ? (
          <label>
            Manual execution price
            <input
              type="number"
              step="0.0001"
              value={manualEntryInput}
              onChange={(e: { target: { value: string } }) => setManualEntryInput(e.target.value)}
              disabled={tradeState.mode !== "manual" || tradeState.currentPosition !== null}
            />
          </label>
        ) : null}
      </section>
      <section className="info-strip">
        <div>Dataset status: {isDatasetLoading || isImportingDatasets ? "loading" : "ready"}</div>
        <div>Dataset source: {describeSourceType(selectedDataset?.sourceType ?? "sample")}</div>
        <div>Parse status: {activeDataset.parseStatus}</div>
        <div>Trade day: {analysis.selectedTradeDay}</div>
        <div>Candidate summary: {selectedCandidate?.summaryReason ?? "none"}</div>
        <div>Current stage: {analysis.stage}</div>
        <div>Can reply now: {analysis.lastReplyEval.canReply ? "Yes" : "No"}</div>
        <div>Current gate: {analysis.lastReplyEval.explanation}</div>
        <div>Trade / practice mode: {replyModeLabel(tradeState.mode)}</div>
        <div>Candidate list filter: {isPracticeMode ? "needs-practice only" : "all scanned days"}</div>
        <div>
          Current position: {tradeState.currentPosition
            ? `${tradeState.currentPosition.side.toUpperCase()} @ ${tradeState.currentPosition.entryPrice.toFixed(4)} (${entrySemanticsLabel(tradeState.currentPosition.entrySemantics)})`
            : "Flat"}
        </div>
        <div>Last trade result: {formatTradeResult(tradeState.lastTrade)}</div>
        <div>Cumulative PnL: {formatPnL(tradeState.cumulativePnL)}</div>
        <div>
          Unlocked target tier: {analysis.recommendedTarget ? `TP${analysis.recommendedTarget}` : "none"}
        </div>
        <div>
          Next target gate: {effectiveTargetLevels.find((level) => !level.eligible)?.missingGate ?? "All target tiers unlocked."}
        </div>
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
          candidateTradeDays={selectedTradeDayState?.availableTradeDays ?? []}
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
            {effectiveTargetLevels.map((level) => (
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
            <li>Strategy entry: {formatPrice(tradeState.currentPosition?.strategyEntryPrice ?? analysis.entryPrice)}</li>
            <li>Manual execution price: {formatPrice(tradeState.currentPosition?.manualExecutionPrice)}</li>
            <li>Trade PnL entry basis: {formatPrice(tradeState.currentPosition?.entryPrice ?? resolvedEntryConfig.entryPrice)}</li>
            <li>Entry semantics: {entrySemanticsLabel(tradeState.currentPosition?.entrySemantics ?? resolvedEntryConfig.entrySemantics)}</li>
          </ul>
        </div>
        <div>
          <h3>Diagnostics</h3>
          <ul>
            <li>Dataset file: {activeDataset.sourceLabel}</li>
            <li>Dataset source: {describeSourceType(selectedDataset?.sourceType ?? "sample")}</li>
            <li>Bars loaded: {activeDataset.bars1m.length}</li>
            <li>Parse errors: {activeDataset.parseErrors.join(" | ") || "none"}</li>
            <li>Accepted formats / notes: {activeDataset.parseDiagnostics.join(" | ") || "none"}</li>
            <li>Replay range: {analysis.replayStartIndex} → {analysis.replayEndIndex}</li>
            <li>Invalid messages: {analysis.invalidReasons.join(" | ") || "none"}</li>
            <li>Manual gate source: {analysis.lastReplyEval.explanation}</li>
            <li>Trade entry semantics in use: {entrySemanticsLabel(tradeState.currentPosition?.entrySemantics ?? resolvedEntryConfig.entrySemantics)}</li>
            <li>Effective stop distance: {formatPrice(effectiveStopDistance)}</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

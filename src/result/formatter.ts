import { aggregateFrom1m, ema } from '../aggregation/timeframe';
import { detectCandidates, evaluateDay } from '../strategy/engine';
import type {
  DebugPayload,
  FrontendScreenedPayload,
  ImportedSignalRow,
  InternalCandidateAnalysis,
  OhlcvBar,
  ReplyMode,
  ScreenedResultRow,
  StrategyLine,
  SymbolDataset,
  Timeframe,
} from '../types/domain';

const emptyPayload = (): { payload: FrontendScreenedPayload; debug: DebugPayload } => ({
  payload: {
    importedSignalRows: [],
    screenedResults: [],
    activeSymbol: '',
    bars: [],
    dayChoices: [],
    selectedDay: '',
    fullDayBars: [],
    revealedBars: [],
    revealedEma20: [],
    dayAnalysis: {
      explain: {
        template: 'NONE',
        bias: 'NEUTRAL',
        stage: 'No dataset loaded',
        missingConditions: ['Backend dataset response did not include any datasets.'],
        reasons: ['No backend dataset available for analysis.'],
        evidenceDetails: [],
        entryAllowed: false,
        targetTier: null,
        targetAssessments: [],
        ruleTrace: [],
      },
      annotations: [],
    },
    replayDefaults: {
      replayStartIndex: 0,
      replayEndIndex: 0,
    },
    replayMeta: {
      currentBarIndex: 0,
      scopeLabel: "Day 3 replay starts from the selected NY day's first intraday bar and ends at that day's last intraday bar.",
    },
  },
  debug: {
    candidatesBySymbol: {},
    internalCandidateAnalysis: [],
  },
});

interface FormatterConfig {
  datasets: SymbolDataset[];
  lineFilter: { enableFGD: boolean; enableFRD: boolean };
  replyMode: ReplyMode;
  symbol: string;
  timeframe: Timeframe;
  line: StrategyLine;
  practiceOnly: boolean;
  selectedDate?: string;
  manualTrade: { entry: number; exit: number };
  replayWindow?: { currentBarIndex: number; replayStartIndex: number; replayEndIndex: number };
}

const toScreenedRow = (analysis: InternalCandidateAnalysis, replyMode: ReplyMode): ScreenedResultRow => {
  const replayAvailable = analysis.dayAnalysis.explain.entryAllowed;
  const validity: ScreenedResultRow['validity'] = replayAvailable ? 'pass' : 'fail';

  return {
    symbol: analysis.symbol,
    candidateDate: analysis.candidate.date,
    lineType: analysis.candidate.type,
    validity,
    replayAvailable,
    recommendedNextAction: replayAvailable
      ? `Run ${replyMode === 'auto' ? 'Auto Reply' : 'Manual Reply'} replay`
      : 'Skip until setup conditions become valid',
    currentTargetTier: analysis.dayAnalysis.explain.targetTier,
  };
};

const toImportedSignalRow = (analysis: InternalCandidateAnalysis): ImportedSignalRow => ({
  pair: analysis.symbol,
  date: analysis.candidate.date,
  signal: analysis.candidate.type,
  status: analysis.dayAnalysis.explain.entryAllowed ? 'pass' : 'fail',
  notes: 'Derived candidate from frontend analysis over replayable 1m bars.',
});

const buildReplayPayload = (dayBars: OhlcvBar[], replayWindow?: FormatterConfig['replayWindow']) => {
  const replayStartIndex = 0;
  const replayEndIndex = Math.max(dayBars.length - 1, 0);
  const requestedIndex = replayWindow?.currentBarIndex ?? replayStartIndex;
  const boundedIndex = Math.min(Math.max(requestedIndex, replayStartIndex), replayEndIndex);
  const currentBarIndex = dayBars.length ? boundedIndex : 0;
  const revealedBars = dayBars.length ? dayBars.slice(0, currentBarIndex + 1) : [];

  return {
    replayStartIndex,
    replayEndIndex,
    currentBarIndex,
    revealedBars,
    replayScopeLabel: "Day 3 replay starts from the selected NY day's first intraday bar and ends at that day's last intraday bar.",
  };
};

const emptyDayAnalysis = emptyPayload().payload.dayAnalysis;

export const formatFrontendScreenedPayload = (config: FormatterConfig): { payload: FrontendScreenedPayload; debug: DebugPayload } => {
  const { datasets, lineFilter, replyMode, symbol, timeframe, line, practiceOnly, selectedDate, manualTrade, replayWindow } = config;

  if (datasets.length === 0) return emptyPayload();

  const analyzableDatasets = datasets.filter((dataset) => dataset.bars1m.length > 0);
  const internalCandidateAnalysis = analyzableDatasets.flatMap((dataset) => {
    const candidates = detectCandidates(dataset.symbol, dataset.bars1m).filter(
      (candidate) => (candidate.type === 'FGD' && lineFilter.enableFGD) || (candidate.type === 'FRD' && lineFilter.enableFRD),
    );

    return candidates.map((candidate) => ({
      symbol: dataset.symbol,
      candidate,
      dayAnalysis: evaluateDay(candidate.type, dataset.bars1m, candidate.date, replyMode, { entry: 0, exit: 0 }, dataset.symbol),
    }));
  });

  const active = datasets.find((dataset) => dataset.symbol === symbol) ?? datasets[0];
  const importedSignalRows = active.importedSignals.length
    ? active.importedSignals
    : internalCandidateAnalysis.filter((analysis) => analysis.symbol === active.symbol).map((analysis) => toImportedSignalRow(analysis));
  const screenedResults = internalCandidateAnalysis.map((analysis) => toScreenedRow(analysis, replyMode)).filter((row) => row.validity === 'pass');

  const bars = active.bars1m.length > 0 ? aggregateFrom1m(active.bars1m, timeframe) : [];
  const allDayChoices = [...new Set(bars.map((bar) => bar.time.slice(0, 10)))];
  const screenedDayChoices = screenedResults.filter((row) => row.symbol === active.symbol).map((row) => row.candidateDate);
  const fallbackImportedDates = importedSignalRows.map((row) => row.date);
  const dayChoices = practiceOnly
    ? screenedDayChoices.length
      ? screenedDayChoices
      : fallbackImportedDates
    : allDayChoices.length
      ? allDayChoices
      : fallbackImportedDates;
  const selectedDayValue = selectedDate || dayChoices[0] || bars[bars.length - 1]?.time.slice(0, 10) || importedSignalRows[0]?.date || '';

  const fullDayBars = bars.filter((bar) => bar.time.slice(0, 10) === selectedDayValue);
  const replayPayload = buildReplayPayload(fullDayBars, replayWindow);
  const lastRevealedTime = replayPayload.revealedBars[replayPayload.revealedBars.length - 1]?.time ?? '';
  const revealedDayBars1m = active.bars1m.filter((bar) => bar.time <= lastRevealedTime);
  const dayAnalysis = selectedDayValue && active.bars1m.length > 0
    ? evaluateDay(line, revealedDayBars1m, selectedDayValue, replyMode, manualTrade, active.symbol)
    : {
        ...emptyDayAnalysis,
        explain: {
          ...emptyDayAnalysis.explain,
          stage: active.bars1mStatus === 'metadata-only' ? 'Metadata imported; replay bars unavailable' : 'Sample/synthetic mode',
          missingConditions: active.bars1mStatus === 'metadata-only'
            ? ['Backend imported metadata only. Real replayable 1m bars are required before intraday chart/replay can run.']
            : ['Current dataset is sample/synthetic and should not be mistaken for imported real 1m bars.'],
          reasons: active.bars1mStatus === 'metadata-only'
            ? ['Showing imported pair/date/signal summary only; frontend analysis waits for real 1m bars.']
            : ['Showing sample/synthetic bars for local runnable fallback.'],
        },
      };

  return {
    payload: {
      importedSignalRows,
      screenedResults,
      activeSymbol: active.symbol,
      bars,
      dayChoices,
      selectedDay: selectedDayValue,
      fullDayBars,
      revealedBars: replayPayload.revealedBars,
      revealedEma20: ema(replayPayload.revealedBars, 20),
      dayAnalysis,
      replayDefaults: {
        replayStartIndex: replayPayload.replayStartIndex,
        replayEndIndex: replayPayload.replayEndIndex,
      },
      replayMeta: {
        currentBarIndex: replayPayload.currentBarIndex,
        scopeLabel: replayPayload.replayScopeLabel,
      },
    },
    debug: {
      candidatesBySymbol: Object.fromEntries(analyzableDatasets.map((dataset) => [dataset.symbol, detectCandidates(dataset.symbol, dataset.bars1m)])),
      internalCandidateAnalysis,
    },
  };
};

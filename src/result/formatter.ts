import { aggregateFrom1m } from '../aggregation/timeframe';
import { dailyBucketKeyNy } from '../utils/nyDate';
import type {
  DebugPayload,
  FrontendScreenedPayload,
  InternalCandidateAnalysis,
  ReplayDayAnalysis,
  ReplyMode,
  ScreenedResultRow,
  StaticSymbolAnalysis,
  SymbolDataset,
  Timeframe,
} from '../types/domain';

const replayScopeLabel = "Day 3 replay starts from the selected NY day's first intraday bar and ends at that day's last intraday bar.";

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
      scopeLabel: replayScopeLabel,
    },
  },
  debug: {
    candidatesBySymbol: {},
    internalCandidateAnalysis: [],
  },
});

interface FormatterConfig {
  datasets: SymbolDataset[];
  staticAnalysisBySymbol: Record<string, StaticSymbolAnalysis>;
  replyMode: ReplyMode;
  symbol: string;
  timeframe: Timeframe;
  practiceOnly: boolean;
  selectedDay?: string;
  replayDayAnalysis?: ReplayDayAnalysis;
  currentBarIndex: number;
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

const emptyDayAnalysis = emptyPayload().payload.dayAnalysis;

export const formatFrontendScreenedPayload = (config: FormatterConfig): { payload: FrontendScreenedPayload; debug: DebugPayload } => {
  const { datasets, staticAnalysisBySymbol, replyMode, symbol, timeframe, practiceOnly, selectedDay, replayDayAnalysis, currentBarIndex } = config;

  if (datasets.length === 0) return emptyPayload();

  const active = datasets.find((dataset) => dataset.symbol === symbol) ?? datasets[0];
  const internalCandidateAnalysis = Object.values(staticAnalysisBySymbol).flatMap((analysis) => analysis.candidateAnalysis);
  const importedSignalRows = active.importedSignals;
  const screenedResults = internalCandidateAnalysis.map((analysis) => toScreenedRow(analysis, replyMode)).filter((row) => row.validity === 'pass');
  const bars = active.bars1m.length > 0 ? aggregateFrom1m(active.bars1m, timeframe) : [];
  const screenedDayChoices = screenedResults.filter((row) => row.symbol === active.symbol).map((row) => row.candidateDate);
  const fallbackImportedDates = importedSignalRows.map((row) => row.date);
  const allDayChoices = [...new Set(bars.map((bar) => dailyBucketKeyNy(bar.time)))];
  const dayChoices = practiceOnly
    ? screenedDayChoices.length
      ? screenedDayChoices
      : fallbackImportedDates
    : allDayChoices.length
      ? allDayChoices
      : fallbackImportedDates;
  const selectedDayValue = selectedDay || dayChoices[0] || (bars.length > 0 ? dailyBucketKeyNy(bars[bars.length - 1].time) : '') || importedSignalRows[0]?.date || '';

  const replayStartIndex = replayDayAnalysis?.replayStartIndex ?? 0;
  const replayEndIndex = replayDayAnalysis?.replayEndIndex ?? 0;
  const boundedIndex = replayDayAnalysis
    ? Math.min(Math.max(currentBarIndex, replayStartIndex), replayEndIndex)
    : 0;
  const currentSnapshot = replayDayAnalysis?.snapshots[boundedIndex];

  return {
    payload: {
      importedSignalRows,
      screenedResults,
      activeSymbol: active.symbol,
      bars,
      dayChoices,
      selectedDay: selectedDayValue,
      fullDayBars: replayDayAnalysis?.fullDayBars ?? [],
      revealedBars: currentSnapshot?.revealedBars ?? [],
      revealedEma20: currentSnapshot?.revealedEma20 ?? [],
      dayAnalysis: currentSnapshot?.dayAnalysis ?? emptyDayAnalysis,
      replayDefaults: {
        replayStartIndex,
        replayEndIndex,
      },
      replayMeta: {
        currentBarIndex: boundedIndex,
        scopeLabel: replayDayAnalysis?.replayScopeLabel ?? replayScopeLabel,
      },
    },
    debug: {
      candidatesBySymbol: Object.fromEntries(
        Object.entries(staticAnalysisBySymbol).map(([datasetSymbol, analysis]) => [datasetSymbol, analysis.candidates]),
      ),
      internalCandidateAnalysis,
    },
  };
};

import { aggregateFrom1m, ema } from '../aggregation/timeframe';
import { detectCandidates, evaluateDay } from '../strategy/engine';
import type {
  DebugPayload,
  FrontendScreenedPayload,
  InternalCandidateAnalysis,
  ReplyMode,
  ScreenedResultRow,
  StrategyLine,
  SymbolDataset,
  Timeframe,
} from '../types/domain';

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

export const formatFrontendScreenedPayload = (config: FormatterConfig): { payload: FrontendScreenedPayload; debug: DebugPayload } => {
  const { datasets, lineFilter, replyMode, symbol, timeframe, line, practiceOnly, selectedDate, manualTrade } = config;

  const internalCandidateAnalysis = datasets.flatMap((dataset) => {
    const candidates = detectCandidates(dataset.symbol, dataset.bars1m).filter(
      (candidate) => (candidate.type === 'FGD' && lineFilter.enableFGD) || (candidate.type === 'FRD' && lineFilter.enableFRD)
    );

    return candidates.map((candidate) => ({
      symbol: dataset.symbol,
      candidate,
      dayAnalysis: evaluateDay(candidate.type, aggregateFrom1m(dataset.bars1m, '5m'), candidate.date, replyMode, { entry: 0, exit: 0 }),
    }));
  });

  const screenedResults = internalCandidateAnalysis.map((analysis) => toScreenedRow(analysis, replyMode)).filter((row) => row.validity === 'pass');

  const active = datasets.find((dataset) => dataset.symbol === symbol) ?? datasets[0];
  const bars = aggregateFrom1m(active.bars1m, timeframe);

  const allDayChoices = [...new Set(bars.map((bar) => bar.time.slice(0, 10)))];
  const screenedDayChoices = screenedResults.filter((row) => row.symbol === active.symbol).map((row) => row.candidateDate);
  const dayChoices = practiceOnly ? screenedDayChoices : allDayChoices;
  const selectedDayValue = selectedDate || dayChoices[0] || bars[bars.length - 1]?.time.slice(0, 10);

  const dayAnalysis = evaluateDay(line, aggregateFrom1m(active.bars1m, '5m'), selectedDayValue, replyMode, manualTrade);
  const dayBars = bars.filter((bar) => bar.time.slice(0, 10) === selectedDayValue);

  return {
    payload: {
      screenedResults,
      activeSymbol: active.symbol,
      bars,
      dayChoices,
      selectedDay: selectedDayValue,
      dayBars,
      ema20: ema(dayBars, 20),
      dayAnalysis,
    },
    debug: {
      candidatesBySymbol: Object.fromEntries(datasets.map((dataset) => [dataset.symbol, detectCandidates(dataset.symbol, dataset.bars1m)])),
      internalCandidateAnalysis,
    },
  };
};

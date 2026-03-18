import { aggregateFrom1m, ema } from '../aggregation/timeframe';
import { buildStrategyPreprocessingContext, detectCandidates, evaluateDay } from './engine';
import { dailyBucketKeyNy } from '../utils/nyDate';
import type {
  OhlcvBar,
  ReplyMode,
  ReplayDayAnalysis,
  ReplaySnapshot,
  StaticSymbolAnalysis,
  SymbolDataset,
  Timeframe,
} from '../types/domain';

const replayScopeLabel = "Day 3 replay starts from the selected NY day's first intraday bar and ends at that day's last intraday bar.";

export const buildStaticSymbolAnalysis = (
  dataset: SymbolDataset,
  replyMode: ReplyMode,
  lineFilter: { enableFGD: boolean; enableFRD: boolean },
): StaticSymbolAnalysis => {
  const context = buildStrategyPreprocessingContext(dataset.bars1m);
  const candidates = detectCandidates(dataset.symbol, context).filter(
    (candidate) => (candidate.type === 'FGD' && lineFilter.enableFGD) || (candidate.type === 'FRD' && lineFilter.enableFRD),
  );

  return {
    symbol: dataset.symbol,
    context,
    candidates,
    candidateAnalysis: candidates.map((candidate) => ({
      symbol: dataset.symbol,
      candidate,
      dayAnalysis: evaluateDay(candidate.type, candidate.date, replyMode, { entry: 0, exit: 0 }, context, dataset.symbol),
    })),
  };
};

const toDayChoices = (bars: OhlcvBar[], importedDates: string[], timeframe: Timeframe, practiceOnly: boolean, screenedDates: string[]): string[] => {
  const aggregatedBars = bars.length > 0 ? aggregateFrom1m(bars, timeframe) : [];
  const allDayChoices = [...new Set(aggregatedBars.map((bar) => dailyBucketKeyNy(bar.time)))];
  const practiceDayChoices = [...new Set(screenedDates)];

  return practiceOnly
    ? practiceDayChoices.length
      ? practiceDayChoices
      : importedDates
    : allDayChoices.length
      ? [...new Set([...practiceDayChoices, ...allDayChoices])]
      : importedDates;
};

export const resolveSelectedDay = (params: {
  dataset?: SymbolDataset;
  importedDates: string[];
  timeframe: Timeframe;
  practiceOnly: boolean;
  screenedDates: string[];
  requestedDate?: string;
}): { dayChoices: string[]; selectedDay: string } => {
  const { dataset, importedDates, timeframe, practiceOnly, screenedDates, requestedDate } = params;
  const bars = dataset?.bars1m ?? [];
  const dayChoices = toDayChoices(bars, importedDates, timeframe, practiceOnly, screenedDates);
  const selectedDay = requestedDate || dayChoices[0] || (bars.length > 0 ? dailyBucketKeyNy(bars[bars.length - 1].time) : '') || importedDates[0] || '';

  return { dayChoices, selectedDay };
};

export const buildReplayDayAnalysis = (params: {
  dataset?: SymbolDataset;
  selectedDay: string;
  line: 'FGD' | 'FRD';
  replyMode: ReplyMode;
  manualTrade: { entry: number; exit: number };
}): ReplayDayAnalysis | undefined => {
  const { dataset, selectedDay, line, replyMode, manualTrade } = params;
  if (!dataset || dataset.bars1m.length === 0 || !selectedDay) return undefined;

  const fullContext = buildStrategyPreprocessingContext(dataset.bars1m);
  const fullDayBars = fullContext.barsByNyDate[selectedDay] ?? [];
  const replayStartIndex = 0;
  const replayEndIndex = Math.max(fullDayBars.length - 1, 0);

  const snapshots: ReplaySnapshot[] = fullDayBars.map((bar, index) => {
    const absoluteEndIndex = fullContext.timeToIndex[bar.time];
    const revealedBars1m = absoluteEndIndex === undefined ? dataset.bars1m : dataset.bars1m.slice(0, absoluteEndIndex + 1);
    const revealedContext = buildStrategyPreprocessingContext(revealedBars1m);
    const revealedBars = fullDayBars.slice(0, index + 1);

    return {
      currentBarIndex: index,
      dayAnalysis: evaluateDay(line, selectedDay, replyMode, manualTrade, revealedContext, dataset.symbol),
      revealedBars,
      revealedEma20: ema(revealedBars, 20),
    };
  });

  return {
    key: `${dataset.symbol}|${selectedDay}|${line}|${replyMode}|${manualTrade.entry}|${manualTrade.exit}`,
    symbol: dataset.symbol,
    day: selectedDay,
    line,
    replyMode,
    replayStartIndex,
    replayEndIndex,
    replayScopeLabel,
    fullDayBars,
    snapshots,
  };
};

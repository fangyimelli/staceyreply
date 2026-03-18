import type { OhlcvBar, Timeframe } from '../types/domain';
import { strategyNyDate, strategyTime } from '../utils/nyDate';

const minutesByTf: Record<Exclude<Timeframe, '1D'>, number> = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240 };

const bucketStart = (bar: OhlcvBar, minutes: number) => {
  const ms = new Date(strategyTime(bar)).getTime();
  return new Date(Math.floor(ms / (minutes * 60_000)) * minutes * 60_000).toISOString();
};

const aggregateGroup = (group: OhlcvBar[]): OhlcvBar => ({
  time: strategyTime(group[0]),
  normalizedTime: strategyTime(group[0]),
  sourceTime: group[0].sourceTime,
  sourceStartTime: group[0].sourceTime ?? group[0].time,
  sourceEndTime: group[group.length - 1].sourceTime ?? group[group.length - 1].time,
  traceTimes: group.map((bar) => ({
    normalizedTime: strategyTime(bar),
    sourceTime: bar.sourceTime ?? bar.time,
    rawTimeText: bar.rawTimeText,
    rawDateText: bar.rawDateText,
  })),
  timeSemantics: group[0].timeSemantics,
  rawTimeText: group[0].rawTimeText,
  rawDateText: group[0].rawDateText,
  open: group[0].open,
  high: Math.max(...group.map((bar) => bar.high)),
  low: Math.min(...group.map((bar) => bar.low)),
  close: group[group.length - 1].close,
  volume: group.reduce((sum, bar) => sum + bar.volume, 0),
});

export const aggregateBars = (bars: OhlcvBar[], timeframe: Timeframe): OhlcvBar[] => {
  if (timeframe === '1m') return bars;
  const buckets = new Map<string, OhlcvBar[]>();
  if (timeframe === '1D') {
    for (const bar of bars) {
      const key = strategyNyDate(strategyTime(bar));
      (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(bar);
    }
  } else {
    const minutes = minutesByTf[timeframe];
    for (const bar of bars) {
      const key = bucketStart(bar, minutes);
      (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(bar);
    }
  }
  return [...buckets.values()].map(aggregateGroup);
};

import type { OhlcvBar, Timeframe } from '../types/domain';
import { nyDate } from '../utils/nyDate';

const minutesByTf: Record<Exclude<Timeframe, '1D'>, number> = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240 };

const bucketStart = (time: string, minutes: number) => {
  const ms = new Date(time).getTime();
  return new Date(Math.floor(ms / (minutes * 60_000)) * minutes * 60_000).toISOString();
};

export const aggregateBars = (bars: OhlcvBar[], timeframe: Timeframe): OhlcvBar[] => {
  if (timeframe === '1m') return bars;
  const buckets = new Map<string, OhlcvBar[]>();
  if (timeframe === '1D') {
    for (const bar of bars) {
      const key = nyDate(bar.time);
      (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(bar);
    }
  } else {
    const minutes = minutesByTf[timeframe];
    for (const bar of bars) {
      const key = bucketStart(bar.time, minutes);
      (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(bar);
    }
  }
  return [...buckets.values()].map((group) => ({
    time: group[0].time,
    open: group[0].open,
    high: Math.max(...group.map((bar) => bar.high)),
    low: Math.min(...group.map((bar) => bar.low)),
    close: group[group.length - 1].close,
    volume: group.reduce((sum, bar) => sum + bar.volume, 0),
  }));
};

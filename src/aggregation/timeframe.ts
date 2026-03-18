import type { OhlcvBar, Timeframe } from '../types/domain';
import { timeframeBucketKeyNy } from '../utils/nyDate';

const key = (time: string, timeframe: Timeframe): string => {
  if (timeframe === '1m') return time;
  if (timeframe === '1D' || timeframe === '5m' || timeframe === '15m' || timeframe === '1h' || timeframe === '4h') {
    return timeframeBucketKeyNy(time, timeframe);
  }

  return time;
};

export const aggregate = (bars: OhlcvBar[], tf: Timeframe): OhlcvBar[] => {
  if (tf === '1m') return bars;
  const g = new Map<string, OhlcvBar[]>();
  bars.forEach((b) => {
    const k = key(b.time, tf);
    const v = g.get(k) ?? [];
    v.push(b);
    g.set(k, v);
  });
  return [...g.entries()].map(([, v]) => ({ time: v[0].time, open: v[0].open, high: Math.max(...v.map((x) => x.high)), low: Math.min(...v.map((x) => x.low)), close: v[v.length-1].close, volume: v.reduce((s, x) => s + x.volume, 0) }));
};

export const ema20 = (bars: OhlcvBar[]): number[] => {
  const k = 2 / 21; const out: number[] = [];
  bars.forEach((b, i) => out.push(i === 0 ? b.close : b.close * k + out[i-1] * (1-k)));
  return out;
};


export const aggregateFrom1m = aggregate;
export const ema = (bars: OhlcvBar[], period = 20): number[] => {
  if (period === 20) return ema20(bars);
  const k = 2 / (period + 1);
  const out: number[] = [];
  bars.forEach((b, i) => out.push(i === 0 ? b.close : b.close * k + out[i - 1] * (1 - k)));
  return out;
};

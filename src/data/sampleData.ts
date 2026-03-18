import type { OhlcvBar } from '../types/domain';

const iso = (s: string) => new Date(s).toISOString();

const pushMinuteRange = (out: OhlcvBar[], startIso: string, count: number, seed: number, drift: number, amplitude: number) => {
  let price = seed;
  const start = new Date(startIso).getTime();
  for (let i = 0; i < count; i += 1) {
    const swing = Math.sin(i / 9) * amplitude + Math.cos(i / 5) * amplitude * 0.4;
    const open = price;
    const close = Number((price + drift + swing).toFixed(4));
    const high = Number((Math.max(open, close) + amplitude * 1.8 + 0.0004).toFixed(4));
    const low = Number((Math.min(open, close) - amplitude * 1.8 - 0.0004).toFixed(4));
    out.push({ time: new Date(start + i * 60_000).toISOString(), open: Number(open.toFixed(4)), high, low, close, volume: 100 + i });
    price = close;
  }
  return price;
};

export const buildSampleBars = (): OhlcvBar[] => {
  const out: OhlcvBar[] = [];
  pushMinuteRange(out, iso('2025-03-19T13:00:00Z'), 240, 1.108, -0.00018, 0.00012);
  pushMinuteRange(out, iso('2025-03-20T13:00:00Z'), 240, 1.063, 0.00022, 0.0001);

  const tradeStart = new Date('2025-03-21T10:30:00Z').getTime();
  let price = 1.101;
  for (let i = 0; i < 300; i += 1) {
    const time = new Date(tradeStart + i * 60_000).toISOString();
    let delta = 0.00003;
    if (i < 30) delta = -0.00012;
    else if (i < 45) delta = 0.00022;
    else if (i < 70) delta = -0.00005;
    else if (i < 150) delta = 0.00019;
    else delta = 0.00007;
    const open = price;
    const close = Number((price + delta + Math.sin(i / 7) * 0.00004).toFixed(4));
    const low = Number((Math.min(open, close) - (i === 18 ? 0.0011 : 0.00035)).toFixed(4));
    const high = Number((Math.max(open, close) + (i === 82 ? 0.0007 : 0.00032)).toFixed(4));
    out.push({ time, open: Number(open.toFixed(4)), high, low, close, volume: 250 + i });
    price = close;
  }
  return out;
};

export const buildSampleCsv = () => ['time,open,high,low,close,volume', ...buildSampleBars().map((bar) => `${bar.time},${bar.open},${bar.high},${bar.low},${bar.close},${bar.volume}`)].join('\n');

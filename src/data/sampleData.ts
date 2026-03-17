import type { OhlcvBar } from '../types/domain';

export const sampleBars = (): OhlcvBar[] => {
  const out: OhlcvBar[] = []; let p = 1.1000; const start = Date.parse('2025-01-01T00:00:00Z');
  for (let i = 0; i < 60 * 24 * 5; i++) {
    const drift = i < 1440 ? -0.00002 : i < 2880 ? 0.00003 : i < 4320 ? -0.00001 : 0.00003;
    const n = (Math.sin(i / 40) * 0.00005);
    const open = p; const close = p + drift + n; const high = Math.max(open, close) + 0.00008; const low = Math.min(open, close) - 0.00008;
    out.push({ time: new Date(start + i * 60000).toISOString(), open, high, low, close, volume: 100 }); p = close;
  }
  return out;
};

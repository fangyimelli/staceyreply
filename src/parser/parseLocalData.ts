import type { OhlcvBar } from '../types/domain';

const toBar = (r: Record<string, string>): OhlcvBar => ({
  time: r.time,
  open: Number(r.open),
  high: Number(r.high),
  low: Number(r.low),
  close: Number(r.close),
  volume: Number(r.volume)
});

export const parseCsv = (text: string): OhlcvBar[] => {
  const [head, ...rows] = text.trim().split(/\r?\n/);
  const cols = head.split(',').map((c) => c.trim());
  return rows.map((line) => {
    const vals = line.split(',');
    const row: Record<string, string> = {};
    cols.forEach((c, i) => { row[c] = vals[i]; });
    return toBar(row);
  });
};

export const parseJson = (text: string): OhlcvBar[] => (JSON.parse(text) as OhlcvBar[]).map((v) => ({ ...v }));
export const parseFile = async (f: File): Promise<{symbol: string; bars: OhlcvBar[]}> => {
  const t = await f.text();
  const bars = f.name.endsWith('.json') ? parseJson(t) : parseCsv(t);
  return { symbol: f.name.split('.')[0], bars };
};

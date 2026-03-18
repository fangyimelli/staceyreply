import type { DatasetFile, OhlcvBar, ParsedDataset } from '../types/domain';

const normalizeBars = (bars: OhlcvBar[]) => bars
  .filter((bar) => Number.isFinite(bar.open) && Number.isFinite(bar.high) && Number.isFinite(bar.low) && Number.isFinite(bar.close))
  .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

const parseCsv = (raw: string): OhlcvBar[] => {
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  const header = lines[0]?.toLowerCase().split(',').map((item) => item.trim()) ?? [];
  if (header.join(',') !== 'time,open,high,low,close,volume') return [];
  return normalizeBars(lines.slice(1).map((line) => {
    const [time, open, high, low, close, volume] = line.split(',');
    return { time, open: Number(open), high: Number(high), low: Number(low), close: Number(close), volume: Number(volume ?? 0) };
  }));
};

const parseJson = (raw: string): OhlcvBar[] => {
  const payload = JSON.parse(raw) as unknown;
  if (!Array.isArray(payload)) return [];
  return normalizeBars(payload.map((bar) => {
    const item = bar as Record<string, unknown>;
    return {
      time: String(item.time ?? ''),
      open: Number(item.open),
      high: Number(item.high),
      low: Number(item.low),
      close: Number(item.close),
      volume: Number(item.volume ?? 0),
    };
  }));
};

export const parseDatasetFile = (file: DatasetFile): ParsedDataset => ({
  datasetId: file.id,
  symbol: file.label.replace(/\.(csv|json)$/i, '').toUpperCase(),
  bars1m: file.kind === 'csv' ? parseCsv(file.raw) : parseJson(file.raw),
  sourceLabel: file.path,
  isSample: Boolean(file.isSample),
});

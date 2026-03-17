import { Candle, SymbolDataset } from "../types.js";

function toCandle(row: Record<string, string>): Candle {
  return {
    time: row.time,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume ?? 0)
  };
}

function parseCsv(text: string): Candle[] {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const keys = header.split(",").map((k) => k.trim());
  return lines
    .map((line) => line.split(","))
    .map((parts) => Object.fromEntries(parts.map((v, i) => [keys[i], v.trim()])))
    .filter((row) => row.time)
    .map(toCandle);
}

function parseJson(text: string): Candle[] {
  return (JSON.parse(text) as Record<string, string>[]).map(toCandle);
}

export async function parseFiles(files: FileList): Promise<SymbolDataset[]> {
  const entries = await Promise.all(
    Array.from(files).map(async (file) => {
      const text = await file.text();
      const candles = file.name.toLowerCase().endsWith(".json") ? parseJson(text) : parseCsv(text);
      return {
        symbol: file.name.replace(/\.(csv|json)$/i, ""),
        candles1m: candles,
        sourceName: file.name
      } satisfies SymbolDataset;
    })
  );
  return entries;
}

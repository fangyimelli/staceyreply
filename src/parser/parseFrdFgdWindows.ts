import type { ImportedSignalRow, OhlcvBar, StrategyLine } from '../types/domain';

interface WindowRow {
  setup_type: 'FRD' | 'FGD';
  d_minus_2: string;
  signal_day: string;
  trade_day: string;
  d2_open: number;
  d2_close: number;
  d1_open: number;
  d1_close: number;
  bars_trade_day: number;
}

const parseNumber = (value: string): number => Number(value.trim());

const parseWindowRows = (text: string): WindowRow[] => {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const columns = header.split(',').map((column) => column.trim());

  return lines.map((line) => {
    const values = line.split(',');
    const data = Object.fromEntries(columns.map((column, index) => [column, values[index]?.trim() ?? '']));

    return {
      setup_type: (data.setup_type as 'FRD' | 'FGD') || 'FRD',
      d_minus_2: data.d_minus_2,
      signal_day: data.signal_day,
      trade_day: data.trade_day,
      d2_open: parseNumber(data.d2_open),
      d2_close: parseNumber(data.d2_close),
      d1_open: parseNumber(data.d1_open),
      d1_close: parseNumber(data.d1_close),
      bars_trade_day: parseNumber(data.bars_trade_day),
    };
  });
};

export const parseFrdFgdWindowMetadata = (text: string): ImportedSignalRow[] =>
  parseWindowRows(text).map((row) => ({
    pair: 'UNKNOWN',
    date: row.trade_day,
    signal: row.setup_type as StrategyLine,
    status: 'backend',
    notes: [
      `signal_day=${row.signal_day}`,
      `d_minus_2=${row.d_minus_2}`,
      `bars_trade_day=${row.bars_trade_day}`,
    ].join(' · '),
  }));

// NOTE:
// `frd_fgd_three_day_windows.csv` stores Day-2 / Day-1 / trade-day summary metadata only.
// This parser intentionally no longer fabricates synthetic OHLC bars for production display.
// When the backend cannot provide real replayable 1m bars, callers must treat the file as
// imported metadata and leave `SymbolDataset.bars1m` empty.
export const parseFrdFgdWindows = (_text: string): OhlcvBar[] => [];

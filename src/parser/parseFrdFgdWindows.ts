import type { OhlcvBar } from '../types/domain';

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

const buildBar = (day: string, open: number, close: number, volume: number): OhlcvBar => {
  const wick = Math.max(Math.abs(close - open) * 0.2, 0.5);
  return {
    time: `${day}T14:30:00.000Z`,
    open,
    high: Math.max(open, close) + wick,
    low: Math.min(open, close) - wick,
    close,
    volume,
  };
};

// NOTE: frd_fgd_three_day_windows.csv stores Day-2 / Day-1 summary windows.
// We preserve current behavior by generating deterministic synthetic OHLC bars so
// the existing parser -> aggregation -> strategy -> annotation -> UI pipeline stays runnable.
export const parseFrdFgdWindows = (text: string): OhlcvBar[] => {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const columns = header.split(',').map((column) => column.trim());

  const rows: WindowRow[] = lines.map((line) => {
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

  const bars = rows.flatMap((row) => {
    const direction = row.setup_type === 'FGD' ? 1 : -1;
    const range = Math.abs(row.d1_close - row.d1_open);
    const tradeClose = row.d1_close + direction * Math.max(range * 0.4, 1);

    return [
      buildBar(row.d_minus_2, row.d2_open, row.d2_close, 100),
      buildBar(row.signal_day, row.d1_open, row.d1_close, 100),
      buildBar(row.trade_day, row.d1_close, tradeClose, row.bars_trade_day || 100),
    ];
  });

  bars.sort((a, b) => a.time.localeCompare(b.time));
  return bars;
};

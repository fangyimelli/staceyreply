import type { DatasetValidationIssue, OhlcvBar } from '../types/domain';
import { aggregateBars } from '../aggregation/timeframe';
import { byNyDate, nyDate, nyTime } from '../utils/nyDate';

const sessionBars = (bars: OhlcvBar[]) => bars.filter((bar) => {
  const t = nyTime(bar.time);
  return t >= '07:00' && t <= '11:00';
});

export const validateDataset = (bars: OhlcvBar[]): DatasetValidationIssue[] => {
  if (!bars.length) {
    return [{ code: 'invalid-format', message: 'Invalid dataset: unable to validate FRD/FGD template', detail: 'CSV/JSON did not produce any valid OHLCV rows.' }];
  }
  const issues: DatasetValidationIssue[] = [];
  const grouped = byNyDate(bars);
  const days = Object.keys(grouped).sort();
  if (days.length < 3) {
    issues.push({ code: 'template-unverifiable', message: 'Invalid dataset: unable to validate FRD/FGD template', detail: 'Need at least D-2, D-1, and Day 3 sessions.' });
    return issues;
  }
  if (aggregateBars(bars, '5m').length === 0 || aggregateBars(bars, '15m').length === 0 || aggregateBars(bars, '1D').length < 3) {
    issues.push({ code: 'timeframe-discontinuity', message: 'Invalid dataset: unable to validate FRD/FGD template', detail: 'Could not rebuild one or more required timeframes.' });
  }
  const daily = days.map((day) => {
    const group = grouped[day];
    return { day, open: group[0].open, close: group[group.length - 1].close, high: Math.max(...group.map((bar) => bar.high)), low: Math.min(...group.map((bar) => bar.low)) };
  });
  const tradeDay = daily[daily.length - 1];
  const d1 = daily[daily.length - 2];
  const d2 = daily[daily.length - 3];
  if (!d1 || !d2) issues.push({ code: 'missing-signal-day', message: 'Invalid dataset: missing D-1 signal day', detail: 'Daily buckets are incomplete for D-1 or D-2.' });
  if (d2 && !(d2.close > d2.open || d2.close < d2.open)) issues.push({ code: d2.close >= d2.open ? 'missing-pump-context' : 'missing-dump-context', message: 'Invalid dataset: unable to validate FRD/FGD template', detail: 'D-2 does not show directional pump/dump background.' });
  if (d1 && d1.close === d1.open) issues.push({ code: 'missing-signal-day', message: 'Invalid dataset: missing D-1 signal day', detail: 'D-1 is neutral and does not form FRD/FGD signal direction.' });
  if (tradeDay && sessionBars(grouped[tradeDay.day] ?? []).length < 12) issues.push({ code: 'insufficient-intraday', message: 'Invalid dataset: insufficient Day 3 intraday candles', detail: 'Expected at least 12 one-minute candles in the New York 07:00–11:00 session.' });
  if (daily.length < 2 || daily[daily.length - 2] === undefined) issues.push({ code: 'previous-close-unavailable', message: 'Invalid dataset: previous close unavailable', detail: 'Could not derive yesterday close for the active trade day.' });
  const gaps = bars.slice(1).some((bar, index) => new Date(bar.time).getTime() - new Date(bars[index].time).getTime() > 5 * 60_000);
  if (gaps) issues.push({ code: 'timeframe-discontinuity', message: 'Invalid dataset: unable to validate FRD/FGD template', detail: 'Time series contains gaps larger than five minutes.' });
  return issues;
};

export const summarizeValidation = (issues: DatasetValidationIssue[]) => issues.map((issue) => issue.message);
export const getTradeDay = (bars: OhlcvBar[]) => Object.keys(byNyDate(bars)).sort().slice(-1)[0] ?? nyDate(bars[0]?.time ?? new Date().toISOString());

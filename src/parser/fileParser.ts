import type { DatasetFile, OhlcvBar, ParsedDataset, TimeSemantics } from '../types/domain';

const STRATEGY_TIMEZONE: TimeSemantics['strategy'] = 'america-new_york';
const ISO_WITH_OFFSET_PATTERN = /(Z|[+-]\d{2}:\d{2})$/i;

const normalizeBars = (bars: OhlcvBar[]) => bars
  .filter((bar) => Number.isFinite(bar.open) && Number.isFinite(bar.high) && Number.isFinite(bar.low) && Number.isFinite(bar.close))
  .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

const isMtFixedEstRow = (line: string) => /^\d{4}\.\d{2}\.\d{2}[\t, ]+\d{2}:\d{2}([\t, ]+-?\d+(?:\.\d+)?){5}$/.test(line.trim());

const toFixedEstIso = (dateText: string, timeText: string) => {
  const [year, month, day] = dateText.split('.');
  return `${year}-${month}-${day}T${timeText}:00-05:00`;
};

const getNyWallClock = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
};

const getNyOffset = (date: Date) => {
  const offsetText = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'shortOffset',
    hour: '2-digit',
  }).formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT-5';

  const match = offsetText.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
  if (!match) return '-05:00';
  const [, sign, hours, minutes] = match;
  return `${sign}${hours.padStart(2, '0')}:${(minutes ?? '00').padStart(2, '0')}`;
};

const toNyIso = (date: Date) => {
  const wallClock = getNyWallClock(date);
  return `${wallClock.year}-${wallClock.month}-${wallClock.day}T${wallClock.hour}:${wallClock.minute}:${wallClock.second}${getNyOffset(date)}`;
};

const buildIsoOrTextTimeBar = (time: string, values: Pick<OhlcvBar, 'open' | 'high' | 'low' | 'close' | 'volume'>): OhlcvBar => {
  const hasIsoOffset = ISO_WITH_OFFSET_PATTERN.test(time);
  const semantics: TimeSemantics = {
    source: hasIsoOffset ? 'iso-offset' : 'unqualified-text',
    strategy: STRATEGY_TIMEZONE,
  };

  return {
    time,
    rawTimeText: time,
    sourceTime: time,
    normalizedTime: time,
    timeSemantics: semantics,
    ...values,
  };
};

const normalizeMtFixedEstRowTime = (dateText: string, timeText: string) => {
  const sourceTime = toFixedEstIso(dateText, timeText);
  const sourceDate = new Date(sourceTime);
  const normalizedTime = toNyIso(sourceDate);

  return {
    rawDateText: dateText,
    rawTimeText: timeText,
    sourceTime,
    normalizedTime,
    timeSemantics: {
      source: 'fixed-est-no-dst',
      strategy: STRATEGY_TIMEZONE,
    } satisfies TimeSemantics,
  };
};

const parseMtFixedEst = (raw: string): OhlcvBar[] => normalizeBars(raw
  .trim()
  .split(/\r?\n/)
  .filter((line) => line.trim().length > 0)
  .map((line) => line.trim().split(/\t+|,+|\s{2,}/))
  .filter((parts) => parts.length >= 7)
  .map(([date, time, open, high, low, close, volume]) => {
    const normalizedTime = normalizeMtFixedEstRowTime(date, time);

    return {
      time: normalizedTime.normalizedTime,
      ...normalizedTime,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume ?? 0),
    };
  }));

const parseCsv = (raw: string): OhlcvBar[] => {
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length && isMtFixedEstRow(lines[0])) return parseMtFixedEst(raw);
  const header = lines[0]?.toLowerCase().split(',').map((item) => item.trim()) ?? [];
  if (header.join(',') !== 'time,open,high,low,close,volume') return [];
  return normalizeBars(lines.slice(1).map((line) => {
    const [time, open, high, low, close, volume] = line.split(',');
    return buildIsoOrTextTimeBar(time, { open: Number(open), high: Number(high), low: Number(low), close: Number(close), volume: Number(volume ?? 0) });
  }));
};

const parseJson = (raw: string): OhlcvBar[] => {
  const payload = JSON.parse(raw) as unknown;
  if (!Array.isArray(payload)) return [];
  return normalizeBars(payload.map((bar) => {
    const item = bar as Record<string, unknown>;
    return buildIsoOrTextTimeBar(String(item.time ?? ''), {
      open: Number(item.open),
      high: Number(item.high),
      low: Number(item.low),
      close: Number(item.close),
      volume: Number(item.volume ?? 0),
    });
  }));
};

export const parseDatasetFile = (file: DatasetFile): ParsedDataset => ({
  datasetId: file.id,
  symbol: file.label.replace(/\.(csv|json)$/i, '').toUpperCase(),
  bars1m: file.kind === 'csv' ? parseCsv(file.raw) : parseJson(file.raw),
  sourceLabel: file.path,
  isSample: Boolean(file.isSample),
});

export { normalizeMtFixedEstRowTime, parseMtFixedEst, toFixedEstIso };

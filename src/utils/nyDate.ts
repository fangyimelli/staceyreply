import type { OhlcvBar } from '../types/domain';

const ISO_WITH_OFFSET_PATTERN = /(Z|[+-]\d{2}:\d{2})$/i;
const LOCAL_TEXT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/;
const NY_TIME_ZONE = 'America/New_York';

type ParsedLocalText = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

const formatNyParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: NY_TIME_ZONE,
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
    timeZone: NY_TIME_ZONE,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
  }).formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT-5';

  const match = offsetText.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
  if (!match) return '-05:00';
  const [, sign, hours, minutes] = match;
  return `${sign}${hours.padStart(2, '0')}:${(minutes ?? '00').padStart(2, '0')}`;
};

const toNyIso = (date: Date, includeMilliseconds = false) => {
  const wallClock = formatNyParts(date);
  const milliseconds = date.getUTCMilliseconds();
  const fraction = includeMilliseconds || milliseconds
    ? `.${String(milliseconds).padStart(3, '0')}`
    : '';

  return `${wallClock.year}-${wallClock.month}-${wallClock.day}T${wallClock.hour}:${wallClock.minute}:${wallClock.second}${fraction}${getNyOffset(date)}`;
};

const parseUnqualifiedLocalText = (time: string): ParsedLocalText | null => {
  const match = time.trim().match(LOCAL_TEXT_PATTERN);
  if (!match) return null;

  const [, year, month, day, hour = '00', minute = '00', second = '00', fraction = '0'] = match;
  const millisecond = Number(fraction.padEnd(3, '0').slice(0, 3));

  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
    millisecond,
  };
};

const matchesParsedNyWallClock = (date: Date, parsed: ParsedLocalText) => {
  const parts = formatNyParts(date);
  return Number(parts.year) === parsed.year
    && Number(parts.month) === parsed.month
    && Number(parts.day) === parsed.day
    && Number(parts.hour) === parsed.hour
    && Number(parts.minute) === parsed.minute
    && Number(parts.second) === parsed.second;
};

const candidateUtcMs = (parsed: ParsedLocalText, offsetMinutes: number) => Date.UTC(
  parsed.year,
  parsed.month - 1,
  parsed.day,
  parsed.hour,
  parsed.minute - offsetMinutes,
  parsed.second,
  parsed.millisecond,
);

export const normalizeUnqualifiedNyText = (time: string): string | null => {
  const parsed = parseUnqualifiedLocalText(time);
  if (!parsed) return null;

  const candidates = [-300, -240]
    .map((offsetMinutes) => new Date(candidateUtcMs(parsed, offsetMinutes)))
    .filter((candidate) => matchesParsedNyWallClock(candidate, parsed))
    .sort((a, b) => a.getTime() - b.getTime());

  if (candidates[0]) {
    return toNyIso(candidates[0], parsed.millisecond !== 0);
  }

  // Deterministic fallback for nonexistent local wall-clock values around DST jumps.
  // We pin the text to New York's midday offset for that calendar date so downstream
  // strategy/session parsing never depends on host locale parsing.
  const middayUtc = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 17, 0, 0, parsed.millisecond));
  const fallbackOffset = getNyOffset(middayUtc);
  const fraction = parsed.millisecond ? `.${String(parsed.millisecond).padStart(3, '0')}` : '';
  return `${String(parsed.year).padStart(4, '0')}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}T${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}:${String(parsed.second).padStart(2, '0')}${fraction}${fallbackOffset}`;
};

const normalizeTimeForStrategy = (time: string) => {
  if (ISO_WITH_OFFSET_PATTERN.test(time)) return time;
  return normalizeUnqualifiedNyText(time) ?? time;
};

export const parseExplicitTimestampMs = (time: string) => {
  const ms = Date.parse(normalizeTimeForStrategy(time));
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid timestamp: ${time}`);
  }
  return ms;
};

const parts = (time: string) => new Intl.DateTimeFormat('en-CA', {
  timeZone: NY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}).formatToParts(new Date(normalizeTimeForStrategy(time)));

const readNyParts = (time: string) => Object.fromEntries(parts(time).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));

export const strategyTime = (bar: Pick<OhlcvBar, 'normalizedTime' | 'time'>) => bar.normalizedTime ?? normalizeTimeForStrategy(bar.time);
export const sourceTime = (bar: Pick<OhlcvBar, 'sourceTime' | 'time'>) => bar.sourceTime ?? bar.time;

export const strategyNyDate = (time: string) => {
  const p = readNyParts(time);
  return `${p.year}-${p.month}-${p.day}`;
};

export const strategyNyTime = (time: string) => {
  const p = readNyParts(time);
  return `${p.hour}:${p.minute}`;
};

export const strategyNyLabel = (time: string) => `${strategyNyDate(time)} ${strategyNyTime(time)}`;

/**
 * @deprecated Prefer strategyNyDate(strategyTime(bar)) so callers are explicit about normalized strategy time.
 */
export const nyDate = strategyNyDate;
/**
 * @deprecated Prefer strategyNyTime(strategyTime(bar)) so callers are explicit about normalized strategy time.
 */
export const nyTime = strategyNyTime;
/**
 * @deprecated Prefer strategyNyLabel(strategyTime(bar)) so callers are explicit about normalized strategy time.
 */
export const nyLabel = strategyNyLabel;

export const byNyDate = (bars: OhlcvBar[]) => bars.reduce<Record<string, OhlcvBar[]>>((acc, bar) => {
  const key = strategyNyDate(strategyTime(bar));
  (acc[key] ??= []).push(bar);
  return acc;
}, {});

export { ISO_WITH_OFFSET_PATTERN, toNyIso };

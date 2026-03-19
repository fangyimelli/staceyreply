import type { OhlcvBar } from '../types/domain';

const EXPLICIT_OFFSET_ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/i;
const UNQUALIFIED_LOCAL_PATTERN = /^(\d{4})[-/.](\d{2})[-/.](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

const parts = (time: string) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}).formatToParts(new Date(time));

const readNyParts = (time: string) => Object.fromEntries(parts(time).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));

const padMilliseconds = (value?: string) => (value ?? '').padEnd(3, '0').slice(0, 3);
const toUtcEpochMs = (year: number, month: number, day: number, hour: number, minute: number, second: number, millisecond = 0) =>
  Date.UTC(year, month - 1, day, hour, minute, second, millisecond);

export const parseExplicitTimestampMs = (time: string) => {
  const match = time.match(EXPLICIT_OFFSET_ISO_PATTERN);
  if (!match) {
    throw new Error(`Expected ISO timestamp with explicit offset, received "${time}".`);
  }

  const [, year, month, day, hour, minute, second = '00', milliseconds, zone] = match;
  const offsetMinutes = zone.toUpperCase() === 'Z'
    ? 0
    : (() => {
      const [, sign, offsetHour, offsetMinute] = zone.match(/^([+-])(\d{2}):(\d{2})$/)!;
      const total = Number(offsetHour) * 60 + Number(offsetMinute);
      return sign === '+' ? total : -total;
    })();

  return toUtcEpochMs(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(padMilliseconds(milliseconds)),
  ) - offsetMinutes * 60_000;
};

const offsetForNyLocalParts = (year: number, month: number, day: number, hour: number, minute: number, second: number) => {
  const probeUtc = new Date(Date.UTC(year, month - 1, day, hour + 5, minute, second));
  const offsetText = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'shortOffset',
    hour: '2-digit',
  }).formatToParts(probeUtc).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT-5';

  const match = offsetText.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
  if (!match) return '-05:00';
  const [, sign, hours, minutes = '00'] = match;
  return `${sign}${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
};

export const normalizeUnqualifiedNyTime = (time: string) => {
  const match = time.trim().match(UNQUALIFIED_LOCAL_PATTERN);
  if (!match) {
    throw new Error(`Unsupported unqualified local timestamp "${time}". Expected YYYY-MM-DD HH:mm[:ss], YYYY/MM/DD HH:mm[:ss], or YYYY.MM.DD HH:mm[:ss].`);
  }

  const [, year, month, day, hour, minute, second = '00'] = match;
  const offset = offsetForNyLocalParts(Number(year), Number(month), Number(day), Number(hour), Number(minute), Number(second));
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
};

export const strategyTime = (bar: Pick<OhlcvBar, 'normalizedTime' | 'time'>) => bar.normalizedTime ?? bar.time;
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

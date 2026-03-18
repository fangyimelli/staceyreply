import type { OhlcvBar } from '../types/domain';

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

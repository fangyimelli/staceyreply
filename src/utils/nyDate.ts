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

export const nyDate = (time: string) => {
  const p = Object.fromEntries(parts(time).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};

export const nyTime = (time: string) => {
  const p = Object.fromEntries(parts(time).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  return `${p.hour}:${p.minute}`;
};

export const nyLabel = (time: string) => `${nyDate(time)} ${nyTime(time)}`;

export const byNyDate = (bars: OhlcvBar[]) => bars.reduce<Record<string, OhlcvBar[]>>((acc, bar) => {
  const key = nyDate(bar.time);
  (acc[key] ??= []).push(bar);
  return acc;
}, {});

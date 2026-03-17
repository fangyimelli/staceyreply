const DEFAULT_SPEED_MS = 500;

export function createReplayState() {
  return {
    cursor: 0,
    isPlaying: false,
    speedMs: DEFAULT_SPEED_MS
  };
}

export function clampCursor(cursor, candlesLength) {
  if (candlesLength <= 0) return 0;
  return Math.max(0, Math.min(cursor, candlesLength - 1));
}

export function getVisibleCandles(candles, cursor) {
  if (!candles.length) return [];
  const clamped = clampCursor(cursor, candles.length);
  return candles.slice(0, clamped + 1);
}

export function jumpToSessionStart() {
  return 0;
}

export function jumpToDateStart(candles, selectedDate) {
  if (!candles.length || !selectedDate) return 0;
  const idx = candles.findIndex((c) => nyDate(c.time) === selectedDate);
  return idx >= 0 ? idx : 0;
}

function nyDate(ts) {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export const replaySpeeds = [2000, 1000, 500, 250, 100];

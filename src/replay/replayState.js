const DEFAULT_SPEED_MS = 500;

export const replayCheckpoint = {
  none: 'none',
  possibleFrdFgd: 'possible-frd-fgd',
  signalDay: 'signal-day',
  day3Begin: 'day3-begin'
};

const checkpointLabel = {
  [replayCheckpoint.none]: 'No checkpoint yet',
  [replayCheckpoint.possibleFrdFgd]: 'Possible FRD/FGD',
  [replayCheckpoint.signalDay]: 'Signal day',
  [replayCheckpoint.day3Begin]: 'Day3 begin'
};

export function createReplayState() {
  return {
    cursor: 0,
    isPlaying: false,
    speedMs: DEFAULT_SPEED_MS,
    autoStopCheckpointEnabled: true,
    lastCheckpoint: replayCheckpoint.none
  };
}

export function detectReplayCheckpoint(visibleCandles, lastCheckpoint = replayCheckpoint.none) {
  if (!visibleCandles.length) {
    return {
      checkpoint: replayCheckpoint.none,
      label: checkpointLabel[replayCheckpoint.none],
      reason: 'No visible candles. Waiting for replay to start.',
      hit: false
    };
  }

  const nyDates = Array.from(new Set(visibleCandles.map((c) => nyDate(c.time))));
  const currentDate = nyDates.at(-1);
  let checkpoint = replayCheckpoint.none;
  let reason = 'Visible candles currently remain inside the first NY trading date.';

  if (nyDates.length >= 3) {
    checkpoint = replayCheckpoint.day3Begin;
    reason = `Detected third NY date (${currentDate}) from visible candles; Day 3 has begun.`;
  } else if (nyDates.length === 2) {
    checkpoint = replayCheckpoint.signalDay;
    reason = `Detected second NY date (${currentDate}) from visible candles; this is the signal-day phase.`;
  } else {
    checkpoint = replayCheckpoint.possibleFrdFgd;
    reason = `Only first NY date (${currentDate}) is visible, so FRD/FGD is still a possible setup.`;
  }

  return {
    checkpoint,
    label: checkpointLabel[checkpoint],
    reason,
    hit: checkpoint !== replayCheckpoint.none && checkpoint !== lastCheckpoint
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

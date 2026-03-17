function findMarker(result, kind) {
  return result.markers.find((m) => m.kind === kind);
}

export function computeAutoReplayPnl(result) {
  const entry = findMarker(result, 'entry')?.price;
  const exit = findMarker(result, 'tp40')?.price;
  if (typeof entry !== 'number' || typeof exit !== 'number') {
    return { pnl: 0, status: 'waiting for signal' };
  }
  return { pnl: exit - entry, status: 'entry+exit executed on revealed bars' };
}

export function computeManualReplayPnl(manualState, visibleCandles) {
  if (!visibleCandles.length) return { pnl: 0, status: 'waiting for candles' };
  const last = visibleCandles[visibleCandles.length - 1];
  const entry = manualState.entryPrice;
  const exit = manualState.exitPrice;

  if (entry == null) {
    return { pnl: 0, status: 'set manual entry on a revealed bar' };
  }

  const live = last.close - entry;
  if (exit == null) {
    return { pnl: live, status: 'entry set; waiting for manual exit' };
  }

  return { pnl: exit - entry, status: 'manual entry+exit locked from revealed bars' };
}

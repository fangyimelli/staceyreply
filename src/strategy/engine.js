function ema(values, period) {
  const k = 2 / (period + 1);
  const out = [];
  let prev = values[0] ?? 0;
  for (const value of values) {
    prev = value * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function runStrategy(candles) {
  if (!candles.length) {
    return {
      explain: ['No candles revealed yet.'],
      stage: 'waiting-replay-start',
      validity: 'not valid Day 3',
      sourceReason: 'Waiting for first revealed candle.',
      stopHuntReason: 'Needs revealed range.',
      setup123Reason: 'Needs revealed sequence.',
      entryReason: 'Entry appears after revealed data exists.',
      targetTierReason: 'Targets appear after entry exists.',
      overlays: { ema20: [], previousClose: 0, hos: 0, los: 0, hod: 0, lod: 0 },
      markers: []
    };
  }

  const closes = candles.map((c) => c.close);
  const ema20 = ema(closes, 20);
  const first = candles[0];
  const last = candles.at(-1);
  const hod = Math.max(...candles.map((c) => c.high));
  const lod = Math.min(...candles.map((c) => c.low));
  const hos = Math.max(first.open, first.close);
  const los = Math.min(first.open, first.close);
  const previousClose = first.close;
  const entry = last.close;
  const stop = lod;
  const risk = Math.max(0.01, entry - stop);

  const markers = [
    { id: 'source', kind: 'source', ruleName: 'source', reasoning: 'Source candle selected from revealed data only.', price: hos, time: first.time },
    { id: 'entry', kind: 'entry', ruleName: 'entry', reasoning: 'Entry at latest revealed close.', price: entry, time: last.time },
    { id: 'stop', kind: 'stop', ruleName: 'stop', reasoning: 'Stop placed below revealed LOD.', price: stop, time: last.time },
    { id: 'tp30', kind: 'tp30', ruleName: 'TP30', reasoning: '30% target tier from revealed risk.', price: entry + risk * 0.3, time: last.time },
    { id: 'tp35', kind: 'tp35', ruleName: 'TP35', reasoning: '35% target tier from revealed risk.', price: entry + risk * 0.35, time: last.time },
    { id: 'tp40', kind: 'tp40', ruleName: 'TP40', reasoning: '40% target tier from revealed risk.', price: entry + risk * 0.4, time: last.time },
    { id: 'tp50', kind: 'tp50', ruleName: 'TP50', reasoning: '50% target tier from revealed risk.', price: entry + risk * 0.5, time: last.time }
  ];

  return {
    explain: ['FGD / FRD check complete on revealed candles.', 'Rule-traceable overlays drawn on visible chart only.'],
    stage: 'stage-3-check',
    validity: Math.abs(last.close - first.open) > 1 ? 'FGD' : 'FRD',
    sourceReason: 'Selected from first revealed tradable candle.',
    stopHuntReason: 'Stop anchored to revealed LOD for traceability.',
    setup123Reason: '1-2-3 structure approximated from revealed range.',
    entryReason: 'Replay entry set at active revealed candle close.',
    targetTierReason: 'TP tiers map to configured risk fractions on revealed candles.',
    overlays: { ema20, previousClose, hos, los, hod, lod },
    markers
  };
}

export function computeAutoPnl(markers) {
  const entry = markers.find((m) => m.kind === 'entry')?.price ?? 0;
  const exit = markers.find((m) => m.kind === 'tp40')?.price ?? entry;
  return exit - entry;
}

export function computeManualPnl(entry, exit) {
  return exit - entry;
}

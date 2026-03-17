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

const createRule = (id, passed, reason, evidenceBars) => ({ id, passed, reason, evidenceBars });
const findRule = (rules, id) => rules.find((rule) => rule.id === id) ?? createRule(id, false, 'Rule not evaluated.', []);

export function runStrategy(candles) {
  if (!candles.length) {
    const emptyRules = [
      createRule('source-selection', false, 'No candles available to select a source.', []),
      createRule('stop-hunt', false, 'No range available to determine stop-hunt behavior.', []),
      createRule('setup-123', false, 'Need at least 3 candles to validate 1-2-3 sequencing.', []),
      createRule('ema-alignment', false, 'Need candles to compute EMA20 alignment.', []),
      createRule('target-tier-upgrade', false, 'Need entry/stop to evaluate target tier upgrades.', []),
      createRule('classification-expansion', false, 'No expansion without visible candles.', [])
    ];

    return {
      explain: emptyRules.map((rule) => `${rule.id}: ${rule.reason}`),
      ruleEvaluations: emptyRules,
      stage: 'waiting-replay-start',
      validity: 'not valid Day 3',
      sourceReason: findRule(emptyRules, 'source-selection').reason,
      stopHuntReason: findRule(emptyRules, 'stop-hunt').reason,
      setup123Reason: findRule(emptyRules, 'setup-123').reason,
      entryReason: 'Entry appears after revealed data exists.',
      targetTierReason: findRule(emptyRules, 'target-tier-upgrade').reason,
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

  const sourceRule = createRule('source-selection', true, `Source fixed to first revealed candle at ${first.time}.`, [first.time]);
  const stopHuntPassed = last.low <= lod || last.high >= hod;
  const stopHuntRule = createRule('stop-hunt', stopHuntPassed, stopHuntPassed ? 'Latest bar probes the visible range boundary (stop-hunt proxy).' : 'Latest bar has not probed range boundary yet.', [last.time]);
  const setup123Passed = candles.length >= 3;
  const setup123Evidence = candles.slice(Math.max(0, candles.length - 3)).map((c) => c.time);
  const setup123Rule = createRule('setup-123', setup123Passed, setup123Passed ? 'Three-step sequence available from latest revealed bars.' : 'Need at least three revealed bars for 1-2-3 structure.', setup123Evidence);
  const emaAligned = entry >= (ema20[ema20.length - 1] ?? entry);
  const emaRule = createRule('ema-alignment', emaAligned, emaAligned ? 'Close is on/above EMA20.' : 'Close is below EMA20.', [last.time]);
  const tierRule = createRule(
    'target-tier-upgrade',
    risk > 0,
    risk > 0 ? 'Risk is positive; TP tiers can be promoted from TP30 to TP50.' : 'Risk is zero; TP tiers remain disabled.',
    [last.time]
  );

  // ambiguous rule: legacy behavior classified FGD/FRD from absolute expansion (> 1).
  // We keep that legacy expansion threshold inside a dedicated rule to preserve behavior transparently.
  const expansionPassed = Math.abs(last.close - first.open) > 1;
  const classificationRule = createRule(
    'classification-expansion',
    expansionPassed,
    expansionPassed ? 'Legacy expansion threshold passed; classify as FGD.' : 'Legacy expansion threshold not met; classify as FRD.',
    [first.time, last.time]
  );

  const ruleEvaluations = [sourceRule, stopHuntRule, setup123Rule, emaRule, tierRule, classificationRule];

  const markers = [
    { id: 'source', kind: 'source', ruleId: sourceRule.id, ruleName: 'source', reasoning: sourceRule.reason, price: hos, time: first.time },
    { id: 'entry', kind: 'entry', ruleId: emaRule.id, ruleName: 'entry', reasoning: `Entry at latest revealed close (${emaRule.reason})`, price: entry, time: last.time },
    { id: 'stop', kind: 'stop', ruleId: stopHuntRule.id, ruleName: 'stop', reasoning: 'Stop placed below revealed LOD.', price: stop, time: last.time },
    { id: 'tp30', kind: 'tp30', ruleId: tierRule.id, ruleName: 'TP30', reasoning: tierRule.reason, price: entry + risk * 0.3, time: last.time },
    { id: 'tp35', kind: 'tp35', ruleId: tierRule.id, ruleName: 'TP35', reasoning: tierRule.reason, price: entry + risk * 0.35, time: last.time },
    { id: 'tp40', kind: 'tp40', ruleId: tierRule.id, ruleName: 'TP40', reasoning: tierRule.reason, price: entry + risk * 0.4, time: last.time },
    { id: 'tp50', kind: 'tp50', ruleId: tierRule.id, ruleName: 'TP50', reasoning: tierRule.reason, price: entry + risk * 0.5, time: last.time }
  ];

  return {
    explain: ruleEvaluations.map((rule) => `${rule.id}: ${rule.reason}`),
    ruleEvaluations,
    stage: 'stage-3-check',
    validity: classificationRule.passed ? 'FGD' : 'FRD',
    sourceReason: sourceRule.reason,
    stopHuntReason: stopHuntRule.reason,
    setup123Reason: setup123Rule.reason,
    entryReason: emaRule.reason,
    targetTierReason: tierRule.reason,
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

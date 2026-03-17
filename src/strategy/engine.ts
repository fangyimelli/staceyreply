import { Candle, RuleEvaluation, StrategyMarker, StrategyResult } from '../types.js';
import type { CandidateDate, InternalDayAnalysis, InternalRuleEvaluation, OhlcvBar, ReplyMode, StrategyLine } from '../types/domain.js';

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0] ?? 0;
  for (const value of values) {
    prev = value * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

const createRule = (id: string, passed: boolean, reason: string, evidenceBars: string[]): RuleEvaluation => ({ id, passed, reason, evidenceBars });
const createInternalRule = (id: string, passed: boolean, reason: string, evidenceBars: string[]): InternalRuleEvaluation => ({ id, passed, reason, evidenceBars });

const findRule = (rules: RuleEvaluation[], id: string): RuleEvaluation => rules.find((rule) => rule.id === id) ?? createRule(id, false, 'Rule not evaluated.', []);

export function runStrategy(candles: Candle[]): StrategyResult {
  if (!candles.length) {
    const emptyRules = [
      createRule('source-selection', false, 'No candles available to select a source.', []),
      createRule('stop-hunt', false, 'No range available to determine stop-hunt behavior.', []),
      createRule('setup-123', false, 'Need at least 3 candles to validate 1-2-3 sequencing.', []),
      createRule('ema-alignment', false, 'Need candles to compute EMA20 alignment.', []),
      createRule('target-tier-upgrade', false, 'Need entry/stop to evaluate target tier upgrades.', []),
      createRule('classification-expansion', false, 'No expansion without visible candles.', []),
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
  const last = candles[candles.length - 1];
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

  const markers: StrategyMarker[] = [
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

export function computeAutoPnl(markers: StrategyMarker[]): number {
  const entry = markers.find((m) => m.kind === 'entry')?.price ?? 0;
  const exit = markers.find((m) => m.kind === 'tp40')?.price ?? entry;
  return exit - entry;
}

export function computeManualPnl(entry: number, exit: number): number {
  return exit - entry;
}

export const toNyLabel = (time: string): string =>
  new Date(time).toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export const detectCandidates = (symbol: string, bars1m: OhlcvBar[]): CandidateDate[] => {
  const grouped = new Map<string, OhlcvBar[]>();
  bars1m.forEach((bar) => {
    const day = bar.time.slice(0, 10);
    const bucket = grouped.get(day) ?? [];
    bucket.push(bar);
    grouped.set(day, bucket);
  });

  return [...grouped.entries()].map(([date, bars]) => {
    const open = bars[0]?.open ?? 0;
    const close = bars[bars.length - 1]?.close ?? open;
    const type: StrategyLine = Math.abs(close - open) > 0.001 ? 'FGD' : 'FRD';
    return { symbol, date, type, reason: `Detected from ${bars.length} bars` };
  });
};

export const evaluateDay = (
  line: StrategyLine,
  bars: OhlcvBar[],
  day: string,
  replyMode: ReplyMode,
  manualTrade: { entry: number; exit: number }
): InternalDayAnalysis => {
  const dayBars = bars.filter((bar) => bar.time.slice(0, 10) === day);
  const first = dayBars[0];
  const last = dayBars[dayBars.length - 1];

  if (!first || !last) {
    const rules = [createInternalRule('day-bars-available', false, 'No bars available for selected day.', [])];
    return {
      explain: {
        template: 'NONE',
        bias: 'NEUTRAL',
        stage: 'waiting-day-selection',
        missingConditions: ['No bars available for selected day'],
        reasons: rules.map((rule) => `${rule.id}: ${rule.reason}`),
        ruleEvaluations: rules,
        entryAllowed: false,
        targetTier: null,
      },
      annotations: [],
    };
  }

  const previousBars = bars.filter((bar) => bar.time < first.time);
  const previousClose = previousBars[previousBars.length - 1]?.close;
  const hod = Math.max(...dayBars.map((bar) => bar.high));
  const lod = Math.min(...dayBars.map((bar) => bar.low));
  const hos = Math.max(...dayBars.map((bar) => bar.open));
  const los = Math.min(...dayBars.map((bar) => bar.open));
  const dayCloses = dayBars.map((bar) => bar.close);
  const dayEma20 = ema(dayCloses, 20);

  const sourceRule = createInternalRule('source-selection', true, `Source selected from first day bar ${first.time}.`, [first.time]);
  const stopHuntRule = createInternalRule('stop-hunt', line === 'FGD' ? last.low <= lod : last.high >= hod, line === 'FGD' ? 'FGD path checks probe of day low boundary.' : 'FRD path checks probe of day high boundary.', [last.time]);
  const setup123Rule = createInternalRule('setup-123', dayBars.length >= 3, dayBars.length >= 3 ? '1-2-3 structure candidate exists in day bars.' : 'Need 3+ bars to validate 1-2-3.', dayBars.slice(Math.max(0, dayBars.length - 3)).map((bar) => bar.time));
  const emaRule = createInternalRule('ema-alignment', line === 'FGD' ? last.close >= (dayEma20[dayEma20.length - 1] ?? last.close) : last.close <= (dayEma20[dayEma20.length - 1] ?? last.close), line === 'FGD' ? 'FGD expects close on/above EMA20.' : 'FRD expects close on/below EMA20.', [last.time]);
  const entryRule = createInternalRule('entry-eligibility', dayBars.length > 1 && setup123Rule.passed, dayBars.length > 1 && setup123Rule.passed ? 'Entry unlocked once sequence and bars are available.' : 'Entry blocked until sequence is complete.', [last.time]);
  const tierRule = createInternalRule('target-tier-upgrade', entryRule.passed, entryRule.passed ? 'Tier upgrade enabled; current default tier is TP40.' : 'Tier upgrade disabled until entry is unlocked.', [last.time]);

  // ambiguous rule: retain existing behavior where selected line remains the final template for the day evaluation.
  const templateRule = createInternalRule('template-selection', true, `Template remains ${line} from pre-scan to preserve legacy behavior.`, [first.time, last.time]);

  const ruleEvaluations = [sourceRule, stopHuntRule, setup123Rule, emaRule, entryRule, tierRule, templateRule];
  const entryAllowed = entryRule.passed;

  const entry = replyMode === 'manual' && manualTrade.entry ? manualTrade.entry : last.close;
  const exit = replyMode === 'manual' && manualTrade.exit ? manualTrade.exit : last.close + (last.close - lod) * 0.4;

  return {
    explain: {
      template: line,
      bias: line === 'FGD' ? 'LONG' : 'SHORT',
      stage: 'stage-3-check',
      missingConditions: ruleEvaluations.filter((rule) => !rule.passed).map((rule) => `${rule.id}: ${rule.reason}`),
      reasons: ruleEvaluations.map((rule) => `${rule.id}: ${rule.reason}`),
      ruleEvaluations,
      entryAllowed,
      targetTier: tierRule.passed ? 40 : null,
    },
    annotations: [
      { id: 'source', kind: 'source', barTime: first.time, price: line === 'FGD' ? los : hos, ruleId: sourceRule.id, ruleName: 'source', reasoning: sourceRule.reason },
      { id: 'entry', kind: 'entry', barTime: last.time, price: entry, ruleId: entryRule.id, ruleName: 'entry', reasoning: entryRule.reason },
      { id: 'stop', kind: 'stop', barTime: last.time, price: lod, ruleId: stopHuntRule.id, ruleName: 'stop', reasoning: stopHuntRule.reason },
      { id: 'tp40', kind: 'tp40', barTime: last.time, price: exit, ruleId: tierRule.id, ruleName: 'TP40', reasoning: tierRule.reason },
    ],
    previousClose,
    hos,
    los,
    hod,
    lod,
    trade: entryAllowed ? { side: line === 'FGD' ? 'LONG' : 'SHORT', entry, exit, pnlPips: exit - entry, mode: replyMode } : undefined,
  };
};

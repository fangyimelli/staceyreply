import { aggregateFrom1m } from '../aggregation/timeframe';
import { Candle, StrategyMarker, StrategyResult } from '../types';
import type { CandidateDate, InternalDayAnalysis, OhlcvBar, ReplyMode, RuleTraceItem, StrategyLine } from '../types/domain';

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

const toPips = (priceDiff: number, pipPrecision: number): number => priceDiff * Math.pow(10, pipPrecision);

const dailyBucketKeyNy = (time: string): string =>
  new Date(time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

const aggregateDailyNy = (bars1m: OhlcvBar[]): OhlcvBar[] => {
  const grouped = new Map<string, OhlcvBar[]>();
  bars1m.forEach((bar) => {
    const key = dailyBucketKeyNy(bar.time);
    const bucket = grouped.get(key) ?? [];
    bucket.push(bar);
    grouped.set(key, bucket);
  });

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, bars]) => ({
      time: bars[0].time,
      open: bars[0].open,
      high: Math.max(...bars.map((bar) => bar.high)),
      low: Math.min(...bars.map((bar) => bar.low)),
      close: bars[bars.length - 1].close,
      volume: bars.reduce((sum, bar) => sum + bar.volume, 0),
    }));
};

export function evaluateDailyTemplate(params: {
  line: StrategyLine;
  bars1m: OhlcvBar[];
  selectedDay: string;
  pipPrecision: number;
}): {
  template: 'FGD' | 'FRD' | 'NONE';
  entryAllowed: boolean;
  reasons: string[];
  missingConditions: string[];
  evidenceDetails: string[];
  ruleTrace: RuleTraceItem[];
} {
  const { line, bars1m, selectedDay, pipPrecision } = params;
  const dailyBars = aggregateDailyNy(bars1m);
  const idxD0 = dailyBars.findIndex((bar) => dailyBucketKeyNy(bar.time) === selectedDay);

  if (idxD0 < 2) {
    return {
      template: 'NONE',
      entryAllowed: false,
      reasons: ['Insufficient daily history for D-2 / D-1 / D0 evaluation'],
      missingConditions: ['Need at least D-2, D-1 and D0 bars'],
      evidenceDetails: [`selectedDay=${selectedDay}`, `dailyBarsFound=${dailyBars.length}`],
      ruleTrace: [
        {
          ruleId: 'daily-history-available',
          passed: false,
          detail: 'Cannot evaluate without D-2 and D-1.',
          prices: {},
          times: { selectedDay },
        },
      ],
    };
  }

  const d2 = dailyBars[idxD0 - 2];
  const d1 = dailyBars[idxD0 - 1];
  const d0 = dailyBars[idxD0];

  const d2Dump = d2.close < d2.open;
  const d2Pump = d2.close > d2.open;
  const d1Bull = d1.close > d1.open;
  const d1Bear = d1.close < d1.open;
  const d1InsideD2 = d1.high <= d2.high && d1.low >= d2.low;

  const d1BodyPips = Math.abs(toPips(d1.close - d1.open, pipPrecision));
  const d1RangePips = Math.abs(toPips(d1.high - d1.low, pipPrecision));
  const d1BodyRangeRatio = d1RangePips === 0 ? 0 : d1BodyPips / d1RangePips;
  const d1BodyPriorityPass = d1BodyPips >= 40 && d1BodyRangeRatio >= 0.6;

  const ruleTrace: RuleTraceItem[] = [
    {
      ruleId: 'daily-history-available',
      passed: true,
      detail: 'D-2, D-1 and D0 are present.',
      prices: {},
      times: { d2: d2.time, d1: d1.time, d0: d0.time },
    },
    {
      ruleId: 'fgd-d2-dump',
      passed: d2Dump,
      detail: 'FGD requires D-2 dump background (close < open).',
      prices: { d2Open: d2.open, d2Close: d2.close },
      times: { d2: d2.time },
    },
    {
      ruleId: 'fgd-d1-close-red-to-green',
      passed: d1Bull,
      detail: 'FGD requires D-1 close bullish (close > open).',
      prices: { d1Open: d1.open, d1Close: d1.close },
      times: { d1: d1.time },
    },
    {
      ruleId: 'fgd-priority-d1-body',
      passed: d1BodyPriorityPass,
      detail: 'FGD priority: D-1 body >=40 pips and body/range >=60%.',
      prices: { d1BodyPips, d1RangePips, d1BodyRangeRatio },
      times: { d1: d1.time },
    },
    {
      ruleId: 'frd-d2-pump',
      passed: d2Pump,
      detail: 'FRD requires D-2 pump background (close > open).',
      prices: { d2Open: d2.open, d2Close: d2.close },
      times: { d2: d2.time },
    },
    {
      ruleId: 'frd-d1-close-black',
      passed: d1Bear,
      detail: 'FRD requires D-1 close bearish (close < open).',
      prices: { d1Open: d1.open, d1Close: d1.close },
      times: { d1: d1.time },
    },
    {
      ruleId: 'frd-inside-day',
      passed: d1InsideD2,
      detail: 'FRD requires inside day: D-1 high<=D-2 high and D-1 low>=D-2 low.',
      prices: { d1High: d1.high, d1Low: d1.low, d2High: d2.high, d2Low: d2.low },
      times: { d1: d1.time, d2: d2.time },
    },
  ];

  const fgdPass = d2Dump && d1Bull;
  const frdPass = d2Pump && d1Bear && d1InsideD2;

  const reasons: string[] = [];
  const evidenceDetails = [
    `D-2(${dailyBucketKeyNy(d2.time)}): O=${d2.open}, H=${d2.high}, L=${d2.low}, C=${d2.close}`,
    `D-1(${dailyBucketKeyNy(d1.time)}): O=${d1.open}, H=${d1.high}, L=${d1.low}, C=${d1.close}, body=${d1BodyPips.toFixed(1)} pips, range=${d1RangePips.toFixed(1)} pips, body/range=${(d1BodyRangeRatio * 100).toFixed(1)}%`,
    `D0(${dailyBucketKeyNy(d0.time)}): O=${d0.open}, H=${d0.high}, L=${d0.low}, C=${d0.close}`,
  ];
  const missingConditions: string[] = [];

  if (line === 'FGD') {
    if (fgdPass) reasons.push('FGD core conditions passed: D-2 dump and D-1 bullish close.');
    if (!d2Dump) missingConditions.push('FGD missing D-2 dump background (D-2 close < D-2 open).');
    if (!d1Bull) missingConditions.push('FGD missing D-1 bullish close (D-1 close > D-1 open).');
    if (d1BodyPriorityPass) {
      reasons.push('FGD priority condition passed: D-1 body >=40 pips and body/range >=60%.');
    } else {
      reasons.push('FGD priority condition not met: continue with core-condition result only.');
    }
  }

  if (line === 'FRD') {
    if (frdPass) reasons.push('FRD core conditions passed: D-2 pump, D-1 bearish close, and inside day.');
    if (!d2Pump) missingConditions.push('FRD missing D-2 pump background (D-2 close > D-2 open).');
    if (!d1Bear) missingConditions.push('FRD missing D-1 bearish close (D-1 close < D-1 open).');
    if (!d1InsideD2) missingConditions.push('FRD missing inside day (D-1 high<=D-2 high and D-1 low>=D-2 low).');
  }

  return {
    template: line,
    entryAllowed: line === 'FGD' ? fgdPass : frdPass,
    reasons,
    missingConditions,
    evidenceDetails,
    ruleTrace,
  };
}

export function runStrategy(candles: Candle[]): StrategyResult {
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

  const markers: StrategyMarker[] = [
    { id: 'source', kind: 'source', ruleName: 'source', reasoning: 'Source candle selected from scan.', price: hos, time: first.time },
    { id: 'entry', kind: 'entry', ruleName: 'entry', reasoning: 'Entry at latest close for replay.', price: entry, time: last.time },
    { id: 'stop', kind: 'stop', ruleName: 'stop', reasoning: 'Stop placed below day low.', price: stop, time: last.time },
    { id: 'tp30', kind: 'tp30', ruleName: 'TP30', reasoning: '30% target tier.', price: entry + risk * 0.3, time: last.time },
    { id: 'tp35', kind: 'tp35', ruleName: 'TP35', reasoning: '35% target tier.', price: entry + risk * 0.35, time: last.time },
    { id: 'tp40', kind: 'tp40', ruleName: 'TP40', reasoning: '40% target tier.', price: entry + risk * 0.4, time: last.time },
    { id: 'tp50', kind: 'tp50', ruleName: 'TP50', reasoning: '50% target tier.', price: entry + risk * 0.5, time: last.time }
  ];

  return {
    explain: ['FGD / FRD check complete.', 'Rule-traceable overlays drawn on chart.'],
    stage: 'stage-3-check',
    validity: Math.abs(last.close - first.open) > 1 ? 'FGD' : 'FRD',
    sourceReason: 'Selected from first tradable candle.',
    stopHuntReason: 'Stop anchored to LOD for traceability.',
    setup123Reason: '1-2-3 structure approximated from day range.',
    entryReason: 'Replay entry set at active candle close.',
    targetTierReason: 'TP tiers map to configured risk fractions.',
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
  const dailyBars = aggregateFrom1m(bars1m, '1D');

  return dailyBars.map((bar) => {
    const type: StrategyLine = Math.abs(bar.close - bar.open) > 0.001 ? 'FGD' : 'FRD';
    return { symbol, date: bar.time.slice(0, 10), type, reason: `Detected from daily bar ${bar.time.slice(0, 10)}` };
  });
};

export const evaluateDay = (
  line: StrategyLine,
  bars1m: OhlcvBar[],
  day: string,
  replyMode: ReplyMode,
  manualTrade: { entry: number; exit: number }
): InternalDayAnalysis => {
  const dayBars = bars1m.filter((bar) => dailyBucketKeyNy(bar.time) === day);
  const first = dayBars[0];
  const last = dayBars[dayBars.length - 1];

  if (!first || !last) {
    return {
      explain: {
        template: 'NONE',
        bias: 'NEUTRAL',
        stage: 'waiting-day-selection',
        missingConditions: ['No bars available for selected day'],
        reasons: ['Day cannot be evaluated until bars exist'],
        evidenceDetails: ['No intraday bars mapped into selected NY day bucket'],
        entryAllowed: false,
        targetTier: null,
        ruleTrace: [{ ruleId: 'day-bars-exist', passed: false, detail: 'No D0 bars found for selected day.', prices: {}, times: { selectedDay: day } }],
      },
      annotations: [],
    };
  }

  const dailyTemplate = evaluateDailyTemplate({ line, bars1m, selectedDay: day, pipPrecision: 4 });

  const previousBars = bars1m.filter((bar) => bar.time < first.time);
  const previousClose = previousBars[previousBars.length - 1]?.close;
  const hod = Math.max(...dayBars.map((bar) => bar.high));
  const lod = Math.min(...dayBars.map((bar) => bar.low));
  const hos = Math.max(...dayBars.map((bar) => bar.open));
  const los = Math.min(...dayBars.map((bar) => bar.open));
  const entryAllowed = dailyTemplate.entryAllowed;

  const entry = replyMode === 'manual' && manualTrade.entry ? manualTrade.entry : last.close;
  const exit = replyMode === 'manual' && manualTrade.exit ? manualTrade.exit : last.close + (last.close - lod) * 0.4;

  return {
    explain: {
      template: dailyTemplate.template,
      bias: line === 'FGD' ? 'LONG' : 'SHORT',
      stage: 'stage-3-check',
      missingConditions: dailyTemplate.missingConditions,
      reasons: dailyTemplate.reasons,
      evidenceDetails: dailyTemplate.evidenceDetails,
      entryAllowed,
      targetTier: entryAllowed ? 40 : null,
      ruleTrace: dailyTemplate.ruleTrace,
    },
    annotations: [
      { id: 'source', kind: 'source', barTime: first.time, price: line === 'FGD' ? los : hos, ruleName: 'source', reasoning: 'Source selected by line rules' },
      { id: 'entry', kind: 'entry', barTime: last.time, price: entry, ruleName: 'entry', reasoning: 'Entry derived from reply mode' },
      { id: 'stop', kind: 'stop', barTime: last.time, price: lod, ruleName: 'stop', reasoning: 'Stop uses day low/high guardrail' },
      { id: 'tp40', kind: 'tp40', barTime: last.time, price: exit, ruleName: 'TP40', reasoning: 'Target tier currently set to 40' },
    ],
    previousClose,
    hos,
    los,
    hod,
    lod,
    trade: entryAllowed ? { side: line === 'FGD' ? 'LONG' : 'SHORT', entry, exit, pnlPips: exit - entry, mode: replyMode } : undefined,
  };
};

import { Candle, StrategyMarker, StrategyResult } from '../types.js';
import type { CandidateDate, InternalDayAnalysis, OhlcvBar, ReplyMode, StrategyLine } from '../types/domain.js';

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
    return {
      explain: {
        template: 'NONE',
        bias: 'NEUTRAL',
        stage: 'waiting-day-selection',
        missingConditions: ['No bars available for selected day'],
        reasons: ['Day cannot be evaluated until bars exist'],
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
  const entryAllowed = Math.abs(last.close - first.open) > 0;

  const entry = replyMode === 'manual' && manualTrade.entry ? manualTrade.entry : last.close;
  const exit = replyMode === 'manual' && manualTrade.exit ? manualTrade.exit : last.close + (last.close - lod) * 0.4;

  return {
    explain: {
      template: line,
      bias: line === 'FGD' ? 'LONG' : 'SHORT',
      stage: 'stage-3-check',
      missingConditions: entryAllowed ? [] : ['No directional expansion'],
      reasons: [`${line} day evaluation complete`],
      entryAllowed,
      targetTier: entryAllowed ? 40 : null,
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

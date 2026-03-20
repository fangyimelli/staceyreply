import { aggregateBars, buildTimeframeBarMap, replayTimeframes } from "../aggregation/timeframe";
import type {
  Annotation,
  BacktestSignalSnapshot,
  CandidateTradeDay,
  EventLogItem,
  OhlcvBar,
  PracticeStatus,
  ReplayAnalysis,
  ReplayDatasetAnalysis,
  ReplayStageId,
  ReplayVisibility,
  RuleTraceItem,
  TemplateType,
  TimeframeBarMap,
  TradeLevel,
  TradeSide,
  UnifiedFeatureCategory,
  UnifiedHardGate,
  UnifiedSignalDayStrategy,
  UnifiedTemplateType,
  UnifiedWeightedFeature,
} from "../types/domain";
import { byNyDate, strategyNyDate, strategyNyLabel, strategyNyTime, strategyTime } from "../utils/nyDate";
import { validateDataset } from "../validation/datasetValidation";

const ema = (bars: OhlcvBar[], period: number) => {
  const k = 2 / (period + 1);
  let prev = bars[0]?.close ?? 0;
  return bars.map((bar) => {
    prev = bar.close * k + prev * (1 - k);
    return prev;
  });
};
const pips = (value: number) => Math.round(value / 0.0001);
const inNySession = (bar: OhlcvBar) => strategyNyTime(strategyTime(bar)) >= "07:00" && strategyNyTime(strategyTime(bar)) <= "11:00";
const entryWindowOpen = (bar?: OhlcvBar) => {
  const t = bar ? strategyNyTime(strategyTime(bar)) : "";
  return t >= "07:00" && t <= "08:30";
};
const id = (stage: ReplayStageId, suffix: string) => `${stage}-${suffix}`;
const featureCategoryOrder: UnifiedFeatureCategory[] = ["template-edge", "session-location", "entry-confirmation", "quality-behavior"];
const blockedTargetLevels = (template: TemplateType, reason: string): TradeLevel[] =>
  ([30, 35, 40, 50] as const).map((tier) => ({ tier, price: 0, eligible: false, hit: false, status: template === "INVALID" ? "blocked" : "pending", reason, missingGate: reason }));

const summarizeCandidate = (template: TemplateType, invalidReasons: string[], missingConditions: string[]) => {
  if (invalidReasons.length) return invalidReasons[0];
  if (template === "FGD") return "FGD candidate detected for Day 3 review.";
  if (template === "FRD" || template === "FRD_INSIDE") return `${template} candidate detected for Day 3 review.`;
  return missingConditions[0] ?? "Day 3 template is incomplete.";
};
const resolvePracticeStatus = (template: TemplateType, invalidReasons: string[]): PracticeStatus => {
  if (invalidReasons.length || template === "INVALID") return "filtered-out";
  return template === "FGD" || template === "FRD" || template === "FRD_INSIDE" ? "needs-practice" : "auto-only";
};

const makeEvent = (
  stage: ReplayStageId,
  title: string,
  summary: string,
  detail: string,
  visibleFromIndex: number,
  trace: RuleTraceItem[],
  barTime?: string,
  prices?: Record<string, number>,
): EventLogItem => ({ id: id(stage, String(visibleFromIndex)), stage, title, summary, detail, statusBanner: title, visibleFromIndex, barTime, prices, trace });

const makeAnnotation = (
  kind: Annotation["kind"],
  index: number,
  barTime: string,
  price: number,
  label: string,
  reasoning: string,
  trace: RuleTraceItem[],
): Annotation => ({ id: `${kind}-${barTime}`, kind, barTime, price, label, reasoning, trace, visibleFromIndex: index });

const featureWeightForTemplate = (feature: { weightFGD: number; weightFRD: number }, templateType?: UnifiedTemplateType) =>
  templateType === "FGD" ? feature.weightFGD : feature.weightFRD;

interface StrategyContext {
  templateType?: UnifiedTemplateType;
  template: TemplateType;
  direction: TradeSide;
  d1?: OhlcvBar;
  d2?: OhlcvBar;
  tradeGroup: OhlcvBar[];
  session: OhlcvBar[];
  five: OhlcvBar[];
  ema5: number[];
  sourceBar?: OhlcvBar;
  sourcePrice?: number;
  sourceLocationLabel: string;
  stopHuntBar?: OhlcvBar;
  peakBar?: OhlcvBar;
  engulfmentBar?: OhlcvBar;
  pinBar?: OhlcvBar;
  pattern123Ready: boolean;
  emaConfirmBar?: OhlcvBar;
  entryBar?: OhlcvBar;
  entryPrice?: number;
  stopPrice?: number;
  stopDistancePips?: number;
  previousClose?: number;
  sourceToPrevClosePips?: number;
  sessionLabel: "newYorkSession" | "londonSession" | "asiaSession";
  d1BodyPips?: number;
  d1BodyPctRange?: number;
  insideDay: boolean;
  firstHourTouchedPrevClose: boolean;
  roundNumberConfluence: boolean;
  strikeZoneConfluence: boolean;
  immediateFollowThrough: boolean;
}

const scoreBandFor = (score: number) => {
  if (score >= 75) return "textbook" as const;
  if (score >= 60) return "valid" as const;
  if (score >= 45) return "aggressive" as const;
  return "no-trade" as const;
};

const buildWeightedFeatures = (ctx: StrategyContext): UnifiedWeightedFeature[] => {
  const features: Array<Omit<UnifiedWeightedFeature, "contribution">> = [
    { key: "baselineTemplate", label: "Baseline template", value: ctx.templateType ?? "none", active: Boolean(ctx.templateType), weightFGD: 10, weightFRD: 10, category: "template-edge" },
    { key: "insideDay", label: "Inside day", value: ctx.insideDay, active: ctx.insideDay, weightFGD: 4, weightFRD: 15, category: "template-edge" },
    { key: "d1BodyPipsGE40", label: "D-1 body >= 40 pips", value: ctx.d1BodyPips ?? 0, active: (ctx.d1BodyPips ?? 0) >= 40, weightFGD: 15, weightFRD: 0, category: "template-edge" },
    { key: "d1BodyPctRangeGE60", label: "D-1 body >= 60% range", value: ctx.d1BodyPctRange ?? 0, active: (ctx.d1BodyPctRange ?? 0) >= 60, weightFGD: 15, weightFRD: 0, category: "template-edge" },
    { key: "sourceToPrevCloseLE10", label: "Source to previous close <= 10 pips", value: ctx.sourceToPrevClosePips ?? "n/a", active: (ctx.sourceToPrevClosePips ?? Infinity) <= 10, weightFGD: 2, weightFRD: 10, category: "template-edge" },
    { key: "sourceToPrevCloseLE5", label: "Source to previous close <= 5 pips", value: ctx.sourceToPrevClosePips ?? "n/a", active: (ctx.sourceToPrevClosePips ?? Infinity) <= 5, weightFGD: 2, weightFRD: 10, category: "template-edge" },
    { key: "firstHourTouchedPrevClose", label: "First hour touched previous close", value: ctx.firstHourTouchedPrevClose, active: ctx.firstHourTouchedPrevClose, weightFGD: 3, weightFRD: 10, category: "template-edge" },
    { key: "newYorkSession", label: "New York session", value: ctx.sessionLabel, active: ctx.sessionLabel === "newYorkSession", weightFGD: 10, weightFRD: 10, category: "session-location" },
    { key: "londonSession", label: "London session", value: ctx.sessionLabel, active: ctx.sessionLabel === "londonSession", weightFGD: 6, weightFRD: 6, category: "session-location" },
    { key: "asiaSession", label: "Asia session", value: ctx.sessionLabel, active: ctx.sessionLabel === "asiaSession", weightFGD: 4, weightFRD: 4, category: "session-location" },
    { key: "lowSideLocationActive", label: "Low-side source location active", value: ctx.sourceLocationLabel, active: ctx.direction === "long" && Boolean(ctx.sourceBar), weightFGD: 10, weightFRD: 0, category: "session-location" },
    { key: "highSideLocationActive", label: "High-side source location active", value: ctx.sourceLocationLabel, active: ctx.direction === "short" && Boolean(ctx.sourceBar), weightFGD: 0, weightFRD: 10, category: "session-location" },
    { key: "emaCloseInside20", label: "5m close back inside 20EMA", value: Boolean(ctx.emaConfirmBar), active: Boolean(ctx.emaConfirmBar), weightFGD: 20, weightFRD: 20, category: "entry-confirmation" },
    { key: "peakFormationSeen", label: "Peak formation seen", value: Boolean(ctx.peakBar), active: Boolean(ctx.peakBar), weightFGD: 8, weightFRD: 8, category: "entry-confirmation" },
    { key: "engulfmentSeen", label: "Engulfment seen", value: Boolean(ctx.engulfmentBar), active: Boolean(ctx.engulfmentBar), weightFGD: 6, weightFRD: 6, category: "entry-confirmation" },
    { key: "pinHammerSeen", label: "Pin / hammer seen", value: Boolean(ctx.pinBar), active: Boolean(ctx.pinBar), weightFGD: 6, weightFRD: 6, category: "entry-confirmation" },
    { key: "stopHuntSeen", label: "Stop hunt seen", value: Boolean(ctx.stopHuntBar), active: Boolean(ctx.stopHuntBar), weightFGD: 6, weightFRD: 6, category: "entry-confirmation" },
    { key: "pattern123Seen", label: "123 pattern seen", value: ctx.pattern123Ready, active: ctx.pattern123Ready, weightFGD: 6, weightFRD: 6, category: "entry-confirmation" },
    { key: "roundNumberConfluence", label: "Round number confluence", value: ctx.roundNumberConfluence, active: ctx.roundNumberConfluence, weightFGD: 4, weightFRD: 4, category: "entry-confirmation" },
    { key: "strikeZoneConfluence", label: "Strike zone confluence", value: ctx.strikeZoneConfluence, active: ctx.strikeZoneConfluence, weightFGD: 6, weightFRD: 6, category: "entry-confirmation" },
    { key: "noMajorRedNews", label: "No major red news", value: true, active: true, weightFGD: 5, weightFRD: 5, category: "quality-behavior" },
    { key: "entryNearTimingWindowOpen", label: "Entry near timing window open", value: Boolean(ctx.entryBar), active: entryWindowOpen(ctx.entryBar), weightFGD: 5, weightFRD: 5, category: "quality-behavior" },
    { key: "immediateFollowThrough", label: "Immediate follow-through", value: ctx.immediateFollowThrough, active: ctx.immediateFollowThrough, weightFGD: 5, weightFRD: 5, category: "quality-behavior" },
  ];

  return features.map((feature) => ({ ...feature, contribution: feature.active ? featureWeightForTemplate(feature, ctx.templateType) : 0 }));
};

export const evaluateUnifiedSignalDayStrategy = (ctx: StrategyContext): UnifiedSignalDayStrategy => {
  const hardGates: UnifiedHardGate[] = [
    { key: "templateValid", label: "Template valid", passed: Boolean(ctx.templateType), reason: ctx.templateType ? `${ctx.templateType} template confirmed from D-2/D-1 structure.` : "Template is not valid FRD/FGD/FRD_INSIDE." },
    { key: "day3Active", label: "Day 3 active", passed: ctx.tradeGroup.length > 0, reason: ctx.tradeGroup.length > 0 ? "Trade day bars are loaded." : "Trade day bars are unavailable." },
    { key: "sessionTimingValid", label: "Session timing valid", passed: ctx.session.length > 0, reason: ctx.session.length > 0 ? "New York session is active and visible." : "New York session bars are unavailable." },
    { key: "sourceLocationValid", label: "Source location valid", passed: Boolean(ctx.sourceBar), reason: ctx.sourceBar ? `${ctx.sourceLocationLabel} source is active.` : `Missing ${ctx.direction === "long" ? "LOD / LOS / low-side LHF" : "HOD / HOS / high-side LHF"} source.` },
    { key: "emaEntryValid", label: "EMA entry valid", passed: Boolean(ctx.emaConfirmBar), reason: ctx.emaConfirmBar ? `5m ${ctx.direction === "long" ? "bullish" : "bearish"} close returned inside 20EMA.` : "5m EMA re-entry confirm has not happened yet." },
    { key: "stopDistanceValid", label: "Stop distance valid", passed: (ctx.stopDistancePips ?? Infinity) <= 20, reason: ctx.stopDistancePips === undefined ? "Stop distance unavailable." : ctx.stopDistancePips <= 20 ? `Stop distance ${ctx.stopDistancePips} pips is within max 20.` : `Stop distance ${ctx.stopDistancePips} pips exceeds max 20.` },
  ];

  const weightedFeatures = buildWeightedFeatures(ctx);
  const score = Math.min(100, weightedFeatures.reduce((sum, feature) => sum + feature.contribution, 0));
  const scoreBand = scoreBandFor(score);
  const hardGateFailures = hardGates.filter((gate) => !gate.passed).map((gate) => `${gate.label}: ${gate.reason}`);
  const entryAllowed = hardGateFailures.length === 0 && score >= 75;
  const whyEntryBlocked = [
    ...hardGateFailures.map((reason) => `Hard gate failed — ${reason}`),
    ...(hardGateFailures.length === 0 && score < 75 ? [`Score below threshold — ${score}/100 < 75.`] : []),
  ];
  const byCategory = Object.fromEntries(featureCategoryOrder.map((category) => [category, weightedFeatures.filter((feature) => feature.category === category).reduce((sum, feature) => sum + feature.contribution, 0)])) as Record<UnifiedFeatureCategory, number>;
  const topPositiveFeatures = [...weightedFeatures].filter((feature) => feature.active && feature.contribution > 0).sort((a, b) => b.contribution - a.contribution).slice(0, 5);
  const missingHighValueFeatures = [...weightedFeatures].filter((feature) => !feature.active && featureWeightForTemplate(feature, ctx.templateType) >= 8).sort((a, b) => featureWeightForTemplate(b, ctx.templateType) - featureWeightForTemplate(a, ctx.templateType)).slice(0, 5);

  return {
    templateType: ctx.templateType,
    direction: ctx.direction,
    hardGates,
    weightedFeatures,
    score,
    scoreBand,
    entryAllowed,
    entryReason: entryAllowed ? `Entry allowed — all hard gates passed and score is ${score}/100 (${scoreBand}).` : whyEntryBlocked[0] ?? "Entry blocked.",
    debugBreakdown: { byCategory, topPositiveFeatures, missingHighValueFeatures, whyEntryBlocked },
  };
};

const templateBias = (template: TemplateType) => template === "FGD" ? "bullish" : template === "FRD" || template === "FRD_INSIDE" ? "bearish" : "neutral";
const templateDirection = (templateType?: UnifiedTemplateType): TradeSide => templateType === "FGD" ? "long" : "short";
const bandLabel = (band: UnifiedSignalDayStrategy["scoreBand"]) => band;

const buildRuleTrace = (strategy: UnifiedSignalDayStrategy, ctx: StrategyContext, tradeDay: string): RuleTraceItem[] => [
  ...strategy.hardGates.map((gate) => ({ ruleName: `Hard gate: ${gate.key}`, timeframe: gate.key === "emaEntryValid" ? "5m" : "session", passed: gate.passed, reason: gate.reason, prices: { score: strategy.score, stopDistancePips: ctx.stopDistancePips ?? -1, sourceToPrevClosePips: ctx.sourceToPrevClosePips ?? -1 }, times: { tradeDay } })),
  ...strategy.weightedFeatures.map((feature) => ({ ruleName: `Feature: ${feature.key}`, timeframe: feature.key === "emaCloseInside20" ? "5m" : "session", passed: feature.active, reason: `${feature.label} ${feature.active ? "active" : "inactive"}; contribution ${feature.contribution}.`, prices: { contribution: feature.contribution, value: typeof feature.value === "number" ? feature.value : feature.active ? 1 : 0 }, times: { tradeDay } })),
] as RuleTraceItem[];

const resolveReplayVisibility = (analysis: ReplayDatasetAnalysis, currentBarIndex: number): ReplayVisibility => {
  const visibleEvents = analysis.eventLog.filter((event) => event.visibleFromIndex <= currentBarIndex);
  const visibleAnnotations = analysis.annotations.filter((annotation) => annotation.visibleFromIndex <= currentBarIndex);
  const latestVisibleEvent = visibleEvents.slice(-1)[0];
  const canEnter = analysis.unifiedStrategy.entryAllowed && currentBarIndex >= analysis.replayStartIndex;
  const stage = analysis.invalidReasons.length > 0 ? "invalid" : canEnter ? "entry" : latestVisibleEvent?.stage ?? "background";
  const statusBanner = latestVisibleEvent?.statusBanner ?? analysis.unifiedStrategy.entryReason;
  const currentReasoning = [analysis.unifiedStrategy.entryReason, ...analysis.unifiedStrategy.debugBreakdown.whyEntryBlocked].filter(Boolean);
  return {
    stage,
    canEnter,
    statusBanner,
    currentReasoning,
    currentBarIndex,
    visibleEvents,
    visibleAnnotations,
    lastReplyEval: { stage, canReply: canEnter, explanation: analysis.unifiedStrategy.entryReason },
  };
};

const sliceBarsThroughTradeDay = (bars1m: OhlcvBar[], selectedTradeDay: string) => bars1m.filter((bar) => strategyNyDate(strategyTime(bar)) <= selectedTradeDay);
const sliceTimeframeBarMapThroughTradeDay = (timeframeBars: Partial<TimeframeBarMap> | undefined, selectedTradeDay: string): Partial<TimeframeBarMap> =>
  Object.fromEntries(replayTimeframes.map((timeframe) => [timeframe, (timeframeBars?.[timeframe] ?? []).filter((bar) => strategyNyDate(strategyTime(bar)) <= selectedTradeDay)])) as Partial<TimeframeBarMap>;
const buildReplayTimeframeBars = (scopedBars1m: OhlcvBar[], precomputedTimeframeBars?: Partial<TimeframeBarMap>): TimeframeBarMap => {
  const runtimeFallback = buildTimeframeBarMap(scopedBars1m);
  return Object.fromEntries(replayTimeframes.map((timeframe) => {
    const precomputed = precomputedTimeframeBars?.[timeframe];
    return [timeframe, Array.isArray(precomputed) && precomputed.length > 0 ? precomputed : runtimeFallback[timeframe]];
  })) as TimeframeBarMap;
};

const findSourceBar = (templateType: UnifiedTemplateType | undefined, session: OhlcvBar[]) => {
  if (!templateType || !session.length) return undefined;
  if (templateType === "FGD") return session.reduce((best, bar) => (!best || bar.low < best.low ? bar : best), session[0]);
  return session.reduce((best, bar) => (!best || bar.high > best.high ? bar : best), session[0]);
};

const findPeakFormationBar = (templateType: UnifiedTemplateType | undefined, sourceBar: OhlcvBar | undefined, session: OhlcvBar[]) => {
  if (!templateType || !sourceBar) return undefined;
  const sourceIndex = session.findIndex((bar) => strategyTime(bar) === strategyTime(sourceBar));
  const lookahead = session.slice(sourceIndex, Math.min(sourceIndex + 6, session.length));
  if (!lookahead.length) return undefined;
  return templateType === "FGD"
    ? lookahead.reduce((best, bar) => (bar.low <= (best?.low ?? Infinity) ? bar : best), lookahead[0])
    : lookahead.reduce((best, bar) => (bar.high >= (best?.high ?? -Infinity) ? bar : best), lookahead[0]);
};

const findStopHuntBar = (templateType: UnifiedTemplateType | undefined, sourceBar: OhlcvBar | undefined, session: OhlcvBar[]) => {
  if (!templateType || !sourceBar) return undefined;
  const sourceIndex = session.findIndex((bar) => strategyTime(bar) === strategyTime(sourceBar));
  const reclaimWindow = session.slice(sourceIndex + 1, sourceIndex + 4);
  return reclaimWindow.find((bar) => templateType === "FGD" ? bar.close > sourceBar.low : bar.close < sourceBar.high);
};

const findPattern123 = (templateType: UnifiedTemplateType | undefined, sourceBar: OhlcvBar | undefined, session: OhlcvBar[]) => {
  if (!templateType || !sourceBar) return false;
  const sourceIndex = session.findIndex((bar) => strategyTime(bar) === strategyTime(sourceBar));
  if (sourceIndex < 0 || session.length < sourceIndex + 4) return false;
  const a = session[sourceIndex + 1];
  const b = session[sourceIndex + 2];
  const c = session[sourceIndex + 3];
  if (!a || !b || !c) return false;
  return templateType === "FGD" ? a.high < b.high && c.low > sourceBar.low : a.low > b.low && c.high < sourceBar.high;
};

const findEngulfmentBar = (templateType: UnifiedTemplateType | undefined, session: OhlcvBar[]) => {
  if (!templateType) return undefined;
  for (let i = 1; i < session.length; i += 1) {
    const prev = session[i - 1];
    const curr = session[i];
    if (templateType === "FGD" && prev.close < prev.open && curr.close > curr.open && curr.close >= prev.open && curr.open <= prev.close) return curr;
    if (templateType !== "FGD" && prev.close > prev.open && curr.close < curr.open && curr.close <= prev.open && curr.open >= prev.close) return curr;
  }
  return undefined;
};

const findPinBar = (templateType: UnifiedTemplateType | undefined, session: OhlcvBar[]) =>
  session.find((bar) => {
    const body = Math.abs(bar.close - bar.open);
    const range = Math.max(bar.high - bar.low, 0.00001);
    const upperWick = bar.high - Math.max(bar.open, bar.close);
    const lowerWick = Math.min(bar.open, bar.close) - bar.low;
    return templateType === "FGD" ? lowerWick >= body * 2 && body / range <= 0.35 : upperWick >= body * 2 && body / range <= 0.35;
  });

const findEmaConfirmBar = (templateType: UnifiedTemplateType | undefined, five: OhlcvBar[], ema5: number[]) => {
  if (!templateType) return undefined;
  for (let i = 1; i < five.length; i += 1) {
    if (templateType === "FGD" && five[i].close > ema5[i]) return five[i];
    if (templateType !== "FGD" && five[i].close < ema5[i]) return five[i];
  }
  return undefined;
};

const findSessionLabel = () => "newYorkSession" as const;
const isRoundNumber = (price?: number) => price !== undefined && Math.abs((price * 10000) % 50) <= 5;
const resolveTemplateType = (d2?: OhlcvBar, d1?: OhlcvBar): UnifiedTemplateType | undefined => {
  const dump = Boolean(d2 && d2.close < d2.open);
  const pump = Boolean(d2 && d2.close > d2.open);
  const bullishD1 = Boolean(d1 && d1.close > d1.open);
  const bearishD1 = Boolean(d1 && d1.close < d1.open);
  const inside = Boolean(d1 && d2 && d1.high <= d2.high && d1.low >= d2.low);
  if (dump && bullishD1) return "FGD";
  if (pump && bearishD1 && inside) return "FRD_INSIDE";
  if (pump && bearishD1) return "FRD";
  return undefined;
};
const resolveTemplate = (templateType?: UnifiedTemplateType, invalidReasons: string[] = []): TemplateType => invalidReasons.length ? "INVALID" : templateType ?? "INCOMPLETE";

const buildBacktestSnapshot = (analysis: Omit<ReplayDatasetAnalysis, "backtestSnapshot">): BacktestSignalSnapshot => ({
  templateType: analysis.unifiedStrategy.templateType,
  direction: analysis.unifiedStrategy.direction,
  score: analysis.unifiedStrategy.score,
  scoreBand: analysis.unifiedStrategy.scoreBand,
  hardGates: analysis.unifiedStrategy.hardGates,
  activeFeatures: analysis.unifiedStrategy.weightedFeatures.filter((feature) => feature.active).map((feature) => feature.key),
  sourceToPrevClosePips: analysis.ruleTrace.find((trace) => trace.ruleName === "Metric: sourceToPrevClosePips")?.prices.value,
  d1BodyPips: analysis.ruleTrace.find((trace) => trace.ruleName === "Metric: d1BodyPips")?.prices.value,
  d1BodyPctRange: analysis.ruleTrace.find((trace) => trace.ruleName === "Metric: d1BodyPctRange")?.prices.value,
  hit30: analysis.targetLevels.find((level) => level.tier === 30)?.hit ?? false,
  hit35: analysis.targetLevels.find((level) => level.tier === 35)?.hit ?? false,
  hit40: analysis.targetLevels.find((level) => level.tier === 40)?.hit ?? false,
  hit50: analysis.targetLevels.find((level) => level.tier === 50)?.hit ?? false,
});

export const buildReplayDatasetAnalysis = (
  datasetId: string,
  symbol: string,
  bars1m: OhlcvBar[],
  selectedTradeDay?: string,
  precomputedTimeframeBars?: Partial<TimeframeBarMap>,
): ReplayDatasetAnalysis => {
  const groupedByDay = byNyDate(bars1m);
  const days = Object.keys(groupedByDay).sort();
  const tradeDay = selectedTradeDay ?? days[days.length - 1] ?? "";
  const scopedBars = selectedTradeDay ? sliceBarsThroughTradeDay(bars1m, tradeDay) : bars1m;
  const scopedPrecomputedTimeframeBars = selectedTradeDay ? sliceTimeframeBarMapThroughTradeDay(precomputedTimeframeBars, tradeDay) : precomputedTimeframeBars;
  const timeframeBars = buildReplayTimeframeBars(scopedBars, scopedPrecomputedTimeframeBars);
  const invalidIssues = validateDataset(scopedBars);
  const invalidReasons = invalidIssues.map((issue) => issue.message);
  const scopedGroupedByDay = byNyDate(scopedBars);
  const daily = timeframeBars["1D"];
  const d2 = daily[daily.length - 3];
  const d1 = daily[daily.length - 2];
  const tradeGroup = scopedGroupedByDay[tradeDay] ?? [];
  const session = tradeGroup.filter(inNySession);
  const five = aggregateBars(session, "5m");
  const ema5 = ema(five, 20);
  const previousClose = d1?.close;
  const templateType = resolveTemplateType(d2, d1);
  const template = resolveTemplate(templateType, invalidReasons);
  const direction = templateType === "FGD" ? "long" : "short";
  const sourceBar = findSourceBar(templateType, session);
  const sourcePrice = sourceBar ? templateType === "FGD" ? sourceBar.low : sourceBar.high : undefined;
  const peakBar = findPeakFormationBar(templateType, sourceBar, session);
  const stopHuntBar = findStopHuntBar(templateType, sourceBar, session);
  const engulfmentBar = findEngulfmentBar(templateType, session);
  const pinBar = findPinBar(templateType, session);
  const pattern123Ready = findPattern123(templateType, sourceBar, session);
  const emaConfirmBar = findEmaConfirmBar(templateType, five, ema5);
  const stopPrice = peakBar ? templateType === "FGD" ? peakBar.low : peakBar.high : sourcePrice;
  const entryBar = emaConfirmBar;
  const entryPrice = entryBar?.close;
  const stopDistancePips = entryPrice !== undefined && stopPrice !== undefined ? pips(Math.abs(entryPrice - stopPrice)) : undefined;
  const sourceToPrevClosePips = sourcePrice !== undefined && previousClose !== undefined ? pips(Math.abs(sourcePrice - previousClose)) : undefined;
  const d1BodyPips = d1 ? pips(Math.abs(d1.close - d1.open)) : undefined;
  const d1BodyPctRange = d1 ? Math.round((Math.abs(d1.close - d1.open) / Math.max(d1.high - d1.low, 0.00001)) * 100) : undefined;
  const insideDay = Boolean(d1 && d2 && d1.high <= d2.high && d1.low >= d2.low);
  const firstHour = session.slice(0, 60);
  const firstHourTouchedPrevClose = previousClose !== undefined && firstHour.some((bar) => bar.low <= previousClose && bar.high >= previousClose);
  const roundNumberConfluence = isRoundNumber(sourcePrice) || isRoundNumber(entryPrice);
  const strikeZoneConfluence = Boolean(sourceBar && ((templateType === "FGD" && (sourceBar.low <= Math.min(...tradeGroup.map((bar) => bar.low), sourceBar.low + 1))) || (templateType !== "FGD" && sourceBar.high >= Math.max(...tradeGroup.map((bar) => bar.high), sourceBar.high - 1))));
  const immediateFollowThrough = Boolean(entryBar && entryPrice !== undefined && tradeGroup.slice(tradeGroup.findIndex((bar) => strategyTime(bar) === strategyTime(entryBar)) + 1, tradeGroup.findIndex((bar) => strategyTime(bar) === strategyTime(entryBar)) + 4).some((bar) => templateType === "FGD" ? bar.high >= entryPrice + 0.0005 : bar.low <= entryPrice - 0.0005));
  const sourceLocationLabel = templateType === "FGD" ? "LOD / LOS / low-side LHF zone" : "HOD / HOS / high-side LHF zone";
  const ctx: StrategyContext = { templateType, template, direction: templateDirection(templateType), d1, d2, tradeGroup, session, five, ema5, sourceBar, sourcePrice, sourceLocationLabel, stopHuntBar, peakBar, engulfmentBar, pinBar, pattern123Ready, emaConfirmBar, entryBar, entryPrice, stopPrice, stopDistancePips, previousClose, sourceToPrevClosePips, sessionLabel: findSessionLabel(), d1BodyPips, d1BodyPctRange, insideDay, firstHourTouchedPrevClose, roundNumberConfluence, strikeZoneConfluence, immediateFollowThrough };
  const unifiedStrategy = evaluateUnifiedSignalDayStrategy(ctx);
  const startIndex = scopedBars.findIndex((bar) => strategyNyDate(strategyTime(bar)) === tradeDay && inNySession(bar));
  const replayStartIndex = Math.max(0, startIndex);
  const replayEndIndex = scopedBars.length - 1;
  const annotations: Annotation[] = [];
  const missingConditions = unifiedStrategy.debugBreakdown.whyEntryBlocked.length ? [...unifiedStrategy.debugBreakdown.whyEntryBlocked] : [];
  const bias = templateBias(template);
  const quality = invalidReasons.length ? "invalid" : unifiedStrategy.score >= 75 ? "strong" : unifiedStrategy.score >= 60 ? "acceptable" : "weak";
  const eventLog: EventLogItem[] = [
    makeEvent("background", templateType === "FGD" ? "Dump Day → FGD" : templateType ? `${templateType} template` : "Template incomplete", "Unified signal-day scoring initialized.", summarizeCandidate(template, invalidReasons, missingConditions), 0, [], strategyTime(d2 ?? scopedBars[0] ?? { time: "" })),
    makeEvent("trade-day", `Score ${unifiedStrategy.score}/100`, `Band ${bandLabel(unifiedStrategy.scoreBand)}.`, unifiedStrategy.entryReason, replayStartIndex, [], strategyTime(session[0] ?? scopedBars[replayStartIndex] ?? { time: "" }), { score: unifiedStrategy.score }),
    makeEvent("entry", unifiedStrategy.entryAllowed ? "Entry valid" : "Entry blocked", "Unified score gate evaluated.", unifiedStrategy.entryReason, replayStartIndex, [], strategyTime(entryBar ?? session[0] ?? scopedBars[replayStartIndex] ?? { time: "" }), { score: unifiedStrategy.score, entry: entryPrice ?? 0, stop: stopPrice ?? 0 }),
  ];
  const ruleTrace: RuleTraceItem[] = [
    ...buildRuleTrace(unifiedStrategy, ctx, tradeDay),
    { ruleName: "Metric: sourceToPrevClosePips", timeframe: "session", passed: sourceToPrevClosePips !== undefined, reason: "Source to previous close distance.", prices: { value: sourceToPrevClosePips ?? -1 }, times: { tradeDay } },
    { ruleName: "Metric: d1BodyPips", timeframe: "1D", passed: d1BodyPips !== undefined, reason: "D-1 body size in pips.", prices: { value: d1BodyPips ?? -1 }, times: { tradeDay } },
    { ruleName: "Metric: d1BodyPctRange", timeframe: "1D", passed: d1BodyPctRange !== undefined, reason: "D-1 body as % of range.", prices: { value: d1BodyPctRange ?? -1 }, times: { tradeDay } },
  ];

  if (sourceBar && sourcePrice !== undefined) annotations.push(makeAnnotation("source", replayStartIndex, strategyTime(sourceBar), sourcePrice, "Source", sourceLocationLabel, []));
  if (stopPrice !== undefined && sourceBar) annotations.push(makeAnnotation("stop", replayStartIndex, strategyTime(sourceBar), stopPrice, "Stop", `Stop based on ${templateType === "FGD" ? "5m peak formation low" : "5m peak formation high"}.`, []));
  if (entryBar && entryPrice !== undefined) annotations.push(makeAnnotation("entry", replayStartIndex, strategyTime(entryBar), entryPrice, "Entry", unifiedStrategy.entryReason, []));

  const targetLevels: TradeLevel[] = ([30, 35, 40, 50] as const).map((tier) => {
    const price = entryPrice === undefined ? 0 : direction === "long" ? entryPrice + tier * 0.0001 : entryPrice - tier * 0.0001;
    const hit = entryPrice !== undefined && scopedBars.slice(Math.max(replayStartIndex, scopedBars.findIndex((bar) => strategyTime(bar) === strategyTime(entryBar ?? scopedBars[replayStartIndex])))).some((bar) => direction === "long" ? bar.high >= price : bar.low <= price);
    return { tier, price, eligible: unifiedStrategy.entryAllowed, hit, status: !unifiedStrategy.entryAllowed ? "blocked" : hit ? "hit" : "eligible", reason: `TP${tier} from unified entry basis.`, missingGate: unifiedStrategy.entryAllowed ? undefined : unifiedStrategy.entryReason };
  });

  targetLevels.forEach((level) => {
    if (entryBar) annotations.push(makeAnnotation(`tp${level.tier}` as Annotation["kind"], replayStartIndex, strategyTime(entryBar), level.price, `TP${level.tier}`, level.reason, []));
  });

  const baseAnalysis: Omit<ReplayDatasetAnalysis, "backtestSnapshot"> = {
    datasetId,
    symbol,
    timeframeBars,
    template,
    bias,
    quality,
    selectedTradeDay: tradeDay,
    invalidReasons,
    missingConditions,
    nextExpectation: unifiedStrategy.entryAllowed ? "Manage TP30 / TP35 / TP40 / TP50 from unified score-qualified entry." : "Improve hard gates or weighted score toward 75+ before entry.",
    eventLog,
    ruleTrace,
    annotations,
    replayStartIndex,
    replayEndIndex,
    stopPrice,
    entryPrice,
    sourcePrice,
    previousClose,
    hos: session.length ? Math.max(...session.map((bar) => bar.high)) : undefined,
    los: session.length ? Math.min(...session.map((bar) => bar.low)) : undefined,
    hod: tradeGroup.length ? Math.max(...tradeGroup.map((bar) => bar.high)) : undefined,
    lod: tradeGroup.length ? Math.min(...tradeGroup.map((bar) => bar.low)) : undefined,
    targetLevels: invalidReasons.length ? blockedTargetLevels(template, invalidReasons[0]) : targetLevels,
    recommendedTarget: unifiedStrategy.entryAllowed ? 50 : undefined,
    unifiedStrategy,
  };

  return { ...baseAnalysis, backtestSnapshot: buildBacktestSnapshot(baseAnalysis) };
};

const resolveCurrentTargetLevels = (analysis: ReplayDatasetAnalysis, currentBarIndex: number): { targetLevels: TradeLevel[]; recommendedTarget?: 30 | 35 | 40 | 50 } => {
  if (!analysis.unifiedStrategy.entryAllowed || analysis.entryPrice === undefined) {
    return { targetLevels: analysis.targetLevels.map((level) => ({ ...level, eligible: false, status: "blocked", missingGate: analysis.unifiedStrategy.entryReason })), recommendedTarget: undefined };
  }
  const entryIndex = Math.max(analysis.replayStartIndex, analysis.timeframeBars["1m"].findIndex((bar) => analysis.entryPrice !== undefined && Math.abs(bar.close - analysis.entryPrice) < 1e-9));
  const visibleBars = analysis.timeframeBars["1m"].slice(entryIndex, currentBarIndex + 1);
  const targetLevels = analysis.targetLevels.map((level) => {
    const hit = visibleBars.some((bar) => analysis.unifiedStrategy.direction === "long" ? bar.high >= level.price : bar.low <= level.price);
    return { ...level, eligible: true, hit, status: (hit ? "hit" : "eligible") as TradeLevel["status"], missingGate: undefined };
  });
  return { targetLevels, recommendedTarget: targetLevels.filter((level) => level.hit).slice(-1)[0]?.tier ?? 30 };
};

export const buildReplayAnalysis = (datasetAnalysis: ReplayDatasetAnalysis, currentBarIndex: number): ReplayAnalysis => ({ ...datasetAnalysis, ...resolveCurrentTargetLevels(datasetAnalysis, currentBarIndex), ...resolveReplayVisibility(datasetAnalysis, currentBarIndex) });

export const scanCandidateTradeDays = (datasetId: string, symbol: string, bars1m: OhlcvBar[]): CandidateTradeDay[] => {
  const days = Object.keys(byNyDate(bars1m)).sort();
  return days.slice(2).map((tradeDay) => {
    const analysis = buildReplayDatasetAnalysis(datasetId, symbol, bars1m, tradeDay, undefined);
    return {
      eventId: tradeDay,
      date: tradeDay,
      template: analysis.template,
      practiceStatus: resolvePracticeStatus(analysis.template, analysis.invalidReasons),
      valid: !analysis.invalidReasons.length && analysis.template !== "INCOMPLETE",
      shortSummary: summarizeCandidate(analysis.template, analysis.invalidReasons, analysis.missingConditions),
    };
  });
};

export const toNyLabel = strategyNyLabel;

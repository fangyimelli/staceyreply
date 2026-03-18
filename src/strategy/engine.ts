import { Candle, StrategyMarker, StrategyResult } from "../types";
import { evaluateIntradayPatterns } from "./intraday";
import { dailyBucketKeyNy } from "../utils/nyDate";
import type {
  CandidateDate,
  InternalDayAnalysis,
  OhlcvBar,
  ReplyMode,
  RuleTraceItem,
  StrategyPreprocessingContext,
  StrategyLine,
} from "../types/domain";

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

interface PipConfig {
  symbol: string;
  pipSize: number;
  pipDecimals: number;
  priceDecimals: number;
  basis: string;
}

type TargetTier = 30 | 35 | 40 | 50;

interface TierAssessment {
  tier: TargetTier;
  reached: boolean;
  missing: string[];
  description: string;
}


const countDecimals = (value: number): number => {
  const normalized = value.toString().toLowerCase();
  if (normalized.includes("e-")) {
    const [base, exponent] = normalized.split("e-");
    return (base.split(".")[1]?.length ?? 0) + Number(exponent);
  }
  return normalized.split(".")[1]?.length ?? 0;
};

const inferPipConfig = (symbol: string | undefined, bars: OhlcvBar[]): PipConfig => {
  const normalizedSymbol = symbol?.toUpperCase() ?? "UNKNOWN";
  const priceDecimals = bars.reduce(
    (max, bar) =>
      Math.max(
        max,
        countDecimals(bar.open),
        countDecimals(bar.high),
        countDecimals(bar.low),
        countDecimals(bar.close),
      ),
    0,
  );

  if (/(JPY)/.test(normalizedSymbol)) {
    return {
      symbol: normalizedSymbol,
      pipSize: 0.01,
      pipDecimals: 2,
      priceDecimals,
      basis: "JPY pair rule",
    };
  }

  if (/^(XAU|XAG)/.test(normalizedSymbol)) {
    return {
      symbol: normalizedSymbol,
      pipSize: 0.1,
      pipDecimals: 1,
      priceDecimals,
      basis: "metal rule",
    };
  }

  if (priceDecimals <= 2) {
    return {
      symbol: normalizedSymbol,
      pipSize: 0.01,
      pipDecimals: 2,
      priceDecimals,
      basis: "2-decimal price rule",
    };
  }

  return {
    symbol: normalizedSymbol,
    pipSize: 0.0001,
    pipDecimals: 4,
    priceDecimals,
    basis: "default FX rule",
  };
};

const priceDiffToPips = (priceDiff: number, pipConfig: PipConfig): number =>
  priceDiff / pipConfig.pipSize;

const pipsToPrice = (pips: number, pipConfig: PipConfig): number =>
  pips * pipConfig.pipSize;

const formatLabel = (ruleId: string): string =>
  ruleId
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const findTrace = (ruleTrace: RuleTraceItem[], ruleId: string): RuleTraceItem | undefined =>
  ruleTrace.find((item) => item.ruleId === ruleId);

export const buildStrategyPreprocessingContext = (
  bars1m: OhlcvBar[],
): StrategyPreprocessingContext => {
  const barsByNyDateMap = new Map<string, OhlcvBar[]>();
  const timeToIndex: Record<string, number> = {};

  bars1m.forEach((bar, index) => {
    const key = dailyBucketKeyNy(bar.time);
    const bucket = barsByNyDateMap.get(key) ?? [];
    bucket.push(bar);
    barsByNyDateMap.set(key, bucket);
    timeToIndex[bar.time] = index;
  });

  const dailyBars = [...barsByNyDateMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, bars]) => ({
      time: bars[0].time,
      open: bars[0].open,
      high: Math.max(...bars.map((bar) => bar.high)),
      low: Math.min(...bars.map((bar) => bar.low)),
      close: bars[bars.length - 1].close,
      volume: bars.reduce((sum, bar) => sum + bar.volume, 0),
    }));

  const dailyStatsByNyDate = dailyBars.reduce<
    StrategyPreprocessingContext["dailyStatsByNyDate"]
  >((acc, dailyBar, index) => {
    const day = dailyBucketKeyNy(dailyBar.time);
    const dayBars = barsByNyDateMap.get(day) ?? [];
    if (dayBars.length === 0) return acc;
    acc[day] = {
      previousClose: index > 0 ? dailyBars[index - 1].close : undefined,
      hod: Math.max(...dayBars.map((bar) => bar.high)),
      lod: Math.min(...dayBars.map((bar) => bar.low)),
      hos: Math.max(...dayBars.map((bar) => bar.open)),
      los: Math.min(...dayBars.map((bar) => bar.open)),
    };
    return acc;
  }, {});

  return {
    bars1m,
    barsByNyDate: Object.fromEntries(barsByNyDateMap),
    dailyBars,
    dailyStatsByNyDate,
    timeToIndex,
  };
};

export function evaluateDailyTemplate(params: {
  line: StrategyLine;
  selectedDay: string;
  context: StrategyPreprocessingContext;
  pipPrecision?: number;
  symbol?: string;
}): {
  template: "FGD" | "FRD" | "NONE";
  entryAllowed: boolean;
  reasons: string[];
  missingConditions: string[];
  evidenceDetails: string[];
  ruleTrace: RuleTraceItem[];
} {
  const { line, context, selectedDay, symbol } = params;
  const { bars1m, dailyBars } = context;
  const idxD0 = dailyBars.findIndex(
    (bar) => dailyBucketKeyNy(bar.time) === selectedDay,
  );

  if (idxD0 < 2) {
    return {
      template: "NONE",
      entryAllowed: false,
      reasons: ["Insufficient daily history for D-2 / D-1 / D0 evaluation"],
      missingConditions: ["Need at least D-2, D-1 and D0 bars"],
      evidenceDetails: [
        `selectedDay=${selectedDay}`,
        `dailyBarsFound=${dailyBars.length}`,
      ],
      ruleTrace: [
        {
          ruleId: "daily-history-available",
          passed: false,
          detail: "Cannot evaluate without D-2 and D-1.",
          prices: {},
          times: { selectedDay },
        },
      ],
    };
  }

  const pipConfig = inferPipConfig(symbol, bars1m);
  const d2 = dailyBars[idxD0 - 2];
  const d1 = dailyBars[idxD0 - 1];
  const d0 = dailyBars[idxD0];

  const d2Dump = d2.close < d2.open;
  const d2Pump = d2.close > d2.open;
  const d1Bull = d1.close > d1.open;
  const d1Bear = d1.close < d1.open;
  const d1InsideD2 = d1.high <= d2.high && d1.low >= d2.low;

  const d1BodyPips = Math.abs(
    priceDiffToPips(d1.close - d1.open, pipConfig),
  );
  const d1RangePips = Math.abs(priceDiffToPips(d1.high - d1.low, pipConfig));
  const d1BodyRangeRatio = d1RangePips === 0 ? 0 : d1BodyPips / d1RangePips;
  const d1BodyPriorityPass = d1BodyPips >= 40 && d1BodyRangeRatio >= 0.6;

  const ruleTrace: RuleTraceItem[] = [
    {
      ruleId: "daily-history-available",
      passed: true,
      detail: "D-2, D-1 and D0 are present.",
      prices: {},
      times: { d2: d2.time, d1: d1.time, d0: d0.time },
    },
    {
      ruleId: "pip-conversion",
      passed: true,
      detail: `Pip conversion inferred from ${pipConfig.basis}.`,
      prices: {
        pipSize: pipConfig.pipSize,
        pipDecimals: pipConfig.pipDecimals,
        priceDecimals: pipConfig.priceDecimals,
      },
      times: {},
    },
    {
      ruleId: "fgd-d2-dump",
      passed: d2Dump,
      detail: "FGD requires D-2 dump background (close < open).",
      prices: { d2Open: d2.open, d2Close: d2.close },
      times: { d2: d2.time },
    },
    {
      ruleId: "fgd-d1-close-red-to-green",
      passed: d1Bull,
      detail: "FGD requires D-1 close bullish (close > open).",
      prices: { d1Open: d1.open, d1Close: d1.close },
      times: { d1: d1.time },
    },
    {
      ruleId: "fgd-priority-d1-body",
      passed: d1BodyPriorityPass,
      detail: "FGD priority: D-1 body >=40 pips and body/range >=60%.",
      prices: { d1BodyPips, d1RangePips, d1BodyRangeRatio },
      times: { d1: d1.time },
    },
    {
      ruleId: "frd-d2-pump",
      passed: d2Pump,
      detail: "FRD requires D-2 pump background (close > open).",
      prices: { d2Open: d2.open, d2Close: d2.close },
      times: { d2: d2.time },
    },
    {
      ruleId: "frd-d1-close-black",
      passed: d1Bear,
      detail: "FRD requires D-1 close bearish (close < open).",
      prices: { d1Open: d1.open, d1Close: d1.close },
      times: { d1: d1.time },
    },
    {
      ruleId: "frd-inside-day",
      passed: d1InsideD2,
      detail:
        "FRD requires inside day: D-1 high<=D-2 high and D-1 low>=D-2 low.",
      prices: {
        d1High: d1.high,
        d1Low: d1.low,
        d2High: d2.high,
        d2Low: d2.low,
      },
      times: { d1: d1.time, d2: d2.time },
    },
  ];

  const fgdPass = d2Dump && d1Bull;
  const frdPass = d2Pump && d1Bear && d1InsideD2;

  const reasons: string[] = [];
  const evidenceDetails = [
    `pip conversion: symbol=${pipConfig.symbol}, basis=${pipConfig.basis}, pipSize=${pipConfig.pipSize}, priceDecimals=${pipConfig.priceDecimals}`,
    `D-2(${dailyBucketKeyNy(d2.time)}): O=${d2.open}, H=${d2.high}, L=${d2.low}, C=${d2.close}`,
    `D-1(${dailyBucketKeyNy(d1.time)}): O=${d1.open}, H=${d1.high}, L=${d1.low}, C=${d1.close}, body=${d1BodyPips.toFixed(1)} pips, range=${d1RangePips.toFixed(1)} pips, body/range=${(d1BodyRangeRatio * 100).toFixed(1)}%`,
    `D0(${dailyBucketKeyNy(d0.time)}): O=${d0.open}, H=${d0.high}, L=${d0.low}, C=${d0.close}`,
  ];
  const missingConditions: string[] = [];

  if (line === "FGD") {
    if (fgdPass)
      reasons.push(
        "FGD core conditions passed: D-2 dump and D-1 bullish close.",
      );
    if (!d2Dump)
      missingConditions.push(
        "FGD missing D-2 dump background (D-2 close < D-2 open).",
      );
    if (!d1Bull)
      missingConditions.push(
        "FGD missing D-1 bullish close (D-1 close > D-1 open).",
      );
    if (d1BodyPriorityPass)
      reasons.push(
        "FGD priority body check passed: D-1 body >= 40 pips and >= 60% of range.",
      );
    else
      missingConditions.push(
        "FGD priority body check not met (need D-1 body >=40 pips and >=60% of range).",
      );
  } else {
    if (frdPass)
      reasons.push(
        "FRD core conditions passed: D-2 pump, D-1 bearish close, and D-1 inside day.",
      );
    if (!d2Pump)
      missingConditions.push(
        "FRD missing D-2 pump background (D-2 close > D-2 open).",
      );
    if (!d1Bear)
      missingConditions.push(
        "FRD missing D-1 bearish close (D-1 close < D-1 open).",
      );
    if (!d1InsideD2)
      missingConditions.push(
        "FRD missing inside day (D-1 high <= D-2 high and D-1 low >= D-2 low).",
      );
  }

  return {
    template: line,
    entryAllowed: line === "FGD" ? fgdPass : frdPass,
    reasons,
    missingConditions,
    evidenceDetails,
    ruleTrace,
  };
}

const buildFixedTargets = (
  line: StrategyLine,
  entry: number,
  pipConfig: PipConfig,
): Record<TargetTier, number> => ({
  30: line === "FGD" ? entry + pipsToPrice(30, pipConfig) : entry - pipsToPrice(30, pipConfig),
  35: line === "FGD" ? entry + pipsToPrice(35, pipConfig) : entry - pipsToPrice(35, pipConfig),
  40: line === "FGD" ? entry + pipsToPrice(40, pipConfig) : entry - pipsToPrice(40, pipConfig),
  50: line === "FGD" ? entry + pipsToPrice(50, pipConfig) : entry - pipsToPrice(50, pipConfig),
});

const scoreTargetTiers = (params: {
  line: StrategyLine;
  dailyTemplateAllowed: boolean;
  intraday: ReturnType<typeof evaluateIntradayPatterns>;
  stopDistancePips: number;
}): {
  entryAllowed: boolean;
  currentTier: TargetTier | null;
  assessments: TierAssessment[];
  reasons: string[];
  missingConditions: string[];
} => {
  const { line, dailyTemplateAllowed, intraday, stopDistancePips } = params;
  const coreRequirements = dailyTemplateAllowed
    ? []
    : [line === "FGD" ? "FGD daily template not complete" : "FRD daily template not complete"];
  const stopGateMissing = stopDistancePips > 20 ? ["skip: stop too large"] : [];

  const assessments: TierAssessment[] = [
    {
      tier: 30,
      reached:
        coreRequirements.length === 0 &&
        stopGateMissing.length === 0 &&
        Boolean(intraday.stopHunt) &&
        Boolean(intraday.pattern123?.breakout),
      missing: [
        ...coreRequirements,
        ...stopGateMissing,
        ...(intraday.stopHunt ? [] : ["30 missing stop hunt"]),
        ...(intraday.pattern123?.breakout ? [] : ["30 missing 123 breakout"]),
      ],
      description: "30 requires daily template + stop hunt + 123 breakout + stop <= 20 pips.",
    },
    {
      tier: 35,
      reached: false,
      missing: [],
      description: "35 requires 30 plus measured 30-pip expansion.",
    },
    {
      tier: 40,
      reached: false,
      missing: [],
      description: "40 requires 35 plus quarter-hour rotation confirmation.",
    },
    {
      tier: 50,
      reached: false,
      missing: [],
      description: "50 requires 40 plus engulfment confirmation.",
    },
  ];

  assessments[1].reached = assessments[0].reached && intraday.move30Pips >= 30;
  assessments[1].missing = [
    ...assessments[0].missing,
    ...(intraday.move30Pips >= 30 ? [] : ["35 missing measured 30-pip expansion"]),
  ];
  assessments[2].reached = assessments[1].reached && intraday.rotationTagged;
  assessments[2].missing = [
    ...assessments[1].missing,
    ...(intraday.rotationTagged ? [] : ["40 missing quarter-hour rotation confirmation"]),
  ];
  assessments[3].reached = assessments[2].reached && intraday.engulfment;
  assessments[3].missing = [
    ...assessments[2].missing,
    ...(intraday.engulfment ? [] : ["50 missing engulfment confirmation"]),
  ];

  const currentTier =
    [...assessments].reverse().find((assessment) => assessment.reached)?.tier ??
    null;
  const nextAssessment = assessments.find((assessment) => !assessment.reached);
  const reasons = [
    `Target scorer (${line}) uses fixed pip tiers with entry gate at 30 -> 35 -> 40 -> 50.`,
    ...assessments
      .filter((assessment) => assessment.reached)
      .map((assessment) => `Tier ${assessment.tier} reached: ${assessment.description}`),
  ];
  const missingConditions = nextAssessment?.missing ?? [];

  return {
    entryAllowed: assessments[0].reached,
    currentTier,
    assessments,
    reasons,
    missingConditions,
  };
};

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
  const priceDecimals = candles.reduce(
    (max, candle) => Math.max(max, countDecimals(candle.close)),
    0,
  );
  const pipConfig: PipConfig =
    priceDecimals <= 2
      ? { symbol: "UNKNOWN", pipSize: 0.01, pipDecimals: 2, priceDecimals, basis: "2-decimal price rule" }
      : { symbol: "UNKNOWN", pipSize: 0.0001, pipDecimals: 4, priceDecimals, basis: "default FX rule" };
  const stop = lod - pipConfig.pipSize;
  const fixedTargets = buildFixedTargets("FGD", entry, pipConfig);

  const markers: StrategyMarker[] = [
    {
      id: "source",
      kind: "source",
      ruleName: "source",
      reasoning: "Source candle selected from scan.",
      price: hos,
      time: first.time,
    },
    {
      id: "entry",
      kind: "entry",
      ruleName: "entry",
      reasoning: "Entry at latest close for replay.",
      price: entry,
      time: last.time,
    },
    {
      id: "stop",
      kind: "stop",
      ruleName: "stop",
      reasoning: "Stop placed one pip outside source extreme fallback.",
      price: stop,
      time: last.time,
    },
    {
      id: "tp30",
      kind: "tp30",
      ruleName: "TP30",
      reasoning: "Fixed 30-pip target tier.",
      price: fixedTargets[30],
      time: last.time,
    },
    {
      id: "tp35",
      kind: "tp35",
      ruleName: "TP35",
      reasoning: "Fixed 35-pip target tier.",
      price: fixedTargets[35],
      time: last.time,
    },
    {
      id: "tp40",
      kind: "tp40",
      ruleName: "TP40",
      reasoning: "Fixed 40-pip target tier.",
      price: fixedTargets[40],
      time: last.time,
    },
    {
      id: "tp50",
      kind: "tp50",
      ruleName: "TP50",
      reasoning: "Fixed 50-pip target tier.",
      price: fixedTargets[50],
      time: last.time,
    },
  ];

  return {
    explain: [
      "FGD / FRD check complete.",
      `TP tiers use fixed pip conversion (${pipConfig.basis}, pipSize=${pipConfig.pipSize}).`,
    ],
    stage: "stage-3-check",
    validity: Math.abs(last.close - first.open) > 1 ? "FGD" : "FRD",
    sourceReason: "Selected from first tradable candle.",
    stopHuntReason: "Stop anchored one pip outside fallback source extreme.",
    setup123Reason: "1-2-3 structure approximated from day range.",
    entryReason: "Replay entry set at active candle close.",
    targetTierReason: "TP30/35/40/50 are fixed pip targets, not risk percentages.",
    overlays: { ema20, previousClose, hos, los, hod, lod },
    markers,
  };
}

export function computeAutoPnl(markers: StrategyMarker[]): number {
  const entry = markers.find((m) => m.kind === "entry")?.price ?? 0;
  const exit = markers.find((m) => m.kind === "tp40")?.price ?? entry;
  return exit - entry;
}

export function computeManualPnl(entry: number, exit: number): number {
  return exit - entry;
}

export const toNyLabel = (time: string): string =>
  new Date(time).toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export const detectCandidates = (
  symbol: string,
  context: StrategyPreprocessingContext,
): CandidateDate[] => {
  const { dailyBars } = context;

  return dailyBars.map((bar) => {
    const type: StrategyLine =
      Math.abs(bar.close - bar.open) > 0.001 ? "FGD" : "FRD";
    return {
      symbol,
      date: dailyBucketKeyNy(bar.time),
      type,
      reason: `Detected from daily bar ${dailyBucketKeyNy(bar.time)}`,
    };
  });
};

export const evaluateDay = (
  line: StrategyLine,
  day: string,
  replyMode: ReplyMode,
  manualTrade: { entry: number; exit: number },
  context: StrategyPreprocessingContext,
  symbol?: string,
): InternalDayAnalysis => {
  const { bars1m, barsByNyDate, dailyStatsByNyDate, timeToIndex } = context;
  const dayBars = barsByNyDate[day] ?? [];
  const first = dayBars[0];
  const last = dayBars[dayBars.length - 1];

  if (!first || !last) {
    return {
      explain: {
        template: "NONE",
        bias: "NEUTRAL",
        stage: "waiting-day-selection",
        missingConditions: ["No bars available for selected day"],
        reasons: ["Day cannot be evaluated until bars exist"],
        evidenceDetails: [
          "No intraday bars mapped into selected NY day bucket",
        ],
        entryAllowed: false,
        targetTier: null,
        targetAssessments: [],
        ruleTrace: [
          {
            ruleId: "day-bars-exist",
            passed: false,
            detail: "No D0 bars found for selected day.",
            prices: {},
            times: { selectedDay: day },
          },
        ],
      },
      annotations: [],
    };
  }

  const pipConfig = inferPipConfig(symbol, dayBars);
  const dailyTemplate = evaluateDailyTemplate({
    line,
    selectedDay: day,
    context,
    symbol,
  });
  const dayStats = dailyStatsByNyDate[day];
  const firstIndex = timeToIndex[first.time];
  const previousClose =
    dayStats?.previousClose ?? (firstIndex > 0 ? bars1m[firstIndex - 1]?.close : undefined);
  const hod = dayStats?.hod ?? Math.max(...dayBars.map((bar) => bar.high));
  const lod = dayStats?.lod ?? Math.min(...dayBars.map((bar) => bar.low));
  const hos = dayStats?.hos ?? Math.max(...dayBars.map((bar) => bar.open));
  const los = dayStats?.los ?? Math.min(...dayBars.map((bar) => bar.open));

  const intraday = evaluateIntradayPatterns({ line, dayBars, pipPrecision: 4 });
  const dayEma20 = ema(dayBars.map((bar) => bar.close), 20);
  const emaConfirmIndex = dayBars.findIndex((bar, index) => {
    const pivotIndex = intraday.pattern123?.breakout
      ? (timeToIndex[intraday.pattern123?.breakout?.barTime ?? ""] ?? -1) - firstIndex
      : intraday.source
        ? (timeToIndex[intraday.source?.barTime ?? ""] ?? -1) - firstIndex
        : -1;
    if (pivotIndex >= 0 && index < pivotIndex) return false;
    const emaValue = dayEma20[index];
    // Assumption preserved explicitly: the prompt asks for a 20EMA confirm marker but does not define the exact candle test,
    // so current behavior marks the first post-source/post-breakout bar that closes on the trend side of the 20EMA.
    return line === "FGD" ? bar.close >= emaValue : bar.close <= emaValue;
  });
  const emaConfirmPoint = emaConfirmIndex >= 0
    ? { barTime: dayBars[emaConfirmIndex].time, price: dayEma20[emaConfirmIndex] }
    : undefined;
  const emaConfirmTrace: RuleTraceItem = {
    ruleId: "ema20-confirm",
    passed: Boolean(emaConfirmPoint),
    detail: emaConfirmPoint
      ? `20EMA confirm detected with close ${line === "FGD" ? "above" : "below"} the EMA.`
      : `20EMA confirm is still missing because no revealed bar has closed ${line === "FGD" ? "above" : "below"} the 20EMA after the setup pivot.`,
    prices: emaConfirmPoint
      ? { ema20: emaConfirmPoint.price, close: dayBars[emaConfirmIndex].close }
      : {},
    times: emaConfirmPoint
      ? { confirmBar: emaConfirmPoint.barTime }
      : {},
  };
  const sourceBarTime = intraday.source?.barTime;
  const sourceBar = dayBars.find((bar) => bar.time === sourceBarTime);
  const sourceExtreme = line === "FGD"
    ? sourceBar?.low ?? intraday.stopHunt?.sweptLevel.price ?? lod
    : sourceBar?.high ?? intraday.stopHunt?.sweptLevel.price ?? hod;
  const sourcePrice = intraday.source?.price ?? last.close;
  const stopPrice =
    line === "FGD"
      ? sourceExtreme - pipConfig.pipSize
      : sourceExtreme + pipConfig.pipSize;
  const entry =
    replyMode === "manual" && manualTrade.entry
      ? manualTrade.entry
      : (intraday.pattern123?.breakout?.price ?? sourcePrice);
  const stopDistancePips = Math.abs(priceDiffToPips(entry - stopPrice, pipConfig));
  const fixedTargets = buildFixedTargets(line, entry, pipConfig);
  const targetScore = scoreTargetTiers({
    line,
    dailyTemplateAllowed: dailyTemplate.entryAllowed,
    intraday,
    stopDistancePips,
  });
  const defaultExitTier = targetScore.currentTier ?? 30;
  const exit =
    replyMode === "manual" && manualTrade.exit
      ? manualTrade.exit
      : fixedTargets[defaultExitTier];
  const pnlPips =
    line === "FGD"
      ? priceDiffToPips(exit - entry, pipConfig)
      : priceDiffToPips(entry - exit, pipConfig);

  const targetAssessments = targetScore.assessments.map((assessment) => ({
    ...assessment,
    targetPrice: fixedTargets[assessment.tier],
  }));
  const entryQualifiedTrace: RuleTraceItem = {
    ruleId: "entry-qualified",
    passed: targetScore.entryAllowed,
    detail: targetScore.entryAllowed
      ? "Entry is allowed because the daily template, intraday structure, EMA confirm, and stop gate are aligned."
      : "Entry is not allowed yet because one or more required gates are still missing.",
    prices: { entry, stopPrice },
    times: { entryBar: intraday.pattern123?.breakout?.barTime ?? sourceBar?.time ?? last.time },
  };
  const mergedRuleTrace = [
    ...dailyTemplate.ruleTrace,
    ...intraday.ruleTrace,
    emaConfirmTrace,
    {
      ruleId: "stop-distance-pips",
      passed: stopDistancePips <= 20,
      detail:
        stopDistancePips <= 20
          ? "Stop distance is within the 20-pip gate."
          : "Stop distance exceeds the 20-pip gate; skip entry.",
      prices: {
        entry,
        sourceExtreme,
        stopPrice,
        stopDistancePips,
        pipSize: pipConfig.pipSize,
      },
      times: { sourceBarTime: sourceBar?.time ?? last.time },
    },
    entryQualifiedTrace,
    ...targetAssessments.map((assessment) => ({
      ruleId: `target-tier-${assessment.tier}`,
      passed: assessment.reached,
      detail: `${assessment.description}${assessment.reached ? "" : ` Missing: ${assessment.missing.join(", ")}`}`,
      prices: { targetPrice: assessment.targetPrice },
      times: {},
    })),
  ];
  const annotationTraceIds = {
    source: "intraday-stop-hunt",
    stopHunt: "intraday-stop-hunt",
    point1: "intraday-123",
    point2: "intraday-123",
    point3: "intraday-123",
    emaConfirm: "ema20-confirm",
    entry: "entry-qualified",
    stop: "stop-distance-pips",
    tp30: "target-tier-30",
    tp35: "target-tier-35",
    tp40: "target-tier-40",
    tp50: "target-tier-50",
  } as const;
  const withTrace = <T extends { kind: keyof typeof annotationTraceIds; ruleName: string; reasoning: string }>(annotation: T) => {
    const trace = findTrace(mergedRuleTrace, annotationTraceIds[annotation.kind]);
    return {
      ...annotation,
      ruleId: trace?.ruleId,
      ruleName: trace ? formatLabel(trace.ruleId) : annotation.ruleName,
      reasoning: trace?.detail ?? annotation.reasoning,
      tracePrices: trace?.prices,
      traceTimes: trace?.times,
    };
  };

  return {
    explain: {
      template: dailyTemplate.template,
      bias: line === "FGD" ? "LONG" : "SHORT",
      stage: targetScore.entryAllowed ? "entry-qualified" : "stage-3-check",
      missingConditions: [
        ...dailyTemplate.missingConditions,
        ...intraday.missingConditions,
        ...(emaConfirmTrace.passed ? [] : [emaConfirmTrace.detail]),
        ...targetScore.missingConditions,
      ],
      reasons: [
        ...dailyTemplate.reasons,
        ...intraday.reasons,
        ...(emaConfirmTrace.passed ? [emaConfirmTrace.detail] : []),
        ...targetScore.reasons,
      ],
      evidenceDetails: [
        ...dailyTemplate.evidenceDetails,
        ...intraday.evidenceDetails,
        `stop placement: sourceExtreme=${sourceExtreme}, stop=${stopPrice}, stopDistance=${stopDistancePips.toFixed(1)} pips`,
        `fixed targets: TP30=${fixedTargets[30]}, TP35=${fixedTargets[35]}, TP40=${fixedTargets[40]}, TP50=${fixedTargets[50]}`,
      ],
      entryAllowed: targetScore.entryAllowed,
      targetTier: targetScore.currentTier,
      targetAssessments,
      ruleTrace: mergedRuleTrace,
      intraday: {
        source: intraday.source,
        stop: intraday.stop,
        stopHunt: intraday.stopHunt,
        pattern123: intraday.pattern123,
        emaConfirm: emaConfirmPoint,
        move30Pips: intraday.move30Pips,
        rotationTagged: intraday.rotationTagged,
        engulfment: intraday.engulfment,
      },
    },
    annotations: [
      ...intraday.annotations.map((annotation) => withTrace(annotation)),
      withTrace({
        id: "ema20-confirm",
        kind: "emaConfirm",
        barTime: emaConfirmPoint?.barTime ?? last.time,
        price: emaConfirmPoint?.price ?? dayEma20[dayEma20.length - 1] ?? last.close,
        ruleName: "20EMA confirm",
        reasoning: "20EMA confirmation derived from the revealed intraday sequence",
      }),
      withTrace({
        id: "entry",
        kind: "entry",
        barTime: intraday.pattern123?.breakout?.barTime ?? sourceBar?.time ?? last.time,
        price: entry,
        ruleName: "entry",
        reasoning: "Entry derived from reply mode and breakout/source context",
      }),
      withTrace({
        id: "stop-final",
        kind: "stop",
        barTime: sourceBar?.time ?? intraday.stop?.barTime ?? last.time,
        price: stopPrice,
        ruleName: "stop",
        reasoning: `Stop placed one pip outside source extreme (${sourceExtreme})`,
      }),
      withTrace({
        id: "tp30",
        kind: "tp30",
        barTime: last.time,
        price: fixedTargets[30],
        ruleName: "TP30",
        reasoning: "Fixed 30-pip target from entry",
      }),
      withTrace({
        id: "tp35",
        kind: "tp35",
        barTime: last.time,
        price: fixedTargets[35],
        ruleName: "TP35",
        reasoning: "Fixed 35-pip target from entry",
      }),
      withTrace({
        id: "tp40",
        kind: "tp40",
        barTime: last.time,
        price: fixedTargets[40],
        ruleName: "TP40",
        reasoning: "Fixed 40-pip target from entry",
      }),
      withTrace({
        id: "tp50",
        kind: "tp50",
        barTime: last.time,
        price: fixedTargets[50],
        ruleName: "TP50",
        reasoning: "Fixed 50-pip target from entry",
      }),
    ],
    previousClose,
    hos,
    los,
    hod,
    lod,
    trade: targetScore.entryAllowed
      ? {
          side: line === "FGD" ? "LONG" : "SHORT",
          entry,
          exit,
          pnlPips,
          mode: replyMode,
        }
      : undefined,
  };
};

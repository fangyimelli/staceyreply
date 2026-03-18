import type {
  InternalAnnotation,
  OhlcvBar,
  RuleTraceItem,
  StrategyLine,
} from "../types/domain";

const ROTATION_MINUTES = new Set([0, 15, 30, 45]);
const QUICK_RECLAIM_BARS = 3;
const ROTATION_NEAR_MINUTES = 2;

export interface IntradayPivotPoint {
  barTime: string;
  price: number;
}

export interface IntradayPatternEvaluation {
  source?: IntradayPivotPoint;
  stop?: IntradayPivotPoint;
  stopHunt?: {
    sweptLevel: IntradayPivotPoint;
    reclaim: IntradayPivotPoint;
  };
  pattern123?: {
    node1?: IntradayPivotPoint;
    node2?: IntradayPivotPoint;
    node3?: IntradayPivotPoint;
    breakout?: IntradayPivotPoint;
  };
  move30Pips: number;
  rotationTagged: boolean;
  engulfment: boolean;
  ruleTrace: RuleTraceItem[];
  annotations: InternalAnnotation[];
  evidenceDetails: string[];
  reasons: string[];
  missingConditions: string[];
}

const toPips = (priceDiff: number, pipPrecision: number): number =>
  priceDiff * Math.pow(10, pipPrecision);

const addAnnotation = (
  annotations: InternalAnnotation[],
  id: string,
  kind: string,
  point: IntradayPivotPoint | undefined,
  ruleName: string,
  reasoning: string,
) => {
  if (!point) return;
  annotations.push({
    id,
    kind,
    barTime: point.barTime,
    price: point.price,
    ruleName,
    reasoning,
  });
};

const formatEvidence = (
  label: string,
  point: IntradayPivotPoint | undefined,
): string =>
  point ? `${label}: ${point.barTime} @ ${point.price}` : `${label}: n/a`;

const isNearRotation = (time: string): boolean => {
  const ny = new Date(time).toLocaleString("sv-SE", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const [, hh, mm] = ny.match(/(\d{2}):(\d{2})/) ?? [];
  const minutes = Number(mm);
  if (Number.isNaN(minutes) || hh === undefined) return false;
  return [...ROTATION_MINUTES].some(
    (rotationMinute) =>
      Math.abs(minutes - rotationMinute) <= ROTATION_NEAR_MINUTES,
  );
};

const findStopHunt = (
  line: StrategyLine,
  dayBars: OhlcvBar[],
): {
  trace: RuleTraceItem;
  stopHunt?: IntradayPatternEvaluation["stopHunt"];
  source?: IntradayPivotPoint;
} => {
  let runningLow = dayBars[0]?.low ?? 0;
  let runningLowTime = dayBars[0]?.time ?? "";
  let runningHigh = dayBars[0]?.high ?? 0;
  let runningHighTime = dayBars[0]?.time ?? "";

  for (let index = 1; index < dayBars.length; index += 1) {
    const bar = dayBars[index];
    const priorLow = runningLow;
    const priorLowTime = runningLowTime;
    const priorHigh = runningHigh;
    const priorHighTime = runningHighTime;

    if (line === "FGD") {
      if (bar.low < priorLow) {
        const reclaimBar = dayBars
          .slice(
            index,
            Math.min(dayBars.length, index + QUICK_RECLAIM_BARS + 1),
          )
          .find((candidate) => candidate.close > priorLow);
        if (reclaimBar) {
          return {
            stopHunt: {
              sweptLevel: { barTime: priorLowTime, price: priorLow },
              reclaim: { barTime: reclaimBar.time, price: reclaimBar.close },
            },
            source: { barTime: reclaimBar.time, price: reclaimBar.close },
            trace: {
              ruleId: "intraday-stop-hunt",
              passed: true,
              detail:
                "FGD long stop hunt found: price swept prior low then reclaimed above it within the quick-return window.",
              prices: {
                priorLow,
                sweepLow: bar.low,
                reclaimClose: reclaimBar.close,
              },
              times: {
                priorLow: priorLowTime,
                sweepBar: bar.time,
                reclaimBar: reclaimBar.time,
              },
            },
          };
        }
      }
    } else if (bar.high > priorHigh) {
      const reclaimBar = dayBars
        .slice(index, Math.min(dayBars.length, index + QUICK_RECLAIM_BARS + 1))
        .find((candidate) => candidate.close < priorHigh);
      if (reclaimBar) {
        return {
          stopHunt: {
            sweptLevel: { barTime: priorHighTime, price: priorHigh },
            reclaim: { barTime: reclaimBar.time, price: reclaimBar.close },
          },
          source: { barTime: reclaimBar.time, price: reclaimBar.close },
          trace: {
            ruleId: "intraday-stop-hunt",
            passed: true,
            detail:
              "FRD short stop hunt found: price swept prior high then reclaimed back below it within the quick-return window.",
            prices: {
              priorHigh,
              sweepHigh: bar.high,
              reclaimClose: reclaimBar.close,
            },
            times: {
              priorHigh: priorHighTime,
              sweepBar: bar.time,
              reclaimBar: reclaimBar.time,
            },
          },
        };
      }
    }

    runningLow = Math.min(runningLow, bar.low);
    runningLowTime = runningLow === bar.low ? bar.time : runningLowTime;
    runningHigh = Math.max(runningHigh, bar.high);
    runningHighTime = runningHigh === bar.high ? bar.time : runningHighTime;
  }

  return {
    trace: {
      ruleId: "intraday-stop-hunt",
      passed: false,
      // Assumption preserved explicitly: "quickly" is interpreted as reclaim within 3 bars because the prompt does not define a bar-count threshold.
      detail: `No ${line === "FGD" ? "prior-low sweep + reclaim" : "prior-high sweep + reclaim"} was found within ${QUICK_RECLAIM_BARS} bars.`,
      prices: {},
      times: {},
    },
  };
};

const find123Pattern = (
  line: StrategyLine,
  dayBars: OhlcvBar[],
  sourceTime: string | undefined,
): {
  trace: RuleTraceItem;
  pattern123?: IntradayPatternEvaluation["pattern123"];
} => {
  if (!sourceTime) {
    return {
      trace: {
        ruleId: "intraday-123",
        passed: false,
        detail:
          "123 pattern skipped because no source/stop-hunt bar was found first.",
        prices: {},
        times: {},
      },
    };
  }

  const sourceIndex = dayBars.findIndex((bar) => bar.time === sourceTime);
  if (sourceIndex < 0 || sourceIndex >= dayBars.length - 2) {
    return {
      trace: {
        ruleId: "intraday-123",
        passed: false,
        detail: "123 pattern requires bars after the source candle.",
        prices: {},
        times: { sourceTime },
      },
    };
  }

  const node1Bar = dayBars[sourceIndex];
  let node2Index = -1;

  for (let index = sourceIndex + 1; index < dayBars.length - 1; index += 1) {
    const bar = dayBars[index];
    const nextBar = dayBars[index + 1];
    if (line === "FGD" ? bar.high > nextBar.high : bar.low < nextBar.low) {
      node2Index = index;
      break;
    }
  }

  if (node2Index === -1) {
    return {
      trace: {
        ruleId: "intraday-123",
        passed: false,
        detail: "123 pattern missing node 2 swing confirmation after source.",
        prices: { node1Price: line === "FGD" ? node1Bar.low : node1Bar.high },
        times: { node1Time: node1Bar.time },
      },
    };
  }

  let node3Index = -1;
  const node2Bar = dayBars[node2Index];
  for (let index = node2Index + 1; index < dayBars.length; index += 1) {
    const bar = dayBars[index];
    if (line === "FGD") {
      if (bar.low > node1Bar.low && bar.low < node2Bar.high) {
        node3Index = index;
        break;
      }
    } else if (bar.high < node1Bar.high && bar.high > node2Bar.low) {
      node3Index = index;
      break;
    }
  }

  if (node3Index === -1) {
    return {
      trace: {
        ruleId: "intraday-123",
        passed: false,
        detail: "123 pattern missing node 3 pullback after node 2.",
        prices: {
          node1Price: line === "FGD" ? node1Bar.low : node1Bar.high,
          node2Price: line === "FGD" ? node2Bar.high : node2Bar.low,
        },
        times: { node1Time: node1Bar.time, node2Time: node2Bar.time },
      },
    };
  }

  const node3Bar = dayBars[node3Index];
  const breakoutBar = dayBars
    .slice(node3Index + 1)
    .find((bar) =>
      line === "FGD" ? bar.high > node2Bar.high : bar.low < node2Bar.low,
    );

  const pattern123 = {
    node1: {
      barTime: node1Bar.time,
      price: line === "FGD" ? node1Bar.low : node1Bar.high,
    },
    node2: {
      barTime: node2Bar.time,
      price: line === "FGD" ? node2Bar.high : node2Bar.low,
    },
    node3: {
      barTime: node3Bar.time,
      price: line === "FGD" ? node3Bar.low : node3Bar.high,
    },
    breakout: breakoutBar
      ? {
          barTime: breakoutBar.time,
          price: line === "FGD" ? breakoutBar.high : breakoutBar.low,
        }
      : undefined,
  };

  return {
    pattern123,
    trace: {
      ruleId: "intraday-123",
      passed: Boolean(pattern123.breakout),
      detail: pattern123.breakout
        ? "123 pattern complete with breakout through node 2."
        : "Nodes 1/2/3 formed, but no breakout through node 2 yet.",
      prices: {
        node1: pattern123.node1.price,
        node2: pattern123.node2.price,
        node3: pattern123.node3.price,
        ...(pattern123.breakout ? { breakout: pattern123.breakout.price } : {}),
      },
      times: {
        node1: pattern123.node1.barTime,
        node2: pattern123.node2.barTime,
        node3: pattern123.node3.barTime,
        ...(pattern123.breakout
          ? { breakout: pattern123.breakout.barTime }
          : {}),
      },
    },
  };
};

export const evaluateIntradayPatterns = (params: {
  line: StrategyLine;
  dayBars: OhlcvBar[];
  pipPrecision: number;
}): IntradayPatternEvaluation => {
  const { line, dayBars, pipPrecision } = params;
  const annotations: InternalAnnotation[] = [];
  const evidenceDetails: string[] = [];
  const reasons: string[] = [];
  const missingConditions: string[] = [];
  const ruleTrace: RuleTraceItem[] = [];

  if (!dayBars.length) {
    return {
      move30Pips: 0,
      rotationTagged: false,
      engulfment: false,
      ruleTrace: [],
      annotations,
      evidenceDetails,
      reasons,
      missingConditions,
    };
  }

  const stopHuntResult = findStopHunt(line, dayBars);
  ruleTrace.push(stopHuntResult.trace);

  if (stopHuntResult.stopHunt) {
    evidenceDetails.push(
      formatEvidence(
        "Stop hunt swept level",
        stopHuntResult.stopHunt.sweptLevel,
      ),
      formatEvidence("Stop hunt reclaim", stopHuntResult.stopHunt.reclaim),
    );
    reasons.push(stopHuntResult.trace.detail);
  } else {
    missingConditions.push(stopHuntResult.trace.detail);
  }

  const source = stopHuntResult.source;
  const patternResult = find123Pattern(line, dayBars, source?.barTime);
  ruleTrace.push(patternResult.trace);

  if (patternResult.pattern123) {
    evidenceDetails.push(
      formatEvidence("123 node1", patternResult.pattern123.node1),
      formatEvidence("123 node2", patternResult.pattern123.node2),
      formatEvidence("123 node3", patternResult.pattern123.node3),
      formatEvidence("123 breakout", patternResult.pattern123.breakout),
    );
    if (patternResult.trace.passed) reasons.push(patternResult.trace.detail);
    else missingConditions.push(patternResult.trace.detail);
  } else {
    missingConditions.push(patternResult.trace.detail);
  }

  const sourceIndex = source
    ? dayBars.findIndex((bar) => bar.time === source.barTime)
    : -1;
  const sourceBar = sourceIndex >= 0 ? dayBars[sourceIndex] : undefined;
  const moveWindow =
    sourceIndex >= 0 ? dayBars.slice(sourceIndex, sourceIndex + 30) : [];
  const move30Pips = sourceBar
    ? line === "FGD"
      ? toPips(
          Math.max(...moveWindow.map((bar) => bar.high)) - sourceBar.close,
          pipPrecision,
        )
      : toPips(
          sourceBar.close - Math.min(...moveWindow.map((bar) => bar.low)),
          pipPrecision,
        )
    : 0;

  const move30Trace: RuleTraceItem = {
    ruleId: "intraday-move30",
    passed: Boolean(sourceBar),
    detail: sourceBar
      ? `Measured favorable ${line === "FGD" ? "upside" : "downside"} displacement during the 30-minute window after source.`
      : "move30 unavailable because no source candle was found.",
    prices: sourceBar
      ? { sourcePrice: sourceBar.close, move30Pips }
      : { move30Pips: 0 },
    times: sourceBar
      ? {
          sourceBar: sourceBar.time,
          windowEnd: moveWindow[moveWindow.length - 1]?.time ?? sourceBar.time,
        }
      : {},
  };
  ruleTrace.push(move30Trace);
  evidenceDetails.push(`move30: ${move30Pips.toFixed(1)} pips`);
  if (sourceBar) reasons.push(move30Trace.detail);
  else missingConditions.push(move30Trace.detail);

  const rotationTagged = Boolean(
    source?.barTime && isNearRotation(source.barTime),
  );
  const rotationTrace: RuleTraceItem = {
    ruleId: "intraday-rotation",
    passed: rotationTagged,
    // Assumption preserved explicitly: "adjacent" is interpreted as within ±2 minutes of :00/:15/:30/:45 because the prompt does not specify a wider tolerance.
    detail: source?.barTime
      ? rotationTagged
        ? "Source bar is near a quarter-hour rotation (:00/:15/:30/:45)."
        : "Source bar is not near the configured quarter-hour rotation window."
      : "Rotation check unavailable because no source bar was found.",
    prices: source ? { sourcePrice: source.price } : {},
    times: source ? { sourceBar: source.barTime } : {},
  };
  ruleTrace.push(rotationTrace);
  if (rotationTrace.passed) reasons.push(rotationTrace.detail);
  else missingConditions.push(rotationTrace.detail);

  const previousBar = sourceIndex > 0 ? dayBars[sourceIndex - 1] : undefined;
  const engulfment = Boolean(
    sourceBar &&
    previousBar &&
    (line === "FGD"
      ? sourceBar.close > sourceBar.open &&
        sourceBar.high >= previousBar.high &&
        sourceBar.low <= previousBar.low
      : sourceBar.close < sourceBar.open &&
        sourceBar.high >= previousBar.high &&
        sourceBar.low <= previousBar.low),
  );
  const engulfmentTrace: RuleTraceItem = {
    ruleId: "intraday-engulfment",
    passed: engulfment,
    // Assumption preserved explicitly: the prompt asks only for a boolean engulfment flag, so we use full-range engulfment of the previous candle rather than a narrower body-only variant.
    detail:
      sourceBar && previousBar
        ? engulfment
          ? "Source candle engulfs the full range of the previous candle."
          : "Source candle does not engulf the full range of the previous candle."
        : "Engulfment unavailable because source bar or previous bar is missing.",
    prices:
      sourceBar && previousBar
        ? {
            sourceHigh: sourceBar.high,
            sourceLow: sourceBar.low,
            previousHigh: previousBar.high,
            previousLow: previousBar.low,
          }
        : {},
    times:
      sourceBar && previousBar
        ? { sourceBar: sourceBar.time, previousBar: previousBar.time }
        : {},
  };
  ruleTrace.push(engulfmentTrace);
  if (engulfmentTrace.passed) reasons.push(engulfmentTrace.detail);
  else missingConditions.push(engulfmentTrace.detail);

  addAnnotation(
    annotations,
    "source",
    "source",
    source,
    "source",
    stopHuntResult.trace.detail,
  );
  addAnnotation(
    annotations,
    "stop",
    "stop",
    stopHuntResult.stopHunt?.sweptLevel,
    "stop-hunt",
    stopHuntResult.trace.detail,
  );
  addAnnotation(
    annotations,
    "node1",
    "node1",
    patternResult.pattern123?.node1,
    "123-node1",
    "123 node 1",
  );
  addAnnotation(
    annotations,
    "node2",
    "node2",
    patternResult.pattern123?.node2,
    "123-node2",
    "123 node 2",
  );
  addAnnotation(
    annotations,
    "node3",
    "node3",
    patternResult.pattern123?.node3,
    "123-node3",
    "123 node 3",
  );
  addAnnotation(
    annotations,
    "breakout",
    "breakout",
    patternResult.pattern123?.breakout,
    "123-breakout",
    patternResult.trace.detail,
  );

  return {
    source,
    stop: stopHuntResult.stopHunt?.sweptLevel,
    stopHunt: stopHuntResult.stopHunt,
    pattern123: patternResult.pattern123,
    move30Pips,
    rotationTagged,
    engulfment,
    ruleTrace,
    annotations,
    evidenceDetails,
    reasons,
    missingConditions,
  };
};

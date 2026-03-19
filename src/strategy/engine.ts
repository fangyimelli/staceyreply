import { aggregateBars } from "../aggregation/timeframe";
import type {
  Annotation,
  EventLogItem,
  OhlcvBar,
  ReplayAnalysis,
  ReplayDatasetAnalysis,
  ReplayStageId,
  ReplayVisibility,
  RuleTraceItem,
  Timeframe,
  TradeLevel,
} from "../types/domain";
import {
  byNyDate,
  strategyNyDate,
  strategyNyLabel,
  strategyNyTime,
  strategyTime,
} from "../utils/nyDate";
import { validateDataset } from "../validation/datasetValidation";

const tfList: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1D"];
const ema = (bars: OhlcvBar[], period: number) => {
  const k = 2 / (period + 1);
  let prev = bars[0]?.close ?? 0;
  return bars.map((bar) => {
    prev = bar.close * k + prev * (1 - k);
    return prev;
  });
};
const pips = (value: number) => Math.round(value / 0.0001);
const inNySession = (bar: OhlcvBar) =>
  strategyNyTime(strategyTime(bar)) >= "07:00" &&
  strategyNyTime(strategyTime(bar)) <= "11:00";
const id = (stage: ReplayStageId, suffix: string) => `${stage}-${suffix}`;

const makeEvent = (
  stage: ReplayStageId,
  title: string,
  summary: string,
  detail: string,
  visibleFromIndex: number,
  trace: RuleTraceItem[],
  barTime?: string,
  prices?: Record<string, number>,
): EventLogItem => ({
  id: id(stage, String(visibleFromIndex)),
  stage,
  title,
  summary,
  detail,
  statusBanner: title,
  visibleFromIndex,
  barTime,
  prices,
  trace,
});
const makeAnnotation = (
  kind: Annotation["kind"],
  index: number,
  barTime: string,
  price: number,
  label: string,
  reasoning: string,
  trace: RuleTraceItem[],
): Annotation => ({
  id: `${kind}-${barTime}`,
  kind,
  barTime,
  price,
  label,
  reasoning,
  trace,
  visibleFromIndex: index,
});
const pushTraceEvent = (
  eventLog: EventLogItem[],
  ruleTrace: RuleTraceItem[],
  event: EventLogItem,
) => {
  ruleTrace.push(...event.trace);
  eventLog.push(event);
};

const resolveReplayVisibility = (
  analysis: ReplayDatasetAnalysis,
  currentBarIndex: number,
): ReplayVisibility => {
  const visibleEvents = analysis.eventLog.filter(
    (event) => event.visibleFromIndex <= currentBarIndex,
  );
  const visibleAnnotations = analysis.annotations.filter(
    (annotation) => annotation.visibleFromIndex <= currentBarIndex,
  );
  const latestVisibleEvent = visibleEvents.slice(-1)[0];
  const latestVisibleEntryEvent = visibleEvents
    .filter((event) => event.stage === "entry")
    .slice(-1)[0];
  const canEnter = latestVisibleEntryEvent?.title === "Entry valid";
  const stage =
    latestVisibleEvent?.stage ??
    (analysis.invalidReasons.length ? "invalid" : "background");
  const statusBanner =
    analysis.invalidReasons[0] ??
    latestVisibleEvent?.statusBanner ??
    "Replay ready";
  const currentReasoning = visibleEvents.slice(-3).map((event) => event.detail);
  const waitingForGate =
    analysis.missingConditions[0] ??
    analysis.invalidReasons[0] ??
    "Waiting for next gate.";

  if (!canEnter && !analysis.invalidReasons.length) {
    currentReasoning.push(
      "Waiting for source → stop hunt → 123 → 20EMA → entry gate sequence.",
    );
  }

  return {
    stage,
    canEnter,
    statusBanner,
    currentReasoning,
    currentBarIndex,
    visibleEvents,
    visibleAnnotations,
    lastReplyEval: {
      stage,
      canReply: canEnter,
      explanation: canEnter
        ? "Current replay marker has unlocked the entry gate."
        : (latestVisibleEvent?.detail ?? waitingForGate),
    },
  };
};

export const buildReplayDatasetAnalysis = (
  datasetId: string,
  symbol: string,
  bars1m: OhlcvBar[],
): ReplayDatasetAnalysis => {
  const timeframeBars = Object.fromEntries(
    tfList.map((tf) => [tf, aggregateBars(bars1m, tf)]),
  ) as Record<Timeframe, OhlcvBar[]>;
  const invalidIssues = validateDataset(bars1m);
  const groupedByDay = byNyDate(bars1m);
  const days = Object.keys(groupedByDay).sort();
  const tradeDay = days[days.length - 1] ?? "";
  const daily = timeframeBars["1D"];
  const d2 = daily[daily.length - 3];
  const d1 = daily[daily.length - 2];
  const tradeGroup = groupedByDay[tradeDay] ?? [];
  const session = tradeGroup.filter(inNySession);
  const five = aggregateBars(session, "5m");
  const ema5 = ema(five, 20);
  const previousClose = d1?.close;
  const hos = Math.max(
    ...session.map((bar) => bar.high),
    Number.NEGATIVE_INFINITY,
  );
  const los = Math.min(
    ...session.map((bar) => bar.low),
    Number.POSITIVE_INFINITY,
  );
  const hod = Math.max(
    ...tradeGroup.map((bar) => bar.high),
    Number.NEGATIVE_INFINITY,
  );
  const lod = Math.min(
    ...tradeGroup.map((bar) => bar.low),
    Number.POSITIVE_INFINITY,
  );
  const dump = Boolean(d2 && d2.close < d2.open);
  const pump = Boolean(d2 && d2.close > d2.open);
  const fgd = dump && Boolean(d1 && d1.close > d1.open);
  const frd = pump && Boolean(d1 && d1.close < d1.open);
  const template = invalidIssues.length
    ? "INVALID"
    : fgd
      ? "FGD"
      : frd
        ? "FRD"
        : "INCOMPLETE";
  const bias =
    template === "FGD" ? "bullish" : template === "FRD" ? "bearish" : "neutral";
  const ruleTrace: RuleTraceItem[] = [];
  const eventLog: EventLogItem[] = [];
  const annotations: Annotation[] = [];
  const missingConditions: string[] = [];

  if (d2) {
    const trace = [
      {
        ruleName: "Background day",
        timeframe: "1D",
        passed: dump || pump,
        reason: dump
          ? "Dump Day detected from bearish D-2 close."
          : pump
            ? "Pump Day detected from bullish D-2 close."
            : "D-2 is neutral.",
        prices: { open: d2.open, close: d2.close, range: d2.high - d2.low },
        times: {
          day: strategyNyDate(strategyTime(d2)),
          sourceStart: d2.sourceStartTime ?? d2.sourceTime ?? d2.time,
          sourceEnd: d2.sourceEndTime ?? d2.sourceTime ?? d2.time,
        },
      } satisfies RuleTraceItem,
    ];
    pushTraceEvent(
      eventLog,
      ruleTrace,
      makeEvent(
        "background",
        dump
          ? "Dump Day detected"
          : pump
            ? "Pump Day detected"
            : "Background invalid",
        `${strategyNyDate(strategyTime(d2))} background classified from daily structure.`,
        dump
          ? "Range/body/close structure shows dump-day momentum."
          : pump
            ? "Range/body/close structure shows pump-day momentum."
            : "D-2 did not establish pump or dump background.",
        0,
        trace,
        strategyTime(d2),
      ),
    );
  }
  if (d1) {
    const inside = Boolean(d2) && d1.high <= d2.high && d1.low >= d2.low;
    const body = pips(Math.abs(d1.close - d1.open));
    const range = pips(d1.high - d1.low);
    const trace: RuleTraceItem[] = [
      {
        ruleName: "Signal day",
        timeframe: "1D",
        passed: fgd || frd,
        reason: fgd
          ? "FGD detected from dump background and bullish D-1 close."
          : frd
            ? "FRD detected from pump background and bearish D-1 close."
            : "D-1 does not complete FRD/FGD signal rules.",
        prices: { bodyPips: body, rangePips: range },
        times: {
          day: strategyNyDate(strategyTime(d1)),
          sourceStart: d1.sourceStartTime ?? d1.sourceTime ?? d1.time,
          sourceEnd: d1.sourceEndTime ?? d1.sourceTime ?? d1.time,
        },
      },
      {
        ruleName: "Signal quality",
        timeframe: "1D",
        passed:
          template === "FGD"
            ? body >= 40 && body / Math.max(range, 1) >= 0.6
            : inside,
        reason:
          template === "FGD"
            ? "FGD priority checks body >= 40 pips and >= 60% of range."
            : "FRD priority checks inside day vs D-2.",
        prices: {
          bodyPips: body,
          rangePips: range,
          d2High: d2?.high ?? 0,
          d2Low: d2?.low ?? 0,
        },
        times: {
          day: strategyNyDate(strategyTime(d1)),
          sourceStart: d1.sourceStartTime ?? d1.sourceTime ?? d1.time,
          sourceEnd: d1.sourceEndTime ?? d1.sourceTime ?? d1.time,
        },
      },
    ];
    pushTraceEvent(
      eventLog,
      ruleTrace,
      makeEvent(
        "signal",
        fgd ? "FGD detected" : frd ? "FRD detected" : "Signal day incomplete",
        `${strategyNyDate(strategyTime(d1))} signal day assessed.`,
        fgd
          ? "FGD detected — dump background + bullish signal body. Next: watch New York LOS source and low sweep reversal."
          : frd
            ? "FRD detected — inside day + bearish close. Next: watch New York HOS source and reclaim failure."
            : "Signal day is present but template is incomplete.",
        1,
        trace,
        strategyTime(d1),
      ),
    );
  }

  const startIndex = bars1m.findIndex(
    (bar) => strategyNyDate(strategyTime(bar)) === tradeDay && inNySession(bar),
  );
  const replayStartIndex = Math.max(0, startIndex);
  const replayEndIndex = bars1m.length - 1;
  if (!session.length)
    missingConditions.push("Trade day New York session unavailable.");
  eventLog.push(
    makeEvent(
      "trade-day",
      `Day 3 active — ${bias} bias from ${template === "INVALID" ? "invalid dataset" : template}`,
      "Entered Day 3 New York trading window.",
      template === "FGD"
        ? "Day 3 active — bullish bias from FGD"
        : template === "FRD"
          ? "Day 3 active — bearish bias from FRD"
          : "Day 3 active but template is not tradeable.",
      replayStartIndex,
      [],
      session[0] ? strategyTime(session[0]) : undefined,
    ),
  );

  let sourceIndex = -1;
  let sourcePrice: number | undefined;
  let stopHuntIndex = -1;
  let p1 = -1;
  let p2 = -1;
  let p3 = -1;
  let breakout = -1;
  let emaIndex = -1;
  let entryIndex = -1;
  let stopPrice: number | undefined;
  let entryPrice: number | undefined;

  if (session.length) {
    for (let i = 1; i < session.length; i += 1) {
      const bar = session[i];
      if (
        template === "FGD" &&
        sourceIndex === -1 &&
        bar.low <= Math.min(...session.slice(0, i).map((x) => x.low))
      ) {
        sourceIndex = i;
        sourcePrice = bar.low;
      }
      if (
        template === "FRD" &&
        sourceIndex === -1 &&
        bar.high >= Math.max(...session.slice(0, i).map((x) => x.high))
      ) {
        sourceIndex = i;
        sourcePrice = bar.high;
      }
      if (sourceIndex !== -1 && stopHuntIndex === -1) {
        const sourceBar = session[sourceIndex];
        if (
          template === "FGD" &&
          bar.close > sourceBar.low &&
          i <= sourceIndex + 3
        )
          stopHuntIndex = i;
        if (
          template === "FRD" &&
          bar.close < sourceBar.high &&
          i <= sourceIndex + 3
        )
          stopHuntIndex = i;
      }
    }
    if (sourceIndex !== -1) {
      const global = replayStartIndex + sourceIndex;
      const nearPrev =
        previousClose !== undefined
          ? pips(Math.abs((sourcePrice ?? 0) - previousClose))
          : undefined;
      const sourceBar = session[sourceIndex];
      const trace = [
        {
          ruleName: "Source",
          timeframe: "1m",
          passed: true,
          reason:
            template === "FGD"
              ? "FGD source uses LOS sweep."
              : "FRD source uses HOS sweep.",
          prices: {
            source: sourcePrice ?? 0,
            previousClose: previousClose ?? 0,
            distanceToPreviousClosePips: nearPrev ?? -1,
          },
          times: {
            strategyBar: strategyTime(sourceBar),
            sourceBar: sourceBar.sourceTime ?? sourceBar.time,
          },
        } satisfies RuleTraceItem,
      ];
      pushTraceEvent(
        eventLog,
        ruleTrace,
        makeEvent(
          "source",
          template === "FGD" ? "LOS source detected" : "HOS source detected",
          "Source level appeared during Day 3 session.",
          `${template === "FGD" ? "LOS" : "HOS"} source formed ${nearPrev !== undefined ? `with previous-close distance ${nearPrev} pips.` : "without previous close reference."}`,
          global,
          trace,
          strategyTime(sourceBar),
          { source: sourcePrice ?? 0 },
        ),
      );
      annotations.push(
        makeAnnotation(
          "source",
          global,
          strategyTime(sourceBar),
          sourcePrice ?? 0,
          "Source",
          "Source level used for Day 3 setup.",
          trace,
        ),
      );
      stopPrice =
        template === "FGD"
          ? (sourcePrice ?? 0) - 0.0021
          : (sourcePrice ?? 0) + 0.0021;
      annotations.push(
        makeAnnotation(
          "stop",
          global,
          strategyTime(sourceBar),
          stopPrice,
          "Stop",
          "Stop sits outside source extreme; >20 pips means skip.",
          trace,
        ),
      );
    } else {
      const lastBar = session[session.length - 1];
      const attemptedBar = session
        .slice(1)
        .reduce<OhlcvBar | undefined>((best, bar) => {
          if (!best) return bar;
          if (template === "FGD") return bar.low < best.low ? bar : best;
          if (template === "FRD") return bar.high > best.high ? bar : best;
          return best;
        }, undefined);
      const trace = [
        {
          ruleName: "Source",
          timeframe: "1m",
          passed: false,
          reason:
            template === "FGD"
              ? "No LOS sweep found yet during the active New York session."
              : template === "FRD"
                ? "No HOS sweep found yet during the active New York session."
                : "Source rule not evaluated because the Day 3 template is incomplete.",
          prices: {
            attemptedSource:
              template === "FGD"
                ? (attemptedBar?.low ?? 0)
                : (attemptedBar?.high ?? 0),
            previousClose: previousClose ?? 0,
            sessionLow: Number.isFinite(los) ? los : 0,
            sessionHigh: Number.isFinite(hos) ? hos : 0,
          },
          times: {
            attemptedBar: attemptedBar ? strategyTime(attemptedBar) : "",
            sourceAttempt: attemptedBar?.sourceTime ?? attemptedBar?.time ?? "",
            lastSessionBar: strategyTime(lastBar),
          },
        } satisfies RuleTraceItem,
      ];
      missingConditions.push("Source not found yet.");
      pushTraceEvent(
        eventLog,
        ruleTrace,
        makeEvent(
          "source",
          "Source not found",
          "Source gate is still pending.",
          template === "FGD"
            ? "Need a LOS sweep before the setup can progress into stop-hunt validation."
            : template === "FRD"
              ? "Need a HOS sweep before the setup can progress into stop-hunt validation."
              : "Source gate is blocked until the Day 3 template becomes tradeable.",
          replayStartIndex + Math.max(session.length - 1, 0),
          trace,
          strategyTime(lastBar),
          { attemptedSource: trace[0].prices.attemptedSource },
        ),
      );
    }
    if (stopHuntIndex !== -1) {
      const global = replayStartIndex + stopHuntIndex;
      const stopHuntBar = session[stopHuntIndex];
      const sourceBar = session[sourceIndex];
      const trace = [
        {
          ruleName: "Stop hunt",
          timeframe: "1m",
          passed: true,
          reason:
            template === "FGD"
              ? "Price swept the prior low and reclaimed above it quickly."
              : "Price swept the prior high and reclaimed below it quickly.",
          prices: { source: sourcePrice ?? 0, reclaim: stopHuntBar.close },
          times: {
            strategySweep: strategyTime(sourceBar),
            sourceSweep: sourceBar.sourceTime ?? sourceBar.time,
            strategyReclaim: strategyTime(stopHuntBar),
            sourceReclaim: stopHuntBar.sourceTime ?? stopHuntBar.time,
          },
        } satisfies RuleTraceItem,
      ];
      pushTraceEvent(
        eventLog,
        ruleTrace,
        makeEvent(
          "stop-hunt",
          "Stop hunt confirmed",
          "Stop hunt rule passed.",
          template === "FGD"
            ? "Stop hunt confirmed — low sweep reclaimed above the swept level."
            : "Stop hunt confirmed — high sweep reclaimed back below the swept level.",
          global,
          trace,
          strategyTime(stopHuntBar),
        ),
      );
      annotations.push(
        makeAnnotation(
          "stopHunt",
          global,
          strategyTime(stopHuntBar),
          stopHuntBar.close,
          "Stop hunt",
          "Quick reclaim after source sweep.",
          trace,
        ),
      );
      p1 = sourceIndex;
      p2 = Math.min(session.length - 1, stopHuntIndex + 4);
      p3 = Math.min(session.length - 1, p2 + 4);
      breakout = Math.min(session.length - 1, p3 + 3);
    } else {
      const anchorIndex = Math.max(sourceIndex, 1);
      const anchorBar = session[anchorIndex];
      const sourceBar = sourceIndex !== -1 ? session[sourceIndex] : undefined;
      const reclaimWindowEnd = sourceBar
        ? session[Math.min(session.length - 1, sourceIndex + 3)]
        : anchorBar;
      const trace = [
        {
          ruleName: "Stop hunt",
          timeframe: "1m",
          passed: false,
          reason: sourceBar
            ? template === "FGD"
              ? "Sweep happened, but no reclaim above the source low arrived within three bars."
              : "Sweep happened, but no reclaim below the source high arrived within three bars."
            : "Stop hunt cannot be confirmed before a source sweep exists.",
          prices: {
            source: sourcePrice ?? 0,
            latestClose: anchorBar?.close ?? 0,
            reclaimThreshold: sourcePrice ?? 0,
          },
          times: {
            strategySweep: sourceBar ? strategyTime(sourceBar) : "",
            sourceSweep: sourceBar?.sourceTime ?? sourceBar?.time ?? "",
            reclaimWindowEnd: reclaimWindowEnd
              ? strategyTime(reclaimWindowEnd)
              : "",
            latestObservedBar: anchorBar ? strategyTime(anchorBar) : "",
          },
        } satisfies RuleTraceItem,
      ];
      missingConditions.push("Stop hunt not confirmed yet.");
      pushTraceEvent(
        eventLog,
        ruleTrace,
        makeEvent(
          "stop-hunt",
          "Stop hunt not confirmed",
          "Stop hunt rule failed so far.",
          "Need a sweep and quick reclaim before upgrading setup quality.",
          replayStartIndex + anchorIndex,
          trace,
          anchorBar ? strategyTime(anchorBar) : undefined,
        ),
      );
    }
    if (p1 !== -1) {
      const trace = [
        {
          ruleName: "123 structure",
          timeframe: "1m",
          passed: true,
          reason: "1-2-3 reversal mapped after stop hunt.",
          prices: {
            node1: session[p1].close,
            node2: session[p2].close,
            node3: session[p3].close,
            breakout: session[breakout].close,
          },
          times: {
            node1: strategyTime(session[p1]),
            node2: strategyTime(session[p2]),
            node3: strategyTime(session[p3]),
            breakout: strategyTime(session[breakout]),
            sourceNode1: session[p1].sourceTime ?? session[p1].time,
            sourceNode2: session[p2].sourceTime ?? session[p2].time,
            sourceNode3: session[p3].sourceTime ?? session[p3].time,
            sourceBreakout:
              session[breakout].sourceTime ?? session[breakout].time,
          },
        } satisfies RuleTraceItem,
      ];
      pushTraceEvent(
        eventLog,
        ruleTrace,
        makeEvent(
          "pattern-123",
          "123 structure ready",
          "Valid 1-2-3 structure is available.",
          "123 is complete and the breakout leg is visible.",
          replayStartIndex + breakout,
          trace,
          strategyTime(session[breakout]),
        ),
      );
      annotations.push(
        makeAnnotation(
          "point1",
          replayStartIndex + p1,
          strategyTime(session[p1]),
          session[p1].close,
          "1",
          "123 node 1",
          trace,
        ),
      );
      annotations.push(
        makeAnnotation(
          "point2",
          replayStartIndex + p2,
          strategyTime(session[p2]),
          session[p2].close,
          "2",
          "123 node 2",
          trace,
        ),
      );
      annotations.push(
        makeAnnotation(
          "point3",
          replayStartIndex + p3,
          strategyTime(session[p3]),
          session[p3].close,
          "3",
          "123 node 3",
          trace,
        ),
      );
    } else {
      const anchorBar =
        stopHuntIndex !== -1
          ? session[stopHuntIndex]
          : (session[Math.max(sourceIndex, 1)] ?? session[0]);
      const trace = [
        {
          ruleName: "123 structure",
          timeframe: "1m",
          passed: false,
          reason:
            stopHuntIndex !== -1
              ? "Stop hunt exists, but the 1-2-3 sequence has not extended far enough to confirm breakout structure."
              : "123 structure waits on a confirmed stop hunt before nodes can be assigned.",
          prices: {
            source: sourcePrice ?? 0,
            pivotClose: anchorBar?.close ?? 0,
            projectedNode2:
              stopHuntIndex !== -1
                ? (session[Math.min(session.length - 1, stopHuntIndex + 4)]
                    ?.close ?? 0)
                : 0,
          },
          times: {
            anchorBar: anchorBar ? strategyTime(anchorBar) : "",
            sourceAnchor: anchorBar?.sourceTime ?? anchorBar?.time ?? "",
          },
        } satisfies RuleTraceItem,
      ];
      missingConditions.push("123 structure incomplete.");
      pushTraceEvent(
        eventLog,
        ruleTrace,
        makeEvent(
          "pattern-123",
          "123 structure incomplete",
          "123 gate is still pending.",
          "The reversal sequence is not fully mapped yet, so breakout confirmation remains unavailable.",
          replayStartIndex +
            Math.max(stopHuntIndex !== -1 ? stopHuntIndex : sourceIndex, 1),
          trace,
          anchorBar ? strategyTime(anchorBar) : undefined,
        ),
      );
    }
    if (five.length) {
      for (let i = 1; i < five.length; i += 1) {
        if (template === "FGD" && five[i].close > ema5[i]) {
          emaIndex = i;
          break;
        }
        if (template === "FRD" && five[i].close < ema5[i]) {
          emaIndex = i;
          break;
        }
      }
      if (emaIndex !== -1) {
        const anchorBar = five[emaIndex];
        const global = bars1m.findIndex(
          (bar) => strategyTime(bar) === strategyTime(anchorBar),
        );
        const trace = [
          {
            ruleName: "20EMA confirm",
            timeframe: "5m",
            passed: true,
            reason:
              template === "FGD"
                ? "5m close back above 20EMA."
                : "5m close back below 20EMA.",
            prices: { close: anchorBar.close, ema20: ema5[emaIndex] },
            times: {
              strategyBar: strategyTime(anchorBar),
              sourceStart:
                anchorBar.sourceStartTime ??
                anchorBar.sourceTime ??
                anchorBar.time,
              sourceEnd:
                anchorBar.sourceEndTime ??
                anchorBar.sourceTime ??
                anchorBar.time,
            },
          } satisfies RuleTraceItem,
        ];
        pushTraceEvent(
          eventLog,
          ruleTrace,
          makeEvent(
            "ema",
            "20EMA confirm",
            "Momentum returned through the 20EMA gate.",
            trace[0].reason,
            global,
            trace,
            strategyTime(anchorBar),
          ),
        );
        annotations.push(
          makeAnnotation(
            "ema",
            global,
            strategyTime(anchorBar),
            anchorBar.close,
            "20EMA",
            "5m EMA confirmation.",
            trace,
          ),
        );
      } else {
        const anchorBar = five[five.length - 1];
        const global = bars1m.findIndex(
          (bar) => strategyTime(bar) === strategyTime(anchorBar),
        );
        const trace = [
          {
            ruleName: "20EMA confirm",
            timeframe: "5m",
            passed: false,
            reason:
              template === "FGD"
                ? "5m close has not reclaimed above the 20EMA yet."
                : template === "FRD"
                  ? "5m close has not rejected back below the 20EMA yet."
                  : "20EMA gate is pending because the Day 3 template is incomplete.",
            prices: {
              close: anchorBar.close,
              ema20: ema5[five.length - 1],
              emaGapPips: pips(
                Math.abs(anchorBar.close - ema5[five.length - 1]),
              ),
            },
            times: {
              strategyBar: strategyTime(anchorBar),
              sourceStart:
                anchorBar.sourceStartTime ??
                anchorBar.sourceTime ??
                anchorBar.time,
              sourceEnd:
                anchorBar.sourceEndTime ??
                anchorBar.sourceTime ??
                anchorBar.time,
            },
          } satisfies RuleTraceItem,
        ];
        missingConditions.push("20EMA confirm pending.");
        pushTraceEvent(
          eventLog,
          ruleTrace,
          makeEvent(
            "ema",
            "20EMA confirm pending",
            "20EMA gate is still pending.",
            "Momentum has not yet crossed the EMA gate required for entry validation.",
            global,
            trace,
            strategyTime(anchorBar),
          ),
        );
      }
    }
    if (p1 !== -1 && emaIndex !== -1 && sourcePrice !== undefined) {
      entryIndex = Math.max(
        replayStartIndex + breakout,
        bars1m.findIndex(
          (bar) => strategyTime(bar) === strategyTime(five[emaIndex]),
        ),
      );
      entryPrice = bars1m[entryIndex]?.close;
      const stopDistance =
        entryPrice !== undefined && stopPrice !== undefined
          ? pips(Math.abs(entryPrice - stopPrice))
          : 999;
      const trace = [
        {
          ruleName: "Entry gate",
          timeframe: "1m",
          passed: stopDistance <= 20,
          reason:
            stopDistance <= 20
              ? "Entry valid with stop <= 20 pips."
              : "Skip: stop too large.",
          prices: {
            entry: entryPrice ?? 0,
            stop: stopPrice ?? 0,
            stopDistance,
          },
          times: {
            strategyEntry: strategyTime(bars1m[entryIndex] ?? { time: "" }),
            sourceEntry:
              bars1m[entryIndex]?.sourceTime ?? bars1m[entryIndex]?.time ?? "",
          },
        } satisfies RuleTraceItem,
      ];
      pushTraceEvent(
        eventLog,
        ruleTrace,
        makeEvent(
          "entry",
          stopDistance <= 20 ? "Entry valid" : "Skip: stop too large",
          "Entry gate evaluated.",
          stopDistance <= 20
            ? "Entry valid — source, stop hunt, 123, and EMA gates align."
            : "Skip: stop too large",
          entryIndex,
          trace,
          strategyTime(bars1m[entryIndex] ?? session[0]),
        ),
      );
      annotations.push(
        makeAnnotation(
          "entry",
          entryIndex,
          strategyTime(bars1m[entryIndex] ?? session[0]),
          entryPrice ?? 0,
          "Entry",
          "Entry becomes valid only after all gates align.",
          trace,
        ),
      );
    } else {
      const lastGateBar =
        session[Math.max(stopHuntIndex, sourceIndex, 1)] ?? session[0];
      const trace = [
        {
          ruleName: "Entry gate",
          timeframe: "1m",
          passed: false,
          reason:
            entryPrice === undefined
              ? "Entry skipped because one or more prerequisite gates are still unavailable."
              : "Entry skipped because the stop distance exceeded 20 pips.",
          prices: {
            source: sourcePrice ?? 0,
            stop: stopPrice ?? 0,
            currentClose: lastGateBar?.close ?? 0,
            stopDistance:
              stopPrice !== undefined
                ? pips(Math.abs((lastGateBar?.close ?? stopPrice) - stopPrice))
                : 0,
          },
          times: {
            currentBar: lastGateBar ? strategyTime(lastGateBar) : "",
            sourceCurrentBar:
              lastGateBar?.sourceTime ?? lastGateBar?.time ?? "",
          },
        } satisfies RuleTraceItem,
      ];
      missingConditions.push("Entry skipped or unavailable.");
      pushTraceEvent(
        eventLog,
        ruleTrace,
        makeEvent(
          "entry",
          "Entry unavailable",
          "Entry gate remains locked.",
          "Entry cannot be offered until source, stop hunt, 123, and 20EMA gates line up with an acceptable stop distance.",
          replayStartIndex + Math.max(stopHuntIndex, sourceIndex, 1),
          trace,
          lastGateBar ? strategyTime(lastGateBar) : undefined,
        ),
      );
    }
  }

  const entryReady = entryIndex !== -1 && entryPrice !== undefined;
  const stopHuntConfirmed = stopHuntIndex !== -1;
  const pattern123Ready = p1 !== -1;
  const emaConfirmed = emaIndex !== -1;
  const maxFavorablePips = entryReady
    ? bars1m.slice(entryIndex).reduce((maxMove, bar) => {
        const move =
          template === "FGD"
            ? pips(bar.high - (entryPrice ?? 0))
            : pips((entryPrice ?? 0) - bar.low);
        return Math.max(maxMove, move);
      }, 0)
    : 0;
  const engulfmentReady = false;
  // NOTE: The current engine does not model a dedicated engulfment rule yet.
  // To avoid silently inventing one, TP40 only unlocks from the explicit
  // stop-hunt branch already tracked in strategy state.
  const tp30Eligible = entryReady && maxFavorablePips >= 15;
  const tp35Eligible = entryReady && maxFavorablePips >= 30;
  const tp40Eligible =
    entryReady &&
    maxFavorablePips >= 30 &&
    (stopHuntConfirmed || engulfmentReady);
  const tp50Eligible =
    entryReady &&
    stopHuntConfirmed &&
    pattern123Ready &&
    emaConfirmed &&
    maxFavorablePips >= 35;

  const tierReason = (tier: 30 | 35 | 40 | 50) =>
    tier === 30
      ? "Requires entry plus source/20EMA base state and move30 >= 15."
      : tier === 35
        ? "Requires TP35 upgrade: move30 >= 30."
        : tier === 40
          ? "Requires TP40 upgrade: move30 >= 30 plus stop hunt or engulfment."
          : "Requires TP50 upgrade: stop hunt + 123 + 20EMA + move30 >= 35.";

  const targetLevels: TradeLevel[] = ([30, 35, 40, 50] as const).map((tier) => {
    const price =
      entryPrice === undefined
        ? 0
        : template === "FGD"
          ? entryPrice + tier * 0.0001
          : entryPrice - tier * 0.0001;
    const eligible =
      tier === 30
        ? tp30Eligible
        : tier === 35
          ? tp35Eligible
          : tier === 40
            ? tp40Eligible
            : tp50Eligible;
    const missingGate = !entryReady
      ? "Entry gate is still locked."
      : tier === 30
        ? maxFavorablePips >= 15
          ? undefined
          : `Need move30 >= 15; current favorable move is ${maxFavorablePips} pips.`
        : tier === 35
          ? maxFavorablePips >= 30
            ? undefined
            : `Need TP35 upgrade (move30 >= 30); current favorable move is ${maxFavorablePips} pips.`
          : tier === 40
            ? maxFavorablePips < 30
              ? `Need TP40 upgrade move30 >= 30; current favorable move is ${maxFavorablePips} pips.`
              : stopHuntConfirmed
                ? undefined
                : "Need TP40 upgrade gate: confirmed stop hunt (engulfment rule not modeled in current engine)."
            : maxFavorablePips < 35
              ? `Need TP50 upgrade move30 >= 35; current favorable move is ${maxFavorablePips} pips.`
              : !stopHuntConfirmed
                ? "Need TP50 upgrade gate: confirmed stop hunt."
                : !pattern123Ready
                  ? "Need TP50 upgrade gate: confirmed 1-2-3 structure."
                  : !emaConfirmed
                    ? "Need TP50 upgrade gate: 20EMA confirmation."
                    : undefined;
    const hit =
      eligible &&
      entryIndex !== -1 &&
      bars1m
        .slice(entryIndex)
        .some((bar) =>
          template === "FGD" ? bar.high >= price : bar.low <= price,
        );
    return {
      tier,
      price,
      eligible,
      hit,
      status: hit
        ? "hit"
        : eligible
          ? "eligible"
          : entryReady
            ? "blocked"
            : "pending",
      reason: tierReason(tier),
      missingGate,
    };
  });
  const recommendedTarget = targetLevels
    .filter((level) => level.eligible)
    .slice(-1)[0]?.tier;
  targetLevels.forEach((level) => {
    if (entryIndex !== -1)
      annotations.push(
        makeAnnotation(
          `tp${level.tier}` as Annotation["kind"],
          entryIndex,
          strategyTime(bars1m[entryIndex]),
          level.price,
          `TP${level.tier}`,
          level.reason,
          [],
        ),
      );
    const trace = [
      {
        ruleName: `Target tier TP${level.tier}`,
        timeframe: "1m",
        passed: level.eligible,
        reason: level.hit
          ? `TP${level.tier} is eligible and has been hit.`
          : level.eligible
            ? `TP${level.tier} is unlocked and waiting for price to hit ${level.price.toFixed(4)}.`
            : `TP${level.tier} remains locked — ${level.missingGate ?? level.reason}`,
        prices: {
          entry: entryPrice ?? 0,
          target: level.price,
          maxFavorablePips,
          eligible: level.eligible ? 1 : 0,
        },
        times: {
          entryBar: entryIndex !== -1 ? strategyTime(bars1m[entryIndex]) : "",
          latestBar: strategyTime(bars1m[bars1m.length - 1] ?? { time: "" }),
        },
      } satisfies RuleTraceItem,
    ];
    pushTraceEvent(
      eventLog,
      ruleTrace,
      makeEvent(
        "management",
        level.hit
          ? `TP${level.tier} hit`
          : level.eligible
            ? `TP${level.tier} unlocked`
            : `TP${level.tier} locked`,
        `Target tier TP${level.tier} reviewed.`,
        trace[0].reason,
        entryIndex !== -1 ? entryIndex : replayStartIndex,
        trace,
        entryIndex !== -1 ? strategyTime(bars1m[entryIndex]) : undefined,
        { target: level.price },
      ),
    );
  });

  const quality = invalidIssues.length
    ? "invalid"
    : template === "FGD" && d1 && pips(Math.abs(d1.close - d1.open)) >= 40
      ? "strong"
      : template === "FRD" && d1 && d2 && d1.high <= d2.high && d1.low >= d2.low
        ? "strong"
        : template === "INCOMPLETE"
          ? "weak"
          : "acceptable";
  const invalidReasons = invalidIssues.map((issue) => issue.message);
  if (invalidReasons.length)
    eventLog.push(
      makeEvent(
        "invalid",
        invalidReasons[0],
        "Dataset validation failed.",
        invalidIssues.map((issue) => issue.detail).join(" "),
        0,
        [],
        strategyTime(bars1m[0] ?? { time: "" }),
      ),
    );

  return {
    datasetId,
    symbol,
    timeframeBars,
    template,
    bias,
    quality,
    selectedTradeDay: tradeDay,
    invalidReasons,
    missingConditions,
    nextExpectation: eventLog.some(
      (event) => event.stage === "entry" && event.title === "Entry valid",
    )
      ? "Manage TP30/35/40/50 and stop behavior."
      : template === "FGD"
        ? "Next: watch LOS source, stop hunt, 123, and 20EMA reclaim."
        : template === "FRD"
          ? "Next: watch HOS source, stop hunt, 123, and 20EMA rejection."
          : "Next: fix dataset or load a different instrument file.",
    eventLog,
    ruleTrace,
    annotations,
    replayStartIndex,
    replayEndIndex,
    stopPrice,
    entryPrice,
    sourcePrice,
    previousClose,
    hos: Number.isFinite(hos) ? hos : undefined,
    los: Number.isFinite(los) ? los : undefined,
    hod: Number.isFinite(hod) ? hod : undefined,
    lod: Number.isFinite(lod) ? lod : undefined,
    targetLevels,
    recommendedTarget,
  };
};

const resolveCurrentTargetLevels = (
  analysis: ReplayDatasetAnalysis,
  currentBarIndex: number,
): {
  targetLevels: TradeLevel[];
  recommendedTarget?: 30 | 35 | 40 | 50;
} => {
  const bars1m = analysis.timeframeBars["1m"];
  const entryEvent = analysis.eventLog.find(
    (event) => event.stage === "entry" && event.title === "Entry valid",
  );
  const entryIndex =
    entryEvent && entryEvent.visibleFromIndex <= currentBarIndex
      ? entryEvent.visibleFromIndex
      : -1;
  const entryReady = entryIndex !== -1 && analysis.entryPrice !== undefined;
  const stopHuntConfirmed = analysis.eventLog.some(
    (event) =>
      event.stage === "stop-hunt" &&
      event.title === "Stop hunt confirmed" &&
      event.visibleFromIndex <= currentBarIndex,
  );
  const pattern123Ready = analysis.eventLog.some(
    (event) =>
      event.stage === "pattern-123" &&
      event.title === "123 structure ready" &&
      event.visibleFromIndex <= currentBarIndex,
  );
  const emaConfirmed = analysis.eventLog.some(
    (event) =>
      event.stage === "ema" &&
      event.title === "20EMA confirm" &&
      event.visibleFromIndex <= currentBarIndex,
  );
  const visibleBars =
    entryReady && analysis.entryPrice !== undefined
      ? bars1m.slice(entryIndex, currentBarIndex + 1)
      : [];
  const maxFavorablePips = visibleBars.reduce((maxMove, bar) => {
    const move =
      analysis.template === "FGD"
        ? pips(bar.high - (analysis.entryPrice ?? 0))
        : pips((analysis.entryPrice ?? 0) - bar.low);
    return Math.max(maxMove, move);
  }, 0);

  const targetLevels = analysis.targetLevels.map((level) => {
    const eligible = !entryReady
      ? false
      : level.tier === 30
        ? maxFavorablePips >= 15
        : level.tier === 35
          ? maxFavorablePips >= 30
          : level.tier === 40
            ? maxFavorablePips >= 30 && stopHuntConfirmed
            : maxFavorablePips >= 35 &&
              stopHuntConfirmed &&
              pattern123Ready &&
              emaConfirmed;
    const missingGate = !entryReady
      ? "Entry gate is still locked."
      : level.tier === 30
        ? maxFavorablePips >= 15
          ? undefined
          : `Need move30 >= 15; current favorable move is ${maxFavorablePips} pips.`
        : level.tier === 35
          ? maxFavorablePips >= 30
            ? undefined
            : `Need TP35 upgrade (move30 >= 30); current favorable move is ${maxFavorablePips} pips.`
          : level.tier === 40
            ? maxFavorablePips < 30
              ? `Need TP40 upgrade move30 >= 30; current favorable move is ${maxFavorablePips} pips.`
              : stopHuntConfirmed
                ? undefined
                : "Need TP40 upgrade gate: confirmed stop hunt (engulfment rule not modeled in current engine)."
            : maxFavorablePips < 35
              ? `Need TP50 upgrade move30 >= 35; current favorable move is ${maxFavorablePips} pips.`
              : !stopHuntConfirmed
                ? "Need TP50 upgrade gate: confirmed stop hunt."
                : !pattern123Ready
                  ? "Need TP50 upgrade gate: confirmed 1-2-3 structure."
                  : !emaConfirmed
                    ? "Need TP50 upgrade gate: 20EMA confirmation."
                    : undefined;
    const hit =
      eligible &&
      visibleBars.some((bar) =>
        analysis.template === "FGD"
          ? bar.high >= level.price
          : bar.low <= level.price,
      );
    const status: TradeLevel["status"] = hit
      ? "hit"
      : eligible
        ? "eligible"
        : entryReady
          ? "blocked"
          : "pending";
    return {
      ...level,
      eligible,
      hit,
      status,
      missingGate,
    };
  });

  return {
    targetLevels,
    recommendedTarget: targetLevels
      .filter((level) => level.eligible)
      .slice(-1)[0]?.tier,
  };
};

export const buildReplayAnalysis = (
  datasetAnalysis: ReplayDatasetAnalysis,
  currentBarIndex: number,
): ReplayAnalysis => ({
  ...datasetAnalysis,
  ...resolveCurrentTargetLevels(datasetAnalysis, currentBarIndex),
  ...resolveReplayVisibility(datasetAnalysis, currentBarIndex),
});

export const toNyLabel = strategyNyLabel;

import { aggregateBars } from '../aggregation/timeframe';
import type { Annotation, EventLogItem, OhlcvBar, ReplayAnalysis, ReplayStageId, RuleTraceItem, Timeframe, TradeLevel } from '../types/domain';
import { byNyDate, nyDate, nyLabel, nyTime } from '../utils/nyDate';
import { validateDataset } from '../validation/datasetValidation';

const tfList: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];
const ema = (bars: OhlcvBar[], period: number) => {
  const k = 2 / (period + 1);
  let prev = bars[0]?.close ?? 0;
  return bars.map((bar) => {
    prev = bar.close * k + prev * (1 - k);
    return prev;
  });
};
const pips = (value: number) => Math.round(value / 0.0001);
const inNySession = (bar: OhlcvBar) => nyTime(bar.time) >= '07:00' && nyTime(bar.time) <= '11:00';
const id = (stage: ReplayStageId, suffix: string) => `${stage}-${suffix}`;

const makeEvent = (stage: ReplayStageId, title: string, summary: string, detail: string, visibleFromIndex: number, trace: RuleTraceItem[], barTime?: string, prices?: Record<string, number>): EventLogItem => ({ id: id(stage, String(visibleFromIndex)), stage, title, summary, detail, statusBanner: title, visibleFromIndex, barTime, prices, trace });
const makeAnnotation = (kind: Annotation['kind'], index: number, barTime: string, price: number, label: string, reasoning: string, trace: RuleTraceItem[]): Annotation => ({ id: `${kind}-${barTime}`, kind, barTime, price, label, reasoning, trace, visibleFromIndex: index });

export const buildReplayAnalysis = (datasetId: string, symbol: string, bars1m: OhlcvBar[], currentBarIndex: number): ReplayAnalysis => {
  const timeframeBars = Object.fromEntries(tfList.map((tf) => [tf, aggregateBars(bars1m, tf)])) as Record<Timeframe, OhlcvBar[]>;
  const invalidIssues = validateDataset(bars1m);
  const days = Object.keys(byNyDate(bars1m)).sort();
  const tradeDay = days[days.length - 1] ?? '';
  const daily = timeframeBars['1D'];
  const d2 = daily[daily.length - 3];
  const d1 = daily[daily.length - 2];
  const tradeGroup = byNyDate(bars1m)[tradeDay] ?? [];
  const session = tradeGroup.filter(inNySession);
  const five = aggregateBars(session, '5m');
  const ema5 = ema(five, 20);
  const previousClose = d1?.close;
  const hos = Math.max(...session.map((bar) => bar.high), Number.NEGATIVE_INFINITY);
  const los = Math.min(...session.map((bar) => bar.low), Number.POSITIVE_INFINITY);
  const hod = Math.max(...tradeGroup.map((bar) => bar.high), Number.NEGATIVE_INFINITY);
  const lod = Math.min(...tradeGroup.map((bar) => bar.low), Number.POSITIVE_INFINITY);
  const dump = Boolean(d2 && d2.close < d2.open);
  const pump = Boolean(d2 && d2.close > d2.open);
  const fgd = dump && Boolean(d1 && d1.close > d1.open);
  const frd = pump && Boolean(d1 && d1.close < d1.open);
  const template = invalidIssues.length ? 'INVALID' : fgd ? 'FGD' : frd ? 'FRD' : 'INCOMPLETE';
  const bias = template === 'FGD' ? 'bullish' : template === 'FRD' ? 'bearish' : 'neutral';
  const ruleTrace: RuleTraceItem[] = [];
  const eventLog: EventLogItem[] = [];
  const annotations: Annotation[] = [];
  const missingConditions: string[] = [];
  const currentReasoning: string[] = [];

  if (d2) {
    const trace = [{ ruleName: 'Background day', timeframe: '1D', passed: dump || pump, reason: dump ? 'Dump Day detected from bearish D-2 close.' : pump ? 'Pump Day detected from bullish D-2 close.' : 'D-2 is neutral.', prices: { open: d2.open, close: d2.close, range: d2.high - d2.low }, times: { day: nyDate(d2.time) } } satisfies RuleTraceItem];
    ruleTrace.push(...trace);
    eventLog.push(makeEvent('background', dump ? 'Dump Day detected' : pump ? 'Pump Day detected' : 'Background invalid', `${nyDate(d2.time)} background classified from daily structure.`, dump ? 'Range/body/close structure shows dump-day momentum.' : pump ? 'Range/body/close structure shows pump-day momentum.' : 'D-2 did not establish pump or dump background.', 0, trace, d2.time));
  }
  if (d1) {
    const inside = Boolean(d2) && d1.high <= d2.high && d1.low >= d2.low;
    const body = pips(Math.abs(d1.close - d1.open));
    const range = pips(d1.high - d1.low);
    const trace: RuleTraceItem[] = [{ ruleName: 'Signal day', timeframe: '1D', passed: fgd || frd, reason: fgd ? 'FGD detected from dump background and bullish D-1 close.' : frd ? 'FRD detected from pump background and bearish D-1 close.' : 'D-1 does not complete FRD/FGD signal rules.', prices: { bodyPips: body, rangePips: range }, times: { day: nyDate(d1.time) } }, { ruleName: 'Signal quality', timeframe: '1D', passed: template === 'FGD' ? body >= 40 && body / Math.max(range, 1) >= 0.6 : inside, reason: template === 'FGD' ? 'FGD priority checks body >= 40 pips and >= 60% of range.' : 'FRD priority checks inside day vs D-2.', prices: { bodyPips: body, rangePips: range, d2High: d2?.high ?? 0, d2Low: d2?.low ?? 0 }, times: { day: nyDate(d1.time) } }];
    ruleTrace.push(...trace);
    eventLog.push(makeEvent('signal', fgd ? 'FGD detected' : frd ? 'FRD detected' : 'Signal day incomplete', `${nyDate(d1.time)} signal day assessed.`, fgd ? 'FGD detected — dump background + bullish signal body. Next: watch New York LOS source and low sweep reversal.' : frd ? 'FRD detected — inside day + bearish close. Next: watch New York HOS source and reclaim failure.' : 'Signal day is present but template is incomplete.', 1, trace, d1.time));
  }

  const startIndex = bars1m.findIndex((bar) => nyDate(bar.time) === tradeDay && inNySession(bar));
  const replayStartIndex = Math.max(0, startIndex);
  const replayEndIndex = bars1m.length - 1;
  if (!session.length) missingConditions.push('Trade day New York session unavailable.');
  eventLog.push(makeEvent('trade-day', `Day 3 active — ${bias} bias from ${template === 'INVALID' ? 'invalid dataset' : template}`, 'Entered Day 3 New York trading window.', template === 'FGD' ? 'Day 3 active — bullish bias from FGD' : template === 'FRD' ? 'Day 3 active — bearish bias from FRD' : 'Day 3 active but template is not tradeable.', replayStartIndex, [], session[0]?.time));

  let sourceIndex = -1;
  let sourcePrice: number | undefined;
  let stopHuntIndex = -1;
  let p1 = -1; let p2 = -1; let p3 = -1; let breakout = -1;
  let emaIndex = -1;
  let entryIndex = -1;
  let stopPrice: number | undefined;
  let entryPrice: number | undefined;

  if (session.length) {
    for (let i = 1; i < session.length; i += 1) {
      const bar = session[i];
      if (template === 'FGD' && sourceIndex === -1 && bar.low <= Math.min(...session.slice(0, i).map((x) => x.low))) { sourceIndex = i; sourcePrice = bar.low; }
      if (template === 'FRD' && sourceIndex === -1 && bar.high >= Math.max(...session.slice(0, i).map((x) => x.high))) { sourceIndex = i; sourcePrice = bar.high; }
      if (sourceIndex !== -1 && stopHuntIndex === -1) {
        const sourceBar = session[sourceIndex];
        if (template === 'FGD' && bar.close > sourceBar.low && i <= sourceIndex + 3) stopHuntIndex = i;
        if (template === 'FRD' && bar.close < sourceBar.high && i <= sourceIndex + 3) stopHuntIndex = i;
      }
    }
    if (sourceIndex !== -1) {
      const global = replayStartIndex + sourceIndex;
      const nearPrev = previousClose !== undefined ? pips(Math.abs((sourcePrice ?? 0) - previousClose)) : undefined;
      const trace = [{ ruleName: 'Source', timeframe: '1m', passed: true, reason: template === 'FGD' ? 'FGD source uses LOS sweep.' : 'FRD source uses HOS sweep.', prices: { source: sourcePrice ?? 0, previousClose: previousClose ?? 0, distanceToPreviousClosePips: nearPrev ?? -1 }, times: { bar: session[sourceIndex].time } } satisfies RuleTraceItem];
      ruleTrace.push(...trace);
      eventLog.push(makeEvent('source', template === 'FGD' ? 'LOS source detected' : 'HOS source detected', 'Source level appeared during Day 3 session.', `${template === 'FGD' ? 'LOS' : 'HOS'} source formed ${nearPrev !== undefined ? `with previous-close distance ${nearPrev} pips.` : 'without previous close reference.'}`, global, trace, session[sourceIndex].time, { source: sourcePrice ?? 0 }));
      annotations.push(makeAnnotation('source', global, session[sourceIndex].time, sourcePrice ?? 0, 'Source', 'Source level used for Day 3 setup.', trace));
      stopPrice = template === 'FGD' ? (sourcePrice ?? 0) - 0.0021 : (sourcePrice ?? 0) + 0.0021;
      annotations.push(makeAnnotation('stop', global, session[sourceIndex].time, stopPrice, 'Stop', 'Stop sits outside source extreme; >20 pips means skip.', trace));
    }
    if (stopHuntIndex !== -1) {
      const global = replayStartIndex + stopHuntIndex;
      const trace = [{ ruleName: 'Stop hunt', timeframe: '1m', passed: true, reason: template === 'FGD' ? 'Price swept the prior low and reclaimed above it quickly.' : 'Price swept the prior high and reclaimed below it quickly.', prices: { source: sourcePrice ?? 0, reclaim: session[stopHuntIndex].close }, times: { sweep: session[sourceIndex].time, reclaim: session[stopHuntIndex].time } } satisfies RuleTraceItem];
      ruleTrace.push(...trace);
      eventLog.push(makeEvent('stop-hunt', 'Stop hunt confirmed', 'Stop hunt rule passed.', template === 'FGD' ? 'Stop hunt confirmed — low sweep reclaimed above the swept level.' : 'Stop hunt confirmed — high sweep reclaimed back below the swept level.', global, trace, session[stopHuntIndex].time));
      annotations.push(makeAnnotation('stopHunt', global, session[stopHuntIndex].time, session[stopHuntIndex].close, 'Stop hunt', 'Quick reclaim after source sweep.', trace));
      p1 = sourceIndex; p2 = Math.min(session.length - 1, stopHuntIndex + 4); p3 = Math.min(session.length - 1, p2 + 4); breakout = Math.min(session.length - 1, p3 + 3);
    } else {
      missingConditions.push('Stop hunt not confirmed yet.');
      eventLog.push(makeEvent('stop-hunt', 'Stop hunt not confirmed', 'Stop hunt rule failed so far.', 'Need a sweep and quick reclaim before upgrading setup quality.', replayStartIndex + Math.max(sourceIndex, 1), [], session[Math.max(sourceIndex, 1)]?.time));
    }
    if (p1 !== -1) {
      const trace = [{ ruleName: '123 structure', timeframe: '1m', passed: true, reason: '1-2-3 reversal mapped after stop hunt.', prices: { node1: session[p1].close, node2: session[p2].close, node3: session[p3].close, breakout: session[breakout].close }, times: { node1: session[p1].time, node2: session[p2].time, node3: session[p3].time, breakout: session[breakout].time } } satisfies RuleTraceItem];
      ruleTrace.push(...trace);
      eventLog.push(makeEvent('pattern-123', '123 structure ready', 'Valid 1-2-3 structure is available.', '123 is complete and the breakout leg is visible.', replayStartIndex + breakout, trace, session[breakout].time));
      annotations.push(makeAnnotation('point1', replayStartIndex + p1, session[p1].time, session[p1].close, '1', '123 node 1', trace));
      annotations.push(makeAnnotation('point2', replayStartIndex + p2, session[p2].time, session[p2].close, '2', '123 node 2', trace));
      annotations.push(makeAnnotation('point3', replayStartIndex + p3, session[p3].time, session[p3].close, '3', '123 node 3', trace));
    } else {
      missingConditions.push('123 structure incomplete.');
    }
    if (five.length) {
      for (let i = 1; i < five.length; i += 1) {
        if (template === 'FGD' && five[i].close > ema5[i]) { emaIndex = i; break; }
        if (template === 'FRD' && five[i].close < ema5[i]) { emaIndex = i; break; }
      }
      if (emaIndex !== -1) {
        const anchorBar = five[emaIndex];
        const global = bars1m.findIndex((bar) => bar.time === anchorBar.time);
        const trace = [{ ruleName: '20EMA confirm', timeframe: '5m', passed: true, reason: template === 'FGD' ? '5m close back above 20EMA.' : '5m close back below 20EMA.', prices: { close: anchorBar.close, ema20: ema5[emaIndex] }, times: { bar: anchorBar.time } } satisfies RuleTraceItem];
        ruleTrace.push(...trace);
        eventLog.push(makeEvent('ema', '20EMA confirm', 'Momentum returned through the 20EMA gate.', trace[0].reason, global, trace, anchorBar.time));
        annotations.push(makeAnnotation('ema', global, anchorBar.time, anchorBar.close, '20EMA', '5m EMA confirmation.', trace));
      } else {
        missingConditions.push('20EMA confirm pending.');
      }
    }
    if (p1 !== -1 && emaIndex !== -1 && sourcePrice !== undefined) {
      entryIndex = Math.max(replayStartIndex + breakout, bars1m.findIndex((bar) => bar.time === five[emaIndex].time));
      entryPrice = bars1m[entryIndex]?.close;
      const stopDistance = entryPrice !== undefined && stopPrice !== undefined ? pips(Math.abs(entryPrice - stopPrice)) : 999;
      const trace = [{ ruleName: 'Entry gate', timeframe: '1m', passed: stopDistance <= 20, reason: stopDistance <= 20 ? 'Entry valid with stop <= 20 pips.' : 'Skip: stop too large.', prices: { entry: entryPrice ?? 0, stop: stopPrice ?? 0, stopDistance }, times: { entry: bars1m[entryIndex]?.time ?? '' } } satisfies RuleTraceItem];
      ruleTrace.push(...trace);
      eventLog.push(makeEvent('entry', stopDistance <= 20 ? 'Entry valid' : 'Skip: stop too large', 'Entry gate evaluated.', stopDistance <= 20 ? 'Entry valid — source, stop hunt, 123, and EMA gates align.' : 'Skip: stop too large', entryIndex, trace, bars1m[entryIndex]?.time));
      annotations.push(makeAnnotation('entry', entryIndex, bars1m[entryIndex]?.time ?? session[0].time, entryPrice ?? 0, 'Entry', 'Entry becomes valid only after all gates align.', trace));
    }
  }

  const targetLevels: TradeLevel[] = [30, 35, 40, 50].map((tier) => {
    const price = entryPrice === undefined ? 0 : template === 'FGD' ? entryPrice + tier * 0.0001 : entryPrice - tier * 0.0001;
    const hit = entryIndex !== -1 && bars1m.slice(entryIndex).some((bar) => template === 'FGD' ? bar.high >= price : bar.low <= price);
    return { tier: tier as 30 | 35 | 40 | 50, price, hit, reason: tier === 30 ? 'Requires source + 20EMA + move30 >= 15.' : tier === 35 ? 'Requires move30 >= 30.' : tier === 40 ? 'Requires move30 >= 30 plus stop hunt or engulfment.' : 'Requires stop hunt + 123 + 20EMA + move30 >= 35.' };
  });
  const hitTier = targetLevels.filter((level) => level.hit).slice(-1)[0]?.tier;
  targetLevels.forEach((level) => {
    if (entryIndex !== -1) annotations.push(makeAnnotation(`tp${level.tier}` as Annotation['kind'], entryIndex, bars1m[entryIndex].time, level.price, `TP${level.tier}`, level.reason, []));
  });
  const recommendedTarget = hitTier ?? (entryIndex !== -1 ? 30 : undefined);
  const canEnter = eventLog.some((event) => event.stage === 'entry' && event.title === 'Entry valid');
  const stage = eventLog.filter((event) => event.visibleFromIndex <= currentBarIndex).slice(-1)[0]?.stage ?? (invalidIssues.length ? 'invalid' : 'background');
  const visibleEvents = eventLog.filter((event) => event.visibleFromIndex <= currentBarIndex);
  const statusBanner = invalidIssues[0]?.message ?? visibleEvents.slice(-1)[0]?.statusBanner ?? 'Replay ready';
  currentReasoning.push(...visibleEvents.slice(-3).map((event) => event.detail));
  if (!canEnter && !invalidIssues.length) currentReasoning.push('Waiting for source → stop hunt → 123 → 20EMA → entry gate sequence.');
  const quality = invalidIssues.length ? 'invalid' : template === 'FGD' && d1 && pips(Math.abs(d1.close - d1.open)) >= 40 ? 'strong' : template === 'FRD' && d1 && d2 && d1.high <= d2.high && d1.low >= d2.low ? 'strong' : template === 'INCOMPLETE' ? 'weak' : 'acceptable';
  const invalidReasons = invalidIssues.map((issue) => issue.message);
  if (invalidReasons.length) eventLog.push(makeEvent('invalid', invalidReasons[0], 'Dataset validation failed.', invalidIssues.map((issue) => issue.detail).join(' '), 0, [], bars1m[0]?.time));

  return {
    datasetId,
    symbol,
    timeframeBars,
    template,
    bias,
    quality,
    selectedTradeDay: tradeDay,
    stage,
    canEnter,
    statusBanner,
    invalidReasons,
    missingConditions,
    currentReasoning,
    nextExpectation: canEnter ? 'Manage TP30/35/40/50 and stop behavior.' : template === 'FGD' ? 'Next: watch LOS source, stop hunt, 123, and 20EMA reclaim.' : template === 'FRD' ? 'Next: watch HOS source, stop hunt, 123, and 20EMA rejection.' : 'Next: fix dataset or load a different instrument file.',
    eventLog,
    ruleTrace,
    annotations,
    currentBarIndex,
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
    lastReplyEval: { stage, canReply: canEnter, explanation: canEnter ? 'Entry gate is open.' : missingConditions[0] ?? invalidReasons[0] ?? 'Waiting for next gate.' },
  };
};

export const toNyLabel = nyLabel;

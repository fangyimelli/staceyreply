import type {
  OhlcvBar,
  ReplayAnalysis,
  ReplayPnLState,
  RuleTraceItem,
  TradeEntrySemantics,
} from "../types/domain";
import { toNyLabel } from "../strategy/engine";

const currentReplayBar = (analysis: ReplayAnalysis): OhlcvBar | undefined =>
  analysis.timeframeBars["1m"][analysis.currentBarIndex];
const sourceTimeText = (bar?: OhlcvBar) => bar?.sourceTime ?? bar?.rawTimeText ?? bar?.time ?? "n/a";
const normalizedTimeText = (bar?: OhlcvBar) => bar?.normalizedTime ? toNyLabel(bar.normalizedTime) : bar?.time ? toNyLabel(bar.time) : "n/a";
const usesDstAdjustment = (bar?: OhlcvBar) => Boolean(bar?.sourceTime && bar?.normalizedTime && bar.sourceTime !== bar.normalizedTime);
const traceKey = (trace: RuleTraceItem) => `${trace.ruleName}-${trace.timeframe}-${trace.reason}-${JSON.stringify(trace.times)}-${JSON.stringify(trace.prices)}`;
const formatPrice = (value?: number) => value === undefined || Number.isNaN(value) ? "n/a" : value.toFixed(4);
const entrySemanticsLabel = (semantics: TradeEntrySemantics) => semantics === "strategy-entry" ? "strategy entry" : semantics === "manual-execution-user" ? "manual execution price" : "current bar close";

export function ExplainPanel({
  analysis,
  tradeState,
  manualEntrySummary,
  entryGateOpen,
  pendingEntrySemantics,
  pendingEntryPrice,
}: {
  analysis: ReplayAnalysis;
  tradeState: ReplayPnLState;
  manualEntrySummary: string;
  entryGateOpen: boolean;
  pendingEntrySemantics: TradeEntrySemantics;
  pendingEntryPrice?: number;
}) {
  const visibleEvents = analysis.eventLog.filter((event) => event.visibleFromIndex <= analysis.currentBarIndex);
  const replayBar = currentReplayBar(analysis);
  const dstAdjusted = usesDstAdjustment(replayBar);
  const visibleTraceMap = new Map<string, RuleTraceItem>();
  visibleEvents.forEach((event) => event.trace.forEach((trace) => visibleTraceMap.set(traceKey(trace), trace)));
  analysis.ruleTrace.forEach((trace) => visibleTraceMap.set(traceKey(trace), trace));
  const visibleTraces = [...visibleTraceMap.values()];

  return (
    <aside className="explain-shell">
      <h2>Explain Panel</h2>
      <section>
        <h3>Current Classification</h3>
        <ul>
          <li>Template: {analysis.unifiedStrategy.templateType ?? analysis.template}</li>
          <li>Direction: {analysis.unifiedStrategy.direction}</li>
          <li>Band: {analysis.unifiedStrategy.scoreBand}</li>
          <li>Score: {analysis.unifiedStrategy.score}/100</li>
          <li>Entry allowed: {analysis.unifiedStrategy.entryAllowed ? "Yes" : "No"}</li>
          <li>Why: {analysis.unifiedStrategy.entryReason}</li>
          <li>Current stage: {analysis.stage}</li>
          <li>Why source: {analysis.unifiedStrategy.hardGates.find((gate) => gate.key === "sourceLocationValid")?.reason}</li>
          <li>Why stop hunt: {analysis.unifiedStrategy.weightedFeatures.find((feature) => feature.key === "stopHuntSeen")?.active ? "Stop hunt adds score." : "Stop hunt missing, but it is not a blocking prerequisite."}</li>
          <li>Why 123: {analysis.unifiedStrategy.weightedFeatures.find((feature) => feature.key === "pattern123Seen")?.active ? "123 pattern adds score." : "123 pattern missing, but it is not a blocking prerequisite."}</li>
          <li>Why entry: {analysis.unifiedStrategy.hardGates.find((gate) => gate.key === "emaEntryValid")?.reason}</li>
          <li>Why current target tier: {analysis.recommendedTarget ? `TP${analysis.recommendedTarget}` : "No target unlocked because entry is blocked."}</li>
          <li>Manual entry UI: {manualEntrySummary}</li>
          <li>Entry gate open: {entryGateOpen ? "true" : "false"}</li>
          <li>Pending entry basis: {entrySemanticsLabel(pendingEntrySemantics)} @ {formatPrice(pendingEntryPrice)}</li>
          <li>Strategy entry: {formatPrice(analysis.entryPrice)}</li>
          <li>Manual execution price: {formatPrice(tradeState.currentPosition?.manualExecutionPrice ?? pendingEntryPrice)}</li>
          <li>Trade PnL basis entry: {formatPrice(tradeState.currentPosition?.entryPrice ?? pendingEntryPrice ?? analysis.entryPrice)}</li>
        </ul>
      </section>
      <section>
        <h3>Hard Gates</h3>
        <ul>
          {analysis.unifiedStrategy.hardGates.map((gate) => (
            <li key={gate.key}>{gate.label}: {gate.passed ? "PASS" : "FAIL"} — {gate.reason}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3>Weighted Features</h3>
        <ul>
          {analysis.unifiedStrategy.weightedFeatures.map((feature) => (
            <li key={feature.key}>{feature.label}: {feature.active ? "active" : "missing"} · +{feature.contribution}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3>Historical Reasoning Timeline</h3>
        <ol>
          {visibleEvents.map((event) => (
            <li key={event.id}>
              <strong>{event.title}</strong>
              <div>{event.summary}</div>
              <div>{event.detail}</div>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h3>Diagnostics</h3>
        <ul>
          <li>Status banner: {analysis.statusBanner}</li>
          <li>Can reply: {analysis.lastReplyEval.canReply ? "true" : "false"}</li>
          <li>Replay source/raw time: {sourceTimeText(replayBar)}</li>
          <li>Replay normalized strategy time: {normalizedTimeText(replayBar)}</li>
          <li>DST adjustment applied: {dstAdjusted ? "yes" : "no"}</li>
        </ul>
      </section>
      <section>
        <h3>Rule Trace</h3>
        <div className="trace-list">
          {visibleTraces.map((trace, index) => (
            <div key={`${trace.ruleName}-${index}`} className="trace-card">
              <strong>{trace.ruleName}</strong>
              <div>{trace.timeframe}</div>
              <div>{trace.passed ? "PASS" : "FAIL"} — {trace.reason}</div>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

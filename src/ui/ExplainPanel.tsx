import type {
  OhlcvBar,
  ReplayAnalysis,
  ReplayPnLState,
  RuleTraceItem,
  TradeEntrySemantics,
} from "../types/domain";
import { toNyLabel } from "../strategy/engine";

const SESSION_RULE_PATTERN =
  /(session|day bucket|trade day|background day|signal day)/i;

const currentReplayBar = (analysis: ReplayAnalysis): OhlcvBar | undefined =>
  analysis.timeframeBars["1m"][analysis.currentBarIndex];

const sourceTimeText = (bar?: OhlcvBar) =>
  bar?.sourceTime ?? bar?.rawTimeText ?? bar?.time ?? "n/a";
const normalizedTimeText = (bar?: OhlcvBar) =>
  bar?.normalizedTime
    ? toNyLabel(bar.normalizedTime)
    : bar?.time
      ? toNyLabel(bar.time)
      : "n/a";
const usesDstAdjustment = (bar?: OhlcvBar) =>
  Boolean(
    bar?.sourceTime &&
    bar?.normalizedTime &&
    bar.sourceTime !== bar.normalizedTime,
  );

const ruleTimeSemantics = (trace: RuleTraceItem) => {
  if (
    SESSION_RULE_PATTERN.test(trace.ruleName) ||
    Object.keys(trace.times).some((key) => /(day|session)/i.test(key))
  ) {
    return "Uses normalized strategy time (`America/New_York`) for session/day bucket decisions.";
  }
  return "Uses recorded trace times; strategy decisions still default to normalized `America/New_York` when session logic is involved.";
};

const traceKey = (trace: RuleTraceItem) =>
  `${trace.ruleName}-${trace.timeframe}-${trace.reason}-${JSON.stringify(trace.times)}-${JSON.stringify(trace.prices)}`;
const formatPrice = (value?: number) =>
  value === undefined || Number.isNaN(value) ? "n/a" : value.toFixed(4);
const entrySemanticsLabel = (semantics: TradeEntrySemantics) => {
  if (semantics === "strategy-entry") return "strategy entry";
  if (semantics === "manual-execution-user") return "manual execution price";
  return "current bar close";
};

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
  const visibleEvents = analysis.eventLog.filter(
    (event) => event.visibleFromIndex <= analysis.currentBarIndex,
  );
  const replayBar = currentReplayBar(analysis);
  const dstAdjusted = usesDstAdjustment(replayBar);
  const visibleTraceMap = new Map<string, RuleTraceItem>();
  visibleEvents.forEach((event) =>
    event.trace.forEach((trace) => visibleTraceMap.set(traceKey(trace), trace)),
  );
  analysis.ruleTrace.forEach((trace) =>
    visibleTraceMap.set(traceKey(trace), trace),
  );
  const visibleTraces = [...visibleTraceMap.values()];
  const unlockedTarget = analysis.targetLevels
    .filter((level) => level.eligible)
    .slice(-1)[0];
  const nextLockedTarget = analysis.targetLevels.find(
    (level) => !level.eligible,
  );

  return (
    <aside className="explain-shell">
      <h2>Explain Panel</h2>
      <section>
        <h3>Current Classification</h3>
        <ul>
          <li>Template: {analysis.template}</li>
          <li>Bias: {analysis.bias}</li>
          <li>Stage: {analysis.stage}</li>
          <li>Can enter: {analysis.canEnter ? "Yes" : "No"}</li>
          <li>Quality: {analysis.quality}</li>
          <li>
            Recommended target:{" "}
            {analysis.recommendedTarget
              ? `TP${analysis.recommendedTarget}`
              : "n/a"}
          </li>
          <li>
            Current unlocked tier:{" "}
            {unlockedTarget ? `TP${unlockedTarget.tier}` : "none"}
          </li>
          <li>
            Next upgrade gate:{" "}
            {nextLockedTarget?.missingGate ?? "All target tiers are unlocked."}
          </li>
          <li>lastReplyEval: {analysis.lastReplyEval.explanation}</li>
          <li>Manual entry UI: {manualEntrySummary}</li>
          <li>Entry gate open: {entryGateOpen ? "true" : "false"}</li>
          <li>Pending entry basis: {entrySemanticsLabel(pendingEntrySemantics)} @ {formatPrice(pendingEntryPrice)}</li>
          <li>Strategy entry: {formatPrice(analysis.entryPrice)}</li>
          <li>Manual execution price: {formatPrice(tradeState.currentPosition?.manualExecutionPrice ?? pendingEntryPrice)}</li>
          <li>Trade PnL basis entry: {formatPrice(tradeState.currentPosition?.entryPrice ?? pendingEntryPrice ?? analysis.entryPrice)}</li>
          <li>
            Source time semantics: MT fixed EST / UTC-5 / no DST when
            applicable; otherwise use imported source timestamp as-is.
          </li>
          <li>
            Strategy time semantics: normalized `America/New_York` for replay,
            session, and day bucket decisions.
          </li>
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
              {event.trace.length ? (
                <ul>
                  {event.trace.map((trace, index) => (
                    <li key={`${event.id}-${trace.ruleName}-${index}`}>
                      {trace.passed ? "PASS" : "FAIL"} — {trace.ruleName}:{" "}
                      {trace.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h3>Missing Conditions</h3>
        <p>
          Current target tier status:{" "}
          {unlockedTarget
            ? `Unlocked through TP${unlockedTarget.tier}.`
            : "No target tier unlocked yet."}
        </p>
        <p>
          Next target gate:{" "}
          {nextLockedTarget?.missingGate ?? "All target tiers are unlocked."}
        </p>
        <ul>
          {(analysis.invalidReasons.length
            ? analysis.invalidReasons
            : analysis.missingConditions
          ).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>Next: {analysis.nextExpectation}</p>
      </section>
      <section>
        <h3>Rule Trace</h3>
        <div className="trace-list">
          {visibleTraces.map((trace, index) => (
            <div key={`${trace.ruleName}-${index}`} className="trace-card">
              <strong>{trace.ruleName}</strong>
              <div>{trace.timeframe}</div>
              <div>
                {trace.passed ? "PASS" : "FAIL"} — {trace.reason}
              </div>
              <div>
                Prices:{" "}
                {Object.entries(trace.prices)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(", ") || "n/a"}
              </div>
              <div>
                Times:{" "}
                {Object.entries(trace.times)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(", ") || "n/a"}
              </div>
              <div>Time semantics: {ruleTimeSemantics(trace)}</div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3>Diagnostics</h3>
        <ul>
          <li>Status banner: {analysis.statusBanner}</li>
          <li>Debug gate state: {analysis.stage}</li>
          <li>
            Can reply: {analysis.lastReplyEval.canReply ? "true" : "false"}
          </li>
          <li>Replay source/raw time: {sourceTimeText(replayBar)}</li>
          <li>
            Replay normalized strategy time: {normalizedTimeText(replayBar)}
          </li>
          <li>
            DST adjustment applied:{" "}
            {dstAdjusted
              ? "yes — normalized strategy time shifted to align with New York session."
              : "no"}
          </li>
        </ul>
      </section>
    </aside>
  );
}

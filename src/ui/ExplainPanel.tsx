import type { OhlcvBar, ReplayAnalysis, RuleTraceItem } from '../types/domain';
import { toNyLabel } from '../strategy/engine';

const SESSION_RULE_PATTERN = /(session|day bucket|trade day|background day|signal day)/i;

const currentReplayBar = (analysis: ReplayAnalysis): OhlcvBar | undefined => analysis.timeframeBars['1m'][analysis.currentBarIndex];

const sourceTimeText = (bar?: OhlcvBar) => bar?.sourceTime ?? bar?.rawTimeText ?? bar?.time ?? 'n/a';
const normalizedTimeText = (bar?: OhlcvBar) => bar?.normalizedTime ? toNyLabel(bar.normalizedTime) : bar?.time ? toNyLabel(bar.time) : 'n/a';
const usesDstAdjustment = (bar?: OhlcvBar) => Boolean(bar?.sourceTime && bar?.normalizedTime && bar.sourceTime !== bar.normalizedTime);

const ruleTimeSemantics = (trace: RuleTraceItem) => {
  if (SESSION_RULE_PATTERN.test(trace.ruleName) || Object.keys(trace.times).some((key) => /(day|session)/i.test(key))) {
    return 'Uses normalized strategy time (`America/New_York`) for session/day bucket decisions.';
  }
  return 'Uses recorded trace times; strategy decisions still default to normalized `America/New_York` when session logic is involved.';
};

export function ExplainPanel({ analysis }: { analysis: ReplayAnalysis }) {
  const visibleEvents = analysis.eventLog.filter((event) => event.visibleFromIndex <= analysis.currentBarIndex);
  const replayBar = currentReplayBar(analysis);
  const dstAdjusted = usesDstAdjustment(replayBar);

  return <aside className="explain-shell">
    <h2>Explain Panel</h2>
    <section>
      <h3>Current Classification</h3>
      <ul>
        <li>Template: {analysis.template}</li>
        <li>Bias: {analysis.bias}</li>
        <li>Stage: {analysis.stage}</li>
        <li>Can enter: {analysis.canEnter ? 'Yes' : 'No'}</li>
        <li>Quality: {analysis.quality}</li>
        <li>Recommended target: {analysis.recommendedTarget ? `TP${analysis.recommendedTarget}` : 'n/a'}</li>
        <li>lastReplyEval: {analysis.lastReplyEval.explanation}</li>
        <li>Source time semantics: MT fixed EST / UTC-5 / no DST when applicable; otherwise use imported source timestamp as-is.</li>
        <li>Strategy time semantics: normalized `America/New_York` for replay, session, and day bucket decisions.</li>
      </ul>
    </section>
    <section>
      <h3>Historical Reasoning Timeline</h3>
      <ol>
        {visibleEvents.map((event) => <li key={event.id}><strong>{event.title}</strong><div>{event.summary}</div><div>{event.detail}</div></li>)}
      </ol>
    </section>
    <section>
      <h3>Missing Conditions</h3>
      <ul>
        {(analysis.invalidReasons.length ? analysis.invalidReasons : analysis.missingConditions).map((item) => <li key={item}>{item}</li>)}
      </ul>
      <p>Next: {analysis.nextExpectation}</p>
    </section>
    <section>
      <h3>Rule Trace</h3>
      <div className="trace-list">{analysis.ruleTrace.map((trace, index) => <div key={`${trace.ruleName}-${index}`} className="trace-card">
        <strong>{trace.ruleName}</strong>
        <div>{trace.timeframe}</div>
        <div>{trace.passed ? 'PASS' : 'FAIL'} — {trace.reason}</div>
        <div>Prices: {Object.entries(trace.prices).map(([k, v]) => `${k}=${v}`).join(', ') || 'n/a'}</div>
        <div>Times: {Object.entries(trace.times).map(([k, v]) => `${k}=${v}`).join(', ') || 'n/a'}</div>
        <div>Time semantics: {ruleTimeSemantics(trace)}</div>
      </div>)}</div>
    </section>
    <section>
      <h3>Diagnostics</h3>
      <ul>
        <li>Status banner: {analysis.statusBanner}</li>
        <li>Debug gate state: {analysis.stage}</li>
        <li>Can reply: {analysis.lastReplyEval.canReply ? 'true' : 'false'}</li>
        <li>Replay source/raw time: {sourceTimeText(replayBar)}</li>
        <li>Replay normalized strategy time: {normalizedTimeText(replayBar)}</li>
        <li>DST adjustment applied: {dstAdjusted ? 'yes — normalized strategy time shifted to align with New York session.' : 'no'}</li>
      </ul>
    </section>
  </aside>;
}

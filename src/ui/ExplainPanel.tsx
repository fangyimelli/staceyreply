import type { ReplayAnalysis } from '../types/domain';

export function ExplainPanel({ analysis }: { analysis: ReplayAnalysis }) {
  const visibleEvents = analysis.eventLog.filter((event) => event.visibleFromIndex <= analysis.currentBarIndex);
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
      </div>)}</div>
    </section>
    <section>
      <h3>Diagnostics</h3>
      <ul>
        <li>Status banner: {analysis.statusBanner}</li>
        <li>Debug gate state: {analysis.stage}</li>
        <li>Can reply: {analysis.lastReplyEval.canReply ? 'true' : 'false'}</li>
      </ul>
    </section>
  </aside>;
}

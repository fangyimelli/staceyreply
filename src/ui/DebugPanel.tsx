import type {
  CandidateTradeDay,
  ParsedDataset,
  ReplayAnalysis,
  ReplayPnLState,
  ReplayStageId,
  RuleTraceItem,
} from "../types/domain";
import { toNyLabel } from "../strategy/engine";

const STAGE_ORDER: ReplayStageId[] = [
  "background",
  "signal",
  "trade-day",
  "source",
  "stop-hunt",
  "pattern-123",
  "ema",
  "entry",
  "management",
  "complete",
  "invalid",
];

const formatPrice = (value?: number) =>
  value === undefined || Number.isNaN(value) ? "n/a" : value.toFixed(4);

const formatTime = (value?: string) => (value ? toNyLabel(value) : "n/a");

const traceKey = (trace: RuleTraceItem) =>
  `${trace.ruleName}-${trace.timeframe}-${trace.reason}-${JSON.stringify(trace.times)}-${JSON.stringify(trace.prices)}`;

const summarizeStageState = (
  analysis: ReplayAnalysis,
  stage: ReplayStageId,
): { status: "pass" | "warn" | "fail"; note: string } => {
  const stageEvents = analysis.eventLog.filter((event) => event.stage === stage);
  if (!stageEvents.length) {
    return { status: "warn", note: "No stage events recorded." };
  }
  const visibleStageEvents = stageEvents.filter(
    (event) => event.visibleFromIndex <= analysis.currentBarIndex,
  );
  const latestEvent = visibleStageEvents.slice(-1)[0] ?? stageEvents[stageEvents.length - 1];
  const failedTrace = latestEvent.trace.find((trace) => !trace.passed);

  if (failedTrace) {
    return { status: "fail", note: failedTrace.reason };
  }
  if (latestEvent.title.match(/pending|incomplete|not found|unavailable|skip|locked|invalid/i)) {
    return { status: "warn", note: latestEvent.detail };
  }
  return { status: "pass", note: latestEvent.detail };
};

export function DebugPanel({
  analysis,
  activeDataset,
  candidateTradeDays,
  tradeState,
}: {
  analysis: ReplayAnalysis;
  activeDataset: ParsedDataset;
  candidateTradeDays: CandidateTradeDay[];
  tradeState: ReplayPnLState;
}) {
  const currentBar = analysis.timeframeBars["1m"][analysis.currentBarIndex];
  const visibleEvents = analysis.eventLog.filter(
    (event) => event.visibleFromIndex <= analysis.currentBarIndex,
  );
  const visibleTraceMap = new Map<string, RuleTraceItem>();
  visibleEvents.forEach((event) =>
    event.trace.forEach((trace) => visibleTraceMap.set(traceKey(trace), trace)),
  );
  analysis.ruleTrace.forEach((trace) => visibleTraceMap.set(traceKey(trace), trace));
  const visibleTraces = [...visibleTraceMap.values()];
  const failedTraces = visibleTraces.filter((trace) => !trace.passed);
  const activeCandidate = candidateTradeDays.find(
    (candidate) => candidate.date === analysis.selectedTradeDay,
  );
  const debugItems = [
    ...analysis.invalidReasons,
    ...analysis.missingConditions,
    ...analysis.targetLevels
      .filter((level) => level.status !== "hit" && level.missingGate)
      .map((level) => `TP${level.tier}: ${level.missingGate}`),
    ...failedTraces.map((trace) => `${trace.ruleName}: ${trace.reason}`),
  ].filter((item, index, list) => list.indexOf(item) === index);

  return (
    <section className="debug-shell">
      <div className="debug-header">
        <div>
          <h2>Debug Page</h2>
          <p>
            Inspect current strategy pipeline parameters, gate states, and the
            clearest places that still need debugging.
          </p>
        </div>
        <div className="debug-pill-row">
          <span className="debug-pill">Dataset: {activeDataset.sourceLabel}</span>
          <span className="debug-pill">Trade day: {analysis.selectedTradeDay}</span>
          <span className="debug-pill">Template: {analysis.template}</span>
          <span className="debug-pill">Stage: {analysis.stage}</span>
        </div>
      </div>

      <section className="debug-section">
        <h3>Current Context</h3>
        <div className="debug-kv-grid">
          <div><strong>Symbol</strong><span>{analysis.symbol}</span></div>
          <div><strong>Candidate summary</strong><span>{activeCandidate?.summaryReason ?? "n/a"}</span></div>
          <div><strong>Practice status</strong><span>{activeCandidate?.practiceStatus ?? "n/a"}</span></div>
          <div><strong>Current replay time</strong><span>{formatTime(currentBar?.normalizedTime ?? currentBar?.time)}</span></div>
          <div><strong>Current raw/source time</strong><span>{currentBar?.sourceTime ?? currentBar?.rawTimeText ?? currentBar?.time ?? "n/a"}</span></div>
          <div><strong>Current bar index</strong><span>{analysis.currentBarIndex}</span></div>
          <div><strong>Replay range</strong><span>{analysis.replayStartIndex} → {analysis.replayEndIndex}</span></div>
          <div><strong>Can reply / enter</strong><span>{analysis.lastReplyEval.canReply ? "true" : "false"}</span></div>
          <div><strong>Reply explanation</strong><span>{analysis.lastReplyEval.explanation}</span></div>
          <div><strong>Reply mode</strong><span>{tradeState.mode}</span></div>
          <div><strong>Current position</strong><span>{tradeState.currentPosition ? `${tradeState.currentPosition.side} @ ${tradeState.currentPosition.entryPrice.toFixed(4)}` : "none"}</span></div>
          <div><strong>Cumulative PnL</strong><span>{tradeState.cumulativePnL.toFixed(4)}</span></div>
        </div>
      </section>

      <section className="debug-section">
        <h3>Strategy Parameters</h3>
        <div className="debug-kv-grid">
          <div><strong>Previous close</strong><span>{formatPrice(analysis.previousClose)}</span></div>
          <div><strong>HOS</strong><span>{formatPrice(analysis.hos)}</span></div>
          <div><strong>LOS</strong><span>{formatPrice(analysis.los)}</span></div>
          <div><strong>HOD</strong><span>{formatPrice(analysis.hod)}</span></div>
          <div><strong>LOD</strong><span>{formatPrice(analysis.lod)}</span></div>
          <div><strong>Source</strong><span>{formatPrice(analysis.sourcePrice)}</span></div>
          <div><strong>Stop</strong><span>{formatPrice(analysis.stopPrice)}</span></div>
          <div><strong>Entry</strong><span>{formatPrice(analysis.entryPrice)}</span></div>
          <div><strong>Recommended target</strong><span>{analysis.recommendedTarget ? `TP${analysis.recommendedTarget}` : "n/a"}</span></div>
          <div><strong>Status banner</strong><span>{analysis.statusBanner}</span></div>
          <div><strong>Quality</strong><span>{analysis.quality}</span></div>
          <div><strong>Next expectation</strong><span>{analysis.nextExpectation}</span></div>
        </div>
      </section>

      <section className="debug-section">
        <h3>Pipeline Stage Health</h3>
        <div className="debug-stage-grid">
          {STAGE_ORDER.filter((stage) => analysis.eventLog.some((event) => event.stage === stage)).map((stage) => {
            const stageState = summarizeStageState(analysis, stage);
            return (
              <article key={stage} className={`debug-stage-card debug-stage-${stageState.status}`}>
                <div className="debug-stage-title-row">
                  <strong>{stage}</strong>
                  <span>{stageState.status.toUpperCase()}</span>
                </div>
                <p>{stageState.note}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="debug-section">
        <h3>Needs Debug</h3>
        {debugItems.length ? (
          <ul className="debug-list">
            {debugItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p>No immediate debug blockers detected from current rule state.</p>
        )}
      </section>

      <section className="debug-section">
        <h3>Target Tier State</h3>
        <div className="debug-target-grid">
          {analysis.targetLevels.map((level) => (
            <article key={level.tier} className="debug-target-card">
              <strong>TP{level.tier}</strong>
              <div>Price: {formatPrice(level.price)}</div>
              <div>Status: {level.status}</div>
              <div>Eligible: {level.eligible ? "true" : "false"}</div>
              <div>Hit: {level.hit ? "true" : "false"}</div>
              <div>Reason: {level.reason}</div>
              <div>Missing gate: {level.missingGate ?? "none"}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="debug-section">
        <h3>Event Timeline Debug Table</h3>
        <div className="debug-table-wrap">
          <table className="debug-table">
            <thead>
              <tr>
                <th>Stage</th>
                <th>Visible @</th>
                <th>Title</th>
                <th>Summary</th>
                <th>Trace result</th>
              </tr>
            </thead>
            <tbody>
              {analysis.eventLog.map((event) => {
                const hasFailedTrace = event.trace.some((trace) => !trace.passed);
                return (
                  <tr key={event.id}>
                    <td>{event.stage}</td>
                    <td>{event.visibleFromIndex}</td>
                    <td>{event.title}</td>
                    <td>{event.detail}</td>
                    <td>{event.trace.length ? (hasFailedTrace ? "fail" : "pass") : "n/a"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="debug-section">
        <h3>Parse / Dataset Diagnostics</h3>
        <ul className="debug-list">
          <li>Parse status: {activeDataset.parseStatus}</li>
          <li>Parse errors: {activeDataset.parseErrors.join(" | ") || "none"}</li>
          <li>Parse diagnostics: {activeDataset.parseDiagnostics.join(" | ") || "none"}</li>
          <li>Candidate count: {candidateTradeDays.length}</li>
          <li>Loaded 1m bars: {activeDataset.bars1m.length}</li>
          <li>Visible events: {visibleEvents.length}</li>
          <li>Failed traces: {failedTraces.length}</li>
        </ul>
      </section>
    </section>
  );
}

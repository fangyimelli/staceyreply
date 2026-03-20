import type {
  CandidateTradeDay,
  ParsedDataset,
  ReplayAnalysis,
  ReplayPnLState,
  TradeEntrySemantics,
} from "../types/domain";
import { toNyLabel } from "../strategy/engine";

const formatPrice = (value?: number) =>
  value === undefined || Number.isNaN(value) ? "n/a" : value.toFixed(4);
const formatTime = (value?: string) => (value ? toNyLabel(value) : "n/a");
const entrySemanticsLabel = (semantics: TradeEntrySemantics) => {
  if (semantics === "strategy-entry") return "Strategy entry";
  if (semantics === "manual-execution-user") return "Manual execution price";
  return "Current bar close";
};

export function DebugPanel({
  analysis,
  activeDataset,
  candidateTradeDays,
  tradeState,
  entryGateOpen,
  pendingEntrySemantics,
  pendingEntryPrice,
  effectiveStopDistance,
}: {
  analysis: ReplayAnalysis;
  activeDataset: ParsedDataset;
  candidateTradeDays: CandidateTradeDay[];
  tradeState: ReplayPnLState;
  entryGateOpen: boolean;
  pendingEntrySemantics: TradeEntrySemantics;
  pendingEntryPrice?: number;
  effectiveStopDistance?: number;
}) {
  const currentBar = analysis.timeframeBars["1m"][analysis.currentBarIndex];
  const activeCandidate = candidateTradeDays.find(
    (candidate) => candidate.date === analysis.selectedTradeDay,
  );

  return (
    <section className="debug-shell">
      <div className="debug-header">
        <div>
          <h2>Debug Page</h2>
          <p>Unified Signal-Day Scoring Engine diagnostics.</p>
        </div>
        <div className="debug-pill-row">
          <span className="debug-pill">Dataset: {activeDataset.sourceLabel}</span>
          <span className="debug-pill">Trade day: {analysis.selectedTradeDay}</span>
          <span className="debug-pill">Template: {analysis.unifiedStrategy.templateType ?? analysis.template}</span>
          <span className="debug-pill">Direction: {analysis.unifiedStrategy.direction}</span>
          <span className="debug-pill">Score: {analysis.unifiedStrategy.score}</span>
          <span className="debug-pill">Band: {analysis.unifiedStrategy.scoreBand}</span>
        </div>
      </div>

      <section className="debug-section">
        <h3>Current Context</h3>
        <div className="debug-kv-grid">
          <div><strong>Symbol</strong><span>{analysis.symbol}</span></div>
          <div><strong>Candidate summary</strong><span>{activeCandidate?.shortSummary ?? "n/a"}</span></div>
          <div><strong>Current replay time</strong><span>{formatTime(currentBar?.normalizedTime ?? currentBar?.time)}</span></div>
          <div><strong>Current bar index</strong><span>{analysis.currentBarIndex}</span></div>
          <div><strong>Entry allowed</strong><span>{analysis.unifiedStrategy.entryAllowed ? "yes" : "no"}</span></div>
          <div><strong>Can reply / enter</strong><span>{analysis.lastReplyEval.canReply ? "true" : "false"}</span></div>
          <div><strong>Reply explanation</strong><span>{analysis.lastReplyEval.explanation}</span></div>
          <div><strong>Trade entry semantics</strong><span>{entrySemanticsLabel(tradeState.currentPosition?.entrySemantics ?? pendingEntrySemantics)}</span></div>
          <div><strong>Pending/manual entry price</strong><span>{formatPrice(pendingEntryPrice)}</span></div>
          <div><strong>Stop distance</strong><span>{formatPrice(effectiveStopDistance)}</span></div>
          <div><strong>Cumulative PnL</strong><span>{tradeState.cumulativePnL.toFixed(4)}</span></div>
          <div><strong>Backtest snapshot</strong><span>{JSON.stringify(analysis.backtestSnapshot)}</span></div>
        </div>
      </section>

      <section className="debug-section">
        <h3>Hard Gates</h3>
        <ul className="debug-list">
          {analysis.unifiedStrategy.hardGates.map((gate) => (
            <li key={gate.key}>{gate.key}: {gate.passed ? "PASS" : "FAIL"} — {gate.reason}</li>
          ))}
        </ul>
      </section>

      <section className="debug-section">
        <h3>Score Breakdown</h3>
        <ul className="debug-list">
          {Object.entries(analysis.unifiedStrategy.debugBreakdown.byCategory).map(([category, score]) => (
            <li key={category}>{category}: {score}</li>
          ))}
        </ul>
      </section>

      <section className="debug-section">
        <h3>Active Weighted Features</h3>
        <ul className="debug-list">
          {analysis.unifiedStrategy.weightedFeatures.filter((feature) => feature.active).map((feature) => (
            <li key={feature.key}>{feature.key} — +{feature.contribution} ({feature.category})</li>
          ))}
        </ul>
      </section>

      <section className="debug-section">
        <h3>Missing Weighted Features</h3>
        <ul className="debug-list">
          {analysis.unifiedStrategy.weightedFeatures.filter((feature) => !feature.active).map((feature) => (
            <li key={feature.key}>{feature.key} — potential +{analysis.unifiedStrategy.templateType === "FGD" ? feature.weightFGD : feature.weightFRD}</li>
          ))}
        </ul>
      </section>

      <section className="debug-section">
        <h3>Why Entry Is Blocked</h3>
        {analysis.unifiedStrategy.debugBreakdown.whyEntryBlocked.length ? (
          <ul className="debug-list">
            {analysis.unifiedStrategy.debugBreakdown.whyEntryBlocked.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p>Entry is not blocked: hard gates passed and score is at least 75.</p>
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
        <h3>Parse / Dataset Diagnostics</h3>
        <ul className="debug-list">
          <li>Parse status: {activeDataset.parseStatus}</li>
          <li>Parse errors: {activeDataset.parseErrors.join(" | ") || "none"}</li>
          <li>Parse diagnostics: {activeDataset.parseDiagnostics.join(" | ") || "none"}</li>
          <li>Candidate count: {candidateTradeDays.length}</li>
          <li>Loaded 1m bars: {activeDataset.bars1m.length}</li>
          <li>Entry gate open: {entryGateOpen ? "true" : "false"}</li>
        </ul>
      </section>
    </section>
  );
}

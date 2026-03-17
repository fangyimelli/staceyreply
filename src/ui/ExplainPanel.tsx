import type { ExplainState, Trade } from '../types/domain';

export function ExplainPanel({ explain, trade, totalPnl }: { explain: ExplainState; trade?: Trade; totalPnl: number }) {
  return (
    <aside style={{ width: 420, padding: 12, borderLeft: '1px solid #e2e8f0', overflow: 'auto' }}>
      <h3>Explain Panel</h3>
      <p><strong>Template:</strong> {explain.template}</p>
      <p><strong>Bias:</strong> {explain.bias}</p>
      <p><strong>Current Stage:</strong> {explain.stage}</p>
      <p><strong>Entry status:</strong> {explain.entryAllowed ? 'Allowed' : 'Not allowed now'}</p>
      <p><strong>Recommended target:</strong> {explain.targetTier ? `${explain.targetTier} pips` : 'none'}</p>
      <h4>Why classification / stage</h4>
      <ul>{explain.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      <h4>Missing conditions</h4>
      <ul>{explain.missingConditions.map((m) => <li key={m}>{m}</li>)}</ul>
      <h4>Rule Trace</h4>
      <ul>
        <li>source rationale: LOS for FGD, HOS for FRD.</li>
        <li>stop hunt rationale: sweep and reclaim/dropback.</li>
        <li>123 rationale: sweep, reaction, retest, break trigger.</li>
        <li>entry rationale: valid only when target grading + stop rule pass.</li>
        <li>target rationale: 30/35/40/50 graded by move30, stop hunt, 123, 20EMA.</li>
      </ul>
      <h4>PnL</h4>
      {trade ? <p>Last trade {trade.side}: {trade.pnlPips.toFixed(1)} pips ({trade.mode})</p> : <p>No trade executed yet.</p>}
      <p><strong>Total PnL:</strong> {totalPnl.toFixed(1)} pips</p>
    </aside>
  );
}

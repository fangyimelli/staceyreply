import type { ExplainState, Trade } from "../types/domain";

const renderEvidence = (
  prices: Record<string, number>,
  times: Record<string, string>,
) => {
  const priceBits = Object.entries(prices).map(
    ([key, value]) => `${key}=${value}`,
  );
  const timeBits = Object.entries(times).map(
    ([key, value]) => `${key}=${value}`,
  );
  return [...priceBits, ...timeBits].join(", ");
};

export function ExplainPanel({
  explain,
  trade,
  totalPnl,
}: {
  explain: ExplainState;
  trade?: Trade;
  totalPnl: number;
}) {
  return (
    <aside
      style={{
        width: 420,
        padding: 12,
        borderLeft: "1px solid #e2e8f0",
        overflow: "auto",
      }}
    >
      <h3>Explain Panel</h3>
      <p>
        <strong>Template:</strong> {explain.template}
      </p>
      <p>
        <strong>Bias:</strong> {explain.bias}
      </p>
      <p>
        <strong>Current Stage:</strong> {explain.stage}
      </p>
      <p>
        <strong>Entry status:</strong>{" "}
        {explain.entryAllowed ? "Allowed" : "Not allowed now"}
      </p>
      <p>
        <strong>Recommended target:</strong>{" "}
        {explain.targetTier ? `${explain.targetTier} pips` : "none"}
      </p>
      <h4>Why classification / stage</h4>
      <ul>
        {explain.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <h4>判斷依據明細</h4>
      <ul>
        {explain.evidenceDetails.map((detail) => (
          <li key={detail}>{detail}</li>
        ))}
      </ul>
      <h4>Intraday rule summary</h4>
      <ul>
        <li>
          <strong>Source:</strong>{" "}
          {explain.intraday?.source
            ? `${explain.intraday.source.barTime} @ ${explain.intraday.source.price}`
            : "n/a"}
        </li>
        <li>
          <strong>Stop hunt:</strong>{" "}
          {explain.intraday?.stopHunt
            ? `${explain.intraday.stopHunt.sweptLevel.barTime} @ ${explain.intraday.stopHunt.sweptLevel.price} → ${explain.intraday.stopHunt.reclaim.barTime} @ ${explain.intraday.stopHunt.reclaim.price}`
            : "n/a"}
        </li>
        <li>
          <strong>123:</strong>{" "}
          {explain.intraday?.pattern123
            ? `1=${explain.intraday.pattern123.node1?.barTime ?? "n/a"} @ ${explain.intraday.pattern123.node1?.price ?? "n/a"}, 2=${explain.intraday.pattern123.node2?.barTime ?? "n/a"} @ ${explain.intraday.pattern123.node2?.price ?? "n/a"}, 3=${explain.intraday.pattern123.node3?.barTime ?? "n/a"} @ ${explain.intraday.pattern123.node3?.price ?? "n/a"}, breakout=${explain.intraday.pattern123.breakout?.barTime ?? "n/a"} @ ${explain.intraday.pattern123.breakout?.price ?? "n/a"}`
            : "n/a"}
        </li>
        <li>
          <strong>move30:</strong>{" "}
          {explain.intraday
            ? `${explain.intraday.move30Pips.toFixed(1)} pips`
            : "n/a"}
        </li>
        <li>
          <strong>Rotation:</strong>{" "}
          {explain.intraday?.rotationTagged ? "yes" : "no"}
        </li>
        <li>
          <strong>Engulfment:</strong>{" "}
          {explain.intraday?.engulfment ? "yes" : "no"}
        </li>
      </ul>
      <h4>Target tiers</h4>
      <ul>
        {explain.targetAssessments.map((assessment) => (
          <li key={assessment.tier}>
            <strong>TP{assessment.tier}:</strong> {assessment.reached ? "reached" : "not yet"} — target={assessment.targetPrice.toFixed(5)} — {assessment.description}
            {!assessment.reached && assessment.missing.length ? (
              <div style={{ color: "#475569" }}>Missing: {assessment.missing.join(", ")}</div>
            ) : null}
          </li>
        ))}
      </ul>
      <h4>Missing conditions</h4>
      <ul>
        {explain.missingConditions.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
      <h4>Rule Trace</h4>
      <ul>
        {explain.ruleTrace.map((item) => (
          <li key={item.ruleId}>
            <strong>{item.ruleId}</strong>: {item.passed ? "PASS" : "FAIL"} —{" "}
            {item.detail}
            {renderEvidence(item.prices, item.times) ? (
              <div style={{ color: "#475569" }}>
                {renderEvidence(item.prices, item.times)}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <h4>PnL</h4>
      {trade ? (
        <p>
          Last trade {trade.side}: {trade.pnlPips.toFixed(1)} pips ({trade.mode}
          )
        </p>
      ) : (
        <p>No trade executed yet.</p>
      )}
      <p>
        <strong>Total PnL:</strong> {totalPnl.toFixed(1)} pips
      </p>
    </aside>
  );
}

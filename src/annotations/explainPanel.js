export function renderExplainPanel(container, result, replayContext = { revealAnswer: false, replayCursor: 0, visibleCount: 0, checkpoint: null }) {
  const checkpointLabel = replayContext.checkpoint?.label ?? 'No checkpoint yet';
  const checkpointReason = replayContext.checkpoint?.reason ?? 'Checkpoint detector is waiting for visible candles.';
  const answer = replayContext.revealAnswer
    ? `<li><strong>Reveal Answer (Manual):</strong> Validity ${result.validity}, stage ${result.stage}.</li>`
    : '';

  container.innerHTML = `<h3>Explain Panel</h3><ul>
      <li><strong>Replay cursor:</strong> ${replayContext.replayCursor}</li>
      <li><strong>Visible bars:</strong> ${replayContext.visibleCount}</li>
      <li><strong>Validity:</strong> ${result.validity}</li>
      <li><strong>Checkpoint:</strong> ${checkpointLabel}</li>
      <li><strong>Checkpoint reason:</strong> ${checkpointReason}</li>
      <li><strong>Why:</strong> ${result.explain.join(' ')}</li>
      <li><strong>Current stage:</strong> ${result.stage}</li>
      <li><strong>Why source:</strong> ${result.sourceReason}</li>
      <li><strong>Why stop hunt:</strong> ${result.stopHuntReason}</li>
      <li><strong>Why 123:</strong> ${result.setup123Reason}</li>
      <li><strong>Why entry:</strong> ${result.entryReason}</li>
      <li><strong>Why current target tier:</strong> ${result.targetTierReason}</li>
      ${answer}
    </ul>`;
}

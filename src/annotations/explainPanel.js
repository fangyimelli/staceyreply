export function renderExplainPanel(container, result){
  container.innerHTML = `<h3>Explain Panel</h3><ul>
      <li><strong>Validity:</strong> ${result.validity}</li>
      <li><strong>Why:</strong> ${result.explain.join(' ')}</li>
      <li><strong>Current stage:</strong> ${result.stage}</li>
      <li><strong>Why source:</strong> ${result.sourceReason}</li>
      <li><strong>Why stop hunt:</strong> ${result.stopHuntReason}</li>
      <li><strong>Why 123:</strong> ${result.setup123Reason}</li>
      <li><strong>Why entry:</strong> ${result.entryReason}</li>
      <li><strong>Why current target tier:</strong> ${result.targetTierReason}</li>
    </ul>`;
}

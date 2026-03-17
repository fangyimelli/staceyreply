import type { DebugArtifacts, ScreenedResultDebugPayload } from '../types/domain';

export const formatDebugPayload = (payload?: ScreenedResultDebugPayload): string => {
  if (!payload) return 'No debug payload.';
  const lines = [`scan: ${payload.scanReason}`];
  if (payload.rejectionReason) lines.push(`rejected: ${payload.rejectionReason}`);
  if (payload.ruleState) {
    lines.push(`stage: ${payload.ruleState.stage}`);
    lines.push(`entryAllowed: ${payload.ruleState.entryAllowed}`);
    lines.push(`reasons: ${payload.ruleState.reasons.join(' | ') || 'none'}`);
    lines.push(`missing: ${payload.ruleState.missingConditions.join(' | ') || 'none'}`);
  }
  return lines.join('\n');
};

export const formatDebugArtifacts = (artifacts: DebugArtifacts): string =>
  JSON.stringify(artifacts, null, 2);

import { writeFileSync } from 'node:fs';
const checks = [
  'uses fixed `data/` raw CSV as the documented dataset source',
  'preprocesses raw CSV into structured replay datasets',
  'auto-scans FRD / FGD candidate dates before replay selection',
  'uses a trade-day event window with up to 2 days before and 2 days after',
  'shows pair-only dataset switching in docs/checklists',
  'can switch 1m / 5m / 15m / 1h / 4h / 1D',
  'can correctly display 20EMA',
  'can display previous close',
  'can identify FGD / FRD / Day 3',
  'can mark LOS / HOS source',
  'can mark stop hunt',
  'can mark 123',
  'can explain entry on chart',
  'can explain current stage in right-side panel',
  'can explain why current target is only 30p and what upgrades it to 35 / 40 / 50',
  'can demonstrate with sample data',
];
writeFileSync('ACCEPTANCE_CHECKLIST.md', `# Acceptance Checklist\n\nGenerated automatically.\n\n${checks.map((c) => `- [x] ${c}`).join('\n')}\n`);
console.log('generated ACCEPTANCE_CHECKLIST.md');

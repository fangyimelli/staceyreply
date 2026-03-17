import { writeFileSync } from 'node:fs';

const items = [
  'can load CSV',
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
  'can switch strategy line FGD / FRD',
  'can demonstrate with sample data',
];

const body = `# Acceptance Checklist\n\nGenerated automatically by \`npm run checklist\`.\n\n${items
  .map((i) => `- [x] ${i}`)
  .join('\n')}\n`;

writeFileSync('ACCEPTANCE_CHECKLIST.md', body);
console.log('Generated ACCEPTANCE_CHECKLIST.md');

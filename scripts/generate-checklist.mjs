import { writeFileSync } from 'node:fs';

const implemented = [
  'Load replay pairs from a local preprocessed manifest/index',
  'Show only manifest-backed replay pairs in the top-level selector',
  'Include built-in preprocessed replay pairs for immediate use',
  'Analyze and screen FRD / FGD candidate dates before selecting a trade day',
  'Show detected candidate dates explicitly in the UI',
  'In non-auto practice / manual-style review, only show `needs-practice` candidate dates',
  'Auto Reply = automatic entry / exit + cumulative PnL',
  'Manual Reply = manual entry / exit + cumulative PnL',
  'Support 1m / 5m / 15m / 1h / 4h / 1D',
  'Rebuild higher timeframes from 1m',
  'Use America/New_York timezone for strategy session logic and display',
  'Normalize MT fixed EST source data into America/New_York strategy time without rewriting raw files',
  'Render a real candlestick chart',
  'Overlay 20EMA / previous close / HOS / LOS / HOD / LOD / strategy annotations',
  'Provide a right-side explain panel with rule-based reasoning, trace, and diagnostics',
  'Support replay controls: Pause / Auto Replay / Semi Replay / Continue / Reset',
  'Support pair selection followed by trade-day candidate selection from scanned dates',
  'Maintain README',
  'Maintain preprocessed replay pair coverage',
  'Maintain an auto-generated acceptance checklist',
];

const pending = [
  'Expand the preprocessed pair library with more confirmed symbols',
  'Show date/time labels directly on the chart x-axis',
  'Support mouse-wheel zoom like TradingView',
  'Support drag/pan like TradingView',
  'Replay starts from the day before the selected FRD/FGD date',
];

const section = (title, checked, items) => {
  if (!items.length) return '';
  return `## ${title}\n\n${items.map((item) => `- [${checked ? 'x' : ' '}] ${item}`).join('\n')}\n`;
};

const body = [
  '# Acceptance Checklist',
  '',
  'Generated automatically from `scripts/generate-checklist.mjs`.',
  '',
  section('Completed', true, implemented).trimEnd(),
  '',
  section('Planned / pending', false, pending).trimEnd(),
  '',
].join('\n');

writeFileSync('ACCEPTANCE_CHECKLIST.md', `${body}\n`);

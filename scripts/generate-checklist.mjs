import { writeFileSync } from 'node:fs';

const confirmed = [
  'Load local CSV / JSON OHLCV',
  'Load a folder of symbol files',
  'After upload, scan and filter FRD / FGD candidate dates first',
  'Show detected dates explicitly',
  'In practice mode, only show screened-passed dates',
  'Auto Reply = automatic entry / exit + cumulative PnL',
  'Manual Reply = manual entry / exit + cumulative PnL',
  'Support 1m / 5m / 15m / 1h / 4h / 1D',
  'Rebuild higher timeframes from 1m',
  'Use America/New_York timezone',
  'Main chart must be a real candlestick chart',
  'Candles must have uniform TradingView-like thickness and spacing',
  'Overlay 20EMA / previous close / HOS / LOS / HOD / LOD / source / entry / stop / TP30 / TP35 / TP40 / TP50',
  'Right-side explain panel with rule-based reasoning',
  'Add expanded explanation documentation',
  'Add debug-friendly README',
  'Replay Mode similar to TradingView Replay',
  'Replay starts from the day before the selected FRD/FGD date',
  'Replay can auto-stop at important market/strategy states',
  'On-chart state labels must show current status at each important step',
  'README',
  'Sample mode',
  'Auto-generated acceptance checklist',
  'Built-in symbols/datasets included for immediate demo use',
  'Uploaded CSV/folder data is analyzed first and treated as the primary source for real analysis',
  'Internal pipeline stages are explicit: CSV parsing, timeframe rebuild, FRD/FGD screening, day-state classification, replay checkpoint generation, Auto/Manual state prep, final result packaging',
  'Normal mode shows only final screened results by default; intermediate raw internals are hidden',
  'Debug/developer mode exposes intermediate traces, rejected dates, and rule states',
  'Clear Normal mode vs Debug mode visibility boundaries are documented'
];

const body = `# Acceptance Checklist\n\n${confirmed.map((c) => `- [x] ${c}`).join('\n')}\n`;
writeFileSync('ACCEPTANCE_CHECKLIST.md', body);

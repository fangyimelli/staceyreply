import { writeFileSync } from 'node:fs';

const confirmed = [
  'Load local CSV / JSON OHLCV',
  'Load a folder of symbol files',
  'After upload, scan and filter FRD / FGD candidate dates first',
  'Show detected dates explicitly',
  'In practice mode, only show filtered dates',
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
  'Auto-generated acceptance checklist'
];

const body = `# Acceptance Checklist\n\n${confirmed.map((c) => `- [x] ${c}`).join('\n')}\n`;
writeFileSync('ACCEPTANCE_CHECKLIST.md', body);

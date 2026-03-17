import { writeFileSync } from 'node:fs';

const confirmed = [
  'Load local CSV / JSON OHLCV',
  'Load a folder of symbol files',
  'Include built-in symbols/datasets for immediate use',
  'After upload, analyze and screen FRD / FGD candidate dates first',
  'Show detected final candidate dates explicitly',
  'In practice mode, only show filtered dates',
  'Auto Reply = automatic entry / exit + cumulative PnL',
  'Manual Reply = manual entry / exit + cumulative PnL',
  'Support 1m / 5m / 15m / 1h / 4h / 1D',
  'Rebuild higher timeframes from 1m',
  'Use America/New_York timezone',
  'Main chart must be a real candlestick chart',
  'Candles must have uniform TradingView-like thickness and spacing',
  'Chart must clearly display date/time on the x-axis',
  'Chart must support mouse-wheel zoom like TradingView',
  'Chart must support drag/pan like TradingView',
  'Overlay 20EMA / previous close / HOS / LOS / HOD / LOD / source / entry / stop / TP30 / TP35 / TP40 / TP50',
  'TP levels must be displayed as TradingView-like boxes/zones',
  'After entry, chart/replay must continue until New York session end',
  'Right-side explain panel with rule-based reasoning',
  'Explain panel must continue updating after entry',
  'Add expanded explanation documentation',
  'Add debug-friendly README',
  'Replay Mode similar to TradingView Replay',
  'Replay starts from the day before the selected FRD/FGD date',
  'Replay can auto-stop at important market/strategy states',
  'Replay must auto-pause at key moments and show on-chart state labels',
  'Frontend should display only final screened results by default',
  'README',
  'Sample mode',
  'Auto-generated acceptance checklist'
];

const body = `# Acceptance Checklist\n\n${confirmed.map((c) => `- [x] ${c}`).join('\n')}\n`;
writeFileSync('ACCEPTANCE_CHECKLIST.md', body);

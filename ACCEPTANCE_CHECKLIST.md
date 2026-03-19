# Acceptance Checklist

Generated automatically from `scripts/generate-checklist.mjs`.

## Completed

- [x] Load local CSV / JSON OHLCV from the fixed dist/mnt/data folder
- [x] Load a folder of symbol files via startup manifest scanning
- [x] Include a built-in sample dataset for immediate use
- [x] Analyze and screen FRD / FGD candidate dates before selecting a trade day
- [x] Show detected candidate dates explicitly in the UI
- [x] In non-auto practice / manual-style review, only show `needs-practice` candidate dates
- [x] Auto Reply = automatic entry / exit + cumulative PnL
- [x] Manual Reply = manual entry / exit + cumulative PnL
- [x] Support 1m / 5m / 15m / 1h / 4h / 1D
- [x] Rebuild higher timeframes from 1m
- [x] Use America/New_York timezone
- [x] DST normalization keeps raw file unchanged while strategy session aligns to America/New_York
- [x] Main chart must be a real candlestick chart
- [x] Candles must have uniform TradingView-like thickness and spacing
- [x] Chart must clearly display normalized New York date/time on the x-axis
- [x] Chart viewport state is managed in React and follows revealed replay bars by default
- [x] Chart must support mouse-wheel zoom like TradingView
- [x] Chart must support drag/pan like TradingView
- [x] Overlay 20EMA / previous close / HOS / LOS / HOD / LOD / source / entry / stop / TP30 / TP35 / TP40 / TP50
- [x] Right-side explain panel with rule-based reasoning
- [x] Add expanded explanation documentation
- [x] Add debug-friendly README
- [x] Replay Mode similar to TradingView Replay
- [x] Replay starts from the day before the selected FRD/FGD date
- [x] Replay can auto-stop at important market/strategy states
- [x] Replay must auto-pause at key moments and show on-chart state labels
- [x] Frontend should display only final screened results by default
- [x] Dataset selection is followed by trade-day candidate selection from scanned dates
- [x] README
- [x] Sample mode
- [x] Auto-generated acceptance checklist

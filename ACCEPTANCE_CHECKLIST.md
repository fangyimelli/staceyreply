# Acceptance Checklist

Generated automatically from `scripts/generate-checklist.mjs`.

## Completed

- [x] Load replay pairs from a local preprocessed manifest/index
- [x] Show only manifest-backed replay pairs in the top-level selector
- [x] Include built-in preprocessed replay pairs for immediate use
- [x] Analyze and screen FRD / FGD candidate dates before selecting a trade day
- [x] Show detected candidate dates explicitly in the UI
- [x] In non-auto practice / manual-style review, only show `needs-practice` candidate dates
- [x] Auto Reply = automatic entry / exit + cumulative PnL
- [x] Manual Reply = manual entry / exit + cumulative PnL
- [x] Support 1m / 5m / 15m / 1h / 4h / 1D
- [x] Rebuild higher timeframes from 1m
- [x] Use America/New_York timezone for strategy session logic and display
- [x] Normalize MT fixed EST source data into America/New_York strategy time without rewriting raw files
- [x] Render a real candlestick chart
- [x] Overlay 20EMA / previous close / HOS / LOS / HOD / LOD / strategy annotations
- [x] Provide a right-side explain panel with rule-based reasoning, trace, and diagnostics
- [x] Support replay controls: Pause / Auto Replay / Semi Replay / Continue / Reset
- [x] Support pair selection followed by trade-day candidate selection from scanned dates
- [x] Maintain README
- [x] Maintain preprocessed replay pair coverage
- [x] Maintain an auto-generated acceptance checklist

## Planned / pending

- [ ] Expand the preprocessed pair library with more confirmed symbols
- [ ] Show date/time labels directly on the chart x-axis
- [ ] Support mouse-wheel zoom like TradingView
- [ ] Support drag/pan like TradingView
- [ ] Replay starts from the day before the selected FRD/FGD date


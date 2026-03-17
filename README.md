# Stacey Reply Tool

TypeScript single-page app for Day 3 replay practice with FRD/FGD scan-first workflow.

## Confirmed Features
1. Load local CSV / JSON OHLCV.
2. Load a folder of symbol files.
3. After upload, scan and filter FRD / FGD candidate dates first.
4. Show detected dates explicitly.
5. In practice mode, only show filtered dates.
6. Auto Reply = automatic entry / exit + cumulative PnL.
7. Manual Reply = manual entry / exit + cumulative PnL.
8. Support 1m / 5m / 15m / 1h / 4h / 1D.
9. Rebuild higher timeframes from 1m.
10. Use America/New_York timezone.
11. Main chart is a real candlestick chart for every supported timeframe.
12. Overlay 20EMA / previous close / HOS / LOS / HOD / LOD / source / entry / stop / TP30 / TP35 / TP40 / TP50.
13. Marker hover tooltip includes rule name / reasoning / price / time.
14. Right-side explain panel with rule-traceable reasoning.
15. README maintained.
16. Sample mode maintained.
17. Auto-generated acceptance checklist maintained.

## Layered Architecture
- `src/parser` for CSV/JSON load.
- `src/timeframe` for 1m aggregation and date scan.
- `src/strategy` for rule outputs and PnL logic.
- `src/annotations` for explain panel rendering.
- `src/ui` for candlestick chart and overlays.

## Run locally
```bash
npm install
npm run build
npm run start
```
Open `http://localhost:4173`.

## Sample mode
Use **Load Sample Mode** to load `sample/sample-1m.json`.

## Acceptance checklist
Regenerate with:
```bash
node scripts/generate-checklist.mjs
```

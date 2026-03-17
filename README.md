# Stacey Burke / Sniper Day 3 Chart Reply (TypeScript SPA)

Local single-page app for Day 3 practice/reply workflow. It loads local OHLCV CSV/JSON data, scans candidate dates first, and then lets you run Auto Reply or Manual Reply with cumulative PnL tracking.

---

## What this app does

- Loads one local CSV/JSON file or a folder selection of CSV/JSON files (multi-select upload).
- Scans uploaded symbols for FRD/FGD candidate Day 3 dates before normal replay/analysis.
- Shows detected candidate dates explicitly in the UI.
- Supports practice mode (filtered dates only) so date selection focuses on scanned FRD/FGD candidates.
- Supports Auto Reply (automatic entry/exit logic + cumulative PnL).
- Supports Manual Reply (manual entry/exit + cumulative PnL).
- Supports timeframes: `1m / 5m / 15m / 1h / 4h / 1D`.
- Rebuilds higher timeframes from 1m bars.
- Uses `America/New_York` session logic for strategy timing.
- Renders a candlestick chart with required overlays and right-side explain panel with rule-traceable reasoning.

---

## Install dependencies

```bash
npm install
```

## Start the app

```bash
npm run dev
```

Open `http://localhost:4173`.

> You can also build and serve static output:
>
> ```bash
> npm run build
> npm run preview
> ```

---

## Normal User Guide

### 1) Load a CSV file
1. Start the app.
2. Use the file picker at top-left.
3. Select one `.csv` file.
4. The symbol is derived from filename (before extension).

### 2) Load a folder of CSV files
1. Click the same file picker.
2. Multi-select all files from your folder (or drag-select in OS dialog).
3. The app parses each file and builds a symbol list from filenames.

### 3) Switch symbol
1. Use the symbol dropdown beside file upload.
2. Select the symbol you want to inspect.
3. Candidate date list and chart update for the selected symbol.

### 4) Switch timeframe
1. Use timeframe dropdown.
2. Choose one of `1m, 5m, 15m, 1h, 4h, 1D`.
3. Non-1m views are aggregated from source 1m bars.

### 5) Switch strategy line (FGD / FRD)
1. Use strategy dropdown (`FGD` or `FRD`).
2. Explain panel and annotations recompute using selected line.

### 6) Switch Auto Reply / Manual Reply
1. Use mode dropdown (`Auto Reply` or `Manual Reply`).
2. For Manual mode, enter manual `entry` and `exit` in the input fields.
3. Click **Apply trade to PnL** to add that trade’s result to cumulative PnL.

### 7) Use sample mode
- On first load, app starts with `SAMPLE` data so chart and explain panel are visible immediately.
- Uploading your own files replaces active datasets with uploaded data.

### 8) Read detected candidate dates
- The text line `Detected candidate dates:` lists scanned results as `YYYY-MM-DD(FGD|FRD)`.
- Practice mode can restrict date dropdown to this filtered set.

### 9) Read the explain panel
- Explain panel reports template (FGD/FRD), bias, stage, missing conditions, target tier, and trade/PnL summary.
- Missing conditions are explicit rule checkpoints (for example `20EMA confirm missing`, `stop hunt missing`, `123 missing`, `skip: stop too large`).

### 10) Read chart annotations
Chart includes:
- candlesticks
- 20EMA
- previous close
- HOS / LOS
- HOD / LOD
- source
- entry
- stop
- TP30 / TP35 / TP40 / TP50

### 11) How cumulative PnL works
- Each click of **Apply trade to PnL** adds current trade `pnlPips` to running total.
- Auto mode uses computed trade from strategy engine.
- Manual mode uses user-provided entry/exit and selected line direction.


### 12) Replay Mode (TradingView-like)
Replay behavior is defined to feel close to TradingView Replay while preserving rule-traceable Day 3 logic:

1. **Replay start point (context first)**
   - Selected FRD/FGD replay starts from the **previous day** (D-1 context), not only near entry.
   - FRD replay exposes Pump Day / pre-FRD context first.
   - FGD replay exposes Dump Day / pre-FGD context first.
2. **Candlestick rendering style**
   - Chart uses real OHLC candles.
   - Candle body thickness remains visually uniform and stable as replay advances.
   - Candle spacing stays consistent for readability.
3. **Replay progression behavior**
   - Replay advances bar-by-bar.
   - User can pause at any step.
   - Step forward/backward by one bar is supported.
   - Replay can auto-stop at important checkpoints.
4. **Replay controls**
   - `Play`
   - `Pause`
   - `Step +1`
   - `Step -1`
   - `Jump prev checkpoint`
   - `Jump next checkpoint`
   - `Jump D-2 start`
   - `Jump D-1 start`
   - `Jump Day 3 start`
   - Replay speed selector
   - Toggle auto-stop checkpoints on/off
5. **Partial-history integrity**
   - During replay, labels/states/explanations/annotations/trade decisions/target grading must be computed only from currently revealed bars.
   - Future candles must not influence current interpretation.
6. **Explain + chart state visibility**
   - When replay pauses or auto-stops, chart shows an explicit on-chart state banner.
   - Explain panel updates live with current day type, confirmed rules, missing rules, and FRD/FGD readiness.

### 13) Replay checkpoint states
Replay supports auto-stop checkpoints and chart labels for these important states:

- Pump Day complete
- Dump Day complete
- Possible FRD tomorrow
- Possible FGD tomorrow
- FRD signal day detected
- FGD signal day detected
- D-1 body >= 40 pips
- D-1 body >= 60% of full-day range
- Inside day detected for FRD context
- Day 3 begins
- New York session begins
- Source detected
- Stop hunt detected
- 123 in progress
- 123 confirmed
- 20EMA confirm detected
- Entry qualified
- Stop too large -> skip
- Target tier currently 30
- Target tier upgraded to 35
- Target tier upgraded to 40
- Target tier upgraded to 50
- Trade entered
- Trade exited

### 14) Replay commentary + day narrative
- Replay acts like a live analyst from revealed bars only:
  - what just happened
  - current state
  - what tomorrow might be
  - what is still missing
  - whether FRD/FGD conditions are forming
  - whether entry is allowed yet
  - whether setup improved or weakened
- Explain/chart narrative must clearly show sequence:
  - previous context day
  - Pump Day or Dump Day
  - FRD or FGD signal day
  - Day 3 trading day

---

## Rule Explanation

### Day 2
- Previous trading day used as context candle in Day 3 setup sequence.

### Day 3
- Current target day for execution/evaluation after Day 1 + Day 2 context.

### FGD
- In this implementation, candidate scan checks a Day-2 dump then Day-1 bullish recovery profile before tagging Day 3 as `FGD` candidate.

### FRD
- In this implementation, candidate scan checks a Day-2 pump then Day-1 bearish inside profile before tagging Day 3 as `FRD` candidate.

### Source
- Source is LOS for FGD and HOS for FRD in explain/annotation logic.

### HOS / LOS
- HOS = high of session reference.
- LOS = low of session reference.
- Used for contextual structure and source interpretation.

### HOD / LOD
- HOD = high of day.
- LOD = low of day.
- Displayed as contextual chart references.

### Stop hunt
- Sweep/reclaim (FGD) or sweep/reject (FRD) behavior in session bars, used for qualification and target upgrades.

### 123
- Three-point pattern check around source window used as structural confirmation.

### 20EMA confirm
- Checks whether price closes back over (FGD) or under (FRD) EMA(20).

### move30
- Measures short-window move in pips from source after source bar index.

### Target grading 30 / 35 / 40 / 50
- Target tier escalates by rule checks (EMA confirm, move thresholds, stop hunt/engulf, 123).
- Tiers drive TP30/35/40/50 plotting and Auto Reply target choice.

### `skip: stop too large`
- Entry is blocked if stop distance is above configured threshold; explain panel shows this explicit reason.

---

## Debug Guide (Development)

### Expected CSV format
- Header must include exactly: `time,open,high,low,close,volume`.
- `time` should be parseable by JavaScript `Date` (ISO timestamp recommended).
- Parser location: `src/parser/parseLocalData.ts`.

### Timezone assumptions
- Session window logic in strategy uses `America/New_York` conversion for `07:00` to `11:00` checks.
- Time bucketing for aggregation currently uses UTC-derived minute grouping.

### How 1m is aggregated into 5m / 15m / 1h / 4h / 1D
1. Select timeframe key based on bar timestamp.
2. Group bars by timeframe bucket key.
3. Emit OHLCV per group:
   - open = first open
   - high = max high
   - low = min low
   - close = last close
   - volume = sum
4. Aggregation location: `src/aggregation/timeframe.ts`.

### Where each logic layer lives
- Parser logic: `src/parser/parseLocalData.ts`
- Aggregation logic: `src/aggregation/timeframe.ts`
- Strategy engine logic: `src/strategy/engine.ts`
- Annotation construction: `src/strategy/engine.ts` (returned `annotations`)
- UI composition/state: `src/App.tsx`
- Chart rendering: `src/ui/ChartPanel.tsx` and `src/ui/render.ts`
- Explain panel rendering: `src/ui/ExplainPanel.tsx`

### Inspect computed FRD / FGD candidate dates
1. Upload files.
2. Observe `Detected candidate dates` line in UI.
3. For code-level inspection, set breakpoint/log in `detectCandidates(...)` in `src/strategy/engine.ts`.

### Inspect selected Day 3 state
1. Confirm day dropdown selection in UI.
2. Check `dayChoices` + `selectedDate` resolution in `src/App.tsx`.
3. Validate filtered/practice behavior by toggling `practiceOnly`, `enableFGD`, `enableFRD`.

### Inspect source / stop hunt / 123 / entry detection
1. Place breakpoints inside `evaluateDay(...)` in `src/strategy/engine.ts`.
2. Inspect variables in order: `source`, `stopHunt`, `oneTwoThree`, `entry`, `stop`, `entryAllowed`.
3. Compare with explain panel `missing` list.

### Inspect Auto trade simulation
1. Set mode to Auto.
2. Inspect `trade` branch in `evaluateDay(...)` when `mode==='auto' && entryAllowed`.
3. Confirm target-derived exit and computed `pnlPips`.

### Inspect Manual trade simulation
1. Set mode to Manual.
2. Enter numeric entry/exit.
3. Inspect `trade` branch in `evaluateDay(...)` when `mode==='manual'`.
4. Confirm side-aware pip calculation.

### Replay architecture requirement
Replay implementation should remain layered and explicit:
- replay engine / replay state module
- checkpoint detector module
- chart state overlay module
- strategy engine with day-state classification + partial-history evaluation
- annotations with checkpoint-aware rendering
- explain panel consuming replay state (no ad hoc UI-only recomputation)

### Replay debugging: incorrect state transitions
When state transitions look wrong:
1. Confirm replay cursor index and visible-bar window are aligned.
2. Confirm checkpoint detector evaluates only revealed bars.
3. Verify state labels map to exact checkpoint IDs.
4. Compare explain panel state against replay-state source object.
5. Verify no future-bar leakage in strategy state evaluation.

### Verify D-1 body 40 pips and 60% body/range checks
1. Identify D-1 candle open, close, high, low in day aggregation.
2. Compute body pips: `abs(close-open)` converted to pips.
3. Compute range pips: `high-low` converted to pips.
4. Compute body ratio: `body / range`.
5. Check thresholds:
   - `body >= 40 pips`
   - `body/range >= 0.60`
6. Confirm checkpoint labels and explain panel fields reflect these exact values.

### Verify Pump Day / Dump Day / FRD / FGD transitions
1. Validate daily sequence across context day, signal day, and Day 3.
2. Confirm Pump/Dump completion checkpoints trigger on intended daily state.
3. Confirm `Possible FRD/FGD tomorrow` checkpoints occur before signal-day confirmation.
4. Confirm FRD/FGD signal-day detected checkpoint only fires when strategy criteria are met from revealed data.
5. Confirm Day 3 begin checkpoint aligns with selected Day 3 start jump control.

### Common failure cases and how to debug
1. Empty/NaN chart values:
   - Check CSV headers and numeric parsing in `parseCsv`.
2. Candidate list empty unexpectedly:
   - Verify daily aggregation and candidate predicates in `detectCandidates`.
3. Explain panel says setup incomplete:
   - Verify `missing` checkpoints in `evaluateDay`.
4. Wrong timeframe shape:
   - Validate bucket keys in `key(...)` and grouped output in `aggregate(...)`.

---

## Troubleshooting

### CSV loads but chart is empty
- Confirm timestamps are valid and in ascending order.
- Confirm required headers exactly match parser expectations.
- Check browser console for parse errors.

### Wrong timezone display
- Ensure input timestamps are timezone-aware.
- Verify your expectation against `America/New_York` strategy window behavior.

### No FRD / FGD dates found
- Confirm data has enough daily bars (at least 3 days).
- Review candidate conditions in strategy engine and compare with your data profile.

### Annotations not appearing
- Confirm a valid day is selected and day bars are present.
- Check if strategy line/date combination yields computable annotation anchors.

### Auto Reply did not take a trade
- Entry is only created when `entryAllowed` is true.
- Check explain panel missing list, especially `skip: stop too large`.

### Manual Reply PnL looks wrong
- Confirm numeric entry/exit values.
- Confirm selected line direction (FGD long, FRD short) when interpreting pip sign.

### Target lines look wrong
- Confirm selected strategy line and entry anchor.
- Verify TP offsets are fixed pip tiers (30/35/40/50).

### Stop is larger than expected
- Check source bar selection and strategy line.
- Verify entry-stop pip distance in explain panel and `entryAllowed` rule.

### Timeframe aggregation looks wrong
- Compare 1m source sequence with grouped timeframe output.
- Inspect UTC bucket boundaries used by aggregation logic.

---

## Developer Notes

### PDF-derived rules vs user-confirmed extension rules
- Core rule implementation should remain traceable to existing strategy logic and explicit user confirmations.
- Documentation/extensions in this README are user-confirmed requirements for explanation/debug clarity.
- If a rule is ambiguous, preserve existing behavior and annotate clearly in code comments (per project constraints).

### Confirmed Features
Only explicitly confirmed features are listed below:
1. Load local CSV / JSON OHLCV
2. Load a folder of symbol files
3. After upload, scan and filter FRD / FGD candidate dates first
4. Show detected dates explicitly
5. In practice mode, only show filtered dates
6. Auto Reply = automatic entry / exit + cumulative PnL
7. Manual Reply = manual entry / exit + cumulative PnL
8. Support 1m / 5m / 15m / 1h / 4h / 1D
9. Rebuild higher timeframes from 1m
10. Use America/New_York timezone
11. Main chart must be a real candlestick chart
12. Candles must have uniform TradingView-like thickness and spacing
13. Overlay 20EMA / previous close / HOS / LOS / HOD / LOD / source / entry / stop / TP30 / TP35 / TP40 / TP50
14. Right-side explain panel with rule-based reasoning
15. Add expanded explanation documentation
16. Add debug-friendly README
17. Replay Mode similar to TradingView Replay
18. Replay starts from the day before the selected FRD/FGD date
19. Replay can auto-stop at important market/strategy states
20. On-chart state labels must show current status at each important step
21. README
22. Sample mode
23. Auto-generated acceptance checklist

### Not Yet Confirmed / Not Included
- Any broker API integration.
- Any remote/cloud data source requirement.
- Any feature not explicitly confirmed in the project requirements.

---

## Acceptance Checklist Generator

```bash
node scripts/generate-checklist.mjs
```

Generates/updates `ACCEPTANCE_CHECKLIST.md` from current confirmed feature scope.

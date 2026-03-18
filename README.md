# Stacey Burke / Sniper Day 3 Chart Reply (TypeScript SPA)

Local single-page app for Day 3 practice/reply workflow. It loads local OHLCV CSV/JSON data, scans candidate dates first, and then lets you run Auto Reply or Manual Reply with cumulative PnL tracking.

---

## What this app does

- Includes built-in symbols/datasets for immediate demo use without requiring any file upload.
- Built-in default source now auto-loads `sample/frd_fgd_three_day_windows.csv` on startup.
- Loads one local CSV/JSON file or a folder selection of CSV/JSON files (multi-select upload).
- Analyzes uploaded CSV/folder data first and treats uploaded data as the primary source for real analysis.
- Scans uploaded symbols for FRD/FGD candidate Day 3 dates before normal replay/analysis.
- Shows detected candidate dates explicitly in the UI.
- Supports practice mode (screened-passed dates only) so date selection focuses on scanned FRD/FGD candidates.
- Supports Auto Reply (automatic entry/exit logic + cumulative PnL).
- Supports Manual Reply (manual entry/exit + cumulative PnL).
- Supports timeframes: `1m / 5m / 15m / 1h / 4h / 1D`.
- Rebuilds higher timeframes from 1m bars.
- Uses `America/New_York` session logic for strategy timing.
- Runs a layered internal pipeline: CSV parsing → timeframe rebuild → FRD/FGD screening → day-state classification → replay checkpoint generation → Auto/Manual state prep → final result packaging.
- In Normal mode, UI emphasizes final screened results and hides raw intermediate internals by default.
- In Debug/Developer mode, UI and logs expose intermediate traces, rejected dates, and rule states.
- Renders a candlestick chart with required overlays and right-side explain panel with rule-traceable reasoning.

---


## Confirmed features

- React + `src/main.tsx` is the only application entrypoint and local startup path.
- Daily template evaluation for FGD / FRD with rule-traceable pass/fail output.
- Intraday evaluation now exposes: source, stop hunt, 123 node 1/2/3, 20EMA confirm, entry/stop, and fixed TP30/35/40/50 annotations with rule-traceable hover evidence.
- Explain panel shows template classification, bias, stage, missing conditions, can-enter / cannot-enter reasons, and per-rule pass/fail evidence.
- Pip-aware scoring now converts prices by symbol/decimals, blocks entries when stop distance exceeds 20 pips, and grades fixed TP30/35/40/50 targets with missing-condition feedback.
- Local sample mode, local CSV/JSON upload, and acceptance-checklist-oriented workflow remain supported.

---

## Install dependencies

```bash
npm install
```

## Start the app

```bash
npm run dev
```

Open `http://127.0.0.1:4173`.

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
- On first load, app first attempts to auto-load built-in `frd_fgd_three_day_windows.csv`; if unavailable, it falls back to `SAMPLE` data.
- Uploading your own files replaces active datasets with uploaded data.

### 8) Read detected candidate dates
- The text line `Detected candidate dates:` lists scanned results as `YYYY-MM-DD(FGD|FRD)`.
- Practice mode can restrict date dropdown to this filtered set.

### 9) Normal mode vs Debug mode
- **Normal mode visibility boundary:** focuses on final screened outcomes used for replay/practice/trade decisions.
- **Normal mode default:** intermediate raw internals (trace logs, rejected candidates, low-level rule transitions) are hidden.
- **Debug mode visibility boundary:** exposes intermediate traces, rejected dates, and rule-state transitions for diagnosis.
- Use Debug mode when validating why a date passed/failed screening or why a specific rule gate blocked entry.

### 10) Read the explain panel
- Explain panel reports template (FGD/FRD), bias, stage, missing conditions, target tier, and trade/PnL summary.
- Missing conditions are explicit rule checkpoints (for example `20EMA confirm missing`, `stop hunt missing`, `123 missing`, `skip: stop too large`).

### 11) Read chart annotations
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

### 12) How cumulative PnL works
- Each click of **Apply trade to PnL** adds current trade `pnlPips` to running total.
- Auto mode uses computed trade from strategy engine.
- Manual mode uses user-provided entry/exit and selected line direction.


### 13) Replay Mode (TradingView-like)
Replay behavior is defined to feel close to TradingView Replay while preserving rule-traceable Day 3 logic:

1. **Replay start point (context first)**
   - Selected FRD/FGD replay starts from the **previous day** (D-1 context), not only near entry.
   - FRD replay exposes Pump Day / pre-FRD context first.
   - FGD replay exposes Dump Day / pre-FGD context first.
2. **Candlestick rendering style**
   - Chart uses real OHLC candles.
   - Candle body thickness remains visually uniform and stable as replay advances.
   - Candle spacing stays consistent for readability.
   - X-axis always shows clear date/time labels.
   - X-axis labels adapt to active timeframe (`1m / 5m / 15m / 1h / 4h / 1D`).
   - Current replay bar time is visibly highlighted during replay.
   - Multi-day replay keeps day boundaries visually understandable.
3. **TradingView-like interaction on chart**
   - Mouse-wheel zoom in/out is supported directly on the chart.
   - Zoom is cursor-centered and smooth, while preserving candle readability.
   - Drag/pan left-right is supported to inspect history.
   - Panning preserves uniform candle width/spacing.
   - In replay, panning/zooming never reveals future candles.
4. **Replay progression behavior**
   - Replay advances bar-by-bar.
   - User can pause at any step.
   - Step forward/backward by one bar is supported.
   - Replay can auto-stop at important checkpoints.
5. **Replay controls**
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
6. **Partial-history integrity**
   - During replay, labels/states/explanations/annotations/trade decisions/target grading must be computed only from currently revealed bars.
   - Future candles must not influence current interpretation.
   - Auto Reply and Manual Reply decisions must use only currently revealed bars.
   - Explain panel and annotations update only from currently revealed bars.
7. **Explain + chart state visibility**
   - When replay pauses or auto-stops, chart shows an explicit on-chart state banner.
   - Explain panel updates live with current day type, confirmed rules, missing rules, and FRD/FGD readiness.

### 14) Replay checkpoint states
Replay auto-pause checkpoints and chart labels are a core behavior (not optional decoration) and must include at least:

- Pump Day complete
- Dump Day complete
- Possible FRD tomorrow
- Possible FGD tomorrow
- FRD signal day detected
- FGD signal day detected
- D-1 body >= 40 pips
- D-1 body >= 60% of full-day range
- Inside day detected
- Day 3 begins
- New York session begins
- Source detected
- Stop hunt detected
- 123 in progress
- 123 confirmed
- 20EMA confirm detected
- Entry qualified
- Skip: stop too large
- Target tier = 30
- Target tier = 35
- Target tier = 40
- Target tier = 50
- Trade entered
- Trade exited

At each auto-pause checkpoint, the chart must show an on-chart interpretation label/banner such as:
- `Pump Day complete`
- `Tomorrow may be FRD`
- `FRD signal day detected`
- `D-1 body = 63% of range`
- `Day 3 started`
- `Source detected`
- `Stop hunt confirmed`
- `123 confirmed`
- `20EMA confirm detected`
- `Entry qualified`
- `Skip: stop too large`
- `Target grade upgraded to 35`

### 15) Replay commentary + day narrative
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

### Mode visibility boundaries (Normal vs Debug)
- **Normal mode:** displays final screened results only (selected candidate outcomes, final explain state, final chart annotations used for user decisions).
- **Debug mode:** additionally surfaces intermediate internals, including candidate screening traces, rejected dates, and rule-state transitions.
- Keep debugging focused on traceability: each exposed debug state should map back to a specific rule or pipeline stage.

### Internal analysis pipeline (for tracing)
1. CSV parsing
2. Timeframe rebuild
3. FRD/FGD screening
4. Day-state classification
5. Replay checkpoint generation
6. Auto/Manual state preparation
7. Final result packaging for UI

Uploaded CSV/folder data runs through this pipeline first and is treated as the primary source for real analysis. Built-in sample datasets remain available for immediate demo use.

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
- Chart rendering: `src/ui/ChartPanel.tsx`
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

### Replay paused at the wrong timing
- Verify the checkpoint event order and bar index produced by replay checkpoint generation.
- Compare active replay pointer (revealed bar count) against the expected checkpoint bar.
- Confirm timeframe alignment so checkpoint evaluation is based on the currently selected view built from 1m.

### Replay checkpoint label is wrong
- Confirm the checkpoint type emitted by the strategy/replay pipeline and ensure the label mapping matches it exactly.
- Validate that the explain panel and on-chart banner are both fed by the same checkpoint payload.
- Ensure no future bar data is being read when constructing pause labels.


---

## Developer Notes

### PDF-derived rules vs user-confirmed extension rules
- Core rule implementation should remain traceable to existing strategy logic and explicit user confirmations.
- Documentation/extensions in this README are user-confirmed requirements for explanation/debug clarity.
- If a rule is ambiguous, preserve existing behavior and annotate clearly in code comments (per project constraints).

### Current Runtime Entry
- Runtime track: **TypeScript + React (Vite)**.
- HTML entrypoint: `index.html` mounting `<div id="root"></div>`.
- Application bootstrap: `src/main.tsx` (renders `src/App.tsx`).
- Legacy plain-JS runtime entry (`src/app.js` + related JS modules) has been removed to avoid dual-track drift.

### Confirmed Features
Only explicitly confirmed features are listed below:
1. Load local CSV / JSON OHLCV
2. Load a folder of symbol files
3. Include built-in symbols/datasets for immediate use (default: `frd_fgd_three_day_windows.csv`)
4. After upload, analyze and screen FRD / FGD candidate dates first
5. Show detected final candidate dates explicitly
6. In practice mode, only show filtered dates
7. Auto Reply = automatic entry / exit + cumulative PnL
8. Manual Reply = manual entry / exit + cumulative PnL
9. Support 1m / 5m / 15m / 1h / 4h / 1D
10. Rebuild higher timeframes from 1m
11. Use America/New_York timezone
12. Main chart must be a real candlestick chart
13. Candles must have uniform TradingView-like thickness and spacing
14. Chart must clearly display date/time on the x-axis
15. Chart must support mouse-wheel zoom like TradingView
16. Chart must support drag/pan like TradingView
17. Overlay 20EMA / previous close / HOS / LOS / HOD / LOD / source / entry / stop / TP30 / TP35 / TP40 / TP50
18. Right-side explain panel with rule-based reasoning
19. Add expanded explanation documentation
20. Add debug-friendly README
21. Replay Mode similar to TradingView Replay
22. Replay starts from the day before the selected FRD/FGD date
23. Replay can auto-stop at important market/strategy states
24. Replay must auto-pause at key moments and show on-chart state labels
25. Frontend should display only final screened results by default
26. README
27. Sample mode
28. Auto-generated acceptance checklist

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

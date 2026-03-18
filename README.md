# Stacey Burke / Sniper Day 3 Chart Reply (TypeScript SPA)

Local single-page app for Day 3 practice / reply workflow. The current production entry is the React + Vite app mounted from `index.html` → `src/main.tsx` → `src/App.tsx`.

---

## Actual app entry and runtime

- Browser entry HTML: `index.html`
- Active TypeScript entry: `src/main.tsx`
- Root React component: `src/App.tsx`
- Build tool / dev server: Vite via `package.json` scripts

> Legacy files such as `src/main.ts` and `src/app.ts` are not wired into `index.html` and are not the current browser entry path.

---

## Confirmed features

- React + `src/main.tsx` is the only application entrypoint and local startup path.
- Daily template evaluation for FGD / FRD with rule-traceable pass/fail output.
- Intraday evaluation now exposes: source, stop hunt, 123 node 1/2/3, 20EMA confirm, entry/stop, and fixed TP30/35/40/50 annotations with rule-traceable hover evidence.
- Explain panel shows template classification, bias, stage, missing conditions, can-enter / cannot-enter reasons, and per-rule pass/fail evidence.
- Pip-aware scoring now converts prices by symbol/decimals, blocks entries when stop distance exceeds 20 pips, and grades fixed TP30/35/40/50 targets with missing-condition feedback.
- Backend/API-driven dataset loading, sample mode fallback, and acceptance-checklist-oriented workflow remain supported.
- Replay controls now use an independent UI state (`isPlaying`, `isFinished`, `currentBarIndex`, `playSpeed`, `replayStartIndex`, `replayEndIndex`) and reveal Day 3 bars progressively to the chart/explain panels.

---


## Imported metadata vs replayable 1m bars

The UI now separates **raw imported metadata** from **frontend-derived candidate / analysis output**.

- **Raw imported metadata** = fields supplied directly by the backend import, such as `pair`, `date`, `signal`, and any backend-declared import fields.
- **Frontend-derived fields** = candidate screening, explain-panel judgments, replay state, annotations, target tiers, and other rule-traceable analysis computed in the browser.
- If the backend provides only `pair/date/signal` summary rows, the app shows the metadata table only and does **not** pretend a full intraday chart is available.
- If the backend provides real replayable 1m bars, those bars populate `SymbolDataset.bars1m` and power chart / replay / analysis.
- Sample mode remains runnable locally, but its bars are explicitly labeled as **sample/synthetic** so users do not confuse them with imported real-market data.

### Backend dataset contract
- Endpoint: `/api/datasets/day3`
- Each dataset record should contain:
  - `pair`
  - `bars1m` (real 1m OHLCV bars when replay is supported; otherwise may be empty)
  - `metadata.source`
  - `metadata.timezone`
  - `metadata.signals[]` with `pair`, `date`, `signal`
  - `metadata.bars1mStatus` = `replayable-real`, `metadata-only`, or `sample-synthetic`
  - `metadata.importedFields[]` listing raw imported columns shown in the UI
  - `metadata.derivedFields[]` listing fields that are produced by frontend analysis

### Current synthetic-window parser note
- `src/parser/parseFrdFgdWindows.ts` no longer fabricates production OHLC bars from `frd_fgd_three_day_windows.csv`.
- That CSV is treated as summary metadata only unless a separate backend payload provides real replayable 1m bars.
- The old synthetic bar approach was acceptable for temporary demo scaffolding only and should not be used as the formal chart source.

## Install dependencies

```bash
npm install
```

---

## Scripts

```bash
npm run dev
npm run check
npm run build
npm run preview
```

- `npm run dev`: start the local Vite dev server on `http://127.0.0.1:4173`
- `npm run check`: run TypeScript type-checking with `tsc -p tsconfig.app.json --noEmit`
- `npm run build`: run `npm run check` first, then create deployable static assets in `dist/`
- `npm run preview`: serve the built `dist/` output locally

---

## How to start

1. Install dependencies with `npm install`.
2. Start the dev server with `npm run dev`.
3. Open `http://127.0.0.1:4173`.

If you want a production build instead:

1. Run `npm run build`.
2. Run `npm run preview`.
3. Open the preview URL shown by Vite.

---

## UI workflow

### 1) Load data

- On first load, the app requests datasets from the backend endpoint `/api/datasets/day3` through `src/data/loadDatasets.ts`.
- If that endpoint is unavailable during local development, the app falls back to in-memory sample mode so the UI remains runnable.
- The UI no longer accepts direct `.csv` / `.json` file uploads from the browser.

## Debug Guide (Development)

### Mode visibility boundaries (Normal vs Debug)
- **Normal mode:** displays final screened results only (selected candidate outcomes, final explain state, final chart annotations used for user decisions).
- **Debug mode:** additionally surfaces intermediate internals, including candidate screening traces, rejected dates, and rule-state transitions.
- Keep debugging focused on traceability: each exposed debug state should map back to a specific rule or pipeline stage.

### Internal analysis pipeline (for tracing)
1. Backend data access
2. Timeframe rebuild
3. FRD/FGD screening
4. Day-state classification
5. Replay checkpoint generation
6. Auto/Manual state preparation
7. Final result packaging for UI

Backend-provided datasets are treated as the primary source for analysis. Built-in sample mode remains available as a local fallback.

### Backend dataset contract
- Data access location: `src/data/loadDatasets.ts`.
- Expected backend endpoint: `/api/datasets/day3`.
- Expected response shape: `BackendDatasetsResponse` with `datasets[]`, where each dataset includes:
  - `pair`
  - `bars1m`
  - `metadata.source`
  - `metadata.timezone`
  - `metadata.signals[]` entries with `pair`, `date`, and `signal`
- UI-facing `SymbolDataset[]` values are derived from this response only after the backend payload is loaded and normalized.

### Timezone assumptions
- Session window logic in strategy uses `America/New_York` conversion for `07:00` to `11:00` checks.
- Time bucketing for aggregation uses shared `America/New_York` date/time bucket keys for `1D`, `5m`, `15m`, `1h`, and `4h`.

### How 1m is aggregated into 5m / 15m / 1h / 4h / 1D
1. Select timeframe key from the bar timestamp converted into `America/New_York`.
2. Group bars by timeframe bucket key.
3. Emit OHLCV per group:
   - open = first open
   - high = max high
   - low = min low
   - close = last close
   - volume = sum
4. Aggregation location: `src/aggregation/timeframe.ts`.

### Where each logic layer lives
- Data access / backend normalization: `src/data/loadDatasets.ts`
- Aggregation logic: `src/aggregation/timeframe.ts`
- Strategy engine logic: `src/strategy/engine.ts`
- Annotation construction: `src/strategy/engine.ts` (returned `annotations`)
- UI composition/state: `src/App.tsx`
- Chart rendering: `src/ui/ChartPanel.tsx`
- Explain panel rendering: `src/ui/ExplainPanel.tsx`

### Inspect computed FRD / FGD candidate dates
1. Confirm the backend/API dataset is loaded in the UI source panel.
2. Observe the screened day/date outputs in the app.
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

### Replay start scope
- Confirmed replay scope: **play Day 3 from the selected New York day's first intraday bar to that same day's last intraday bar**.
- The current implementation does **not** start replay from D-1; prior bars are kept only as historical context for strategy evaluation.
- Chart and explain panels only consume the progressively revealed Day 3 bars while replay advances.

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
   - Check backend payload normalization in `src/data/loadDatasets.ts` and confirm `bars1m` contains numeric OHLCV fields.
2. Candidate list empty unexpectedly:
   - Verify daily aggregation and candidate predicates in `detectCandidates`.
3. Explain panel says setup incomplete:
   - Verify `missing` checkpoints in `evaluateDay`.
4. Wrong timeframe shape:
   - Validate bucket keys in `key(...)` and grouped output in `aggregate(...)`.

- Use the symbol dropdown in the top control row.
- The dropdown options come from the current dataset list.
- When you change symbol, the screened table, day selector, chart, and explain panel update together.

### 3) Switch timeframe

- Use the timeframe dropdown in the top control row.
- Available values are `1m`, `5m`, `15m`, `1h`, `4h`, and `1D`.
- Higher timeframes are aggregated from 1-minute source bars.

### 4) Filter candidate dates

- Use `FGD on` and `FRD on` to include or exclude each line type.
- Use `Practice mode (filtered dates only)` to keep the date dropdown limited to screened candidate dates.
- Use the date dropdown to pick the current trading day under review.

### 5) Switch reply mode

- Use the `Auto Reply` / `Manual Reply` dropdown.
- In `Manual Reply`, the `entry` and `exit` inputs appear next to the mode selector.
- Click **Apply trade to PnL** to add the current trade result to total PnL.

### 6) Read the screened results

- The **Screened Results (Final)** table lists:
  - `Symbol`
  - `Candidate Date`
  - `Line Type`
  - `Validity`
  - `Replay Availability`
  - `Recommended Next Action`
  - `Current Target Tier`

### 7) Open the debug panel

- Enable the `Debug panel` checkbox in the top control row.
- This shows the **Debug Panel (Intermediate Artifacts)** section with raw scan traces and debug payload output for passed rows.

### 8) Read the explain panel

- The right-side **Explain Panel** shows:
  - `Template`
  - `Bias`
  - `Current Stage`
  - `Entry status`
  - `Recommended target`
  - `Why classification / stage`
  - `判斷依據明細`
  - `Intraday rule summary`
  - `Target tiers`
  - `Missing conditions`
  - `Rule Trace`
  - `PnL`

### 9) Read the chart

The current chart component renders:

- close line
- `20EMA`
- `previous close`
- `HOS`
- `LOS`
- `HOD`
- `LOD`
- annotation markers for detected events

---

## Notes on current implementation scope

- The shipped UI is the React entry described above.
- This README intentionally does **not** claim any replay behavior beyond the currently implemented Day 3 controls and revealed-bar progression documented above.
- Use the confirmed-features list above as the source of truth for what is actually implemented right now.

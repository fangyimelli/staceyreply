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

Only features that are currently implemented in the shipped UI are listed here.

- Auto-load built-in sample data from `sample/frd_fgd_three_day_windows.csv`, with fallback to in-memory `SAMPLE` bars when that file is unavailable.
- Upload one or more local `.csv` / `.json` files and derive symbols from the uploaded file names.
- Switch active symbol with the symbol dropdown.
- Switch timeframe with the timeframe dropdown: `1m / 5m / 15m / 1h / 4h / 1D`.
- Filter candidate dates with `FGD on`, `FRD on`, and `Practice mode (filtered dates only)`.
- Switch strategy line between `FGD` and `FRD`.
- Switch reply mode between `Auto Reply` and `Manual Reply`.
- In manual mode, enter `entry` and `exit`, then use **Apply trade to PnL** to accumulate total PnL.
- Review final screened rows in the **Screened Results (Final)** table.
- Open the **Debug Panel (Intermediate Artifacts)** with the `Debug panel` checkbox.
- Review rule-traceable reasoning, intraday evidence, target tiers, missing conditions, and PnL in the **Explain Panel**.
- Review chart overlays currently rendered in the app: close line, `20EMA`, `previous close`, `HOS`, `LOS`, `HOD`, `LOD`, plus annotation markers.

---

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

- On first load, the app tries to load built-in sample data automatically.
- To replace it, use the file input in the top control row and choose one or more `.csv` / `.json` files.

### 2) Switch product / symbol

- Use the symbol dropdown immediately to the right of the file input.
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
- This README intentionally does **not** claim replay controls, TradingView-style bar stepping, or candlestick rendering because those behaviors are not currently wired into the active UI.
- Use the confirmed-features list above as the source of truth for what is actually implemented right now.

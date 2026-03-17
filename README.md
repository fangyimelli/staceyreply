# Stacey Burke / Sniper Day 3 Chart Reply (TypeScript SPA)

Single-page local web app that loads local OHLCV files, scans for FRD/FGD candidate Day 3 dates, displays chart annotations, and explains rule reasoning in a right-side panel.

## How to place CSV files
1. Prepare local CSV with columns: `time,open,high,low,close,volume`.
2. Or JSON arrays with equivalent fields.
3. Start app and upload files with the file picker.

## How to start
```bash
npm run build
python3 -m http.server 4173
```
Open `http://localhost:4173`.

## How to switch symbols
- Upload one or more files.
- Symbol is derived from filename and scanned for candidate dates.

## How to switch timeframes
- Use timeframe selector: `1m, 5m, 15m, 1h, 4h, 1D`.
- 5m/15m/1h/4h/1D are rebuilt from 1m data.

## How to use explain panel
- Right-side panel shows:
  - FGD/FRD classification
  - current bias
  - current stage
  - missing conditions
  - entry allowed or blocked
  - current recommended 30/35/40/50 target tier

## How to use Auto Reply
- Set mode to `Auto Reply`.
- Click `Apply trade to PnL` to accumulate auto trade result.

## How to use Manual Reply
- Set mode to `Manual Reply`.
- Input entry and exit prices.
- Click `Apply trade to PnL` to accumulate manual trade result.

## Practice mode
- Candidate dates are shown explicitly after scan.
- Practice mode limits date choices to filtered candidate dates only.

## Sample mode
- App boots with fake sample data so UI is immediately demonstrable before CSV upload.

## Generate acceptance checklist
```bash
npm run checklist
```

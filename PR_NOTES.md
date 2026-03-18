# PR Notes

## Summary
This patch converts the app from an upload-style dataset viewer into a fixed-folder replay/backtest SPA for Stacey Burke / Sniper Day 3 analysis.

## What changed
- Fixed-folder dataset scan from `dist/mnt/data`
- New parser + timeframe aggregation + dataset validation + strategy/replay pipeline
- Replay modes: Pause / Auto Replay / Semi Replay
- Explain Panel now shows historical reasoning timeline, missing conditions, and rule trace
- Sample mode updated to demonstrate full replay flow
- Deprecated upload logic removed from the active app path

## Verification checklist
- `npm run check`
- `npm run build`
- Open app, choose sample mode, test Auto Replay and Semi Replay
- Choose invalid folder dataset to confirm validation errors render in banner/panel/diagnostics

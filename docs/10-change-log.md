# 10 Change Log

## 2026-03-20
- Rewrote product requirements around the fixed `data/` raw CSV -> preprocessing -> pair selection -> automatic load flow
- Updated README sections for confirmed features, data source flow, dataset switching, sample mode, and deprecated log wording
- Updated checklist generators so generated acceptance output only describes FRD/FGD auto-scan, structured replay datasets, pair-only UI copy, and ±2 day event windows
- Cleaned UI/documentation/PR template wording to align with the fixed replay dataset flow

## 2026-03-18
- Replaced the legacy manual dataset-selection flow with fixed-folder scan from `dist/mnt/data`
- Added SSOT replay analysis model with explicit stage / gate state and `lastReplyEval`
- Added dataset validation layer for missing Day 3 structure and timeframe continuity
- Reworked UI into replay/backtest workflow with Pause / Auto Replay / Semi Replay
- Reworked Explain Panel into timeline + reasoning + missing conditions + rule trace
- Added sample replay dataset and sample mode narrative
- Removed deprecated metadata-first dataset language from the active app path

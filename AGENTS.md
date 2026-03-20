# AGENTS.md

## Project
This repo is a TypeScript single-page web app for a Stacey Burke / Sniper style Day 3 chart reply tool.

## Non-negotiable rules
- Only implement features explicitly confirmed by the user.
- Do not add speculative features.
- Keep architecture layered:
  - parser
  - timeframe aggregation
  - strategy engine
  - annotations
  - UI
- Use local CSV / JSON only.
- No broker API.
- Keep the app runnable locally.

## Product behavior
- Use a fixed `data/` raw CSV source flow: raw CSV -> preprocessing -> structured replay dataset -> automatic app load.
- After preprocessing, scan datasets first and filter candidate FRD/FGD dates before replay selection.
- Show detected dates clearly.
- Pair selection is the primary dataset selector; do not expose deprecated manual dataset selection flows in the product copy.
- In practice/manual mode, only show filtered dates that need practice.
- Support Auto Reply and Manual Reply:
  - Auto Reply = automatic entry/exit + cumulative PnL
  - Manual Reply = user entry/exit + cumulative PnL
- Support 1m / 5m / 15m / 1h / 4h / 1D
- Build higher timeframes from 1m data.
- Use America/New_York for session logic and display.
- Replay datasets should center the selected trade day inside an event window that includes the prior 2 days and next 2 days when available.

## UI requirements
Chart must show:
- candlesticks
- 20EMA
- previous close
- HOS / LOS
- HOD / LOD
- source
- entry
- stop
- TP30 / TP35 / TP40 / TP50

Explain panel must show:
- FGD / FRD / not valid Day 3
- why
- current stage
- why source
- why stop hunt
- why 123
- why entry
- why current target tier

All judgments must be rule-traceable.

## Strategy rules
Implement FGD and FRD exactly as specified by the user prompt.
Do not silently reinterpret rules.
If a rule is ambiguous, preserve current behavior and mark it clearly in code comments.

## Delivery
Always maintain:
- README.md
- sample mode documentation when it exists in product/docs
- acceptance checklist generator aligned to the fixed `data/` -> preprocess -> pair selection -> auto-load flow

## Final version tracking
Maintain a confirmed-features section in documentation.
Only include user-confirmed features.
Do not list unconfirmed ideas in final version output.
Do not reintroduce deprecated manual dataset-selection language into final docs/checklists/templates.

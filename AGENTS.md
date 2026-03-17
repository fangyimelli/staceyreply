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
- Load one file or a folder of CSV/JSON files.
- After upload, scan files first and filter candidate FRD/FGD dates.
- Show detected dates clearly.
- In practice/manual mode, only show filtered dates that need practice.
- Support Auto Reply and Manual Reply:
  - Auto Reply = automatic entry/exit + cumulative PnL
  - Manual Reply = user entry/exit + cumulative PnL
- Support 1m / 5m / 15m / 1h / 4h / 1D
- Build higher timeframes from 1m data.
- Use America/New_York for session logic and display.

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
- sample mode
- acceptance checklist generator

## Final version tracking
Maintain a confirmed-features section in documentation.
Only include user-confirmed features.
Do not list unconfirmed ideas in final version output.

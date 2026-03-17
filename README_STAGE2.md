# Stage-2 Backtest (Pre-screened 3-day windows only)

## Purpose
Stage 2 consumes pre-screened windows from `frd_fgd_three_day_windows.csv` and evaluates **only those rows** as the backtest universe. It does not rescan the raw calendar for new candidates.

## Inputs
1. `frd_fgd_three_day_windows.csv`
   - Required columns: `symbol,strategy_line,d_minus_2_date,signal_day_date,trade_day_date`
   - `strategy_line` must be `FRD` or `FGD`
2. Local market CSV folder (`project/data`, `data`, `/mnt/data`, or override path)
   - Expected schema: `time,open,high,low,close,volume`

## Run
```bash
node scripts/stage2Backtest.ts /path/to/frd_fgd_three_day_windows.csv /path/to/output_dir /path/to/market_csv_folder
```

Argument defaults:
- windows path default: `/mnt/data/frd_fgd_three_day_windows.csv`
- output directory default: `./stage2_outputs`
- market folder default: auto-detect from `project/data`, `data`, `sample`, `/mnt/data`, repo root

## Layered implementation
- Input loader: CSV parsing + type-safe candidate window rows.
- Three-day window loader: strict loading of provided windows only.
- Timeframe aggregation: 1m -> 5m aggregation for 20EMA checks.
- Strategy evaluator: FRD/FGD rule application on D-2, signal day, trade day only.
- Result writer: full, passed-only, symbol summary, setup summary CSV outputs.

## Computed fields
- `daily_template_validity`
  - FRD: D-2 bullish day + signal day bearish close.
  - FGD: D-2 bearish day + signal day bullish close.
- `ny_session_validity`
  - True if trade-day bars exist in `07:00–11:00 America/New_York`.
- `source_detected/source_time/source_price`
  - FRD source = signal-day HOS proxy (signal day high).
  - FGD source = signal-day LOS proxy (signal day low).
- `stop_hunt_detected/stop_hunt_time`
  - FRD: break above source then fail close below.
  - FGD: break below source then reclaim close above.
- `123_detected/123_confirmation_time`
  - FRD short and FGD long pattern progression, confirmed on break of the minor pivot.
- `20EMA_confirm_detected/20EMA_confirm_time`
  - Evaluated from trade-day NY session 5m bars.
  - FRD needs close back below 20EMA; FGD needs close back above 20EMA.
- `entry_qualified/entry_time/entry_price`
  - Requires template + session + stop hunt + 123 + 20EMA + quarter-hour rotation (`:00/:15/:30/:45`).
- `stop_price/stop_size_in_pips/skip_stop_too_large`
  - Stop placed outside source extreme by 1 pip.
  - Pip size: JPY symbols `0.01`, otherwise `0.0001`.
  - Skip when stop size > 20 pips.
- `move30_in_pips`
  - Maximum favorable excursion from entry through NY session end.
- `target_30/35/40/50`
  - 30: source + 20EMA + move30 >= 15
  - 35: above + move30 >= 30
  - 40: above + (stop hunt OR engulfment proxy)
  - 50: stop hunt + 123 + 20EMA + move30 >= 35
- `recommended_target_tier`
  - Highest achieved tier among 30/35/40/50, else `none`.
- `ny_session_end_exit_price_if_no_earlier_exit`
  - Session-end close after entry, if no earlier exit modeled.
- `notes`
  - Includes previous-close proximity checks and replay-integrity flags.

## Debug guide
- Source debugging
  - Verify signal day bars loaded; source is highest high (FRD) / lowest low (FGD).
- Stop-hunt debugging
  - Check first trade-day NY-session bars crossing source then failing/reclaiming.
- 123 debugging
  - Confirm sweep -> displacement -> retest without invalidation -> pivot break sequence.
- 20EMA debugging
  - Review 5m reconstructed bars and EMA values at/after 123 confirmation.
- Entry debugging
  - Ensure all gates pass and entry bar minute aligns with quarter-hour rotation.

## Output files
- `stage2_backtest_candidates_full.csv`
- `stage2_backtest_passed_only.csv`
- `stage2_backtest_summary_by_symbol.csv`
- `stage2_backtest_summary_by_setup.csv`

Each row remains explicitly tagged by `strategy_line` so FRD and FGD can be analyzed separately.

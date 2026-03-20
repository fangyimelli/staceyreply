# Sandbox Flow Table

| Layer | SSOT input | Output | Notes |
|---|---|---|---|
| parser | `dist/mnt/data/*.csv/json` raw text | 1m OHLCV bars | Fixed data pipeline only |
| timeframe aggregation | 1m bars | 5m / 15m / 1h / 4h / 1D bars | America/New_York session semantics |
| dataset validation | Parsed 1m bars | explicit invalid messages | Never hard-judge incomplete data |
| strategy engine | validated day buckets + session bars | FGD / FRD / Invalid / Incomplete classification | Rule-traceable |
| replay engine | strategy events | stage stops for auto/semi replay | Semi replay halts by stage, not by bar |
| annotations | replay analysis | chart overlays + tooltip trace | source / stop hunt / 123 / EMA / entry / stop / TP |
| UI | replay analysis + current index | chart, status banner, explain panel, diagnostics | chat/status separate from gate state |

## Regression guards
- Replay start/end indices are computed once from trade-day NY session; replay cannot jump straight to the end on reset.
- Entry is emitted only after source + stop hunt + 123 + 20EMA gates align.
- Stage order is fixed in event log generation, so source / stop hunt / 123 / 20EMA cannot render out of order.
- Validation runs before classification, so incomplete data surfaces invalid messages instead of forced FRD/FGD decisions.
- Explain Panel consumes the event log and rule trace, so it cannot collapse to final conclusion only.

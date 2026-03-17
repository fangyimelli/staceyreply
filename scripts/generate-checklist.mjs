import { writeFileSync } from "node:fs";

const confirmed = [
  "Load local CSV / JSON OHLCV",
  "Load a folder of symbol files",
  "Scan and filter FRD / FGD dates after upload",
  "Show detected dates explicitly",
  "Practice mode shows only filtered dates",
  "Auto Reply with cumulative PnL",
  "Manual Reply with cumulative PnL",
  "Support 1m / 5m / 15m / 1h / 4h / 1D",
  "Rebuild higher timeframes from 1m",
  "Use America/New_York timezone",
  "Main chart is real candlestick chart",
  "Overlay 20EMA / previous close / HOS / LOS / HOD / LOD / source / entry / stop / TP30-50",
  "Marker tooltip shows rule name / reasoning / price / time",
  "Right-side explain panel with rule-based reasoning",
  "README",
  "Sample mode",
  "Auto-generated acceptance checklist"
];

const body = `# Acceptance Checklist\n\n${confirmed.map((c) => `- [x] ${c}`).join("\n")}\n`;
writeFileSync("ACCEPTANCE_CHECKLIST.md", body);

import { renderExplainPanel } from "./annotations/explainPanel.js";
import { parseFiles } from "./parser/fileParser.js";
import { computeAutoPnl, computeManualPnl, runStrategy } from "./strategy/engine.js";
import { aggregateFrom1m } from "./timeframe/aggregate.js";
import { scanCandidateDates } from "./timeframe/dateScan.js";
import { SupportedTimeframe, SymbolDataset } from "./types.js";
import { renderCandlestickChart } from "./ui/chart.js";

const timeframeEl = document.querySelector<HTMLSelectElement>("#timeframe")!;
const fileEl = document.querySelector<HTMLInputElement>("#fileInput")!;
const sampleBtn = document.querySelector<HTMLButtonElement>("#sampleBtn")!;
const datesEl = document.querySelector<HTMLDivElement>("#dates")!;
const modeEl = document.querySelector<HTMLSelectElement>("#mode")!;
const pnlEl = document.querySelector<HTMLDivElement>("#pnl")!;
const explainEl = document.querySelector<HTMLDivElement>("#explain")!;
const manualEntryEl = document.querySelector<HTMLInputElement>("#manualEntry")!;
const manualExitEl = document.querySelector<HTMLInputElement>("#manualExit")!;
const canvas = document.querySelector<HTMLCanvasElement>("#chart")!;
const tooltip = document.querySelector<HTMLDivElement>("#tooltip")!;

let datasets: SymbolDataset[] = [];

function render(): void {
  if (!datasets.length) return;
  const tf = timeframeEl.value as SupportedTimeframe;
  const candles = aggregateFrom1m(datasets[0].candles1m, tf);
  const detected = scanCandidateDates(datasets[0].candles1m).filter((d) => modeEl.value !== "practice" || d.needsPractice);
  datesEl.innerHTML = detected.map((d) => `<div>${d.date} — ${d.rule} — ${d.reason}</div>`).join("");

  const result = runStrategy(candles);
  renderExplainPanel(explainEl, result);
  renderCandlestickChart(canvas, candles, result, tooltip);

  if (modeEl.value === "auto") {
    pnlEl.textContent = `Auto Reply cumulative PnL: ${computeAutoPnl(result.markers).toFixed(2)}`;
  } else {
    const entry = Number(manualEntryEl.value || result.markers.find((m) => m.kind === "entry")?.price || 0);
    const exit = Number(manualExitEl.value || result.markers.find((m) => m.kind === "tp40")?.price || 0);
    pnlEl.textContent = `Manual Reply cumulative PnL: ${computeManualPnl(entry, exit).toFixed(2)}`;
  }
}

async function loadSample(): Promise<void> {
  const resp = await fetch("./sample/sample-1m.json");
  const candles = await resp.json();
  datasets = [{ symbol: "SAMPLE", candles1m: candles, sourceName: "sample-1m.json" }];
  render();
}

fileEl.addEventListener("change", async () => {
  if (!fileEl.files?.length) return;
  datasets = await parseFiles(fileEl.files);
  render();
});

timeframeEl.addEventListener("change", render);
modeEl.addEventListener("change", render);
manualEntryEl.addEventListener("change", render);
manualExitEl.addEventListener("change", render);
sampleBtn.addEventListener("click", () => void loadSample());

void loadSample();

import { renderExplainPanel } from './annotations/explainPanel.js';
import { parseFiles } from './parser/fileParser.js';
import { runStrategy } from './strategy/engine.js';
import { aggregateFrom1m } from './timeframe/aggregate.js';
import { scanCandidateDates } from './timeframe/dateScan.js';
import { renderCandlestickChart } from './ui/chart.js';
import { clampCursor, createReplayState, detectReplayCheckpoint, getVisibleCandles, jumpToDateStart, jumpToSessionStart, replayCheckpoint } from './replay/replayState.js';
import { computeAutoReplayPnl, computeManualReplayPnl } from './simulation/tradeReplay.js';

const timeframeEl = document.querySelector('#timeframe');
const fileEl = document.querySelector('#fileInput');
const sampleBtn = document.querySelector('#sampleBtn');
const datesEl = document.querySelector('#dates');
const candidateDateEl = document.querySelector('#candidateDate');
const modeEl = document.querySelector('#mode');
const pnlEl = document.querySelector('#pnl');
const explainEl = document.querySelector('#explain');
const canvas = document.querySelector('#chart');
const tooltip = document.querySelector('#tooltip');
const progressEl = document.querySelector('#replayProgress');
const playBtn = document.querySelector('#playBtn');
const pauseBtn = document.querySelector('#pauseBtn');
const stepForwardBtn = document.querySelector('#stepForwardBtn');
const stepBackBtn = document.querySelector('#stepBackBtn');
const jumpSessionBtn = document.querySelector('#jumpSessionBtn');
const jumpDateBtn = document.querySelector('#jumpDateBtn');
const speedEl = document.querySelector('#replaySpeed');
const revealAnswerBtn = document.querySelector('#revealAnswerBtn');
const manualEntryBtn = document.querySelector('#setManualEntryBtn');
const manualExitBtn = document.querySelector('#setManualExitBtn');
const autoStopCheckpointEl = document.querySelector('#autoStopCheckpoint');

let datasets = [];
let fullCandles = [];
let filteredDates = [];
let replay = createReplayState();
let replayTimer = null;
let revealManualAnswer = false;
let manualState = { entryPrice: null, exitPrice: null };

if (autoStopCheckpointEl) autoStopCheckpointEl.checked = replay.autoStopCheckpointEnabled;

function stopPlayback() {
  replay.isPlaying = false;
  if (replayTimer) {
    window.clearInterval(replayTimer);
    replayTimer = null;
  }
}

function render(checkpointOverride = null) {
  if (!datasets.length) return;

  const tf = timeframeEl.value;
  fullCandles = aggregateFrom1m(datasets[0].candles1m, tf);
  filteredDates = scanCandidateDates(datasets[0].candles1m).filter((d) => modeEl.value !== 'practice' || d.needsPractice);

  datesEl.innerHTML = filteredDates
    .map((d) => `<div>${d.date} — ${d.rule} — ${d.reason}${d.needsPractice ? ` — Practice: ${d.practiceReason}` : ''}</div>`)
    .join('');
  candidateDateEl.innerHTML = filteredDates.map((d) => `<option value="${d.date}">${d.date} (${d.rule})</option>`).join('');

  replay.cursor = clampCursor(replay.cursor, fullCandles.length);
  const visibleCandles = getVisibleCandles(fullCandles, replay.cursor);
  const result = runStrategy(visibleCandles);
  const checkpoint = checkpointOverride ?? detectReplayCheckpoint(visibleCandles, replay.lastCheckpoint);
  replay.lastCheckpoint = checkpoint.checkpoint;

  renderExplainPanel(explainEl, result, {
    revealAnswer: modeEl.value === 'manual' && revealManualAnswer,
    replayCursor: replay.cursor,
    visibleCount: visibleCandles.length,
    checkpoint
  });
  renderCandlestickChart(canvas, visibleCandles, result, tooltip, checkpoint);

  if (modeEl.value === 'auto') {
    const auto = computeAutoReplayPnl(result);
    pnlEl.textContent = `Auto Reply cumulative PnL: ${auto.pnl.toFixed(2)} (${auto.status})`;
  } else {
    const manual = computeManualReplayPnl(manualState, visibleCandles);
    pnlEl.textContent = `Manual Reply cumulative PnL: ${manual.pnl.toFixed(2)} (${manual.status})`;
  }

  const currentTime = visibleCandles.at(-1)?.time ?? 'n/a';
  progressEl.textContent = `Replay: bar ${visibleCandles.length}/${fullCandles.length} @ ${currentTime}`;
}

function setCursor(next) {
  replay.cursor = clampCursor(next, fullCandles.length);
  render();
}

function play() {
  if (!fullCandles.length) return;
  stopPlayback();
  replay.isPlaying = true;
  replayTimer = window.setInterval(() => {
    if (replay.cursor >= fullCandles.length - 1) {
      stopPlayback();
      return;
    }
    replay.cursor += 1;
    const visibleCandles = getVisibleCandles(fullCandles, replay.cursor);
    const checkpoint = detectReplayCheckpoint(visibleCandles, replay.lastCheckpoint);
    replay.lastCheckpoint = checkpoint.checkpoint;
    render(checkpoint);
    if (replay.autoStopCheckpointEnabled && checkpoint.hit) {
      stopPlayback();
    }
  }, replay.speedMs);
}

async function loadSample() {
  const resp = await fetch('./sample/sample-1m.json');
  const candles = await resp.json();
  datasets = [{ symbol: 'SAMPLE', candles1m: candles, sourceName: 'sample-1m.json' }];
  replay.cursor = 0;
  replay.lastCheckpoint = replayCheckpoint.none;
  manualState = { entryPrice: null, exitPrice: null };
  render();
}

function setManualFromCurrent(kind) {
  const visible = getVisibleCandles(fullCandles, replay.cursor);
  const price = visible.at(-1)?.close;
  if (price == null) return;
  if (kind === 'entry') manualState.entryPrice = price;
  if (kind === 'exit') manualState.exitPrice = price;
  render();
}

fileEl.addEventListener('change', async () => {
  if (!fileEl.files?.length) return;
  stopPlayback();
  datasets = await parseFiles(fileEl.files);
  replay.cursor = 0;
  replay.lastCheckpoint = replayCheckpoint.none;
  manualState = { entryPrice: null, exitPrice: null };
  render();
});

timeframeEl.addEventListener('change', () => {
  stopPlayback();
  replay.cursor = 0;
  replay.lastCheckpoint = replayCheckpoint.none;
  render();
});
modeEl.addEventListener('change', render);
sampleBtn.addEventListener('click', () => void loadSample());
playBtn.addEventListener('click', play);
pauseBtn.addEventListener('click', stopPlayback);
stepForwardBtn.addEventListener('click', () => {
  stopPlayback();
  setCursor(replay.cursor + 1);
});
stepBackBtn.addEventListener('click', () => {
  stopPlayback();
  setCursor(replay.cursor - 1);
});
jumpSessionBtn.addEventListener('click', () => {
  stopPlayback();
  setCursor(jumpToSessionStart());
});
jumpDateBtn.addEventListener('click', () => {
  stopPlayback();
  setCursor(jumpToDateStart(fullCandles, candidateDateEl.value));
});
speedEl.addEventListener('change', () => {
  replay.speedMs = Number(speedEl.value);
  if (replay.isPlaying) play();
});
revealAnswerBtn.addEventListener('click', () => {
  revealManualAnswer = !revealManualAnswer;
  render();
});
manualEntryBtn.addEventListener('click', () => setManualFromCurrent('entry'));
manualExitBtn.addEventListener('click', () => setManualFromCurrent('exit'));
autoStopCheckpointEl?.addEventListener('change', () => {
  replay.autoStopCheckpointEnabled = autoStopCheckpointEl.checked;
});

void loadSample();

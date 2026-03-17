const markerColor = { source: '#2563eb', entry: '#16a34a', stop: '#dc2626', tp30: '#9333ea', tp35: '#a855f7', tp40: '#c026d3', tp50: '#db2777' };

const chartStateMap = new WeakMap();
const BASE_VISIBLE_BARS = 80;
const MIN_SCALE = 0.5;
const MAX_SCALE = 6;

function getOrCreateState(canvas) {
  const existing = chartStateMap.get(canvas);
  if (existing) return existing;
  const state = {
    viewport: { startIndex: 0, endIndex: 0, scale: 1 },
    drag: { active: false, lastX: 0, pointerId: null },
    markerPoints: [],
    candles: [],
    result: null,
    tooltip: null,
    timeframe: '1m'
  };
  bindInteraction(canvas, state);
  chartStateMap.set(canvas, state);
  return state;
}

function bindInteraction(canvas, state) {
  canvas.addEventListener('wheel', (event) => {
    if (!state.candles.length) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const plot = getPlotBox(canvas);
    const x = event.clientX - rect.left;
    const ratio = clamp((x - plot.left) / Math.max(1, plot.width), 0, 1);
    const barsInView = state.viewport.endIndex - state.viewport.startIndex + 1;
    const anchorIndex = state.viewport.startIndex + ratio * Math.max(0, barsInView - 1);

    const zoomFactor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    state.viewport.scale = clamp(state.viewport.scale * zoomFactor, MIN_SCALE, MAX_SCALE);
    const nextBars = resolveBarsInView(state.candles.length, state.viewport.scale);
    const nextStart = Math.round(anchorIndex - ratio * Math.max(0, nextBars - 1));
    setViewportRange(state, nextStart, nextBars, state.candles.length);
    draw(canvas, state);
  }, { passive: false });

  canvas.addEventListener('pointerdown', (event) => {
    state.drag.active = true;
    state.drag.lastX = event.clientX;
    state.drag.pointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!state.drag.active || event.pointerId !== state.drag.pointerId || !state.candles.length) return;
    const plot = getPlotBox(canvas);
    const barsInView = Math.max(1, state.viewport.endIndex - state.viewport.startIndex + 1);
    const step = plot.width / barsInView;
    const shift = Math.round((state.drag.lastX - event.clientX) / Math.max(1, step));
    if (shift !== 0) {
      const nextStart = state.viewport.startIndex + shift;
      setViewportRange(state, nextStart, barsInView, state.candles.length);
      state.drag.lastX = event.clientX;
      draw(canvas, state);
    }
  });

  const stopDrag = (event) => {
    if (event.pointerId !== state.drag.pointerId) return;
    state.drag.active = false;
    state.drag.pointerId = null;
    canvas.releasePointerCapture(event.pointerId);
  };

  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointercancel', stopDrag);

  canvas.addEventListener('mousemove', (event) => {
    const tooltip = state.tooltip;
    if (!tooltip) return;
    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const hit = state.markerPoints.find((m) => Math.hypot(mx - m.x, my - m.y) < 8);
    if (!hit) {
      tooltip.style.display = 'none';
      return;
    }
    tooltip.style.display = 'block';
    tooltip.style.left = `${event.pageX + 10}px`;
    tooltip.style.top = `${event.pageY + 10}px`;
    tooltip.innerHTML = `<strong>${hit.ruleName}</strong><br/>Reasoning: ${hit.reasoning}<br/>Price: ${hit.price.toFixed(2)}<br/>Time: ${hit.time}`;
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resolveBarsInView(totalBars, scale) {
  return clamp(Math.round(BASE_VISIBLE_BARS / scale), 10, Math.max(10, totalBars || 10));
}

function setViewportRange(state, startIndex, barsInView, totalBars) {
  if (!totalBars) {
    state.viewport.startIndex = 0;
    state.viewport.endIndex = 0;
    return;
  }
  const bars = clamp(Math.round(barsInView), 1, totalBars);
  const maxStart = Math.max(0, totalBars - bars);
  const start = clamp(Math.round(startIndex), 0, maxStart);
  state.viewport.startIndex = start;
  state.viewport.endIndex = start + bars - 1;
}

function getPlotBox(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const pad = { left: 40, right: 70, top: 20, bottom: 56 };
  return {
    left: pad.left,
    top: pad.top,
    right: w - pad.right,
    bottom: h - pad.bottom,
    width: w - pad.left - pad.right,
    height: h - pad.top - pad.bottom,
    pad,
    w,
    h
  };
}

function formatXAxisLabel(time, timeframe) {
  const d = new Date(time);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit' }).format(d);
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  if (timeframe === '1D') return date;
  if (timeframe === '1h' || timeframe === '4h') return `${date} ${hm}`;
  return hm;
}

function draw(canvas, state) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const plot = getPlotBox(canvas);
  const { w, h, left, right, top, bottom, width, height } = plot;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, w, h);

  const candles = state.candles;
  if (!candles.length || !state.result) {
    state.markerPoints = [];
    return;
  }

  const visible = candles.slice(state.viewport.startIndex, state.viewport.endIndex + 1);
  const idxOffset = state.viewport.startIndex;
  const maxPrice = Math.max(...visible.map((c) => c.high), state.result.overlays.hod, ...state.result.markers.map((m) => m.price));
  const minPrice = Math.min(...visible.map((c) => c.low), state.result.overlays.lod, ...state.result.markers.map((m) => m.price));
  const priceToY = (p) => bottom - ((p - minPrice) / (maxPrice - minPrice || 1)) * height;
  const stepX = width / Math.max(1, visible.length);
  const candleW = Math.max(3, stepX * 0.7);

  visible.forEach((c, i) => {
    const x = left + stepX * (i + 0.5);
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(x, priceToY(c.high));
    ctx.lineTo(x, priceToY(c.low));
    ctx.stroke();

    const up = c.close >= c.open;
    ctx.fillStyle = up ? '#22c55e' : '#ef4444';
    const y = priceToY(Math.max(c.open, c.close));
    const bodyH = Math.max(1, Math.abs(priceToY(c.close) - priceToY(c.open)));
    ctx.fillRect(x - candleW / 2, y, candleW, bodyH);
  });

  const drawHLine = (price, color, label) => {
    const y = priceToY(price);
    ctx.strokeStyle = color;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.fillText(label, right + 4, y + 3);
  };

  ctx.strokeStyle = '#f59e0b';
  ctx.beginPath();
  visible.forEach((_, i) => {
    const globalIndex = idxOffset + i;
    const p = state.result.overlays.ema20[globalIndex];
    if (typeof p !== 'number') return;
    const x = left + stepX * (i + 0.5);
    const y = priceToY(p);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  drawHLine(state.result.overlays.previousClose, '#94a3b8', 'prev close');
  drawHLine(state.result.overlays.hos, '#38bdf8', 'HOS');
  drawHLine(state.result.overlays.los, '#0ea5e9', 'LOS');
  drawHLine(state.result.overlays.hod, '#eab308', 'HOD');
  drawHLine(state.result.overlays.lod, '#f97316', 'LOD');

  state.markerPoints = state.result.markers
    .map((m) => {
      const idx = candles.findIndex((c) => c.time === m.time);
      if (idx < state.viewport.startIndex || idx > state.viewport.endIndex) return null;
      const x = left + stepX * (idx - state.viewport.startIndex + 0.5);
      const y = priceToY(m.price);
      ctx.fillStyle = markerColor[m.kind];
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      return { ...m, x, y };
    })
    .filter(Boolean);

  ctx.strokeStyle = '#334155';
  ctx.beginPath();
  ctx.moveTo(left, bottom + 0.5);
  ctx.lineTo(right, bottom + 0.5);
  ctx.stroke();

  const tickCount = Math.min(8, visible.length);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < tickCount; i += 1) {
    const ratio = tickCount === 1 ? 0 : i / (tickCount - 1);
    const idx = Math.round((visible.length - 1) * ratio);
    const x = left + stepX * (idx + 0.5);
    const t = visible[idx]?.time;
    if (!t) continue;
    ctx.beginPath();
    ctx.moveTo(x, bottom);
    ctx.lineTo(x, bottom + 5);
    ctx.strokeStyle = '#334155';
    ctx.stroke();
    ctx.fillText(formatXAxisLabel(t, state.timeframe), x, h - 18);
  }
}

export function renderCandlestickChart(canvas, candles, result, tooltip, timeframe = '1m') {
  const state = getOrCreateState(canvas);
  state.candles = candles;
  state.result = result;
  state.tooltip = tooltip;
  state.timeframe = timeframe;

  const totalBars = candles.length;
  if (!totalBars) {
    setViewportRange(state, 0, 1, 0);
    draw(canvas, state);
    return;
  }

  const desiredBars = resolveBarsInView(totalBars, state.viewport.scale);
  const prevEnd = state.viewport.endIndex;
  const prevLast = totalBars - 2;
  const isFollowingRightEdge = prevEnd >= prevLast;
  if (isFollowingRightEdge) {
    const nextStart = Math.max(0, totalBars - desiredBars);
    setViewportRange(state, nextStart, desiredBars, totalBars);
  } else {
    setViewportRange(state, state.viewport.startIndex, desiredBars, totalBars);
  }

  draw(canvas, state);
}

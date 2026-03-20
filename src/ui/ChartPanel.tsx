import { useCallback, useMemo, useRef } from 'react';
import {
  Bar,
  ComposedChart,
  Customized,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { annotationColor } from '../annotations/palette';
import type { Annotation, OhlcvBar, RuleTraceItem, UnifiedSignalDayStrategy } from '../types/domain';
import { toNyLabel } from '../strategy/engine';

interface ViewportRange {
  startIndex: number;
  endIndex: number;
}

interface Props {
  bars: OhlcvBar[];
  ema20: number[];
  annotations: Annotation[];
  replayMarkerTime?: string;
  previousClose?: number;
  hos?: number;
  los?: number;
  hod?: number;
  lod?: number;
  statusBanner: string;
  unifiedStrategy: UnifiedSignalDayStrategy;
  viewport: ViewportRange;
  onViewportChange: (viewport: ViewportRange) => void;
}

type ChartRow = OhlcvBar & {
  label: string;
  fullLabel: string;
  sourceLabel: string;
  ema20: number;
  wickTop: number;
  dataIndex: number;
};

const MIN_VISIBLE_BARS = 20;
const traceText = (trace: RuleTraceItem[]) =>
  trace
    .map((item) => `${item.ruleName}: ${item.passed ? 'pass' : 'fail'} (${item.reason})`)
    .join(' | ');
const normalizedLabel = (barTime?: string) => (barTime ? toNyLabel(barTime) : 'n/a');
const sourceLabel = (
  bar?: Pick<OhlcvBar, 'sourceTime' | 'rawDateText' | 'rawTimeText' | 'time'>,
) => {
  if (!bar) return 'n/a';
  if (bar.rawDateText && bar.rawTimeText) return `${bar.rawDateText} ${bar.rawTimeText}`;
  return bar.sourceTime ?? bar.time;
};
const dstAdjusted = (bar?: Pick<OhlcvBar, 'sourceTime' | 'normalizedTime'>) =>
  Boolean(
    bar?.sourceTime && bar?.normalizedTime && bar.sourceTime !== bar.normalizedTime,
  );
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const normalizeViewport = (viewport: ViewportRange, totalBars: number): ViewportRange => {
  if (totalBars <= 0) return { startIndex: 0, endIndex: 0 };
  const maxIndex = totalBars - 1;
  const startIndex = clamp(Math.round(viewport.startIndex), 0, maxIndex);
  const endIndex = clamp(Math.round(viewport.endIndex), startIndex, maxIndex);
  return { startIndex, endIndex };
};

const CandlestickLayer = ({ formattedGraphicalItems }: any) => {
  const points = formattedGraphicalItems?.[0]?.props?.points;
  if (!Array.isArray(points)) return null;
  return (
    <g>
      {points.map((point: any) => {
        const p = point.payload as ChartRow;
        const x = point.x + point.width / 2;
        const openY = point.yAxis.scale(p.open);
        const closeY = point.yAxis.scale(p.close);
        const highY = point.yAxis.scale(p.high);
        const lowY = point.yAxis.scale(p.low);
        const bodyY = Math.min(openY, closeY);
        const bodyHeight = Math.max(2, Math.abs(closeY - openY));
        const width = Math.max(3, point.width * 0.68);
        const bullish = p.close >= p.open;
        return (
          <g key={p.time}>
            <line x1={x} y1={highY} x2={x} y2={lowY} stroke="#64748b" />
            <rect
              x={x - width / 2}
              y={bodyY}
              width={width}
              height={bodyHeight}
              fill={bullish ? '#22c55e' : '#ef4444'}
              rx={1}
            />
          </g>
        );
      })}
    </g>
  );
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const candle = payload.find((item: any) => item?.payload?.open !== undefined)
    ?.payload as ChartRow | undefined;
  const annotation = payload.find((item: any) => item?.payload?.annotation)?.payload
    ?.annotation as Annotation | undefined;
  return (
    <div className="tooltip-card">
      <strong>{annotation?.label ?? candle?.fullLabel}</strong>
      {annotation ? (
        <>
          <div>Rule: {annotation.label}</div>
          <div>Reason: {annotation.reasoning}</div>
          <div>Normalized time: {normalizedLabel(annotation.barTime)}</div>
          <div>Price: {annotation.price.toFixed(4)}</div>
          <div>Trace: {traceText(annotation.trace)}</div>
        </>
      ) : candle ? (
        <>
          <div>Normalized time: {candle.fullLabel}</div>
          <div>Source time: {candle.sourceLabel}</div>
          {dstAdjusted(candle) && <div>DST-adjusted</div>}
          <div>
            O {candle.open.toFixed(4)} H {candle.high.toFixed(4)} L {candle.low.toFixed(4)} C{' '}
            {candle.close.toFixed(4)}
          </div>
          <div>20EMA {candle.ema20.toFixed(4)}</div>
        </>
      ) : null}
    </div>
  );
};

export function ChartPanel({
  bars,
  ema20,
  annotations,
  replayMarkerTime,
  previousClose,
  hos,
  los,
  hod,
  lod,
  statusBanner,
  unifiedStrategy,
  viewport,
  onViewportChange,
}: Props) {
  if (bars.length !== ema20.length) {
    throw new Error(`ChartPanel received ${bars.length} bars but ${ema20.length} EMA values.`);
  }
  const invalidBar = bars.find((bar) => !bar.time || !Number.isFinite(bar.open) || !Number.isFinite(bar.high) || !Number.isFinite(bar.low) || !Number.isFinite(bar.close));
  if (invalidBar) {
    throw new Error(`ChartPanel received an invalid OHLC bar at ${invalidBar.time || 'unknown time'}.`);
  }

  const chartRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    startX: number;
    viewport: ViewportRange;
  } | null>(null);

  const data = useMemo(
    () =>
      bars.map((bar, index) => ({
        ...bar,
        label: normalizedLabel(bar.normalizedTime ?? bar.time),
        fullLabel: normalizedLabel(bar.normalizedTime ?? bar.time),
        sourceLabel: sourceLabel(bar),
        ema20: ema20[index] ?? bar.close,
        wickTop: bar.high,
        dataIndex: index,
      })),
    [bars, ema20],
  );

  const safeViewport = useMemo(
    () => normalizeViewport(viewport, data.length),
    [viewport, data.length],
  );
  const visibleData = useMemo(
    () => data.slice(safeViewport.startIndex, safeViewport.endIndex + 1),
    [data, safeViewport],
  );
  const marker = replayMarkerTime
    ? data.find((bar: ChartRow) => bar.time === replayMarkerTime)
    : undefined;
  const visibleCount = Math.max(safeViewport.endIndex - safeViewport.startIndex + 1, 1);

  const emitViewport = useCallback(
    (nextViewport: ViewportRange) => {
      const normalized = normalizeViewport(nextViewport, data.length);
      if (
        normalized.startIndex !== safeViewport.startIndex ||
        normalized.endIndex !== safeViewport.endIndex
      ) {
        onViewportChange(normalized);
      }
    },
    [data.length, onViewportChange, safeViewport.endIndex, safeViewport.startIndex],
  );

  const zoomViewport = useCallback(
    (deltaY: number, anchorRatio: number) => {
      if (data.length <= 1) return;
      const currentSize = visibleCount;
      const direction = deltaY > 0 ? 1 : -1;
      const step = Math.max(1, Math.round(currentSize * 0.12));
      const nextSize = clamp(
        currentSize + direction * step,
        Math.min(MIN_VISIBLE_BARS, data.length),
        data.length,
      );
      if (nextSize === currentSize) return;
      const boundedAnchor = clamp(anchorRatio, 0, 1);
      const anchorIndex = safeViewport.startIndex + Math.round((currentSize - 1) * boundedAnchor);
      const nextStart = clamp(
        anchorIndex - Math.round((nextSize - 1) * boundedAnchor),
        0,
        Math.max(data.length - nextSize, 0),
      );
      emitViewport({
        startIndex: nextStart,
        endIndex: nextStart + nextSize - 1,
      });
    },
    [data.length, emitViewport, safeViewport.startIndex, visibleCount],
  );

  const handleWheel = useCallback(
    (event: any) => {
      event.preventDefault();
      const rect = chartRef.current?.getBoundingClientRect();
      const anchorRatio = rect ? (event.clientX - rect.left) / rect.width : 0.5;
      zoomViewport(event.deltaY, anchorRatio);
    },
    [zoomViewport],
  );

  const handleMouseDown = useCallback(
    (event: any) => {
      if (event.button !== 0) return;
      dragStateRef.current = {
        startX: event.clientX,
        viewport: safeViewport,
      };
    },
    [safeViewport],
  );

  const stopDragging = useCallback(() => {
    dragStateRef.current = null;
  }, []);

  const handleMouseMove = useCallback(
    (event: any) => {
      const dragState = dragStateRef.current;
      const width = chartRef.current?.clientWidth ?? 0;
      if (!dragState || width <= 0 || data.length <= visibleCount) return;
      const deltaX = event.clientX - dragState.startX;
      const barsPerPixel = visibleCount / width;
      const shift = Math.round(deltaX * barsPerPixel);
      if (shift === 0) return;
      const nextStart = clamp(
        dragState.viewport.startIndex - shift,
        0,
        Math.max(data.length - visibleCount, 0),
      );
      emitViewport({
        startIndex: nextStart,
        endIndex: nextStart + visibleCount - 1,
      });
    },
    [data.length, emitViewport, visibleCount],
  );

  return (
    <section className="chart-shell">
      <div className="status-banner">{statusBanner}</div>
      <div className="chart-stage-note">
        Score: {unifiedStrategy.score}/100 · Band: {unifiedStrategy.scoreBand} · Entry allowed: {unifiedStrategy.entryAllowed ? 'yes' : 'no'}
      </div>
      <div className="chart-stage-note">
        Direction: {unifiedStrategy.direction} · Template: {unifiedStrategy.templateType ?? 'n/a'}
      </div>
      <div className="chart-stage-note">
        Hard gates: {unifiedStrategy.hardGates.map((gate) => `${gate.key}:${gate.passed ? 'pass' : 'fail'}`).join(' · ')}
      </div>
      <div className="chart-stage-note">
        Score breakdown: {Object.entries(unifiedStrategy.debugBreakdown.byCategory).map(([category, score]) => `${category}=${score}`).join(' · ')}
      </div>
      <div className="chart-stage-note">
        Top positive features: {unifiedStrategy.debugBreakdown.topPositiveFeatures.map((feature) => `${feature.key}(+${feature.contribution})`).join(' · ') || 'none'}
      </div>
      <div className="chart-stage-note">
        Missing high-value features: {unifiedStrategy.debugBreakdown.missingHighValueFeatures.map((feature) => feature.key).join(' · ') || 'none'}
      </div>
      <div className="chart-stage-note">
        Replay marker: {replayMarkerTime ? toNyLabel(replayMarkerTime) : 'n/a'}
      </div>
      <div className="chart-interaction-note">
        Wheel to zoom the visible range. Drag to pan within revealed bars.
      </div>
      <div
        ref={chartRef}
        className="chart-interaction-layer"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDragging}
        onMouseLeave={stopDragging}
      >
        <ResponsiveContainer width="100%" height={620}>
          <ComposedChart data={visibleData} margin={{ top: 12, right: 24, left: 8, bottom: 24 }}>
            <XAxis
              dataKey="label"
              minTickGap={36}
              tick={{ fill: '#cbd5e1', fontSize: 12 }}
              tickMargin={10}
              interval="preserveStartEnd"
            />
            <YAxis domain={['auto', 'auto']} width={72} tick={{ fill: '#cbd5e1', fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="wickTop" fill="transparent" isAnimationActive={false} />
            <Customized component={CandlestickLayer} />
            <Line dataKey="ema20" dot={false} stroke="#a855f7" isAnimationActive={false} />
            {previousClose !== undefined && (
              <ReferenceLine y={previousClose} stroke="#818cf8" label="previous close" />
            )}
            {hos !== undefined && <ReferenceLine y={hos} stroke="#fb7185" label="HOS" />}
            {los !== undefined && <ReferenceLine y={los} stroke="#34d399" label="LOS" />}
            {hod !== undefined && <ReferenceLine y={hod} stroke="#f59e0b" label="HOD" />}
            {lod !== undefined && <ReferenceLine y={lod} stroke="#38bdf8" label="LOD" />}
            {marker && visibleData.some((row: ChartRow) => row.time === marker.time) && (
              <ReferenceLine x={marker.label} stroke="#f8fafc" label="replay" />
            )}
            {annotations
              .filter((annotation) => {
                const row = data.find((item: ChartRow) => item.time === annotation.barTime);
                return row !== undefined && row.dataIndex >= safeViewport.startIndex && row.dataIndex <= safeViewport.endIndex;
              })
              .map((annotation) => {
                const row = data.find((item: ChartRow) => item.time === annotation.barTime);
                if (!row) return null;
                return (
                  <Scatter
                    key={annotation.id}
                    data={[
                      {
                        x: row.label,
                        y: annotation.price,
                        annotation,
                      },
                    ]}
                    fill={annotationColor(annotation.kind)}
                    isAnimationActive={false}
                  />
                );
              })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

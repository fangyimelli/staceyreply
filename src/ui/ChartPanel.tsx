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
import type { Annotation, OhlcvBar } from '../types/domain';
import { annotationColor } from '../annotations/palette';
import { toNyLabel } from '../strategy/engine';

interface Props {
  bars: OhlcvBar[];
  ema20: number[];
  annotations: Annotation[];
  previousClose?: number;
  hos?: number;
  los?: number;
  hod?: number;
  lod?: number;
}

interface ChartRow extends OhlcvBar {
  index: number;
  label: string;
  ema20: number;
  wickTop: number;
}

const formatTraceMap = (trace?: Record<string, string | number>) => {
  if (!trace) return [];
  return Object.entries(trace).map(([key, value]) => `${key}: ${value}`);
};

const CandlestickLayer = ({ formattedGraphicalItems }: any) => {
  const points = formattedGraphicalItems?.[0]?.props?.points;
  if (!Array.isArray(points)) return null;

  return (
    <g>
      {points.map((point: any) => {
        const payload = point.payload as ChartRow;
        const wickX = point.x + point.width / 2;
        const openY = point.y;
        const closeY = point.y + point.height;
        const highY = point.yAxis.scale(payload.high);
        const lowY = point.yAxis.scale(payload.low);
        const bullish = payload.close >= payload.open;
        const bodyY = Math.min(openY, closeY);
        const bodyHeight = Math.max(Math.abs(closeY - openY), 2);
        const bodyWidth = Math.max(point.width * 0.72, 3);
        const bodyX = wickX - bodyWidth / 2;
        const fill = bullish ? '#16a34a' : '#dc2626';

        return (
          <g key={payload.time}>
            <line x1={wickX} y1={highY} x2={wickX} y2={lowY} stroke="#334155" strokeWidth={1.2} />
            <rect
              x={bodyX}
              y={bodyY}
              width={bodyWidth}
              height={bodyHeight}
              fill={fill}
              stroke={fill}
              rx={1}
            />
          </g>
        );
      })}
    </g>
  );
};

const CustomTooltip = ({ active, label, payload }: any) => {
  if (!active || !payload?.length) return null;
  const annotationPoint = payload.find((entry: any) => entry?.payload?.annotation)?.payload?.annotation as Annotation | undefined;
  const candlePoint = payload.find((entry: any) => entry?.payload?.open !== undefined)?.payload as ChartRow | undefined;

  return (
    <div style={{ background: '#fff', border: '1px solid #cbd5e1', padding: 10, maxWidth: 320 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{annotationPoint ? annotationPoint.ruleName : `Bar ${label}`}</div>
      {annotationPoint ? (
        <>
          <div>判斷依據: {annotationPoint.reasoning}</div>
          <div>Price: {annotationPoint.price.toFixed(5)}</div>
          <div>Time: {toNyLabel(annotationPoint.barTime)}</div>
          {formatTraceMap(annotationPoint.tracePrices).map((item) => (
            <div key={item}>{item}</div>
          ))}
          {formatTraceMap(annotationPoint.traceTimes).map((item) => (
            <div key={item}>{item}</div>
          ))}
        </>
      ) : candlePoint ? (
        <>
          <div>Time: {toNyLabel(candlePoint.time)}</div>
          <div>O: {candlePoint.open.toFixed(5)}</div>
          <div>H: {candlePoint.high.toFixed(5)}</div>
          <div>L: {candlePoint.low.toFixed(5)}</div>
          <div>C: {candlePoint.close.toFixed(5)}</div>
          <div>20EMA: {candlePoint.ema20.toFixed(5)}</div>
        </>
      ) : null}
    </div>
  );
};

export function ChartPanel({ bars, ema20, annotations, previousClose, hos, los, hod, lod }: Props) {
  const data: ChartRow[] = bars.map((bar, index) => ({
    ...bar,
    index,
    label: toNyLabel(bar.time),
    ema20: ema20[index],
    wickTop: bar.high,
  }));
  const annotationData = annotations.map((annotation) => ({
    x: toNyLabel(annotation.barTime),
    y: annotation.price,
    annotation,
    label: toNyLabel(annotation.barTime),
    open: undefined,
  }));

  return (
    <ResponsiveContainer width="100%" height={560}>
      <ComposedChart data={data} margin={{ top: 16, right: 32, left: 8, bottom: 16 }}>
        <XAxis dataKey="label" minTickGap={40} />
        <YAxis domain={[ 'auto', 'auto' ]} width={90} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="wickTop" fill="transparent" isAnimationActive={false} />
        <Customized component={CandlestickLayer} />
        <Line type="monotone" dataKey="ema20" stroke="#a855f7" dot={false} name="20EMA" isAnimationActive={false} />
        {previousClose !== undefined && <ReferenceLine y={previousClose} stroke="#6366f1" label="previous close" />}
        {hos !== undefined && <ReferenceLine y={hos} stroke="#ef4444" label="HOS" />}
        {los !== undefined && <ReferenceLine y={los} stroke="#10b981" label="LOS" />}
        {hod !== undefined && <ReferenceLine y={hod} stroke="#f97316" label="HOD" />}
        {lod !== undefined && <ReferenceLine y={lod} stroke="#0ea5e9" label="LOD" />}
        {annotations.map((annotation) => (
          <Scatter
            key={annotation.id}
            name={annotation.ruleName}
            data={annotationData.filter((item) => item.annotation.id === annotation.id)}
            fill={annotationColor(annotation.kind)}
            isAnimationActive={false}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

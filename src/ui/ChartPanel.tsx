import { Bar, ComposedChart, Customized, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import { annotationColor } from '../annotations/palette';
import type { Annotation, OhlcvBar, RuleTraceItem } from '../types/domain';
import { toNyLabel } from '../strategy/engine';

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
}

type ChartRow = OhlcvBar & { label: string; ema20: number; wickTop: number };

const traceText = (trace: RuleTraceItem[]) => trace.map((item) => `${item.ruleName}: ${item.passed ? 'pass' : 'fail'} (${item.reason})`).join(' | ');
const normalizedLabel = (barTime?: string) => barTime ? toNyLabel(barTime) : 'n/a';
const sourceLabel = (bar?: Pick<OhlcvBar, 'sourceTime' | 'rawDateText' | 'rawTimeText' | 'time'>) => {
  if (!bar) return 'n/a';
  if (bar.rawDateText && bar.rawTimeText) return `${bar.rawDateText} ${bar.rawTimeText}`;
  return bar.sourceTime ?? bar.time;
};
const dstAdjusted = (bar?: Pick<OhlcvBar, 'sourceTime' | 'normalizedTime'>) => Boolean(bar?.sourceTime && bar?.normalizedTime && bar.sourceTime !== bar.normalizedTime);

const CandlestickLayer = ({ formattedGraphicalItems }: any) => {
  const points = formattedGraphicalItems?.[0]?.props?.points;
  if (!Array.isArray(points)) return null;
  return <g>{points.map((point: any) => {
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
    return <g key={p.time}><line x1={x} y1={highY} x2={x} y2={lowY} stroke="#64748b" /><rect x={x - width / 2} y={bodyY} width={width} height={bodyHeight} fill={bullish ? '#22c55e' : '#ef4444'} rx={1} /></g>;
  })}</g>;
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const candle = payload.find((item: any) => item?.payload?.open !== undefined)?.payload as ChartRow | undefined;
  const annotation = payload.find((item: any) => item?.payload?.annotation)?.payload?.annotation as Annotation | undefined;
  return <div className="tooltip-card">
    <strong>{annotation?.label ?? candle?.label}</strong>
    {annotation ? <>
      <div>Rule: {annotation.label}</div>
      <div>Reason: {annotation.reasoning}</div>
      <div>Normalized time: {normalizedLabel(annotation.barTime)}</div>
      <div>Price: {annotation.price.toFixed(4)}</div>
      <div>Trace: {traceText(annotation.trace)}</div>
    </> : candle ? <>
      <div>Normalized time: {normalizedLabel(candle.normalizedTime ?? candle.time)}</div>
      <div>Source time: {sourceLabel(candle)}</div>
      {dstAdjusted(candle) && <div>DST-adjusted</div>}
      <div>O {candle.open.toFixed(4)} H {candle.high.toFixed(4)} L {candle.low.toFixed(4)} C {candle.close.toFixed(4)}</div>
      <div>20EMA {candle.ema20.toFixed(4)}</div>
    </> : null}
  </div>;
};

export function ChartPanel({ bars, ema20, annotations, replayMarkerTime, previousClose, hos, los, hod, lod, statusBanner }: Props) {
  const data: ChartRow[] = bars.map((bar, index) => ({ ...bar, label: String(index), ema20: ema20[index] ?? bar.close, wickTop: bar.high }));
  const marker = replayMarkerTime ? bars.find((bar) => bar.time === replayMarkerTime) : undefined;
  return <section className="chart-shell">
    <div className="status-banner">{statusBanner}</div>
    <div className="chart-stage-note">Replay marker: {replayMarkerTime ? toNyLabel(replayMarkerTime) : 'n/a'}</div>
    <ResponsiveContainer width="100%" height={620}>
      <ComposedChart data={data} margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
        <XAxis dataKey="label" hide />
        <YAxis domain={['auto', 'auto']} width={72} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="wickTop" fill="transparent" isAnimationActive={false} />
        <Customized component={CandlestickLayer} />
        <Line dataKey="ema20" dot={false} stroke="#a855f7" isAnimationActive={false} />
        {previousClose !== undefined && <ReferenceLine y={previousClose} stroke="#818cf8" label="previous close" />}
        {hos !== undefined && <ReferenceLine y={hos} stroke="#fb7185" label="HOS" />}
        {los !== undefined && <ReferenceLine y={los} stroke="#34d399" label="LOS" />}
        {hod !== undefined && <ReferenceLine y={hod} stroke="#f59e0b" label="HOD" />}
        {lod !== undefined && <ReferenceLine y={lod} stroke="#38bdf8" label="LOD" />}
        {marker && <ReferenceLine x={data.findIndex((row) => row.time === marker.time)} stroke="#f8fafc" label="replay" />}
        {annotations.map((annotation) => <Scatter key={annotation.id} data={[{ x: data.findIndex((row) => row.time === annotation.barTime), y: annotation.price, annotation }]} fill={annotationColor(annotation.kind)} isAnimationActive={false} />)}
      </ComposedChart>
    </ResponsiveContainer>
  </section>;
}

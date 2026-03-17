import {
  CartesianGrid,
  ComposedChart,
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

export function ChartPanel({ bars, ema20, annotations, previousClose, hos, los, hod, lod }: Props) {
  const data = bars.map((b, i) => ({ ...b, label: toNyLabel(b.time), ema20: ema20[i] }));
  return (
    <ResponsiveContainer width="100%" height={560}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" minTickGap={40} />
        <YAxis domain={['auto', 'auto']} />
        <Tooltip
          formatter={(value: number, name: string) => [value.toFixed(5), name]}
          labelFormatter={(l) => `time: ${l}`}
        />
        <Line dataKey="close" stroke="#334155" dot={false} name="close" />
        <Line dataKey="ema20" stroke="#a855f7" dot={false} name="20EMA" />
        {previousClose && <ReferenceLine y={previousClose} stroke="#6366f1" label="previous close" />}
        {hos && <ReferenceLine y={hos} stroke="#ef4444" label="HOS" />}
        {los && <ReferenceLine y={los} stroke="#10b981" label="LOS" />}
        {hod && <ReferenceLine y={hod} stroke="#f97316" label="HOD" />}
        {lod && <ReferenceLine y={lod} stroke="#0ea5e9" label="LOD" />}
        {annotations.map((a) => (
          <Scatter
            key={a.id}
            data={[{ label: toNyLabel(a.barTime), close: a.price, tooltip: `${a.ruleName}: ${a.reasoning}; price=${a.price.toFixed(5)}; time=${toNyLabel(a.barTime)}` }]}
            fill={annotationColor(a.kind)}
            name={a.kind}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const key = (t, tf) => {
    const d = new Date(t);
    if (tf === '1D')
        return d.toISOString().slice(0, 10);
    const map = { '5m': 5, '15m': 15, '1h': 60, '4h': 240 };
    const m = map[tf];
    const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
    const b = Math.floor(mins / m) * m;
    const hh = String(Math.floor(b / 60)).padStart(2, '0');
    const mm = String(b % 60).padStart(2, '0');
    return `${d.toISOString().slice(0, 10)}T${hh}:${mm}`;
};
export const aggregate = (bars, tf) => {
    if (tf === '1m')
        return bars;
    const g = new Map();
    bars.forEach((b) => {
        const k = key(b.time, tf);
        const v = g.get(k) ?? [];
        v.push(b);
        g.set(k, v);
    });
    return [...g.entries()].map(([, v]) => ({ time: v[0].time, open: v[0].open, high: Math.max(...v.map((x) => x.high)), low: Math.min(...v.map((x) => x.low)), close: v[v.length - 1].close, volume: v.reduce((s, x) => s + x.volume, 0) }));
};
export const ema20 = (bars) => {
    const k = 2 / 21;
    const out = [];
    bars.forEach((b, i) => out.push(i === 0 ? b.close : b.close * k + out[i - 1] * (1 - k)));
    return out;
};

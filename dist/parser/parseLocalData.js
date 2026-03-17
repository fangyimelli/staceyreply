const toBar = (r) => ({
    time: r.time,
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume)
});
export const parseCsv = (text) => {
    const [head, ...rows] = text.trim().split(/\r?\n/);
    const cols = head.split(',').map((c) => c.trim());
    return rows.map((line) => {
        const vals = line.split(',');
        const row = {};
        cols.forEach((c, i) => { row[c] = vals[i]; });
        return toBar(row);
    });
};
export const parseJson = (text) => JSON.parse(text).map((v) => ({ ...v }));
export const parseFile = async (f) => {
    const t = await f.text();
    const bars = f.name.endsWith('.json') ? parseJson(t) : parseCsv(t);
    return { symbol: f.name.split('.')[0], bars };
};

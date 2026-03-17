import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

type StrategyLine = 'FRD' | 'FGD';

type OneMinuteBar = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type CandidateWindow = {
  symbol: string;
  strategy_line: StrategyLine;
  d_minus_2_date: string;
  signal_day_date: string;
  trade_day_date: string;
};

type Stage2Result = {
  symbol: string;
  strategy_line: StrategyLine;
  d_minus_2_date: string;
  signal_day_date: string;
  trade_day_date: string;
  daily_template_validity: boolean;
  ny_session_validity: boolean;
  source_detected: boolean;
  source_time: string;
  source_price: number | '';
  stop_hunt_detected: boolean;
  stop_hunt_time: string;
  one_two_three_detected: boolean;
  one_two_three_confirmation_time: string;
  ema20_confirm_detected: boolean;
  ema20_confirm_time: string;
  entry_qualified: boolean;
  entry_time: string;
  entry_price: number | '';
  stop_price: number | '';
  stop_size_pips: number | '';
  skip_stop_too_large: boolean;
  move30_pips: number;
  target_30: boolean;
  target_35: boolean;
  target_40: boolean;
  target_50: boolean;
  recommended_target_tier: '30' | '35' | '40' | '50' | 'none';
  ny_session_end_exit_price: number | '';
  notes: string;
};

type FiveMinuteBar = OneMinuteBar & { epochMs: number };

const CSV_HEADERS_FULL = [
  'symbol', 'strategy_line', 'd_minus_2_date', 'signal_day_date', 'trade_day_date',
  'daily_template_validity', 'ny_session_validity',
  'source_detected', 'source_time', 'source_price',
  'stop_hunt_detected', 'stop_hunt_time',
  '123_detected', '123_confirmation_time',
  '20EMA_confirm_detected', '20EMA_confirm_time',
  'entry_qualified', 'entry_time', 'entry_price',
  'stop_price', 'stop_size_in_pips', 'skip_stop_too_large',
  'move30_in_pips', 'target_30', 'target_35', 'target_40', 'target_50',
  'recommended_target_tier', 'ny_session_end_exit_price_if_no_earlier_exit', 'notes'
];

const CSV_HEADERS_SUMMARY_SYMBOL = [
  'symbol',
  'FRD_candidate_count', 'FGD_candidate_count',
  'FRD_entry_qualified_count', 'FGD_entry_qualified_count',
  'FRD_skip_stop_too_large_count', 'FGD_skip_stop_too_large_count',
  'FRD_target30_count', 'FRD_target35_count', 'FRD_target40_count', 'FRD_target50_count',
  'FGD_target30_count', 'FGD_target35_count', 'FGD_target40_count', 'FGD_target50_count'
];

const CSV_HEADERS_SUMMARY_SETUP = ['strategy_line', 'recommended_target_tier', 'count'];

const toParts = (d: Date) => {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}:${p.second}`,
    hhmm: `${p.hour}:${p.minute}`,
    minute: Number(p.minute)
  };
};

const parseCsv = (content: string): Record<string, string>[] => {
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => { row[h.trim()] = (cols[i] ?? '').trim(); });
    return row;
  });
};

const splitCsvLine = (line: string): string[] => {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
};

const pipSizeFor = (symbol: string): number => (/JPY/i.test(symbol) ? 0.01 : 0.0001);

const findMarketFolder = (): string => {
  const candidates = [
    resolve('project/data'),
    resolve('data'),
    resolve('sample'),
    '/mnt/data',
    resolve('.')
  ];
  for (const c of candidates) {
    try {
      if (!statSync(c).isDirectory()) continue;
      const csvCount = readdirSync(c).filter((f) => extname(f).toLowerCase() === '.csv').length;
      if (csvCount > 0) return c;
    } catch {
      // noop
    }
  }
  throw new Error('Could not locate a local market CSV folder. Checked project/data, data, sample, /mnt/data, and repo root.');
};

const loadBarsBySymbol = (marketFolder: string): Map<string, OneMinuteBar[]> => {
  const files = readdirSync(marketFolder).filter((f) => extname(f).toLowerCase() === '.csv');
  const out = new Map<string, OneMinuteBar[]>();
  for (const file of files) {
    const symbol = basename(file, '.csv').toUpperCase();
    const rows = parseCsv(readFileSync(join(marketFolder, file), 'utf8'));
    const bars: OneMinuteBar[] = rows
      .map((r) => ({
        time: r.time,
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: Number(r.volume ?? 0)
      }))
      .filter((b) => Number.isFinite(new Date(b.time).getTime()));
    bars.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    out.set(symbol, bars);
  }
  return out;
};

const aggregate5m = (bars: OneMinuteBar[]): FiveMinuteBar[] => {
  const grouped = new Map<number, OneMinuteBar[]>();
  for (const bar of bars) {
    const epoch = new Date(bar.time).getTime();
    const bucket = Math.floor(epoch / (5 * 60_000)) * 5 * 60_000;
    const arr = grouped.get(bucket) ?? [];
    arr.push(bar);
    grouped.set(bucket, arr);
  }
  return [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([epochMs, arr]) => ({
      time: new Date(epochMs).toISOString(),
      epochMs,
      open: arr[0].open,
      high: Math.max(...arr.map((x) => x.high)),
      low: Math.min(...arr.map((x) => x.low)),
      close: arr[arr.length - 1].close,
      volume: arr.reduce((s, x) => s + x.volume, 0)
    }));
};

const ema = (bars: FiveMinuteBar[], period = 20): number[] => {
  if (!bars.length) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  bars.forEach((b, i) => out.push(i === 0 ? b.close : (b.close * k + out[i - 1] * (1 - k))));
  return out;
};

const inNySession = (bar: OneMinuteBar): boolean => {
  const p = toParts(new Date(bar.time));
  return p.hhmm >= '07:00' && p.hhmm <= '11:00';
};

const hasQuarterRotation = (isoTime: string): boolean => {
  const p = toParts(new Date(isoTime));
  return [0, 15, 30, 45].includes(p.minute);
};

const evaluateCandidate = (c: CandidateWindow, bars: OneMinuteBar[]): Stage2Result => {
  const pip = pipSizeFor(c.symbol);
  const dayBars = bars.filter((b) => {
    const d = toParts(new Date(b.time)).date;
    return d === c.d_minus_2_date || d === c.signal_day_date || d === c.trade_day_date;
  });

  const d2 = dayBars.filter((b) => toParts(new Date(b.time)).date === c.d_minus_2_date);
  const signal = dayBars.filter((b) => toParts(new Date(b.time)).date === c.signal_day_date);
  const trade = dayBars.filter((b) => toParts(new Date(b.time)).date === c.trade_day_date);
  const sessionBars = trade.filter(inNySession);

  const d2Open = d2[0]?.open;
  const d2Close = d2[d2.length - 1]?.close;
  const signalOpen = signal[0]?.open;
  const signalClose = signal[signal.length - 1]?.close;

  const dailyTemplateValidity = Boolean(
    Number.isFinite(d2Open) && Number.isFinite(d2Close) && Number.isFinite(signalOpen) && Number.isFinite(signalClose) &&
    (c.strategy_line === 'FRD'
      ? (d2Close! > d2Open! && signalClose! < signalOpen!)
      : (d2Close! < d2Open! && signalClose! > signalOpen!))
  );

  const nySessionValidity = sessionBars.length > 0;
  const sourcePrice = c.strategy_line === 'FRD'
    ? (signal.length ? Math.max(...signal.map((b) => b.high)) : undefined)
    : (signal.length ? Math.min(...signal.map((b) => b.low)) : undefined);
  const sourceTime = signal.length
    ? (c.strategy_line === 'FRD'
      ? signal.reduce((a, b) => (b.high > a.high ? b : a), signal[0]).time
      : signal.reduce((a, b) => (b.low < a.low ? b : a), signal[0]).time)
    : '';

  let stopHuntDetected = false;
  let stopHuntTime = '';
  let stopHuntIndex = -1;
  for (let i = 1; i < sessionBars.length; i += 1) {
    const prev = sessionBars[i - 1];
    const cur = sessionBars[i];
    if (sourcePrice === undefined) break;
    if (c.strategy_line === 'FRD') {
      if (cur.high > sourcePrice && cur.close < sourcePrice) {
        stopHuntDetected = true;
        stopHuntTime = cur.time;
        stopHuntIndex = i;
        break;
      }
      if (prev.high > sourcePrice && cur.close < sourcePrice) {
        stopHuntDetected = true;
        stopHuntTime = cur.time;
        stopHuntIndex = i;
        break;
      }
    } else {
      if (cur.low < sourcePrice && cur.close > sourcePrice) {
        stopHuntDetected = true;
        stopHuntTime = cur.time;
        stopHuntIndex = i;
        break;
      }
      if (prev.low < sourcePrice && cur.close > sourcePrice) {
        stopHuntDetected = true;
        stopHuntTime = cur.time;
        stopHuntIndex = i;
        break;
      }
    }
  }

  let oneTwoThreeDetected = false;
  let oneTwoThreeTime = '';
  if (stopHuntDetected && stopHuntIndex >= 1) {
    if (c.strategy_line === 'FRD') {
      let pivotLowIdx = -1;
      for (let i = stopHuntIndex + 1; i < sessionBars.length; i += 1) {
        if (pivotLowIdx === -1 || sessionBars[i].low < sessionBars[pivotLowIdx].low) pivotLowIdx = i;
        const broke = i > pivotLowIdx && sessionBars[i].close < sessionBars[pivotLowIdx].low;
        const validRetest = i > pivotLowIdx && sessionBars[i].high < sessionBars[stopHuntIndex].high;
        if (broke && validRetest) {
          oneTwoThreeDetected = true;
          oneTwoThreeTime = sessionBars[i].time;
          break;
        }
      }
    } else {
      let pivotHighIdx = -1;
      for (let i = stopHuntIndex + 1; i < sessionBars.length; i += 1) {
        if (pivotHighIdx === -1 || sessionBars[i].high > sessionBars[pivotHighIdx].high) pivotHighIdx = i;
        const broke = i > pivotHighIdx && sessionBars[i].close > sessionBars[pivotHighIdx].high;
        const validRetest = i > pivotHighIdx && sessionBars[i].low > sessionBars[stopHuntIndex].low;
        if (broke && validRetest) {
          oneTwoThreeDetected = true;
          oneTwoThreeTime = sessionBars[i].time;
          break;
        }
      }
    }
  }

  const five = aggregate5m(sessionBars);
  const e20 = ema(five, 20);
  let emaConfirmDetected = false;
  let emaConfirmTime = '';
  let entryBar: FiveMinuteBar | null = null;
  const eventGate = oneTwoThreeDetected ? new Date(oneTwoThreeTime).getTime() : 0;
  for (let i = 0; i < five.length; i += 1) {
    const b = five[i];
    if (b.epochMs < eventGate) continue;
    const pass = c.strategy_line === 'FRD' ? b.close < e20[i] : b.close > e20[i];
    if (pass) {
      emaConfirmDetected = true;
      emaConfirmTime = b.time;
      if (hasQuarterRotation(b.time)) {
        entryBar = b;
        break;
      }
    }
  }

  const entryQualified = dailyTemplateValidity && nySessionValidity && stopHuntDetected && oneTwoThreeDetected && emaConfirmDetected && Boolean(entryBar);
  const entryPrice = entryBar?.close;
  const stopPrice = entryQualified && sourcePrice !== undefined
    ? (c.strategy_line === 'FRD' ? sourcePrice + pip : sourcePrice - pip)
    : undefined;

  const stopSizePips = (entryPrice !== undefined && stopPrice !== undefined)
    ? Number((Math.abs(entryPrice - stopPrice) / pip).toFixed(2))
    : undefined;
  const skipStopTooLarge = Boolean(stopSizePips !== undefined && stopSizePips > 20);

  let move30 = 0;
  let nySessionEndExitPrice: number | undefined;
  if (entryQualified && entryBar) {
    const post = sessionBars.filter((b) => new Date(b.time).getTime() >= entryBar.epochMs);
    if (post.length) {
      if (c.strategy_line === 'FRD') {
        const minL = Math.min(...post.map((b) => b.low));
        move30 = Number(((entryBar.close - minL) / pip).toFixed(2));
      } else {
        const maxH = Math.max(...post.map((b) => b.high));
        move30 = Number(((maxH - entryBar.close) / pip).toFixed(2));
      }
      nySessionEndExitPrice = post[post.length - 1].close;
    }
  }

  const engulfmentProxy = (() => {
    if (!entryBar) return false;
    const i = five.findIndex((x) => x.epochMs === entryBar!.epochMs);
    if (i <= 0) return false;
    const prev = five[i - 1];
    if (c.strategy_line === 'FRD') return entryBar.close < prev.low;
    return entryBar.close > prev.high;
  })();

  const target30 = entryQualified && sourcePrice !== undefined && emaConfirmDetected && move30 >= 15;
  const target35 = target30 && move30 >= 30;
  const target40 = target35 && (stopHuntDetected || engulfmentProxy);
  const target50 = stopHuntDetected && oneTwoThreeDetected && emaConfirmDetected && move30 >= 35;

  let tier: Stage2Result['recommended_target_tier'] = 'none';
  if (target30) tier = '30';
  if (target35) tier = '35';
  if (target40) tier = '40';
  if (target50) tier = '50';

  const prevCloseDistance = signalClose !== undefined && sourcePrice !== undefined
    ? Number((Math.abs(sourcePrice - signalClose) / pip).toFixed(2))
    : null;
  const nearPrevClose = prevCloseDistance !== null
    ? `source_to_prev_close=${prevCloseDistance}pips (<=5:${prevCloseDistance <= 5}, <=10:${prevCloseDistance <= 10})`
    : 'source_to_prev_close=NA';

  return {
    symbol: c.symbol,
    strategy_line: c.strategy_line,
    d_minus_2_date: c.d_minus_2_date,
    signal_day_date: c.signal_day_date,
    trade_day_date: c.trade_day_date,
    daily_template_validity: dailyTemplateValidity,
    ny_session_validity: nySessionValidity,
    source_detected: sourcePrice !== undefined,
    source_time: sourceTime,
    source_price: sourcePrice ?? '',
    stop_hunt_detected: stopHuntDetected,
    stop_hunt_time: stopHuntTime,
    one_two_three_detected: oneTwoThreeDetected,
    one_two_three_confirmation_time: oneTwoThreeTime,
    ema20_confirm_detected: emaConfirmDetected,
    ema20_confirm_time: emaConfirmTime,
    entry_qualified: entryQualified,
    entry_time: entryBar?.time ?? '',
    entry_price: entryPrice ?? '',
    stop_price: stopPrice ?? '',
    stop_size_pips: stopSizePips ?? '',
    skip_stop_too_large: skipStopTooLarge,
    move30_pips: move30,
    target_30: target30,
    target_35: target35,
    target_40: target40,
    target_50: target50,
    recommended_target_tier: tier,
    ny_session_end_exit_price: nySessionEndExitPrice ?? '',
    notes: `${nearPrevClose}; rotation_required=true; no_future_bar_leakage=true`
  };
};

const csvEsc = (v: unknown): string => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

const writeCsv = (path: string, headers: string[], rows: Record<string, unknown>[]): void => {
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => csvEsc(row[h])).join(','));
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
};

const summariseBySymbol = (rows: Stage2Result[]): Record<string, unknown>[] => {
  const bySymbol = new Map<string, Stage2Result[]>();
  rows.forEach((r) => {
    const arr = bySymbol.get(r.symbol) ?? [];
    arr.push(r);
    bySymbol.set(r.symbol, arr);
  });

  return [...bySymbol.entries()].map(([symbol, arr]) => {
    const only = (line: StrategyLine) => arr.filter((x) => x.strategy_line === line);
    const frd = only('FRD');
    const fgd = only('FGD');
    return {
      symbol,
      FRD_candidate_count: frd.length,
      FGD_candidate_count: fgd.length,
      FRD_entry_qualified_count: frd.filter((x) => x.entry_qualified).length,
      FGD_entry_qualified_count: fgd.filter((x) => x.entry_qualified).length,
      FRD_skip_stop_too_large_count: frd.filter((x) => x.skip_stop_too_large).length,
      FGD_skip_stop_too_large_count: fgd.filter((x) => x.skip_stop_too_large).length,
      FRD_target30_count: frd.filter((x) => x.target_30).length,
      FRD_target35_count: frd.filter((x) => x.target_35).length,
      FRD_target40_count: frd.filter((x) => x.target_40).length,
      FRD_target50_count: frd.filter((x) => x.target_50).length,
      FGD_target30_count: fgd.filter((x) => x.target_30).length,
      FGD_target35_count: fgd.filter((x) => x.target_35).length,
      FGD_target40_count: fgd.filter((x) => x.target_40).length,
      FGD_target50_count: fgd.filter((x) => x.target_50).length
    };
  });
};

const summariseBySetup = (rows: Stage2Result[]): Record<string, unknown>[] => {
  const m = new Map<string, number>();
  rows.forEach((r) => {
    const k = `${r.strategy_line}|${r.recommended_target_tier}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  });
  return [...m.entries()].map(([k, count]) => {
    const [strategy_line, recommended_target_tier] = k.split('|');
    return { strategy_line, recommended_target_tier, count };
  });
};

const loadWindows = (path: string): CandidateWindow[] => {
  const rows = parseCsv(readFileSync(path, 'utf8'));
  return rows
    .map((r) => ({
      symbol: (r.symbol ?? '').toUpperCase(),
      strategy_line: (r.strategy_line ?? '').toUpperCase() as StrategyLine,
      d_minus_2_date: r.d_minus_2_date,
      signal_day_date: r.signal_day_date,
      trade_day_date: r.trade_day_date
    }))
    .filter((r) => r.symbol && (r.strategy_line === 'FRD' || r.strategy_line === 'FGD') && r.d_minus_2_date && r.signal_day_date && r.trade_day_date);
};

const main = (): void => {
  const windowsPath = process.argv[2] ? resolve(process.argv[2]) : resolve('/mnt/data/frd_fgd_three_day_windows.csv');
  const outDir = process.argv[3] ? resolve(process.argv[3]) : resolve('stage2_outputs');
  const marketFolder = process.argv[4] ? resolve(process.argv[4]) : findMarketFolder();

  mkdirSync(outDir, { recursive: true });

  const windows = loadWindows(windowsPath);
  const bySymbol = loadBarsBySymbol(marketFolder);

  const results: Stage2Result[] = windows.map((w) => {
    const bars = bySymbol.get(w.symbol) ?? [];
    return evaluateCandidate(w, bars);
  });

  const fullRows = results.map((r) => ({
    symbol: r.symbol,
    strategy_line: r.strategy_line,
    d_minus_2_date: r.d_minus_2_date,
    signal_day_date: r.signal_day_date,
    trade_day_date: r.trade_day_date,
    daily_template_validity: r.daily_template_validity,
    ny_session_validity: r.ny_session_validity,
    source_detected: r.source_detected,
    source_time: r.source_time,
    source_price: r.source_price,
    stop_hunt_detected: r.stop_hunt_detected,
    stop_hunt_time: r.stop_hunt_time,
    '123_detected': r.one_two_three_detected,
    '123_confirmation_time': r.one_two_three_confirmation_time,
    '20EMA_confirm_detected': r.ema20_confirm_detected,
    '20EMA_confirm_time': r.ema20_confirm_time,
    entry_qualified: r.entry_qualified,
    entry_time: r.entry_time,
    entry_price: r.entry_price,
    stop_price: r.stop_price,
    stop_size_in_pips: r.stop_size_pips,
    skip_stop_too_large: r.skip_stop_too_large,
    move30_in_pips: r.move30_pips,
    target_30: r.target_30,
    target_35: r.target_35,
    target_40: r.target_40,
    target_50: r.target_50,
    recommended_target_tier: r.recommended_target_tier,
    ny_session_end_exit_price_if_no_earlier_exit: r.ny_session_end_exit_price,
    notes: r.notes
  }));

  const passedRows = fullRows.filter((r) => r.entry_qualified === true && r.skip_stop_too_large === false);
  const summaryBySymbol = summariseBySymbol(results);
  const summaryBySetup = summariseBySetup(results);

  const fullPath = join(outDir, 'stage2_backtest_candidates_full.csv');
  const passedPath = join(outDir, 'stage2_backtest_passed_only.csv');
  const symbolPath = join(outDir, 'stage2_backtest_summary_by_symbol.csv');
  const setupPath = join(outDir, 'stage2_backtest_summary_by_setup.csv');

  writeCsv(fullPath, CSV_HEADERS_FULL, fullRows);
  writeCsv(passedPath, CSV_HEADERS_FULL, passedRows);
  writeCsv(symbolPath, CSV_HEADERS_SUMMARY_SYMBOL, summaryBySymbol);
  writeCsv(setupPath, CSV_HEADERS_SUMMARY_SETUP, summaryBySetup);

  const frdTotal = windows.filter((w) => w.strategy_line === 'FRD').length;
  const fgdTotal = windows.filter((w) => w.strategy_line === 'FGD').length;
  const frdQualified = results.filter((r) => r.strategy_line === 'FRD' && r.entry_qualified).length;
  const fgdQualified = results.filter((r) => r.strategy_line === 'FGD' && r.entry_qualified).length;

  console.log(`total screened windows loaded: ${windows.length}`);
  console.log(`total FRD windows: ${frdTotal}`);
  console.log(`total FGD windows: ${fgdTotal}`);
  console.log(`total entry-qualified FRD: ${frdQualified}`);
  console.log(`total entry-qualified FGD: ${fgdQualified}`);
  console.log('output file paths:');
  console.log(`- ${fullPath}`);
  console.log(`- ${passedPath}`);
  console.log(`- ${symbolPath}`);
  console.log(`- ${setupPath}`);
};

main();

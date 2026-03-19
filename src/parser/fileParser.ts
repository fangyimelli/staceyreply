import type { DatasetFile, OhlcvBar, ParsedDataset, TimeSemantics } from '../types/domain';
import { ISO_WITH_OFFSET_PATTERN, normalizeUnqualifiedNyText, toNyIso } from '../utils/nyDate';

const STRATEGY_TIMEZONE: TimeSemantics['strategy'] = 'america-new_york';

const sortableEpoch = (bar: Pick<OhlcvBar, 'normalizedTime' | 'time'>) => new Date(bar.normalizedTime ?? bar.time).getTime();

const normalizeBars = (bars: OhlcvBar[]) => bars
  .filter((bar) => Number.isFinite(bar.open) && Number.isFinite(bar.high) && Number.isFinite(bar.low) && Number.isFinite(bar.close))
  .sort((a, b) => sortableEpoch(a) - sortableEpoch(b));

type ParseSuccess = {
  ok: true;
  bars: OhlcvBar[];
  diagnostics: string[];
};

type ParseFailure = {
  ok: false;
  bars: OhlcvBar[];
  errors: string[];
  diagnostics: string[];
};

type ParseResult = ParseSuccess | ParseFailure;

const isMtFixedEstRow = (line: string) => /^\d{4}\.\d{2}\.\d{2}[\t, ]+\d{2}:\d{2}([\t, ]+-?\d+(?:\.\d+)?){5}$/.test(line.trim());

const toFixedEstIso = (dateText: string, timeText: string) => {
  const [year, month, day] = dateText.split('.');
  return `${year}-${month}-${day}T${timeText}:00-05:00`;
};

const buildIsoOrTextTimeBar = (time: string, values: Pick<OhlcvBar, 'open' | 'high' | 'low' | 'close' | 'volume'>): OhlcvBar => {
  const hasIsoOffset = ISO_WITH_OFFSET_PATTERN.test(time);
  const normalizedTime = hasIsoOffset ? time : normalizeUnqualifiedNyText(time) ?? time;
  const semantics: TimeSemantics = {
    source: hasIsoOffset ? 'iso-offset' : 'unqualified-text',
    strategy: STRATEGY_TIMEZONE,
  };

  return {
    time: normalizedTime,
    rawTimeText: time,
    sourceTime: time,
    normalizedTime,
    timeSemantics: semantics,
    ...values,
  };
};

const normalizeMtFixedEstRowTime = (dateText: string, timeText: string) => {
  const sourceTime = toFixedEstIso(dateText, timeText);
  const sourceDate = new Date(sourceTime);
  const normalizedTime = toNyIso(sourceDate);

  return {
    rawDateText: dateText,
    rawTimeText: timeText,
    sourceTime,
    normalizedTime,
    timeSemantics: {
      source: 'fixed-est-no-dst',
      strategy: STRATEGY_TIMEZONE,
    } satisfies TimeSemantics,
  };
};

const parseMtFixedEst = (raw: string): OhlcvBar[] => normalizeBars(raw
  .trim()
  .split(/\r?\n/)
  .filter((line) => line.trim().length > 0)
  .map((line) => line.trim().split(/\t+|,+|\s{2,}/))
  .filter((parts) => parts.length >= 7)
  .map(([date, time, open, high, low, close, volume]) => {
    const normalizedTime = normalizeMtFixedEstRowTime(date, time);

    return {
      time: normalizedTime.normalizedTime,
      ...normalizedTime,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume ?? 0),
    };
  }));

const stripBom = (raw: string) => raw.replace(/^\uFEFF/, '');
const splitLines = (raw: string) => stripBom(raw).split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
const detectDelimiter = (line: string) => line.includes('\t') ? '\t' : ',';
const splitDelimitedLine = (line: string, delimiter: ',' | '\t') => line.split(delimiter).map((item) => item.trim());
const normalizeHeaderToken = (token: string) => token.trim().toLowerCase().replace(/^\uFEFF/, '').replace(/[^a-z0-9]+/g, '');
const TIME_HEADER_ALIASES = new Set(['time', 'datetime', 'date', 'timestamp']);
const VOLUME_HEADER_ALIASES = new Set(['volume', 'vol']);

const resolveHeaderRole = (token: string) => {
  const normalized = normalizeHeaderToken(token);
  if (TIME_HEADER_ALIASES.has(normalized)) return 'time';
  if (normalized === 'open') return 'open';
  if (normalized === 'high') return 'high';
  if (normalized === 'low') return 'low';
  if (normalized === 'close') return 'close';
  if (VOLUME_HEADER_ALIASES.has(normalized)) return 'volume';
  return null;
};

const parseCsv = (raw: string): ParseResult => {
  const diagnostics: string[] = [];
  const lines = splitLines(raw);

  if (!lines.length) {
    return { ok: false, bars: [], errors: ['CSV is empty.'], diagnostics: ['Accepted delimiters: comma or tab.', 'Accepted time headers: time, date, datetime, timestamp.', 'Accepted volume headers: volume, vol.'] };
  }

  if (isMtFixedEstRow(lines[0])) {
    diagnostics.push('Detected MT fixed EST tabular data.');
    diagnostics.push('Dataset time semantics: MT fixed EST source text -> normalized to reproducible America/New_York offset timestamps for strategy/display.');
    const bars = parseMtFixedEst(stripBom(raw));
    diagnostics.push(describeTimeSemantics(bars));
    return bars.length
      ? { ok: true, bars, diagnostics }
      : { ok: false, bars: [], errors: ['MT fixed EST rows were detected but no valid OHLC bars were parsed.'], diagnostics };
  }

  const delimiter = detectDelimiter(lines[0]);
  diagnostics.push(`Detected ${delimiter === '\t' ? 'tab' : 'comma'}-delimited CSV.`);

  const rawHeader = splitDelimitedLine(lines[0], delimiter);
  const headerMap = Object.fromEntries(rawHeader.map((header, index) => [resolveHeaderRole(header) ?? `unknown:${index}`, index])) as Record<string, number>;
  const missingRequired = ['time', 'open', 'high', 'low', 'close'].filter((key) => headerMap[key] === undefined);

  if (missingRequired.length) {
    return {
      ok: false,
      bars: [],
      errors: [`CSV header is missing required columns: ${missingRequired.join(', ')}.`],
      diagnostics: [
        `Normalized headers seen: ${rawHeader.map((item) => normalizeHeaderToken(item)).join(', ') || 'none'}.`,
        'Accepted time headers: time, date, datetime, timestamp.',
        'Accepted price headers: open, high, low, close.',
        'Accepted volume headers: volume, vol (optional).',
      ],
    };
  }

  const rowErrors: string[] = [];
  const semanticsSeen = new Set<TimeSemantics['source']>();
  const bars = normalizeBars(lines.slice(1).map((line, index) => {
    const columns = splitDelimitedLine(line, delimiter);
    const pick = (key: string) => columns[headerMap[key]] ?? '';
    const time = pick('time');
    const open = Number(pick('open'));
    const high = Number(pick('high'));
    const low = Number(pick('low'));
    const close = Number(pick('close'));
    const volume = headerMap.volume === undefined ? 0 : Number(pick('volume') || 0);

    const sourceSemantics: TimeSemantics['source'] = ISO_WITH_OFFSET_PATTERN.test(time) ? 'iso-offset' : 'unqualified-text';
    semanticsSeen.add(sourceSemantics);

    if (!time) rowErrors.push(`Row ${index + 2}: missing time value.`);
    if (![open, high, low, close].every(Number.isFinite)) rowErrors.push(`Row ${index + 2}: open/high/low/close must be numeric.`);
    if (headerMap.volume !== undefined && !Number.isFinite(volume)) rowErrors.push(`Row ${index + 2}: volume must be numeric when provided.`);
    try {
      return buildIsoOrTextTimeBar(time, { open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unsupported time format.';
      rowErrors.push(`Row ${index + 2}: ${detail}`);
      return {
        time: '',
        rawTimeText: time,
        sourceTime: time,
        normalizedTime: '',
        timeSemantics: {
          source: ISO_WITH_OFFSET_PATTERN.test(time) ? 'iso-offset' : 'unqualified-text',
          strategy: STRATEGY_TIMEZONE,
        },
        open,
        high,
        low,
        close,
        volume: Number.isFinite(volume) ? volume : 0,
      } satisfies OhlcvBar;
    }
  }));

  if (rowErrors.length) {
    return {
      ok: false,
      bars,
      errors: rowErrors,
      diagnostics: diagnostics.concat(`Parsed ${bars.length} valid rows before failure.`, describeTimeSemantics(bars)),
    };
  }

  const semanticsSummary = semanticsSeen.size === 1
    ? [...semanticsSeen][0]
    : `mixed (${[...semanticsSeen].join(', ')})`;
  diagnostics.push(`Dataset time semantics: ${semanticsSummary === 'iso-offset'
    ? 'ISO timestamps with explicit offset/Z are used directly as reproducible strategy timestamps.'
    : semanticsSummary === 'unqualified-text'
      ? 'Unqualified local text is parsed as America/New_York wall-clock time and normalized to explicit offset timestamps.'
      : `Mixed row semantics detected (${[...semanticsSeen].join(', ')}); all unqualified local text rows are normalized to America/New_York explicit offset timestamps.`}`);
  diagnostics.push(`Volume column ${headerMap.volume === undefined ? 'not provided; defaulting to 0.' : 'loaded from source.'}`);
  diagnostics.push(describeTimeSemantics(bars));
  return { ok: true, bars, diagnostics };
};

const JSON_TIME_KEYS = ['time', 'date', 'datetime', 'timestamp'];
const JSON_VOLUME_KEYS = ['volume', 'vol'];

const readJsonValue = (item: Record<string, unknown>, aliases: string[]) => {
  const entries = Object.entries(item);
  for (const alias of aliases) {
    const match = entries.find(([key]) => normalizeHeaderToken(key) === normalizeHeaderToken(alias));
    if (match) return match[1];
  }
  return undefined;
};

const parseJson = (raw: string): ParseResult => {
  const diagnostics: string[] = ['Accepted time keys: time, date, datetime, timestamp.', 'Accepted volume keys: volume, vol (optional).'];
  let payload: unknown;

  try {
    payload = JSON.parse(stripBom(raw));
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown JSON parse error.';
    return { ok: false, bars: [], errors: [`JSON parse failed: ${detail}`], diagnostics };
  }

  if (!Array.isArray(payload)) {
    return { ok: false, bars: [], errors: ['JSON root must be an array of OHLC objects.'], diagnostics };
  }

  const hasVolumeField = payload.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    return Object.keys(entry as Record<string, unknown>).some((key) => VOLUME_HEADER_ALIASES.has(normalizeHeaderToken(key)));
  });

  const rowErrors: string[] = [];
  const semanticsSeen = new Set<TimeSemantics['source']>();
  const bars = normalizeBars(payload.map((bar, index) => {
    const item = (bar && typeof bar === 'object' ? bar : {}) as Record<string, unknown>;
    const time = String(readJsonValue(item, JSON_TIME_KEYS) ?? '');
    const open = Number(item.open);
    const high = Number(item.high);
    const low = Number(item.low);
    const close = Number(item.close);
    const volumeValue = readJsonValue(item, JSON_VOLUME_KEYS);
    const volume = Number(volumeValue ?? 0);

    const sourceSemantics: TimeSemantics['source'] = ISO_WITH_OFFSET_PATTERN.test(time) ? 'iso-offset' : 'unqualified-text';
    semanticsSeen.add(sourceSemantics);

    if (!time) rowErrors.push(`Item ${index + 1}: missing time/date/datetime/timestamp field.`);
    if (![open, high, low, close].every(Number.isFinite)) rowErrors.push(`Item ${index + 1}: open/high/low/close must be numeric.`);
    if (volumeValue !== undefined && !Number.isFinite(volume)) rowErrors.push(`Item ${index + 1}: volume/vol must be numeric when provided.`);
    try {
      return buildIsoOrTextTimeBar(time, { open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unsupported time format.';
      rowErrors.push(`Item ${index + 1}: ${detail}`);
      return {
        time: '',
        rawTimeText: time,
        sourceTime: time,
        normalizedTime: '',
        timeSemantics: {
          source: ISO_WITH_OFFSET_PATTERN.test(time) ? 'iso-offset' : 'unqualified-text',
          strategy: STRATEGY_TIMEZONE,
        },
        open,
        high,
        low,
        close,
        volume: Number.isFinite(volume) ? volume : 0,
      } satisfies OhlcvBar;
    }
  }));

  if (rowErrors.length) {
    return { ok: false, bars, errors: rowErrors, diagnostics: diagnostics.concat(`Parsed ${bars.length} valid items before failure.`, describeTimeSemantics(bars)) };
  }

  const semanticsSummary = semanticsSeen.size === 1
    ? [...semanticsSeen][0]
    : `mixed (${[...semanticsSeen].join(', ')})`;
  diagnostics.push(`Dataset time semantics: ${semanticsSummary === 'iso-offset'
    ? 'ISO timestamps with explicit offset/Z are used directly as reproducible strategy timestamps.'
    : semanticsSummary === 'unqualified-text'
      ? 'Unqualified local text is parsed as America/New_York wall-clock time and normalized to explicit offset timestamps.'
      : `Mixed item semantics detected (${[...semanticsSeen].join(', ')}); all unqualified local text items are normalized to America/New_York explicit offset timestamps.`}`);
  diagnostics.push(`Volume field ${hasVolumeField ? 'loaded when present.' : 'not provided; defaulting to 0.'}`);
  diagnostics.push(describeTimeSemantics(bars));
  return { ok: true, bars, diagnostics };
};

export const parseDatasetFile = (file: DatasetFile): ParsedDataset => {
  const result = file.kind === 'csv' ? parseCsv(file.raw) : parseJson(file.raw);

  return {
    datasetId: file.id,
    symbol: file.label.replace(/\.(csv|json)$/i, '').toUpperCase(),
    bars1m: result.bars,
    sourceLabel: file.path,
    isSample: Boolean(file.isSample),
    parseStatus: result.ok ? 'success' : 'error',
    parseErrors: result.ok ? [] : result.errors,
    parseDiagnostics: result.diagnostics,
  };
};

const describeTimeSemantics = (bars: OhlcvBar[]) => {
  const semantics = [...new Set(bars.map((bar) => bar.timeSemantics?.source).filter(Boolean))];
  if (!semantics.length) return 'Time semantics: none detected.';
  if (semantics.length === 1 && semantics[0] === 'iso-offset') {
    return 'Time semantics: ISO with offset input; strategy timeline preserves explicit source offsets without host-local parsing.';
  }
  if (semantics.length === 1 && semantics[0] === 'fixed-est-no-dst') {
    return 'Time semantics: MT fixed EST input; source rows are interpreted as UTC-5 wall clock and normalized onto reproducible America/New_York timestamps.';
  }
  if (semantics.length === 1 && semantics[0] === 'unqualified-text') {
    return 'Time semantics: unqualified local text input; parser deterministically interprets rows as America/New_York wall clock and emits explicit offset strategy timestamps.';
  }
  return `Time semantics: mixed input (${semantics.join(', ')}); all strategy timestamps are normalized to explicit America/New_York offsets before downstream use.`;
};

export { describeTimeSemantics, normalizeMtFixedEstRowTime, parseMtFixedEst, toFixedEstIso };

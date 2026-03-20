import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const dataRoot = path.join(repoRoot, 'data', 'pairs');
const outputRoot = path.join(repoRoot, 'public', 'replay');
const datasetsOutputRoot = path.join(outputRoot, 'datasets');
const RAW_FILENAME = '1m.csv';
const ISO_WITH_OFFSET_PATTERN = /(Z|[+-]\d{2}:\d{2})$/i;
const TIME_HEADER_ALIASES = new Set(['time', 'datetime', 'date', 'timestamp']);
const VOLUME_HEADER_ALIASES = new Set(['volume', 'vol']);

const normalizeId = (name) =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const normalizeHeaderToken = (token) =>
  token.trim().toLowerCase().replace(/^\uFEFF/, '').replace(/[^a-z0-9]+/g, '');

const resolveHeaderRole = (token) => {
  const normalized = normalizeHeaderToken(token);
  if (TIME_HEADER_ALIASES.has(normalized)) return 'time';
  if (normalized === 'open') return 'open';
  if (normalized === 'high') return 'high';
  if (normalized === 'low') return 'low';
  if (normalized === 'close') return 'close';
  if (VOLUME_HEADER_ALIASES.has(normalized)) return 'volume';
  return null;
};

const stripBom = (raw) => raw.replace(/^\uFEFF/, '');
const splitLines = (raw) => stripBom(raw).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const detectDelimiter = (line) => (line.includes('\t') ? '\t' : ',');
const splitDelimitedLine = (line, delimiter) => line.split(delimiter).map((item) => item.trim());
const isMtFixedEstRow = (line) => /^\d{4}\.\d{2}\.\d{2}[\t, ]+\d{2}:\d{2}([\t, ]+-?\d+(?:\.\d+)?){5}$/.test(line.trim());
const toFixedEstIso = (dateText, timeText) => {
  const [year, month, day] = dateText.split('.');
  return `${year}-${month}-${day}T${timeText}:00-05:00`;
};

const formatNyParts = (date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const read = (type) => parts.find((part) => part.type === type)?.value ?? '';

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
};

const getNyOffset = (date) => {
  const offsetText = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'shortOffset',
    hour: '2-digit',
  }).formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT-5';

  const match = offsetText.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
  if (!match) return '-05:00';
  const [, sign, hours, minutes] = match;
  return `${sign}${hours.padStart(2, '0')}:${(minutes ?? '00').padStart(2, '0')}`;
};

const toNyIso = (date, includeMilliseconds = false) => {
  const wallClock = formatNyParts(date);
  const milliseconds = date.getUTCMilliseconds();
  const fraction = includeMilliseconds || milliseconds
    ? `.${String(milliseconds).padStart(3, '0')}`
    : '';

  return `${wallClock.year}-${wallClock.month}-${wallClock.day}T${wallClock.hour}:${wallClock.minute}:${wallClock.second}${fraction}${getNyOffset(date)}`;
};

const parseUnqualifiedLocalText = (timeText) => {
  const match = timeText.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/);
  if (!match) return null;

  const [, year, month, day, hour = '00', minute = '00', second = '00', fraction = '0'] = match;
  const millisecond = Number(fraction.padEnd(3, '0').slice(0, 3));

  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
    millisecond,
  };
};

const matchesParsedNyWallClock = (date, parsed) => {
  const parts = formatNyParts(date);
  return Number(parts.year) === parsed.year
    && Number(parts.month) === parsed.month
    && Number(parts.day) === parsed.day
    && Number(parts.hour) === parsed.hour
    && Number(parts.minute) === parsed.minute
    && Number(parts.second) === parsed.second;
};

const candidateUtcMs = (parsed, offsetMinutes) => Date.UTC(
  parsed.year,
  parsed.month - 1,
  parsed.day,
  parsed.hour,
  parsed.minute - offsetMinutes,
  parsed.second,
  parsed.millisecond,
);

const normalizeUnqualifiedNyText = (timeText) => {
  const parsed = parseUnqualifiedLocalText(timeText);
  if (!parsed) return null;

  const candidates = [-300, -240]
    .map((offsetMinutes) => new Date(candidateUtcMs(parsed, offsetMinutes)))
    .filter((candidate) => matchesParsedNyWallClock(candidate, parsed))
    .sort((a, b) => a.getTime() - b.getTime());

  if (candidates[0]) {
    return toNyIso(candidates[0], parsed.millisecond !== 0);
  }

  const middayUtc = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 17, 0, 0, parsed.millisecond));
  const fallbackOffset = getNyOffset(middayUtc);
  const fraction = parsed.millisecond ? `.${String(parsed.millisecond).padStart(3, '0')}` : '';
  return `${String(parsed.year).padStart(4, '0')}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}T${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}:${String(parsed.second).padStart(2, '0')}${fraction}${fallbackOffset}`;
};

const describeTimeSemantics = (bars) => {
  const semantics = [...new Set(bars.map((bar) => bar.timeSemantics?.source).filter(Boolean))];
  if (!semantics.length) return 'Time semantics: none detected.';
  if (semantics.length === 1 && semantics[0] === 'iso-offset') return 'Time semantics: ISO with offset input; strategy timeline preserves explicit source offsets without host-local parsing.';
  if (semantics.length === 1 && semantics[0] === 'fixed-est-no-dst') return 'Time semantics: MT fixed EST input; source rows are interpreted as UTC-5 wall clock and normalized onto reproducible America/New_York timestamps.';
  if (semantics.length === 1 && semantics[0] === 'unqualified-text') return 'Time semantics: unqualified local text input; parser deterministically interprets rows as America/New_York wall clock and emits explicit offset strategy timestamps.';
  return `Time semantics: mixed input (${semantics.join(', ')}); all strategy timestamps are normalized to explicit America/New_York offsets before downstream use.`;
};

const parseRawCsvDataset = ({ datasetId, label, sourceLabel, raw }) => {
  const lines = splitLines(raw);
  const diagnostics = [];
  const strategy = 'america-new_york';
  if (!lines.length) throw new Error('CSV is empty.');

  let bars = [];
  if (isMtFixedEstRow(lines[0])) {
    diagnostics.push('Detected MT fixed EST tabular data.');
    bars = lines.map((line) => {
      const [date, time, open, high, low, close, volume] = line.trim().split(/\t+|,+|\s{2,}/);
      const sourceTime = toFixedEstIso(date, time);
      const normalizedTime = toNyIso(new Date(sourceTime));
      return {
        time: normalizedTime,
        rawDateText: date,
        rawTimeText: time,
        sourceTime,
        normalizedTime,
        timeSemantics: { source: 'fixed-est-no-dst', strategy },
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume ?? 0),
      };
    });
  } else {
    const delimiter = detectDelimiter(lines[0]);
    diagnostics.push(`Detected ${delimiter === '\t' ? 'tab' : 'comma'}-delimited CSV.`);
    const header = splitDelimitedLine(lines[0], delimiter);
    const headerMap = Object.fromEntries(header.map((item, index) => [resolveHeaderRole(item) ?? `unknown:${index}`, index]));
    const missingRequired = ['time', 'open', 'high', 'low', 'close'].filter((key) => headerMap[key] === undefined);
    if (missingRequired.length) {
      throw new Error(`CSV header is missing required columns: ${missingRequired.join(', ')}.`);
    }
    bars = lines.slice(1).map((line, index) => {
      const columns = splitDelimitedLine(line, delimiter);
      const pick = (key) => columns[headerMap[key]] ?? '';
      const time = pick('time');
      const open = Number(pick('open'));
      const high = Number(pick('high'));
      const low = Number(pick('low'));
      const close = Number(pick('close'));
      const volume = headerMap.volume === undefined ? 0 : Number(pick('volume') || 0);
      if (!time) throw new Error(`Row ${index + 2}: missing time value.`);
      if (![open, high, low, close].every(Number.isFinite)) throw new Error(`Row ${index + 2}: open/high/low/close must be numeric.`);
      if (headerMap.volume !== undefined && !Number.isFinite(volume)) throw new Error(`Row ${index + 2}: volume must be numeric when provided.`);
      const normalizedTime = ISO_WITH_OFFSET_PATTERN.test(time) ? time : normalizeUnqualifiedNyText(time) ?? time;
      return {
        time: normalizedTime,
        rawTimeText: time,
        sourceTime: time,
        normalizedTime,
        timeSemantics: { source: ISO_WITH_OFFSET_PATTERN.test(time) ? 'iso-offset' : 'unqualified-text', strategy },
        open,
        high,
        low,
        close,
        volume,
      };
    });
  }

  bars.sort((a, b) => new Date(a.normalizedTime ?? a.time).getTime() - new Date(b.normalizedTime ?? b.time).getTime());
  diagnostics.push(describeTimeSemantics(bars));
  return {
    datasetId,
    symbol: label.toUpperCase(),
    bars1m: bars,
    sourceLabel,
    parseStatus: 'success',
    parseErrors: [],
    parseDiagnostics: diagnostics,
  };
};

const main = async () => {
  const entries = await readdir(dataRoot, { withFileTypes: true });
  const pairDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(datasetsOutputRoot, { recursive: true });

  const manifest = [];

  for (const pairDir of pairDirs) {
    const slug = normalizeId(pairDir);
    const datasetId = `pair:${slug}`;
    const sourceLabel = path.posix.join('data', 'pairs', pairDir, 'raw', RAW_FILENAME);
    const sourcePath = path.join(dataRoot, pairDir, 'raw', RAW_FILENAME);
    const raw = await readFile(sourcePath, 'utf8');
    const parsed = parseRawCsvDataset({ datasetId, label: pairDir, sourceLabel, raw });
    const artifactPath = `replay/datasets/${slug}.json`;
    await writeFile(path.join(outputRoot, 'datasets', `${slug}.json`), `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    manifest.push({
      id: datasetId,
      label: pairDir.toUpperCase(),
      sourceLabel,
      artifactPath,
      barCount: parsed.bars1m.length,
      parseStatus: parsed.parseStatus,
    });
  }

  await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Preprocessed ${manifest.length} pair(s) into public/replay.`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(repoRoot, 'public', 'preprocessed');
const DATASET_VERSION = 'v5';
const ISO_WITH_OFFSET_PATTERN = /(Z|[+-]\d{2}:\d{2})$/i;
const TIME_HEADER_ALIASES = new Set(['time', 'datetime', 'date', 'timestamp']);
const VOLUME_HEADER_ALIASES = new Set(['volume', 'vol']);

const OFFICIAL_PAIRS = [
  {
    displayName: 'EURUSD',
    pairKey: 'eurusd',
    csvFile: 'staceyreply/dist/mnt/data/DAT_MT_EURUSD_M1_2025.csv',
    assetClass: 'fx',
    pipSize: 0.0001,
    tickSize: 0.00001,
  },
  {
    displayName: 'USDCAD',
    pairKey: 'usdcad',
    csvFile: 'staceyreply/dist/mnt/data/DAT_MT_USDCAD_M1_2025.csv',
    assetClass: 'fx',
    pipSize: 0.0001,
    tickSize: 0.00001,
  },
  {
    displayName: 'GBPUSD',
    pairKey: 'gbpusd',
    csvFile: 'staceyreply/dist/mnt/data/DAT_MT_GBPUSD_M1_2025.csv',
    assetClass: 'fx',
    pipSize: 0.0001,
    tickSize: 0.00001,
  },
  {
    displayName: 'AUDUSD',
    pairKey: 'audusd',
    csvFile: 'staceyreply/dist/mnt/data/DAT_MT_AUDUSD_M1_2025.csv',
    assetClass: 'fx',
    pipSize: 0.0001,
    tickSize: 0.00001,
  },
];

const replayTimeframes = ['1m', '5m', '15m', '1h', '4h', '1D'];
const minutesByTf = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240 };

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
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date);
  const read = (type) => parts.find((part) => part.type === type)?.value ?? '';
  return { year: read('year'), month: read('month'), day: read('day'), hour: read('hour'), minute: read('minute'), second: read('second') };
};
const getNyOffset = (date) => {
  const offsetText = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset', hour: '2-digit' })
    .formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT-5';
  const match = offsetText.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
  if (!match) return '-05:00';
  const [, sign, hours, minutes] = match;
  return `${sign}${hours.padStart(2, '0')}:${(minutes ?? '00').padStart(2, '0')}`;
};
const toNyIso = (date, includeMilliseconds = false) => {
  const wallClock = formatNyParts(date);
  const milliseconds = date.getUTCMilliseconds();
  const fraction = includeMilliseconds || milliseconds ? `.${String(milliseconds).padStart(3, '0')}` : '';
  return `${wallClock.year}-${wallClock.month}-${wallClock.day}T${wallClock.hour}:${wallClock.minute}:${wallClock.second}${fraction}${getNyOffset(date)}`;
};
const parseUnqualifiedLocalText = (timeText) => {
  const match = timeText.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/);
  if (!match) return null;
  const [, year, month, day, hour = '00', minute = '00', second = '00', fraction = '0'] = match;
  return { year: Number(year), month: Number(month), day: Number(day), hour: Number(hour), minute: Number(minute), second: Number(second), millisecond: Number(fraction.padEnd(3, '0').slice(0, 3)) };
};
const matchesParsedNyWallClock = (date, parsed) => {
  const parts = formatNyParts(date);
  return Number(parts.year) === parsed.year && Number(parts.month) === parsed.month && Number(parts.day) === parsed.day && Number(parts.hour) === parsed.hour && Number(parts.minute) === parsed.minute && Number(parts.second) === parsed.second;
};
const candidateUtcMs = (parsed, offsetMinutes) => Date.UTC(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute - offsetMinutes, parsed.second, parsed.millisecond);
const normalizeUnqualifiedNyText = (timeText) => {
  const parsed = parseUnqualifiedLocalText(timeText);
  if (!parsed) return null;
  const candidates = [-300, -240].map((offsetMinutes) => new Date(candidateUtcMs(parsed, offsetMinutes))).filter((candidate) => matchesParsedNyWallClock(candidate, parsed)).sort((a, b) => a.getTime() - b.getTime());
  if (candidates[0]) return toNyIso(candidates[0], parsed.millisecond !== 0);
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
      return { time: normalizedTime, rawDateText: date, rawTimeText: time, sourceTime, normalizedTime, timeSemantics: { source: 'fixed-est-no-dst', strategy }, open: Number(open), high: Number(high), low: Number(low), close: Number(close), volume: Number(volume ?? 0) };
    });
  } else {
    const delimiter = detectDelimiter(lines[0]);
    diagnostics.push(`Detected ${delimiter === '\t' ? 'tab' : 'comma'}-delimited CSV.`);
    const header = splitDelimitedLine(lines[0], delimiter);
    const headerMap = Object.fromEntries(header.map((item, index) => [resolveHeaderRole(item) ?? `unknown:${index}`, index]));
    const missingRequired = ['time', 'open', 'high', 'low', 'close'].filter((key) => headerMap[key] === undefined);
    if (missingRequired.length) throw new Error(`CSV header is missing required columns: ${missingRequired.join(', ')}.`);
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
      return { time: normalizedTime, rawTimeText: time, sourceTime: time, normalizedTime, timeSemantics: { source: ISO_WITH_OFFSET_PATTERN.test(time) ? 'iso-offset' : 'unqualified-text', strategy }, open, high, low, close, volume };
    });
  }
  bars.sort((a, b) => new Date(a.normalizedTime ?? a.time).getTime() - new Date(b.normalizedTime ?? b.time).getTime());
  diagnostics.push(describeTimeSemantics(bars));
  return { datasetId, symbol: label.toUpperCase(), bars1m: bars, sourceLabel, parseStatus: 'success', parseErrors: [], parseDiagnostics: diagnostics };
};

const strategyNyDate = (time) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
const groupByNyDate = (bars) => bars.reduce((acc, bar) => {
  const date = strategyNyDate(bar.time);
  (acc[date] ??= []).push(bar);
  return acc;
}, {});
const buildDailyBars = (barsByDay, days) => days.map((day) => {
  const bars = barsByDay[day];
  return { day, open: bars[0].open, high: Math.max(...bars.map((bar) => bar.high)), low: Math.min(...bars.map((bar) => bar.low)), close: bars[bars.length - 1].close };
});
const summarizeCandidate = (template) => template === 'FGD' ? 'FGD candidate detected for Day 3 review.' : 'FRD candidate detected for Day 3 review.';
const sanitizeEventId = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const buildEventId = (candidateDate, template) => sanitizeEventId(`${candidateDate}-${template}`);

const parseExplicitTimestampMs = (time) => new Date(time).getTime();
const bucketStart = (bar, minutes) => {
  const ms = parseExplicitTimestampMs(bar.normalizedTime ?? bar.time);
  return new Date(Math.floor(ms / (minutes * 60_000)) * minutes * 60_000).toISOString();
};
const aggregateGroup = (group) => ({
  time: group[0].normalizedTime ?? group[0].time,
  normalizedTime: group[0].normalizedTime ?? group[0].time,
  sourceTime: group[0].sourceTime,
  sourceStartTime: group[0].sourceTime ?? group[0].time,
  sourceEndTime: group[group.length - 1].sourceTime ?? group[group.length - 1].time,
  traceTimes: group.map((bar) => ({
    normalizedTime: bar.normalizedTime ?? bar.time,
    sourceTime: bar.sourceTime ?? bar.time,
    rawTimeText: bar.rawTimeText,
    rawDateText: bar.rawDateText,
  })),
  timeSemantics: group[0].timeSemantics,
  rawTimeText: group[0].rawTimeText,
  rawDateText: group[0].rawDateText,
  open: group[0].open,
  high: Math.max(...group.map((bar) => bar.high)),
  low: Math.min(...group.map((bar) => bar.low)),
  close: group[group.length - 1].close,
  volume: group.reduce((sum, bar) => sum + bar.volume, 0),
});
const aggregateBars = (bars, timeframe) => {
  if (timeframe === '1m') return bars;
  const buckets = new Map();
  if (timeframe === '1D') {
    for (const bar of bars) {
      const key = strategyNyDate(bar.normalizedTime ?? bar.time);
      (buckets.get(key) ?? buckets.set(key, []).get(key)).push(bar);
    }
  } else {
    const minutes = minutesByTf[timeframe];
    for (const bar of bars) {
      const key = bucketStart(bar, minutes);
      (buckets.get(key) ?? buckets.set(key, []).get(key)).push(bar);
    }
  }
  return [...buckets.values()].map(aggregateGroup);
};
const buildTimeframeBarMap = (bars1m) => Object.fromEntries(replayTimeframes.map((timeframe) => [timeframe, aggregateBars(bars1m, timeframe)]));

const buildCandidateSummaries = (parsed, pairSlug) => {
  const barsByDay = groupByNyDate(parsed.bars1m);
  const days = Object.keys(barsByDay).sort();
  const daily = buildDailyBars(barsByDay, days);
  return daily.slice(2).flatMap((tradeDay, index) => {
    const d2 = daily[index];
    const d1 = daily[index + 1];
    const dump = d2.close < d2.open;
    const pump = d2.close > d2.open;
    const fgd = dump && d1.close > d1.open;
    const frd = pump && d1.close < d1.open;
    const template = fgd ? 'FGD' : frd ? 'FRD' : null;
    if (!template) return [];
    const eventId = buildEventId(tradeDay.day, template);
    return [{ eventId, candidateDate: tradeDay.day, template, shortSummary: summarizeCandidate(template), practiceStatus: 'needs-practice', datasetPath: `preprocessed/${pairSlug}/events/${eventId}.json` }];
  });
};
const sliceEventWindow = (bars, candidateDate) => {
  const barsByDay = groupByNyDate(bars);
  const days = Object.keys(barsByDay).sort();
  const tradeIndex = days.indexOf(candidateDate);
  const startIndex = Math.max(0, tradeIndex - 2);
  const endIndex = Math.min(days.length - 1, tradeIndex + 2);
  const windowDays = days.slice(startIndex, endIndex + 1);
  return { windowDays, bars: windowDays.flatMap((day) => barsByDay[day]) };
};

const resolveCsvSourcePath = (csvFile) => path.join(repoRoot, csvFile.replace(/^staceyreply\//, ''));

const main = async () => {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  const manifest = {
    datasetVersion: DATASET_VERSION,
    generatedAt: new Date().toISOString(),
    diagnostics: {
      manifestPairCount: 0,
      officialPairUniverse: OFFICIAL_PAIRS.map((pair) => pair.pairKey),
      manifestPairKeys: [],
      missingOfficialPairs: [],
      missingPairFolders: [],
      skippedPairFolders: [],
    },
    pairs: [],
  };

  for (const pair of OFFICIAL_PAIRS) {
    const datasetId = `pair:${pair.pairKey}`;
    const sourcePath = resolveCsvSourcePath(pair.csvFile);
    const sourceLabel = pair.csvFile;

    try {
      const raw = await readFile(sourcePath, 'utf8');
      const parsed = parseRawCsvDataset({ datasetId, label: pair.displayName, sourceLabel, raw });
      const candidateSummaries = buildCandidateSummaries(parsed, pair.pairKey);
      const pairOutputRoot = path.join(outputRoot, pair.pairKey);
      const eventsRoot = path.join(pairOutputRoot, 'events');
      await mkdir(eventsRoot, { recursive: true });

      for (const candidate of candidateSummaries) {
        const eventWindow = sliceEventWindow(parsed.bars1m, candidate.candidateDate);
        const precomputedTimeframeBars = buildTimeframeBarMap(eventWindow.bars);
        const eventPayload = {
          datasetId,
          symbol: parsed.symbol,
          sourceLabel,
          parseStatus: parsed.parseStatus,
          parseErrors: parsed.parseErrors,
          parseDiagnostics: parsed.parseDiagnostics,
          bars: eventWindow.bars,
          bars1m: eventWindow.bars,
          precomputedTimeframeBars,
          eventId: candidate.eventId,
          pair: pair.pairKey,
          candidateDate: candidate.candidateDate,
          template: candidate.template,
          metadata: {
            eventWindow: {
              startDate: eventWindow.windowDays[0] ?? candidate.candidateDate,
              endDate: eventWindow.windowDays[eventWindow.windowDays.length - 1] ?? candidate.candidateDate,
              availableDates: eventWindow.windowDays,
            },
          },
        };
        await writeFile(path.join(eventsRoot, `${candidate.eventId}.json`), `${JSON.stringify(eventPayload, null, 2)}\n`, 'utf8');
      }

      const indexPath = `preprocessed/${pair.pairKey}/index.json`;
      const pairIndex = {
        pairId: datasetId,
        pairLabel: pair.displayName,
        sourceLabel,
        datasetVersion: DATASET_VERSION,
        pairKey: pair.pairKey,
        folderName: pair.pairKey,
        symbol: parsed.symbol,
        candidates: candidateSummaries.map(({ eventId, candidateDate, template, shortSummary, practiceStatus, datasetPath }) => ({
          eventId,
          candidateDate,
          template,
          shortSummary,
          practiceStatus,
          datasetPath,
        })),
      };
      await writeFile(path.join(pairOutputRoot, 'index.json'), `${JSON.stringify(pairIndex, null, 2)}\n`, 'utf8');

      const barsByDay = groupByNyDate(parsed.bars1m);
      const allDays = Object.keys(barsByDay).sort();
      manifest.pairs.push({
        id: datasetId,
        label: pair.displayName,
        sourceLabel,
        indexPath,
        candidateCount: candidateSummaries.length,
        dateRange: allDays.length ? { start: allDays[0], end: allDays[allDays.length - 1] } : null,
        datasetVersion: DATASET_VERSION,
        pairKey: pair.pairKey,
        folderName: pair.pairKey,
        symbol: parsed.symbol,
      });
    } catch (error) {
      manifest.diagnostics.skippedPairFolders.push({
        pairKey: pair.pairKey,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  manifest.diagnostics.manifestPairCount = manifest.pairs.length;
  manifest.diagnostics.manifestPairKeys = manifest.pairs.map((pair) => pair.pairKey);
  manifest.diagnostics.missingOfficialPairs = OFFICIAL_PAIRS.map((pair) => pair.pairKey).filter((pairKey) => !manifest.pairs.some((pair) => pair.pairKey === pairKey));
  manifest.diagnostics.missingPairFolders = [...manifest.diagnostics.missingOfficialPairs];

  await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  if (manifest.diagnostics.missingOfficialPairs.length > 0) {
    throw new Error(`Missing official pair(s): ${manifest.diagnostics.missingOfficialPairs.join(', ')}`);
  }

  console.log(`Preprocessed ${manifest.pairs.length} official pair(s) into public/preprocessed.`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

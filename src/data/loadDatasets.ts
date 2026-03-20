import { OFFICIAL_PAIR_KEYS } from '../officialPairs';
import type {
  DatasetFetchDiagnostics,
  DatasetLoadFailurePhase,
  DatasetManifestDiagnostics,
  DatasetManifestItem,
  PairCandidateIndex,
  PreprocessedManifest,
  PreprocessedReplayEventDataset,
} from '../types/domain';

const MANIFEST_URL = '/preprocessed/manifest.json';
const normalizeAssetPath = (value: string) => value.replace(/^\/+/, '');
const normalizeAssetUrl = (value: string) => `/${normalizeAssetPath(value)}`;
const sanitizeFirstChars = (value: string) => value.replace(/\s+/g, ' ').slice(0, 80);
const isHtmlDocument = (value: string) => {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
};

const buildPairIndexFileExistsDiagnostic = (
  manifest: DatasetManifestItem,
  manifestDiagnostics?: DatasetManifestDiagnostics,
) => {
  if (!manifestDiagnostics) return undefined;
  if (manifestDiagnostics.missingPairFolders.includes(manifest.pairKey)) {
    return false;
  }
  const skippedPairFolder = manifestDiagnostics.skippedPairFolders.find(
    (entry) => entry.pairKey === manifest.pairKey,
  );
  if (skippedPairFolder) {
    return false;
  }
  if (manifestDiagnostics.manifestPairKeys.includes(manifest.pairKey)) {
    return true;
  }
  return undefined;
};

export class DatasetLoadError extends Error {
  datasetId: string;
  datasetLabel: string;
  sourceLabel: string;
  phase: DatasetLoadFailurePhase;
  diagnostics?: DatasetFetchDiagnostics;

  constructor({
    datasetId,
    datasetLabel,
    sourceLabel,
    phase,
    message,
    diagnostics,
  }: {
    datasetId: string;
    datasetLabel: string;
    sourceLabel: string;
    phase: DatasetLoadFailurePhase;
    message: string;
    diagnostics?: DatasetFetchDiagnostics;
  }) {
    super(message);
    this.name = 'DatasetLoadError';
    this.datasetId = datasetId;
    this.datasetLabel = datasetLabel;
    this.sourceLabel = sourceLabel;
    this.phase = phase;
    this.diagnostics = diagnostics;
  }
}

const loadJson = async <T,>({
  url,
  datasetId,
  datasetLabel,
  sourceLabel,
  diagnostics,
}: {
  url: string;
  datasetId: string;
  datasetLabel: string;
  sourceLabel: string;
  diagnostics?: Partial<DatasetFetchDiagnostics>;
}): Promise<T> => {
  const response = await fetch(url);
  const responseStatus = response.status;
  const contentType = response.headers.get('content-type') ?? undefined;
  const text = await response.text();
  const first80Chars = sanitizeFirstChars(text);
  const fetchDiagnostics: DatasetFetchDiagnostics = {
    ...diagnostics,
    requestedUrl: url,
    responseStatus,
    contentType,
    first80Chars,
  };

  if (!response.ok) {
    throw new DatasetLoadError({
      datasetId,
      datasetLabel,
      sourceLabel,
      phase: 'file-read',
      message: `Unable to read preprocessed payload (${response.status}). Run npm run preprocess:data first.`,
      diagnostics: fetchDiagnostics,
    });
  }

  if (isHtmlDocument(text)) {
    throw new DatasetLoadError({
      datasetId,
      datasetLabel,
      sourceLabel,
      phase: 'parse',
      message:
        'Expected JSON for pair index but received HTML. Likely missing static file or SPA rewrite fallback.',
      diagnostics: fetchDiagnostics,
    });
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new DatasetLoadError({
      datasetId,
      datasetLabel,
      sourceLabel,
      phase: 'parse',
      message: error instanceof Error ? error.message : String(error),
      diagnostics: fetchDiagnostics,
    });
  }
};

const validateOfficialManifest = (manifest: PreprocessedManifest): PreprocessedManifest => {
  const diagnostics = manifest.diagnostics;
  const manifestPairKeys = diagnostics?.manifestPairKeys ?? manifest.pairs.map((pair) => pair.pairKey);
  const missingOfficialPairs = diagnostics?.missingOfficialPairs ?? OFFICIAL_PAIR_KEYS.filter((pairKey) => !manifestPairKeys.includes(pairKey));
  const unexpectedPairs = manifestPairKeys.filter((pairKey) => !OFFICIAL_PAIR_KEYS.includes(pairKey));

  if (missingOfficialPairs.length > 0) {
    throw new DatasetLoadError({
      datasetId: 'manifest',
      datasetLabel: 'manifest',
      sourceLabel: MANIFEST_URL,
      phase: 'parse',
      message: `Official manifest is incomplete. Missing official pair(s): ${missingOfficialPairs.join(', ')}.`,
    });
  }

  if (unexpectedPairs.length > 0) {
    throw new DatasetLoadError({
      datasetId: 'manifest',
      datasetLabel: 'manifest',
      sourceLabel: MANIFEST_URL,
      phase: 'parse',
      message: `Official manifest contains non-official pair(s): ${unexpectedPairs.join(', ')}. Sample mode must stay separate from official replay mode.`,
    });
  }

  return {
    ...manifest,
    pairs: manifest.pairs.filter((pair) => OFFICIAL_PAIR_KEYS.includes(pair.pairKey)),
  };
};

const loadOfficialManifest = async (): Promise<PreprocessedManifest> => {
  const manifest = await loadJson<PreprocessedManifest>({
    url: MANIFEST_URL,
    datasetId: 'manifest',
    datasetLabel: 'manifest',
    sourceLabel: MANIFEST_URL,
  });
  return validateOfficialManifest(manifest);
};

export const getPreprocessedDatasetManifest = async (): Promise<DatasetManifestItem[]> => {
  const manifest = await loadOfficialManifest();
  console.debug('[ReplayLoader] manifest loaded', {
    path: MANIFEST_URL,
    pairCount: manifest.pairs.length,
  });
  return manifest.pairs;
};

export const loadPairCandidateIndex = async (
  manifest: DatasetManifestItem,
  manifestDiagnostics?: DatasetManifestDiagnostics,
): Promise<PairCandidateIndex> => {
  const indexPath = normalizeAssetPath(manifest.indexPath);
  const requestedPairIndexUrl = normalizeAssetUrl(indexPath);
  const pairIndex = await loadJson<PairCandidateIndex>({
    url: requestedPairIndexUrl,
    datasetId: manifest.id,
    datasetLabel: manifest.label,
    sourceLabel: indexPath,
    diagnostics: {
      fileExistsAtBuildTime: buildPairIndexFileExistsDiagnostic(manifest, manifestDiagnostics),
    },
  });
  console.debug('[ReplayLoader] pair index fetched', {
    pairId: manifest.id,
    requestedPairIndexUrl,
    pairIndexFileExistsAtBuildTime: buildPairIndexFileExistsDiagnostic(manifest, manifestDiagnostics),
    candidateCount: pairIndex.candidates.length,
  });
  const invalidCandidate = pairIndex.candidates.find(
    (candidate) =>
      typeof candidate.eventId !== 'string' ||
      typeof candidate.candidateDate !== 'string' ||
      typeof candidate.template !== 'string' ||
      typeof candidate.datasetPath !== 'string',
  );
  if (invalidCandidate) {
    throw new DatasetLoadError({
      datasetId: manifest.id,
      datasetLabel: manifest.label,
      sourceLabel: indexPath,
      phase: 'parse',
      message: 'Pair index is malformed: candidates must include eventId, candidateDate, template, and datasetPath.',
      diagnostics: {
        requestedUrl: requestedPairIndexUrl,
        fileExistsAtBuildTime: buildPairIndexFileExistsDiagnostic(manifest, manifestDiagnostics),
      },
    });
  }
  return pairIndex;
};

export const loadReplayEventDataset = async (
  manifest: DatasetManifestItem,
  datasetPath: string,
): Promise<PreprocessedReplayEventDataset> => {
  const normalizedDatasetPath = normalizeAssetPath(datasetPath);
  const requestedDatasetUrl = normalizeAssetUrl(normalizedDatasetPath);
  console.debug('[ReplayLoader] event payload fetch path', {
    pairId: manifest.id,
    datasetPath: normalizedDatasetPath,
  });
  const dataset = await loadJson<PreprocessedReplayEventDataset>({
    url: requestedDatasetUrl,
    datasetId: manifest.id,
    datasetLabel: manifest.label,
    sourceLabel: normalizedDatasetPath,
  });
  if ((!Array.isArray(dataset.bars1m) || dataset.bars1m.length === 0) && Array.isArray(dataset.bars)) {
    dataset.bars1m = dataset.bars;
  }
  const resolvedBars = Array.isArray(dataset.bars1m) ? dataset.bars1m : [];
  console.debug('[ReplayLoader] event payload parse result', {
    eventId: dataset.eventId,
    bars1m: resolvedBars.length,
    parseStatus: dataset.parseStatus,
  });
  if (!Array.isArray(dataset.bars1m) || dataset.bars1m.length === 0) {
    throw new DatasetLoadError({
      datasetId: manifest.id,
      datasetLabel: manifest.label,
      sourceLabel: normalizedDatasetPath,
      phase: 'parse',
      message: 'Event payload missing or malformed: expected non-empty bars1m array.',
      diagnostics: {
        requestedUrl: requestedDatasetUrl,
      },
    });
  }
  return dataset;
};

export const getManifestDiagnostics = async (): Promise<DatasetManifestDiagnostics | undefined> => {
  const manifest = await loadOfficialManifest();
  return manifest.diagnostics;
};

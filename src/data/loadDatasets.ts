import type {
  DatasetLoadFailurePhase,
  DatasetManifestDiagnostics,
  DatasetManifestItem,
  PairCandidateIndex,
  PreprocessedManifest,
  PreprocessedReplayEventDataset,
} from '../types/domain';

const MANIFEST_URL = '/preprocessed/manifest.json';
const normalizeAssetPath = (value: string) => value.replace(/^\/+/, '');

export class DatasetLoadError extends Error {
  datasetId: string;
  datasetLabel: string;
  sourceLabel: string;
  phase: DatasetLoadFailurePhase;

  constructor({
    datasetId,
    datasetLabel,
    sourceLabel,
    phase,
    message,
  }: {
    datasetId: string;
    datasetLabel: string;
    sourceLabel: string;
    phase: DatasetLoadFailurePhase;
    message: string;
  }) {
    super(message);
    this.name = 'DatasetLoadError';
    this.datasetId = datasetId;
    this.datasetLabel = datasetLabel;
    this.sourceLabel = sourceLabel;
    this.phase = phase;
  }
}

const loadJson = async <T,>({
  url,
  datasetId,
  datasetLabel,
  sourceLabel,
}: {
  url: string;
  datasetId: string;
  datasetLabel: string;
  sourceLabel: string;
}): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new DatasetLoadError({
      datasetId,
      datasetLabel,
      sourceLabel,
      phase: 'file-read',
      message: `Unable to read preprocessed payload (${response.status}). Run npm run preprocess:data first.`,
    });
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new DatasetLoadError({
      datasetId,
      datasetLabel,
      sourceLabel,
      phase: 'parse',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

export const getPreprocessedDatasetManifest = async (): Promise<DatasetManifestItem[]> => {
  const manifest = await loadJson<PreprocessedManifest>({
    url: MANIFEST_URL,
    datasetId: 'manifest',
    datasetLabel: 'manifest',
    sourceLabel: MANIFEST_URL,
  });
  console.debug('[ReplayLoader] manifest loaded', {
    path: MANIFEST_URL,
    pairCount: manifest.pairs.length,
  });
  return manifest.pairs;
};

export const loadPairCandidateIndex = async (
  manifest: DatasetManifestItem,
): Promise<PairCandidateIndex> => {
  const indexPath = normalizeAssetPath(manifest.indexPath);
  const pairIndex = await loadJson<PairCandidateIndex>({
    url: `/${indexPath}`,
    datasetId: manifest.id,
    datasetLabel: manifest.label,
    sourceLabel: indexPath,
  });
  console.debug('[ReplayLoader] pair index fetched', {
    pairId: manifest.id,
    indexPath,
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
    });
  }
  return pairIndex;
};

export const loadReplayEventDataset = async (
  manifest: DatasetManifestItem,
  datasetPath: string,
): Promise<PreprocessedReplayEventDataset> => {
  const normalizedDatasetPath = normalizeAssetPath(datasetPath);
  console.debug('[ReplayLoader] event payload fetch path', {
    pairId: manifest.id,
    datasetPath: normalizedDatasetPath,
  });
  const dataset = await loadJson<PreprocessedReplayEventDataset>({
    url: `/${normalizedDatasetPath}`,
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
    });
  }
  return dataset;
};


export const getManifestDiagnostics = async (): Promise<DatasetManifestDiagnostics | undefined> => {
  const manifest = await loadJson<PreprocessedManifest>({
    url: MANIFEST_URL,
    datasetId: 'manifest',
    datasetLabel: 'manifest',
    sourceLabel: MANIFEST_URL,
  });
  return manifest.diagnostics;
};

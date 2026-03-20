import type {
  DatasetLoadFailurePhase,
  DatasetManifestItem,
  PairCandidateIndex,
  PreprocessedManifest,
  PreprocessedReplayEventDataset,
} from '../types/domain';

const MANIFEST_URL = '/preprocessed/manifest.json';

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
  return manifest.pairs;
};

export const loadPairCandidateIndex = async (
  manifest: DatasetManifestItem,
): Promise<PairCandidateIndex> =>
  loadJson<PairCandidateIndex>({
    url: `/${manifest.indexPath}`,
    datasetId: manifest.id,
    datasetLabel: manifest.label,
    sourceLabel: manifest.indexPath,
  });

export const loadReplayEventDataset = async (
  manifest: DatasetManifestItem,
  datasetPath: string,
): Promise<PreprocessedReplayEventDataset> =>
  loadJson<PreprocessedReplayEventDataset>({
    url: `/${datasetPath}`,
    datasetId: manifest.id,
    datasetLabel: manifest.label,
    sourceLabel: datasetPath,
  });

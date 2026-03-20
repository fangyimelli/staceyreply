import type {
  DatasetLoadFailurePhase,
  DatasetManifestItem,
  ParsedDataset,
} from '../types/domain';

const MANIFEST_URL = '/replay/manifest.json';

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

export const getPreprocessedDatasetManifest = async (): Promise<DatasetManifestItem[]> => {
  const response = await fetch(MANIFEST_URL);
  if (!response.ok) {
    throw new DatasetLoadError({
      datasetId: 'manifest',
      datasetLabel: 'manifest',
      sourceLabel: MANIFEST_URL,
      phase: 'file-read',
      message: `Unable to read replay manifest (${response.status}). Run npm run preprocess:data first.`,
    });
  }

  return response.json() as Promise<DatasetManifestItem[]>;
};

export const loadParsedDataset = async (
  manifest: DatasetManifestItem,
): Promise<ParsedDataset> => {
  const response = await fetch(`/${manifest.artifactPath}`);
  if (!response.ok) {
    throw new DatasetLoadError({
      datasetId: manifest.id,
      datasetLabel: manifest.label,
      sourceLabel: manifest.artifactPath,
      phase: 'file-read',
      message: `Preprocessed pair payload was missing (${response.status}). Run npm run preprocess:data first.`,
    });
  }

  try {
    return (await response.json()) as ParsedDataset;
  } catch (error) {
    throw new DatasetLoadError({
      datasetId: manifest.id,
      datasetLabel: manifest.label,
      sourceLabel: manifest.artifactPath,
      phase: 'parse',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

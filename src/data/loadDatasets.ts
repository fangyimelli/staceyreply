import replayPairBarsJson from '../../sample/sample-1m.json';
import replayPairWindowsCsv from '../../sample/frd_fgd_three_day_windows.csv?raw';
import { parseDatasetFile } from '../parser/fileParser';
import type {
  DatasetFile,
  DatasetLoadFailurePhase,
  DatasetManifestItem,
  ParsedDataset,
} from '../types/domain';

const preprocessedDatasetFiles: DatasetFile[] = [
  {
    id: 'pair:sample-1m',
    label: 'SAMPLE-1M',
    path: 'sample/sample-1m.json',
    kind: 'json',
    raw: JSON.stringify(replayPairBarsJson),
    sourceType: 'preprocessed-manifest',
  },
  {
    id: 'pair:frd-fgd-three-day-windows',
    label: 'FRD-FGD-THREE-DAY-WINDOWS',
    path: 'sample/frd_fgd_three_day_windows.csv',
    kind: 'csv',
    raw: replayPairWindowsCsv,
    sourceType: 'preprocessed-manifest',
  },
];

const preprocessedDatasetManifest: DatasetManifestItem[] = preprocessedDatasetFiles.map((file) => ({
  id: file.id,
  label: file.label,
  path: file.path,
  kind: file.kind,
  sourceType: file.sourceType,
}));

const preprocessedDatasetFilesById = new Map(
  preprocessedDatasetFiles.map((file) => [file.id, file]),
);

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

export const getPreprocessedDatasetManifest = (): DatasetManifestItem[] =>
  preprocessedDatasetManifest;

export const loadParsedDataset = async (
  manifest: DatasetManifestItem,
): Promise<ParsedDataset> => {
  const datasetFile = preprocessedDatasetFilesById.get(manifest.id);
  if (!datasetFile) {
    throw new DatasetLoadError({
      datasetId: manifest.id,
      datasetLabel: manifest.label,
      sourceLabel: manifest.path,
      phase: 'file-read',
      message: 'Preprocessed pair payload was missing from the local manifest index.',
    });
  }

  try {
    return parseDatasetFile(datasetFile);
  } catch (error) {
    throw new DatasetLoadError({
      datasetId: manifest.id,
      datasetLabel: manifest.label,
      sourceLabel: datasetFile.path,
      phase: 'parse',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

import { buildSampleCsv } from './sampleData';
import { parseDatasetFile } from '../parser/fileParser';
import type {
  DatasetFile,
  DatasetLoadFailurePhase,
  DatasetManifestItem,
  ParsedDataset,
  UserDatasetSource,
} from '../types/domain';

const sampleDatasetFile: DatasetFile = {
  id: 'sample-mode',
  label: 'sample-replay.csv',
  path: 'sample-mode',
  kind: 'csv',
  raw: buildSampleCsv(),
  isSample: true,
  sourceType: 'sample',
};

const getFileKind = (name: string): DatasetFile['kind'] | null => {
  if (/\.csv$/i.test(name)) return 'csv';
  if (/\.json$/i.test(name)) return 'json';
  return null;
};

const getRelativePath = (file: File) => file.webkitRelativePath || file.name;

const toDatasetId = (sourceType: UserDatasetSource, relativePath: string) =>
  `${sourceType}:${relativePath.toLowerCase()}`;

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

export const getBuiltinSampleManifest = (): DatasetManifestItem[] => [
  {
    id: sampleDatasetFile.id,
    label: sampleDatasetFile.label,
    path: sampleDatasetFile.path,
    kind: sampleDatasetFile.kind,
    isSample: sampleDatasetFile.isSample,
    sourceType: 'sample',
  },
];

export const fileToDatasetFile = async (
  file: File,
  sourceType: UserDatasetSource,
): Promise<DatasetFile | null> => {
  const kind = getFileKind(file.name);
  if (!kind) return null;

  const relativePath = getRelativePath(file);
  return {
    id: toDatasetId(sourceType, relativePath),
    label: file.name,
    path: relativePath,
    kind,
    raw: await file.text(),
    sourceType,
  };
};

export const createUserDatasetManifest = (
  datasetFiles: DatasetFile[],
): DatasetManifestItem[] =>
  datasetFiles.map((file) => ({
    id: file.id,
    label: file.label,
    path: file.path,
    kind: file.kind,
    isSample: file.isSample,
    sourceType: file.sourceType,
  }));

export const loadParsedDataset = async (
  manifest: DatasetManifestItem,
  datasetFilesById: Map<string, DatasetFile>,
): Promise<ParsedDataset> => {
  if (manifest.isSample) {
    try {
      return parseDatasetFile(sampleDatasetFile);
    } catch (error) {
      throw new DatasetLoadError({
        datasetId: manifest.id,
        datasetLabel: manifest.label,
        sourceLabel: sampleDatasetFile.label,
        phase: 'parse',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const datasetFile = datasetFilesById.get(manifest.id);
  if (!datasetFile) {
    throw new DatasetLoadError({
      datasetId: manifest.id,
      datasetLabel: manifest.label,
      sourceLabel: manifest.path,
      phase: 'file-read',
      message: 'Dataset file contents were unavailable when the loader attempted to parse them.',
    });
  }

  try {
    return parseDatasetFile(datasetFile);
  } catch (error) {
    throw new DatasetLoadError({
      datasetId: manifest.id,
      datasetLabel: manifest.label,
      sourceLabel: datasetFile.label,
      phase: 'parse',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

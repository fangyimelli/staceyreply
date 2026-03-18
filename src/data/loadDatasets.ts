import { buildSampleCsv } from './sampleData';
import { parseDatasetFile } from '../parser/fileParser';
import type { DatasetFile, DatasetManifestItem, ParsedDataset } from '../types/domain';

const datasetLoaders = import.meta.glob('../../dist/mnt/data/*.{csv,json}', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;

const sampleDatasetFile: DatasetFile = {
  id: 'sample-mode',
  label: 'sample-replay.csv',
  path: 'sample-mode',
  kind: 'csv',
  raw: buildSampleCsv(),
  isSample: true,
};

const toManifestItem = (path: string): DatasetManifestItem => ({
  id: path,
  label: path.split('/')[path.split('/').length - 1] ?? path,
  path,
  kind: path.endsWith('.json') ? 'json' : 'csv',
});

export const loadDatasetManifest = (): DatasetManifestItem[] => [
  {
    id: sampleDatasetFile.id,
    label: sampleDatasetFile.label,
    path: sampleDatasetFile.path,
    kind: sampleDatasetFile.kind,
    isSample: sampleDatasetFile.isSample,
  },
  ...Object.keys(datasetLoaders).map(toManifestItem),
];

export const loadParsedDataset = async (manifest: DatasetManifestItem): Promise<ParsedDataset> => {
  if (manifest.isSample) return parseDatasetFile(sampleDatasetFile);

  const loadRaw = datasetLoaders[manifest.path];
  if (!loadRaw) {
    return parseDatasetFile({
      ...manifest,
      raw: '',
    });
  }

  try {
    return parseDatasetFile({
      ...manifest,
      raw: await loadRaw(),
    });
  } catch {
    return parseDatasetFile({
      ...manifest,
      raw: '',
    });
  }
};

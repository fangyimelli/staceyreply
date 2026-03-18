import { buildSampleCsv } from './sampleData';
import { parseDatasetFile } from '../parser/fileParser';
import type { DatasetFile, ParsedDataset } from '../types/domain';

const csvFiles = import.meta.glob('../../dist/mnt/data/*.{csv,json}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const fixedFolderFiles = (): DatasetFile[] => Object.entries(csvFiles).map(([path, raw]) => ({
  id: path,
  label: path.split('/')[path.split('/').length - 1] ?? path,
  path,
  kind: path.endsWith('.json') ? 'json' : 'csv',
  raw,
}));

export const loadParsedDatasets = (): ParsedDataset[] => {
  const files = fixedFolderFiles();
  const datasets = files.map(parseDatasetFile).filter((dataset) => dataset.bars1m.length > 0);
  const sample = parseDatasetFile({ id: 'sample-mode', label: 'sample-replay.csv', path: 'sample-mode', kind: 'csv', raw: buildSampleCsv(), isSample: true });
  return [sample, ...datasets];
};

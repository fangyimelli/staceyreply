import { sampleBars } from './sampleData';
import type { OhlcvBar, StrategyLine, SymbolDataset } from '../types/domain';

export interface BackendSignalWindow {
  pair: string;
  date: string;
  signal: StrategyLine;
}

export interface BackendDatasetRecord {
  pair: string;
  bars1m: OhlcvBar[];
  metadata: {
    source: 'backend-api' | 'sample-mode';
    timezone: 'America/New_York';
    signals: BackendSignalWindow[];
  };
}

export interface BackendDatasetsResponse {
  datasets: BackendDatasetRecord[];
  loadedFrom: 'backend-api' | 'sample-mode';
}

const backendEndpoint = '/api/datasets/day3';

const isOhlcvBar = (value: unknown): value is OhlcvBar => {
  if (!value || typeof value !== 'object') return false;
  const bar = value as Record<string, unknown>;
  return (
    typeof bar.time === 'string' &&
    typeof bar.open === 'number' &&
    typeof bar.high === 'number' &&
    typeof bar.low === 'number' &&
    typeof bar.close === 'number' &&
    typeof bar.volume === 'number'
  );
};

const isStrategyLine = (value: unknown): value is StrategyLine => value === 'FGD' || value === 'FRD';

const normalizeResponse = (payload: unknown): BackendDatasetsResponse => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Dataset response must be an object.');
  }

  const datasets = (payload as { datasets?: unknown }).datasets;
  if (!Array.isArray(datasets)) {
    throw new Error('Dataset response is missing a datasets array.');
  }

  return {
    datasets: datasets.map((dataset, index) => {
      if (!dataset || typeof dataset !== 'object') {
        throw new Error(`Dataset ${index} is invalid.`);
      }

      const entry = dataset as {
        pair?: unknown;
        bars1m?: unknown;
        metadata?: {
          source?: unknown;
          timezone?: unknown;
          signals?: unknown;
        };
      };

      if (typeof entry.pair !== 'string' || !Array.isArray(entry.bars1m) || !entry.bars1m.every(isOhlcvBar)) {
        throw new Error(`Dataset ${index} is missing pair or bars1m.`);
      }

      const rawSignals = Array.isArray(entry.metadata?.signals) ? entry.metadata?.signals : [];
      const signals = rawSignals.filter(
        (signal): signal is BackendSignalWindow =>
          !!signal &&
          typeof signal === 'object' &&
          typeof (signal as { pair?: unknown }).pair === 'string' &&
          typeof (signal as { date?: unknown }).date === 'string' &&
          isStrategyLine((signal as { signal?: unknown }).signal)
      );

      return {
        pair: entry.pair,
        bars1m: entry.bars1m,
        metadata: {
          source: entry.metadata?.source === 'backend-api' ? 'backend-api' : 'sample-mode',
          timezone: entry.metadata?.timezone === 'America/New_York' ? 'America/New_York' : 'America/New_York',
          signals,
        },
      } satisfies BackendDatasetRecord;
    }),
    loadedFrom: (payload as { loadedFrom?: unknown }).loadedFrom === 'backend-api' ? 'backend-api' : 'sample-mode',
  };
};

export const buildSampleDatasetsResponse = (): BackendDatasetsResponse => ({
  datasets: [
    {
      pair: 'SAMPLE',
      bars1m: sampleBars(),
      metadata: {
        source: 'sample-mode',
        timezone: 'America/New_York',
        signals: [],
      },
    },
  ],
  loadedFrom: 'sample-mode',
});

export const toSymbolDatasets = (response: BackendDatasetsResponse): SymbolDataset[] =>
  response.datasets.map((dataset) => ({
    symbol: dataset.pair,
    bars1m: dataset.bars1m,
  }));

export const loadDatasets = async (): Promise<BackendDatasetsResponse> => {
  try {
    const response = await fetch(backendEndpoint, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Backend dataset request failed with ${response.status}.`);
    }

    return normalizeResponse(await response.json());
  } catch {
    return buildSampleDatasetsResponse();
  }
};

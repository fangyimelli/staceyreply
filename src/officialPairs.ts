import type { InstrumentMeta } from "./types/domain";

export interface OfficialPairDefinition {
  displayName: string;
  pairKey: string;
  csvFile: string;
  assetClass: "fx";
  pipSize: number;
  tickSize: number;
}

export const OFFICIAL_PAIRS: OfficialPairDefinition[] = [
  {
    displayName: "EURUSD",
    pairKey: "eurusd",
    csvFile: "staceyreply/dist/mnt/data/DAT_MT_EURUSD_M1_2025.csv",
    assetClass: "fx",
    pipSize: 0.0001,
    tickSize: 0.00001,
  },
  {
    displayName: "USDCAD",
    pairKey: "usdcad",
    csvFile: "staceyreply/dist/mnt/data/DAT_MT_USDCAD_M1_2025.csv",
    assetClass: "fx",
    pipSize: 0.0001,
    tickSize: 0.00001,
  },
  {
    displayName: "GBPUSD",
    pairKey: "gbpusd",
    csvFile: "staceyreply/dist/mnt/data/DAT_MT_GBPUSD_M1_2025.csv",
    assetClass: "fx",
    pipSize: 0.0001,
    tickSize: 0.00001,
  },
  {
    displayName: "AUDUSD",
    pairKey: "audusd",
    csvFile: "staceyreply/dist/mnt/data/DAT_MT_AUDUSD_M1_2025.csv",
    assetClass: "fx",
    pipSize: 0.0001,
    tickSize: 0.00001,
  },
];

export const OFFICIAL_PAIR_KEYS = OFFICIAL_PAIRS.map((pair) => pair.pairKey);

export const OFFICIAL_PAIR_LOOKUP = Object.fromEntries(
  OFFICIAL_PAIRS.map((pair) => [pair.pairKey, pair]),
) as Record<string, OfficialPairDefinition>;

export const buildOfficialInstrumentMeta = (pairKey: string): InstrumentMeta | null => {
  const pair = OFFICIAL_PAIR_LOOKUP[pairKey];
  if (!pair) return null;
  return {
    pairKey: pair.pairKey,
    symbol: pair.displayName,
    assetClass: pair.assetClass,
    quotePrecision: 5,
    tickSize: pair.tickSize,
    pipSize: pair.pipSize,
    pointSize: pair.tickSize,
    preferredStopPips: 15,
    maxStopPips: 20,
    maxStopPoints: 200,
  };
};

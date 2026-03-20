import officialConfig from "./config/official-config.json";
import type { InstrumentMeta } from "./types/domain";

type OfficialConfig = typeof officialConfig;
type OfficialConfigPair = OfficialConfig["pairs"][number];

export interface OfficialPairDefinition extends OfficialConfigPair {
  assetClass: InstrumentMeta["assetClass"];
  pipSize: OfficialConfig["defaults"]["pipSize"];
  tickSize: OfficialConfig["defaults"]["tickSize"];
  preferredStopPips: OfficialConfig["defaults"]["preferredStopPips"];
  maxStopPips: OfficialConfig["defaults"]["maxStopPips"];
  csvFile: string;
}

export const OFFICIAL_PREPROCESSING_INPUT_ROOT = officialConfig.preprocessing.inputRootSegments.join("/");

export const OFFICIAL_PAIRS: OfficialPairDefinition[] = officialConfig.pairs.map((pair) => ({
  ...pair,
  assetClass: "fx",
  pipSize: officialConfig.defaults.pipSize,
  tickSize: officialConfig.defaults.tickSize,
  preferredStopPips: officialConfig.defaults.preferredStopPips,
  maxStopPips: officialConfig.defaults.maxStopPips,
  csvFile: `${OFFICIAL_PREPROCESSING_INPUT_ROOT}/${pair.fileName}`,
}));

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
    preferredStopPips: pair.preferredStopPips,
    maxStopPips: pair.maxStopPips,
    maxStopPoints: pair.maxStopPips * (pair.pipSize / pair.tickSize),
  };
};

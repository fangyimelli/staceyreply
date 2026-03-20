import { OFFICIAL_PAIR_LOOKUP, buildOfficialInstrumentMeta } from "./officialPairs";
import type { InstrumentMeta } from "./types/domain";

const makeMeta = (meta: InstrumentMeta): InstrumentMeta => meta;

const INSTRUMENTS: Record<string, InstrumentMeta> = {
  "sample-1m": makeMeta({
    pairKey: "sample-1m",
    symbol: "SAMPLE-1M",
    assetClass: "sample",
    quotePrecision: 4,
    tickSize: 0.0001,
    pipSize: 0.01,
    pointSize: 0.01,
    preferredStopPips: 12,
    maxStopPips: 20,
    maxStopPoints: 20,
  }),
};

const normalizePairKey = (value: string) => value.trim().toLowerCase().replace(/^pair:/, "");
const normalizeSymbol = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

const inferFxMeta = (pairKey: string, symbol: string): InstrumentMeta | null => {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!/^[A-Z]{6}$/.test(normalizedSymbol)) return null;
  const isJpy = normalizedSymbol.endsWith("JPY");
  return makeMeta({
    pairKey,
    symbol: normalizedSymbol,
    assetClass: "fx",
    quotePrecision: isJpy ? 3 : 5,
    tickSize: isJpy ? 0.001 : 0.00001,
    pipSize: isJpy ? 0.01 : 0.0001,
    pointSize: isJpy ? 0.001 : 0.00001,
    preferredStopPips: 12,
    maxStopPips: 20,
    maxStopPoints: 200,
  });
};

const inferFallbackMeta = (pairKey: string, symbol: string): InstrumentMeta =>
  makeMeta({
    pairKey,
    symbol,
    assetClass: "index",
    quotePrecision: 2,
    tickSize: 0.01,
    pipSize: 1,
    pointSize: 1,
    preferredStopPips: 20,
    maxStopPips: 20,
    maxStopPoints: 20,
  });

export const resolveInstrumentMeta = (pairKeyOrId: string, symbol: string): InstrumentMeta => {
  const pairKey = normalizePairKey(pairKeyOrId);
  return buildOfficialInstrumentMeta(pairKey)
    ?? INSTRUMENTS[pairKey]
    ?? inferFxMeta(pairKey, OFFICIAL_PAIR_LOOKUP[pairKey]?.displayName ?? symbol)
    ?? inferFallbackMeta(pairKey, normalizeSymbol(symbol) || symbol);
};

export const priceDistanceInPips = (distance: number, instrument: InstrumentMeta): number =>
  Number((distance / instrument.pipSize).toFixed(4));

export const targetPriceFromPips = (entryPrice: number, pips: number, instrument: InstrumentMeta, side: "long" | "short"): number =>
  Number((side === "long" ? entryPrice + pips * instrument.pipSize : entryPrice - pips * instrument.pipSize).toFixed(instrument.quotePrecision));

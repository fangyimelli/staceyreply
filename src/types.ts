export type SupportedTimeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1D";

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SymbolDataset {
  symbol: string;
  candles1m: Candle[];
  sourceName: string;
}

export interface DetectedDate {
  date: string;
  rule: "FGD" | "FRD";
  reason: string;
  needsPractice: boolean;
  practiceReason: string;
}

export interface StrategyMarker {
  id: string;
  kind: "source" | "entry" | "stop" | "tp30" | "tp35" | "tp40" | "tp50";
  ruleName: string;
  reasoning: string;
  price: number;
  time: string;
}

export interface StrategyResult {
  explain: string[];
  stage: string;
  validity: "FGD" | "FRD" | "not valid Day 3";
  sourceReason: string;
  stopHuntReason: string;
  setup123Reason: string;
  entryReason: string;
  targetTierReason: string;
  overlays: {
    ema20: number[];
    previousClose: number;
    hos: number;
    los: number;
    hod: number;
    lod: number;
  };
  markers: StrategyMarker[];
}

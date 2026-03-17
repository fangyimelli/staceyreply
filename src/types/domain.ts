export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1D';
export type StrategyLine = 'FGD' | 'FRD';
export type ReplyMode = 'auto' | 'manual';
export interface OhlcvBar { time: string; open: number; high: number; low: number; close: number; volume: number; }
export interface CandidateDate { symbol: string; date: string; type: StrategyLine; reason: string; }
export interface SymbolDataset { symbol: string; bars1m: OhlcvBar[]; }
export interface ScreenedResultRow {
  symbol: string;
  candidateDate: string;
  lineType: StrategyLine;
  validity: 'pass' | 'fail';
  replayAvailable: boolean;
  recommendedNextAction: string;
  currentTargetTier: 30 | 35 | 40 | 50 | null;
  debug?: ScreenedResultDebugPayload;
}
export interface ScreenedResultDebugPayload {
  scanReason: string;
  rejectionReason?: string;
  ruleState?: {
    stage: string;
    entryAllowed: boolean;
    reasons: string[];
    missingConditions: string[];
  };
}
export interface DebugArtifacts {
  rawScanTraces: CandidateDate[];
  rejectedDates: Array<{
    symbol: string;
    candidateDate: string;
    lineType: StrategyLine;
    reason: string;
  }>;
  internalRuleStates: Array<{
    symbol: string;
    candidateDate: string;
    lineType: StrategyLine;
    stage: string;
    entryAllowed: boolean;
    reasons: string[];
    missingConditions: string[];
  }>;
}
export interface Annotation { kind: string; time: string; price: number; rule: string; reasoning: string; }
export interface ExplainState { template: 'FGD'|'FRD'|'NONE'; bias: 'LONG'|'SHORT'|'NEUTRAL'; stage: string; missing: string[]; reasons: string[]; entryAllowed: boolean; target: 30|35|40|50|null; }
export interface Trade { side: 'LONG'|'SHORT'; entry: number; exit: number; pnlPips: number; }

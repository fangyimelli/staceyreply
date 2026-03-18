export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1D';
export type StrategyLine = 'FGD' | 'FRD';
export type ReplyMode = 'auto' | 'manual';
export interface OhlcvBar { time: string; open: number; high: number; low: number; close: number; volume: number; }
export interface CandidateDate { symbol: string; date: string; type: StrategyLine; reason: string; }
export interface SymbolDataset { symbol: string; bars1m: OhlcvBar[]; }

// Internal analysis structures (strategy / replay pipeline).
export interface InternalExplainState {
  template: 'FGD' | 'FRD' | 'NONE';
  bias: 'LONG' | 'SHORT' | 'NEUTRAL';
  stage: string;
  missingConditions: string[];
  reasons: string[];
  evidenceDetails: string[];
  entryAllowed: boolean;
  targetTier: 30 | 35 | 40 | 50 | null;
  ruleTrace: RuleTraceItem[];
}

export interface RuleTraceItem {
  ruleId: string;
  passed: boolean;
  detail: string;
  prices: Record<string, number>;
  times: Record<string, string>;
}

export interface InternalAnnotation {
  id: string;
  kind: string;
  barTime: string;
  price: number;
  ruleName: string;
  reasoning: string;
}

export interface InternalTrade {
  side: 'LONG' | 'SHORT';
  entry: number;
  exit: number;
  pnlPips: number;
  mode?: ReplyMode;
}

export interface InternalDayAnalysis {
  explain: InternalExplainState;
  annotations: InternalAnnotation[];
  previousClose?: number;
  hos?: number;
  los?: number;
  hod?: number;
  lod?: number;
  trade?: InternalTrade;
}

export interface InternalCandidateAnalysis {
  symbol: string;
  candidate: CandidateDate;
  dayAnalysis: InternalDayAnalysis;
}

// Final frontend-screened payload structures.
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

export interface FrontendScreenedPayload {
  screenedResults: ScreenedResultRow[];
  activeSymbol: string;
  bars: OhlcvBar[];
  dayChoices: string[];
  selectedDay: string;
  dayBars: OhlcvBar[];
  ema20: number[];
  dayAnalysis: InternalDayAnalysis;
}

// Debug-only payload structures.
export interface DebugPayload {
  candidatesBySymbol: Record<string, CandidateDate[]>;
  internalCandidateAnalysis: InternalCandidateAnalysis[];
}

// Backwards-compatible aliases used by existing UI components.
export type Annotation = InternalAnnotation;
export type ExplainState = InternalExplainState;
export type Trade = InternalTrade;

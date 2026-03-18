export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1D";
export type StrategyLine = "FGD" | "FRD";
export type ReplyMode = "auto" | "manual";
export type AnnotationKind =
  | "source"
  | "stopHunt"
  | "point1"
  | "point2"
  | "point3"
  | "emaConfirm"
  | "entry"
  | "stop"
  | "tp30"
  | "tp35"
  | "tp40"
  | "tp50";

export interface OhlcvBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DayLevelStats {
  previousClose?: number;
  hod: number;
  lod: number;
  hos: number;
  los: number;
}

export interface StrategyPreprocessingContext {
  bars1m: OhlcvBar[];
  barsByNyDate: Record<string, OhlcvBar[]>;
  dailyBars: OhlcvBar[];
  dailyStatsByNyDate: Record<string, DayLevelStats>;
  timeToIndex: Record<string, number>;
}
export interface CandidateDate {
  symbol: string;
  date: string;
  type: StrategyLine;
  reason: string;
}

export interface ImportedSignalRow {
  pair: string;
  date: string;
  signal: StrategyLine;
  status?: "pass" | "fail" | "backend" | "candidate";
}

export interface SymbolDataset {
  symbol: string;
  bars1m: OhlcvBar[];
}

// Internal analysis structures (strategy / replay pipeline).
export interface TargetAssessment {
  tier: 30 | 35 | 40 | 50;
  reached: boolean;
  missing: string[];
  description: string;
  targetPrice: number;
}

export interface InternalExplainState {
  template: "FGD" | "FRD" | "NONE";
  bias: "LONG" | "SHORT" | "NEUTRAL";
  stage: string;
  missingConditions: string[];
  reasons: string[];
  evidenceDetails: string[];
  entryAllowed: boolean;
  targetTier: 30 | 35 | 40 | 50 | null;
  targetAssessments: TargetAssessment[];
  ruleTrace: RuleTraceItem[];
  intraday?: IntradayRuleSummary;
}

export interface RuleTraceItem {
  ruleId: string;
  passed: boolean;
  detail: string;
  prices: Record<string, number>;
  times: Record<string, string>;
}

export interface IntradayPivotPoint {
  barTime: string;
  price: number;
}

export interface IntradayRuleSummary {
  source?: IntradayPivotPoint;
  stop?: IntradayPivotPoint;
  stopHunt?: {
    sweptLevel: IntradayPivotPoint;
    reclaim: IntradayPivotPoint;
  };
  pattern123?: {
    node1?: IntradayPivotPoint;
    node2?: IntradayPivotPoint;
    node3?: IntradayPivotPoint;
    breakout?: IntradayPivotPoint;
  };
  emaConfirm?: IntradayPivotPoint;
  move30Pips: number;
  rotationTagged: boolean;
  engulfment: boolean;
}

export interface InternalAnnotation {
  id: string;
  kind: AnnotationKind;
  barTime: string;
  price: number;
  ruleId?: string;
  ruleName: string;
  reasoning: string;
  tracePrices?: Record<string, number>;
  traceTimes?: Record<string, string>;
}

export interface InternalTrade {
  side: "LONG" | "SHORT";
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
  validity: "pass" | "fail";
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

export interface ReplayState {
  isPlaying: boolean;
  isFinished: boolean;
  currentBarIndex: number;
  playSpeed: number;
  replayStartIndex: number;
  replayEndIndex: number;
}

export interface FrontendScreenedPayload {
  importedSignalRows: ImportedSignalRow[];
  screenedResults: ScreenedResultRow[];
  activeSymbol: string;
  bars: OhlcvBar[];
  dayChoices: string[];
  selectedDay: string;
  fullDayBars: OhlcvBar[];
  revealedBars: OhlcvBar[];
  revealedEma20: number[];
  dayAnalysis: InternalDayAnalysis;
  replayDefaults: {
    replayStartIndex: number;
    replayEndIndex: number;
  };
  replayMeta: {
    currentBarIndex: number;
    scopeLabel: string;
  };
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

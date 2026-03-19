export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1D";
export type TemplateType = "FGD" | "FRD" | "INVALID" | "INCOMPLETE";
export type ReplayMode = "pause" | "auto" | "semi";
export type PracticeStatus = "needs-practice" | "auto-only" | "filtered-out";
export type TradeSide = "long" | "short";
export type TradeResult = "win" | "loss" | "breakeven";
export type ReplayStageId =
  | "background"
  | "signal"
  | "trade-day"
  | "source"
  | "stop-hunt"
  | "pattern-123"
  | "ema"
  | "entry"
  | "management"
  | "complete"
  | "invalid";

export interface TimeSemantics {
  source: "fixed-est-no-dst" | "iso-offset" | "unqualified-text";
  strategy: "america-new_york";
}

export interface OhlcvBar {
  time: string;
  rawTimeText?: string;
  rawDateText?: string;
  sourceTime?: string;
  normalizedTime?: string;
  sourceStartTime?: string;
  sourceEndTime?: string;
  traceTimes?: Array<{
    normalizedTime: string;
    sourceTime: string;
    rawTimeText?: string;
    rawDateText?: string;
  }>;
  timeSemantics?: TimeSemantics;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DatasetFile {
  id: string;
  label: string;
  path: string;
  kind: "csv" | "json";
  raw: string;
  isSample?: boolean;
}

export interface DatasetManifestItem {
  id: string;
  label: string;
  path: string;
  kind: "csv" | "json";
  isSample?: boolean;
}

export interface ParsedDataset {
  datasetId: string;
  symbol: string;
  bars1m: OhlcvBar[];
  sourceLabel: string;
  isSample: boolean;
  parseStatus: "success" | "error";
  parseErrors: string[];
  parseDiagnostics: string[];
}

export interface DatasetValidationIssue {
  code:
    | "missing-pump-context"
    | "missing-dump-context"
    | "missing-signal-day"
    | "insufficient-intraday"
    | "previous-close-unavailable"
    | "timeframe-discontinuity"
    | "template-unverifiable"
    | "invalid-format";
  message: string;
  detail: string;
}

export interface RuleTraceItem {
  ruleName: string;
  timeframe: Timeframe | "session";
  passed: boolean;
  reason: string;
  prices: Record<string, number>;
  times: Record<string, string>;
}

export interface EventLogItem {
  id: string;
  stage: ReplayStageId;
  title: string;
  summary: string;
  detail: string;
  statusBanner: string;
  visibleFromIndex: number;
  barTime?: string;
  prices?: Record<string, number>;
  trace: RuleTraceItem[];
}

export interface Annotation {
  id: string;
  kind:
    | "source"
    | "stopHunt"
    | "point1"
    | "point2"
    | "point3"
    | "ema"
    | "entry"
    | "stop"
    | "tp30"
    | "tp35"
    | "tp40"
    | "tp50"
    | "marker";
  barTime: string;
  price: number;
  label: string;
  reasoning: string;
  trace: RuleTraceItem[];
  visibleFromIndex: number;
}

export interface TradeLevel {
  tier: 30 | 35 | 40 | 50;
  price: number;
  eligible: boolean;
  hit: boolean;
  status: "blocked" | "pending" | "eligible" | "hit";
  reason: string;
  missingGate?: string;
}

export interface ReplayVisibility {
  stage: ReplayStageId;
  canEnter: boolean;
  statusBanner: string;
  currentReasoning: string[];
  currentBarIndex: number;
  visibleEvents: EventLogItem[];
  visibleAnnotations: Annotation[];
  lastReplyEval: {
    stage: ReplayStageId;
    canReply: boolean;
    explanation: string;
  };
}

export interface TradeExecution {
  id: string;
  mode: "auto" | "manual";
  side: TradeSide;
  entryPrice: number;
  entryBarIndex: number;
  entryTime: string;
  exitPrice?: number;
  exitBarIndex?: number;
  exitTime?: string;
  realizedPnL: number;
  cumulativePnL: number;
  result?: TradeResult;
  status: "open" | "closed";
  exitReason?: string;
}

export interface ReplayPnLState {
  mode: "auto" | "manual";
  currentPosition: TradeExecution | null;
  trades: TradeExecution[];
  lastTrade: TradeExecution | null;
  cumulativePnL: number;
}

export interface ReplayDatasetAnalysis {
  datasetId: string;
  symbol: string;
  timeframeBars: Record<Timeframe, OhlcvBar[]>;
  template: TemplateType;
  bias: "bullish" | "bearish" | "neutral";
  quality: "strong" | "acceptable" | "weak" | "invalid";
  selectedTradeDay: string;
  invalidReasons: string[];
  missingConditions: string[];
  nextExpectation: string;
  eventLog: EventLogItem[];
  ruleTrace: RuleTraceItem[];
  annotations: Annotation[];
  replayStartIndex: number;
  replayEndIndex: number;
  stopPrice?: number;
  entryPrice?: number;
  sourcePrice?: number;
  previousClose?: number;
  hos?: number;
  los?: number;
  hod?: number;
  lod?: number;
  targetLevels: TradeLevel[];
  recommendedTarget?: 30 | 35 | 40 | 50;
}

export interface CandidateTradeDay {
  date: string;
  template: TemplateType;
  practiceStatus: PracticeStatus;
  valid: boolean;
  summaryReason: string;
}

export interface SelectedTradeDayState {
  selectedTradeDay: string;
  availableTradeDays: CandidateTradeDay[];
}

export interface ReplayAnalysis
  extends ReplayDatasetAnalysis, ReplayVisibility {}

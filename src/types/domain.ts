export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1D";
export type TemplateType = "FGD" | "FRD" | "FRD_INSIDE" | "INVALID" | "INCOMPLETE";
export type ReplayMode = "pause" | "auto" | "semi";
export type PracticeStatus = "needs-practice" | "auto-only" | "filtered-out";
export type TradeSide = "long" | "short";
export type TradeResult = "win" | "loss" | "breakeven";
export type TradeEntrySemantics =
  | "strategy-entry"
  | "manual-execution-user"
  | "manual-execution-close";
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

export type UserDatasetSource = "preprocessed-manifest";

export interface DatasetDateRange {
  start: string;
  end: string;
}

export interface DatasetManifestDiagnostics {
  manifestPairCount: number;
  officialPairUniverse: string[];
  manifestPairKeys: string[];
  missingOfficialPairs: string[];
  missingPairFolders: string[];
  skippedPairFolders: Array<{
    pairKey: string;
    reason: string;
  }>;
}

export interface DatasetManifestItem {
  id: string;
  label: string;
  sourceLabel: string;
  indexPath: string;
  candidateCount: number;
  dateRange: DatasetDateRange | null;
  datasetVersion: string;
  pairKey: string;
  folderName: string;
  symbol: string;
}

export interface PreprocessedManifest {
  datasetVersion: string;
  generatedAt: string;
  diagnostics?: DatasetManifestDiagnostics;
  pairs: DatasetManifestItem[];
}

export interface PairCandidateSummary {
  eventId: string;
  candidateDate: string;
  template: TemplateType;
  shortSummary: string;
  practiceStatus: PracticeStatus;
  datasetPath: string;
}

export interface PairCandidateIndex {
  pairId: string;
  pairLabel: string;
  sourceLabel: string;
  datasetVersion: string;
  pairKey: string;
  folderName: string;
  symbol: string;
  candidates: PairCandidateSummary[];
}

export type TimeframeBarMap = Record<Timeframe, OhlcvBar[]>;

export interface InstrumentMeta {
  pairKey: string;
  symbol: string;
  assetClass: "fx" | "metal" | "index" | "crypto" | "sample";
  quotePrecision: number;
  tickSize: number;
  pipSize: number;
  pointSize: number;
  preferredStopPips?: number;
  maxStopPips?: number;
  maxStopPoints?: number;
}

export interface ParsedDataset {
  datasetId: string;
  symbol: string;
  instrument?: InstrumentMeta;
  bars1m: OhlcvBar[];
  precomputedTimeframeBars?: Partial<TimeframeBarMap>;
  sourceLabel: string;
  parseStatus: "success" | "error";
  parseErrors: string[];
  parseDiagnostics: string[];
}

export interface ReplayEventMetadata {
  eventWindow: {
    startDate: string;
    endDate: string;
    availableDates: string[];
  };
}

export interface PreprocessedReplayEventDataset extends ParsedDataset {
  eventId: string;
  pair: string;
  candidateDate: string;
  template: TemplateType;
  bars?: OhlcvBar[];
  metadata: ReplayEventMetadata;
}

export type DatasetLoadFailurePhase = "file-read" | "parse" | "analysis-setup";

export interface DatasetLoadErrorInfo {
  datasetId: string;
  datasetLabel: string;
  sourceLabel: string;
  phase: DatasetLoadFailurePhase;
  message: string;
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
  status: "blocked" | "pending" | "eligible" | "hit" | "hypothetical";
  mode?: "actual" | "hypothetical" | "disabled";
  reason: string;
  missingGate?: string;
}

export type UnifiedTemplateType = "FGD" | "FRD" | "FRD_INSIDE";
export type UnifiedScoreBand =
  | "textbook"
  | "valid"
  | "aggressive"
  | "no-trade";
export type UnifiedFeatureCategory =
  | "template-edge"
  | "session-location"
  | "entry-confirmation"
  | "quality-behavior";
export type UnifiedHardGateKey =
  | "templateValid"
  | "day3Active"
  | "sessionTimingValid"
  | "sourceLocationValid"
  | "emaEntryValid"
  | "stopDistanceValid";
export interface UnifiedHardGate {
  key: UnifiedHardGateKey;
  label: string;
  passed: boolean;
  reason: string;
}

export interface UnifiedWeightedFeature {
  key: string;
  label: string;
  value: number | boolean | string;
  active: boolean;
  weightFGD: number;
  weightFRD: number;
  contribution: number;
  category: UnifiedFeatureCategory;
}

export interface UnifiedSignalDayStrategy {
  templateType?: UnifiedTemplateType;
  direction: TradeSide;
  hardGates: UnifiedHardGate[];
  weightedFeatures: UnifiedWeightedFeature[];
  score: number;
  scoreBand: UnifiedScoreBand;
  entryAllowed: boolean;
  entryReason: string;
  candidateEntryPrice?: number;
  confirmedEntryPrice?: number;
  debugBreakdown: {
    byCategory: Record<UnifiedFeatureCategory, number>;
    topPositiveFeatures: UnifiedWeightedFeature[];
    missingHighValueFeatures: UnifiedWeightedFeature[];
    whyEntryBlocked: string[];
  };
}

export interface BacktestSignalSnapshot {
  templateType?: UnifiedTemplateType;
  direction: TradeSide;
  score: number;
  scoreBand: UnifiedScoreBand;
  hardGates: UnifiedHardGate[];
  activeFeatures: string[];
  sourceToPrevClosePips?: number;
  d1BodyPips?: number;
  d1BodyPctRange?: number;
  hit30: boolean;
  hit35: boolean;
  hit40: boolean;
  hit50: boolean;
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
  strategyEntryPrice?: number;
  manualExecutionPrice?: number;
  entrySemantics: TradeEntrySemantics;
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
  instrument: InstrumentMeta;
  timeframeBars: TimeframeBarMap;
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
  candidateEntryPrice?: number;
  confirmedEntryPrice?: number;
  sourcePrice?: number;
  previousClose?: number;
  hos?: number;
  los?: number;
  hod?: number;
  lod?: number;
  targetLevels: TradeLevel[];
  recommendedTarget?: 30 | 35 | 40 | 50;
  unifiedStrategy: UnifiedSignalDayStrategy;
  pairDiagnostics?: {
    manifestPairCount: number;
    visiblePairCount: number;
    officialPairUniverse: string[];
    manifestPairKeys: string[];
    missingOfficialPairs: string[];
    selectedPairKey: string;
    selectedPairCsvPath?: string;
    selectedPairPreprocessedFolder?: string;
    selectedPairPipSize?: number;
    selectedPairStopRule?: string;
    missingPairFolders: string[];
    skippedPairFolders: Array<{ pairKey: string; reason: string }>;
  };
  backtestSnapshot: BacktestSignalSnapshot;
}

export interface CandidateTradeDay {
  eventId: string;
  date: string;
  template: TemplateType;
  practiceStatus: PracticeStatus;
  valid: boolean;
  shortSummary: string;
}

export interface SelectedTradeDayState {
  selectedTradeDay: string;
  availableTradeDays: CandidateTradeDay[];
}

export interface ReplayAnalysis
  extends ReplayDatasetAnalysis, ReplayVisibility {}

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1D';
export type TemplateType = 'FGD' | 'FRD' | 'INVALID' | 'INCOMPLETE';
export type ReplayMode = 'pause' | 'auto' | 'semi';
export type ReplayStageId =
  | 'background'
  | 'signal'
  | 'trade-day'
  | 'source'
  | 'stop-hunt'
  | 'pattern-123'
  | 'ema'
  | 'entry'
  | 'management'
  | 'complete'
  | 'invalid';

export interface TimeSemantics {
  source: 'fixed-est-no-dst' | 'iso-offset' | 'unqualified-text';
  strategy: 'america-new_york';
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
  kind: 'csv' | 'json';
  raw: string;
  isSample?: boolean;
}

export interface ParsedDataset {
  datasetId: string;
  symbol: string;
  bars1m: OhlcvBar[];
  sourceLabel: string;
  isSample: boolean;
}

export interface DatasetValidationIssue {
  code:
    | 'missing-pump-context'
    | 'missing-dump-context'
    | 'missing-signal-day'
    | 'insufficient-intraday'
    | 'previous-close-unavailable'
    | 'timeframe-discontinuity'
    | 'template-unverifiable'
    | 'invalid-format';
  message: string;
  detail: string;
}

export interface RuleTraceItem {
  ruleName: string;
  timeframe: Timeframe | 'session';
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
  kind: 'source' | 'stopHunt' | 'point1' | 'point2' | 'point3' | 'ema' | 'entry' | 'stop' | 'tp30' | 'tp35' | 'tp40' | 'tp50' | 'marker';
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
  hit: boolean;
  reason: string;
}

export interface ReplayAnalysis {
  datasetId: string;
  symbol: string;
  timeframeBars: Record<Timeframe, OhlcvBar[]>;
  template: TemplateType;
  bias: 'bullish' | 'bearish' | 'neutral';
  quality: 'strong' | 'acceptable' | 'weak' | 'invalid';
  selectedTradeDay: string;
  stage: ReplayStageId;
  canEnter: boolean;
  statusBanner: string;
  invalidReasons: string[];
  missingConditions: string[];
  currentReasoning: string[];
  nextExpectation: string;
  eventLog: EventLogItem[];
  ruleTrace: RuleTraceItem[];
  annotations: Annotation[];
  currentBarIndex: number;
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
  lastReplyEval: {
    stage: ReplayStageId;
    canReply: boolean;
    explanation: string;
  };
}

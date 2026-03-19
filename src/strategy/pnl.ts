import type { ReplayPnLState, TradeExecution, TradeResult, TradeSide } from "../types/domain";

const toTradeResult = (realizedPnL: number): TradeResult =>
  realizedPnL > 0 ? "win" : realizedPnL < 0 ? "loss" : "breakeven";

export const calculateRealizedPnL = (
  entryPrice: number,
  exitPrice: number,
  side: TradeSide,
) => (side === "long" ? exitPrice - entryPrice : entryPrice - exitPrice);

export const createTradeExecution = ({
  id,
  mode,
  side,
  entryPrice,
  entryBarIndex,
  entryTime,
  cumulativePnL,
}: {
  id: string;
  mode: TradeExecution["mode"];
  side: TradeSide;
  entryPrice: number;
  entryBarIndex: number;
  entryTime: string;
  cumulativePnL: number;
}): TradeExecution => ({
  id,
  mode,
  side,
  entryPrice,
  entryBarIndex,
  entryTime,
  realizedPnL: 0,
  cumulativePnL,
  status: "open",
});

export const closeTradeExecution = (
  trade: TradeExecution,
  {
    exitPrice,
    exitBarIndex,
    exitTime,
    exitReason,
    cumulativePnLBeforeTrade,
  }: {
    exitPrice: number;
    exitBarIndex: number;
    exitTime: string;
    exitReason: string;
    cumulativePnLBeforeTrade: number;
  },
): TradeExecution => {
  const realizedPnL = calculateRealizedPnL(
    trade.entryPrice,
    exitPrice,
    trade.side,
  );
  return {
    ...trade,
    exitPrice,
    exitBarIndex,
    exitTime,
    exitReason,
    realizedPnL,
    cumulativePnL: cumulativePnLBeforeTrade + realizedPnL,
    result: toTradeResult(realizedPnL),
    status: "closed",
  };
};

export const createReplayPnLState = (
  mode: ReplayPnLState["mode"] = "auto",
): ReplayPnLState => ({
  mode,
  currentPosition: null,
  trades: [],
  lastTrade: null,
  cumulativePnL: 0,
});

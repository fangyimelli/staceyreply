import { Candle, DetectedDate } from "../types.js";
import { dailyBucketKeyNy } from "../utils/nyDate";

export function scanCandidateDates(candles: Candle[]): DetectedDate[] {
  const byDate = new Map<string, Candle[]>();
  candles.forEach((c) => {
    const d = dailyBucketKeyNy(c.time);
    byDate.set(d, [...(byDate.get(d) ?? []), c]);
  });

  return Array.from(byDate.entries()).map(([date, dayCandles], idx) => {
    const change = dayCandles[dayCandles.length - 1].close - dayCandles[0].open;
    const rule = Math.abs(change) > 1 ? "FGD" : "FRD";
    const movementPass = Math.abs(change) > 0.5;
    const tierPass = Math.abs(change) > 1.5;
    const needsPractice = !movementPass || !tierPass;
    const practiceReason = !movementPass
      ? "Rules not fully passed: daily movement below baseline threshold."
      : !tierPass
      ? "Target tier not reached: day move has not met TP-tier expectation."
      : "Practice complete for current scan rules.";

    return {
      date,
      rule,
      reason: `${rule} candidate by initial scan (day index ${idx + 1}).`,
      needsPractice,
      practiceReason
    };
  });
}

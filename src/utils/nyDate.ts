export const NEW_YORK_TIME_ZONE = "America/New_York";

const nyDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: NEW_YORK_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const toNyDateTimeParts = (time: string): {
  date: string;
  hour: number;
  minute: number;
} => {
  const parts = nyDateTimeFormatter.formatToParts(new Date(time));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
};

export const dailyBucketKeyNy = (time: string): string => toNyDateTimeParts(time).date;

export const timeframeBucketKeyNy = (time: string, timeframe: '1D' | '5m' | '15m' | '1h' | '4h'): string => {
  const { date, hour, minute } = toNyDateTimeParts(time);

  if (timeframe === '1D') return date;

  const bucketMinutesByTimeframe = {
    '5m': 5,
    '15m': 15,
    '1h': 60,
    '4h': 240,
  } as const;

  const bucketSizeMinutes = bucketMinutesByTimeframe[timeframe];
  const totalMinutes = hour * 60 + minute;
  const bucketStartMinutes = Math.floor(totalMinutes / bucketSizeMinutes) * bucketSizeMinutes;
  const bucketHour = String(Math.floor(bucketStartMinutes / 60)).padStart(2, '0');
  const bucketMinute = String(bucketStartMinutes % 60).padStart(2, '0');

  return `${date}T${bucketHour}:${bucketMinute}`;
};

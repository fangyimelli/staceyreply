export const NEW_YORK_TIME_ZONE = "America/New_York";

export const dailyBucketKeyNy = (time: string): string =>
  new Date(time).toLocaleDateString("en-CA", { timeZone: NEW_YORK_TIME_ZONE });

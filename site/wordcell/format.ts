const numbers = new Intl.NumberFormat("en-US");
const dates = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });
const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"] as const;

/** Numbers under ten are spelled out in prose; larger ones use digit grouping. */
export function prose(value: number): string {
  return Number.isInteger(value) && value >= 0 && value < 10 ? words[value] ?? String(value) : numbers.format(value);
}

export function grouped(value: number): string {
  return numbers.format(value);
}

/** "2026-09-26" becomes "September 26, 2026". */
export function longDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(isoDate)) throw new TypeError(`Expected an ISO date, got ${isoDate}.`);
  return dates.format(new Date(`${isoDate}T00:00:00Z`));
}

/** Signed to two decimals with a real minus sign: "−3.33", "+6.67". */
export function signed(value: number): string {
  const magnitude = Math.abs(value).toFixed(2);
  return value < 0 ? `−${magnitude}` : value > 0 ? `+${magnitude}` : magnitude;
}

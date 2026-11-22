/** Parse the parser's local ISO string ("2026-11-21T14:05:00") as local time. */
export function fromLocalIso(iso: string): Date {
  return new Date(iso); // no "Z" suffix → interpreted as local time
}

const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function formatDay(iso: string | null): string {
  return iso ? dayFmt.format(fromLocalIso(iso)) : 'Unknown date';
}

/** First and last valid timestamps among messages. */
export function dateRange(timestamps: Array<string | null>): { first: string; last: string } | null {
  const valid = timestamps.filter((t): t is string => t !== null).sort();
  const first = valid[0];
  const last = valid[valid.length - 1];
  return first && last ? { first, last } : null;
}

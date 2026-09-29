/**
 * Deterministic date math for training plans. The model produces a skeleton of
 * weekday-labeled days; these helpers anchor it to real calendar dates so we
 * never rely on the LLM for multi-week date arithmetic.
 *
 * All functions operate on YYYY-MM-DD strings in a TZ-neutral way (parsed at
 * UTC noon to avoid any date-shift), and are pure/testable.
 */

const DAY_MS = 86_400_000;
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Parse a YYYY-MM-DD into a Date at UTC noon (stable, no TZ date-shift). */
function parseIso(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/** Format a Date back to YYYY-MM-DD (UTC). */
function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Add n days to a YYYY-MM-DD string. */
export function addDays(iso: string, n: number): string {
  return toIso(new Date(parseIso(iso).getTime() + n * DAY_MS));
}

/** The Monday on or after `iso` — the plan's calendar anchor. */
export function nextMonday(iso: string): string {
  const dow = parseIso(iso).getUTCDay(); // 0=Sun..6=Sat
  // Days until Monday (1). If already Monday, start today.
  const delta = (8 - dow) % 7;
  return addDays(iso, delta);
}

/**
 * Whole weeks from `startMonday` up to and including `targetDate`, min 1. Used to
 * size the plan. Rounds up so the goal date is covered.
 */
export function weeksUntil(startMonday: string, targetDate: string): number {
  const days = Math.round(
    (parseIso(targetDate).getTime() - parseIso(startMonday).getTime()) / DAY_MS,
  );
  if (days <= 0) return 1;
  return Math.max(1, Math.ceil((days + 1) / 7));
}

/** Weekday name (e.g. "Monday") for a given YYYY-MM-DD. */
export function weekdayOf(iso: string): (typeof WEEKDAYS)[number] {
  return WEEKDAYS[parseIso(iso).getUTCDay()];
}

/** Whole days from `today` to `iso` (negative = past). Both YYYY-MM-DD. */
export function daysBetween(today: string, iso: string): number {
  return Math.round(
    (parseIso(iso).getTime() - parseIso(today).getTime()) / DAY_MS,
  );
}

/**
 * A human, date-relative label for `iso` given `today` — "Today", "Tomorrow",
 * or null for anything further out (callers fall back to a weekday/date).
 */
export function relativeDayLabel(today: string, iso: string): string | null {
  switch (daysBetween(today, iso)) {
    case 0:
      return "Today";
    case 1:
      return "Tomorrow";
    default:
      return null;
  }
}

/**
 * Assign a real calendar date to each day of each week. Week 1 day "Monday" =
 * startMonday; day offset = index within the Mon→Sun week. Returns the date for
 * a given (weekNumber, dayIndex), both 1-based week / 0-based day.
 */
export function dateForSlot(
  startMonday: string,
  weekNumber: number,
  dayIndex: number,
): string {
  return addDays(startMonday, (weekNumber - 1) * 7 + dayIndex);
}

/**
 * The Monday→Sunday calendar span for each of `weekCount` weeks starting at
 * `startMonday`. Feeds the coach prompt so the model can map the dates a user
 * mentions to week/day slots.
 */
export function weekDateRanges(
  startMonday: string,
  weekCount: number,
): { weekNumber: number; monday: string; sunday: string }[] {
  return Array.from({ length: weekCount }, (_, i) => ({
    weekNumber: i + 1,
    monday: dateForSlot(startMonday, i + 1, 0),
    sunday: dateForSlot(startMonday, i + 1, 6),
  }));
}

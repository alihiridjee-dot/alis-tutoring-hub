/**
 * Week arithmetic for the planner.
 *
 * `student_weekly_plans.week_start` is a DATE holding the Monday of the week a
 * plan covers. Date, not timestamp, on purpose: a plan belongs to a week, and
 * storing an instant invites drift at the boundary when the browser and the
 * database disagree about the timezone.
 *
 * Everything here therefore works in the LOCAL calendar day and formats by hand
 * rather than going through `toISOString()`, which converts to UTC first and so
 * hands back the previous Monday for anyone west of Greenwich late on a Sunday.
 */

/** `YYYY-MM-DD` for a local date, with no timezone conversion. */
export function toDateKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The Monday on or before `from`. Sunday counts as belonging to the week just ending. */
export function mondayOf(from: Date = new Date()): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  // getDay(): 0 = Sunday. Shift so Monday = 0, then subtract.
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

/** `week_start` key for the week containing `from`. */
export function weekStartKey(from: Date = new Date()): string {
  return toDateKey(mondayOf(from));
}

/** Shift a week key by whole weeks. Negative goes back. */
export function addWeeks(weekKey: string, weeks: number): string {
  const [y, m, d] = weekKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + weeks * 7);
  return toDateKey(dt);
}

/** "Mon 18 Aug" — for week headings. */
export function formatWeek(weekKey: string): string {
  const [y, m, d] = weekKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * The same week without the weekday — "19 Oct".
 *
 * For tables and columns, where every row is a Monday anyway and repeating
 * "Mon" down the page is noise that stops the dates lining up.
 */
export function formatWeekShort(weekKey: string): string {
  const [y, m, d] = weekKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

/** Whole weeks from one week key to another. Negative means earlier. */
export function weeksApart(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.round((b - a) / (7 * 86_400_000));
}

/** Whole days from now until `iso`. Negative means overdue. */
export function daysUntil(iso: string): number {
  const then = new Date(iso);
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const now = new Date();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/** "in 3 days" / "today" / "4 days ago" — used on due dates throughout. */
export function relativeDay(iso: string): string {
  const n = daysUntil(iso);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${Math.abs(n)} days ago`;
}

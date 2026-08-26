/**
 * How a dream's date is described back to the dreamer. A dream is filed under one
 * `occurred_at`, but it happened during a *night* — which usually straddles two
 * calendar days. Both the log screen (as it is being written) and the dream detail
 * (as it is read back) say so the same way, so the formatting lives here rather than
 * in either screen.
 */

/** The two calendar days a night spans, given the day the dream is filed under. */
function nightBounds(date: Date): { start: Date; end: Date } {
  const end = new Date(date);
  end.setDate(date.getDate() + 1);
  return { start: date, end };
}

/**
 * True when a bedtime belongs to the evening *before* the morning the dreamer woke —
 * anything from noon onwards. An early-hours bedtime ("02:30") is already on the same
 * calendar day as waking, so that night spans a single day and is not worth naming.
 */
export function bedtimeStraddlesMidnight(bedtime: string | null): boolean {
  const hour = bedtime ? Number(bedtime.split(':')[0]) : NaN;
  return Number.isFinite(hour) && hour >= 12;
}

/**
 * "Night of 22–23 August" — the dream's date is really a night spanning two calendar
 * days, so it is described as one rather than as the single day `occurredAt` stores.
 * Crosses a month boundary correctly (day 1 of a new month gets its own month name
 * rather than silently reusing the first day's), and leaves day/month ordering to the
 * locale's own template.
 *
 * `date` is the night's *first* day — the evening the dreamer fell asleep.
 */
export function formatNightLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  locale: string,
  date: Date
): string {
  const { start, end } = nightBounds(date);
  const day = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric' });
  const month = (d: Date) => d.toLocaleDateString(locale, { month: 'long' });
  const sameMonth =
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  return sameMonth
    ? t('log.nightOfSameMonth', { d1: day(start), d2: day(end), month: month(start) })
    : t('log.nightOfCrossMonth', {
        d1: day(start),
        month1: month(start),
        d2: day(end),
        month2: month(end),
      });
}

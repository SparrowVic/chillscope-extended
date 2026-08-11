import {
  capitaliseFirst,
  dayFormat,
  durationFormat,
  exactTimestampFormat,
  relativeTimeFormat,
} from '../../shared/intl';
import { DAY_MS, HOUR_MS, MINUTE_MS, startOfDay } from '../../shared/time';

const RELATIVE_DIVISIONS: readonly {
  readonly amount: number;
  readonly unit: Intl.RelativeTimeFormatUnit;
}[] = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
];

/** Below this, "45 seconds ago" says less than "now" — and a zero delta has no tense at all. */
const JUST_NOW_SECONDS = 45;

export function formatRelativeTime(timestamp: number, now: number, lang: string): string {
  let distance = (timestamp - now) / 1_000;

  if (Math.abs(distance) < JUST_NOW_SECONDS) {
    // `numeric: 'always'` would render a fresh alarm as "in 0 seconds": a past event, future tense.
    return capitaliseFirst(relativeTimeFormat(lang, 'auto').format(0, 'second'), lang);
  }

  for (const division of RELATIVE_DIVISIONS) {
    // Rounded before the comparison, otherwise 23 h 59 m passes the `< 24 hours` test and is then
    // rounded up to the unreachable "24 hours ago" instead of rolling over to "1 day ago".
    const rounded = Math.round(distance);
    if (Math.abs(rounded) < division.amount) {
      return relativeTimeFormat(lang, 'always').format(rounded, division.unit);
    }
    distance /= division.amount;
  }

  return relativeTimeFormat(lang, 'always').format(Math.round(distance), 'year');
}

export function formatAbsoluteTime(timestamp: number, lang: string): string {
  return exactTimestampFormat(lang).format(timestamp);
}

const timeOfDayFormats = new Map<string, Intl.DateTimeFormat>();

/**
 * The clock reading a row prints next to its relative age. The date half stays with the day
 * heading above the group, so the row itself only needs the time — the full timestamp remains
 * available to assistive technology through the row's screen-reader text.
 */
export function formatTimeOfDay(timestamp: number, lang: string): string {
  let format = timeOfDayFormats.get(lang);
  if (format === undefined) {
    format = new Intl.DateTimeFormat(lang, { hour: 'numeric', minute: '2-digit' });
    timeOfDayFormats.set(lang, format);
  }
  return format.format(timestamp);
}

/** "Today" and "Yesterday" come from `Intl` too, which keeps the two day names out of the catalogue. */
export function formatDayHeading(dayStart: number, now: number, lang: string): string {
  const offsetDays = Math.round((dayStart - startOfDay(now)) / DAY_MS);

  if (offsetDays === 0 || offsetDays === -1) {
    return capitaliseFirst(relativeTimeFormat(lang, 'auto').format(offsetDays, 'day'), lang);
  }

  const spansYears = new Date(dayStart).getFullYear() !== new Date(now).getFullYear();
  return capitaliseFirst(dayFormat(lang, spansYears).format(dayStart), lang);
}

export function formatDuration(durationMs: number, lang: string): string {
  if (durationMs < HOUR_MS) {
    return durationFormat(lang, 'minute').format(Math.max(1, Math.round(durationMs / MINUTE_MS)));
  }
  return durationFormat(lang, 'hour').format(Math.round((durationMs / HOUR_MS) * 10) / 10);
}

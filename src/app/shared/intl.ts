/**
 * Every `Intl` formatter in the application is built here.
 *
 * Two reasons. Constructing a formatter costs far more than formatting with it, and a table redraw
 * asks for the same handful over and over — so they are cached per language. And the precision of a
 * measured value is a product decision, not a per-component one: before this module the Dashboard
 * showed two fraction digits, the Alarms list one, the table three and the CSV export all
 * seventeen, so the same reading looked like four different numbers depending on where you saw it.
 */
export const MEASUREMENT_FRACTION_DIGITS = 2;

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();
const relativeTimeFormats = new Map<string, Intl.RelativeTimeFormat>();

function cached<T>(store: Map<string, T>, key: string, create: () => T): T {
  const existing = store.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const created = create();
  store.set(key, created);
  return created;
}

/** A measured value, on any screen. */
export function measurementFormat(lang: string): Intl.NumberFormat {
  return cached(
    numberFormats,
    `measurement:${lang}`,
    () => new Intl.NumberFormat(lang, { maximumFractionDigits: MEASUREMENT_FRACTION_DIGITS }),
  );
}

export function countFormat(lang: string): Intl.NumberFormat {
  return cached(numberFormats, `count:${lang}`, () => new Intl.NumberFormat(lang));
}

export function decimalFormat(lang: string, fractionDigits: number): Intl.NumberFormat {
  return cached(
    numberFormats,
    `decimal:${lang}:${fractionDigits}`,
    () =>
      new Intl.NumberFormat(lang, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }),
  );
}

export function durationFormat(lang: string, unit: 'minute' | 'hour'): Intl.NumberFormat {
  return cached(
    numberFormats,
    `duration:${lang}:${unit}`,
    () =>
      new Intl.NumberFormat(lang, {
        style: 'unit',
        unit,
        unitDisplay: 'short',
        maximumFractionDigits: 1,
      }),
  );
}

/** Tight grids — the Dashboard alarm panel and the chart tooltip. */
export function compactTimestampFormat(lang: string): Intl.DateTimeFormat {
  return cached(
    dateTimeFormats,
    `compact:${lang}`,
    () => new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short' }),
  );
}

/** Table rows, where seconds are what tells two consecutive samples apart. */
export function rowTimestampFormat(lang: string): Intl.DateTimeFormat {
  return cached(
    dateTimeFormats,
    `row:${lang}`,
    () => new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'medium' }),
  );
}

/** The one place whose whole purpose is to state the exact moment an alarm fired. */
export function exactTimestampFormat(lang: string): Intl.DateTimeFormat {
  return cached(
    dateTimeFormats,
    `exact:${lang}`,
    () => new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'medium' }),
  );
}

export function dayFormat(lang: string, withYear: boolean): Intl.DateTimeFormat {
  return cached(
    dateTimeFormats,
    `day:${lang}:${withYear}`,
    () =>
      new Intl.DateTimeFormat(lang, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: withYear ? 'numeric' : undefined,
      }),
  );
}

export function relativeTimeFormat(
  lang: string,
  numeric: 'always' | 'auto',
): Intl.RelativeTimeFormat {
  return cached(
    relativeTimeFormats,
    `relative:${lang}:${numeric}`,
    () => new Intl.RelativeTimeFormat(lang, { numeric }),
  );
}

/**
 * The simulated signals clamp at zero, and both the clamp and the bucket average preserve the sign,
 * so `-0` genuinely reaches the screen — where `Intl` renders it as "-0 l/min". No reading is
 * negative zero.
 */
export function normaliseZero(value: number): number {
  return value === 0 ? 0 : value;
}

export function formatMeasurement(value: number, lang: string): string {
  return measurementFormat(lang).format(normaliseZero(value));
}

export function formatCount(value: number, lang: string): string {
  return countFormat(lang).format(value);
}

/** Rounded the same way the screen rounds it, so an exported cell matches the row it came from. */
export function roundMeasurement(value: number): number {
  const factor = 10 ** MEASUREMENT_FRACTION_DIGITS;
  return normaliseZero(Math.round(value * factor) / factor);
}

export function capitaliseFirst(text: string, lang: string): string {
  return text.charAt(0).toLocaleUpperCase(lang) + text.slice(1);
}

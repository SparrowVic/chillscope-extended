/**
 * The time vocabulary every screen shares: the range shape, the preset windows the filter bars
 * offer, and the day boundaries the date pickers snap to. Kept in one place because the Dashboard
 * and the Alarms screen used to spell the same five presets and the same day arithmetic differently.
 */
export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** Half-open `[from, to)`, which is how the measurement API reads a window. */
export interface TimeRange {
  readonly from: number;
  readonly to: number;
}

export type RangePresetId = 'lastHour' | 'last6Hours' | 'last24Hours' | 'last7Days' | 'last30Days';

export const RANGE_PRESET_SPANS: Readonly<Record<RangePresetId, number>> = {
  lastHour: HOUR_MS,
  last6Hours: 6 * HOUR_MS,
  last24Hours: 24 * HOUR_MS,
  last7Days: 7 * DAY_MS,
  last30Days: 30 * DAY_MS,
};

export const RANGE_PRESET_IDS: readonly RangePresetId[] = Object.keys(
  RANGE_PRESET_SPANS,
) as RangePresetId[];

export function rangePresetLabelKey(id: RangePresetId): string {
  return `range.preset.${id}`;
}

/** Compact face for tight rows (segmented captions, filter summaries): "24h" over the full name. */
export function rangePresetShortLabelKey(id: RangePresetId): string {
  return `range.presetShort.${id}`;
}

/**
 * A preset is recognised by its width. Passing `now` additionally demands that the window still
 * ends at the wall clock, which is what separates "last 7 days" from a custom week in the past.
 */
export function matchRangePreset(
  range: TimeRange,
  toleranceMs: number,
  now?: number,
): RangePresetId | undefined {
  if (now !== undefined && Math.abs(now - range.to) > toleranceMs) {
    return undefined;
  }
  const span = range.to - range.from;
  return RANGE_PRESET_IDS.find((id) => Math.abs(RANGE_PRESET_SPANS[id] - span) <= toleranceMs);
}

export function startOfDay(timestamp: number): number {
  const day = new Date(timestamp);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/** The exclusive end of the day that contains `timestamp`, matching the half-open convention. */
export function endOfDayExclusive(timestamp: number): number {
  const day = new Date(timestamp);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() + 1);
  return day.getTime();
}

/** Snapping a picker value to midnight must never widen it past the backend's hard budget. */
export function clampRangeStart(from: number, to: number, maxSpanMs: number): number {
  return Math.max(from, to - maxSpanMs);
}

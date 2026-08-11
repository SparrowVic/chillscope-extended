export type SeriesId = 'temperature' | 'pressure' | 'flow' | 'rpm';

export type ChartTheme = 'light' | 'dark';

export interface ChartSeries {
  readonly id: SeriesId;
  readonly label: string;
  readonly unit: string;
  readonly color: string;
  readonly t: readonly number[];
  readonly v: readonly number[];
}

export interface SeriesThresholdBand {
  readonly warningMin: number;
  readonly warningMax: number;
  readonly criticalMin: number;
  readonly criticalMax: number;
}

export type ChartThresholds = Readonly<Record<string, SeriesThresholdBand>>;

export interface ChartLabels {
  readonly empty: string;
  readonly loading: string;
  /** Announced instead of the canvas, which carries no text a screen reader could reach. */
  readonly ariaLabel: string;
}

export interface RangeSelectedDetail {
  readonly from: number;
  readonly to: number;
}

/**
 * The daily-cycle heatmap's data, columnar like everything crossing the boundary: one row per
 * day, 24 hourly cells per row, row-major. `null` marks an hour with no sample (the current
 * day's future hours), which renders as a gap, not a zero.
 */
export interface HeatmapMatrix {
  /** Local-midnight timestamps of each row, oldest first. */
  readonly days: readonly number[];
  /** `days.length × 24` hourly means, row-major; `null` = no sample. */
  readonly values: readonly (number | null)[];
  /** Already translated — the chart never translates (see ChartSeries). */
  readonly label: string;
  readonly unit: string;
  /** Catalogue series hue; the magnitude ramp is stepped from it per theme. */
  readonly color: string;
}

export interface HeatmapLabels {
  readonly empty: string;
  readonly loading: string;
  /** Announced instead of the canvas, which carries no text a screen reader could reach. */
  readonly ariaLabel: string;
}

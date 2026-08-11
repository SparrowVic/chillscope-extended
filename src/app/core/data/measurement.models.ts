import type { AlarmSeverity, SeriesId, SeriesThresholds } from './series.catalog';

export type { AlarmSeverity, SeriesId, SeriesThresholds };

export type AlarmSeverityFilter = 'all' | AlarmSeverity;

export type SortDirection = 'asc' | 'desc';

export type MeasurementSortField = 'date' | 'name' | 'value';

/** Columnar rather than an array of objects: ECharts consumes it directly at tens of thousands of points. */
export interface SeriesPoints {
  readonly t: readonly number[];
  readonly v: readonly number[];
}

export interface SeriesDescriptor {
  readonly id: SeriesId;
  readonly unit: string;
  readonly color: string;
  readonly thresholds: SeriesThresholds;
}

export interface MeasurementSeries extends SeriesDescriptor {
  readonly points: SeriesPoints;
}

export interface MeasurementRow {
  readonly series: SeriesId;
  readonly value: number;
  readonly timestamp: number;
}

export interface Alarm {
  readonly id: string;
  readonly series: SeriesId;
  readonly severity: AlarmSeverity;
  readonly value: number;
  readonly threshold: number;
  readonly timestamp: number;
  readonly durationMs: number;
}

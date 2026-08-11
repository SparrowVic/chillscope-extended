import type { AlarmSeverity, SeriesId, SeriesThresholds } from './series.catalog';

/** Shape fixed by the task statement; it must not leak past the mapper. */
export interface MeasurementDto {
  readonly name: string;
  readonly value: number;
  readonly date: string;
}

export interface MeasurementsResponseDto {
  readonly measures: readonly MeasurementDto[];
  readonly total?: number;
  readonly page?: number;
  readonly size?: number;
}

export interface SeriesDescriptorDto {
  readonly id: SeriesId;
  readonly unit: string;
  readonly color: string;
  readonly thresholds: SeriesThresholds;
}

export interface AlarmDto {
  readonly id: string;
  readonly series: SeriesId;
  readonly severity: AlarmSeverity;
  readonly value: number;
  readonly threshold: number;
  readonly date: string;
  readonly durationMs: number;
}

export interface AlarmsResponseDto {
  readonly alarms: readonly AlarmDto[];
}

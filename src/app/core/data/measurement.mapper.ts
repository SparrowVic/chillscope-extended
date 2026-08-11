import type { ChartSeries, ChartThresholds } from '@chillscope/chart/types';
import type {
  AlarmsResponseDto,
  MeasurementsResponseDto,
  SeriesDescriptorDto,
} from './measurement.dto';
import type {
  Alarm,
  MeasurementRow,
  MeasurementSeries,
  SeriesDescriptor,
  SeriesId,
} from './measurement.models';
import { isSeriesId, isSeriesThresholds } from './series.catalog';

interface MutablePoints {
  t: number[];
  v: number[];
}

export function fromMeasurementsDto(
  dto: MeasurementsResponseDto,
  descriptors: readonly SeriesDescriptor[],
): MeasurementSeries[] {
  const byId = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor]));
  const points = new Map<SeriesId, MutablePoints>();

  for (const measure of dto.measures) {
    const timestamp = Date.parse(measure.date);
    if (
      !isSeriesId(measure.name) ||
      !byId.has(measure.name) ||
      !Number.isFinite(measure.value) ||
      !Number.isFinite(timestamp)
    ) {
      continue;
    }
    let bucket = points.get(measure.name);
    if (bucket === undefined) {
      bucket = { t: [], v: [] };
      points.set(measure.name, bucket);
    }
    bucket.t.push(timestamp);
    bucket.v.push(measure.value);
  }

  return [...points].flatMap(([id, bucket]) => {
    const descriptor = byId.get(id);
    return descriptor ? [{ ...descriptor, points: bucket }] : [];
  });
}

export function toMeasurementRows(dto: MeasurementsResponseDto): MeasurementRow[] {
  const rows: MeasurementRow[] = [];
  for (const measure of dto.measures) {
    const timestamp = Date.parse(measure.date);
    if (isSeriesId(measure.name) && Number.isFinite(measure.value) && Number.isFinite(timestamp)) {
      rows.push({
        series: measure.name,
        value: measure.value,
        timestamp,
      });
    }
  }
  return rows;
}

/** A backend is free to serve a series this build knows nothing about; the screens are not. */
export function fromSeriesDescriptorsDto(dto: readonly SeriesDescriptorDto[]): SeriesDescriptor[] {
  return dto
    .filter(
      (descriptor) =>
        isSeriesId(descriptor.id) &&
        typeof descriptor.unit === 'string' &&
        descriptor.unit.length > 0 &&
        typeof descriptor.color === 'string' &&
        descriptor.color.length > 0 &&
        isSeriesThresholds(descriptor.thresholds),
    )
    .map((descriptor) => ({
      id: descriptor.id,
      unit: descriptor.unit,
      color: descriptor.color,
      thresholds: descriptor.thresholds,
    }));
}

export function toChartSeries(
  series: readonly MeasurementSeries[],
  labels: Readonly<Record<SeriesId, string>>,
  units: Readonly<Record<SeriesId, string>>,
): ChartSeries[] {
  return series.map((entry) => ({
    id: entry.id,
    label: labels[entry.id],
    unit: units[entry.id],
    color: entry.color,
    t: entry.points.t,
    v: entry.points.v,
  }));
}

export function toChartThresholds(series: readonly MeasurementSeries[]): ChartThresholds {
  return Object.fromEntries(series.map((entry) => [entry.id, entry.thresholds]));
}

/** The day×hour half of a `HeatmapMatrix`; label, unit and colour are presentation and join later. */
export interface CycleFold {
  readonly days: readonly number[];
  readonly values: readonly (number | null)[];
}

/**
 * Folds hourly samples into local-time day rows for the cycle heatmap: one row per calendar day
 * between the first and the last sample, 24 cells each, row-major. Hours nothing landed in stay
 * `null` — the current day's future hours must render as gaps, never as zeros. Multiple samples
 * in one hour average, so the fold does not depend on the backend's exact bucket alignment.
 */
export function toCycleFold(points: { t: readonly number[]; v: readonly number[] }): CycleFold {
  if (points.t.length === 0) {
    return { days: [], values: [] };
  }
  const dayOf = (timestamp: number): number => new Date(timestamp).setHours(0, 0, 0, 0);
  const firstDay = dayOf(points.t[0]);
  const lastDay = dayOf(points.t[points.t.length - 1]);

  const days: number[] = [];
  // Calendar stepping, not +24h: a DST boundary makes one day 23 or 25 hours long.
  for (let day = firstDay; day <= lastDay; ) {
    days.push(day);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    day = next.getTime();
  }

  const rowByDay = new Map(days.map((day, index) => [day, index]));
  const sums = new Array<number>(days.length * 24).fill(0);
  const counts = new Array<number>(days.length * 24).fill(0);
  for (let index = 0; index < points.t.length; index += 1) {
    const timestamp = points.t[index];
    const row = rowByDay.get(dayOf(timestamp));
    if (row === undefined) {
      continue;
    }
    const cell = row * 24 + new Date(timestamp).getHours();
    sums[cell] += points.v[index];
    counts[cell] += 1;
  }

  return {
    days,
    values: sums.map((sum, cell) => (counts[cell] === 0 ? null : sum / counts[cell])),
  };
}

export function fromAlarmsDto(dto: AlarmsResponseDto): Alarm[] {
  return dto.alarms.flatMap((alarm) => {
    const timestamp = Date.parse(alarm.date);
    if (
      typeof alarm.id !== 'string' ||
      alarm.id.length === 0 ||
      !isSeriesId(alarm.series) ||
      (alarm.severity !== 'warning' && alarm.severity !== 'critical') ||
      !Number.isFinite(alarm.value) ||
      !Number.isFinite(alarm.threshold) ||
      !Number.isFinite(timestamp) ||
      !Number.isFinite(alarm.durationMs) ||
      alarm.durationMs < 0
    ) {
      return [];
    }
    return [
      {
        id: alarm.id,
        series: alarm.series,
        severity: alarm.severity,
        value: alarm.value,
        threshold: alarm.threshold,
        timestamp,
        durationMs: alarm.durationMs,
      },
    ];
  });
}

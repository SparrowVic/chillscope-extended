import { classify } from '../../core/data/series.catalog';
import type {
  MeasurementRow,
  SeriesDescriptor,
  SeriesId,
} from '../../core/data/measurement.models';
import type { CsIconName } from '../../shared/icons/icon-roster';
import { formatMeasurement, normaliseZero, rowTimestampFormat } from '../../shared/intl';
import {
  SERIES_ICON_NAMES,
  SERIES_LABEL_KEYS,
  SERIES_UNIT_KEYS,
} from '../../shared/series-display';
import type { MeasurementStatus } from '../../shared/severity';

export interface MeasurementTableRow {
  readonly id: string;
  readonly series: SeriesId;
  readonly value: number;
  readonly timestamp: number;
  readonly status: MeasurementStatus;
}

export function toTableRows(
  rows: readonly MeasurementRow[],
  descriptors: readonly SeriesDescriptor[],
): MeasurementTableRow[] {
  const byId = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor]));

  return rows.map((row) => {
    const descriptor = byId.get(row.series);
    return {
      id: `${row.series}-${row.timestamp}`,
      series: row.series,
      // Normalised here rather than inside each formatter, so the table and the export agree.
      value: normaliseZero(row.value),
      timestamp: row.timestamp,
      // The alarm detector's own comparison, so a badge here cannot contradict the Alarms screen.
      status: descriptor ? classify(row.value, descriptor.thresholds) : 'ok',
    };
  });
}

/** A journal row ready to print — keys still translate in the template, text is pre-formatted. */
export interface MeasurementDisplayRow {
  readonly id: string;
  readonly icon: CsIconName;
  readonly seriesKey: string;
  readonly dateText: string;
  readonly valueText: string;
  readonly unitKey: string;
  readonly statusKey: string;
  readonly status: MeasurementStatus;
}

/** One formatting pass shared by both journal faces — the desktop table and the phone list. */
export function toDisplayRows(
  rows: readonly MeasurementTableRow[],
  language: string,
): MeasurementDisplayRow[] {
  const date = rowTimestampFormat(language);

  return rows.map((row) => ({
    id: row.id,
    icon: SERIES_ICON_NAMES[row.series],
    seriesKey: SERIES_LABEL_KEYS[row.series],
    dateText: date.format(row.timestamp),
    valueText: formatMeasurement(row.value, language),
    unitKey: SERIES_UNIT_KEYS[row.series],
    statusKey: `severity.${row.status}`,
    status: row.status,
  }));
}

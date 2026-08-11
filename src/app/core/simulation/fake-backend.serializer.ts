import type {
  AlarmsResponseDto,
  MeasurementDto,
  MeasurementsResponseDto,
  SeriesDescriptorDto,
} from '../data/measurement.dto';
import { SERIES_CATALOG, SERIES_IDS } from '../data/series.catalog';
import type { AlarmRecord, GeneratedSeries } from './generator';

/**
 * The server side of the wire contract: it turns what the simulator produces into the payloads the
 * task statement fixes. It lives with the fake backend because a real backend would do this work,
 * and dropping the interceptor has to drop this with it.
 */
export function toMeasurementsDto(series: readonly GeneratedSeries[]): MeasurementsResponseDto {
  const measures: MeasurementDto[] = [];
  for (const entry of series) {
    for (let i = 0; i < entry.t.length; i++) {
      measures.push({
        name: entry.id,
        value: entry.v[i],
        date: new Date(entry.t[i]).toISOString(),
      });
    }
  }
  measures.sort((a, b) => a.date.localeCompare(b.date));
  return { measures };
}

export function toAlarmsDto(records: readonly AlarmRecord[]): AlarmsResponseDto {
  return {
    alarms: records.map((record) => ({
      id: record.id,
      series: record.series,
      severity: record.severity,
      value: record.value,
      threshold: record.threshold,
      date: new Date(record.timestamp).toISOString(),
      durationMs: record.durationMs,
    })),
  };
}

/** The catalogue the backend owns: its own defaults. What the user overrides is the client's business. */
export function toSeriesCatalogueDto(): SeriesDescriptorDto[] {
  return SERIES_IDS.map((id) => ({ ...SERIES_CATALOG[id] }));
}

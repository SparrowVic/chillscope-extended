import { type HttpResourceRef, type HttpResourceRequest, httpResource } from '@angular/common/http';
import { Injectable, type Signal } from '@angular/core';
import type {
  AlarmsResponseDto,
  MeasurementsResponseDto,
  SeriesDescriptorDto,
} from './measurement.dto';
import type {
  AlarmSeverityFilter,
  MeasurementSortField,
  SeriesId,
  SeriesThresholds,
  SortDirection,
} from './measurement.models';
import type { BucketId } from './series.catalog';

export interface MeasurementsQuery {
  readonly series: readonly SeriesId[];
  readonly from: number;
  readonly to: number;
  readonly bucket?: BucketId;
}

export interface PagedMeasurementsQuery extends MeasurementsQuery {
  readonly page: number;
  readonly size: number;
  readonly sort: MeasurementSortField;
  readonly direction: SortDirection;
}

export interface AlarmsQuery {
  readonly series: readonly SeriesId[];
  readonly from: number;
  readonly to: number;
  readonly severity: AlarmSeverityFilter;
  /** Detection runs on the server, so the bands the user edited travel with the request. */
  readonly thresholds: Readonly<Partial<Record<SeriesId, SeriesThresholds>>>;
}

const SERIES_URL = '/api/series';
const MEASUREMENTS_URL = '/api/measurements';
const ALARMS_URL = '/api/alarms';

const EMPTY_MEASUREMENTS: MeasurementsResponseDto = { measures: [] };
const EMPTY_ALARMS: AlarmsResponseDto = { alarms: [] };

function measurementParams(query: MeasurementsQuery): Record<string, string> {
  return {
    series: query.series.join(','),
    from: new Date(query.from).toISOString(),
    to: new Date(query.to).toISOString(),
    ...(query.bucket === undefined ? {} : { bucket: query.bucket }),
  };
}

/** The only place in the application that knows HTTP exists. */
@Injectable({ providedIn: 'root' })
export class MeasurementsRepository {
  readonly seriesCatalogue: HttpResourceRef<SeriesDescriptorDto[]> = httpResource<
    SeriesDescriptorDto[]
  >(() => SERIES_URL, { defaultValue: [] });

  measurementsFor(
    query: Signal<MeasurementsQuery | undefined>,
  ): HttpResourceRef<MeasurementsResponseDto> {
    return httpResource<MeasurementsResponseDto>(
      (): HttpResourceRequest | undefined => {
        const current = query();
        if (current === undefined || current.series.length === 0) {
          return undefined;
        }
        return { url: MEASUREMENTS_URL, params: measurementParams(current) };
      },
      { defaultValue: EMPTY_MEASUREMENTS },
    );
  }

  pagedMeasurementsFor(
    query: Signal<PagedMeasurementsQuery | undefined>,
  ): HttpResourceRef<MeasurementsResponseDto> {
    return httpResource<MeasurementsResponseDto>(
      (): HttpResourceRequest | undefined => {
        const current = query();
        if (current === undefined || current.series.length === 0) {
          return undefined;
        }
        return {
          url: MEASUREMENTS_URL,
          params: {
            ...measurementParams(current),
            page: current.page,
            size: current.size,
            sort: current.sort,
            dir: current.direction,
          },
        };
      },
      { defaultValue: EMPTY_MEASUREMENTS },
    );
  }

  alarmsFor(query: Signal<AlarmsQuery | undefined>): HttpResourceRef<AlarmsResponseDto> {
    return httpResource<AlarmsResponseDto>(
      (): HttpResourceRequest | undefined => {
        const current = query();
        if (current === undefined) {
          return undefined;
        }
        const overrides =
          Object.keys(current.thresholds).length === 0 ? undefined : current.thresholds;
        return {
          url: ALARMS_URL,
          params: {
            from: new Date(current.from).toISOString(),
            to: new Date(current.to).toISOString(),
            ...(current.series.length === 0 ? {} : { series: current.series.join(',') }),
            ...(current.severity === 'all' ? {} : { severity: current.severity }),
            ...(overrides === undefined ? {} : { thresholds: JSON.stringify(overrides) }),
          },
        };
      },
      { defaultValue: EMPTY_ALARMS },
    );
  }
}

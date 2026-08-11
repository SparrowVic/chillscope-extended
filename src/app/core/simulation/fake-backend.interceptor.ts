import {
  HttpErrorResponse,
  type HttpInterceptorFn,
  type HttpParams,
  HttpResponse,
} from '@angular/common/http';
import { DestroyRef, InjectionToken, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type { MeasurementDto, MeasurementsResponseDto } from '../data/measurement.dto';
import type { MeasurementSortField, SortDirection } from '../data/measurement.models';
import {
  MAX_RANGE_MS,
  SERIES_IDS,
  type AlarmSeverity,
  type BucketId,
  type SeriesId,
  type SeriesThresholds,
  isBucketId,
  isSeriesId,
  isSeriesThresholds,
} from '../data/series.catalog';
import { SettingsStore } from '../settings/settings.store';
import { toAlarmsDto, toMeasurementsDto, toSeriesCatalogueDto } from './fake-backend.serializer';
import { SIMULATION_CONFIG } from './simulation.config';
import { SimulationClient } from './worker-client';

export const SIMULATION_CLIENT = new InjectionToken<SimulationClient>('SIMULATION_CLIENT', {
  providedIn: 'root',
  factory: () => {
    const client = new SimulationClient();
    inject(DestroyRef).onDestroy(() => client.dispose());
    return client;
  },
});

const API_PREFIX = '/api/';
const ALL_SEVERITIES: readonly AlarmSeverity[] = ['warning', 'critical'];
const DAY_MS = 86_400_000;
const MAX_PAGE_SIZE = 200;

/** The native resolution is one minute, so a one-minute aggregation is the same thing as raw. */
const BUCKET_ALIASES: Readonly<Record<string, BucketId>> = { '1m': 'raw' };

const COMPARATORS: Readonly<
  Record<MeasurementSortField, (a: MeasurementDto, b: MeasurementDto) => number>
> = {
  date: (a, b) => a.date.localeCompare(b.date),
  name: (a, b) => a.name.localeCompare(b.name),
  value: (a, b) => a.value - b.value,
};

class BadRequestError extends Error {}

function isSortField(value: string): value is MeasurementSortField {
  return value === 'date' || value === 'name' || value === 'value';
}

function isSeverity(value: string): value is AlarmSeverity {
  return value === 'warning' || value === 'critical';
}

function parseSeries(raw: string | null): SeriesId[] {
  const ids: SeriesId[] = [];
  const seen = new Set<SeriesId>();
  for (const value of (raw ?? '').split(',').filter(Boolean)) {
    if (!isSeriesId(value)) {
      throw new BadRequestError(`unknown series: ${value}`);
    }
    if (seen.has(value)) {
      throw new BadRequestError(`duplicate series: ${value}`);
    }
    seen.add(value);
    ids.push(value);
  }
  if (ids.length === 0) {
    throw new BadRequestError('series is required');
  }
  return ids;
}

function parseRange(from: string | null, to: string | null): { from: number; to: number } {
  const start = Date.parse(from ?? '');
  const end = Date.parse(to ?? '');
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new BadRequestError('from and to are required ISO timestamps');
  }
  if (end <= start) {
    throw new BadRequestError('to must be later than from');
  }
  // Without an upper bound, one date-picker click can ask for decades: minutes of CPU and hundreds
  // of megabytes of arrays before anything is drawn.
  if (end - start > MAX_RANGE_MS) {
    throw new BadRequestError(`range must not exceed ${MAX_RANGE_MS / DAY_MS} days`);
  }
  return { from: start, to: end };
}

function parseBucket(raw: string | null): BucketId | undefined {
  if (raw === null) {
    return undefined;
  }
  const alias = BUCKET_ALIASES[raw];
  if (alias !== undefined) {
    return alias;
  }
  if (!isBucketId(raw)) {
    throw new BadRequestError(`unknown bucket: ${raw}`);
  }
  return raw;
}

function parseSeverities(raw: string | null): readonly AlarmSeverity[] {
  if (raw === null) {
    return ALL_SEVERITIES;
  }
  const severities: AlarmSeverity[] = [];
  const seen = new Set<AlarmSeverity>();
  for (const value of raw.split(',').filter(Boolean)) {
    if (!isSeverity(value)) {
      throw new BadRequestError(`unknown severity: ${value}`);
    }
    if (seen.has(value)) {
      throw new BadRequestError(`duplicate severity: ${value}`);
    }
    seen.add(value);
    severities.push(value);
  }
  return severities.length === 0 ? ALL_SEVERITIES : severities;
}

/** Detection bands are an input to the request, not a setting the backend reads over the client's shoulder. */
function parseThresholds(raw: string | null): Partial<Record<SeriesId, SeriesThresholds>> {
  if (raw === null) {
    return {};
  }
  const parsed = parseJson(raw);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new BadRequestError('thresholds must be a JSON object');
  }
  const overrides: Partial<Record<SeriesId, SeriesThresholds>> = {};
  for (const [id, value] of Object.entries(parsed)) {
    if (!isSeriesId(id)) {
      throw new BadRequestError(`unknown series: ${id}`);
    }
    if (!isSeriesThresholds(value)) {
      throw new BadRequestError(`invalid thresholds for series: ${id}`);
    }
    overrides[id] = value;
  }
  return overrides;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new BadRequestError('thresholds must be valid JSON');
  }
}

function parseSortField(raw: string | null): MeasurementSortField {
  if (raw === null) {
    return 'date';
  }
  if (!isSortField(raw)) {
    throw new BadRequestError(`unknown sort field: ${raw}`);
  }
  return raw;
}

function parseDirection(raw: string | null): SortDirection {
  if (raw === null) {
    return 'asc';
  }
  if (raw !== 'asc' && raw !== 'desc') {
    throw new BadRequestError(`unknown sort direction: ${raw}`);
  }
  return raw;
}

function parseCount(raw: string, name: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new BadRequestError(`${name} must be a non-negative integer`);
  }
  return value;
}

/** Sorting and slicing happen here so that the table pages like it would against a real backend. */
function toPage(dto: MeasurementsResponseDto, params: HttpParams): MeasurementsResponseDto {
  const sort = parseSortField(params.get('sort'));
  const direction = parseDirection(params.get('dir'));
  // The serializer already emits chronological data. Keep its array for the dominant unpaged and
  // date-ascending paths; date-descending only needs a linear reverse, not another O(n log n) sort.
  const measures =
    sort === 'date'
      ? direction === 'asc'
        ? dto.measures
        : [...dto.measures].reverse()
      : [...dto.measures].sort((a, b) => {
          const comparison = COMPARATORS[sort](a, b);
          return direction === 'asc' ? comparison : -comparison;
        });

  const page = params.get('page');
  const size = params.get('size');
  if ((page === null) !== (size === null)) {
    throw new BadRequestError('page and size must be supplied together');
  }
  if (page === null || size === null) {
    return { measures };
  }

  const pageNumber = parseCount(page, 'page');
  const pageSize = parseCount(size, 'size');
  if (pageSize === 0 || pageSize > MAX_PAGE_SIZE) {
    throw new BadRequestError(`size must be between 1 and ${MAX_PAGE_SIZE}`);
  }
  const offset = pageNumber * pageSize;
  return {
    measures: measures.slice(offset, offset + pageSize),
    total: measures.length,
    page: pageNumber,
    size: pageSize,
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const handle = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    const abort = (): void => {
      clearTimeout(handle);
      reject(new Error('The request was aborted'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

/**
 * The application never learns that the backend is simulated: swapping in a real one means dropping
 * this interceptor and pointing the repository at a base URL.
 */
export const fakeBackendInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_PREFIX)) {
    return next(req);
  }

  const client = inject(SIMULATION_CLIENT);
  const failureRate = inject(SettingsStore).failureRate();
  const latencyMs =
    SIMULATION_CONFIG.minLatencyMs +
    Math.random() * (SIMULATION_CONFIG.maxLatencyMs - SIMULATION_CONFIG.minLatencyMs);

  const respond = async (signal: AbortSignal): Promise<HttpResponse<unknown>> => {
    // Awaited up front rather than piped through `delay`, which does not hold back error
    // notifications: a simulated failure would otherwise arrive with no perceptible latency at all.
    await sleep(latencyMs, signal);

    if (Math.random() < failureRate) {
      throw new HttpErrorResponse({ status: 500, statusText: 'Simulated failure', url: req.url });
    }

    if (req.method !== 'GET') {
      throw new HttpErrorResponse({
        status: 405,
        statusText: 'Method Not Allowed',
        url: req.url,
      });
    }

    const path = req.url.split('?')[0];
    const params = req.params;

    if (path === '/api/series') {
      return new HttpResponse({ status: 200, body: toSeriesCatalogueDto(), url: req.url });
    }

    if (path === '/api/measurements') {
      const generated = await client.series(
        {
          ...parseRange(params.get('from'), params.get('to')),
          series: parseSeries(params.get('series')),
          bucket: parseBucket(params.get('bucket')),
        },
        signal,
      );
      return new HttpResponse({
        status: 200,
        body: toPage(toMeasurementsDto(generated), params),
        url: req.url,
      });
    }

    if (path === '/api/alarms') {
      const severities = parseSeverities(params.get('severity'));
      const records = await client.alarms(
        {
          ...parseRange(params.get('from'), params.get('to')),
          series: params.get('series') === null ? SERIES_IDS : parseSeries(params.get('series')),
          thresholds: parseThresholds(params.get('thresholds')),
        },
        signal,
      );
      return new HttpResponse({
        status: 200,
        body: toAlarmsDto(records.filter((record) => severities.includes(record.severity))),
        url: req.url,
      });
    }

    throw new HttpErrorResponse({ status: 404, statusText: 'Not Found', url: req.url });
  };

  return new Observable<HttpResponse<unknown>>((subscriber) => {
    const controller = new AbortController();
    void respond(controller.signal).then(
      (response) => {
        if (!subscriber.closed) {
          subscriber.next(response);
          subscriber.complete();
        }
      },
      (error: unknown) => {
        if (controller.signal.aborted || subscriber.closed) {
          return;
        }
        if (error instanceof HttpErrorResponse) {
          subscriber.error(error);
          return;
        }
        if (error instanceof BadRequestError) {
          subscriber.error(
            new HttpErrorResponse({ status: 400, statusText: error.message, url: req.url }),
          );
          return;
        }
        // A worker that dies mid-call would otherwise surface a bare Error, which no real HTTP
        // backend can produce and nothing above this layer is prepared for.
        subscriber.error(
          new HttpErrorResponse({
            status: 500,
            statusText: error instanceof Error ? error.message : 'Simulation failed',
            url: req.url,
          }),
        );
      },
    );
    return () => controller.abort();
  });
};

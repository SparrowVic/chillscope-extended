import type { MeasurementStatus } from '../../shared/severity';

/**
 * The vocabulary of the measurement API: which series exist, how wide a bucket is, and when a value
 * counts as a breach. Both sides of the boundary read it — the domain layer and the simulated
 * backend — so it depends on neither. `core/simulation` imports from here; nothing here may import
 * from `core/simulation`.
 */
export type SeriesId = 'temperature' | 'pressure' | 'flow' | 'rpm';

export type AlarmSeverity = Exclude<MeasurementStatus, 'ok'>;

export interface SeriesThresholds {
  readonly warningMin: number;
  readonly warningMax: number;
  readonly criticalMin: number;
  readonly criticalMax: number;
}

const SERIES_THRESHOLD_KEYS = ['warningMin', 'warningMax', 'criticalMin', 'criticalMax'] as const;

export interface SeriesCatalogEntry {
  readonly id: SeriesId;
  readonly unit: string;
  readonly color: string;
  readonly thresholds: SeriesThresholds;
}

/**
 * Default presentation and alarm bands per series. The bands are calibrated against the measured
 * spread of the simulated signals: see `series-models.ts` for the anomalies that make the upper
 * bands reachable, and `series-models.spec.ts` for the test that keeps every band alive.
 */
export const SERIES_CATALOG: Readonly<Record<SeriesId, SeriesCatalogEntry>> = {
  temperature: {
    id: 'temperature',
    unit: '°C',
    color: '#d75b3b',
    thresholds: { warningMin: 49, warningMax: 74, criticalMin: 47, criticalMax: 84 },
  },
  pressure: {
    id: 'pressure',
    unit: 'bar',
    color: '#647fdf',
    thresholds: { warningMin: 3.0, warningMax: 5.0, criticalMin: 2.6, criticalMax: 5.6 },
  },
  flow: {
    id: 'flow',
    unit: 'l/min',
    color: '#168f82',
    thresholds: { warningMin: 26, warningMax: 108, criticalMin: 18, criticalMax: 118 },
  },
  rpm: {
    id: 'rpm',
    unit: 'rpm',
    color: '#986bc5',
    thresholds: { warningMin: 900, warningMax: 3050, criticalMin: 600, criticalMax: 3250 },
  },
};

export const SERIES_IDS: readonly SeriesId[] = Object.keys(SERIES_CATALOG) as SeriesId[];

export function isSeriesId(value: string): value is SeriesId {
  return SERIES_IDS.includes(value as SeriesId);
}

/** Runtime guard shared by persisted settings, machine imports and the fake HTTP boundary. */
export function isSeriesThresholds(value: unknown): value is SeriesThresholds {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const raw = value as Record<string, unknown>;
  const warningMin = raw['warningMin'];
  const warningMax = raw['warningMax'];
  const criticalMin = raw['criticalMin'];
  const criticalMax = raw['criticalMax'];
  const keys = Object.keys(raw);
  return (
    keys.length === SERIES_THRESHOLD_KEYS.length &&
    keys.every((key) => (SERIES_THRESHOLD_KEYS as readonly string[]).includes(key)) &&
    isFiniteNumber(warningMin) &&
    isFiniteNumber(warningMax) &&
    isFiniteNumber(criticalMin) &&
    isFiniteNumber(criticalMax) &&
    criticalMin < warningMin &&
    warningMin < warningMax &&
    warningMax < criticalMax &&
    Number.isFinite(criticalMax - criticalMin)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export type BucketId = 'raw' | '5m' | '15m' | '1h' | '6h' | '1d';

const MINUTE = 60_000;

/** `raw` is the native resolution of the backend: one sample per minute. */
export const BUCKET_MS: Readonly<Record<BucketId, number>> = {
  raw: MINUTE,
  '5m': 5 * MINUTE,
  '15m': 15 * MINUTE,
  '1h': 60 * MINUTE,
  '6h': 360 * MINUTE,
  '1d': 1440 * MINUTE,
};

export const BUCKET_IDS: readonly BucketId[] = Object.keys(BUCKET_MS) as BucketId[];

/** Widest last, so the first bucket that fits the point budget is also the most detailed one. */
const WIDENING_ORDER: readonly BucketId[] = ['raw', '5m', '15m', '1h', '6h', '1d'];

export function isBucketId(value: string): value is BucketId {
  return BUCKET_IDS.includes(value as BucketId);
}

/** More points than this neither fit on screen nor survive the trip through the chart. */
export const MAX_POINTS = 2000;

/**
 * The widest range the API serves. Chosen so that the widest bucket still fits the point budget,
 * which is what lets `resolveBucket` promise a bounded result for every accepted range.
 */
export const MAX_RANGE_MS = MAX_POINTS * BUCKET_MS['1d'];

/** Narrowest bucket whose point count stays inside the budget for the given range. */
export function resolveBucket(from: number, to: number, maxPoints: number): BucketId {
  const span = Math.max(0, to - from);
  for (const bucket of WIDENING_ORDER) {
    if (span / BUCKET_MS[bucket] <= maxPoints) {
      return bucket;
    }
  }
  return WIDENING_ORDER[WIDENING_ORDER.length - 1];
}

/** A client may ask for a coarser bucket than needed, never for a finer one than the budget allows. */
export function widenToBudget(
  bucket: BucketId,
  from: number,
  to: number,
  maxPoints: number,
): BucketId {
  const minimum = resolveBucket(from, to, maxPoints);
  return BUCKET_MS[bucket] >= BUCKET_MS[minimum] ? bucket : minimum;
}

/**
 * Fixed so that every environment and every reload shows the same history. Lives in the data
 * layer because it is part of the public vocabulary (Settings displays it); the simulator
 * imports it from here, never the other way round.
 */
export const SIMULATION_SEED = 1337;

/**
 * The single definition of "is this value a breach". The alarm detector in the backend and the
 * badges in the table run the same comparison, so the two can never disagree about a reading.
 */
export function classify(value: number, thresholds: SeriesThresholds): MeasurementStatus {
  if (value > thresholds.criticalMax || value < thresholds.criticalMin) {
    return 'critical';
  }
  if (value > thresholds.warningMax || value < thresholds.warningMin) {
    return 'warning';
  }
  return 'ok';
}

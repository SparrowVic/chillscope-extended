import {
  BUCKET_MS,
  MAX_POINTS,
  SERIES_CATALOG,
  type AlarmSeverity,
  type BucketId,
  type SeriesId,
  type SeriesThresholds,
  classify,
  widenToBudget,
} from '../data/series.catalog';
import { aggregate, type SampleColumns } from './aggregation';
import { SERIES_MODELS } from './series-models';

export interface GenerateRequest {
  readonly from: number;
  readonly to: number;
  readonly series: readonly SeriesId[];
  readonly bucket?: BucketId;
}

export interface AlarmsRequest {
  readonly from: number;
  readonly to: number;
  readonly series: readonly SeriesId[];
  /** Lets the Settings screen drive detection instead of the bands built into the catalogue. */
  readonly thresholds?: Readonly<Partial<Record<SeriesId, SeriesThresholds>>>;
}

export interface GeneratedSeries {
  readonly id: SeriesId;
  readonly t: number[];
  readonly v: number[];
}

export interface AlarmRecord {
  readonly id: string;
  readonly series: SeriesId;
  readonly severity: AlarmSeverity;
  readonly value: number;
  readonly threshold: number;
  readonly timestamp: number;
  readonly durationMs: number;
}

const MAX_SAMPLES_PER_BUCKET = 60;

/**
 * Detection cost stays bounded whatever range is asked for. A fifty-thousand-point grid discovers
 * incidents, then a separate native-resolution budget recovers stable boundaries. The refinement
 * budget covers every minute in a 500-day regression without allowing an unbounded history walk.
 */
const MAX_ALARM_SAMPLES = 50_000;
const MAX_ALARM_REFINEMENT_SAMPLES = 750_000;

/** Cheap first pass before the exact boundary lookup handles an incident crossing the left edge. */
const ALARM_LEAD_IN_MS = 6 * 3_600_000;

/**
 * An edge incident is backtracked at native resolution, independently of the request's scan step.
 * A separate fixed budget prevents pathological custom thresholds from turning one request into
 * an unbounded walk through history.
 */
const MAX_EPISODE_BACKTRACK_SAMPLES = MAX_ALARM_SAMPLES;

const SEVERITY_RANK: Readonly<Record<AlarmSeverity, number>> = { warning: 1, critical: 2 };

interface Breach {
  readonly severity: AlarmSeverity;
  readonly threshold: number;
}

interface Episode {
  severity: AlarmSeverity;
  threshold: number;
  start: number;
  end: number;
  value: number;
  excess: number;
}

/**
 * A wide bucket does not need one-minute resolution to produce a faithful average, and sampling a
 * year at full resolution would mean millions of model evaluations per request.
 */
function rawStepFor(bucketMs: number): number {
  const minutes = Math.max(1, Math.floor(bucketMs / (MAX_SAMPLES_PER_BUCKET * BUCKET_MS.raw)));
  return minutes * BUCKET_MS.raw;
}

function alarmStepFor(spanMs: number): number {
  const minutes = Math.max(1, Math.ceil(spanMs / (MAX_ALARM_SAMPLES * BUCKET_MS.raw)));
  return minutes * BUCKET_MS.raw;
}

function sampleRange(
  id: SeriesId,
  from: number,
  to: number,
  seed: number,
  stepMs: number,
): SampleColumns {
  const { sampleAt } = SERIES_MODELS[id];
  const t: number[] = [];
  const v: number[] = [];
  for (let timestamp = Math.ceil(from / stepMs) * stepMs; timestamp < to; timestamp += stepMs) {
    t.push(timestamp);
    v.push(sampleAt(timestamp, seed));
  }
  return { t, v };
}

function detectBreach(value: number, thresholds: SeriesThresholds): Breach | undefined {
  const severity = classify(value, thresholds);
  if (severity === 'ok') {
    return undefined;
  }
  const max = severity === 'critical' ? thresholds.criticalMax : thresholds.warningMax;
  const min = severity === 'critical' ? thresholds.criticalMin : thresholds.warningMin;
  return { severity, threshold: value > max ? max : min };
}

function isMoreRepresentative(breach: Breach, excess: number, episode: Episode): boolean {
  const rank = SEVERITY_RANK[breach.severity] - SEVERITY_RANK[episode.severity];
  return rank > 0 || (rank === 0 && excess > episode.excess);
}

function toRecord(series: SeriesId, episode: Episode): AlarmRecord {
  return {
    id: `${series}-${episode.start}`,
    series,
    severity: episode.severity,
    value: episode.value,
    threshold: episode.threshold,
    timestamp: episode.start,
    durationMs: episode.end - episode.start + BUCKET_MS.raw,
  };
}

function continuousEpisodeId(
  series: SeriesId,
  value: number,
  threshold: number,
  thresholds: SeriesThresholds,
  seed: number,
): string {
  const side = value > threshold ? 'high' : 'low';
  const bands = [
    thresholds.criticalMin,
    thresholds.warningMin,
    thresholds.warningMax,
    thresholds.criticalMax,
  ].join(':');
  return `${series}-${side}-continuous-${seed}-${bands}`;
}

function updateRepresentative(episode: Episode, breach: Breach, value: number): void {
  const excess = Math.abs(value - breach.threshold);
  if (isMoreRepresentative(breach, excess, episode)) {
    episode.severity = breach.severity;
    episode.threshold = breach.threshold;
    episode.value = value;
    episode.excess = excess;
  }
}

interface ResolvedEpisode {
  readonly record: AlarmRecord;
  readonly coveredUntil: number;
}

interface RefinementBudget {
  remaining: number;
}

function unresolvedEpisode(
  series: SeriesId,
  witness: number,
  episode: Episode,
  thresholds: SeriesThresholds,
  seed: number,
  endBoundary: number | undefined,
  fallbackAnchor: number | undefined,
): AlarmRecord {
  const record = toRecord(series, episode);
  const id =
    endBoundary !== undefined
      ? `${series}-ending-${endBoundary}`
      : fallbackAnchor !== undefined
        ? `${series}-observed-${fallbackAnchor}`
        : continuousEpisodeId(series, record.value, record.threshold, thresholds, seed);
  return {
    ...record,
    id,
    timestamp: witness,
    durationMs: Math.max(BUCKET_MS.raw, record.timestamp + record.durationMs - witness),
  };
}

/**
 * One coarse witness is expanded at native resolution. Returning the first unexamined timestamp
 * lets discovery skip witnesses inside this episode without assuming that it lasts to the request
 * boundary when refinement runs out.
 */
function resolveEpisode(
  series: SeriesId,
  witness: number,
  witnessValue: number,
  thresholds: SeriesThresholds,
  seed: number,
  to: number,
  isLeadingWitness: boolean,
  refinementBudget: RefinementBudget,
  edgeBacktrackBudget: RefinementBudget,
): ResolvedEpisode {
  const { sampleAt } = SERIES_MODELS[series];
  const witnessBreach = detectBreach(witnessValue, thresholds);
  if (witnessBreach === undefined) {
    throw new Error('An alarm episode must start with a breaching sample.');
  }
  const episode: Episode = {
    ...witnessBreach,
    start: witness,
    end: witness,
    value: witnessValue,
    excess: Math.abs(witnessValue - witnessBreach.threshold),
  };

  let foundStart = false;
  const startBudget = isLeadingWitness ? edgeBacktrackBudget : refinementBudget;
  while (startBudget.remaining > 0) {
    startBudget.remaining -= 1;
    const previous = episode.start - BUCKET_MS.raw;
    const value = sampleAt(previous, seed);
    const breach = detectBreach(value, thresholds);
    if (breach === undefined) {
      foundStart = true;
      break;
    }
    episode.start = previous;
    updateRepresentative(episode, breach, value);
  }

  let cursor = witness + BUCKET_MS.raw;
  let endBoundary: number | undefined;
  while (refinementBudget.remaining > 0 && cursor < to) {
    refinementBudget.remaining -= 1;
    const value = sampleAt(cursor, seed);
    const breach = detectBreach(value, thresholds);
    if (breach === undefined) {
      endBoundary = cursor;
      break;
    }
    episode.end = cursor;
    updateRepresentative(episode, breach, value);
    cursor += BUCKET_MS.raw;
  }

  const reachedRangeEnd = cursor >= to;
  return {
    record: foundStart
      ? toRecord(series, episode)
      : unresolvedEpisode(
          series,
          witness,
          episode,
          thresholds,
          seed,
          endBoundary,
          endBoundary === undefined && !reachedRangeEnd ? witness : undefined,
        ),
    coveredUntil: endBoundary ?? (reachedRangeEnd ? to : cursor),
  };
}

/**
 * Coarse samples keep discovery bounded for very wide ranges. Resolved episodes share one fixed
 * native-resolution budget. Once it is spent, the final truncated episode is the last honest
 * result available, so discovery stops instead of emitting one record per remaining coarse point.
 */
function collectEpisodes(
  series: SeriesId,
  samples: SampleColumns,
  thresholds: SeriesThresholds,
  seed: number,
  to: number,
): AlarmRecord[] {
  const records: AlarmRecord[] = [];
  const refinementBudget: RefinementBudget = { remaining: MAX_ALARM_REFINEMENT_SAMPLES };
  const edgeBacktrackBudget: RefinementBudget = {
    remaining: MAX_EPISODE_BACKTRACK_SAMPLES,
  };
  let coveredUntil = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < samples.t.length; index += 1) {
    const witness = samples.t[index];
    const witnessValue = samples.v[index];
    if (witness < coveredUntil || detectBreach(witnessValue, thresholds) === undefined) {
      continue;
    }
    const resolved = resolveEpisode(
      series,
      witness,
      witnessValue,
      thresholds,
      seed,
      to,
      index === 0,
      refinementBudget,
      edgeBacktrackBudget,
    );
    records.push(resolved.record);
    coveredUntil = resolved.coveredUntil;
    if (refinementBudget.remaining === 0) {
      break;
    }
  }

  return records;
}

/**
 * Both edge buckets average over a partial window, so their value is not comparable with the rest
 * and the leading one would even be stamped before the requested range. A range narrower than one
 * bucket keeps its single partial point, because an empty chart would be worse than a coarse one.
 */
function completeBuckets(
  columns: SampleColumns,
  from: number,
  to: number,
  bucketMs: number,
): SampleColumns {
  let first = 0;
  while (first < columns.t.length && columns.t[first] < from) {
    first++;
  }
  let last = columns.t.length - 1;
  while (last >= first && columns.t[last] + bucketMs > to) {
    last--;
  }
  if (last < first) {
    if (columns.t.length === 0) {
      return columns;
    }
    // A short range can straddle a bucket boundary and produce two partial aggregates. Keep the
    // first bucket whose aligned timestamp is visible; if the whole range sits inside one bucket,
    // that single earlier-aligned aggregate is still the most representative fallback.
    const partial = first < columns.t.length ? first : columns.t.length - 1;
    return { t: [columns.t[partial]], v: [columns.v[partial]] };
  }
  return { t: columns.t.slice(first, last + 1), v: columns.v.slice(first, last + 1) };
}

export function generateSeries(request: GenerateRequest, seed: number): GeneratedSeries[] {
  const { from, to, series } = request;
  if (to <= from) {
    return series.map((id) => ({ id, t: [], v: [] }));
  }

  // A client may ask for a finer bucket than the range can afford; the point budget still wins.
  const bucket = widenToBudget(request.bucket ?? 'raw', from, to, MAX_POINTS);
  const bucketMs = BUCKET_MS[bucket];
  const stepMs = bucket === 'raw' ? BUCKET_MS.raw : rawStepFor(bucketMs);

  return series.map((id) => {
    const samples = sampleRange(id, from, to, seed, stepMs);
    if (bucket === 'raw') {
      return { id, t: samples.t, v: samples.v };
    }
    const aggregated = aggregate(samples.t, samples.v, bucketMs, 'avg');
    const reduced = completeBuckets(aggregated, from, to, bucketMs);
    return { id, t: reduced.t, v: reduced.v };
  });
}

export function generateAlarms(request: AlarmsRequest, seed: number): AlarmRecord[] {
  const { from, to, series, thresholds } = request;
  if (to <= from) {
    return [];
  }

  const stepMs = alarmStepFor(to - from);
  const records: AlarmRecord[] = [];
  for (const id of series) {
    const effective = thresholds?.[id] ?? SERIES_CATALOG[id].thresholds;
    const samples = sampleRange(id, from - ALARM_LEAD_IN_MS, to, seed, stepMs);
    for (const record of collectEpisodes(id, samples, effective, seed, to)) {
      // The lead-in exists only to date an incident correctly; one that ended before the window
      // opened is not part of the answer.
      if (record.timestamp + record.durationMs > from) {
        records.push(record);
      }
    }
  }

  return records.sort((a, b) => b.timestamp - a.timestamp);
}

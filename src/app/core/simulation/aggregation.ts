export type Reducer = 'avg' | 'min' | 'max' | 'last';

export interface SampleColumns {
  readonly t: number[];
  readonly v: number[];
}

interface BucketState {
  sum: number;
  count: number;
  min: number;
  max: number;
  last: number;
}

/** One strategy per reducer, so a new reducer never touches the bucketing loop. */
const REDUCERS: Readonly<Record<Reducer, (bucket: BucketState) => number>> = {
  avg: (bucket) => bucket.sum / bucket.count,
  min: (bucket) => bucket.min,
  max: (bucket) => bucket.max,
  last: (bucket) => bucket.last,
};

/** Buckets are aligned to absolute time, so the same minute always lands in the same bucket. */
export function aggregate(
  timestamps: readonly number[],
  values: readonly number[],
  bucketMs: number,
  reducer: Reducer,
): SampleColumns {
  if (timestamps.length !== values.length) {
    throw new Error('timestamps and values must have the same length');
  }

  const reduce = REDUCERS[reducer];
  const t: number[] = [];
  const v: number[] = [];
  let start = Number.NaN;
  let bucket: BucketState | undefined;

  for (let i = 0; i < timestamps.length; i++) {
    const bucketStart = Math.floor(timestamps[i] / bucketMs) * bucketMs;
    if (bucket === undefined || bucketStart !== start) {
      if (bucket !== undefined) {
        t.push(start);
        v.push(reduce(bucket));
      }
      start = bucketStart;
      bucket = { sum: 0, count: 0, min: Infinity, max: -Infinity, last: 0 };
    }
    const value = values[i];
    bucket.sum += value;
    bucket.count++;
    bucket.min = value < bucket.min ? value : bucket.min;
    bucket.max = value > bucket.max ? value : bucket.max;
    bucket.last = value;
  }

  if (bucket !== undefined) {
    t.push(start);
    v.push(reduce(bucket));
  }

  return { t, v };
}

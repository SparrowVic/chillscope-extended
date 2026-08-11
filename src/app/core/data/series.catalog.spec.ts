import { describe, expect, it } from 'vitest';
import {
  BUCKET_MS,
  MAX_POINTS,
  MAX_RANGE_MS,
  SERIES_CATALOG,
  SERIES_IDS,
  classify,
  isBucketId,
  isSeriesId,
  isSeriesThresholds,
  resolveBucket,
  widenToBudget,
} from './series.catalog';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

describe('series catalogue', () => {
  it('exposes exactly the four documented series', () => {
    expect([...SERIES_IDS].sort()).toEqual(['flow', 'pressure', 'rpm', 'temperature']);
  });

  it('rejects ordered thresholds whose total span overflows', () => {
    expect(
      isSeriesThresholds({
        criticalMin: -Number.MAX_VALUE,
        warningMin: -1,
        warningMax: 1,
        criticalMax: Number.MAX_VALUE,
      }),
    ).toBe(false);
    expect(
      isSeriesThresholds({ criticalMin: 0, warningMin: 1, warningMax: 2, criticalMax: 3 }),
    ).toBe(true);
  });

  it('recognises only known series ids', () => {
    expect(isSeriesId('temperature')).toBe(true);
    expect(isSeriesId('humidity')).toBe(false);
  });

  it('orders every band from critical low to critical high', () => {
    for (const id of SERIES_IDS) {
      const { criticalMin, warningMin, warningMax, criticalMax } = SERIES_CATALOG[id].thresholds;
      expect(criticalMin).toBeLessThan(warningMin);
      expect(warningMin).toBeLessThan(warningMax);
      expect(warningMax).toBeLessThan(criticalMax);
    }
  });
});

describe('resolveBucket', () => {
  it('keeps raw resolution for short ranges', () => {
    expect(resolveBucket(0, 30 * MINUTE, MAX_POINTS)).toBe('raw');
  });

  it('widens the bucket as the range grows', () => {
    const day = resolveBucket(0, DAY, MAX_POINTS);
    const month = resolveBucket(0, 30 * DAY, MAX_POINTS);
    expect(BUCKET_MS[month]).toBeGreaterThan(BUCKET_MS[day]);
  });

  it('stays inside the point budget for every range the API accepts', () => {
    const ranges = [MINUTE, 60 * MINUTE, DAY, 365 * DAY, MAX_RANGE_MS];
    for (const range of ranges) {
      const bucket = resolveBucket(0, range, MAX_POINTS);
      expect(range / BUCKET_MS[bucket]).toBeLessThanOrEqual(MAX_POINTS);
    }
  });

  it('tolerates an inverted range', () => {
    expect(resolveBucket(MINUTE, 0, MAX_POINTS)).toBe('raw');
  });
});

describe('widenToBudget', () => {
  it('leaves a bucket the range can afford alone', () => {
    expect(widenToBudget('1h', 0, DAY, MAX_POINTS)).toBe('1h');
  });

  it('widens a bucket that would blow the budget', () => {
    expect(widenToBudget('raw', 0, 30 * DAY, MAX_POINTS)).toBe(
      resolveBucket(0, 30 * DAY, MAX_POINTS),
    );
  });
});

describe('isBucketId', () => {
  it('accepts documented buckets and rejects anything else', () => {
    expect(isBucketId('15m')).toBe(true);
    expect(isBucketId('raw')).toBe(true);
    expect(isBucketId('2w')).toBe(false);
  });
});

describe('classify', () => {
  const thresholds = { warningMin: 10, warningMax: 20, criticalMin: 5, criticalMax: 25 };

  it('reports a value inside every band as ok', () => {
    expect(classify(15, thresholds)).toBe('ok');
  });

  it('treats the bands as exclusive bounds', () => {
    expect(classify(10, thresholds)).toBe('ok');
    expect(classify(20, thresholds)).toBe('ok');
  });

  it('keeps exact critical bounds in warning until they are crossed', () => {
    expect(classify(5, thresholds)).toBe('warning');
    expect(classify(25, thresholds)).toBe('warning');
  });

  it('reports the warning band on both sides', () => {
    expect(classify(9.9, thresholds)).toBe('warning');
    expect(classify(20.1, thresholds)).toBe('warning');
  });

  it('reports the critical band on both sides', () => {
    expect(classify(4.9, thresholds)).toBe('critical');
    expect(classify(25.1, thresholds)).toBe('critical');
  });
});

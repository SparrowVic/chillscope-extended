import { describe, expect, it } from 'vitest';
import { BUCKET_MS, MAX_POINTS, MAX_RANGE_MS, SERIES_CATALOG } from '../data/series.catalog';
import { generateAlarms, generateSeries } from './generator';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const START = Date.UTC(2026, 0, 1);
/** The application always asks from "now", which never lands on a bucket boundary. */
const UNALIGNED_START = START + 17 * MINUTE + 33_412;
const SEED = 1337;

describe('generateSeries', () => {
  it('returns one entry per requested series, in the requested order', () => {
    const result = generateSeries(
      { from: START, to: START + HOUR, series: ['pressure', 'temperature'] },
      SEED,
    );
    expect(result.map((entry) => entry.id)).toEqual(['pressure', 'temperature']);
  });

  it('returns identical output for identical input', () => {
    const request = { from: START, to: START + 6 * HOUR, series: ['temperature'] } as const;
    expect(generateSeries(request, SEED)).toEqual(generateSeries(request, SEED));
  });

  it('returns different output for a different seed', () => {
    const request = { from: START, to: START + 6 * HOUR, series: ['temperature'] } as const;
    expect(generateSeries(request, SEED)).not.toEqual(generateSeries(request, SEED + 1));
  });

  it('keeps timestamps and values the same length and ascending', () => {
    const [series] = generateSeries(
      { from: START, to: START + DAY, series: ['temperature'] },
      SEED,
    );
    expect(series.t.length).toBe(series.v.length);
    expect(series.t.length).toBeGreaterThan(0);
    for (let i = 1; i < series.t.length; i++) {
      expect(series.t[i]).toBeGreaterThan(series.t[i - 1]);
    }
  });

  it('stays inside the requested range', () => {
    const [series] = generateSeries({ from: START, to: START + 3 * HOUR, series: ['flow'] }, SEED);
    expect(series.t[0]).toBeGreaterThanOrEqual(START);
    expect(series.t.at(-1)).toBeLessThan(START + 3 * HOUR);
  });

  it('emits only whole buckets that fit inside an unaligned range', () => {
    const to = UNALIGNED_START + 3 * DAY;
    const [series] = generateSeries(
      { from: UNALIGNED_START, to, series: ['temperature'], bucket: '1h' },
      SEED,
    );
    expect(series.t.length).toBeGreaterThan(0);
    expect(series.t[0]).toBeGreaterThanOrEqual(UNALIGNED_START);
    expect((series.t.at(-1) ?? 0) + BUCKET_MS['1h']).toBeLessThanOrEqual(to);
  });

  it('keeps a single partial bucket when the range is narrower than the bucket', () => {
    const [series] = generateSeries(
      { from: UNALIGNED_START, to: UNALIGNED_START + HOUR, series: ['temperature'], bucket: '6h' },
      SEED,
    );
    expect(series.t).toHaveLength(1);
  });

  it('keeps only the visible partial bucket when a short range crosses a bucket boundary', () => {
    const from = START + 54 * MINUTE;
    const [series] = generateSeries(
      { from, to: from + 10 * MINUTE, series: ['temperature'], bucket: '1h' },
      SEED,
    );

    expect(series.t).toEqual([START + HOUR]);
    expect(series.v).toHaveLength(1);
  });

  it('caps the point count even for a year-long range', () => {
    const [series] = generateSeries(
      { from: START, to: START + 365 * DAY, series: ['temperature'] },
      SEED,
    );
    expect(series.t.length).toBeLessThanOrEqual(MAX_POINTS);
  });

  it('widens a bucket the client asked for but the range cannot afford', () => {
    const [series] = generateSeries(
      { from: START, to: START + 30 * DAY, series: ['temperature'], bucket: 'raw' },
      SEED,
    );
    expect(series.t.length).toBeLessThanOrEqual(MAX_POINTS);
  });

  it('honours an explicitly requested bucket', () => {
    const [series] = generateSeries(
      { from: START, to: START + DAY, series: ['temperature'], bucket: '1h' },
      SEED,
    );
    expect(series.t.length).toBe(24);
    expect(series.t[1] - series.t[0]).toBe(HOUR);
  });

  it('returns empty series when the range is inverted', () => {
    const [series] = generateSeries(
      { from: START + HOUR, to: START, series: ['temperature'] },
      SEED,
    );
    expect(series.t).toEqual([]);
    expect(series.v).toEqual([]);
  });
});

describe('generateAlarms', () => {
  const week = { from: START, to: START + 7 * DAY, series: ['temperature'] } as const;
  const allSeries = ['temperature', 'pressure', 'flow', 'rpm'] as const;

  it('reports only samples outside the warning band', () => {
    const alarms = generateAlarms(week, SEED);
    const { thresholds } = SERIES_CATALOG.temperature;
    expect(alarms.length).toBeGreaterThan(0);
    for (const alarm of alarms) {
      expect(['warning', 'critical']).toContain(alarm.severity);
      expect(alarm.value > thresholds.warningMax || alarm.value < thresholds.warningMin).toBe(true);
    }
  });

  it('reports every series and both severities over a month', () => {
    const alarms = generateAlarms({ from: START, to: START + 30 * DAY, series: allSeries }, SEED);
    expect(new Set(alarms.map((alarm) => alarm.series)).size).toBe(allSeries.length);
    expect(new Set(alarms.map((alarm) => alarm.severity))).toEqual(
      new Set(['warning', 'critical']),
    );
  });

  it('returns alarms sorted from newest to oldest', () => {
    const alarms = generateAlarms({ ...week, series: ['temperature', 'pressure'] }, SEED);
    for (let i = 1; i < alarms.length; i++) {
      expect(alarms[i - 1].timestamp).toBeGreaterThanOrEqual(alarms[i].timestamp);
    }
  });

  it('gives every alarm a stable unique id', () => {
    const first = generateAlarms(week, SEED);
    const second = generateAlarms(week, SEED);
    expect(first.map((alarm) => alarm.id)).toEqual(second.map((alarm) => alarm.id));
    expect(new Set(first.map((alarm) => alarm.id)).size).toBe(first.length);
  });

  /** Presets recompute `from` on every click, so the same incident must not change identity. */
  it('dates an incident the same way however the window is cut', () => {
    const wide = generateAlarms({ from: START, to: START + DAY, series: allSeries }, SEED);
    const narrow = generateAlarms(
      { from: START + 6 * HOUR, to: START + DAY, series: allSeries },
      SEED,
    );
    const byId = new Map(wide.map((alarm) => [alarm.id, alarm]));

    let shared = 0;
    for (const alarm of narrow) {
      const other = byId.get(alarm.id);
      if (other === undefined) {
        continue;
      }
      shared++;
      expect(alarm.timestamp).toBe(other.timestamp);
      expect(alarm.durationMs).toBe(other.durationMs);
    }
    expect(shared).toBeGreaterThan(0);
  });

  it('keeps one id and duration when a range cuts into an episode lasting over six hours', () => {
    const thresholds = {
      temperature: { warningMin: 0, warningMax: 60, criticalMin: -1, criticalMax: 200 },
    } as const;
    const from = START + 17 * DAY + 20 * HOUR;
    const cut = from + 12 * HOUR;
    const to = START + 19 * DAY;
    const wide = generateAlarms({ from, to, series: ['temperature'], thresholds }, SEED);
    const narrow = generateAlarms({ from: cut, to, series: ['temperature'], thresholds }, SEED);
    const crossing = wide.find(
      (alarm) => alarm.timestamp < cut && alarm.timestamp + alarm.durationMs > cut,
    );

    expect(crossing).toBeDefined();
    expect(crossing?.durationMs).toBeGreaterThan(6 * HOUR);
    const sameEpisode = narrow.find((alarm) => alarm.id === crossing?.id);
    expect(sameEpisode).toEqual(crossing);
  });

  it('keeps the same id when wide and focused ranges use different scan steps', () => {
    const thresholds = {
      temperature: { warningMin: 0, warningMax: 60, criticalMin: -1, criticalMax: 200 },
    } as const;
    const cut = START + 18 * DAY + 8 * HOUR;
    const coarse = generateAlarms(
      { from: START, to: START + 90 * DAY, series: ['temperature'], thresholds },
      SEED,
    );
    const focused = generateAlarms(
      { from: cut, to: START + 19 * DAY, series: ['temperature'], thresholds },
      SEED,
    );
    const crossing = coarse.find(
      (alarm) => alarm.timestamp < cut && alarm.timestamp + alarm.durationMs > cut,
    );

    expect(crossing).toBeDefined();
    expect(focused.some((alarm) => alarm.id === crossing?.id)).toBe(true);
  });

  it('uses a range-independent id for a continuous breach with no bounded start', () => {
    const thresholds = {
      temperature: { warningMin: 0, warningMax: 1, criticalMin: -1, criticalMax: 200 },
    } as const;
    const to = START + DAY;
    const started = Date.now();
    const wide = generateAlarms({ from: START, to, series: ['temperature'], thresholds }, SEED);
    const narrow = generateAlarms(
      { from: START + 12 * HOUR, to, series: ['temperature'], thresholds },
      SEED,
    );

    expect(wide).toHaveLength(1);
    expect(narrow).toHaveLength(1);
    expect(narrow[0].id).toBe(wide[0].id);
    expect(wide[0].id).toContain('temperature-high-continuous');
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('resolves 500-day episodes to exact recovery points with unique ids', () => {
    const thresholds = {
      temperature: {
        warningMin: -10_000,
        warningMax: 45,
        criticalMin: -20_000,
        criticalMax: 10_000,
      },
    } as const;
    const alarms = generateAlarms(
      { from: START, to: START + 500 * DAY, series: ['temperature'], thresholds },
      SEED,
    );
    const firstRecovery = Date.UTC(2026, 4, 16, 17, 33);
    const crossing = alarms.find(
      (alarm) => alarm.timestamp <= START && alarm.timestamp + alarm.durationMs > START,
    );

    expect(crossing).toBeDefined();
    if (crossing === undefined) {
      throw new Error('Expected an alarm episode crossing the requested range start.');
    }
    expect(crossing.timestamp + crossing.durationMs).toBe(firstRecovery);
    expect(crossing.id).toBe(`temperature-ending-${firstRecovery}`);
    expect(new Set(alarms.map((alarm) => alarm.id)).size).toBe(alarms.length);
    expect(Math.max(...alarms.map((alarm) => alarm.durationMs))).toBeLessThan(160 * DAY);
  });

  it('drops incidents that ended before the window opened', () => {
    const from = START + 6 * HOUR;
    const alarms = generateAlarms({ from, to: from + 18 * HOUR, series: allSeries }, SEED);
    expect(alarms.length).toBeGreaterThan(0);
    for (const alarm of alarms) {
      expect(alarm.timestamp + alarm.durationMs).toBeGreaterThan(from);
    }
  });

  it('collapses a continuous breach into a single episode with a duration', () => {
    const alarms = generateAlarms(week, SEED);
    expect(alarms.every((alarm) => alarm.durationMs >= MINUTE)).toBe(true);
    expect(alarms.some((alarm) => alarm.durationMs > MINUTE)).toBe(true);
  });

  it('escalates an episode to its most severe sample', () => {
    const alarms = generateAlarms(week, SEED);
    const critical = alarms.filter((alarm) => alarm.severity === 'critical');
    const { criticalMin, criticalMax } = SERIES_CATALOG.temperature.thresholds;
    expect(critical.length).toBeGreaterThan(0);
    for (const alarm of critical) {
      expect([criticalMin, criticalMax]).toContain(alarm.threshold);
    }
  });

  it('detects against overridden thresholds when they are supplied', () => {
    const alarms = generateAlarms(
      {
        from: START,
        to: START + DAY,
        series: ['temperature'],
        thresholds: {
          temperature: { warningMin: 0, warningMax: 1, criticalMin: -1, criticalMax: 200 },
        },
      },
      SEED,
    );
    expect(alarms).toHaveLength(1);
    expect(alarms[0].severity).toBe('warning');
  });

  it('keeps the cost bounded for a range spanning decades', () => {
    const started = Date.now();
    const alarms = generateAlarms(
      { from: START - 20 * 365 * DAY, to: START, series: ['temperature', 'pressure'] },
      SEED,
    );
    expect(alarms.length).toBeGreaterThan(0);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('stops discovery after the maximum range exhausts boundary refinement', () => {
    const thresholds = {
      temperature: {
        warningMin: -10_000,
        warningMax: 1,
        criticalMin: -20_000,
        criticalMax: 20_000,
      },
    } as const;
    const request = {
      from: START,
      to: START + MAX_RANGE_MS,
      series: ['temperature'],
      thresholds,
    } as const;
    const started = Date.now();
    const first = generateAlarms(request, SEED);
    const second = generateAlarms(request, SEED);

    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
    expect(new Set(first.map((alarm) => alarm.id)).size).toBe(first.length);
    expect(first[0].timestamp + first[0].durationMs).toBeLessThan(request.to);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('returns nothing for an inverted range', () => {
    expect(
      generateAlarms({ from: START + HOUR, to: START, series: ['temperature'] }, SEED),
    ).toEqual([]);
  });
});

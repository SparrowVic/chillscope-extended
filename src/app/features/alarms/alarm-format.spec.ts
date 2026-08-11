import { describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../../shared/time';
import {
  formatDayHeading,
  formatDuration,
  formatRelativeTime,
  formatTimeOfDay,
} from './alarm-format';

const NOW = Date.parse('2026-08-04T12:00:00.000Z');

describe('formatRelativeTime', () => {
  it('says "now" instead of describing a past event in the future tense', () => {
    expect(formatRelativeTime(NOW, NOW, 'en')).toBe('Now');
    expect(formatRelativeTime(NOW, NOW, 'pl')).toBe('Teraz');
  });

  it('says "now" for a sub-second age rather than rounding to a signed zero', () => {
    expect(formatRelativeTime(NOW - 400, NOW, 'en')).toBe('Now');
  });

  it('rolls over to days rather than reporting an unreachable 24 hours', () => {
    const age = 23 * HOUR_MS + 59 * MINUTE_MS;
    expect(formatRelativeTime(NOW - age, NOW, 'en')).toBe('1 day ago');
  });

  it('still reports whole hours below the rollover', () => {
    expect(formatRelativeTime(NOW - 3 * HOUR_MS, NOW, 'en')).toBe('3 hours ago');
  });

  it('reports minutes once past the "now" window', () => {
    expect(formatRelativeTime(NOW - 5 * MINUTE_MS, NOW, 'en')).toBe('5 minutes ago');
  });

  it('reaches years for a very old alarm', () => {
    expect(formatRelativeTime(NOW - 800 * DAY_MS, NOW, 'en')).toBe('2 years ago');
  });
});

describe('formatDayHeading', () => {
  const startOfToday = new Date(NOW).setHours(0, 0, 0, 0);

  it('names today and yesterday instead of dating them', () => {
    expect(formatDayHeading(startOfToday, NOW, 'en')).toBe('Today');
    expect(formatDayHeading(startOfToday - DAY_MS, NOW, 'en')).toBe('Yesterday');
  });

  it('drops the year while the day is in the current one', () => {
    expect(formatDayHeading(startOfToday - 5 * DAY_MS, NOW, 'en')).not.toMatch(/2026/);
  });

  it('adds the year once the day falls outside it', () => {
    expect(formatDayHeading(startOfToday - 400 * DAY_MS, NOW, 'en')).toMatch(/2025/);
  });
});

describe('formatTimeOfDay', () => {
  // Local wall-clock construction: the row's clock must say what the viewer's clock said.
  const afternoon = new Date(2026, 7, 4, 14, 32).getTime();

  it('prints the local clock reading in each locale', () => {
    expect(formatTimeOfDay(afternoon, 'pl')).toBe('14:32');
    // English keeps its 12-hour cycle; the meridiem separator varies across ICU builds.
    expect(formatTimeOfDay(afternoon, 'en')).toMatch(/^2:32/);
  });

  it('keeps minutes two-digit so a clock never reads as a bare number', () => {
    const early = new Date(2026, 7, 4, 9, 5).getTime();
    expect(formatTimeOfDay(early, 'pl')).toBe('9:05');
  });
});

describe('formatDuration', () => {
  it('never rounds a short episode down to zero minutes', () => {
    expect(formatDuration(20_000, 'en')).toBe('1 min');
  });

  it('switches to hours at the hour boundary', () => {
    expect(formatDuration(90 * MINUTE_MS, 'en')).toBe('1.5 hr');
  });
});

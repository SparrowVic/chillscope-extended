import { describe, expect, it } from 'vitest';
import { hashToUnit, valueNoise } from './random';

describe('hashToUnit', () => {
  it('returns the same value for the same seed and index', () => {
    expect(hashToUnit(42, 1000)).toBe(hashToUnit(42, 1000));
  });

  it('returns different values for neighbouring indices', () => {
    expect(hashToUnit(42, 1000)).not.toBe(hashToUnit(42, 1001));
  });

  it('returns different values for different seeds', () => {
    expect(hashToUnit(42, 1000)).not.toBe(hashToUnit(43, 1000));
  });

  it('stays within [0, 1)', () => {
    for (let index = 0; index < 5000; index++) {
      const value = hashToUnit(7, index);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('spreads roughly uniformly across the range', () => {
    const buckets = new Array<number>(10).fill(0);
    for (let index = 0; index < 10000; index++) {
      buckets[Math.floor(hashToUnit(3, index) * 10)]++;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(700);
      expect(count).toBeLessThan(1300);
    }
  });
});

describe('valueNoise', () => {
  it('is continuous across integer boundaries', () => {
    const before = valueNoise(9, 5 - 1e-9);
    const after = valueNoise(9, 5 + 1e-9);
    expect(Math.abs(before - after)).toBeLessThan(1e-6);
  });

  it('matches hashToUnit at integer positions', () => {
    expect(valueNoise(9, 12)).toBeCloseTo(hashToUnit(9, 12), 10);
  });

  it('stays within [0, 1)', () => {
    for (let index = 0; index < 2000; index++) {
      const value = valueNoise(11, index * 0.37);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

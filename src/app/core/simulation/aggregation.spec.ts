import { describe, expect, it } from 'vitest';
import { aggregate } from './aggregation';

const MINUTE = 60_000;

describe('aggregate', () => {
  const timestamps = [0, MINUTE, 2 * MINUTE, 3 * MINUTE, 4 * MINUTE, 5 * MINUTE];
  const values = [10, 20, 30, 40, 50, 60];

  it('averages within each bucket', () => {
    const result = aggregate(timestamps, values, 3 * MINUTE, 'avg');
    expect(result.t).toEqual([0, 3 * MINUTE]);
    expect(result.v).toEqual([20, 50]);
  });

  it('takes the minimum within each bucket', () => {
    expect(aggregate(timestamps, values, 3 * MINUTE, 'min').v).toEqual([10, 40]);
  });

  it('takes the maximum within each bucket', () => {
    expect(aggregate(timestamps, values, 3 * MINUTE, 'max').v).toEqual([30, 60]);
  });

  it('takes the last value within each bucket', () => {
    expect(aggregate(timestamps, values, 3 * MINUTE, 'last').v).toEqual([30, 60]);
  });

  it('aligns bucket starts to absolute multiples, not to the first sample', () => {
    const result = aggregate([5 * MINUTE, 6 * MINUTE], [1, 2], 5 * MINUTE, 'avg');
    expect(result.t).toEqual([5 * MINUTE]);
  });

  it('handles negative values without losing the minimum', () => {
    expect(aggregate([0, MINUTE], [-5, -1], 5 * MINUTE, 'min').v).toEqual([-5]);
  });

  it('returns empty arrays for empty input', () => {
    expect(aggregate([], [], MINUTE, 'avg')).toEqual({ t: [], v: [] });
  });

  it('throws when the arrays have different lengths', () => {
    expect(() => aggregate([0, 1], [1], MINUTE, 'avg')).toThrow();
  });
});

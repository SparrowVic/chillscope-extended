import { describe, expect, it } from 'vitest';

import type { SeriesThresholds } from '../../../core/data/measurement.models';
import {
  buildTicks,
  buildZones,
  extentOf,
  scaleOffset,
  sparklinePath,
  tapeDomain,
  tapeFaceLayout,
  trendOf,
  valueToY,
} from './tape.math';

const flow: SeriesThresholds = {
  warningMin: 26,
  warningMax: 108,
  criticalMin: 18,
  criticalMax: 118,
};

describe('tapeDomain', () => {
  it('covers the critical band with 8% padding when there is no data', () => {
    const domain = tapeDomain(flow, []);
    expect(domain.min).toBeCloseTo(18 - 8, 6);
    expect(domain.max).toBeCloseTo(118 + 8, 6);
  });

  it('widens to readings outside the critical band, so no value sits off-tape', () => {
    const domain = tapeDomain(flow, [130, 60]);
    expect(domain.max).toBeGreaterThan(130);
    expect(domain.min).toBeLessThan(18);
  });

  it('keeps a non-zero span for a degenerate band', () => {
    const flat: SeriesThresholds = { warningMin: 5, warningMax: 5, criticalMin: 5, criticalMax: 5 };
    const domain = tapeDomain(flat, [5]);
    expect(domain.max).toBeGreaterThan(domain.min);
  });
});

describe('valueToY / scaleOffset', () => {
  const domain = { min: 0, max: 100 };

  it('maps the domain top to row zero and the bottom to the full scale height', () => {
    expect(valueToY(100, domain, 1000)).toBe(0);
    expect(valueToY(0, domain, 1000)).toBe(1000);
    expect(valueToY(50, domain, 1000)).toBe(500);
  });

  it('offsets the scale so the value row lands under the centre pointer', () => {
    expect(scaleOffset(50, domain, 1000)).toBe(-500);
    expect(scaleOffset(100, domain, 1000)).toBe(-0);
  });
});

describe('buildTicks', () => {
  it('picks a nice minor step near 11px and a fifth-tick major', () => {
    // span 100 over 1000px → raw step 1.1 → nice 2, major 10.
    const scale = buildTicks({ min: 0, max: 100 }, 1000);
    expect(scale.majorStep).toBe(10);
    expect(scale.decimals).toBe(0);
    expect(scale.ticks[0]).toEqual({ value: 0, y: 1000, major: true });
    expect(scale.ticks).toHaveLength(51);
  });

  it('lands majors on round multiples counted from zero, not from the domain edge', () => {
    const scale = buildTicks({ min: 3, max: 97 }, 1000);
    const majors = scale.ticks.filter((tick) => tick.major).map((tick) => tick.value);
    expect(majors).toContain(10);
    expect(majors.every((value) => value % scale.majorStep === 0)).toBe(true);
  });

  it('gives fractional steps the decimals their labels need', () => {
    // span 5 over 1000px → raw 0.055 → nice 0.1, major 0.5 → one decimal.
    const scale = buildTicks({ min: 2, max: 7 }, 1000);
    expect(scale.majorStep).toBeCloseTo(0.5, 9);
    expect(scale.decimals).toBe(1);
    // Multiples of 0.1 must come out clean, not as 2.9000000000000004.
    expect(scale.ticks.map((tick) => tick.value)).toContain(2.9);
  });

  it('keeps every tick inside the domain', () => {
    const domain = { min: 12.3, max: 87.1 };
    const scale = buildTicks(domain, 1000);
    for (const tick of scale.ticks) {
      expect(tick.value).toBeGreaterThanOrEqual(domain.min);
      expect(tick.value).toBeLessThanOrEqual(domain.max);
      expect(tick.y).toBeGreaterThanOrEqual(0);
      expect(tick.y).toBeLessThanOrEqual(1000);
    }
  });
});

describe('buildZones', () => {
  const domain = tapeDomain(flow, []);

  it('prints all four bands when the domain covers them', () => {
    const zones = buildZones(flow, domain, 1000);
    expect(zones.map((zone) => `${zone.kind}:${zone.edge}`)).toEqual([
      'critical:high',
      'warning:high',
      'warning:low',
      'critical:low',
    ]);
  });

  it('labels each zone with the threshold on its classify() edge', () => {
    const zones = buildZones(flow, domain, 1000);
    expect(zones.map((zone) => zone.threshold)).toEqual([118, 108, 26, 18]);
  });

  it('stacks the high zones from the tape top down to the warning threshold', () => {
    const [criticalHigh, warningHigh] = buildZones(flow, domain, 1000);
    expect(criticalHigh.top).toBe(0);
    expect(criticalHigh.top + criticalHigh.height).toBeCloseTo(valueToY(118, domain, 1000), 6);
    expect(warningHigh.top).toBeCloseTo(valueToY(118, domain, 1000), 6);
    expect(warningHigh.top + warningHigh.height).toBeCloseTo(valueToY(108, domain, 1000), 6);
  });

  it('drops a band squeezed to nothing', () => {
    const tight: SeriesThresholds = { ...flow, criticalMax: 108 };
    const zones = buildZones(tight, tapeDomain(tight, []), 1000);
    expect(zones.some((zone) => zone.kind === 'warning' && zone.edge === 'high')).toBe(false);
  });
});

describe('trendOf', () => {
  it('reads the direction of the last step', () => {
    expect(trendOf([1, 2, 5], 100)).toBe('up');
    expect(trendOf([5, 2], 100)).toBe('down');
  });

  it('dead-bands jitter below 0.1% of the span', () => {
    expect(trendOf([50, 50.04], 100)).toBe('flat');
    expect(trendOf([50, 50.2], 100)).toBe('up');
  });

  it('is flat with fewer than two samples', () => {
    expect(trendOf([], 100)).toBe('flat');
    expect(trendOf([7], 100)).toBe('flat');
  });
});

describe('extentOf', () => {
  it('returns min, max, average and the last sample', () => {
    expect(extentOf([4, 2, 6])).toEqual({ min: 2, max: 6, avg: 4, last: 6 });
  });

  it('is undefined for an empty range', () => {
    expect(extentOf([])).toBeUndefined();
  });
});

describe('tapeFaceLayout', () => {
  it('keeps the resting grid while the face is unmeasured or degenerate', () => {
    const resting = { sparkWidth: 32, chipWidth: undefined, tailWidth: 32 };
    expect(tapeFaceLayout(undefined)).toEqual(resting);
    expect(tapeFaceLayout(0)).toEqual(resting);
    expect(tapeFaceLayout(80)).toEqual(resting);
  });

  it('reproduces the desktop card geometry exactly: 32px strip, chip stretched to it', () => {
    const layout = tapeFaceLayout(288);
    expect(layout).toEqual({ sparkWidth: 32, chipWidth: 256, tailWidth: 32 });
  });

  it('still stretches the chip on a typical phone face', () => {
    // 390px viewport minus the shell's 1rem gutters and the card's hairlines.
    const layout = tapeFaceLayout(356);
    expect(layout).toEqual({ sparkWidth: 32, chipWidth: 324, tailWidth: 32 });
  });

  it('widens the ghost strip and caps the chip on a wide face', () => {
    const layout = tapeFaceLayout(480);
    expect(layout).toEqual({ sparkWidth: 44, chipWidth: 336, tailWidth: 144 });
  });

  it('gives a spanning row the full strip and a long reference tail', () => {
    const layout = tapeFaceLayout(720);
    expect(layout).toEqual({ sparkWidth: 56, chipWidth: 336, tailWidth: 384 });
  });

  it('always partitions the face between the chip and its tail', () => {
    for (const width of [160, 208, 304, 356, 400, 480, 560, 720, 1024]) {
      const layout = tapeFaceLayout(width);
      expect(layout.chipWidth).toBeDefined();
      expect((layout.chipWidth ?? 0) + layout.tailWidth).toBe(width);
      // The tail always at least crosses the ghost strip — the reference line never stops short.
      expect(layout.tailWidth).toBeGreaterThanOrEqual(layout.sparkWidth);
    }
  });

  it('never shrinks the strip as the face grows', () => {
    let previous = 0;
    for (let width = 120; width <= 1200; width += 20) {
      const { sparkWidth } = tapeFaceLayout(width);
      expect(sparkWidth).toBeGreaterThanOrEqual(previous);
      previous = sparkWidth;
    }
  });
});

describe('sparklinePath', () => {
  it('draws one command per sample, top to bottom', () => {
    const path = sparklinePath([1, 2, 3], 32, 100);
    expect(path.startsWith('M')).toBe(true);
    expect(path.match(/L/g)).toHaveLength(2);
    expect(path.endsWith(' 100.00')).toBe(true);
  });

  it('is empty when there is nothing to draw a line through', () => {
    expect(sparklinePath([], 32, 100)).toBe('');
    expect(sparklinePath([5], 32, 100)).toBe('');
  });

  it('strides long ranges down and still ends on the last sample', () => {
    const values = Array.from({ length: 2000 }, (_, index) => index);
    const path = sparklinePath(values, 32, 100);
    const commands = path.match(/[ML]/g) ?? [];
    expect(commands.length).toBeLessThanOrEqual(162);
    expect(path.endsWith(' 100.00')).toBe(true);
  });
});

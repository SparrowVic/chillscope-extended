import { describe, expect, it } from 'vitest';

import { themeTokens } from './chart-option';
import {
  buildHeatmapOption,
  HEATMAP_COMPACT_MAX_WIDTH,
  magnitudeRamp,
  pairHourlyValues,
  type HeatmapOptionInput,
} from './heatmap-option';
import type { HeatmapMatrix } from './types';

/** Narrow view of the handful of fields this builder is responsible for. */
interface BuiltHeatmap {
  readonly xAxis: { readonly data: readonly string[] };
  readonly yAxis: { readonly data: readonly string[]; readonly inverse?: boolean };
  readonly visualMap: {
    readonly min: number;
    readonly max: number;
    readonly dimension?: number;
    readonly inRange: { readonly color: readonly string[] };
  };
  readonly tooltip: { readonly formatter: (params: unknown) => string };
  readonly media: readonly {
    readonly query: { readonly maxWidth: number };
    readonly option: {
      readonly xAxis: readonly { readonly data: readonly string[] }[];
      readonly series: readonly { readonly data: readonly (readonly number[])[] }[];
    };
  }[];
  readonly series: readonly {
    readonly type: string;
    readonly data: readonly (readonly number[])[];
    readonly itemStyle: { readonly borderColor: string; readonly borderWidth: number };
  }[];
}

const TOKENS = themeTokens('dark');

const DAY = 24 * 60 * 60 * 1000;
const MONDAY = Date.UTC(2026, 7, 3);

function matrixOf(overrides: Partial<HeatmapMatrix> = {}): HeatmapMatrix {
  const values = Array.from({ length: 48 }, (_, index) => (index % 5 === 0 ? null : index / 2));
  return {
    days: [MONDAY, MONDAY + DAY],
    values,
    label: 'Temperature',
    unit: '°C',
    color: '#d75b3b',
    ...overrides,
  };
}

function build(input: Partial<HeatmapOptionInput> = {}): BuiltHeatmap {
  return buildHeatmapOption({
    matrix: matrixOf(),
    tokens: TOKENS,
    locale: 'en',
    ...input,
  }) as unknown as BuiltHeatmap;
}

describe('buildHeatmapOption', () => {
  it('lays out 24 hour columns and one row per day, newest on top', () => {
    const option = build();

    expect(option.xAxis.data).toHaveLength(24);
    expect(option.xAxis.data[0]).toBe('00');
    expect(option.xAxis.data[23]).toBe('23');
    expect(option.yAxis.data).toHaveLength(2);
    // Oldest-first data on a default category axis stacks upward: today ends on top.
    expect(option.yAxis.inverse).toBeUndefined();
  });

  it('drops null hours instead of drawing them as zero', () => {
    const option = build();

    // 48 slots, every fifth null → 10 gaps.
    expect(option.series[0].data).toHaveLength(38);
    for (const [, , value] of option.series[0].data) {
      expect(value).not.toBeNull();
    }
  });

  it('spans the magnitude legend over the sampled extent only', () => {
    const option = build();

    expect(option.visualMap.min).toBe(0.5);
    expect(option.visualMap.max).toBe(23.5);
  });

  it('keeps a non-empty span when every sample is identical', () => {
    const option = build({
      matrix: matrixOf({ days: [MONDAY], values: Array.from({ length: 24 }, () => 7) }),
    });

    expect(option.visualMap.min).toBeLessThan(7);
    expect(option.visualMap.max).toBeGreaterThan(7);
  });

  it('separates cells with a surface seam so the matrix stays readable', () => {
    const option = build();

    expect(option.series[0].type).toBe('heatmap');
    expect(option.series[0].itemStyle.borderColor).toBe(TOKENS.surface);
    expect(option.series[0].itemStyle.borderWidth).toBe(1);
  });

  it('names the day, the hour window and the unit in the tooltip', () => {
    const option = build();
    const html = option.tooltip.formatter({ value: [14, 0, 21.37] });

    expect(html).toContain('14:00–14:59');
    expect(html).toContain('21.4');
    expect(html).toContain('°C');
  });

  it('formats tooltip numerals in the requested language', () => {
    const option = build({ locale: 'pl' });

    expect(option.tooltip.formatter({ value: [14, 0, 21.37] })).toContain('21,4');
  });

  it('pins the magnitude map to the reading, not the trailing hour-window dimensions', () => {
    expect(build().visualMap.dimension).toBe(2);
  });

  it('stamps every hourly cell with its own hour and a span of one', () => {
    const [first] = build().series[0].data;

    // [column, day, reading, hourStart, hourSpan]
    expect(first).toHaveLength(5);
    expect(first[3]).toBe(first[0]);
    expect(first[4]).toBe(1);
  });
});

describe('buildHeatmapOption compact variant', () => {
  it('pairs the hours into 12 two-hour columns below the compact width', () => {
    const option = build();
    const [compact] = option.media;

    expect(compact.query.maxWidth).toBe(HEATMAP_COMPACT_MAX_WIDTH);
    expect(compact.option.xAxis[0].data).toHaveLength(12);
    expect(compact.option.xAxis[0].data[0]).toBe('00');
    expect(compact.option.xAxis[0].data[11]).toBe('22');
  });

  it('keeps one row per day and addresses columns 0–11 in the paired cells', () => {
    const [compact] = build().media;
    const cells = compact.option.series[0].data;

    for (const [column, day] of cells) {
      expect(column).toBeGreaterThanOrEqual(0);
      expect(column).toBeLessThan(12);
      expect([0, 1]).toContain(day);
    }
  });

  it('names the two-hour window in the tooltip through the cell itself', () => {
    const option = build();

    // Column 7 of the paired scene summarises 14:00–15:59; the bare column would say 07.
    expect(option.tooltip.formatter({ value: [7, 0, 21.37, 14, 2] })).toContain('14:00–15:59');
  });
});

describe('pairHourlyValues', () => {
  it('averages full pairs and halves the column count', () => {
    const paired = pairHourlyValues([4, 6, 10, 20]);

    expect(paired).toEqual([5, 15]);
  });

  it('keeps the one real sample of a half-empty pair', () => {
    expect(pairHourlyValues([null, 10, 8, null])).toEqual([10, 8]);
  });

  it('keeps a fully empty pair a gap instead of a zero', () => {
    expect(pairHourlyValues([null, null, 3, 5])).toEqual([null, 4]);
  });

  it('pairs each day row independently across a multi-day matrix', () => {
    const twoDays = [
      ...Array.from({ length: 24 }, () => 1 as number | null),
      ...Array.from({ length: 24 }, () => 3 as number | null),
    ];

    const paired = pairHourlyValues(twoDays);

    expect(paired).toHaveLength(24);
    expect(paired.slice(0, 12).every((value) => value === 1)).toBe(true);
    expect(paired.slice(12).every((value) => value === 3)).toBe(true);
  });
});

describe('magnitudeRamp', () => {
  it('steps one hue from near-surface to near-ink, series colour in the middle', () => {
    const ramp = magnitudeRamp('#d75b3b', TOKENS);

    expect(ramp).toHaveLength(5);
    expect(ramp[3]).toBe('#d75b3b');
    expect(new Set(ramp).size).toBe(5);
  });

  it('builds a light-theme ramp against the light surface', () => {
    const light = themeTokens('light');
    const ramp = magnitudeRamp('#d75b3b', light);

    // The faint end must lean strongly toward the white surface.
    expect(ramp[0]).toMatch(/^#f/i);
  });
});

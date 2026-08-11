import { init, use } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { describe, expect, it } from 'vitest';

import { buildChartOption, themeTokens } from './chart-option';
import './echarts-setup';
import type { ChartSeries } from './types';

use([SVGRenderer]);

const HOUR = 60 * 60 * 1000;
const START = Date.UTC(2026, 7, 13);
const SERIES: readonly ChartSeries[] = [
  ['temperature', 'Temperature', '°C', '#d75b3b', 18],
  ['pressure', 'Pressure', 'bar', '#4c8ccf', 2],
  ['flow', 'Flow', 'm³/h', '#45a06d', 12],
  ['rpm', 'RPM', 'rpm', '#a277c7', 800],
].map(([id, label, unit, color, base]) => ({
  id: id as ChartSeries['id'],
  label: String(label),
  unit: String(unit),
  color: String(color),
  t: Array.from({ length: 24 }, (_, index) => START + index * HOUR),
  v: Array.from({ length: 24 }, (_, index) => Number(base) + Math.sin(index / 3)),
}));

function dataZoomTypes(chart: ReturnType<typeof init>): readonly unknown[] {
  return ((chart.getOption().dataZoom ?? []) as readonly { readonly type?: unknown }[]).map(
    (entry) => entry.type,
  );
}

interface RuntimeSeries {
  readonly id?: unknown;
  readonly data?: readonly unknown[];
}

interface RuntimeAxis {
  readonly show?: unknown;
}

interface RuntimeDataZoom {
  readonly type?: unknown;
  readonly start?: unknown;
  readonly end?: unknown;
}

function seriesState(
  chart: ReturnType<typeof init>,
): readonly { readonly id: unknown; readonly data: readonly unknown[] }[] {
  return ((chart.getOption().series ?? []) as readonly RuntimeSeries[]).map((entry) => ({
    id: entry.id,
    data: entry.data ?? [],
  }));
}

function expectedSeriesState(
  series: readonly ChartSeries[],
): readonly { readonly id: ChartSeries['id']; readonly data: readonly (readonly number[])[] }[] {
  return series.map((entry) => ({
    id: entry.id,
    data: entry.t.map((timestamp, index) => [timestamp, entry.v[index]]),
  }));
}

function yAxisVisibility(chart: ReturnType<typeof init>): readonly unknown[] {
  return ((chart.getOption().yAxis ?? []) as readonly RuntimeAxis[]).map((axis) => axis.show);
}

function dataZoomState(chart: ReturnType<typeof init>): readonly {
  readonly type: unknown;
  readonly start: unknown;
  readonly end: unknown;
}[] {
  return ((chart.getOption().dataZoom ?? []) as readonly RuntimeDataZoom[]).map((entry) => ({
    type: entry.type,
    start: entry.start,
    end: entry.end,
  }));
}

function expectedZoomState(start: number, end: number): readonly RuntimeDataZoom[] {
  return [
    { type: 'inside', start, end },
    { type: 'slider', start, end },
  ];
}

describe('measurement chart responsive ECharts scene', () => {
  it('renders every series at compact width and keeps them through compact/wide rotation', () => {
    const chart = init(null, null, { renderer: 'svg', ssr: true, width: 316, height: 320 });
    chart.setOption(
      buildChartOption({
        series: SERIES,
        tokens: themeTokens('light'),
        locale: 'en',
      }),
      { replaceMerge: ['series', 'yAxis'] },
    );

    const compact = chart.renderToSVGString();
    for (const entry of SERIES) {
      expect(compact).toContain(entry.color);
    }
    expect(seriesState(chart)).toEqual(expectedSeriesState(SERIES));
    expect(yAxisVisibility(chart)).toEqual([true, true, false, false]);

    chart.resize({ width: 800, height: 320 });
    const wide = chart.renderToSVGString();
    for (const entry of SERIES) {
      expect(wide).toContain(entry.color);
    }
    expect(wide).toContain('Temperature');
    expect(seriesState(chart)).toEqual(expectedSeriesState(SERIES));
    expect(yAxisVisibility(chart)).toEqual([true, true, true, true]);

    chart.resize({ width: 316, height: 320 });
    const compactAgain = chart.renderToSVGString();
    for (const entry of SERIES) {
      expect(compactAgain).toContain(entry.color);
    }
    expect(seriesState(chart)).toEqual(expectedSeriesState(SERIES));
    expect(yAxisVisibility(chart)).toEqual([true, true, false, false]);

    chart.dispose();
  });

  it('replaces four compact series with one without blanking the plot', () => {
    const chart = init(null, null, { renderer: 'svg', ssr: true, width: 316, height: 320 });
    const input = {
      tokens: themeTokens('light'),
      locale: 'en',
    } as const;
    chart.setOption(buildChartOption({ ...input, series: SERIES }), {
      replaceMerge: ['series', 'yAxis'],
    });

    chart.setOption(buildChartOption({ ...input, series: [SERIES[0]] }), {
      replaceMerge: ['series', 'yAxis'],
    });

    expect(seriesState(chart)).toEqual(expectedSeriesState([SERIES[0]]));
    const single = chart.renderToSVGString();
    expect(single).toContain(SERIES[0].color);
    for (const entry of SERIES.slice(1)) {
      expect(single).not.toContain(entry.color);
    }

    chart.resize({ width: 800, height: 320 });
    expect(seriesState(chart)).toEqual(expectedSeriesState([SERIES[0]]));

    chart.resize({ width: 316, height: 320 });
    expect(seriesState(chart)).toEqual(expectedSeriesState([SERIES[0]]));

    chart.dispose();
  });

  it('keeps the zoom window through rotation and resets it for a selected backend range', () => {
    const chart = init(null, null, { renderer: 'svg', ssr: true, width: 316, height: 320 });
    const input = {
      tokens: themeTokens('light'),
      locale: 'en',
    } as const;
    chart.setOption(buildChartOption({ ...input, series: SERIES }), {
      replaceMerge: ['series', 'yAxis', 'dataZoom'],
    });
    chart.dispatchAction({ type: 'dataZoom', start: 25, end: 75 });

    expect(dataZoomState(chart)).toEqual(expectedZoomState(25, 75));

    chart.resize({ width: 800, height: 320 });
    expect(dataZoomState(chart)).toEqual(expectedZoomState(25, 75));

    chart.resize({ width: 316, height: 320 });
    expect(dataZoomState(chart)).toEqual(expectedZoomState(25, 75));

    chart.setOption(buildChartOption({ ...input, series: [SERIES[0]] }), {
      replaceMerge: ['series', 'yAxis', 'dataZoom'],
    });

    expect(dataZoomTypes(chart)).toEqual(['inside', 'slider']);
    expect(dataZoomState(chart)).toEqual(expectedZoomState(0, 100));
    expect(seriesState(chart)).toEqual(expectedSeriesState([SERIES[0]]));

    chart.resize({ width: 800, height: 320 });
    expect(dataZoomTypes(chart)).toEqual(['inside', 'slider']);
    expect(dataZoomState(chart)).toEqual(expectedZoomState(0, 100));

    chart.resize({ width: 316, height: 320 });
    expect(dataZoomTypes(chart)).toEqual(['inside', 'slider']);
    expect(dataZoomState(chart)).toEqual(expectedZoomState(0, 100));

    chart.dispose();
  });
});

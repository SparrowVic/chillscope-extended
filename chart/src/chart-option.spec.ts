import { describe, expect, it } from 'vitest';

import {
  buildChartOption,
  type ChartOptionInput,
  type ChartThemeTokens,
  themeTokens,
} from './chart-option';
import type { ChartSeries, ChartThresholds, SeriesThresholdBand } from './types';

/**
 * `MeasurementChartOption` is a union of everything ECharts accepts, so assertions read through a
 * narrow view of the handful of fields this builder is responsible for.
 */
interface BuiltAxis {
  readonly name: string;
  readonly min: number;
  readonly max: number;
  readonly position: string;
  readonly offset: number;
  readonly show?: boolean;
  readonly axisLabel: { readonly fontFamily: string };
  readonly splitLine: { readonly show: boolean };
}

interface BuiltSeries {
  readonly id: string;
  readonly name: string;
  readonly yAxisIndex: number;
  readonly showSymbol: boolean;
  readonly data: readonly (readonly number[])[];
  readonly markLine?: {
    readonly label: { readonly show: boolean; readonly fontFamily: string };
    readonly data: readonly { readonly lineStyle: { readonly color: string } }[];
  };
  readonly markArea?: {
    readonly data: readonly (readonly {
      readonly itemStyle?: { readonly color: string; readonly opacity: number };
    }[])[];
  };
}

interface BuiltSeriesReference {
  readonly id: string;
}

interface BuiltOption {
  readonly grid: { readonly left: number; readonly right: number };
  readonly legend: {
    readonly data: readonly string[];
    readonly icon: string;
    readonly textStyle: { readonly fontFamily: string };
    readonly formatter: (name: string) => string;
  };
  readonly visualMap: readonly {
    readonly type: string;
    readonly show: boolean;
    readonly dimension: number;
    readonly seriesIndex: number;
    readonly pieces: readonly { readonly color: string }[];
  }[];
  readonly tooltip: {
    readonly formatter: (params: unknown) => string;
    readonly extraCssText: string;
    readonly axisPointer: { readonly label: { readonly fontFamily: string } };
  };
  readonly xAxis: { readonly axisLabel: { readonly fontFamily: string } };
  readonly yAxis: readonly BuiltAxis[];
  readonly dataZoom: readonly Record<string, unknown>[];
  readonly media: readonly {
    readonly query: { readonly maxWidth: number };
    readonly option: {
      readonly grid: { readonly left: number; readonly right: number };
      readonly legend: { readonly type: string; readonly left: number; readonly right: number };
      readonly yAxis: readonly {
        readonly show?: boolean;
        readonly name?: string;
        readonly offset: number;
        readonly nameGap?: number;
      }[];
      readonly dataZoom: readonly Record<string, unknown>[];
      readonly series: readonly BuiltSeriesReference[];
    };
  }[];
  readonly series: readonly BuiltSeries[];
}

const TOKENS: ChartThemeTokens = themeTokens('light');

const BAND: SeriesThresholdBand = {
  warningMin: 5,
  warningMax: 30,
  criticalMin: 0,
  criticalMax: 40,
};

type Rgb = readonly [red: number, green: number, blue: number];

function parseHex(value: string): Rgb {
  if (!/^#[\da-f]{6}$/i.test(value)) {
    throw new Error(`Expected a six-digit hex colour, received "${value}".`);
  }
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function channelLuminance(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  const [red, green, blue] = parseHex(color);
  return (
    channelLuminance(red) * 0.2126 +
    channelLuminance(green) * 0.7152 +
    channelLuminance(blue) * 0.0722
  );
}

function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function compositeRgba(value: string, background: string): string {
  const match = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(value);
  if (!match) {
    throw new Error(`Expected an rgba colour, received "${value}".`);
  }
  const foreground = match.slice(1, 4).map(Number);
  const opacity = Number(match[4]);
  const backgroundChannels = parseHex(background);
  const channels = foreground.map((channel, index) =>
    Math.round(channel * opacity + backgroundChannels[index] * (1 - opacity)),
  );
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function build(input: Partial<ChartOptionInput> = {}): BuiltOption {
  return buildChartOption({
    series: [],
    tokens: TOKENS,
    locale: 'en',
    ...input,
  }) as unknown as BuiltOption;
}

function seriesOf(overrides: Partial<ChartSeries> = {}): ChartSeries {
  return {
    id: 'temperature',
    label: 'Temperature',
    unit: '°C',
    color: '#ff0000',
    t: [1000, 2000, 3000],
    v: [10, 20, 30],
    ...overrides,
  };
}

const FOUR_UNITS: readonly ChartSeries[] = [
  seriesOf(),
  seriesOf({ id: 'pressure', label: 'Pressure', unit: 'bar', v: [1, 2, 3] }),
  seriesOf({ id: 'flow', label: 'Flow', unit: 'm3/h', v: [4, 5, 6] }),
  seriesOf({ id: 'rpm', label: 'RPM', unit: 'rpm', v: [700, 800, 900] }),
];

describe('buildChartOption', () => {
  it('keeps one placeholder value axis when there is no series at all', () => {
    const option = build();

    expect(option.series).toEqual([]);
    expect(option.legend.data).toEqual([]);
    expect(option.yAxis).toHaveLength(1);
    expect(option.yAxis[0].min).toBe(0);
    expect(option.yAxis[0].max).toBe(1);
  });

  it('survives a series that carries no samples', () => {
    const option = build({ series: [seriesOf({ t: [], v: [] })] });

    expect(option.series[0].data).toEqual([]);
    expect(Number.isFinite(option.yAxis[0].min)).toBe(true);
    expect(Number.isFinite(option.yAxis[0].max)).toBe(true);
    expect(option.yAxis[0].min).toBeLessThan(option.yAxis[0].max);
  });

  it('shows the marker for a single point, which draws no line segment', () => {
    const option = build({ series: [seriesOf({ t: [1000], v: [21] })] });

    expect(option.series[0].showSymbol).toBe(true);
    expect(option.series[0].data).toEqual([[1000, 21]]);
    expect(option.yAxis[0].min).toBeLessThan(21);
    expect(option.yAxis[0].max).toBeGreaterThan(21);
  });

  it('hides markers as soon as there is a line to draw', () => {
    expect(build({ series: [seriesOf()] }).series[0].showSymbol).toBe(false);
  });

  it('pads a flat series so the line does not collapse onto the axis', () => {
    const option = build({ series: [seriesOf({ v: [21, 21, 21] })] });

    expect(option.yAxis[0].min).toBeLessThan(21);
    expect(option.yAxis[0].max).toBeGreaterThan(21);
  });

  it('pads a series that is flat at zero', () => {
    const option = build({ series: [seriesOf({ v: [0, 0, 0] })] });

    expect(option.yAxis[0].min).toBeLessThan(0);
    expect(option.yAxis[0].max).toBeGreaterThan(0);
  });

  it('widens the axis so the whole threshold band stays visible', () => {
    const thresholds: ChartThresholds = { temperature: BAND };
    const option = build({ series: [seriesOf()], thresholds });

    expect(option.yAxis[0].min).toBeLessThan(BAND.criticalMin);
    expect(option.yAxis[0].max).toBeGreaterThan(BAND.criticalMax);
    expect(option.series[0].markLine).toBeDefined();
    expect(option.series[0].markArea).toBeDefined();
  });

  it('grants the zone wash only to a lone series — stacked bands would mud the plot', () => {
    const two = build({
      series: [seriesOf(), seriesOf({ id: 'pressure', label: 'Pressure', unit: 'bar' })],
      thresholds: { temperature: BAND, pressure: BAND },
    });

    expect(two.series[0].markArea).toBeUndefined();
    expect(two.series[1].markArea).toBeUndefined();
    // The thin dashed rules stay: they do not stack into a wash.
    expect(two.series[0].markLine).toBeDefined();
  });

  it('leaves threshold decorations off a series without a band', () => {
    const option = build({ series: [seriesOf()], thresholds: { pressure: BAND } });

    expect(option.series[0].markLine).toBeUndefined();
    expect(option.series[0].markArea).toBeUndefined();
  });

  it('keeps threshold rules perceivable without value chips or heavy zones', () => {
    const option = build({ series: [seriesOf()], thresholds: { temperature: BAND } });

    const markLine = option.series[0].markLine;
    // Value chips collide where two series' thresholds meet in pixel space, so they are off.
    expect(markLine?.label.show).toBe(false);
    for (const entry of markLine?.data ?? []) {
      expect(entry.lineStyle.color).toMatch(/^rgba\(.*0\.75\)$/);
    }
    for (const zone of option.series[0].markArea?.data ?? []) {
      expect(zone[0].itemStyle?.opacity).toBeLessThanOrEqual(0.08);
    }
  });

  it('prints the one severity ladder as zones: crit at the rim, warn inside, ok bare', () => {
    const option = build({ series: [seriesOf()], thresholds: { temperature: BAND } });

    const zones = option.series[0].markArea?.data ?? [];
    expect(zones).toHaveLength(4);
    const opacities = zones.map((zone) => zone[0].itemStyle?.opacity);
    // Two critical rims louder than the two warning bands beneath them.
    expect(opacities[0]).toBeGreaterThan(opacities[2] ?? 1);
    expect(opacities[1]).toBeGreaterThan(opacities[3] ?? 1);
  });

  it('splits banded series into severity segments through hidden piecewise maps', () => {
    const option = build({
      series: [seriesOf(), seriesOf({ id: 'pressure', label: 'Pressure', unit: 'bar' })],
      thresholds: { pressure: BAND },
    });

    expect(option.visualMap).toHaveLength(1);
    const [map] = option.visualMap;
    expect(map.type).toBe('piecewise');
    expect(map.show).toBe(false);
    expect(map.dimension).toBe(1);
    // The map must aim at the banded series, not the first one.
    expect(map.seriesIndex).toBe(1);
    expect(map.pieces).toHaveLength(5);
    // In-band keeps the series hue; the rims speak severity.
    expect(map.pieces[2].color).toBe('#ff0000');
    expect(map.pieces[0].color).toBe(TOKENS.critical);
    expect(map.pieces[1].color).toBe(TOKENS.warning);
  });

  it('leaves plot-drag to the component brush: inside zoom neither pans nor selects', () => {
    const [inside] = build({ series: [seriesOf()] }).dataZoom;

    expect(inside.moveOnMouseMove).toBe(false);
  });

  it('turns the legend into a live readout of the latest sample', () => {
    const option = build({ series: [seriesOf()], locale: 'en' });

    expect(option.legend.formatter('Temperature')).toBe('Temperature{value|30 °C}');
    // A name without data (or unknown) stays a plain label.
    expect(option.legend.formatter('Ghost')).toBe('Ghost');
  });

  it('gives every distinct unit its own axis and alternates the sides', () => {
    const option = build({ series: FOUR_UNITS });

    expect(option.yAxis.map((axis) => axis.name)).toEqual(['°C', 'bar', 'm3/h', 'rpm']);
    expect(option.yAxis.map((axis) => axis.position)).toEqual(['left', 'right', 'left', 'right']);
    expect(option.yAxis.map((axis) => axis.offset)).toEqual([0, 0, 54, 54]);
    expect(option.series.map((entry) => entry.yAxisIndex)).toEqual([0, 1, 2, 3]);
  });

  it('shares one axis between series that report the same unit', () => {
    const option = build({
      series: [seriesOf(), seriesOf({ id: 'pressure', label: 'Second', v: [40, 50, 60] })],
    });

    expect(option.yAxis).toHaveLength(1);
    expect(option.series.map((entry) => entry.yAxisIndex)).toEqual([0, 0]);
    expect(option.yAxis[0].max).toBeGreaterThan(60);
  });

  it('draws horizontal grid lines for the first axis only', () => {
    const option = build({ series: FOUR_UNITS });

    expect(option.yAxis.map((axis) => axis.splitLine.show)).toEqual([true, false, false, false]);
  });

  it('reserves plot margin for the axes it laid out', () => {
    const one = build({ series: [seriesOf()] });
    const four = build({ series: FOUR_UNITS });

    expect(one.grid.left).toBeLessThan(four.grid.left);
    expect(one.grid.right).toBeLessThan(four.grid.right);
  });

  it('keeps a useful plot width on phone canvases with four units', () => {
    const [compact] = build({ series: FOUR_UNITS }).media;
    const phoneCanvasWidth = 251;
    const plotWidth = phoneCanvasWidth - compact.option.grid.left - compact.option.grid.right;

    expect(compact.query.maxWidth).toBeGreaterThanOrEqual(375);
    expect(plotWidth).toBeGreaterThan(120);
    expect(compact.option.legend).toMatchObject({ type: 'scroll', left: 8, right: 8 });
    expect(compact.option.yAxis.map((axis) => axis.show)).toEqual([true, true, false, false]);
    expect(compact.option.yAxis.map((axis) => axis.offset)).toEqual([0, 0, 0, 0]);
    expect(compact.option.series).toHaveLength(4);
  });

  it('gives replaceMerge complete media collections and restores the wide scene by default', () => {
    const option = build({ series: FOUR_UNITS });
    const [compact, wide] = option.media;

    expect(compact.option.yAxis.map((axis) => axis.name)).toEqual(
      option.yAxis.map((axis) => axis.name),
    );
    expect(compact.option.series).toEqual(option.series.map(({ id }) => ({ id })));
    expect(compact.option.dataZoom.map((entry) => entry.type)).toEqual(
      option.dataZoom.map((entry) => entry.type),
    );
    expect(wide.option.grid).toEqual({
      left: option.grid.left,
      right: option.grid.right,
    });
    expect(wide.option.legend).toMatchObject({ type: 'plain', left: 'auto', right: 8 });
    expect(wide.option.yAxis.map((axis) => axis.show)).toEqual([true, true, true, true]);
    expect(wide.option.series).toEqual(option.series.map(({ id }) => ({ id })));
    expect(wide.option.dataZoom.map((entry) => entry.type)).toEqual(
      option.dataZoom.map((entry) => entry.type),
    );
  });

  it('lets an unmodified wheel scroll the page instead of zooming the chart', () => {
    const [inside] = build().dataZoom;

    expect(inside.type).toBe('inside');
    expect(inside.zoomOnMouseWheel).toBe('ctrl');
    expect(inside.moveOnMouseWheel).toBe(false);
  });

  it('tints the slider window with the accent and keeps the track compact', () => {
    const [, slider] = build().dataZoom;

    expect(slider.type).toBe('slider');
    expect(slider.height).toBeLessThanOrEqual(20);
    // Light accent is near-black #1b1d20 at low alpha — a grey tint, not the v1 cyan.
    expect(String(slider.fillerColor)).toBe('rgba(27, 29, 32, 0.12)');
  });

  it('tints the slider from the near-white accent in dark so it reads on both schemes', () => {
    const [, slider] = build({ tokens: themeTokens('dark') }).dataZoom;

    expect(String(slider.fillerColor)).toBe('rgba(233, 235, 238, 0.12)');
  });

  it('sets canvas fonts explicitly: mono for read numerals, sans for the legend', () => {
    const option = build({ series: [seriesOf()] });

    expect(option.xAxis.axisLabel.fontFamily).toContain('Geist Mono');
    expect(option.yAxis[0].axisLabel.fontFamily).toContain('Geist Mono');
    expect(option.tooltip.axisPointer.label.fontFamily).toContain('Geist Mono');
    expect(option.legend.textStyle.fontFamily).toContain('Geist Sans');
    expect(option.legend.icon).toBe('circle');
  });

  it('keeps the tooltip a flat panel: no drop shadow, 8px radius', () => {
    const option = build({ series: [seriesOf()] });

    expect(option.tooltip.extraCssText).toContain('box-shadow: none');
    expect(option.tooltip.extraCssText).toContain('border-radius: 8px');
  });
});

describe('tooltip formatter', () => {
  const row = { value: [1_700_000_000_000, 20.5], seriesName: 'Temperature', marker: '<i></i>' };

  function format(locale: string, params: unknown): string {
    return build({ series: [seriesOf()], locale }).tooltip.formatter(params);
  }

  it('formats the heading and the value in the requested language', () => {
    const english = format('en', [row]);
    const polish = format('pl', [row]);

    expect(english).toContain(
      new Intl.DateTimeFormat('en', { dateStyle: 'short', timeStyle: 'short' }).format(
        row.value[0],
      ),
    );
    expect(english).toContain('20.5');
    expect(polish).toContain(
      new Intl.DateTimeFormat('pl', { dateStyle: 'short', timeStyle: 'short' }).format(
        row.value[0],
      ),
    );
    expect(polish).toContain('20,5');
  });

  it('appends the unit that belongs to the series', () => {
    expect(format('en', [row])).toContain('°C');
  });

  it('sets the value in mono and the series name in sans', () => {
    const html = format('en', [row]);

    expect(html).toContain('Geist Mono');
    expect(html).toContain('Geist Sans');
  });

  it('rounds to two decimals like the rest of the app', () => {
    expect(format('en', [{ ...row, value: [row.value[0], 1.23456] }])).toContain('1.23');
  });

  it('escapes label text so a series name cannot inject markup', () => {
    const evil = seriesOf({ label: '<img src=x>' });
    const option = build({ series: [evil], locale: 'en' });

    expect(option.tooltip.formatter([{ ...row, seriesName: '<img src=x>' }])).toContain(
      '&lt;img src=x&gt;',
    );
  });

  it('accepts a single row as well as an array', () => {
    expect(format('en', row)).toContain('Temperature');
  });

  it('speaks a reading outside its band in the severity ink', () => {
    const option = build({
      series: [seriesOf()],
      thresholds: { temperature: BAND },
      locale: 'en',
    });
    const excursion = { ...row, seriesId: 'temperature', value: [row.value[0], 45] };
    const warningRow = { ...row, seriesId: 'temperature', value: [row.value[0], 32] };
    const calm = { ...row, seriesId: 'temperature', value: [row.value[0], 20] };

    expect(option.tooltip.formatter([excursion])).toContain(`color:${TOKENS.critical}`);
    expect(option.tooltip.formatter([warningRow])).toContain(`color:${TOKENS.warning}`);
    expect(option.tooltip.formatter([calm])).toContain(`color:${TOKENS.text}`);
  });

  it('returns nothing when there is no point under the pointer', () => {
    expect(format('en', [])).toBe('');
    expect(format('en', [{ ...row, value: undefined }])).toBe('');
  });
});

describe('themeTokens', () => {
  it('pairs SYGNAL ink and muted per theme', () => {
    expect(themeTokens('light').text).toBe('#1b1d20');
    expect(themeTokens('light').muted).toBe('#5d636b');
    expect(themeTokens('dark').text).toBe('#dfe1e4');
    expect(themeTokens('dark').muted).toBe('#9ba0a7');
  });

  it('keeps hairlines as low-alpha mixes of the SYGNAL muted grey', () => {
    expect(themeTokens('light').hairline).toBe('rgba(93, 99, 107, 0.18)');
    expect(themeTokens('dark').hairline).toBe('rgba(93, 99, 107, 0.22)');
  });

  it('gives the tooltip the overlay surface of its theme', () => {
    expect(themeTokens('light').surface).toBe('#ffffff');
    expect(themeTokens('dark').surface).toBe('#2c2e32');
  });

  it('deepens status hues for light and keeps them vivid for dark', () => {
    expect(themeTokens('dark').warning).toBe('#f0a93e');
    expect(themeTokens('dark').critical).toBe('#ff5f57');
    expect(themeTokens('light').warning).toBe('#875800');
    expect(themeTokens('light').critical).toBe('#cb3038');
  });

  it.each(['light', 'dark'] as const)(
    'keeps %s threshold labels and rules distinguishable from the chart surface',
    (theme) => {
      const tokens = themeTokens(theme);
      expect(contrastRatio(tokens.warning, tokens.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens.critical, tokens.surface)).toBeGreaterThanOrEqual(4.5);

      const option = build({
        tokens,
        series: [seriesOf()],
        thresholds: { temperature: BAND },
      });
      for (const entry of option.series[0].markLine?.data ?? []) {
        const rule = compositeRgba(entry.lineStyle.color, tokens.surface);
        expect(contrastRatio(rule, tokens.surface)).toBeGreaterThanOrEqual(3);
      }
    },
  );

  it('flips the achromatic accent per theme: near-white on dark, near-black on light', () => {
    expect(themeTokens('dark').accent).toBe('#e9ebee');
    expect(themeTokens('light').accent).toBe('#1b1d20');
  });
});

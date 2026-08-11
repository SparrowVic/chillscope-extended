import type { LineSeriesOption } from 'echarts/charts';
import type {
  DataZoomComponentOption,
  GridComponentOption,
  LegendComponentOption,
  TooltipComponentOption,
  VisualMapComponentOption,
} from 'echarts/components';
import type { ComposeOption } from 'echarts/core';
import type { ChartSeries, ChartTheme, ChartThresholds, SeriesThresholdBand } from './types';

export type MeasurementChartOption = ComposeOption<
  | LineSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
  | DataZoomComponentOption
  | VisualMapComponentOption
>;

/**
 * Canvas text does not inherit the page cascade, so the fonts have to be spelled out here.
 * Fallback chain mirrors --cs-font-mono / --cs-font-sans in styles.css.
 */
const FONT_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const FONT_SANS = "'Geist Sans', ui-sans-serif, system-ui, 'Segoe UI', sans-serif";

export interface ChartThemeTokens {
  readonly text: string;
  readonly muted: string;
  /** Axis lines and splitLines — the canvas twin of --cs-hairline. */
  readonly hairline: string;
  /** Crosshair, slider outline — the canvas twin of --cs-hairline-strong. */
  readonly hairlineStrong: string;
  /** Panel background for the tooltip and axis-pointer chips. */
  readonly surface: string;
  /** SYGNAL accent (near-white in dark, near-black in light), dataZoom selection only. */
  readonly accent: string;
  readonly warning: string;
  readonly critical: string;
}

export interface ChartOptionInput {
  readonly series: readonly ChartSeries[];
  readonly thresholds?: ChartThresholds;
  readonly tokens: ChartThemeTokens;
  readonly locale: string;
}

const AXIS_WIDTH = 54;
const AXIS_GUTTER = 14;
/** Grid band, exported for the component's selection overlay — the two must never disagree. */
export const GRID_TOP = 46;
export const GRID_BOTTOM = 60;
/**
 * Below this canvas width four full axes leave less than a useful plot column. Compact mode keeps
 * the first axis on each side and lets the tooltip carry the other units without shrinking data to
 * a sliver. The query observes the canvas itself, so shell and panel padding are already accounted
 * for.
 */
const COMPACT_MAX_WIDTH = 520;
const COMPACT_AXIS_WIDTH = 42;
const COMPACT_AXIS_GUTTER = 10;
const BOUNDS_PADDING = 0.08;
/** ECharts' own default splitNumber — the step the bounds are rounded to must match it. */
const AXIS_SPLITS = 5;
/** Close to the axis top, clear of the legend row above the grid (the two must never read as one). */
const AXIS_NAME_GAP = 6;
const THRESHOLD_LINE_ALPHA = 0.75;
const CRITICAL_ZONE_ALPHA = 0.07;
/* Half the critical voice: the same §2.1 severity ladder the threshold envelope prints. */
const WARNING_ZONE_ALPHA = 0.045;
const ACCENT_WINDOW_ALPHA = 0.12;

/** Mirrors src/app/features/dashboard/formatting.ts so tooltips read like the rest of the app. */
const VALUE_OPTIONS: Intl.NumberFormatOptions = { maximumFractionDigits: 2 };
const TIMESTAMP_OPTIONS: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' };

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** SYGNAL light-muted grey — the base both hairline tokens are mixed from. */
const HAIRLINE_BASE = '#5d636b';

/**
 * Concrete theme values mirror the --cs-* token sheet in styles.css. Canvas paint cannot read
 * custom properties reliably mid-transition, so the
 * theme prop is the single source of truth here. The tooltip surface is the overlay step;
 * the accent is near-white (dark) / near-black (light) and appears only as the dataZoom
 * selection tint — chroma is reserved for warning and critical.
 */
const THEME_TOKENS: Readonly<Record<ChartTheme, ChartThemeTokens>> = {
  light: {
    text: '#1b1d20',
    muted: '#5d636b',
    hairline: withAlpha(HAIRLINE_BASE, 0.18),
    hairlineStrong: withAlpha(HAIRLINE_BASE, 0.42),
    surface: '#ffffff',
    accent: '#1b1d20',
    warning: '#875800',
    critical: '#cb3038',
  },
  dark: {
    text: '#dfe1e4',
    muted: '#9ba0a7',
    hairline: withAlpha(HAIRLINE_BASE, 0.22),
    hairlineStrong: withAlpha(HAIRLINE_BASE, 0.42),
    surface: '#2c2e32',
    accent: '#e9ebee',
    warning: '#f0a93e',
    critical: '#ff5f57',
  },
};

export function themeTokens(theme: ChartTheme): ChartThemeTokens {
  return THEME_TOKENS[theme];
}

interface UnitAxis {
  readonly unit: string;
  readonly members: readonly ChartSeries[];
  readonly min: number;
  readonly max: number;
}

function groupByUnit(
  series: readonly ChartSeries[],
  thresholds: ChartThresholds | undefined,
): UnitAxis[] {
  const groups = new Map<string, ChartSeries[]>();
  for (const entry of series) {
    const members = groups.get(entry.unit);
    if (members) {
      members.push(entry);
    } else {
      groups.set(entry.unit, [entry]);
    }
  }
  // A cartesian grid without a value axis leaves ECharts unable to lay out, so the empty state
  // still needs one placeholder axis.
  if (groups.size === 0) {
    return [{ unit: '', members: [], min: 0, max: 1 }];
  }
  return [...groups].map(([unit, members]) => ({
    unit,
    members,
    ...boundsFor(members, thresholds),
  }));
}

function boundsFor(
  members: readonly ChartSeries[],
  thresholds: ChartThresholds | undefined,
): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const entry of members) {
    for (const value of entry.v) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const band = thresholds?.[entry.id];
    if (band) {
      min = Math.min(min, band.criticalMin, band.warningMin);
      max = Math.max(max, band.criticalMax, band.warningMax);
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }
  const padding = (max - min || Math.abs(max) || 1) * BOUNDS_PADDING;
  // Rounded outward to a nice step: with raw padded extremes ECharts prints them verbatim
  // (86.96 / 44.04) while every intermediate tick is clean.
  const step = niceStep(max - min + 2 * padding);
  return {
    min: trimFloat(Math.floor((min - padding) / step) * step),
    max: trimFloat(Math.ceil((max + padding) / step) * step),
  };
}

/** The nice-number ladder (1, 2, 5, 10 × magnitude) over the axis' target split count. */
function niceStep(span: number): number {
  const raw = span / AXIS_SPLITS;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalised = raw / magnitude;
  const factor = normalised > 5 ? 10 : normalised > 2 ? 5 : normalised > 1 ? 2 : 1;
  return factor * magnitude;
}

/** Padding arithmetic yields values like 2.3600000000000003, and ECharts prints them verbatim. */
function trimFloat(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function axisPlacement(index: number): { position: 'left' | 'right'; offset: number } {
  return {
    position: index % 2 === 0 ? 'left' : 'right',
    offset: Math.floor(index / 2) * AXIS_WIDTH,
  };
}

function thresholdLines(
  band: SeriesThresholdBand,
  tokens: ChartThemeTokens,
): LineSeriesOption['markLine'] {
  const warning = withAlpha(tokens.warning, THRESHOLD_LINE_ALPHA);
  const critical = withAlpha(tokens.critical, THRESHOLD_LINE_ALPHA);
  return {
    silent: true,
    symbol: 'none',
    animation: false,
    /* No value chips: with four series the labels collide where thresholds meet in pixel
       space, and the exact numbers already live in Settings and the tooltip context. */
    label: { show: false },
    lineStyle: { type: 'dashed', width: 1 },
    data: [
      { yAxis: band.warningMax, lineStyle: { color: warning }, label: { color: tokens.warning } },
      { yAxis: band.warningMin, lineStyle: { color: warning }, label: { color: tokens.warning } },
      {
        yAxis: band.criticalMax,
        lineStyle: { color: critical },
        label: { color: tokens.critical },
      },
      {
        yAxis: band.criticalMin,
        lineStyle: { color: critical },
        label: { color: tokens.critical },
      },
    ],
  };
}

/* Warn and crit zones tint the plot exactly like the threshold envelope tints its track:
   one severity-band grammar across the app, the ok zone deliberately bare. */
function severityZones(
  band: SeriesThresholdBand,
  axis: UnitAxis,
  tokens: ChartThemeTokens,
): LineSeriesOption['markArea'] {
  return {
    silent: true,
    animation: false,
    data: [
      [
        {
          yAxis: band.criticalMax,
          itemStyle: { color: tokens.critical, opacity: CRITICAL_ZONE_ALPHA },
        },
        { yAxis: axis.max },
      ],
      [
        { yAxis: axis.min, itemStyle: { color: tokens.critical, opacity: CRITICAL_ZONE_ALPHA } },
        { yAxis: band.criticalMin },
      ],
      [
        {
          yAxis: band.warningMax,
          itemStyle: { color: tokens.warning, opacity: WARNING_ZONE_ALPHA },
        },
        { yAxis: band.criticalMax },
      ],
      [
        {
          yAxis: band.criticalMin,
          itemStyle: { color: tokens.warning, opacity: WARNING_ZONE_ALPHA },
        },
        { yAxis: band.warningMin },
      ],
    ],
  };
}

/**
 * Threshold excursions carry the severity ink on the line itself: a hidden piecewise map splits
 * each banded series into in-band (its own hue) / warning / critical segments, so an excursion
 * is visible at a glance without reading any axis (chroma = information, §1).
 */
function severityMap(
  band: SeriesThresholdBand,
  seriesIndex: number,
  color: string,
  tokens: ChartThemeTokens,
): VisualMapComponentOption {
  return {
    type: 'piecewise',
    show: false,
    dimension: 1,
    seriesIndex,
    pieces: [
      { lt: band.criticalMin, color: tokens.critical },
      { gte: band.criticalMin, lt: band.warningMin, color: tokens.warning },
      { gte: band.warningMin, lte: band.warningMax, color },
      { gt: band.warningMax, lte: band.criticalMax, color: tokens.warning },
      { gt: band.criticalMax, color: tokens.critical },
    ],
  };
}

/** Latest sample per series, formatted for the legend's live readout. */
function lastValueByLabel(
  series: readonly ChartSeries[],
  locale: string,
): ReadonlyMap<string, string> {
  const format = new Intl.NumberFormat(locale, VALUE_OPTIONS);
  return new Map(
    series
      .filter((entry) => entry.v.length > 0)
      .map((entry) => {
        const value = format.format(entry.v[entry.v.length - 1]);
        return [entry.label, entry.unit ? `${value} ${entry.unit}` : value];
      }),
  );
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character] ?? character,
  );
}

/** Where a reading stands against its band; `null` when the series carries no band. */
function severityOf(
  value: number,
  band: SeriesThresholdBand | undefined,
): 'warning' | 'critical' | null {
  if (!band) {
    return null;
  }
  if (value < band.criticalMin || value > band.criticalMax) {
    return 'critical';
  }
  return value < band.warningMin || value > band.warningMax ? 'warning' : null;
}

function tooltipFormatter(
  units: ReadonlyMap<string, string>,
  thresholds: ChartThresholds | undefined,
  locale: string,
  tokens: ChartThemeTokens,
): TooltipComponentOption['formatter'] {
  const timestampFormat = new Intl.DateTimeFormat(locale, TIMESTAMP_OPTIONS);
  const valueFormat = new Intl.NumberFormat(locale, VALUE_OPTIONS);
  return (params) => {
    const rows = Array.isArray(params) ? params : [params];
    const first = rows[0];
    if (!first || !Array.isArray(first.value)) {
      return '';
    }
    const heading =
      `<div style="font-family:${FONT_MONO};font-size:11px;color:${tokens.muted};` +
      `margin-bottom:4px;">${escapeHtml(timestampFormat.format(Number(first.value[0])))}</div>`;
    const lines = rows.map((row) => {
      const value = Array.isArray(row.value) ? Number(row.value[1]) : Number(row.value);
      const name = String(row.seriesName ?? '');
      const unit = units.get(name) ?? '';
      const unitSuffix = unit
        ? ` <span style="font-size:10px;color:${tokens.muted};">${escapeHtml(unit)}</span>`
        : '';
      // A reading outside its band speaks in the severity ink, matching the line under it.
      const severity = severityOf(value, thresholds?.[String(row.seriesId ?? '')]);
      const valueColor =
        severity === 'critical'
          ? tokens.critical
          : severity === 'warning'
            ? tokens.warning
            : tokens.text;
      return (
        '<div style="display:flex;align-items:center;justify-content:space-between;' +
        'gap:16px;line-height:1.7;">' +
        `<span style="display:inline-flex;align-items:center;">${row.marker ?? ''}` +
        `<span style="font-family:${FONT_SANS};font-size:12px;">${escapeHtml(name)}</span></span>` +
        `<span style="font-family:${FONT_MONO};font-size:12px;color:${valueColor};` +
        `font-variant-numeric:tabular-nums;">${valueFormat.format(value)}${unitSuffix}</span>` +
        '</div>'
      );
    });
    return heading + lines.join('');
  };
}

export function buildChartOption(input: ChartOptionInput): MeasurementChartOption {
  const { series, thresholds, tokens, locale } = input;
  const axes = groupByUnit(series, thresholds);
  const axisIndexByUnit = new Map(axes.map((axis, index) => [axis.unit, index]));
  const leftCount = Math.ceil(axes.length / 2);
  const rightCount = Math.floor(axes.length / 2);
  const compactLeft = COMPACT_AXIS_GUTTER + (axes.length > 0 ? COMPACT_AXIS_WIDTH : 0);
  const compactRight = COMPACT_AXIS_GUTTER + (axes.length > 1 ? COMPACT_AXIS_WIDTH : 0);
  const lastValues = lastValueByLabel(series, locale);
  const severityMaps = series.flatMap((entry, index) => {
    const band = thresholds?.[entry.id];
    return band ? [severityMap(band, index, entry.color, tokens)] : [];
  });
  const chartAxes = axes.map((axis, index) => ({
    type: 'value' as const,
    name: axis.unit,
    nameGap: AXIS_NAME_GAP,
    nameTextStyle: { color: tokens.muted, fontFamily: FONT_MONO, fontSize: 10 },
    min: axis.min,
    max: axis.max,
    ...axisPlacement(index),
    axisLabel: {
      color: tokens.muted,
      fontFamily: FONT_MONO,
      fontSize: 11,
      hideOverlap: true,
      formatter: (value: number) => String(trimFloat(value)),
    },
    axisLine: { show: true, lineStyle: { color: tokens.hairline } },
    axisTick: { show: false },
    // A single grid of horizontal lines stays readable; one per unit would overlay four of them.
    splitLine: { show: index === 0, lineStyle: { color: tokens.hairline } },
  }));
  const chartSeries = series.map((entry) => {
    const unitIndex = axisIndexByUnit.get(entry.unit) ?? 0;
    const band = thresholds?.[entry.id];
    return {
      id: entry.id,
      name: entry.label,
      type: 'line' as const,
      yAxisIndex: unitIndex,
      // A one-point series draws no line segment, so the marker is the only thing that shows.
      // With showSymbol off, ECharts still surfaces the symbol on axis-pointer hover.
      showSymbol: entry.t.length === 1,
      symbolSize: 5,
      sampling: 'lttb' as const,
      lineStyle: { width: 1.6, color: entry.color },
      itemStyle: { color: entry.color },
      emphasis: { focus: 'series' as const },
      data: entry.t.map((timestamp, index) => [timestamp, entry.v[index]]),
      markLine: band ? thresholdLines(band, tokens) : undefined,
      // Zones are a single-series privilege: four bands' washes stacked on one plot mud the
      // whole scene. With company, excursions still speak through the piecewise line tinting.
      markArea:
        band && series.length === 1 ? severityZones(band, axes[unitIndex], tokens) : undefined,
    };
  });
  // Media branches only identify the complete replaceMerge collection. Repeating the full
  // options here makes ECharts clone every data array once per branch on each live update.
  const mediaSeries = chartSeries.map(({ id }) => ({ id })) satisfies readonly Pick<
    LineSeriesOption,
    'id'
  >[];
  const wideGrid = {
    left: AXIS_GUTTER + leftCount * AXIS_WIDTH,
    right: AXIS_GUTTER + rightCount * AXIS_WIDTH,
  };
  const dataZoom: DataZoomComponentOption[] = [
    {
      type: 'inside',
      xAxisIndex: 0,
      filterMode: 'none',
      // The chart sits mid-page. ECharts swallows every wheel event it acts on, so an unmodified
      // wheel has to be left alone or scrolling past the chart traps the page.
      zoomOnMouseWheel: 'ctrl',
      moveOnMouseWheel: false,
      // Dragging the plot draws a selection (the component's own brush overlay);
      // panning lives on the slider below. Touch pinch still zooms through this component.
      moveOnMouseMove: false,
    },
    {
      type: 'slider',
      xAxisIndex: 0,
      filterMode: 'none',
      height: 18,
      bottom: 12,
      backgroundColor: 'transparent',
      borderColor: tokens.hairline,
      fillerColor: withAlpha(tokens.accent, ACCENT_WINDOW_ALPHA),
      dataBackground: {
        lineStyle: { color: tokens.hairlineStrong, width: 1 },
        areaStyle: { color: tokens.hairline },
      },
      selectedDataBackground: {
        lineStyle: { color: tokens.accent, width: 1 },
        areaStyle: { color: withAlpha(tokens.accent, ACCENT_WINDOW_ALPHA) },
      },
      handleStyle: { color: tokens.surface, borderColor: tokens.hairlineStrong },
      moveHandleSize: 0,
      textStyle: { color: tokens.muted, fontFamily: FONT_MONO, fontSize: 10 },
    },
  ];

  return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: { color: tokens.text, fontFamily: FONT_SANS },
    grid: {
      top: GRID_TOP,
      bottom: GRID_BOTTOM,
      ...wideGrid,
    },
    legend: {
      top: 4,
      right: 8,
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 16,
      inactiveColor: tokens.hairlineStrong,
      textStyle: {
        color: tokens.muted,
        fontFamily: FONT_SANS,
        fontSize: 12,
        rich: {
          value: {
            color: tokens.text,
            fontFamily: FONT_MONO,
            fontSize: 12,
            padding: [0, 0, 0, 6],
          },
        },
      },
      // The legend doubles as the live readout: each entry carries its latest sample, so the
      // current state is readable without hunting line ends across four axes.
      formatter: (name: string) => {
        const value = lastValues.get(name);
        return value ? `${name}{value|${value}}` : name;
      },
      data: series.map((entry) => entry.label),
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: tokens.surface,
      borderColor: tokens.hairline,
      borderWidth: 1,
      padding: [8, 10],
      // The default tooltip carries a drop shadow; the panel look is border + radius only.
      extraCssText: 'box-shadow: none; border-radius: 8px;',
      textStyle: { color: tokens.text, fontFamily: FONT_SANS, fontSize: 12 },
      axisPointer: {
        type: 'cross',
        lineStyle: { color: tokens.hairlineStrong, width: 1 },
        crossStyle: { color: tokens.hairlineStrong, width: 1 },
        label: {
          backgroundColor: tokens.surface,
          borderColor: tokens.hairline,
          borderWidth: 1,
          color: tokens.text,
          fontFamily: FONT_MONO,
          fontSize: 10,
          padding: [3, 6],
        },
      },
      formatter: tooltipFormatter(
        new Map(series.map((entry) => [entry.label, entry.unit])),
        thresholds,
        locale,
        tokens,
      ),
    },
    visualMap: severityMaps,
    xAxis: {
      type: 'time',
      axisLabel: { color: tokens.muted, fontFamily: FONT_MONO, fontSize: 11, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.hairline } },
      axisTick: { lineStyle: { color: tokens.hairline } },
      splitLine: { show: false },
    },
    yAxis: chartAxes,
    dataZoom,
    media: [
      {
        query: { maxWidth: COMPACT_MAX_WIDTH },
        option: {
          grid: { left: compactLeft, right: compactRight },
          legend: { type: 'scroll', left: 8, right: 8 },
          // replaceMerge also applies inside media options, so every replaced collection is complete.
          yAxis: chartAxes.map((axis, index) =>
            index < 2
              ? {
                  ...axis,
                  show: true,
                  offset: 0,
                  nameGap: 4,
                  axisLabel: { ...axis.axisLabel, fontSize: 10 },
                }
              : { ...axis, show: false, offset: 0 },
          ),
          series: mediaSeries,
          dataZoom,
        },
      },
      {
        // ECharts retains the previous media overlay unless the default branch restores it.
        option: {
          grid: wideGrid,
          legend: { type: 'plain', left: 'auto', right: 8 },
          yAxis: chartAxes.map((axis) => ({ ...axis, show: true })),
          series: mediaSeries,
          dataZoom,
        },
      },
    ],
    series: chartSeries,
  };
}

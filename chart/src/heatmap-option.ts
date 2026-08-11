import type { HeatmapSeriesOption } from 'echarts/charts';
import type {
  GridComponentOption,
  TooltipComponentOption,
  VisualMapComponentOption,
} from 'echarts/components';
import type { ComposeOption } from 'echarts/core';
import type { ChartThemeTokens } from './chart-option';
import type { HeatmapMatrix } from './types';

export type CycleHeatmapOption = ComposeOption<
  HeatmapSeriesOption | GridComponentOption | TooltipComponentOption | VisualMapComponentOption
>;

export interface HeatmapOptionInput {
  readonly matrix: HeatmapMatrix;
  readonly tokens: ChartThemeTokens;
  readonly locale: string;
}

const FONT_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const FONT_SANS = "'Geist Sans', ui-sans-serif, system-ui, 'Segoe UI', sans-serif";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const VALUE_OPTIONS: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };
/** Weekday first: the point of the matrix is spotting weekly rhythm, not reading dates. */
const DAY_OPTIONS: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'numeric' };

/** Right column: the magnitude legend. Wide enough for the min/max readouts beside the bar. */
const LEGEND_WIDTH = 56;
/**
 * Below this canvas width 24 hourly columns collapse into slivers a finger cannot read or hit,
 * so the compact scene pairs them into 12 two-hour columns. The query observes the canvas
 * itself (ECharts media), so shell and panel padding are already accounted for.
 */
export const HEATMAP_COMPACT_MAX_WIDTH = 480;

/**
 * A heatmap cell crossing into ECharts: column, row, reading, then the hour window the reading
 * summarises (`hourStart`, `hourSpan`). The trailing pair exists because the tooltip formatter
 * serves both the hourly and the paired scene and cannot tell which one is active any other way.
 */
export type HeatmapCell = readonly [
  x: number,
  day: number,
  value: number,
  hourStart: number,
  hourSpan: number,
];

/**
 * Pairs hourly means into two-hour means, day by day. A half-empty pair keeps its one real
 * sample; a fully empty pair stays a gap — `null` never becomes zero on the way through.
 */
export function pairHourlyValues(
  values: readonly (number | null)[],
): readonly (number | null)[] {
  const paired: (number | null)[] = [];
  for (let index = 0; index < values.length; index += 2) {
    const first = values[index] ?? null;
    const second = values[index + 1] ?? null;
    if (first === null && second === null) {
      paired.push(null);
    } else if (first === null) {
      paired.push(second);
    } else if (second === null) {
      paired.push(first);
    } else {
      paired.push((first + second) / 2);
    }
  }
  return paired;
}

function toCells(values: readonly (number | null)[], columns: number, hourSpan: number): HeatmapCell[] {
  const cells: HeatmapCell[] = [];
  values.forEach((value, index) => {
    if (value !== null) {
      const column = index % columns;
      cells.push([column, Math.floor(index / columns), value, column * hourSpan, hourSpan]);
    }
  });
  return cells;
}

function channel(hex: string, at: number): number {
  return parseInt(hex.replace('#', '').slice(at, at + 2), 16);
}

/** Linear RGB mix — good enough for stepping one hue between two anchors of the same family. */
function mix(from: string, to: string, amount: number): string {
  const parts = [0, 2, 4].map((at) => {
    const value = Math.round(channel(from, at) + (channel(to, at) - channel(from, at)) * amount);
    return value.toString(16).padStart(2, '0');
  });
  return `#${parts.join('')}`;
}

/**
 * A sequential ramp is one hue, light→dark (dataviz doctrine): the series' catalogue hue is
 * anchored near the surface at the cool end and deepened toward ink at the hot end. Both ends
 * stay recognisably the series' colour, so the heatmap and the line chart read as one family.
 */
export function magnitudeRamp(color: string, tokens: ChartThemeTokens): string[] {
  const faint = mix(color, tokens.surface, 0.82);
  const deep = mix(color, tokens.text, 0.35);
  return [faint, mix(color, tokens.surface, 0.55), mix(color, tokens.surface, 0.25), color, deep];
}

function bounds(values: readonly (number | null)[]): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value === null) {
      continue;
    }
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }
  // A flat day still needs a non-empty span for the continuous map to lay out.
  return max > min ? { min, max } : { min: min - 1, max: max + 1 };
}

export function buildHeatmapOption(input: HeatmapOptionInput): CycleHeatmapOption {
  const { matrix, tokens, locale } = input;
  const dayFormat = new Intl.DateTimeFormat(locale, DAY_OPTIONS);
  const valueFormat = new Intl.NumberFormat(locale, VALUE_OPTIONS);
  const dayLabels = matrix.days.map((day) => dayFormat.format(day));
  const { min, max } = bounds(matrix.values);

  const cells = toCells(matrix.values, 24, 1);
  // The paired scene is precomputed here because ECharts media queries can swap series data but
  // cannot run a transform: both variants have to exist before the width is known.
  const pairedCells = toCells(pairHourlyValues(matrix.values), 12, 2);

  return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: { color: tokens.text, fontFamily: FONT_SANS },
    grid: { top: 10, bottom: 28, left: 74, right: LEGEND_WIDTH + 16 },
    tooltip: {
      backgroundColor: tokens.surface,
      borderColor: tokens.hairline,
      borderWidth: 1,
      padding: [8, 10],
      extraCssText: 'box-shadow: none; border-radius: 8px;',
      textStyle: { color: tokens.text, fontFamily: FONT_SANS, fontSize: 12 },
      formatter: (params) => {
        const single = Array.isArray(params) ? params[0] : params;
        const value = single?.value;
        if (!Array.isArray(value)) {
          return '';
        }
        const [column, dayIndex, reading] = value as [number, number, number];
        // Cells carry their hour window (see HeatmapCell): in the paired scene the column index
        // alone would misname the window. Bare three-part tuples stay hourly.
        const hour = typeof value[3] === 'number' ? (value[3] as number) : column;
        const lastHour = value[4] === 2 ? hour + 1 : hour;
        const day = dayLabels[dayIndex] ?? '';
        const window = `${String(hour).padStart(2, '0')}:00–${String(lastHour).padStart(2, '0')}:59`;
        return (
          `<div style="font-family:${FONT_MONO};font-size:11px;color:${tokens.muted};` +
          `margin-bottom:4px;">${day} · ${window}</div>` +
          `<div style="font-family:${FONT_MONO};font-size:12px;` +
          `font-variant-numeric:tabular-nums;">${valueFormat.format(reading)}` +
          ` <span style="font-size:10px;color:${tokens.muted};">${matrix.unit}</span></div>`
        );
      },
    },
    xAxis: {
      type: 'category',
      data: HOURS.map((hour) => String(hour).padStart(2, '0')),
      axisLabel: {
        color: tokens.muted,
        fontFamily: FONT_MONO,
        fontSize: 10,
        interval: 2,
      },
      axisLine: { lineStyle: { color: tokens.hairline } },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'category',
      // Days arrive oldest-first and a category axis stacks upward, so today lands on top —
      // the room reads the newest row first, history below, like every journal in the app.
      data: dayLabels,
      axisLabel: { color: tokens.muted, fontFamily: FONT_MONO, fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    visualMap: {
      type: 'continuous',
      min,
      max,
      calculable: false,
      orient: 'vertical',
      right: 0,
      top: 'center',
      itemWidth: 10,
      itemHeight: 120,
      // Cells carry the hour window behind the reading (HeatmapCell), and a continuous map
      // defaults to the LAST dimension — magnitude must be pinned to the reading explicitly.
      dimension: 2,
      text: [valueFormat.format(max), valueFormat.format(min)],
      textStyle: { color: tokens.muted, fontFamily: FONT_MONO, fontSize: 10 },
      inRange: { color: magnitudeRamp(matrix.color, tokens) },
    },
    media: [
      {
        query: { maxWidth: HEATMAP_COMPACT_MAX_WIDTH },
        option: {
          xAxis: [
            {
              data: HOURS.filter((hour) => hour % 2 === 0).map((hour) =>
                String(hour).padStart(2, '0'),
              ),
              // 12 columns at phone width: every second label (00, 04, …) keeps the axis legible.
              axisLabel: { interval: 1 },
            },
          ],
          series: [{ data: pairedCells.map((cell) => [...cell]) }],
        },
      },
    ],
    series: [
      {
        type: 'heatmap',
        name: matrix.label,
        data: cells.map((cell) => [...cell]),
        // The 1px surface seam between cells — the canvas twin of the 2px fill gap rule.
        itemStyle: { borderColor: tokens.surface, borderWidth: 1, borderRadius: 2 },
        emphasis: { itemStyle: { borderColor: tokens.text, borderWidth: 1 } },
      },
    ],
  };
}

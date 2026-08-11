<script setup lang="ts">
import { init, type ECharts } from 'echarts/core';
import { computed, onBeforeUnmount, onMounted, ref, useHost, watch } from 'vue';
import { buildChartOption, GRID_BOTTOM, GRID_TOP, themeTokens } from '../chart-option';
import '../echarts-setup';
import type {
  ChartLabels,
  ChartSeries,
  ChartTheme,
  ChartThresholds,
  RangeSelectedDetail,
} from '../types';

const props = withDefaults(
  defineProps<{
    series?: readonly ChartSeries[];
    thresholds?: ChartThresholds;
    labels?: ChartLabels;
    theme?: ChartTheme;
    locale?: string;
    loading?: boolean;
    resetKey?: number;
  }>(),
  { series: () => [], theme: 'light', locale: 'en', loading: false, resetKey: 0 },
);

/** Wheel zooming fires continuously; only the window the user settles on is worth reporting. */
const ZOOM_SETTLE_MS = 260;
const REPLACED_COMPONENTS = ['series', 'yAxis'] as const;
/** Anything narrower is a click with a shaky hand, not a selection. */
const BRUSH_MIN_PX = 8;

const host = useHost();
const canvas = ref<HTMLElement | null>(null);

let chart: ECharts | null = null;
let observer: ResizeObserver | null = null;
let renderFrame: number | undefined;
let mounted = false;
let settleTimer: ReturnType<typeof setTimeout> | undefined;
let programmatic = false;
let dragging = false;
let settlePending = false;
let lastEmitted: RangeSelectedDetail | null = null;
let rangeResponsePending = false;
let resetZoomOnRender = false;

const isEmpty = computed(() => props.series.every((entry) => entry.t.length === 0));

const overlayMessage = computed(() => {
  if (props.loading) {
    return props.labels?.loading ?? 'Loading…';
  }
  return isEmpty.value ? (props.labels?.empty ?? 'No data') : '';
});

/** The canvas exposes no text, so the series names have to be spelled out for assistive tech. */
const ariaLabel = computed(() => {
  const description = props.labels?.ariaLabel ?? 'Measurements over time';
  const names = props.series.map((entry) => entry.label).filter(Boolean);
  return names.length > 0 ? `${description}: ${names.join(', ')}` : description;
});

const extent = computed(() => {
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  for (const entry of props.series) {
    if (entry.t.length === 0) {
      continue;
    }
    from = Math.min(from, entry.t[0]);
    to = Math.max(to, entry.t[entry.t.length - 1]);
  }
  return Number.isFinite(from) && Number.isFinite(to) && to > from ? { from, to } : null;
});

/** ECharts resolves the locale at construction time, so a language switch needs a fresh instance. */
function echartsLocale(locale: string): string {
  return locale.toLowerCase().startsWith('pl') ? 'PL' : 'EN';
}

function createChart(): void {
  if (!canvas.value) {
    return;
  }
  chart = init(canvas.value, null, { locale: echartsLocale(props.locale) });
  chart.on('datazoom', onZoom);
  scheduleRender();
}

function destroyChart(): void {
  cancelScheduledRender();
  chart?.off('datazoom', onZoom);
  chart?.dispose();
  chart = null;
  lastEmitted = null;
}

function renderNow(): void {
  if (!chart) {
    return;
  }
  const replaceZoom = resetZoomOnRender;
  resetZoomOnRender = false;
  withSuppressedZoomEvents(() => {
    chart?.setOption(
      buildChartOption({
        series: props.series,
        thresholds: props.thresholds,
        tokens: themeTokens(props.theme),
        locale: props.locale,
      }),
      // Ordinary live updates retain the local zoom. The first dataset returned for a selected
      // backend range also replaces dataZoom, making that new range the slider's full 0–100%
      // extent instead of applying the old percentages a second time.
      {
        replaceMerge: replaceZoom ? [...REPLACED_COMPONENTS, 'dataZoom'] : [...REPLACED_COMPONENTS],
      },
    );
    lastEmitted = null;
  });
}

function resetZoom(): void {
  chart?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
}

/**
 * Angular owns drill-down history, so a chart-only reset would leave the backend range narrowed.
 * Double-click clears the local window, then asks the owner to reload the history's first range.
 */
function requestRestore(): void {
  resetZoom();
  host?.dispatchEvent(new CustomEvent('restoreRequested'));
}

/* ——— Select-to-zoom: dragging across the plot draws a window that becomes the zoom. Built on
   public APIs (convertToPixel/convertFromPixel + the dataZoom action) rather than the toolbox's
   dataZoomSelect cursor, whose hidden-toolbox arming is undocumented and brittle. ——— */

const brush = ref<{ readonly from: number; readonly to: number } | null>(null);
let brushPointer: number | null = null;

/** The grid band in host pixels, from the axis extent — the overlay must never cover an axis. */
function plotBand(): { left: number; right: number } | null {
  const bounds = extent.value;
  if (!chart || !bounds) {
    return null;
  }
  const left = chart.convertToPixel({ xAxisIndex: 0 }, bounds.from);
  const right = chart.convertToPixel({ xAxisIndex: 0 }, bounds.to);
  return Number.isFinite(left) && Number.isFinite(right) && right > left ? { left, right } : null;
}

function brushX(event: PointerEvent): number {
  const rect = canvas.value?.getBoundingClientRect();
  return rect ? event.clientX - rect.left : 0;
}

function onBrushDown(event: PointerEvent): void {
  // Touch keeps its native gestures (pinch zooms, the page scrolls); the brush is for pointers
  // that can afford to spend a drag. The slider strip below the grid stays ECharts' own.
  if (event.button !== 0 || event.pointerType === 'touch' || brushPointer !== null) {
    return;
  }
  const rect = canvas.value?.getBoundingClientRect();
  const band = plotBand();
  if (!rect || !band) {
    return;
  }
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  if (y < GRID_TOP || y > rect.height - GRID_BOTTOM || x < band.left || x > band.right) {
    return;
  }
  brushPointer = event.pointerId;
  brush.value = { from: x, to: x };
  // jsdom (and some embedders) ship no pointer capture; tracking works without it.
  canvas.value?.setPointerCapture?.(event.pointerId);
}

function onBrushMove(event: PointerEvent): void {
  if (brushPointer !== event.pointerId || !brush.value) {
    return;
  }
  const band = plotBand();
  if (!band) {
    return;
  }
  brush.value = {
    from: brush.value.from,
    to: Math.min(band.right, Math.max(band.left, brushX(event))),
  };
}

function onBrushUp(event: PointerEvent): void {
  if (brushPointer !== event.pointerId) {
    return;
  }
  const selection = brush.value;
  cancelBrush();
  if (!chart || !selection || Math.abs(selection.to - selection.from) < BRUSH_MIN_PX) {
    return;
  }
  const [fromPx, toPx] = [selection.from, selection.to].sort((a, b) => a - b);
  const startValue = chart.convertFromPixel({ xAxisIndex: 0 }, fromPx);
  const endValue = chart.convertFromPixel({ xAxisIndex: 0 }, toPx);
  if (!Number.isFinite(startValue) || !Number.isFinite(endValue) || endValue <= startValue) {
    return;
  }
  // Flows through the normal zoom pipeline: onZoom → settle → rangeSelected upward.
  chart.dispatchAction({ type: 'dataZoom', startValue, endValue });
}

function cancelBrush(): void {
  brushPointer = null;
  brush.value = null;
}

function onBrushKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    cancelBrush();
  }
}

/** Geometry for the selection overlay; the band clamp happened while tracking. */
const brushBox = computed(() => {
  const selection = brush.value;
  if (!selection) {
    return null;
  }
  const left = Math.min(selection.from, selection.to);
  return { left: `${left}px`, width: `${Math.abs(selection.to - selection.from)}px` };
});

const gridInset = { top: `${GRID_TOP}px`, bottom: `${GRID_BOTTOM}px` };

function scheduleRender(): void {
  if (!mounted || renderFrame !== undefined) {
    return;
  }
  renderFrame = requestAnimationFrame(() => {
    renderFrame = undefined;
    renderNow();
  });
}

function cancelScheduledRender(): void {
  if (renderFrame === undefined) {
    return;
  }
  cancelAnimationFrame(renderFrame);
  renderFrame = undefined;
}

/** ECharts dispatches zoom events asynchronously, so the guard has to outlive the current task. */
function withSuppressedZoomEvents(action: () => void): void {
  programmatic = true;
  action();
  setTimeout(() => {
    programmatic = false;
  });
}

interface ZoomState {
  readonly start?: number;
  readonly end?: number;
  readonly startValue?: number;
  readonly endValue?: number;
}

function selectedWindow(): RangeSelectedDetail | null {
  const bounds = extent.value;
  if (!chart || !bounds) {
    return null;
  }
  const [zoom] = (chart.getOption() as { dataZoom?: readonly ZoomState[] }).dataZoom ?? [];
  if (!zoom) {
    return null;
  }
  const span = bounds.to - bounds.from;
  const rawFrom = Number.isFinite(zoom.startValue)
    ? Number(zoom.startValue)
    : bounds.from + (span * (zoom.start ?? 0)) / 100;
  const rawTo = Number.isFinite(zoom.endValue)
    ? Number(zoom.endValue)
    : bounds.from + (span * (zoom.end ?? 100)) / 100;
  // A time axis snaps to round ticks past the last sample, so an untrimmed window would ask the
  // backend for time that has not happened yet.
  const from = Math.max(bounds.from, Math.round(rawFrom));
  const to = Math.min(bounds.to, Math.round(rawTo));
  return to > from ? { from, to } : null;
}

function onZoom(): void {
  if (programmatic) {
    return;
  }
  clearTimeout(settleTimer);
  settleTimer = setTimeout(settle, ZOOM_SETTLE_MS);
}

function onDragStart(): void {
  dragging = true;
}

/** Dragging the zoom slider reports a new window on every frame; only the released one counts. */
function onDragEnd(): void {
  dragging = false;
  if (settlePending) {
    settlePending = false;
    settle();
  }
}

function settle(): void {
  if (dragging) {
    settlePending = true;
    return;
  }
  clearTimeout(settleTimer);
  const bounds = extent.value;
  const selection = selectedWindow();
  if (!bounds || !selection) {
    return;
  }
  const tolerance = Math.max(1, (bounds.to - bounds.from) / 1000);
  const coversEverything =
    selection.from - bounds.from <= tolerance && bounds.to - selection.to <= tolerance;
  const repeated = lastEmitted?.from === selection.from && lastEmitted?.to === selection.to;
  if (coversEverything || repeated) {
    return;
  }
  lastEmitted = selection;
  rangeResponsePending = true;
  host?.dispatchEvent(new CustomEvent<RangeSelectedDetail>('rangeSelected', { detail: selection }));
}

onMounted(() => {
  mounted = true;
  if (!canvas.value) {
    return;
  }
  createChart();
  canvas.value.addEventListener('pointerdown', onDragStart);
  canvas.value.addEventListener('dblclick', requestRestore);
  canvas.value.addEventListener('lostpointercapture', onDragEnd);
  canvas.value.addEventListener('pointerdown', onBrushDown);
  canvas.value.addEventListener('pointermove', onBrushMove);
  canvas.value.addEventListener('pointerup', onBrushUp);
  canvas.value.addEventListener('pointercancel', cancelBrush);
  window.addEventListener('keydown', onBrushKey);
  window.addEventListener('pointerup', onDragEnd);
  window.addEventListener('pointercancel', onDragEnd);
  window.addEventListener('blur', onDragEnd);
  observer = new ResizeObserver(() => chart?.resize());
  observer.observe(canvas.value);
  // Canvas text measured before the webfonts arrive keeps the fallback metrics forever, so the
  // scene repaints once after the document's fonts settle. After unmount `chart` is null: no-op.
  void document.fonts?.ready.then(() => scheduleRender());
});

onBeforeUnmount(() => {
  mounted = false;
  clearTimeout(settleTimer);
  canvas.value?.removeEventListener('pointerdown', onDragStart);
  canvas.value?.removeEventListener('dblclick', requestRestore);
  canvas.value?.removeEventListener('lostpointercapture', onDragEnd);
  canvas.value?.removeEventListener('pointerdown', onBrushDown);
  canvas.value?.removeEventListener('pointermove', onBrushMove);
  canvas.value?.removeEventListener('pointerup', onBrushUp);
  canvas.value?.removeEventListener('pointercancel', cancelBrush);
  window.removeEventListener('keydown', onBrushKey);
  window.removeEventListener('pointerup', onDragEnd);
  window.removeEventListener('pointercancel', onDragEnd);
  window.removeEventListener('blur', onDragEnd);
  observer?.disconnect();
  observer = null;
  destroyChart();
});

watch(
  () => props.series,
  () => {
    if (rangeResponsePending) {
      rangeResponsePending = false;
      resetZoomOnRender = true;
    }
    scheduleRender();
  },
);

watch(() => props.thresholds, scheduleRender);
watch(() => props.resetKey, resetZoom);

watch(
  () => props.locale,
  () => {
    destroyChart();
    createChart();
  },
);

// Scene colours derive from the theme prop directly, so a flip is just a repaint.
watch(() => props.theme, scheduleRender);
</script>

<template>
  <div class="chart">
    <div ref="canvas" class="chart__canvas" role="img" :aria-label="ariaLabel"></div>

    <div
      v-if="brushBox"
      class="chart__brush"
      :style="{ ...brushBox, top: gridInset.top, bottom: gridInset.bottom }"
      aria-hidden="true"
    ></div>

    <p v-if="overlayMessage" class="chart__overlay" role="status">{{ overlayMessage }}</p>
  </div>
</template>

<style src="./MeasurementChart.host.css"></style>

<style scoped src="./MeasurementChart.css"></style>

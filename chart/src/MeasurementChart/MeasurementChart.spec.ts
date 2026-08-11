// @vitest-environment jsdom

import { defineCustomElement, nextTick } from 'vue';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import MeasurementChart from './MeasurementChart.vue';
import type { ChartSeries, ChartThresholds } from '../types';

const echarts = vi.hoisted(() => ({ init: vi.fn() }));

vi.mock('echarts/core', () => ({ init: echarts.init }));
vi.mock('../echarts-setup', () => ({}));

const TAG_NAME = 'test-measurement-chart';
const SERIES: ChartSeries = {
  id: 'temperature',
  label: 'Temperature',
  unit: '°C',
  color: '#f5764a',
  t: [1_000, 2_000, 3_000],
  v: [20, 21, 22],
};

interface ChartElement extends HTMLElement {
  series: readonly ChartSeries[];
  thresholds?: ChartThresholds;
  resetKey: number;
}

let frames: Map<number, FrameRequestCallback>;
let nextFrameId: number;
let dataZoomHandler: (() => void) | undefined;

const chart = {
  setOption: vi.fn(),
  getOption: vi.fn(() => ({ dataZoom: [{ start: 20, end: 80 }] })),
  dispatchAction: vi.fn(),
  // Pixel↔value maps for the brush: 1px = 10ms over the mock extent, grid band 40..360px.
  convertToPixel: vi.fn((_finder: unknown, value: number) => 40 + (value - 1_000) / 10),
  convertFromPixel: vi.fn((_finder: unknown, px: number) => 1_000 + (px - 40) * 10),
  resize: vi.fn(),
  dispose: vi.fn(),
  off: vi.fn(),
  on: vi.fn((event: string, handler: () => void) => {
    if (event === 'datazoom') {
      dataZoomHandler = handler;
    }
  }),
};

beforeAll(() => {
  if (!customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, defineCustomElement(MeasurementChart, { shadowRoot: false }));
  }
});

beforeEach(() => {
  vi.useFakeTimers();
  frames = new Map();
  nextFrameId = 1;
  dataZoomHandler = undefined;
  echarts.init.mockReturnValue(chart);
  for (const method of Object.values(chart)) {
    method.mockClear();
  }

  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      const id = nextFrameId++;
      frames.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => {
      frames.delete(id);
    }),
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return;
      }
      disconnect(): void {
        return;
      }
    },
  );
});

afterEach(async () => {
  document.body.replaceChildren();
  await nextTick();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  echarts.init.mockReset();
});

async function mountChart(): Promise<ChartElement> {
  const element = document.createElement(TAG_NAME) as ChartElement;
  element.series = [SERIES];
  document.body.append(element);
  await nextTick();
  return element;
}

function flushFrames(): void {
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) {
    callback(performance.now());
  }
}

describe('MeasurementChart rendering', () => {
  it('batches prop changes into one incremental ECharts update', async () => {
    const element = await mountChart();
    flushFrames();
    vi.runOnlyPendingTimers();
    chart.setOption.mockClear();

    element.series = [{ ...SERIES, v: [21, 22, 23] }];
    element.thresholds = {
      temperature: { warningMin: 10, warningMax: 30, criticalMin: 5, criticalMax: 35 },
    };
    await nextTick();

    expect(frames.size).toBe(1);
    flushFrames();

    expect(chart.setOption).toHaveBeenCalledOnce();
    const options = chart.setOption.mock.calls[0][1];
    expect(options).toEqual({ replaceMerge: ['series', 'yAxis'] });
    expect(options).not.toHaveProperty('notMerge');
  });

  it('makes a selected backend range the full zoom extent of its response', async () => {
    const element = await mountChart();
    flushFrames();
    vi.runOnlyPendingTimers();

    const selected: CustomEvent[] = [];
    element.addEventListener('rangeSelected', (event) => selected.push(event as CustomEvent));
    dataZoomHandler?.();
    vi.advanceTimersByTime(260);
    expect(selected[0]?.detail).toEqual({ from: 1_400, to: 2_600 });

    chart.setOption.mockClear();
    element.series = [
      {
        ...SERIES,
        t: [1_400, 2_000, 2_600],
        v: [20.4, 21, 21.6],
      },
    ];
    await nextTick();
    flushFrames();

    expect(chart.setOption).toHaveBeenCalledOnce();
    expect(chart.setOption.mock.calls[0][1]).toEqual({
      replaceMerge: ['series', 'yAxis', 'dataZoom'],
    });

    chart.setOption.mockClear();
    element.series = [{ ...element.series[0], v: [20.5, 21.1, 21.7] }];
    await nextTick();
    flushFrames();

    expect(chart.setOption.mock.calls[0][1]).toEqual({
      replaceMerge: ['series', 'yAxis'],
    });
  });
});

function pointer(type: string, x: number, y: number, pointerType = 'mouse'): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX: x, clientY: y, pointerId: 7, pointerType, button: 0 });
  return event;
}

describe('MeasurementChart select-to-zoom', () => {
  it('turns a plot drag into a value-window zoom action', async () => {
    const element = await mountChart();
    flushFrames();
    vi.runOnlyPendingTimers();
    const canvas = element.querySelector<HTMLElement>('.chart__canvas');
    if (!canvas) {
      throw new Error('chart canvas missing');
    }
    // jsdom boxes are zero-sized; the brush reads the rect, so give it a real one.
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 320, right: 400, bottom: 320 }) as DOMRect;
    chart.dispatchAction.mockClear();

    canvas.dispatchEvent(pointer('pointerdown', 100, 120));
    canvas.dispatchEvent(pointer('pointermove', 200, 120));
    canvas.dispatchEvent(pointer('pointerup', 200, 120));

    expect(chart.dispatchAction).toHaveBeenCalledWith({
      type: 'dataZoom',
      startValue: 1_600,
      endValue: 2_600,
    });
  });

  it('treats a sub-threshold drag as a click, not a selection', async () => {
    const element = await mountChart();
    flushFrames();
    vi.runOnlyPendingTimers();
    const canvas = element.querySelector<HTMLElement>('.chart__canvas');
    if (!canvas) {
      throw new Error('chart canvas missing');
    }
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 320, right: 400, bottom: 320 }) as DOMRect;
    chart.dispatchAction.mockClear();

    canvas.dispatchEvent(pointer('pointerdown', 100, 120));
    canvas.dispatchEvent(pointer('pointermove', 104, 120));
    canvas.dispatchEvent(pointer('pointerup', 104, 120));

    expect(chart.dispatchAction).not.toHaveBeenCalled();
  });

  it('leaves touch drags to native gestures instead of brushing', async () => {
    const element = await mountChart();
    flushFrames();
    vi.runOnlyPendingTimers();
    const canvas = element.querySelector<HTMLElement>('.chart__canvas');
    if (!canvas) {
      throw new Error('chart canvas missing');
    }
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 320, right: 400, bottom: 320 }) as DOMRect;
    chart.dispatchAction.mockClear();

    canvas.dispatchEvent(pointer('pointerdown', 100, 120, 'touch'));
    canvas.dispatchEvent(pointer('pointermove', 200, 120, 'touch'));
    canvas.dispatchEvent(pointer('pointerup', 200, 120, 'touch'));

    expect(chart.dispatchAction).not.toHaveBeenCalled();
    expect(element.querySelector('.chart__brush')).toBeNull();
  });

  it('resets local zoom before requesting the full range on double-click', async () => {
    const element = await mountChart();
    flushFrames();
    vi.runOnlyPendingTimers();
    chart.dispatchAction.mockClear();
    const resetBeforeEvent: boolean[] = [];
    element.addEventListener('restoreRequested', () => {
      resetBeforeEvent.push(
        chart.dispatchAction.mock.calls.some(
          ([action]) => action.type === 'dataZoom' && action.start === 0 && action.end === 100,
        ),
      );
    });

    element.querySelector<HTMLElement>('.chart__canvas')?.dispatchEvent(new Event('dblclick'));

    expect(chart.dispatchAction).toHaveBeenCalledWith({ type: 'dataZoom', start: 0, end: 100 });
    expect(resetBeforeEvent).toEqual([true]);
  });

  it('resets local zoom whenever the external reset key changes', async () => {
    const element = await mountChart();
    flushFrames();
    vi.runOnlyPendingTimers();
    chart.dispatchAction.mockClear();

    element.resetKey += 1;
    await nextTick();

    expect(chart.dispatchAction).toHaveBeenCalledOnce();
    expect(chart.dispatchAction).toHaveBeenCalledWith({ type: 'dataZoom', start: 0, end: 100 });
  });
});

describe('touch scroll contract', () => {
  // The styles are injected globally by index.ts, so jsdom cannot observe them computed; the
  // source text is the contract the injection carries.
  const read = (file: string): string =>
    (
      globalThis as typeof globalThis & {
        process: { getBuiltinModule(name: 'fs'): { readFileSync(p: URL, e: 'utf8'): string } };
      }
    ).process
      .getBuiltinModule('fs')
      .readFileSync(new URL(file, import.meta.url), 'utf8');

  it('keeps vertical page scroll native over the measurement chart while claiming pinch', () => {
    const source = read('./MeasurementChart.css');

    expect(source).toMatch(/\.chart__canvas\s*{[^}]*touch-action:\s*pan-y;/s);
  });

  it('keeps vertical page scroll and browser zoom native over the heatmap', () => {
    const source = read('../CycleHeatmap/CycleHeatmap.css');

    expect(source).toMatch(/\.heatmap__canvas\s*{[^}]*touch-action:\s*pan-y pinch-zoom;/s);
  });
});

describe('MeasurementChart drag cleanup', () => {
  it.each([
    ['pointer cancellation', () => window.dispatchEvent(new Event('pointercancel'))],
    [
      'lost pointer capture',
      (canvas: HTMLElement) => canvas.dispatchEvent(new Event('lostpointercapture')),
    ],
    ['window blur', () => window.dispatchEvent(new Event('blur'))],
  ])('settles a pending range after %s', async (_, release) => {
    const element = await mountChart();
    flushFrames();
    vi.runOnlyPendingTimers();
    const canvas = element.querySelector<HTMLElement>('.chart__canvas');
    expect(canvas).not.toBeNull();

    const selected: CustomEvent[] = [];
    element.addEventListener('rangeSelected', (event) => selected.push(event as CustomEvent));
    canvas?.dispatchEvent(new Event('pointerdown'));
    dataZoomHandler?.();
    vi.advanceTimersByTime(260);
    expect(chart.getOption).not.toHaveBeenCalled();

    release(canvas as HTMLElement);

    expect(chart.getOption).toHaveBeenCalledOnce();
    expect(selected).toHaveLength(1);
    expect(selected[0].detail).toEqual({ from: 1_400, to: 2_600 });
  });
});

import type { SeriesThresholds } from '../../../core/data/measurement.models';

/**
 * Pure geometry of a vertical tape instrument. The scale is a tall strip
 * of pixels laid out top = domain max; the component anchors it at the window's vertical centre
 * and translates it so the current value sits under the fixed pointer chip. Everything here is a
 * pure function of the series data, so the whole instrument is testable without a DOM.
 */
export interface TapeDomain {
  readonly min: number;
  readonly max: number;
}

export interface TapeTick {
  readonly value: number;
  readonly y: number;
  readonly major: boolean;
}

export interface TapeTickScale {
  readonly ticks: readonly TapeTick[];
  readonly majorStep: number;
  /** Fraction digits a label needs to print the step exactly — 0.5 → 1, 25 → 0. */
  readonly decimals: number;
}

export type TapeZoneKind = 'warning' | 'critical';

export interface TapeZone {
  readonly kind: TapeZoneKind;
  /** Which end of the scale the zone guards; the threshold edge of the band faces the ok region. */
  readonly edge: 'high' | 'low';
  readonly top: number;
  readonly height: number;
  readonly threshold: number;
}

export type TapeTrend = 'up' | 'down' | 'flat';

export interface TapeExtent {
  readonly min: number;
  readonly max: number;
  readonly avg: number;
  readonly last: number;
}

/**
 * Taller than the window, so the tape visibly travels — but short enough that a typical window
 * (~42vh) shows roughly two thirds of the plausible range: with the signal at rest mid-band, the
 * nearest threshold zone already peeks into view, as on the approved board.
 */
export const TAPE_SCALE_HEIGHT = 660;

/** Resting sparkline strip width; a measured face may widen it (see `tapeFaceLayout`). */
export const SPARK_VIEW_WIDTH = 32;
export const SPARK_VIEW_HEIGHT = 100;

const DOMAIN_PADDING = 0.08;
const TARGET_MINOR_TICK_PX = 11;
const MINORS_PER_MAJOR = 5;
/** More ghost points than this cannot be told apart inside a 32px-wide strip. */
const SPARK_MAX_POINTS = 160;

/**
 * The tape's plausible range: the critical band always fits (zones must be visible even when the
 * signal is calm), and any measured value in the loaded range widens it — a reading may never sit
 * off-tape. Padded so the outermost zone keeps visible depth beyond its threshold line.
 */
export function tapeDomain(thresholds: SeriesThresholds, values: readonly number[]): TapeDomain {
  let min = thresholds.criticalMin;
  let max = thresholds.criticalMax;
  for (const value of values) {
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }
  const padding = (max - min || 1) * DOMAIN_PADDING;
  return { min: min - padding, max: max + padding };
}

/** Pixel row of a value on the scale strip; the top of the strip is the domain maximum. */
export function valueToY(
  value: number,
  domain: TapeDomain,
  scaleHeight = TAPE_SCALE_HEIGHT,
): number {
  return ((domain.max - value) / (domain.max - domain.min)) * scaleHeight;
}

/**
 * TranslateY for a scale strip anchored at `top: 50%` of the window: shifting it up by the
 * value's own row puts that row exactly under the fixed centre pointer.
 */
export function scaleOffset(
  value: number,
  domain: TapeDomain,
  scaleHeight = TAPE_SCALE_HEIGHT,
): number {
  return -valueToY(value, domain, scaleHeight);
}

/** Nearest 1/2/5×10ⁿ at or above the raw step, so tick values stay human-readable. */
function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  if (fraction <= 1) {
    return power;
  }
  if (fraction <= 2) {
    return 2 * power;
  }
  if (fraction <= 5) {
    return 5 * power;
  }
  return 10 * power;
}

function decimalsFor(step: number): number {
  let decimals = 0;
  while (
    decimals < 6 &&
    Math.abs(step * 10 ** decimals - Math.round(step * 10 ** decimals)) > 1e-9
  ) {
    decimals += 1;
  }
  return decimals;
}

/**
 * Minor ticks every ~11px, majors every fifth minor. Ticks land on multiples of the step counted
 * from zero (not from the domain edge), so the printed numbers are round in every window.
 */
export function buildTicks(domain: TapeDomain, scaleHeight = TAPE_SCALE_HEIGHT): TapeTickScale {
  const span = domain.max - domain.min;
  const minorStep = niceStep((span * TARGET_MINOR_TICK_PX) / scaleHeight);
  const majorStep = minorStep * MINORS_PER_MAJOR;
  const first = Math.ceil(domain.min / minorStep - 1e-9);
  const last = Math.floor(domain.max / minorStep + 1e-9);
  const ticks: TapeTick[] = [];
  for (let index = first; index <= last; index += 1) {
    // A multiple of e.g. 0.1 picks up float noise; six decimals is finer than any step used here.
    const value = Number((index * minorStep).toFixed(6));
    ticks.push({
      value,
      y: valueToY(value, domain, scaleHeight),
      major: index % MINORS_PER_MAJOR === 0,
    });
  }
  return { ticks, majorStep, decimals: decimalsFor(majorStep) };
}

/**
 * The four bands `classify()` distinguishes, clipped to the tape and dropped when they collapse
 * (a threshold pushed to the domain edge has no printable area). The `threshold` is the edge the
 * band shares with the next-less-severe region — the line the zone tag labels.
 */
export function buildZones(
  thresholds: SeriesThresholds,
  domain: TapeDomain,
  scaleHeight = TAPE_SCALE_HEIGHT,
): TapeZone[] {
  const bands = [
    { kind: 'critical', edge: 'high', upper: domain.max, lower: thresholds.criticalMax },
    { kind: 'warning', edge: 'high', upper: thresholds.criticalMax, lower: thresholds.warningMax },
    { kind: 'warning', edge: 'low', upper: thresholds.warningMin, lower: thresholds.criticalMin },
    { kind: 'critical', edge: 'low', upper: thresholds.criticalMin, lower: domain.min },
  ] as const;

  return bands.flatMap((band) => {
    const upper = Math.min(band.upper, domain.max);
    const lower = Math.max(band.lower, domain.min);
    const top = valueToY(upper, domain, scaleHeight);
    const height = valueToY(lower, domain, scaleHeight) - top;
    if (height <= 0.5) {
      return [];
    }
    const threshold = band.edge === 'high' ? band.lower : band.upper;
    return [{ kind: band.kind, edge: band.edge, top, height, threshold }];
  });
}

/**
 * Direction of the last step, dead-banded at 0.1% of the tape's span so bucket-average jitter in
 * the last decimals does not flip the chevron on every sample.
 */
export function trendOf(values: readonly number[], domainSpan: number): TapeTrend {
  if (values.length < 2) {
    return 'flat';
  }
  const delta = values[values.length - 1] - values[values.length - 2];
  const epsilon = Math.max(Math.abs(domainSpan) * 0.001, Number.EPSILON);
  if (delta > epsilon) {
    return 'up';
  }
  if (delta < -epsilon) {
    return 'down';
  }
  return 'flat';
}

/**
 * The face's horizontal pixel grid, derived from its measured width. The tape is an instrument,
 * not a fluid box: when the deck gives it a wider column (a full-width phone row, a spanning
 * tablet cell), the strip re-lays instead of stretching — the ghost strip earns more room, the
 * pointer chip stays hugging the scale it reads, and the centre reference line carries the rest
 * of the way across.
 */
export interface TapeFaceLayout {
  /** Width of the ghost sparkline strip on the face's right edge. */
  readonly sparkWidth: number;
  /** Pointer chip width; `undefined` lets CSS stretch the chip to the strip (unmeasured face). */
  readonly chipWidth: number | undefined;
  /** The centre reference line running from the chip's right edge to the face's right edge. */
  readonly tailWidth: number;
}

/** Below this a measurement is degenerate (mid-layout, hidden) — keep the resting grid. */
const MIN_MEASURED_FACE = 120;
/** A wider chip smears the reading away from the scale its beak points at. */
const CHIP_MAX_WIDTH = 336;
/** Ghost strip tiers; the thresholds sit between the deck's column widths, never on them. */
const WIDE_FACE = 400;
const FULL_FACE = 560;

export function tapeFaceLayout(faceWidth: number | undefined): TapeFaceLayout {
  if (faceWidth === undefined || faceWidth < MIN_MEASURED_FACE) {
    return { sparkWidth: SPARK_VIEW_WIDTH, chipWidth: undefined, tailWidth: SPARK_VIEW_WIDTH };
  }
  const sparkWidth = faceWidth >= FULL_FACE ? 56 : faceWidth >= WIDE_FACE ? 44 : SPARK_VIEW_WIDTH;
  const chipWidth = Math.min(faceWidth - sparkWidth, CHIP_MAX_WIDTH);
  return { sparkWidth, chipWidth, tailWidth: faceWidth - chipWidth };
}

export function extentOf(values: readonly number[]): TapeExtent | undefined {
  if (values.length === 0) {
    return undefined;
  }
  let min = values[0];
  let max = values[0];
  let sum = 0;
  for (const value of values) {
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
    sum += value;
  }
  return { min, max, avg: sum / values.length, last: values[values.length - 1] };
}

/**
 * The ghost sparkline: time runs top → bottom over the loaded range, value maps across the strip
 * width on its own extent. Long ranges are strided down — the strip is 32px wide, more points
 * would only thicken the line.
 */
export function sparklinePath(
  values: readonly number[],
  width = SPARK_VIEW_WIDTH,
  height = SPARK_VIEW_HEIGHT,
): string {
  if (values.length < 2) {
    return '';
  }
  const stride = Math.max(1, Math.ceil(values.length / SPARK_MAX_POINTS));
  const sampled: number[] = [];
  for (let index = 0; index < values.length; index += stride) {
    sampled.push(values[index]);
  }
  if ((values.length - 1) % stride !== 0) {
    sampled.push(values[values.length - 1]);
  }

  let min = sampled[0];
  let max = sampled[0];
  for (const value of sampled) {
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }
  const padding = (max - min || 1) * 0.2;
  min -= padding;
  max += padding;

  return sampled
    .map((value, index) => {
      const y = (index / (sampled.length - 1)) * height;
      const x = 4 + ((value - min) / (max - min)) * (width - 8);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join('');
}

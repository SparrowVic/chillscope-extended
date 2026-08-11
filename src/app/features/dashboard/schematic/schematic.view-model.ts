import type {
  MeasurementSeries,
  SeriesId,
  SeriesThresholds,
} from '../../../core/data/measurement.models';
import { classify } from '../../../core/data/series.catalog';
import type { EffectActivation, SpinKind, SymbolEffectKind } from '../../../core/schematic/symbols';
import type { MeasurementStatus } from '../../../shared/severity';
import { clamp } from '../../../core/math';

/**
 * Pure view-model helpers for the synoptic schematic: the latest reading per series, the §7
 * micro-gauge geometry under each instrument tag, and the flow-scaled dash period of the pipe
 * animation (§8). Pure functions so the maths is testable without a component fixture.
 */

export interface LatestReading {
  readonly value: number;
  readonly thresholds: SeriesThresholds;
}

export type TelemetryState = 'unknown' | 'stopped' | 'running';

/** Latest sample per series; series with no samples (or not selected at all) are simply absent. */
export function latestReadings(
  series: readonly MeasurementSeries[],
): ReadonlyMap<SeriesId, LatestReading> {
  const readings = new Map<SeriesId, LatestReading>();
  for (const entry of series) {
    const values = entry.points.v;
    if (values.length > 0) {
      readings.set(entry.id, {
        value: values[values.length - 1],
        thresholds: entry.thresholds,
      });
    }
  }
  return readings;
}

/** Missing telemetry must never masquerade as a measured stop. */
export function telemetryState(reading: LatestReading | undefined): TelemetryState {
  if (reading === undefined || !Number.isFinite(reading.value)) {
    return 'unknown';
  }
  return reading.value > 0 ? 'running' : 'stopped';
}

export function effectIsActive(
  reading: LatestReading | undefined,
  activation: EffectActivation,
): boolean {
  if (reading === undefined || !Number.isFinite(reading.value)) {
    return false;
  }
  switch (activation) {
    case 'positive':
      return reading.value > 0;
    case 'warning':
      return classify(reading.value, reading.thresholds) !== 'ok';
    case 'high-warning':
      return reading.value > reading.thresholds.warningMax;
  }
}

/** A bounded visual load. Chroma still communicates status; this only scales motion energy. */
export function effectIntensity(
  reading: LatestReading | undefined,
  activation: EffectActivation,
): number {
  if (!effectIsActive(reading, activation) || reading === undefined) {
    return 0;
  }
  const { value, thresholds } = reading;
  if (activation === 'warning') {
    return classify(value, thresholds) === 'critical' ? 1 : 0.68;
  }
  if (activation === 'high-warning') {
    const span = thresholds.criticalMax - thresholds.warningMax;
    return span <= 0 ? 1 : clamp(0.6 + ((value - thresholds.warningMax) / span) * 0.4, 0.6, 1);
  }
  return thresholds.criticalMax <= 0 ? 1 : clamp(value / thresholds.criticalMax, 0.12, 1);
}

export interface GaugeZone {
  readonly kind: 'warning' | 'critical';
  readonly leftPct: number;
  readonly widthPct: number;
}

export interface MicroGauge {
  readonly zones: readonly GaugeZone[];
  readonly markPct: number;
  readonly markTransform: string;
  readonly status: MeasurementStatus;
}

/** A little air beyond the critical band, so a breach lands inside the track, not on its rim. */
const GAUGE_PAD_FRACTION = 0.08;

/**
 * The hairline gauge spans the critical band plus padding; warning and critical zones are
 * printed on the track and the mark sits at the value's position, clamped to the track.
 */
export function microGauge(value: number, thresholds: SeriesThresholds): MicroGauge {
  const span = thresholds.criticalMax - thresholds.criticalMin;
  const low = thresholds.criticalMin - span * GAUGE_PAD_FRACTION;
  const high = thresholds.criticalMax + span * GAUGE_PAD_FRACTION;
  const pct = (at: number): number =>
    high <= low ? 0 : Math.min(1, Math.max(0, (at - low) / (high - low))) * 100;

  const criticalMin = pct(thresholds.criticalMin);
  const warningMin = pct(thresholds.warningMin);
  const warningMax = pct(thresholds.warningMax);
  const criticalMax = pct(thresholds.criticalMax);
  const markPct = pct(value);

  return {
    zones: [
      { kind: 'critical', leftPct: 0, widthPct: criticalMin },
      { kind: 'warning', leftPct: criticalMin, widthPct: warningMin - criticalMin },
      { kind: 'warning', leftPct: warningMax, widthPct: criticalMax - warningMax },
      { kind: 'critical', leftPct: criticalMax, widthPct: 100 - criticalMax },
    ],
    markPct,
    markTransform: `translateX(${Math.round(markPct * 1_000) / 1_000}%)`,
    status: classify(value, thresholds),
  };
}

/** Chosen so the simulated flow band (~20–120 l/min) maps onto a visibly different pace. */
const FLOW_SPEED_FACTOR = 600;
const FLOW_MIN_SECONDS = 2;
const FLOW_MAX_SECONDS = 12;

/**
 * Dash-cycle duration for the pipe flow animation: speed proportional to the flow value (§8),
 * clamped so extreme readings stay readable. `undefined` means no flow — the animation pauses.
 */
export function flowDurationSeconds(flow: number): number | undefined {
  if (!Number.isFinite(flow) || flow <= 0) {
    return undefined;
  }
  return Math.min(FLOW_MAX_SECONDS, Math.max(FLOW_MIN_SECONDS, FLOW_SPEED_FACTOR / flow));
}

const PACKET_REFERENCE_PX = 120;
const PACKET_MIN_SECONDS = 2;
const PACKET_MAX_SECONDS = 36;

/** Equal flow means equal physical packet velocity, regardless of the routed polyline's length. */
export function packetDurationSeconds(flow: number, lengthPx: number): number | undefined {
  const dashDuration = flowDurationSeconds(flow);
  if (dashDuration === undefined || !Number.isFinite(lengthPx) || lengthPx <= 0) {
    return undefined;
  }
  return clamp(
    (dashDuration * lengthPx) / PACKET_REFERENCE_PX,
    PACKET_MIN_SECONDS,
    PACKET_MAX_SECONDS,
  );
}

const SPIN_FACTORS: Readonly<Record<SpinKind, number>> = {
  rotor: 1_800,
  fan: 360,
  piston: 1_500,
};

const SPIN_LIMITS: Readonly<Record<SpinKind, readonly [number, number]>> = {
  rotor: [0.65, 5],
  fan: [1.2, 6],
  piston: [0.55, 3.5],
};

/** Telemetry-scaled but visually aliased: literal industrial RPM would be an unreadable blur. */
export function spinDurationSeconds(kind: SpinKind, value: number): number | undefined {
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  const [minimum, maximum] = SPIN_LIMITS[kind];
  return clamp(SPIN_FACTORS[kind] / value, minimum, maximum);
}

const EFFECT_BASE_SECONDS: Readonly<Record<SymbolEffectKind, number>> = {
  halo: 2.6,
  'coil-glow': 3.2,
  'heat-rise': 2.6,
  'air-tick': 2,
  ripple: 3.8,
  'level-breath': 4.2,
  discharge: 1.8,
  'heat-fade': 2.8,
  vapor: 3.4,
  throttle: 2.8,
  drip: 2.4,
  spray: 1.6,
  'heat-pulse': 3.6,
};

export function effectDurationSeconds(kind: SymbolEffectKind, intensity: number): number {
  return EFFECT_BASE_SECONDS[kind] * (1.12 - clamp(intensity, 0, 1) * 0.42);
}

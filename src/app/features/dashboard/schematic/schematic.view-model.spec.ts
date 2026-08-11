import { describe, expect, it } from 'vitest';

import type { MeasurementSeries } from '../../../core/data/measurement.models';
import {
  effectDurationSeconds,
  effectIntensity,
  effectIsActive,
  flowDurationSeconds,
  latestReadings,
  microGauge,
  packetDurationSeconds,
  spinDurationSeconds,
  telemetryState,
} from './schematic.view-model';

const THRESHOLDS = { warningMin: 20, warningMax: 80, criticalMin: 10, criticalMax: 90 };

function series(overrides: Partial<MeasurementSeries> & Pick<MeasurementSeries, 'id'>) {
  return {
    unit: 'x',
    color: '#000000',
    thresholds: THRESHOLDS,
    points: { t: [], v: [] },
    ...overrides,
  } as MeasurementSeries;
}

describe('latestReadings', () => {
  it('picks the last sample of each series and carries its thresholds', () => {
    const readings = latestReadings([
      series({ id: 'temperature', points: { t: [1, 2, 3], v: [50, 60, 70] } }),
    ]);

    expect(readings.get('temperature')).toEqual({ value: 70, thresholds: THRESHOLDS });
  });

  it('omits a selected series that has no samples, so its tag falls back to the idle state', () => {
    const readings = latestReadings([series({ id: 'flow' })]);

    expect(readings.has('flow')).toBe(false);
  });
});

describe('microGauge', () => {
  // The track spans the critical band (10..90) padded by 8% of its width on both sides: 3.6..96.4.
  it('prints the threshold zones in order along the track', () => {
    const gauge = microGauge(50, THRESHOLDS);
    const [critLow, warnLow, warnHigh, critHigh] = gauge.zones;

    expect(critLow.kind).toBe('critical');
    expect(critLow.leftPct).toBe(0);
    expect(warnLow.kind).toBe('warning');
    expect(warnLow.leftPct).toBeCloseTo(critLow.widthPct);
    expect(warnHigh.leftPct).toBeGreaterThan(warnLow.leftPct + warnLow.widthPct);
    expect(critHigh.leftPct + critHigh.widthPct).toBeCloseTo(100);
  });

  it('places the mark at the value and classifies it with the shared comparison', () => {
    const middle = microGauge(50, THRESHOLDS);
    expect(middle.markPct).toBeCloseTo(50);
    expect(middle.markTransform).toBe('translateX(50%)');
    expect(middle.status).toBe('ok');

    expect(microGauge(85, THRESHOLDS).status).toBe('warning');
    expect(microGauge(95, THRESHOLDS).status).toBe('critical');
  });

  it('clamps a runaway value to the ends of the track', () => {
    expect(microGauge(-1000, THRESHOLDS).markPct).toBe(0);
    expect(microGauge(1000, THRESHOLDS).markPct).toBe(100);
  });
});

describe('telemetryState', () => {
  it('keeps missing and invalid telemetry distinct from a measured stop', () => {
    expect(telemetryState(undefined)).toBe('unknown');
    expect(telemetryState({ value: Number.NaN, thresholds: THRESHOLDS })).toBe('unknown');
    expect(telemetryState({ value: 0, thresholds: THRESHOLDS })).toBe('stopped');
    expect(telemetryState({ value: 12, thresholds: THRESHOLDS })).toBe('running');
  });
});

describe('flowDurationSeconds', () => {
  it('returns undefined for no flow, so the animation pauses', () => {
    expect(flowDurationSeconds(0)).toBeUndefined();
    expect(flowDurationSeconds(-5)).toBeUndefined();
    expect(flowDurationSeconds(Number.NaN)).toBeUndefined();
  });

  it('runs faster the more flows, clamped to a readable band', () => {
    const slow = flowDurationSeconds(30);
    const fast = flowDurationSeconds(120);

    expect(slow).toBeGreaterThan(fast ?? 0);
    expect(flowDurationSeconds(0.001)).toBe(12);
    expect(flowDurationSeconds(100_000)).toBe(2);
  });
});

describe('telemetry-scaled motion', () => {
  it('keeps packet velocity consistent across different routed lengths', () => {
    const short = packetDurationSeconds(60, 120);
    const long = packetDurationSeconds(60, 240);

    expect(short).toBe(10);
    expect(long).toBe(20);
    expect(packetDurationSeconds(0, 120)).toBeUndefined();
  });

  it('aliases real mechanical speed into a readable, bounded duration', () => {
    expect(spinDurationSeconds('rotor', 900)).toBe(2);
    expect(spinDurationSeconds('rotor', 0)).toBeUndefined();
    expect(spinDurationSeconds('fan', 100_000)).toBe(1.2);
  });

  it('activates effects from their declared semantic threshold and scales their energy', () => {
    const warning = { value: 85, thresholds: THRESHOLDS };
    const critical = { value: 95, thresholds: THRESHOLDS };

    expect(effectIsActive(undefined, 'positive')).toBe(false);
    expect(effectIsActive(warning, 'warning')).toBe(true);
    expect(effectIsActive({ value: 50, thresholds: THRESHOLDS }, 'warning')).toBe(false);
    expect(effectIsActive(warning, 'high-warning')).toBe(true);
    expect(effectIntensity(warning, 'warning')).toBe(0.68);
    expect(effectIntensity(critical, 'warning')).toBe(1);
    expect(effectDurationSeconds('heat-pulse', 1)).toBeLessThan(
      effectDurationSeconds('heat-pulse', 0),
    );
  });
});

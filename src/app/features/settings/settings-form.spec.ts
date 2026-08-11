import { Injector, runInInjectionContext, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { SERIES_CATALOG } from '../../core/data/series.catalog';
import {
  settingsFormSchema,
  THRESHOLD_SERIES,
  toFailureRate,
  toFormValue,
  toSeriesThresholds,
  toSimulationSettings,
  type SettingsFormValue,
  type ThresholdBandValue,
} from './settings-form';

const DEFAULTS: SettingsFormValue = toFormValue({
  liveIntervalMs: 5_000,
  failureRate: 0,
  thresholds: {},
});

function band(overrides: Partial<ThresholdBandValue> = {}): ThresholdBandValue {
  return { ...DEFAULTS.thresholds.temperature, ...overrides };
}

/** The kinds a field currently reports, which is what the control renders as a message. */
function kindsOn(value: SettingsFormValue, field: keyof ThresholdBandValue): string[] {
  const injector = TestBed.inject(Injector);
  return runInInjectionContext(injector, () => {
    const tree = form(signal(value), settingsFormSchema);
    return tree.thresholds.temperature[field]()
      .errors()
      .map((error) => error.kind);
  });
}

function withTemperature(overrides: Partial<ThresholdBandValue>): SettingsFormValue {
  return { ...DEFAULTS, thresholds: { ...DEFAULTS.thresholds, temperature: band(overrides) } };
}

describe('toFormValue', () => {
  it('seeds every band from the catalogue when nothing is overridden', () => {
    for (const { id } of THRESHOLD_SERIES) {
      expect(DEFAULTS.thresholds[id]).toEqual(SERIES_CATALOG[id].thresholds);
    }
  });

  it('prefers a stored override over the catalogue default', () => {
    const override = { warningMin: 1, warningMax: 2, criticalMin: 0, criticalMax: 3 };
    const value = toFormValue({
      liveIntervalMs: 1_000,
      failureRate: 0,
      thresholds: { flow: override },
    });
    expect(value.thresholds.flow).toEqual(override);
    expect(value.thresholds.rpm).toEqual(SERIES_CATALOG.rpm.thresholds);
  });

  it('shows the failure rate as a percentage, which is what the slider reads', () => {
    expect(
      toFormValue({ liveIntervalMs: 1_000, failureRate: 0.25, thresholds: {} }).failureRatePercent,
    ).toBe(25);
    expect(toFailureRate(25)).toBe(0.25);
  });
});

describe('toSimulationSettings', () => {
  it('maps a complete form into the store input, one band per series', () => {
    const input = toSimulationSettings(DEFAULTS);
    expect(input?.liveIntervalMs).toBe(5_000);
    expect(input?.failureRate).toBe(0);
    for (const { id } of THRESHOLD_SERIES) {
      expect(input?.thresholds[id]).toEqual(SERIES_CATALOG[id].thresholds);
    }
  });

  it('refuses to map while a cleared slider-pair field would persist garbage', () => {
    expect(toSimulationSettings({ ...DEFAULTS, liveIntervalMs: null })).toBeUndefined();
    expect(toSimulationSettings({ ...DEFAULTS, failureRatePercent: null })).toBeUndefined();
  });

  it('skips an incomplete band rather than inventing bounds for it', () => {
    const input = toSimulationSettings(withTemperature({ warningMax: null }));
    expect(input?.thresholds.temperature).toBeUndefined();
    expect(input?.thresholds.pressure).toEqual(SERIES_CATALOG.pressure.thresholds);
  });
});

describe('toSeriesThresholds', () => {
  it('rejects a band with a cleared field', () => {
    expect(toSeriesThresholds(band({ warningMax: null }))).toBeUndefined();
  });

  it('accepts a fully filled band', () => {
    expect(toSeriesThresholds(band())).toEqual(SERIES_CATALOG.temperature.thresholds);
  });
});

describe('settingsFormSchema', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('accepts the catalogue defaults', () => {
    for (const field of ['criticalMin', 'warningMin', 'warningMax', 'criticalMax'] as const) {
      expect(kindsOn(DEFAULTS, field)).toEqual([]);
    }
  });

  it('reports a critical maximum below the warning maximum on the field being edited', () => {
    const value = withTemperature({ criticalMax: 60 });
    expect(kindsOn(value, 'criticalMax')).toContain('criticalOutsideWarning');
  });

  it('reports a critical minimum above the warning minimum on the field being edited', () => {
    const value = withTemperature({ criticalMin: 50 });
    expect(kindsOn(value, 'criticalMin')).toContain('criticalOutsideWarning');
  });

  it('still reports the same breach on the warning field it constrains', () => {
    expect(kindsOn(withTemperature({ criticalMax: 60 }), 'warningMax')).toContain(
      'criticalOutsideWarning',
    );
  });

  it('reports an inverted warning band on both of its fields', () => {
    const value = withTemperature({ warningMin: 80 });
    expect(kindsOn(value, 'warningMin')).toContain('thresholdOrder');
    expect(kindsOn(value, 'warningMax')).toContain('thresholdOrder');
  });

  it('requires every threshold field', () => {
    expect(kindsOn(withTemperature({ criticalMax: null }), 'criticalMax')).toContain('required');
  });

  it('requires both simulation fields, which their number inputs can clear', () => {
    const injector = TestBed.inject(Injector);
    const kinds = runInInjectionContext(injector, () => {
      const tree = form(
        signal<SettingsFormValue>({ ...DEFAULTS, liveIntervalMs: null, failureRatePercent: null }),
        settingsFormSchema,
      );
      return {
        interval: tree.liveIntervalMs()
          .errors()
          .map((error) => error.kind),
        failure: tree.failureRatePercent()
          .errors()
          .map((error) => error.kind),
      };
    });
    expect(kinds.interval).toContain('required');
    expect(kinds.failure).toContain('required');
  });
});

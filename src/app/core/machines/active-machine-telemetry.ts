import { computed, inject, Injectable } from '@angular/core';
import type { MeasurementSeries } from '../data/measurement.models';
import type { SeriesId, SeriesThresholds } from '../data/series.catalog';
import { SettingsStore, type ThresholdOverrides } from '../settings/settings.store';
import type { MachineSchematic } from '../schematic/schematic.models';
import { MachineLibraryStore } from './machine-library.store';

export interface ActiveMachineTelemetrySnapshot {
  readonly thresholds: ThresholdOverrides;
  readonly tags: Readonly<Partial<Record<SeriesId, string>>>;
}

/**
 * Resolves the telemetry-facing part of a machine document once per active-machine change.
 * Machine bands intentionally win over global Settings: they are the more specific calibration.
 */
export function machineTelemetry(
  machine: MachineSchematic,
  globalThresholds: ThresholdOverrides,
): ActiveMachineTelemetrySnapshot {
  const thresholds: Partial<Record<SeriesId, SeriesThresholds>> = { ...globalThresholds };
  const tags: Partial<Record<SeriesId, string>> = {};
  for (const instrument of machine.instruments) {
    tags[instrument.series] = instrument.tag;
    if (instrument.thresholds !== undefined) {
      thresholds[instrument.series] = instrument.thresholds;
    }
  }
  return { thresholds, tags };
}

/** Apply global + document calibration to values loaded independently of any active machine. */
export function calibrateSeriesForMachine(
  series: readonly MeasurementSeries[],
  machine: MachineSchematic,
  globalThresholds: ThresholdOverrides,
): MeasurementSeries[] {
  const overrides = machineTelemetry(machine, globalThresholds).thresholds;
  return series.map((entry) => {
    const thresholds = overrides[entry.id];
    return thresholds === undefined ? entry : { ...entry, thresholds };
  });
}

@Injectable({ providedIn: 'root' })
export class ActiveMachineTelemetry {
  readonly #machines = inject(MachineLibraryStore);
  readonly #settings = inject(SettingsStore);

  readonly snapshot = computed(() =>
    machineTelemetry(this.#machines.active(), this.#settings.thresholds()),
  );
  readonly thresholds = computed(() => this.snapshot().thresholds);
  readonly tags = computed(() => this.snapshot().tags);
}

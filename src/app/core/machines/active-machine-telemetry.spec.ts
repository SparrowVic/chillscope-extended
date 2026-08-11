import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MeasurementSeries } from '../data/measurement.models';
import type { SeriesThresholds } from '../data/series.catalog';
import type { MachineSchematic } from '../schematic/schematic.models';
import { SettingsStore } from '../settings/settings.store';
import {
  ActiveMachineTelemetry,
  calibrateSeriesForMachine,
  machineTelemetry,
} from './active-machine-telemetry';
import { MachineLibraryStore } from './machine-library.store';

const GLOBAL: SeriesThresholds = {
  criticalMin: 10,
  warningMin: 20,
  warningMax: 80,
  criticalMax: 90,
};

const MACHINE: SeriesThresholds = {
  criticalMin: 30,
  warningMin: 40,
  warningMax: 60,
  criticalMax: 70,
};

describe('active-machine telemetry', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
  });

  it('lets an instrument calibration override the global setting and resolves its ISA tag', () => {
    const machine: MachineSchematic = {
      id: 'TEST',
      name: 'Test machine',
      revision: 'A',
      profileId: 'tcu',
      nodes: [],
      pipes: [],
      instruments: [
        {
          tag: 'TT-901',
          series: 'temperature',
          attachTo: 'M1',
          thresholds: MACHINE,
        },
      ],
    };

    expect(machineTelemetry(machine, { temperature: GLOBAL })).toEqual({
      thresholds: { temperature: MACHINE },
      tags: { temperature: 'TT-901' },
    });

    const baseline: MeasurementSeries = {
      id: 'temperature',
      unit: '°C',
      color: 'temperature',
      thresholds: { criticalMin: 0, warningMin: 10, warningMax: 90, criticalMax: 100 },
      points: { t: [1], v: [50] },
    };
    expect(calibrateSeriesForMachine([baseline], machine, { temperature: GLOBAL })[0]).toEqual({
      ...baseline,
      thresholds: MACHINE,
    });
  });

  it('reacts when the active machine changes', () => {
    const machines = TestBed.inject(MachineLibraryStore);
    const settings = TestBed.inject(SettingsStore);
    const telemetry = TestBed.inject(ActiveMachineTelemetry);
    settings.setThresholds('temperature', GLOBAL);

    const copyResult = machines.duplicate('TCU-01');
    expect(copyResult.ok).toBe(true);
    if (!copyResult.ok) {
      throw new Error(`Could not create the test machine: ${copyResult.reason}.`);
    }
    const copy = copyResult.doc;
    const instrument = copy.instruments.find((entry) => entry.series === 'temperature');
    const updated = machines.update(copy.id, {
      ...copy,
      instruments: copy.instruments.map((entry) =>
        entry === instrument ? { ...entry, tag: 'TT-901', thresholds: MACHINE } : entry,
      ),
    });
    expect(updated.ok).toBe(true);

    expect(machines.setActive(copy.id)).toEqual({ ok: true });
    expect(telemetry.thresholds().temperature).toEqual(MACHINE);
    expect(telemetry.tags().temperature).toBe('TT-901');

    expect(machines.setActive('K-207')).toEqual({ ok: true });
    expect(telemetry.thresholds().temperature).toEqual(GLOBAL);
    expect(telemetry.tags().temperature).toBe('TT-101');
  });
});

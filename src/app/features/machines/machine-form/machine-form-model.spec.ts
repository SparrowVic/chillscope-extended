import { describe, expect, it } from 'vitest';

import { CH02_SCHEMATIC, TCU01_SCHEMATIC } from '../../../core/machines/builtin.machines';
import {
  MACHINE_PROFILES,
  validateAgainstProfile,
  type MachineProfile,
} from '../../../core/machines/machine-profile';
import { skeletonFor } from '../../../core/machines/machine-skeleton';
import type { MachineSchematic } from '../../../core/schematic/schematic.models';
import { validateSchematic } from '../../../core/schematic/schematic.validate';
import { toMachineFormValue, toSchematicDocument } from './machine-form-model';

function profileOf(doc: MachineSchematic): MachineProfile {
  return MACHINE_PROFILES[doc.profileId];
}

function roundTrip(doc: MachineSchematic): unknown {
  return toSchematicDocument(toMachineFormValue(doc, profileOf(doc)), doc.profileId);
}

describe('machine form model', () => {
  it.each([
    ['TCU-01', TCU01_SCHEMATIC],
    ['CH-02', CH02_SCHEMATIC],
    ['tcu skeleton', skeletonFor(MACHINE_PROFILES.tcu)],
    ['chiller skeleton', skeletonFor(MACHINE_PROFILES.chiller)],
  ])('round-trips %s through the form value without loss', (_name, doc) => {
    expect(roundTrip(doc)).toEqual(doc);
  });

  it('round-tripped documents still pass both validation layers', () => {
    for (const doc of [TCU01_SCHEMATIC, CH02_SCHEMATIC]) {
      const structural = validateSchematic(roundTrip(doc));
      expect(structural.ok).toBe(true);
      if (structural.ok) {
        expect(validateAgainstProfile(structural.doc, profileOf(doc))).toEqual([]);
      }
    }
  });

  it('seeds an empty slot row for a series the document does not instrument', () => {
    const doc: MachineSchematic = {
      ...TCU01_SCHEMATIC,
      instruments: TCU01_SCHEMATIC.instruments.filter((entry) => entry.series !== 'rpm'),
    };
    const value = toMachineFormValue(doc, profileOf(doc));
    const rpm = value.sensors.find((sensor) => sensor.series === 'rpm');
    expect(rpm).toEqual({
      series: 'rpm',
      tag: 'ST-',
      attachTo: '',
      thresholds: {
        enabled: false,
        warningMin: null,
        warningMax: null,
        criticalMin: null,
        criticalMax: null,
      },
    });
  });

  it('maps an enabled threshold override into the instrument, and omits a disabled one', () => {
    const value = toMachineFormValue(TCU01_SCHEMATIC, profileOf(TCU01_SCHEMATIC));
    value.sensors[0].thresholds = {
      enabled: true,
      warningMin: 10,
      warningMax: 60,
      criticalMin: 5,
      criticalMax: 70,
    };
    const doc = toSchematicDocument(value, 'tcu') as {
      instruments: readonly { thresholds?: unknown }[];
    };
    expect(doc.instruments[0].thresholds).toEqual({
      warningMin: 10,
      warningMax: 60,
      criticalMin: 5,
      criticalMax: 70,
    });
    expect(doc.instruments[1].thresholds).toBeUndefined();
  });

  it('keeps an empty node tag out of the mapped document', () => {
    const value = toMachineFormValue(TCU01_SCHEMATIC, profileOf(TCU01_SCHEMATIC));
    const mapped = toSchematicDocument(value, 'tcu') as {
      nodes: readonly Record<string, unknown>[];
    };
    const heater = mapped.nodes.find((node) => node['id'] === 'G1');
    expect(heater).toBeDefined();
    expect(heater).not.toHaveProperty('tag');
  });

  it('turns a cleared grid coordinate into an out-of-range cell the validator rejects', () => {
    const value = toMachineFormValue(TCU01_SCHEMATIC, profileOf(TCU01_SCHEMATIC));
    value.nodes[0].column = null;
    const structural = validateSchematic(toSchematicDocument(value, 'tcu'));
    expect(structural.ok).toBe(false);
  });
});

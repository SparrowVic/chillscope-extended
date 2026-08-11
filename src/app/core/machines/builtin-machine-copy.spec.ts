import { describe, expect, it } from 'vitest';

import en from '../../../assets/i18n/en.json';
import pl from '../../../assets/i18n/pl.json';
import { K207_SCHEMATIC } from '../schematic/k207.schematic';
import type { MachineSchematic } from '../schematic/schematic.models';
import { displayMachineName, displayNodeLabel } from './builtin-machine-copy';
import { BUILTIN_MACHINES, CH02_SCHEMATIC, TCU01_SCHEMATIC } from './builtin.machines';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function lookupTranslation(catalogue: unknown, key: string): string {
  let value = catalogue;
  for (const segment of key.split('.')) {
    if (!isRecord(value)) {
      return key;
    }
    value = value[segment];
  }
  return typeof value === 'string' ? value : key;
}

function leafKeys(value: unknown, prefix = ''): readonly string[] {
  if (!isRecord(value)) {
    return prefix === '' ? [] : [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

const translateEn = (key: string): string => lookupTranslation(en, key);
const translatePl = (key: string): string => lookupTranslation(pl, key);

describe('built-in machine copy', () => {
  it('keeps English canonical data in every built-in document', () => {
    expect(BUILTIN_MACHINES.map(({ name }) => name)).toEqual([
      'Chiller K-207',
      'Temperature control unit TCU-01',
      'Chiller CH-02',
    ]);
    expect(TCU01_SCHEMATIC.nodes.map(({ label }) => label)).toContain('MOULD M-31');
    expect(CH02_SCHEMATIC.nodes.map(({ label }) => label)).toEqual([
      'RESERVOIR Z-1',
      'STRAINER F-1',
      'PUMP P-1',
      'MACHINE M-2',
      'COOLER W-1',
      'EVAPORATOR E-1',
      'COMPRESSOR S-1',
      'CONDENSER K-1',
      'FILTER DRIER FD-1',
      'SIGHT GLASS SG-1',
      'EXPANSION VALVE ZR-1',
    ]);
  });

  it('covers every node of every built-in in the closed localisation map', () => {
    // A marker translator resolves any mapped key, so a fallback here means a missing map entry.
    const marked = (key: string): string => `${key}#`;
    for (const machine of BUILTIN_MACHINES) {
      for (const node of machine.nodes) {
        expect(displayNodeLabel(machine.id, node.id, 'MISSING', marked), node.id).not.toBe(
          'MISSING',
        );
      }
    }
  });

  it('resolves the full TCU and CH-02 node vocabularies per machine in English', () => {
    // Canonical fallbacks keep this green while a node's key is still propagating to en.json;
    // once present, the catalogue value must match the canonical label exactly.
    expect(
      TCU01_SCHEMATIC.nodes.map((node) =>
        displayNodeLabel(TCU01_SCHEMATIC.id, node.id, node.label, translateEn),
      ),
    ).toEqual([
      'RESERVOIR Z-1',
      'STRAINER F-1',
      'PUMP P-1',
      'HEATER G-1',
      'RELIEF SV-1',
      'MOULD M-31',
      'COOLING VALVE Y-1',
      'COOLER W-1',
    ]);
    expect(
      CH02_SCHEMATIC.nodes.map((node) =>
        displayNodeLabel(CH02_SCHEMATIC.id, node.id, node.label, translateEn),
      ),
    ).toEqual([
      'RESERVOIR Z-1',
      'STRAINER F-1',
      'PUMP P-1',
      'MACHINE M-2',
      'COOLER W-1',
      'EVAPORATOR E-1',
      'COMPRESSOR S-1',
      'CONDENSER K-1',
      'FILTER DRIER FD-1',
      'SIGHT GLASS SG-1',
      'EXPANSION VALVE ZR-1',
    ]);
  });

  it('localises built-ins in Polish without sharing M1 copy between machines', () => {
    expect(displayMachineName(K207_SCHEMATIC, translatePl)).toBe('Chłodziarka K-207');
    expect(displayMachineName(TCU01_SCHEMATIC, translatePl)).toBe('Termostat TCU-01');
    expect(displayNodeLabel('K-207', 'M1', 'WRONG FALLBACK', translatePl)).toBe('MASZYNA M-207');
    expect(displayNodeLabel('TCU-01', 'M1', 'WRONG FALLBACK', translatePl)).toBe('FORMA M-31');
    expect(displayNodeLabel('CH-02', 'M1', 'WRONG FALLBACK', translatePl)).toBe('MASZYNA M-2');
  });

  it('never replaces user-authored names or labels, even when node ids match a built-in', () => {
    const custom: MachineSchematic = {
      ...K207_SCHEMATIC,
      id: 'CUSTOM-01',
      name: 'My cooling skid',
      nodes: K207_SCHEMATIC.nodes.map((node) =>
        node.id === 'P1' ? { ...node, label: 'CUSTOM BOOSTER' } : node,
      ),
    };

    expect(displayMachineName(custom, translatePl)).toBe('My cooling skid');
    expect(displayNodeLabel(custom.id, 'P1', 'CUSTOM BOOSTER', translatePl)).toBe('CUSTOM BOOSTER');
    expect(displayNodeLabel('K-207', 'X1', 'CUSTOM AUXILIARY', translatePl)).toBe(
      'CUSTOM AUXILIARY',
    );
  });

  it('keeps the English and Polish catalogue key sets identical', () => {
    expect([...leafKeys(en)].sort()).toEqual([...leafKeys(pl)].sort());
  });
});

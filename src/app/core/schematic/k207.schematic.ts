import type { MachineSchematic } from './schematic.models';

/**
 * The default document follows the Z1 → P1 → M1 → W1 → Z1 cooling loop with four ISA-tagged
 * instruments. Built-in copy is canonical English data; presentation
 * surfaces localise it through the closed built-in id map.
 */
export const K207_SCHEMATIC: MachineSchematic = {
  id: 'K-207',
  name: 'Chiller K-207',
  revision: 'B/rev.07',
  profileId: 'chiller',
  nodes: [
    { id: 'P1', type: 'pump', label: 'PUMP P-1', grid: [16, 24], tag: 'ST-104' },
    { id: 'W1', type: 'heatExchanger', label: 'COOLER W-1', grid: [24, 8] },
    { id: 'Z1', type: 'reservoir', label: 'RESERVOIR Z-1', grid: [4, 24], level: true },
    { id: 'M1', type: 'machine', label: 'MACHINE M-207', grid: [36, 16], heatSource: true },
  ],
  pipes: [
    { from: 'Z1', to: 'P1', side: 'cold' },
    { from: 'P1', to: 'M1', side: 'cold' },
    { from: 'M1', to: 'W1', side: 'hot' },
    { from: 'W1', to: 'Z1', side: 'cold' },
  ],
  instruments: [
    { tag: 'TT-101', series: 'temperature', attachTo: 'M1' },
    { tag: 'PT-102', series: 'pressure', attachTo: 'P1' },
    { tag: 'FT-103', series: 'flow', attachTo: 'W1' },
    { tag: 'ST-104', series: 'rpm', attachTo: 'P1' },
  ],
};

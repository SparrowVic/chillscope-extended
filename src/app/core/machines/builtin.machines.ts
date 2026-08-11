import { K207_SCHEMATIC } from '../schematic/k207.schematic';
import type { MachineSchematic } from '../schematic/schematic.models';

/**
 * The built-in machine documents of the library (configurator spec §3). Their names and labels
 * are canonical English data, localised only at presentation boundaries through their stable
 * built-in ids. Built-ins cannot be removed or edited in place — only duplicated.
 */

/**
 * A tool-side temperature control unit: tank → strainer → pump → heater → relief valve →
 * consumer → cooling valve → cooler → tank. The strainer guards the pump suction and the
 * cooling valve modulates the cooler branch, as on every verified TCU (Regloplas 60/Y6,
 * Advantage AVT). The relief valve terminates its own pressure branch off the heater outlet.
 */
export const TCU01_SCHEMATIC: MachineSchematic = {
  id: 'TCU-01',
  name: 'Temperature control unit TCU-01',
  revision: 'A/rev.05',
  profileId: 'tcu',
  nodes: [
    { id: 'Z1', type: 'reservoir', label: 'RESERVOIR Z-1', grid: [0, 16], level: true },
    { id: 'F1', type: 'strainer', label: 'STRAINER F-1', grid: [8, 16] },
    { id: 'P1', type: 'pump', label: 'PUMP P-1', grid: [12, 16], tag: 'ST-104' },
    { id: 'G1', type: 'heater', label: 'HEATER G-1', grid: [20, 16] },
    { id: 'SV1', type: 'safetyValve', label: 'RELIEF SV-1', grid: [24, 12] },
    { id: 'M1', type: 'machine', label: 'MOULD M-31', grid: [32, 16], heatSource: true },
    { id: 'Y1', type: 'valve', label: 'COOLING VALVE Y-1', grid: [28, 4] },
    { id: 'W1', type: 'heatExchanger', label: 'COOLER W-1', grid: [20, 4] },
  ],
  pipes: [
    { from: 'Z1', to: 'F1', side: 'cold' },
    { from: 'F1', to: 'P1', side: 'cold' },
    { from: 'P1', to: 'G1', side: 'cold' },
    { from: 'G1', to: 'M1', side: 'hot' },
    { from: 'G1', to: 'SV1', side: 'hot' },
    { from: 'M1', to: 'Y1', side: 'hot' },
    { from: 'Y1', to: 'W1', side: 'hot' },
    { from: 'W1', to: 'Z1', side: 'cold' },
  ],
  instruments: [
    { tag: 'TT-101', series: 'temperature', attachTo: 'G1' },
    { tag: 'PT-102', series: 'pressure', attachTo: 'P1' },
    { tag: 'FT-103', series: 'flow', attachTo: 'W1' },
    { tag: 'ST-104', series: 'rpm', attachTo: 'P1' },
  ],
};

/**
 * A full chiller: the water circuit (tank → strainer → pump → consumer → evaporator → cooler →
 * tank) and the refrigerant circuit (evaporator → compressor → condenser → filter drier →
 * sight glass → expansion valve → evaporator) share the evaporator, exactly as a shell-and-tube
 * evaporator couples them in a real machine. The liquid line carries its standard filter drier
 * and sight glass (Advantage FYI #279 items 6 and 8) just upstream of the expansion valve.
 */
export const CH02_SCHEMATIC: MachineSchematic = {
  id: 'CH-02',
  name: 'Chiller CH-02',
  revision: 'A/rev.03',
  profileId: 'chiller',
  nodes: [
    { id: 'Z1', type: 'reservoir', label: 'RESERVOIR Z-1', grid: [0, 24], level: true },
    { id: 'F1', type: 'strainer', label: 'STRAINER F-1', grid: [8, 24] },
    { id: 'P1', type: 'pump', label: 'PUMP P-1', grid: [16, 24], tag: 'ST-204' },
    { id: 'M1', type: 'machine', label: 'MACHINE M-2', grid: [32, 24], heatSource: true },
    { id: 'W1', type: 'heatExchanger', label: 'COOLER W-1', grid: [16, 12] },
    { id: 'E1', type: 'evaporator', label: 'EVAPORATOR E-1', grid: [32, 12] },
    { id: 'S1', type: 'compressor', label: 'COMPRESSOR S-1', grid: [44, 12] },
    { id: 'K1', type: 'condenser', label: 'CONDENSER K-1', grid: [40, 0] },
    { id: 'FD1', type: 'filterDrier', label: 'FILTER DRIER FD-1', grid: [16, 4] },
    { id: 'SG1', type: 'sightGlass', label: 'SIGHT GLASS SG-1', grid: [24, 4] },
    { id: 'R1', type: 'expansionValve', label: 'EXPANSION VALVE ZR-1', grid: [32, 4] },
  ],
  pipes: [
    { from: 'Z1', to: 'F1', side: 'cold' },
    { from: 'F1', to: 'P1', side: 'cold' },
    { from: 'P1', to: 'M1', side: 'cold' },
    { from: 'M1', to: 'E1', side: 'hot' },
    { from: 'E1', to: 'W1', side: 'cold' },
    { from: 'W1', to: 'Z1', side: 'cold' },
    { from: 'E1', to: 'S1', side: 'cold' },
    { from: 'S1', to: 'K1', side: 'hot' },
    { from: 'K1', to: 'FD1', side: 'cold' },
    { from: 'FD1', to: 'SG1', side: 'cold' },
    { from: 'SG1', to: 'R1', side: 'cold' },
    { from: 'R1', to: 'E1', side: 'cold' },
  ],
  instruments: [
    { tag: 'TT-201', series: 'temperature', attachTo: 'M1' },
    { tag: 'PT-202', series: 'pressure', attachTo: 'S1' },
    { tag: 'FT-203', series: 'flow', attachTo: 'W1' },
    { tag: 'ST-204', series: 'rpm', attachTo: 'P1' },
  ],
};

export const BUILTIN_MACHINES: readonly MachineSchematic[] = [
  K207_SCHEMATIC,
  TCU01_SCHEMATIC,
  CH02_SCHEMATIC,
];

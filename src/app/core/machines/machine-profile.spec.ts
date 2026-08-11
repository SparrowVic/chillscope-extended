import { describe, expect, it } from 'vitest';
import { K207_SCHEMATIC } from '../schematic/k207.schematic';
import type { MachineSchematic } from '../schematic/schematic.models';
import { CH02_SCHEMATIC, TCU01_SCHEMATIC } from './builtin.machines';
import {
  CHILLER_PROFILE,
  MACHINE_PROFILES,
  TCU_PROFILE,
  validateAgainstProfile,
} from './machine-profile';

describe('machine profiles', () => {
  it('exposes both profiles under their ids', () => {
    expect(MACHINE_PROFILES.tcu).toBe(TCU_PROFILE);
    expect(MACHINE_PROFILES.chiller).toBe(CHILLER_PROFILE);
    expect(TCU_PROFILE.id).toBe('tcu');
    expect(CHILLER_PROFILE.id).toBe('chiller');
  });

  it('uses one 24 px placement cell per integer coordinate', () => {
    expect(TCU_PROFILE.gridSize).toEqual({ cols: 40, rows: 24 });
    expect(CHILLER_PROFILE.gridSize).toEqual({ cols: 48, rows: 32 });
    for (const profile of [TCU_PROFILE, CHILLER_PROFILE]) {
      for (const node of profile.skeletonCircuit) {
        expect(node.grid[0] % 4).toBe(0);
        expect(node.grid[1] % 4).toBe(0);
      }
    }
  });

  it('declares four sensor slots per profile, one per series', () => {
    for (const profile of [TCU_PROFILE, CHILLER_PROFILE]) {
      expect(profile.sensorSlots).toHaveLength(4);
      expect(new Set(profile.sensorSlots.map((slot) => slot.series)).size).toBe(4);
    }
  });
});

describe('validateAgainstProfile', () => {
  it('accepts every built-in document under its own profile', () => {
    expect(validateAgainstProfile(K207_SCHEMATIC, CHILLER_PROFILE)).toEqual([]);
    expect(validateAgainstProfile(TCU01_SCHEMATIC, TCU_PROFILE)).toEqual([]);
    expect(validateAgainstProfile(CH02_SCHEMATIC, CHILLER_PROFILE)).toEqual([]);
  });

  it('rejects a document validated against a foreign profile', () => {
    const errors = validateAgainstProfile(K207_SCHEMATIC, TCU_PROFILE);
    expect(errors.join('\n')).toContain(
      'Document profile "chiller" does not match the validated profile "tcu".',
    );
  });

  it('enforces minimum node counts', () => {
    const doc: MachineSchematic = {
      ...K207_SCHEMATIC,
      nodes: K207_SCHEMATIC.nodes.filter((node) => node.type !== 'pump'),
      pipes: [],
      instruments: [],
    };
    expect(validateAgainstProfile(doc, CHILLER_PROFILE)).toContain(
      'Profile "chiller" requires at least 1 node(s) of type pump; found 0.',
    );
  });

  it('enforces maximum node counts', () => {
    const doc: MachineSchematic = {
      ...K207_SCHEMATIC,
      nodes: [
        ...K207_SCHEMATIC.nodes,
        { id: 'P2', type: 'pump', label: 'POMPA P-2', grid: [2, 2] },
      ],
    };
    expect(validateAgainstProfile(doc, CHILLER_PROFILE)).toContain(
      'Profile "chiller" allows at most 1 node(s) of type pump; found 2.',
    );
  });

  it('lets a TCU carry the fittings of a real unit: cooling valves, strainer, relief valve', () => {
    expect(TCU_PROFILE.nodeRules.valve).toEqual({ min: 0, max: 2 });
    expect(TCU_PROFILE.nodeRules.strainer).toEqual({ min: 0, max: 1 });
    expect(TCU_PROFILE.nodeRules.safetyValve).toEqual({ min: 0, max: 1 });
  });

  it('lets a chiller carry the liquid-line fittings: filter drier, sight glass', () => {
    expect(CHILLER_PROFILE.nodeRules.filterDrier).toEqual({ min: 0, max: 1 });
    expect(CHILLER_PROFILE.nodeRules.sightGlass).toEqual({ min: 0, max: 1 });
    expect(CHILLER_PROFILE.nodeRules.strainer).toEqual({ min: 0, max: 1 });
    expect(CHILLER_PROFILE.nodeRules.safetyValve).toEqual({ min: 0, max: 1 });
  });

  it('keeps the refrigerant liquid-line fittings out of the TCU envelope', () => {
    const doc: MachineSchematic = {
      ...TCU01_SCHEMATIC,
      nodes: [
        ...TCU01_SCHEMATIC.nodes,
        { id: 'FD1', type: 'filterDrier', label: 'FILTER DRIER', grid: [0, 0] },
      ],
    };
    expect(validateAgainstProfile(doc, TCU_PROFILE).join('\n')).toContain(
      'allows at most 0 node(s) of type filterDrier',
    );
  });

  it('rejects refrigeration node types inside the TCU envelope', () => {
    const doc: MachineSchematic = {
      ...TCU01_SCHEMATIC,
      nodes: [
        ...TCU01_SCHEMATIC.nodes,
        { id: 'S1', type: 'compressor', label: 'COMPRESSOR', grid: [0, 0] },
      ],
    };
    expect(validateAgainstProfile(doc, TCU_PROFILE).join('\n')).toContain(
      'allows at most 0 node(s) of type compressor',
    );
  });

  it('enforces the profile grid bounds', () => {
    const doc: MachineSchematic = {
      ...K207_SCHEMATIC,
      nodes: K207_SCHEMATIC.nodes.map((node) =>
        node.id === 'M1' ? { ...node, grid: [48, 16] as const } : node,
      ),
    };
    expect(validateAgainstProfile(doc, CHILLER_PROFILE)).toContain(
      'Node "M1" at grid [48, 16] is outside the profile grid of 48x32 cells.',
    );
  });

  it('requires pipes at all when the profile demands a loop', () => {
    const doc: MachineSchematic = { ...K207_SCHEMATIC, pipes: [] };
    expect(validateAgainstProfile(doc, CHILLER_PROFILE)).toContain(
      'The profile requires a closed piping loop, but the document has no pipes.',
    );
  });

  it('reports the node that breaks loop closure', () => {
    const doc: MachineSchematic = {
      ...K207_SCHEMATIC,
      pipes: K207_SCHEMATIC.pipes.filter((pipe) => pipe.from !== 'W1'),
    };
    const errors = validateAgainstProfile(doc, CHILLER_PROFILE);
    expect(errors).toContain('The piping loop does not close: node "W1" has no outgoing pipe.');
    expect(errors).toContain('The piping loop does not close: node "Z1" has no incoming pipe.');
  });

  it('accepts one terminal safety-valve branch outside the recirculating loop', () => {
    expect(
      validateAgainstProfile(TCU01_SCHEMATIC, TCU_PROFILE).filter((error) =>
        error.includes('piping'),
      ),
    ).toEqual([]);
  });

  it('still rejects an ordinary component used as a terminal branch', () => {
    const doc: MachineSchematic = {
      ...TCU01_SCHEMATIC,
      nodes: TCU01_SCHEMATIC.nodes.map((node) =>
        node.id === 'SV1' ? { ...node, type: 'valve' as const } : node,
      ),
    };
    expect(validateAgainstProfile(doc, TCU_PROFILE)).toContain(
      'The piping loop does not close: node "SV1" has no outgoing pipe.',
    );
  });

  it('reports orphan nodes outside the loop', () => {
    const doc: MachineSchematic = {
      ...K207_SCHEMATIC,
      nodes: [...K207_SCHEMATIC.nodes, { id: 'V1', type: 'valve', label: 'VALVE', grid: [0, 0] }],
    };
    expect(validateAgainstProfile(doc, CHILLER_PROFILE)).toContain(
      'Node "V1" is not connected to the piping loop.',
    );
  });

  it('rejects two disconnected circuits', () => {
    const doc: MachineSchematic = {
      ...K207_SCHEMATIC,
      nodes: [
        ...K207_SCHEMATIC.nodes,
        { id: 'V1', type: 'valve', label: 'VALVE V-1', grid: [0, 0] },
        { id: 'V2', type: 'valve', label: 'VALVE V-2', grid: [2, 0] },
      ],
      pipes: [
        ...K207_SCHEMATIC.pipes,
        { from: 'V1', to: 'V2', side: 'cold' },
        { from: 'V2', to: 'V1', side: 'hot' },
      ],
    };
    expect(validateAgainstProfile(doc, CHILLER_PROFILE)).toContain(
      'The piping does not form a single connected circuit: found 2 disconnected groups.',
    );
  });

  it('rejects weakly connected loops joined by a one-way bridge', () => {
    const doc: MachineSchematic = {
      ...K207_SCHEMATIC,
      pipes: [
        { from: 'Z1', to: 'P1', side: 'cold' },
        { from: 'P1', to: 'Z1', side: 'cold' },
        { from: 'M1', to: 'W1', side: 'hot' },
        { from: 'W1', to: 'M1', side: 'cold' },
        { from: 'P1', to: 'M1', side: 'cold' },
      ],
    };
    expect(validateAgainstProfile(doc, CHILLER_PROFILE)).toContain(
      'The piping is connected but does not form one closed directed circuit.',
    );
  });

  it('accepts the coupled water and refrigerant circuits of CH-02 as one loop', () => {
    expect(
      validateAgainstProfile(CH02_SCHEMATIC, CHILLER_PROFILE).filter((error) =>
        error.includes('piping'),
      ),
    ).toEqual([]);
  });

  it('enforces the tag prefix of the sensor slot', () => {
    const doc: MachineSchematic = {
      ...K207_SCHEMATIC,
      instruments: K207_SCHEMATIC.instruments.map((instrument) =>
        instrument.tag === 'TT-101' ? { ...instrument, tag: 'XX-101' } : instrument,
      ),
    };
    expect(validateAgainstProfile(doc, CHILLER_PROFILE)).toContain(
      'Instrument "XX-101": the tag prefix for series temperature must be "TT".',
    );
  });

  it('enforces the allowed attachment types of the sensor slot', () => {
    const doc: MachineSchematic = {
      ...K207_SCHEMATIC,
      instruments: K207_SCHEMATIC.instruments.map((instrument) =>
        instrument.tag === 'TT-101' ? { ...instrument, attachTo: 'P1' } : instrument,
      ),
    };
    expect(validateAgainstProfile(doc, CHILLER_PROFILE)).toContain(
      'Instrument "TT-101" attaches to node "P1" of type pump; allowed types: machine, evaporator, reservoir.',
    );
  });

  it('requires every required sensor slot to be filled', () => {
    const doc: MachineSchematic = {
      ...K207_SCHEMATIC,
      instruments: K207_SCHEMATIC.instruments.filter((instrument) => instrument.series !== 'flow'),
    };
    expect(validateAgainstProfile(doc, CHILLER_PROFILE)).toContain(
      'Profile "chiller" requires a flow sensor (tag prefix "FT"); none found.',
    );
  });

  it('allows only one instrument in each profile slot', () => {
    const doc: MachineSchematic = {
      ...K207_SCHEMATIC,
      instruments: [
        ...K207_SCHEMATIC.instruments,
        { tag: 'TT-999', series: 'temperature', attachTo: 'M1' },
      ],
    };
    expect(validateAgainstProfile(doc, CHILLER_PROFILE)).toContain(
      'Profile "chiller" allows one temperature instrument slot; found 2.',
    );
  });

  it('collects every profile violation at once', () => {
    const doc: MachineSchematic = {
      ...K207_SCHEMATIC,
      nodes: K207_SCHEMATIC.nodes.filter((node) => node.type !== 'pump'),
      pipes: [],
      instruments: [],
    };
    const errors = validateAgainstProfile(doc, CHILLER_PROFILE);
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });
});

import { describe, expect, it } from 'vitest';
import { K207_SCHEMATIC } from '../schematic/k207.schematic';
import { layoutSchematic, type SchematicLayout } from '../schematic/schematic.layout';
import { validateSchematic } from '../schematic/schematic.validate';
import { BUILTIN_MACHINES, CH02_SCHEMATIC, TCU01_SCHEMATIC } from './builtin.machines';
import { MACHINE_PROFILES, validateAgainstProfile } from './machine-profile';

/** A pipe segment must not cut through any node box it is not connected to. */
function segmentsThroughForeignBoxes(layout: SchematicLayout): string[] {
  const offenders: string[] = [];
  for (const routed of layout.pipes) {
    for (let i = 1; i < routed.points.length; i += 1) {
      const a = routed.points[i - 1];
      const b = routed.points[i];
      for (const positioned of layout.nodes) {
        const { node } = positioned;
        if (node.id === routed.pipe.from || node.id === routed.pipe.to) {
          continue;
        }
        const minX = Math.min(a.x, b.x);
        const maxX = Math.max(a.x, b.x);
        const minY = Math.min(a.y, b.y);
        const maxY = Math.max(a.y, b.y);
        const overlapsX = maxX > positioned.x && minX < positioned.x + positioned.width;
        const overlapsY = maxY > positioned.y && minY < positioned.y + positioned.height;
        if (overlapsX && overlapsY) {
          offenders.push(`${routed.pipe.from}->${routed.pipe.to} crosses ${node.id}`);
        }
      }
    }
  }
  return offenders;
}

describe('built-in machine documents', () => {
  it('registers K-207, TCU-01 and CH-02', () => {
    expect(BUILTIN_MACHINES.map((machine) => machine.id)).toEqual(['K-207', 'TCU-01', 'CH-02']);
  });

  it('gives K-207 the chiller profile', () => {
    expect(K207_SCHEMATIC.profileId).toBe('chiller');
  });

  it('keeps the established machine geometry on the finer integer grid', () => {
    for (const machine of BUILTIN_MACHINES) {
      for (const node of machine.nodes) {
        expect(node.grid[0] % 4, `${machine.id}:${node.id} column`).toBe(0);
        expect(node.grid[1] % 4, `${machine.id}:${node.id} row`).toBe(0);
      }
    }
  });

  for (const machine of [K207_SCHEMATIC, TCU01_SCHEMATIC, CH02_SCHEMATIC]) {
    describe(machine.id, () => {
      it('passes the structural validator', () => {
        const result = validateSchematic(JSON.parse(JSON.stringify(machine)));
        expect(result.ok, JSON.stringify(result)).toBe(true);
      });

      it('passes its profile validator', () => {
        expect(validateAgainstProfile(machine, MACHINE_PROFILES[machine.profileId])).toEqual([]);
      });

      it('lays out cleanly: orthogonal pipes that avoid foreign node boxes', () => {
        const layout = layoutSchematic(machine);
        expect(layout.nodes).toHaveLength(machine.nodes.length);
        expect(layout.pipes).toHaveLength(machine.pipes.length);
        expect(segmentsThroughForeignBoxes(layout)).toEqual([]);
      });
    });
  }

  it('uses the refrigeration node types in CH-02', () => {
    const types = new Set(CH02_SCHEMATIC.nodes.map((node) => node.type));
    for (const type of ['compressor', 'condenser', 'expansionValve', 'evaporator'] as const) {
      expect(types.has(type), type).toBe(true);
    }
  });

  it('carries the liquid-line fittings of a real chiller in CH-02', () => {
    const types = new Set(CH02_SCHEMATIC.nodes.map((node) => node.type));
    for (const type of ['strainer', 'filterDrier', 'sightGlass'] as const) {
      expect(types.has(type), type).toBe(true);
    }
  });

  it('showcases the TCU fittings in TCU-01: strainer, cooling valve, relief valve', () => {
    const types = new Set(TCU01_SCHEMATIC.nodes.map((node) => node.type));
    for (const type of ['strainer', 'valve', 'safetyValve'] as const) {
      expect(types.has(type), type).toBe(true);
    }
  });

  it('places the CH-02 liquid line in refrigerant flow order', () => {
    const order = CH02_SCHEMATIC.pipes.map((pipe) => `${pipe.from}>${pipe.to}`);
    expect(order).toContain('K1>FD1');
    expect(order).toContain('FD1>SG1');
    expect(order).toContain('SG1>R1');
  });

  it('marks CH-02 compressor suction cold and discharge hot', () => {
    expect(CH02_SCHEMATIC.pipes.find((pipe) => pipe.from === 'E1' && pipe.to === 'S1')?.side).toBe(
      'cold',
    );
    expect(CH02_SCHEMATIC.pipes.find((pipe) => pipe.from === 'S1' && pipe.to === 'K1')?.side).toBe(
      'hot',
    );
  });

  it('draws the TCU relief valve as a terminal branch off the hot process loop', () => {
    expect(TCU01_SCHEMATIC.pipes).toContainEqual({ from: 'G1', to: 'M1', side: 'hot' });
    expect(TCU01_SCHEMATIC.pipes).toContainEqual({ from: 'G1', to: 'SV1', side: 'hot' });
    expect(TCU01_SCHEMATIC.pipes.some((pipe) => pipe.from === 'SV1')).toBe(false);
  });

  it('gives every pipe of CH-02 distinct edges on the shared evaporator', () => {
    const layout = layoutSchematic(CH02_SCHEMATIC);
    const edges = layout.pipes
      .filter((routed) => routed.pipe.from === 'E1' || routed.pipe.to === 'E1')
      .map((routed) => (routed.pipe.from === 'E1' ? routed.fromEdge : routed.toEdge));
    expect(edges).toHaveLength(4);
    expect(new Set(edges).size).toBe(4);
  });
});

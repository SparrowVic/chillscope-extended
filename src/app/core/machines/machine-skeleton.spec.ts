import { describe, expect, it } from 'vitest';
import { layoutSchematic, type SchematicLayout } from '../schematic/schematic.layout';
import { validateSchematic } from '../schematic/schematic.validate';
import { CHILLER_PROFILE, TCU_PROFILE, validateAgainstProfile } from './machine-profile';
import { skeletonFor } from './machine-skeleton';

function routeDefects(layout: SchematicLayout): string[] {
  const defects: string[] = [];
  for (const routed of layout.pipes) {
    for (let index = 1; index < routed.points.length; index += 1) {
      const start = routed.points[index - 1];
      const end = routed.points[index];
      if (start.x === end.x && start.y === end.y) {
        defects.push(`${routed.pipe.from}->${routed.pipe.to} has a zero-length segment`);
      }
      for (const positioned of layout.nodes) {
        if (positioned.node.id === routed.pipe.from || positioned.node.id === routed.pipe.to) {
          continue;
        }
        const overlapsX =
          Math.max(start.x, end.x) > positioned.x &&
          Math.min(start.x, end.x) < positioned.x + positioned.width;
        const overlapsY =
          Math.max(start.y, end.y) > positioned.y &&
          Math.min(start.y, end.y) < positioned.y + positioned.height;
        if (overlapsX && overlapsY) {
          defects.push(`${routed.pipe.from}->${routed.pipe.to} crosses ${positioned.node.id}`);
        }
      }
    }
  }
  return defects;
}

describe('skeletonFor', () => {
  for (const profile of [TCU_PROFILE, CHILLER_PROFILE]) {
    describe(`the ${profile.id} skeleton`, () => {
      const skeleton = skeletonFor(profile);

      it('passes the structural validator', () => {
        const result = validateSchematic(JSON.parse(JSON.stringify(skeleton)));
        expect(result.ok, JSON.stringify(result)).toBe(true);
      });

      it('passes its own profile validator', () => {
        expect(validateAgainstProfile(skeleton, profile)).toEqual([]);
      });

      it('carries the profile id and a fresh revision', () => {
        expect(skeleton.profileId).toBe(profile.id);
        expect(skeleton.revision).toBe('A/rev.01');
        expect(skeleton.id.length).toBeGreaterThan(0);
      });

      it('creates exactly the required minimum of every node type', () => {
        for (const [type, rule] of Object.entries(profile.nodeRules)) {
          const count = skeleton.nodes.filter((node) => node.type === type).length;
          expect(count, type).toBe(rule.min);
        }
      });

      it('uses the profile-owned physical order, placement and thermal sides', () => {
        expect(skeleton.nodes.map((node) => ({ type: node.type, grid: node.grid }))).toEqual(
          profile.skeletonCircuit.map((node) => ({ type: node.type, grid: node.grid })),
        );
        expect(skeleton.pipes.map((pipe) => pipe.side)).toEqual(
          profile.skeletonCircuit.map((node) => node.outletSide),
        );
        expect(skeleton.pipes.map((pipe) => `${pipe.from}>${pipe.to}`)).toEqual(
          skeleton.nodes.map(
            (node, index) => `${node.id}>${skeleton.nodes[(index + 1) % skeleton.nodes.length].id}`,
          ),
        );
      });

      it('starts on legacy-aligned cells while allowing one-cell edits afterwards', () => {
        for (const node of skeleton.nodes) {
          expect(node.grid[0] % 4).toBe(0);
          expect(node.grid[1] % 4).toBe(0);
        }
      });

      it('closes the piping into a single loop over all nodes', () => {
        expect(skeleton.pipes).toHaveLength(skeleton.nodes.length);
      });

      it('fills exactly the required sensor slots', () => {
        const required = profile.sensorSlots.filter((slot) => slot.required);
        expect(skeleton.instruments).toHaveLength(required.length);
      });

      it('lays out without throwing', () => {
        const layout = layoutSchematic(skeleton);
        expect(layout.nodes).toHaveLength(skeleton.nodes.length);
        expect(layout.width).toBeGreaterThan(0);
        expect(routeDefects(layout)).toEqual([]);
      });

      it('is deterministic', () => {
        expect(skeletonFor(profile)).toEqual(skeleton);
      });
    });
  }
});

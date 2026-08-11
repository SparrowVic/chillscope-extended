import { describe, expect, it } from 'vitest';

import { CH02_SCHEMATIC } from '../../../core/machines/builtin.machines';
import { K207_SCHEMATIC } from '../../../core/schematic/k207.schematic';
import { layoutSchematic } from '../../../core/schematic/schematic.layout';
import { buildFrame } from './schematic-frame';

function frame() {
  return buildFrame(
    K207_SCHEMATIC,
    layoutSchematic(K207_SCHEMATIC),
    (_nodeId, fallback) => fallback,
  );
}

describe('buildFrame', () => {
  it('derives process chroma from the outlet medium while heat sources remain hot', () => {
    const media = new Map(frame().nodes.map((node) => [node.id, node.medium]));

    expect(media.get('Z1')).toBe('cold');
    expect(media.get('P1')).toBe('cold');
    expect(media.get('W1')).toBe('cold');
    expect(media.get('M1')).toBe('hot');
  });

  it('precomputes stable effect inputs and telemetry metadata outside the render loop', () => {
    const built = frame();
    const pump = built.nodes.find((node) => node.id === 'P1');
    const halo = pump?.fx.find((effect) => effect.kind === 'halo');

    expect(halo).toMatchObject({ drive: 'rpm', activation: 'positive', tone: 'status' });
    expect(halo?.shapeGroups.every((group) => group.shapes.length === 1)).toBe(true);
    expect(pump?.spins[0]).toMatchObject({ drive: 'rpm', kind: 'rotor' });

    const chiller = buildFrame(
      CH02_SCHEMATIC,
      layoutSchematic(CH02_SCHEMATIC),
      (_nodeId, fallback) => fallback,
    );
    const throttle = chiller.nodes
      .flatMap((node) => node.fx)
      .find((effect) => effect.kind === 'throttle');
    expect(throttle?.tone).toBe('cold');
  });

  it('precomputes physical pipe lengths and caps the hand-over choreography below 900ms', () => {
    const built = frame();
    const lastPipeStart = Math.max(
      ...built.pipes.map((pipe) => Number.parseInt(pipe.drawDelay, 10)),
    );

    expect(built.pipes.every((pipe) => pipe.lengthPx > 0)).toBe(true);
    expect(lastPipeStart + 200).toBeLessThan(900);
  });

  it('provides an explicit document key for replaying the hand-over choreography', () => {
    expect(frame().stages).toEqual([{ id: `${K207_SCHEMATIC.id}:${K207_SCHEMATIC.revision}` }]);
  });

  it('gives every component a full rectangular hit target of at least 44 px', () => {
    const chiller = buildFrame(
      CH02_SCHEMATIC,
      layoutSchematic(CH02_SCHEMATIC),
      (_nodeId, fallback) => fallback,
    );
    const sightGlass = chiller.nodes.find((node) => node.type === 'sightGlass');

    expect(chiller.nodes.every((node) => node.hitWidth >= 44 && node.hitHeight >= 44)).toBe(true);
    expect(sightGlass).toMatchObject({ hitX: -4, hitY: -4, hitWidth: 44, hitHeight: 44 });
  });
});

import { describe, expect, it } from 'vitest';

import { TCU01_SCHEMATIC } from '../../../core/machines/builtin.machines';
import { K207_SCHEMATIC } from '../../../core/schematic/k207.schematic';
import {
  PLACEMENT_STEP_PX,
  SCHEMATIC_PADDING_PX,
  layoutSchematic,
} from '../../../core/schematic/schematic.layout';
import type { MachineSchematic } from '../../../core/schematic/schematic.models';
import { TAG_CHIP_HEIGHT_PX, buildDiagram, markerFor } from './diagram-view';

const NODE_LABEL_TEST_CLEARANCE_PX = 20;

describe('buildDiagram', () => {
  it('expands for a stacked boundary tag without extending the editable grid', () => {
    const crowded: MachineSchematic = {
      ...K207_SCHEMATIC,
      nodes: K207_SCHEMATIC.nodes.map((node) =>
        node.id === 'P1' ? { ...node, grid: [16, 28] as const } : node,
      ),
      instruments: K207_SCHEMATIC.instruments.map((instrument) =>
        instrument.tag === 'FT-103' ? { ...instrument, attachTo: 'P1' } : instrument,
      ),
    };
    const grid = { cols: 48, rows: 32 };
    const layout = layoutSchematic(crowded);
    const diagram = buildDiagram(layout, grid);
    const gridRight = SCHEMATIC_PADDING_PX + grid.cols * PLACEMENT_STEP_PX;
    const gridBottom = SCHEMATIC_PADDING_PX + grid.rows * PLACEMENT_STEP_PX;

    expect(diagram.height).toBeGreaterThan(layout.height);
    expect(diagram.height).toBeGreaterThan(
      grid.rows * PLACEMENT_STEP_PX + 2 * SCHEMATIC_PADDING_PX,
    );
    expect(diagram.viewBox).toBe(`0 0 ${diagram.width} ${diagram.height}`);

    const vertical = diagram.gridLines.filter((line) => line.x1 === line.x2);
    const horizontal = diagram.gridLines.filter((line) => line.y1 === line.y2);
    expect(vertical.every((line) => line.y2 === gridBottom)).toBe(true);
    expect(horizontal.every((line) => line.x2 === gridRight)).toBe(true);
  });

  it('keeps sparse major dots while placement lines expose every 24 px position', () => {
    const grid = { cols: 48, rows: 32 };
    const diagram = buildDiagram(layoutSchematic(K207_SCHEMATIC), grid);

    expect(diagram.gridDots).toHaveLength((grid.cols / 4 + 1) * (grid.rows / 4 + 1));
    expect(diagram.gridLines).toHaveLength(grid.cols + grid.rows + 2);
    expect(diagram.gridDots[0]).toEqual({ x: SCHEMATIC_PADDING_PX, y: SCHEMATIC_PADDING_PX });
    expect(diagram.gridDots.at(-1)).toEqual({
      x: SCHEMATIC_PADDING_PX + grid.cols * PLACEMENT_STEP_PX,
      y: SCHEMATIC_PADDING_PX + grid.rows * PLACEMENT_STEP_PX,
    });
  });

  it('carries each tag’s attachment so the hover web can find its node', () => {
    const diagram = buildDiagram(layoutSchematic(K207_SCHEMATIC), { cols: 48, rows: 32 });
    const nodeIds = new Set(K207_SCHEMATIC.nodes.map((node) => node.id));

    expect(diagram.tags).toHaveLength(K207_SCHEMATIC.instruments.length);
    expect(diagram.tags.every((tag) => nodeIds.has(tag.attachTo))).toBe(true);
  });

  it('keeps a bottom instrument chip below the node caption', () => {
    const layout = layoutSchematic(TCU01_SCHEMATIC);
    const diagram = buildDiagram(layout, { cols: 40, rows: 24 });
    const anchorIndex = layout.tags.findIndex(({ instrument }) => instrument.tag === 'FT-103');
    const anchor = layout.tags[anchorIndex];
    const tag = diagram.tags[anchorIndex];
    const node = layout.nodes.find(({ node: candidate }) => candidate.id === anchor?.nodeId);

    expect(anchor?.edge).toBe('bottom');
    expect(tag).toBeDefined();
    expect(node).toBeDefined();
    if (!tag || !node) {
      return;
    }
    expect(tag.y - TAG_CHIP_HEIGHT_PX / 2).toBeGreaterThan(
      node.y + node.height + NODE_LABEL_TEST_CLEARANCE_PX,
    );
  });

  it('derives a restrained medium tint from connected pipes and heat-source semantics', () => {
    const diagram = buildDiagram(layoutSchematic(K207_SCHEMATIC), { cols: 48, rows: 32 });
    const mediumById = new Map(diagram.nodes.map((node) => [node.id, node.medium]));

    expect(mediumById).toEqual(
      new Map([
        ['P1', 'cold'],
        ['W1', 'mixed'],
        ['Z1', 'cold'],
        // M1 touches cold and hot pipes, but its heat-source flag is the stronger semantic.
        ['M1', 'hot'],
      ]),
    );
  });

  it('gives every node at least a 44 px pointer target without changing its symbol box', () => {
    const smallPart: MachineSchematic = {
      ...K207_SCHEMATIC,
      nodes: K207_SCHEMATIC.nodes.map((node, index) =>
        index === 0 ? { ...node, type: 'sightGlass' as const } : node,
      ),
    };
    const diagram = buildDiagram(layoutSchematic(smallPart), { cols: 48, rows: 32 });
    const node = diagram.nodes[0];

    expect(node?.hitWidth).toBe(44);
    expect(node?.hitHeight).toBe(44);
    expect(node?.hitX).toBe(-4);
    expect(node?.hitY).toBe(-4);
  });

  it('compacts a long SVG label while retaining its full accessible value', () => {
    const fullLabel = 'X'.repeat(160);
    const diagram = buildDiagram(
      layoutSchematic(K207_SCHEMATIC),
      { cols: 48, rows: 32 },
      () => fullLabel,
    );

    expect(diagram.nodes[0]?.fullLabel).toBe(fullLabel);
    expect(diagram.nodes[0]?.label).not.toBe(fullLabel);
    expect(diagram.nodes[0]?.label.endsWith('…')).toBe(true);
  });
});

describe('markerFor', () => {
  const layout = layoutSchematic(K207_SCHEMATIC);

  it('draws four corner brackets around a node with the toolbar anchor at its centre', () => {
    const marker = markerFor({ kind: 'node', index: 0 }, layout);

    expect(marker?.kind).toBe('box');
    if (marker?.kind !== 'box') {
      return;
    }
    expect(marker.corners).toHaveLength(4);
    expect(marker.corners.every((corner) => corner.startsWith('M '))).toBe(true);
    expect(marker.mid).toEqual({
      x: marker.x + marker.width / 2,
      y: marker.y + marker.height / 2,
    });
  });

  it('keeps bracket arms shorter than a third of a shallow sensor chip', () => {
    const marker = markerFor({ kind: 'sensor', index: 0 }, layout);

    expect(marker?.kind).toBe('box');
    if (marker?.kind !== 'box') {
      return;
    }
    // Arm length is encoded in the first corner: "M x (y + arm) L x y L (x + arm) y".
    const [, , second] = marker.corners[0]?.split(' ') ?? [];
    const arm = Number(second) - marker.y;
    expect(arm).toBeGreaterThan(0);
    // The chip is shallower than 3 arm lengths, so the arm clamps to a third of its height.
    expect(arm).toBeCloseTo(marker.height / 3, 6);
  });

  it('anchors a pipe’s toolbar at the midpoint of its route', () => {
    const marker = markerFor({ kind: 'pipe', index: 0 }, layout);

    expect(marker?.kind).toBe('pipe');
    if (marker?.kind !== 'pipe') {
      return;
    }
    const routed = layout.pipes[0];
    const xs = routed.points.map((point) => point.x);
    const ys = routed.points.map((point) => point.y);
    expect(marker.mid.x).toBeGreaterThanOrEqual(Math.min(...xs));
    expect(marker.mid.x).toBeLessThanOrEqual(Math.max(...xs));
    expect(marker.mid.y).toBeGreaterThanOrEqual(Math.min(...ys));
    expect(marker.mid.y).toBeLessThanOrEqual(Math.max(...ys));
  });
});

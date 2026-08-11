import { describe, expect, it } from 'vitest';
import { K207_SCHEMATIC } from './k207.schematic';
import {
  PLACEMENT_STEP_PX,
  SCHEMATIC_PADDING_PX,
  isSchematicRoutable,
  layoutSchematic,
  tryLayoutSchematic,
  type NodeEdge,
  type RoutedPipe,
  type SchematicLayout,
} from './schematic.layout';
import type { MachineSchematic } from './schematic.models';
import { validateSchematic } from './schematic.validate';
import {
  COMPRESSOR_PISTON_GROUP_ID,
  HEAT_EXCHANGER_FAN_GROUP_ID,
  NODE_SYMBOLS,
  PUMP_ROTOR_GROUP_ID,
  staticShapesForNode,
} from './symbols';
import { SCHEMATIC_NODE_TYPES } from './schematic.models';

function pipeEdges(routed: RoutedPipe): { nodeId: string; edge: NodeEdge }[] {
  return [
    { nodeId: routed.pipe.from, edge: routed.fromEdge },
    { nodeId: routed.pipe.to, edge: routed.toEdge },
  ];
}

function foreignBoxCrossings(layout: SchematicLayout): string[] {
  const crossings: string[] = [];
  for (const routed of layout.pipes) {
    for (let index = 1; index < routed.points.length; index += 1) {
      const start = routed.points[index - 1];
      const end = routed.points[index];
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
          crossings.push(`${routed.pipe.from}->${routed.pipe.to}:${positioned.node.id}`);
        }
      }
    }
  }
  return crossings;
}

describe('layoutSchematic', () => {
  const layout = layoutSchematic(K207_SCHEMATIC);

  it('is deterministic: the same document yields the identical layout', () => {
    expect(layoutSchematic(K207_SCHEMATIC)).toEqual(layout);
    const reparsed = JSON.parse(JSON.stringify(K207_SCHEMATIC)) as MachineSchematic;
    expect(layoutSchematic(reparsed)).toEqual(layout);
  });

  it('centres every node symbol on its grid cell', () => {
    for (const positioned of layout.nodes) {
      const [column, row] = positioned.node.grid;
      expect(positioned.cx).toBe(SCHEMATIC_PADDING_PX + (column + 0.5) * PLACEMENT_STEP_PX);
      expect(positioned.cy).toBe(SCHEMATIC_PADDING_PX + (row + 0.5) * PLACEMENT_STEP_PX);
      expect(positioned.width).toBe(NODE_SYMBOLS[positioned.node.type].width);
      expect(positioned.x).toBe(positioned.cx - positioned.width / 2);
    }
  });

  it('preserves the original pixel geometry while exposing a 24 px placement step', () => {
    expect(PLACEMENT_STEP_PX).toBe(24);
    const origin = layout.nodes[0];
    expect(origin).toBeDefined();
    if (!origin) return;
    for (const positioned of layout.nodes) {
      const relativeColumn = positioned.node.grid[0] - origin.node.grid[0];
      const relativeRow = positioned.node.grid[1] - origin.node.grid[1];
      expect(Math.abs(relativeColumn % 4)).toBe(0);
      expect(Math.abs(relativeRow % 4)).toBe(0);
      expect(positioned.cx - origin.cx).toBe((relativeColumn / 4) * 96);
      expect(positioned.cy - origin.cy).toBe((relativeRow / 4) * 96);
    }
  });

  it('routes every pipe with orthogonal segments only', () => {
    for (const routed of layout.pipes) {
      expect(routed.points.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < routed.points.length; i++) {
        const previous = routed.points[i - 1];
        const current = routed.points[i];
        const horizontal = previous.y === current.y && previous.x !== current.x;
        const vertical = previous.x === current.x && previous.y !== current.y;
        expect(horizontal || vertical).toBe(true);
      }
    }
  });

  it('never routes with more than two bends', () => {
    for (const routed of layout.pipes) {
      expect(routed.points.length).toBeLessThanOrEqual(4);
    }
  });

  it('routes the aligned Z1 to P1 run as a straight pipe', () => {
    const straight = layout.pipes.find((routed) => routed.pipe.from === 'Z1');
    expect(straight?.points).toHaveLength(2);
    expect(straight?.fromEdge).toBe('right');
    expect(straight?.toEdge).toBe('left');
  });

  it('detours deterministically around a foreign component in the direct path', () => {
    const obstructed: MachineSchematic = {
      id: 'OBSTRUCTED',
      name: 'Obstructed route',
      revision: '1',
      profileId: 'chiller',
      nodes: [
        { id: 'A', type: 'pump', label: 'Source', grid: [0, 4] },
        { id: 'X', type: 'reservoir', label: 'Obstacle', grid: [8, 4] },
        { id: 'B', type: 'pump', label: 'Target', grid: [16, 4] },
      ],
      pipes: [{ from: 'A', to: 'B', side: 'cold' }],
      instruments: [],
    };

    const routed = layoutSchematic(obstructed);
    expect(routed).toEqual(layoutSchematic(obstructed));
    expect(routed.pipes[0].points.length).toBeGreaterThan(2);
    expect(foreignBoxCrossings(routed)).toEqual([]);
  });

  it('never emits a zero-length pipe when two symbol boxes touch', () => {
    const touching: MachineSchematic = {
      id: 'TOUCHING',
      name: 'Touching symbols',
      revision: '1',
      profileId: 'chiller',
      nodes: [
        { id: 'P', type: 'pump', label: 'Pump', grid: [0, 0] },
        { id: 'Z', type: 'reservoir', label: 'Reservoir', grid: [4, 0] },
      ],
      pipes: [{ from: 'P', to: 'Z', side: 'cold' }],
      instruments: [],
    };

    const routed = layoutSchematic(touching).pipes[0];
    for (let index = 1; index < routed.points.length; index += 1) {
      const previous = routed.points[index - 1];
      const current = routed.points[index];
      expect(previous).not.toEqual(current);
    }
  });

  it('starts and ends every pipe on the boundary of its node boxes', () => {
    const byId = new Map(layout.nodes.map((positioned) => [positioned.node.id, positioned]));
    for (const routed of layout.pipes) {
      for (const [point, positioned] of [
        [routed.points[0], byId.get(routed.pipe.from)],
        [routed.points[routed.points.length - 1], byId.get(routed.pipe.to)],
      ] as const) {
        expect(positioned).toBeDefined();
        if (!positioned) continue;
        const onVerticalEdge =
          (point.x === positioned.x || point.x === positioned.x + positioned.width) &&
          point.y >= positioned.y &&
          point.y <= positioned.y + positioned.height;
        const onHorizontalEdge =
          (point.y === positioned.y || point.y === positioned.y + positioned.height) &&
          point.x >= positioned.x &&
          point.x <= positioned.x + positioned.width;
        expect(onVerticalEdge || onHorizontalEdge).toBe(true);
      }
    }
  });

  it('anchors every instrument tag to an edge free of pipe exits', () => {
    const usedByPipes = new Map<string, Set<NodeEdge>>();
    for (const routed of layout.pipes) {
      for (const { nodeId, edge } of pipeEdges(routed)) {
        const edges = usedByPipes.get(nodeId) ?? new Set<NodeEdge>();
        edges.add(edge);
        usedByPipes.set(nodeId, edges);
      }
    }
    for (const tag of layout.tags) {
      expect(usedByPipes.get(tag.nodeId)?.has(tag.edge)).not.toBe(true);
    }
  });

  it('gives the two instruments of P1 distinct edges', () => {
    const onPump = layout.tags.filter((tag) => tag.nodeId === 'P1');
    expect(onPump.map((tag) => tag.instrument.tag)).toEqual(['PT-102', 'ST-104']);
    expect(new Set(onPump.map((tag) => tag.edge)).size).toBe(2);
  });

  it('stacks a third pump instrument when both pipe-free edges are already used', () => {
    const threePumpInstruments: MachineSchematic = {
      ...K207_SCHEMATIC,
      instruments: K207_SCHEMATIC.instruments.map((instrument) =>
        instrument.tag === 'FT-103' ? { ...instrument, attachTo: 'P1' } : instrument,
      ),
    };

    const result = validateSchematic(threePumpInstruments);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const crowded = layoutSchematic(result.doc);
    const onPump = crowded.tags.filter((tag) => tag.nodeId === 'P1');

    expect(onPump.map((tag) => tag.edge)).toEqual(['bottom', 'top', 'bottom']);
    expect(new Set(onPump.map((tag) => `${tag.point.x},${tag.point.y}`)).size).toBe(3);
    expect(onPump[2]?.point.y).toBeGreaterThan(onPump[0]?.point.y ?? Number.POSITIVE_INFINITY);
    expect(crowded.pipes).toEqual(layout.pipes);
    expect(crowded.height).toBeGreaterThan(layout.height);
  });

  it('keeps outward-stacked tags inside a viewBox that can extend left of the grid', () => {
    const leftOnly: MachineSchematic = {
      id: 'EDGE-TAGS',
      name: 'Edge tags',
      revision: '1',
      profileId: 'chiller',
      nodes: [
        { id: 'P', type: 'pump', label: 'Pump', grid: [4, 4] },
        { id: 'A', type: 'reservoir', label: 'Above', grid: [4, 0] },
        { id: 'R', type: 'heatExchanger', label: 'Right', grid: [12, 4] },
        { id: 'B', type: 'machine', label: 'Below', grid: [4, 12] },
      ],
      pipes: [
        { from: 'A', to: 'P', side: 'cold' },
        { from: 'P', to: 'R', side: 'cold' },
        { from: 'B', to: 'P', side: 'hot' },
      ],
      instruments: [
        { tag: 'PT-101', series: 'pressure', attachTo: 'P' },
        { tag: 'FT-102', series: 'flow', attachTo: 'P' },
        { tag: 'ST-103', series: 'rpm', attachTo: 'P' },
      ],
    };
    const result = validateSchematic(leftOnly);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const bounded = layoutSchematic(result.doc);
    const tags = bounded.tags.filter((tag) => tag.nodeId === 'P');

    expect(tags.map((tag) => tag.edge)).toEqual(['left', 'left', 'left']);
    expect(tags[2]?.point.x).toBeLessThan(0);
    expect(bounded.x).toBeLessThan(0);
    for (const tag of tags) {
      expect(tag.point.x).toBeGreaterThanOrEqual(bounded.x + SCHEMATIC_PADDING_PX);
      expect(tag.point.x).toBeLessThanOrEqual(bounded.x + bounded.width - SCHEMATIC_PADDING_PX);
      expect(tag.point.y).toBeGreaterThanOrEqual(bounded.y + SCHEMATIC_PADDING_PX);
      expect(tag.point.y).toBeLessThanOrEqual(bounded.y + bounded.height - SCHEMATIC_PADDING_PX);
    }
  });

  it('sizes the canvas around content instead of carrying empty origin rows and columns', () => {
    for (const positioned of layout.nodes) {
      expect(positioned.x).toBeGreaterThanOrEqual(layout.x + SCHEMATIC_PADDING_PX);
      expect(positioned.y).toBeGreaterThanOrEqual(layout.y + SCHEMATIC_PADDING_PX);
      expect(positioned.x + positioned.width).toBeLessThanOrEqual(
        layout.x + layout.width - SCHEMATIC_PADDING_PX,
      );
      expect(positioned.y + positioned.height).toBeLessThanOrEqual(
        layout.y + layout.height - SCHEMATIC_PADDING_PX,
      );
    }

    const shifted: MachineSchematic = {
      id: 'SHIFTED',
      name: 'Shifted machine',
      revision: '1',
      profileId: 'chiller',
      nodes: [{ id: 'P', type: 'pump', label: 'Pump', grid: [32, 28] }],
      pipes: [],
      instruments: [],
    };
    const shiftedLayout = layoutSchematic(shifted);
    const shiftedNode = shiftedLayout.nodes[0];

    expect(shiftedNode).toBeDefined();
    if (!shiftedNode) return;
    expect(shiftedLayout.x).toBe(shiftedNode.x - SCHEMATIC_PADDING_PX);
    expect(shiftedLayout.y).toBe(shiftedNode.y - SCHEMATIC_PADDING_PX);
    expect(shiftedLayout.width).toBe(shiftedNode.width + 2 * SCHEMATIC_PADDING_PX);
    expect(shiftedLayout.height).toBe(shiftedNode.height + 2 * SCHEMATIC_PADDING_PX);
  });

  it('throws on documents with dangling references instead of drawing nonsense', () => {
    const broken: MachineSchematic = {
      ...K207_SCHEMATIC,
      pipes: [{ from: 'Z1', to: 'GHOST', side: 'cold' }],
    };
    expect(() => layoutSchematic(broken)).toThrowError(/unknown node "GHOST"/);
  });
});

describe('symbol library', () => {
  it('provides a symbol with a consistent viewBox for every node type', () => {
    for (const [type, symbol] of Object.entries(NODE_SYMBOLS)) {
      expect(symbol.viewBox, type).toBe(`0 0 ${symbol.width} ${symbol.height}`);
      expect(symbol.shapes.length, type).toBeGreaterThan(0);
    }
  });

  it('covers every declared node type, including the refrigeration set', () => {
    for (const type of SCHEMATIC_NODE_TYPES) {
      expect(NODE_SYMBOLS[type], type).toBeDefined();
    }
    expect(Object.keys(NODE_SYMBOLS).sort()).toEqual([...SCHEMATIC_NODE_TYPES].sort());
  });

  it('exposes the animated rotor, fan and piston groups for the renderer', () => {
    const leadId = (type: 'pump' | 'heatExchanger' | 'compressor'): string | undefined =>
      NODE_SYMBOLS[type].animatedGroups?.[0]?.id;
    expect(leadId('pump')).toBe(PUMP_ROTOR_GROUP_ID);
    expect(leadId('heatExchanger')).toBe(HEAT_EXCHANGER_FAN_GROUP_ID);
    expect(leadId('compressor')).toBe(COMPRESSOR_PISTON_GROUP_ID);
    expect(NODE_SYMBOLS.reservoir.animatedGroups).toBeUndefined();
  });

  it('keeps every animated group pivot inside its symbol box', () => {
    for (const [type, symbol] of Object.entries(NODE_SYMBOLS)) {
      for (const spin of symbol.animatedGroups ?? []) {
        expect(spin.originX, `${type}:${spin.id} x`).toBeGreaterThanOrEqual(0);
        expect(spin.originX, `${type}:${spin.id} x`).toBeLessThanOrEqual(symbol.width);
        expect(spin.originY, `${type}:${spin.id} y`).toBeGreaterThanOrEqual(0);
        expect(spin.originY, `${type}:${spin.id} y`).toBeLessThanOrEqual(symbol.height);
        expect(spin.shapes.length, `${type}:${spin.id} shapes`).toBeGreaterThan(0);
      }
    }
  });

  it('draws a reservoir level only when the document enables it', () => {
    const reservoir = K207_SCHEMATIC.nodes.find((node) => node.type === 'reservoir');
    expect(reservoir).toBeDefined();
    if (!reservoir) return;

    expect(staticShapesForNode(reservoir)).toHaveLength(NODE_SYMBOLS.reservoir.shapes.length);
    expect(staticShapesForNode({ ...reservoir, level: false })).toHaveLength(1);
  });
});

describe('validated K-207 through the full pipeline', () => {
  it('lays out the validated document identically to the source constant', () => {
    const result = validateSchematic(JSON.parse(JSON.stringify(K207_SCHEMATIC)));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(layoutSchematic(result.doc)).toEqual(layoutSchematic(K207_SCHEMATIC));
    }
  });

  it('reports an exhausted route without hiding unexpected layout faults', () => {
    const blocked: MachineSchematic = {
      ...K207_SCHEMATIC,
      nodes: [
        { id: 'P1', type: 'pump', label: 'PUMP P-1', grid: [16, 16], tag: 'ST-104' },
        { id: 'S1', type: 'compressor', label: 'COMPRESSOR S-1', grid: [24, 16] },
        { id: 'W1', type: 'heatExchanger', label: 'COOLER W-1', grid: [20, 12] },
        { id: 'Z1', type: 'reservoir', label: 'RESERVOIR Z-1', grid: [20, 20], level: true },
        { id: 'M1', type: 'machine', label: 'MACHINE M-207', grid: [20, 16], heatSource: true },
      ],
      pipes: [
        { from: 'Z1', to: 'P1', side: 'cold' },
        { from: 'P1', to: 'M1', side: 'cold' },
        { from: 'M1', to: 'S1', side: 'hot' },
        { from: 'S1', to: 'W1', side: 'hot' },
        { from: 'W1', to: 'Z1', side: 'cold' },
      ],
    };

    expect(isSchematicRoutable(blocked)).toBe(false);
    expect(tryLayoutSchematic(blocked)).toEqual({
      ok: false,
      error: 'Cannot lay out schematic pipe "P1" → "M1" without crossing a node.',
    });
    expect(() =>
      tryLayoutSchematic({
        ...blocked,
        pipes: [{ from: 'GHOST', to: 'P1', side: 'cold' }],
      }),
    ).toThrowError(/unknown node "GHOST"/);
  });
});

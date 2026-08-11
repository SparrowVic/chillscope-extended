import { describe, expect, it } from 'vitest';

import {
  PLACEMENT_STEP_PX,
  SCHEMATIC_PADDING_PX,
} from '../../../core/schematic/schematic.layout';
import {
  blockedCells,
  cellAt,
  dragTargetCell,
  dropVerdict,
  edgeScrollDelta,
  sameCell,
  steppedCell,
  toLayoutPoint,
  type CellOccupant,
} from './diagram-drag';

const GRID = { cols: 40, rows: 24 };

const NODES: readonly CellOccupant[] = [
  { id: 'P1', type: 'pump', grid: [16, 20] },
  { id: 'Z1', type: 'reservoir', grid: [4, 20] },
  { id: 'W1', type: 'heatExchanger', grid: [24, 4] },
];

describe('edgeScrollDelta', () => {
  it('ramps towards each edge and stays still through the viewport centre', () => {
    expect(edgeScrollDelta(100, 100, 500, 40, 16)).toBe(-16);
    expect(edgeScrollDelta(120, 100, 500, 40, 16)).toBe(-8);
    expect(edgeScrollDelta(300, 100, 500, 40, 16)).toBe(0);
    expect(edgeScrollDelta(480, 100, 500, 40, 16)).toBe(8);
    expect(edgeScrollDelta(500, 100, 500, 40, 16)).toBe(16);
  });

  it('clamps pointers outside the viewport and survives unusable geometry', () => {
    expect(edgeScrollDelta(-1_000, 100, 500, 40, 16)).toBe(-16);
    expect(edgeScrollDelta(1_000, 100, 500, 40, 16)).toBe(16);
    expect(edgeScrollDelta(100, 100, 100, 40, 16)).toBe(0);
    expect(edgeScrollDelta(Number.NaN, 100, 500, 40, 16)).toBe(0);
  });
});

describe('toLayoutPoint', () => {
  it('maps client px through the canvas origin at scale 1', () => {
    const point = toLayoutPoint(148, 96, { left: 100, top: 50, width: 1056 }, 1056);
    expect(point).toEqual({ x: 48, y: 46 });
  });

  it('scales client px up when the SVG renders smaller than its viewBox', () => {
    const point = toLayoutPoint(150, 74, { left: 100, top: 50, width: 528 }, 1056);
    expect(point).toEqual({ x: 100, y: 48 });
  });

  it('survives a zero-width box without dividing by zero', () => {
    const point = toLayoutPoint(110, 60, { left: 100, top: 50, width: 0 }, 1056);
    expect(point).toEqual({ x: 10, y: 10 });
  });

  it('maps through a viewBox that extends above and left of the grid', () => {
    const point = toLayoutPoint(148, 74, { left: 100, top: 50, width: 576 }, 1152, -96, -48);
    expect(point).toEqual({ x: 0, y: 0 });
  });
});

describe('cellAt', () => {
  it('snaps a point inside a cell to that cell', () => {
    const point = {
      x: SCHEMATIC_PADDING_PX + 2 * PLACEMENT_STEP_PX + 10,
      y: SCHEMATIC_PADDING_PX + 3 * PLACEMENT_STEP_PX + 18,
    };
    expect(cellAt(point, GRID)).toEqual([2, 3]);
  });

  it('assigns a point exactly on a cell boundary to the later cell', () => {
    const point = {
      x: SCHEMATIC_PADDING_PX + PLACEMENT_STEP_PX,
      y: SCHEMATIC_PADDING_PX,
    };
    expect(cellAt(point, GRID)).toEqual([1, 0]);
  });

  it('returns undefined in the padding margin before the first cell', () => {
    expect(
      cellAt({ x: SCHEMATIC_PADDING_PX - 1, y: SCHEMATIC_PADDING_PX + 1 }, GRID),
    ).toBeUndefined();
  });

  it('returns undefined past the last column', () => {
    const point = {
      x: SCHEMATIC_PADDING_PX + GRID.cols * PLACEMENT_STEP_PX + 1,
      y: SCHEMATIC_PADDING_PX + 1,
    };
    expect(cellAt(point, GRID)).toBeUndefined();
  });

  it('returns undefined past the last row', () => {
    const point = {
      x: SCHEMATIC_PADDING_PX + 1,
      y: SCHEMATIC_PADDING_PX + GRID.rows * PLACEMENT_STEP_PX + 1,
    };
    expect(cellAt(point, GRID)).toBeUndefined();
  });
});

describe('dragTargetCell', () => {
  it('snaps from the node centre even when a wide symbol is grabbed over a neighbouring cell', () => {
    const originCell = [24, 8] as const;
    const grabbedEdge = {
      x: SCHEMATIC_PADDING_PX + 28 * PLACEMENT_STEP_PX + 6,
      y: 300,
    };

    expect(dragTargetCell(originCell, grabbedEdge, { x: grabbedEdge.x + 5, y: 300 }, GRID)).toEqual(
      originCell,
    );
  });

  it('moves only after the original cell centre crosses the next cell boundary', () => {
    const originCell = [16, 12] as const;
    const originPoint = { x: 900, y: 500 };

    expect(
      dragTargetCell(
        originCell,
        originPoint,
        { x: originPoint.x + PLACEMENT_STEP_PX / 2 - 1, y: 500 },
        GRID,
      ),
    ).toEqual(originCell);
    expect(
      dragTargetCell(
        originCell,
        originPoint,
        { x: originPoint.x + PLACEMENT_STEP_PX / 2, y: 500 },
        GRID,
      ),
    ).toEqual([17, 12]);
  });

  it('can recover a wide edge-cell symbol grabbed inside the grid padding', () => {
    const originCell = [0, 8] as const;
    const originPoint = { x: SCHEMATIC_PADDING_PX - 20, y: 300 };

    expect(dragTargetCell(originCell, originPoint, { x: originPoint.x + 8, y: 300 }, GRID)).toEqual(
      originCell,
    );
  });
});

describe('sameCell', () => {
  it('compares coordinates rather than tuple identity', () => {
    expect(sameCell([2, 3], [2, 3])).toBe(true);
    expect(sameCell([2, 3], [3, 2])).toBe(false);
  });
});

describe('dropVerdict', () => {
  it('accepts a free cell', () => {
    expect(dropVerdict(NODES, GRID, 'P1', [8, 8])).toBe('free');
  });

  it('accepts the moved node dropping back onto its own cell', () => {
    expect(dropVerdict(NODES, GRID, 'P1', [16, 20])).toBe('free');
  });

  it('rejects a cell another node occupies', () => {
    expect(dropVerdict(NODES, GRID, 'P1', [4, 20])).toBe('occupied');
  });

  it('rejects a wide symbol overlapping a neighbour without sharing its cell', () => {
    expect(dropVerdict(NODES, GRID, 'W1', [20, 20])).toBe('occupied');
  });

  it('rejects an undefined target as out of bounds', () => {
    expect(dropVerdict(NODES, GRID, 'P1', undefined)).toBe('outOfBounds');
  });

  it('rejects cells outside the grid on every side', () => {
    expect(dropVerdict(NODES, GRID, 'P1', [-1, 0])).toBe('outOfBounds');
    expect(dropVerdict(NODES, GRID, 'P1', [0, -1])).toBe('outOfBounds');
    expect(dropVerdict(NODES, GRID, 'P1', [GRID.cols, 0])).toBe('outOfBounds');
    expect(dropVerdict(NODES, GRID, 'P1', [0, GRID.rows])).toBe('outOfBounds');
  });
});

describe('blockedCells', () => {
  function has(cells: readonly (readonly [number, number])[], target: readonly [number, number]) {
    return cells.some((cell) => cell[0] === target[0] && cell[1] === target[1]);
  }

  it('tints occupied footprints but never the moved node’s own cell', () => {
    const cells = blockedCells(NODES, GRID, 'P1');
    expect(has(cells, [4, 20])).toBe(true);
    expect(has(cells, [24, 4])).toBe(true);
    expect(has(cells, [16, 20])).toBe(false);
    expect(has(cells, [8, 8])).toBe(false);
  });

  it('widens the no-go zone by the neighbouring symbol’s box beyond its own cell', () => {
    // The exchanger at [6, 1] is wide: the pump cannot land beside it in the same row.
    const cells = blockedCells(NODES, GRID, 'P1');
    expect(has(cells, [23, 4])).toBe(true);
    expect(has(cells, [25, 4])).toBe(true);
    expect(has(cells, [20, 0])).toBe(false);
  });

  it('widens the no-go zone by the moved symbol’s own box', () => {
    // Mirrors the dropVerdict case: the wide exchanger overlaps the pump from a neighbour cell.
    const cells = blockedCells(NODES, GRID, 'W1');
    expect(has(cells, [20, 20])).toBe(true);
  });

  it('returns only cells inside the grid', () => {
    const cells = blockedCells(NODES, GRID, 'P1');
    expect(
      cells.every(
        (cell) => cell[0] >= 0 && cell[1] >= 0 && cell[0] < GRID.cols && cell[1] < GRID.rows,
      ),
    ).toBe(true);
  });

  it('blocks the whole grid for an unknown mover, like dropVerdict does', () => {
    expect(blockedCells(NODES, GRID, 'missing')).toHaveLength(GRID.cols * GRID.rows);
  });
});

describe('steppedCell', () => {
  it('moves one cell per arrow key', () => {
    expect(PLACEMENT_STEP_PX).toBe(24);
    expect(steppedCell([12, 12], 'ArrowLeft')).toEqual([11, 12]);
    expect(steppedCell([12, 12], 'ArrowRight')).toEqual([13, 12]);
    expect(steppedCell([12, 12], 'ArrowUp')).toEqual([12, 11]);
    expect(steppedCell([12, 12], 'ArrowDown')).toEqual([12, 13]);
  });

  it('ignores non-arrow keys', () => {
    expect(steppedCell([3, 3], 'Enter')).toBeUndefined();
  });

  it('steps off the grid so the verdict can reject the move', () => {
    expect(dropVerdict(NODES, GRID, 'Z1', steppedCell([0, 0], 'ArrowLeft'))).toBe('outOfBounds');
  });
});

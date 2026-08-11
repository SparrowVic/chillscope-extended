import {
  PLACEMENT_STEP_PX,
  SCHEMATIC_PADDING_PX,
  nodeSymbolsOverlap,
} from '../../../core/schematic/schematic.layout';
import type { GridPosition, SchematicNodeType } from '../../../core/schematic/schematic.models';

/**
 * Pure drag-target maths for the Diagram tab (configurator spec §4.3): pointer px → layout
 * coordinates → grid cell → accept/reject. No DOM types beyond plain numbers, so every rule the
 * canvas enforces — snapping, bounds, collisions, keyboard steps — is testable without a browser.
 */

export interface LayoutPoint {
  readonly x: number;
  readonly y: number;
}

export interface CanvasBox {
  readonly left: number;
  readonly top: number;
  /** Rendered width of the SVG in client px; the viewBox may be scaled to it. */
  readonly width: number;
}

export interface GridSize {
  readonly cols: number;
  readonly rows: number;
}

export interface CellOccupant {
  readonly id: string;
  readonly type: SchematicNodeType;
  readonly grid: GridPosition;
}

export type DropVerdict = 'free' | 'occupied' | 'outOfBounds';

/**
 * Horizontal scroll step for a dragged pointer near a viewport edge. The ramp is proportional so
 * entering the zone feels magnetic rather than abrupt, while clamping keeps an off-screen pointer
 * from accelerating the canvas without bound.
 */
export function edgeScrollDelta(
  pointerX: number,
  left: number,
  right: number,
  edgeSize: number,
  maxStep: number,
): number {
  const width = right - left;
  const edge = Math.min(edgeSize, width / 2);
  if (edge <= 0 || maxStep <= 0 || !Number.isFinite(pointerX)) {
    return 0;
  }
  if (pointerX < left + edge) {
    const strength = Math.min(1, (left + edge - pointerX) / edge);
    return -Math.ceil(maxStep * strength);
  }
  if (pointerX > right - edge) {
    const strength = Math.min(1, (pointerX - (right - edge)) / edge);
    return Math.ceil(maxStep * strength);
  }
  return 0;
}

/**
 * Client px → layout (viewBox) coordinates. The SVG preserves its aspect ratio, so one uniform
 * scale factor relates the rendered box to the layout; a zero-width box (display: none) maps
 * through unscaled rather than dividing by zero.
 */
export function toLayoutPoint(
  clientX: number,
  clientY: number,
  box: CanvasBox,
  layoutWidth: number,
  layoutX = 0,
  layoutY = 0,
): LayoutPoint {
  const scale = box.width > 0 ? layoutWidth / box.width : 1;
  return {
    x: layoutX + (clientX - box.left) * scale,
    y: layoutY + (clientY - box.top) * scale,
  };
}

/** The grid cell under a layout point, or undefined outside the padded grid area. */
export function cellAt(point: LayoutPoint, grid: GridSize): GridPosition | undefined {
  const column = Math.floor((point.x - SCHEMATIC_PADDING_PX) / PLACEMENT_STEP_PX);
  const row = Math.floor((point.y - SCHEMATIC_PADDING_PX) / PLACEMENT_STEP_PX);
  return isInside(column, row, grid) ? [column, row] : undefined;
}

/**
 * The target cell after moving a node by the pointer delta. Snapping follows the node's original
 * cell centre, not the exact point where the symbol was grabbed; wide symbols therefore behave
 * identically whether the operator picks them up in the middle or near an overhanging edge.
 */
export function dragTargetCell(
  originCell: GridPosition,
  originPoint: LayoutPoint,
  point: LayoutPoint,
  grid: GridSize,
): GridPosition | undefined {
  return cellAt(
    {
      x:
        SCHEMATIC_PADDING_PX +
        (originCell[0] + 0.5) * PLACEMENT_STEP_PX +
        (point.x - originPoint.x),
      y:
        SCHEMATIC_PADDING_PX +
        (originCell[1] + 0.5) * PLACEMENT_STEP_PX +
        (point.y - originPoint.y),
    },
    grid,
  );
}

export function sameCell(a: GridPosition, b: GridPosition): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * Judges a drop of `movedId` onto `cell` using the rendered symbol boxes. A node's own placement
 * counts as free — dropping in place is a no-op, not a rejection.
 */
export function dropVerdict(
  nodes: readonly CellOccupant[],
  grid: GridSize,
  movedId: string,
  cell: GridPosition | undefined,
): DropVerdict {
  if (cell === undefined || !isInside(cell[0], cell[1], grid)) {
    return 'outOfBounds';
  }
  const moved = nodes.find((node) => node.id === movedId);
  if (moved === undefined) {
    return 'occupied';
  }
  const taken = nodes.some(
    (node) => node.id !== movedId && nodeSymbolsOverlap({ type: moved.type, grid: cell }, node),
  );
  return taken ? 'occupied' : 'free';
}

/**
 * Every grid cell the moved node cannot land on — the other nodes' footprints widened by the
 * moved symbol's own box. While a drag is up, the canvas tints exactly these cells with the
 * critical hue so the pilot sees the no-go zones before hovering them.
 */
export function blockedCells(
  nodes: readonly CellOccupant[],
  grid: GridSize,
  movedId: string,
): readonly GridPosition[] {
  const blocked: GridPosition[] = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.cols; column += 1) {
      if (dropVerdict(nodes, grid, movedId, [column, row]) !== 'free') {
        blocked.push([column, row]);
      }
    }
  }
  return blocked;
}

/** One arrow-key step from a cell; undefined for keys that are not arrows. */
export function steppedCell(cell: GridPosition, key: string): GridPosition | undefined {
  switch (key) {
    case 'ArrowLeft':
      return [cell[0] - 1, cell[1]];
    case 'ArrowRight':
      return [cell[0] + 1, cell[1]];
    case 'ArrowUp':
      return [cell[0], cell[1] - 1];
    case 'ArrowDown':
      return [cell[0], cell[1] + 1];
    default:
      return undefined;
  }
}

function isInside(column: number, row: number, grid: GridSize): boolean {
  return column >= 0 && row >= 0 && column < grid.cols && row < grid.rows;
}

import {
  PLACEMENT_STEP_PX,
  SCHEMATIC_PADDING_PX,
  TAG_ANCHOR_GAP_PX,
  type TagAnchor,
  type SchematicLayout,
} from '../../../core/schematic/schematic.layout';
import type { GridPosition, PipeSide } from '../../../core/schematic/schematic.models';
import {
  NODE_SYMBOLS,
  staticShapesForNode,
  type SymbolShape,
} from '../../../core/schematic/symbols';
import { compactSvgLabel } from '../../../shared/svg-label';
import type { GridSize } from './diagram-drag';

/**
 * Render-ready view models for the Diagram tab's edit canvas. Like the dashboard's
 * `schematic-frame`, everything positional is resolved here so the template only interpolates.
 * The canvas differs from the dashboard renderer on purpose: it draws the profile's whole grid
 * (drop targets need empty cells), static symbols (an edit surface does not animate) and plain
 * tag chips instead of live instrument readings.
 */

const NODE_LABEL_GAP_PX = 16;
const NODE_LABEL_HEIGHT_PX = 12;
export const TAG_CHIP_WIDTH_PX = 60;
export const TAG_CHIP_HEIGHT_PX = 22;
export const TAG_HIT_HEIGHT_PX = 40;
const TAG_VISUAL_GAP_PX = 8;
const NODE_HIT_SIZE_PX = 44;
/** Breathing room between a symbol box and its selection marker. */
const MARKER_MARGIN_PX = 7;
/** Arm length of a selection corner bracket, clamped so small boxes keep open sides. */
const BRACKET_ARM_PX = 14;
/** Resting dots mark the original 96 px engineering grid without duplicating every 24 px line. */
const MAJOR_GRID_STRIDE = 4;

export interface DiagramLine {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface DiagramNodeVm {
  readonly index: number;
  readonly id: string;
  readonly label: string;
  /** Layout position of the symbol box; the template positions via CSS transform so drops can settle on a spring. */
  readonly x: number;
  readonly y: number;
  readonly shapes: readonly SymbolShape[];
  readonly spinShapes?: readonly SymbolShape[];
  readonly medium: DiagramNodeMedium;
  readonly fullLabel: string;
  readonly labelX: number;
  readonly labelY: number;
  readonly hitX: number;
  readonly hitY: number;
  readonly hitWidth: number;
  readonly hitHeight: number;
}

export type DiagramNodeMedium = 'cold' | 'hot' | 'mixed';

export interface DiagramPipeVm {
  readonly index: number;
  readonly points: string;
  readonly side: PipeSide;
  readonly from: string;
  readonly to: string;
}

export interface DiagramTagVm {
  readonly index: number;
  readonly tag: string;
  /** Id of the node the instrument hangs off — the hover dependency web follows it. */
  readonly attachTo: string;
  readonly x: number;
  readonly y: number;
}

export interface DiagramVm {
  readonly viewBox: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly gridLines: readonly DiagramLine[];
  /** Cell intersections — the resting hint of the grid before a drag materialises the lines. */
  readonly gridDots: readonly DiagramHandle[];
  readonly nodes: readonly DiagramNodeVm[];
  readonly pipes: readonly DiagramPipeVm[];
  readonly tags: readonly DiagramTagVm[];
}

export function buildDiagram(
  layout: SchematicLayout,
  grid: GridSize,
  labelOf: (nodeId: string, fallback: string) => string = (_nodeId, fallback) => fallback,
): DiagramVm {
  const gridRight = grid.cols * PLACEMENT_STEP_PX + 2 * SCHEMATIC_PADDING_PX;
  const gridBottom = grid.rows * PLACEMENT_STEP_PX + 2 * SCHEMATIC_PADDING_PX;
  const tags = layout.tags.map((anchor, index) => {
    const point = diagramTagPoint(anchor);
    return {
      index,
      tag: anchor.instrument.tag,
      attachTo: anchor.instrument.attachTo,
      ...point,
    };
  });
  const markerMargin = MARKER_MARGIN_PX / 2;
  const x = Math.min(
    0,
    layout.x,
    ...tags.map((tag) => tag.x - TAG_CHIP_WIDTH_PX / 2 - markerMargin),
  );
  const y = Math.min(
    0,
    layout.y,
    ...tags.map((tag) => tag.y - TAG_CHIP_HEIGHT_PX / 2 - markerMargin),
  );
  const right = Math.max(
    gridRight,
    layout.x + layout.width,
    ...tags.map((tag) => tag.x + TAG_CHIP_WIDTH_PX / 2 + markerMargin),
  );
  const bottom = Math.max(
    gridBottom,
    layout.y + layout.height,
    ...tags.map((tag) => tag.y + TAG_CHIP_HEIGHT_PX / 2 + markerMargin),
  );
  const width = right - x;
  const height = bottom - y;
  return {
    viewBox: `${x} ${y} ${width} ${height}`,
    x,
    y,
    width,
    height,
    gridLines: gridLines(grid),
    gridDots: gridDots(grid),
    nodes: layout.nodes.map((positioned, index) => {
      const symbol = NODE_SYMBOLS[positioned.node.type];
      const fullLabel = labelOf(positioned.node.id, positioned.node.label);
      const hitWidth = Math.max(positioned.width, NODE_HIT_SIZE_PX);
      const hitHeight = Math.max(positioned.height, NODE_HIT_SIZE_PX);
      return {
        index,
        id: positioned.node.id,
        label: compactSvgLabel(fullLabel),
        fullLabel,
        x: positioned.x,
        y: positioned.y,
        shapes: staticShapesForNode(positioned.node),
        ...(symbol.animatedGroups?.length
          ? { spinShapes: symbol.animatedGroups.flatMap((group) => group.shapes) }
          : {}),
        medium: mediumForNode(layout, positioned.node.id, positioned.node.heatSource === true),
        labelX: positioned.width / 2,
        labelY: positioned.height + NODE_LABEL_GAP_PX,
        hitX: (positioned.width - hitWidth) / 2,
        hitY: (positioned.height - hitHeight) / 2,
        hitWidth,
        hitHeight,
      };
    }),
    pipes: layout.pipes.map((routed, index) => ({
      index,
      points: routed.points.map((point) => `${point.x},${point.y}`).join(' '),
      side: routed.pipe.side,
      from: routed.pipe.from,
      to: routed.pipe.to,
    })),
    tags,
  };
}

/** Keep compact edit chips clear of both the symbol box and its always-bottom node caption. */
function diagramTagPoint(anchor: TagAnchor): DiagramHandle {
  const horizontalOffset = TAG_CHIP_WIDTH_PX / 2 + TAG_VISUAL_GAP_PX - TAG_ANCHOR_GAP_PX;
  const topOffset = TAG_CHIP_HEIGHT_PX / 2 + TAG_VISUAL_GAP_PX - TAG_ANCHOR_GAP_PX;
  const bottomOffset =
    NODE_LABEL_GAP_PX +
    NODE_LABEL_HEIGHT_PX / 2 +
    TAG_VISUAL_GAP_PX +
    TAG_CHIP_HEIGHT_PX / 2 -
    TAG_ANCHOR_GAP_PX;
  switch (anchor.edge) {
    case 'left':
      return { x: anchor.point.x - horizontalOffset, y: anchor.point.y };
    case 'right':
      return { x: anchor.point.x + horizontalOffset, y: anchor.point.y };
    case 'top':
      return { x: anchor.point.x, y: anchor.point.y - topOffset };
    case 'bottom':
      return { x: anchor.point.x, y: anchor.point.y + bottomOffset };
  }
}

function mediumForNode(
  layout: SchematicLayout,
  nodeId: string,
  heatSource: boolean,
): DiagramNodeMedium {
  if (heatSource) {
    return 'hot';
  }
  let cold = false;
  let hot = false;
  for (const routed of layout.pipes) {
    if (routed.pipe.from !== nodeId && routed.pipe.to !== nodeId) {
      continue;
    }
    cold ||= routed.pipe.side === 'cold';
    hot ||= routed.pipe.side === 'hot';
  }
  return cold && hot ? 'mixed' : hot ? 'hot' : 'cold';
}

function gridDots(grid: GridSize): DiagramHandle[] {
  const dots: DiagramHandle[] = [];
  for (const column of majorGridStops(grid.cols)) {
    for (const row of majorGridStops(grid.rows)) {
      dots.push({
        x: SCHEMATIC_PADDING_PX + column * PLACEMENT_STEP_PX,
        y: SCHEMATIC_PADDING_PX + row * PLACEMENT_STEP_PX,
      });
    }
  }
  return dots;
}

function gridLines(grid: GridSize): DiagramLine[] {
  const lines: DiagramLine[] = [];
  const right = SCHEMATIC_PADDING_PX + grid.cols * PLACEMENT_STEP_PX;
  const bottom = SCHEMATIC_PADDING_PX + grid.rows * PLACEMENT_STEP_PX;
  for (let column = 0; column <= grid.cols; column += 1) {
    const x = SCHEMATIC_PADDING_PX + column * PLACEMENT_STEP_PX;
    lines.push({ x1: x, y1: SCHEMATIC_PADDING_PX, x2: x, y2: bottom });
  }
  for (let row = 0; row <= grid.rows; row += 1) {
    const y = SCHEMATIC_PADDING_PX + row * PLACEMENT_STEP_PX;
    lines.push({ x1: SCHEMATIC_PADDING_PX, y1: y, x2: right, y2: y });
  }
  return lines;
}

function majorGridStops(size: number): readonly number[] {
  const stops: number[] = [];
  for (let position = 0; position <= size; position += MAJOR_GRID_STRIDE) {
    stops.push(position);
  }
  if (stops.at(-1) !== size) {
    stops.push(size);
  }
  return stops;
}

export interface DiagramHandle {
  readonly x: number;
  readonly y: number;
}

/**
 * K3 selection language, instrument edition: four corner brackets that draw in around the
 * selection — a shape cue, never colour alone. `mid` anchors the floating mini-toolbar.
 */
export type DiagramMarker =
  | {
      readonly kind: 'box';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      /** Path `d` per corner bracket, in reading order from the top-left. */
      readonly corners: readonly string[];
      readonly mid: DiagramHandle;
    }
  | {
      readonly kind: 'pipe';
      readonly points: string;
      readonly ends: readonly DiagramHandle[];
      readonly mid: DiagramHandle;
    };

export interface DiagramSelection {
  readonly kind: 'node' | 'pipe' | 'sensor';
  readonly index: number;
}

export function markerFor(
  selection: DiagramSelection,
  layout: SchematicLayout,
): DiagramMarker | undefined {
  if (selection.kind === 'node') {
    const positioned = layout.nodes[selection.index];
    return positioned
      ? boxMarker(
          positioned.x - MARKER_MARGIN_PX,
          positioned.y - MARKER_MARGIN_PX,
          positioned.width + 2 * MARKER_MARGIN_PX,
          positioned.height + 2 * MARKER_MARGIN_PX,
        )
      : undefined;
  }
  if (selection.kind === 'sensor') {
    const anchor = layout.tags[selection.index];
    const point = anchor ? diagramTagPoint(anchor) : undefined;
    return anchor
      ? boxMarker(
          (point?.x ?? anchor.point.x) - TAG_CHIP_WIDTH_PX / 2 - MARKER_MARGIN_PX / 2,
          (point?.y ?? anchor.point.y) - TAG_CHIP_HEIGHT_PX / 2 - MARKER_MARGIN_PX / 2,
          TAG_CHIP_WIDTH_PX + MARKER_MARGIN_PX,
          TAG_CHIP_HEIGHT_PX + MARKER_MARGIN_PX,
        )
      : undefined;
  }
  const routed = layout.pipes[selection.index];
  if (!routed) {
    return undefined;
  }
  const first = routed.points[0];
  const last = routed.points[routed.points.length - 1];
  const a = routed.points[Math.floor((routed.points.length - 1) / 2)];
  const b = routed.points[Math.ceil((routed.points.length - 1) / 2)];
  return {
    kind: 'pipe',
    points: routed.points.map((point) => `${point.x},${point.y}`).join(' '),
    ends: first && last ? [first, last] : [],
    mid: a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: 0, y: 0 },
  };
}

function boxMarker(x: number, y: number, width: number, height: number): DiagramMarker {
  const arm = Math.min(BRACKET_ARM_PX, width / 3, height / 3);
  const right = x + width;
  const bottom = y + height;
  const corners = [
    `M ${x} ${y + arm} L ${x} ${y} L ${x + arm} ${y}`,
    `M ${right - arm} ${y} L ${right} ${y} L ${right} ${y + arm}`,
    `M ${right} ${bottom - arm} L ${right} ${bottom} L ${right - arm} ${bottom}`,
    `M ${x + arm} ${bottom} L ${x} ${bottom} L ${x} ${bottom - arm}`,
  ];
  return {
    kind: 'box',
    x,
    y,
    width,
    height,
    corners,
    mid: { x: x + width / 2, y: y + height / 2 },
  };
}

/** The ghost rectangle for a drag target cell. */
export function cellRect(cell: GridPosition): { x: number; y: number; size: number } {
  return {
    x: SCHEMATIC_PADDING_PX + cell[0] * PLACEMENT_STEP_PX,
    y: SCHEMATIC_PADDING_PX + cell[1] * PLACEMENT_STEP_PX,
    size: PLACEMENT_STEP_PX,
  };
}

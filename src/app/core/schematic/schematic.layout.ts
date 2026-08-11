import type { Instrument, MachineSchematic, Pipe, SchematicNode } from './schematic.models';
import { NODE_SYMBOLS } from './symbols';

/**
 * Pure grid layout for a validated schematic: grid cells to px, orthogonal (Manhattan) pipe
 * routing that keeps clear of component boxes, and anchor points for instrument tags on a free
 * node edge.
 * Deterministic — the same document always produces the identical layout.
 */
export const PLACEMENT_STEP_PX = 24;
export const SCHEMATIC_PADDING_PX = 48;
export const TAG_ANCHOR_GAP_PX = 16;

export type NodeSymbolPlacement = Pick<SchematicNode, 'type' | 'grid'>;

/** True when two centred symbol boxes intersect with positive area; touching edges are valid. */
export function nodeSymbolsOverlap(a: NodeSymbolPlacement, b: NodeSymbolPlacement): boolean {
  const symbolA = NODE_SYMBOLS[a.type];
  const symbolB = NODE_SYMBOLS[b.type];
  const distanceX = Math.abs(a.grid[0] - b.grid[0]) * PLACEMENT_STEP_PX;
  const distanceY = Math.abs(a.grid[1] - b.grid[1]) * PLACEMENT_STEP_PX;
  return (
    distanceX < (symbolA.width + symbolB.width) / 2 &&
    distanceY < (symbolA.height + symbolB.height) / 2
  );
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type NodeEdge = 'top' | 'right' | 'bottom' | 'left';

export interface PositionedNode {
  readonly node: SchematicNode;
  /** Top-left corner of the symbol box, px. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Centre of the grid cell (and of the symbol box), px. */
  readonly cx: number;
  readonly cy: number;
}

export interface RoutedPipe {
  readonly pipe: Pipe;
  /** Polyline through px coordinates; every segment is horizontal or vertical. */
  readonly points: readonly Point[];
  readonly fromEdge: NodeEdge;
  readonly toEdge: NodeEdge;
}

export interface TagAnchor {
  readonly instrument: Instrument;
  readonly nodeId: string;
  /** The node edge the tag hangs off — chosen to avoid the node's pipe exits. */
  readonly edge: NodeEdge;
  readonly point: Point;
}

export interface SchematicLayout {
  /** Top-left coordinate of the viewBox; it may be negative when tags stack above or left. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly PositionedNode[];
  readonly pipes: readonly RoutedPipe[];
  readonly tags: readonly TagAnchor[];
}

export type SchematicLayoutResult =
  | { readonly ok: true; readonly layout: SchematicLayout }
  | { readonly ok: false; readonly error: string };

/** Bottom first because the mockup hangs tags below their node whenever the loop allows it. */
const TAG_EDGE_PRIORITY: readonly NodeEdge[] = ['bottom', 'top', 'right', 'left'];

interface EdgeUse {
  readonly pipeCount: number;
  readonly tagCount: number;
}

type EdgeUses = Map<string, Map<NodeEdge, EdgeUse>>;

const EMPTY_EDGE_USE: EdgeUse = { pipeCount: 0, tagCount: 0 };
const TAG_STACK_STEP_PX = 96;
const ROUTE_CLEARANCE_PX = 8;
const ROUTE_STUB_PX = 12;
const ROUTE_BEND_PENALTY = 384;
const ROUTE_EDGE_ORDER: readonly NodeEdge[] = ['right', 'bottom', 'left', 'top'];

class SchematicRoutingError extends Error {
  constructor(pipe: Pipe) {
    super(`Cannot lay out schematic pipe "${pipe.from}" → "${pipe.to}" without crossing a node.`);
    this.name = 'SchematicRoutingError';
  }
}

/** Expects a document that passed `validateSchematic`; throws on dangling references. */
export function layoutSchematic(doc: MachineSchematic): SchematicLayout {
  const nodes = doc.nodes.map(positionNode);
  const byId = new Map(nodes.map((positioned) => [positioned.node.id, positioned]));
  const resolve = (id: string): PositionedNode => {
    const positioned = byId.get(id);
    if (!positioned) {
      throw new Error(
        `Cannot lay out schematic "${doc.id}": unknown node "${id}". Validate first.`,
      );
    }
    return positioned;
  };

  const edgeUses: EdgeUses = new Map();

  const pipes = doc.pipes.map((pipe) => {
    const routed = routePipe(pipe, resolve(pipe.from), resolve(pipe.to), nodes);
    recordEdgeUse(edgeUses, pipe.from, routed.fromEdge, 'pipeCount');
    recordEdgeUse(edgeUses, pipe.to, routed.toEdge, 'pipeCount');
    return routed;
  });

  const tags = doc.instruments.map((instrument) =>
    anchorTag(instrument, resolve(instrument.attachTo), edgeUses),
  );

  const bounds = contentBounds(nodes, pipes, tags);
  return { ...bounds, nodes, pipes, tags };
}

function contentBounds(
  nodes: readonly PositionedNode[],
  pipes: readonly RoutedPipe[],
  tags: readonly TagAnchor[],
): Pick<SchematicLayout, 'x' | 'y' | 'width' | 'height'> {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  const include = (x: number, y: number): void => {
    left = Math.min(left, x - SCHEMATIC_PADDING_PX);
    top = Math.min(top, y - SCHEMATIC_PADDING_PX);
    right = Math.max(right, x + SCHEMATIC_PADDING_PX);
    bottom = Math.max(bottom, y + SCHEMATIC_PADDING_PX);
  };

  for (const positioned of nodes) {
    include(positioned.x, positioned.y);
    include(positioned.x + positioned.width, positioned.y + positioned.height);
  }
  for (const routed of pipes) {
    for (const point of routed.points) {
      include(point.x, point.y);
    }
  }
  for (const tag of tags) {
    include(tag.point.x, tag.point.y);
  }

  if (![left, top, right, bottom].every(Number.isFinite)) {
    return {
      x: 0,
      y: 0,
      width: 2 * SCHEMATIC_PADDING_PX,
      height: 2 * SCHEMATIC_PADDING_PX,
    };
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Converts the one expected routing dead end into UI-safe data. Structural misuse and unknown
 * faults still throw, keeping programming errors visible instead of laundering them as input.
 */
export function tryLayoutSchematic(doc: MachineSchematic): SchematicLayoutResult {
  try {
    return { ok: true, layout: layoutSchematic(doc) };
  } catch (error) {
    if (error instanceof SchematicRoutingError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

/**
 * Non-throwing routability probe for a validated document. Only an exhausted pipe search is a
 * negative verdict; dangling references and unexpected layout faults still surface to callers.
 */
export function isSchematicRoutable(doc: MachineSchematic): boolean {
  return tryLayoutSchematic(doc).ok;
}

function positionNode(node: SchematicNode): PositionedNode {
  const symbol = NODE_SYMBOLS[node.type];
  const cx = SCHEMATIC_PADDING_PX + (node.grid[0] + 0.5) * PLACEMENT_STEP_PX;
  const cy = SCHEMATIC_PADDING_PX + (node.grid[1] + 0.5) * PLACEMENT_STEP_PX;
  return {
    node,
    x: cx - symbol.width / 2,
    y: cy - symbol.height / 2,
    width: symbol.width,
    height: symbol.height,
    cx,
    cy,
  };
}

/**
 * Manhattan routing between two node boxes. The inexpensive direct route handles the normal
 * case; a deterministic visibility graph is used only when that route would cross another
 * component or collapse into a zero-length segment.
 */
function routePipe(
  pipe: Pipe,
  a: PositionedNode,
  b: PositionedNode,
  nodes: readonly PositionedNode[],
): RoutedPipe {
  const direct = directRoute(pipe, a, b);
  if (routeIsRenderable(direct, a, b, nodes, ROUTE_CLEARANCE_PX)) {
    return direct;
  }

  const detour = routeAroundObstacles(pipe, a, b, nodes);
  if (detour === undefined) {
    throw new SchematicRoutingError(pipe);
  }
  return detour;
}

function directRoute(pipe: Pipe, a: PositionedNode, b: PositionedNode): RoutedPipe {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  const halfA = { w: a.width / 2, h: a.height / 2 };
  const halfB = { w: b.width / 2, h: b.height / 2 };

  if (dy === 0) {
    return {
      pipe,
      points: [
        { x: a.cx + sx * halfA.w, y: a.cy },
        { x: b.cx - sx * halfB.w, y: b.cy },
      ],
      fromEdge: sx > 0 ? 'right' : 'left',
      toEdge: sx > 0 ? 'left' : 'right',
    };
  }
  if (dx === 0) {
    return {
      pipe,
      points: [
        { x: a.cx, y: a.cy + sy * halfA.h },
        { x: b.cx, y: b.cy - sy * halfB.h },
      ],
      fromEdge: sy > 0 ? 'bottom' : 'top',
      toEdge: sy > 0 ? 'top' : 'bottom',
    };
  }

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (Math.abs(dy) > halfB.h && Math.abs(dx) > halfA.w) {
      return {
        pipe,
        points: [
          { x: a.cx + sx * halfA.w, y: a.cy },
          { x: b.cx, y: a.cy },
          { x: b.cx, y: b.cy - sy * halfB.h },
        ],
        fromEdge: sx > 0 ? 'right' : 'left',
        toEdge: sy > 0 ? 'top' : 'bottom',
      };
    }
    const startX = a.cx + sx * halfA.w;
    const endX = b.cx - sx * halfB.w;
    const midX = (startX + endX) / 2;
    return {
      pipe,
      points: [
        { x: startX, y: a.cy },
        { x: midX, y: a.cy },
        { x: midX, y: b.cy },
        { x: endX, y: b.cy },
      ],
      fromEdge: sx > 0 ? 'right' : 'left',
      toEdge: sx > 0 ? 'left' : 'right',
    };
  }

  if (Math.abs(dx) > halfB.w && Math.abs(dy) > halfA.h) {
    return {
      pipe,
      points: [
        { x: a.cx, y: a.cy + sy * halfA.h },
        { x: a.cx, y: b.cy },
        { x: b.cx - sx * halfB.w, y: b.cy },
      ],
      fromEdge: sy > 0 ? 'bottom' : 'top',
      toEdge: sx > 0 ? 'left' : 'right',
    };
  }
  const startY = a.cy + sy * halfA.h;
  const endY = b.cy - sy * halfB.h;
  const midY = (startY + endY) / 2;
  return {
    pipe,
    points: [
      { x: a.cx, y: startY },
      { x: a.cx, y: midY },
      { x: b.cx, y: midY },
      { x: b.cx, y: endY },
    ],
    fromEdge: sy > 0 ? 'bottom' : 'top',
    toEdge: sy > 0 ? 'top' : 'bottom',
  };
}

interface RoutingRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

interface Port {
  readonly edge: NodeEdge;
  readonly anchor: Point;
  readonly stub: Point;
}

type RouteDirection = 'none' | 'horizontal' | 'vertical';

interface GraphNeighbour {
  readonly index: number;
  readonly direction: Exclude<RouteDirection, 'none'>;
  readonly distance: number;
}

interface RouteState {
  readonly key: string;
  readonly index: number;
  readonly direction: RouteDirection;
  readonly source: Port;
  readonly cost: number;
}

interface CompletedRoute {
  readonly state: RouteState;
  readonly target: Port;
  readonly cost: number;
}

function routeIsRenderable(
  routed: RoutedPipe,
  source: PositionedNode,
  target: PositionedNode,
  nodes: readonly PositionedNode[],
  foreignClearance: number,
): boolean {
  for (let index = 1; index < routed.points.length; index += 1) {
    const start = routed.points[index - 1];
    const end = routed.points[index];
    if (!isNonZeroOrthogonalSegment(start, end)) {
      return false;
    }
    for (const positioned of nodes) {
      if (positioned.node.id === source.node.id && index === 1) {
        continue;
      }
      if (positioned.node.id === target.node.id && index === routed.points.length - 1) {
        continue;
      }
      const clearance =
        positioned.node.id === source.node.id || positioned.node.id === target.node.id
          ? 0
          : foreignClearance;
      if (segmentCrossesRectInterior(start, end, rectFor(positioned, clearance))) {
        return false;
      }
    }
  }
  return true;
}

function routeAroundObstacles(
  pipe: Pipe,
  source: PositionedNode,
  target: PositionedNode,
  nodes: readonly PositionedNode[],
): RoutedPipe | undefined {
  const sourcePorts = portsFor(source);
  const targetPorts = portsFor(target);
  const obstacles = nodes.map((positioned) =>
    rectFor(
      positioned,
      positioned.node.id === source.node.id || positioned.node.id === target.node.id
        ? 0
        : ROUTE_CLEARANCE_PX,
    ),
  );
  const ports = [...sourcePorts, ...targetPorts];
  const xs = routingCoordinates(obstacles, ports, 'x');
  const ys = routingCoordinates(obstacles, ports, 'y');
  const { points, indexByPoint } = graphPoints(xs, ys, obstacles);
  const neighbours = graphNeighbours(points, xs, ys, indexByPoint, obstacles);
  const targetByIndex = new Map<number, Port[]>();

  for (const port of targetPorts) {
    if (!segmentIsClear(port.anchor, port.stub, obstacles)) {
      continue;
    }
    const index = indexByPoint.get(pointKey(port.stub));
    if (index === undefined) {
      continue;
    }
    const matching = targetByIndex.get(index) ?? [];
    matching.push(port);
    targetByIndex.set(index, matching);
  }

  const queue = new RouteQueue();
  const best = new Map<string, number>();
  const previous = new Map<string, string>();
  const states = new Map<string, RouteState>();

  for (const port of sourcePorts) {
    if (!segmentIsClear(port.anchor, port.stub, obstacles)) {
      continue;
    }
    const index = indexByPoint.get(pointKey(port.stub));
    if (index === undefined) {
      continue;
    }
    const direction = directionOf(port.anchor, port.stub);
    const state = routeState(index, direction, port, segmentLength(port.anchor, port.stub));
    if ((best.get(state.key) ?? Number.POSITIVE_INFINITY) <= state.cost) {
      continue;
    }
    best.set(state.key, state.cost);
    states.set(state.key, state);
    queue.push(state);
  }

  let completed: CompletedRoute | undefined;
  while (queue.size > 0) {
    const current = queue.pop();
    if (current === undefined) {
      break;
    }
    if (current.cost !== best.get(current.key)) {
      continue;
    }
    if (completed !== undefined && current.cost > completed.cost) {
      break;
    }

    for (const targetPort of targetByIndex.get(current.index) ?? []) {
      const targetDirection = directionOf(targetPort.stub, targetPort.anchor);
      const finalCost =
        current.cost +
        segmentLength(targetPort.stub, targetPort.anchor) +
        bendCost(current.direction, targetDirection);
      if (completed === undefined || finalCost < completed.cost) {
        completed = { state: current, target: targetPort, cost: finalCost };
      }
    }

    for (const neighbour of neighbours[current.index] ?? []) {
      const cost =
        current.cost + neighbour.distance + bendCost(current.direction, neighbour.direction);
      const next = routeState(neighbour.index, neighbour.direction, current.source, cost);
      if ((best.get(next.key) ?? Number.POSITIVE_INFINITY) <= cost) {
        continue;
      }
      best.set(next.key, cost);
      previous.set(next.key, current.key);
      states.set(next.key, next);
      queue.push(next);
    }
  }

  if (completed === undefined) {
    return undefined;
  }

  const graphPath: Point[] = [];
  let current: RouteState | undefined = completed.state;
  while (current !== undefined) {
    graphPath.push(points[current.index]);
    const predecessor = previous.get(current.key);
    current = predecessor === undefined ? undefined : states.get(predecessor);
  }
  graphPath.reverse();

  const routed: RoutedPipe = {
    pipe,
    points: simplifyPath([completed.state.source.anchor, ...graphPath, completed.target.anchor]),
    fromEdge: completed.state.source.edge,
    toEdge: completed.target.edge,
  };
  return routeIsRenderable(routed, source, target, nodes, ROUTE_CLEARANCE_PX) ? routed : undefined;
}

function portsFor(positioned: PositionedNode): readonly Port[] {
  return ROUTE_EDGE_ORDER.map((edge) => {
    const anchor = nodeEdgePoint(positioned, edge);
    return { edge, anchor, stub: offsetPoint(anchor, edge, ROUTE_STUB_PX) };
  });
}

function nodeEdgePoint(positioned: PositionedNode, edge: NodeEdge): Point {
  switch (edge) {
    case 'top':
      return { x: positioned.cx, y: positioned.y };
    case 'right':
      return { x: positioned.x + positioned.width, y: positioned.cy };
    case 'bottom':
      return { x: positioned.cx, y: positioned.y + positioned.height };
    case 'left':
      return { x: positioned.x, y: positioned.cy };
  }
}

function offsetPoint(point: Point, edge: NodeEdge, distance: number): Point {
  switch (edge) {
    case 'top':
      return { x: point.x, y: point.y - distance };
    case 'right':
      return { x: point.x + distance, y: point.y };
    case 'bottom':
      return { x: point.x, y: point.y + distance };
    case 'left':
      return { x: point.x - distance, y: point.y };
  }
}

function rectFor(positioned: PositionedNode, clearance: number): RoutingRect {
  return {
    left: positioned.x - clearance,
    right: positioned.x + positioned.width + clearance,
    top: positioned.y - clearance,
    bottom: positioned.y + positioned.height + clearance,
  };
}

function routingCoordinates(
  obstacles: readonly RoutingRect[],
  ports: readonly Port[],
  axis: 'x' | 'y',
): readonly number[] {
  const coordinates = new Set<number>();
  for (const obstacle of obstacles) {
    coordinates.add(axis === 'x' ? obstacle.left : obstacle.top);
    coordinates.add(axis === 'x' ? obstacle.right : obstacle.bottom);
  }
  for (const port of ports) {
    coordinates.add(port.stub[axis]);
  }
  const ordered = [...coordinates].sort((a, b) => a - b);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (first !== undefined && last !== undefined) {
    coordinates.add(first - ROUTE_STUB_PX);
    coordinates.add(last + ROUTE_STUB_PX);
  }
  return [...coordinates].sort((a, b) => a - b);
}

function graphPoints(
  xs: readonly number[],
  ys: readonly number[],
  obstacles: readonly RoutingRect[],
): { readonly points: readonly Point[]; readonly indexByPoint: ReadonlyMap<string, number> } {
  const points: Point[] = [];
  const indexByPoint = new Map<string, number>();
  for (const y of ys) {
    for (const x of xs) {
      const point = { x, y };
      if (obstacles.some((obstacle) => pointInsideRect(point, obstacle))) {
        continue;
      }
      indexByPoint.set(pointKey(point), points.length);
      points.push(point);
    }
  }
  return { points, indexByPoint };
}

function graphNeighbours(
  points: readonly Point[],
  xs: readonly number[],
  ys: readonly number[],
  indexByPoint: ReadonlyMap<string, number>,
  obstacles: readonly RoutingRect[],
): readonly (readonly GraphNeighbour[])[] {
  const neighbours: GraphNeighbour[][] = Array.from({ length: points.length }, () => []);
  for (const y of ys) {
    connectVisibleAxis(
      points,
      xs.map((x) => ({ x, y })),
      neighbours,
      indexByPoint,
      obstacles,
    );
  }
  for (const x of xs) {
    connectVisibleAxis(
      points,
      ys.map((y) => ({ x, y })),
      neighbours,
      indexByPoint,
      obstacles,
    );
  }
  return neighbours;
}

function connectVisibleAxis(
  points: readonly Point[],
  candidates: readonly Point[],
  neighbours: GraphNeighbour[][],
  indexByPoint: ReadonlyMap<string, number>,
  obstacles: readonly RoutingRect[],
): void {
  let previousIndex: number | undefined;
  for (const candidate of candidates) {
    const index = indexByPoint.get(pointKey(candidate));
    if (index === undefined) {
      continue;
    }
    if (previousIndex !== undefined) {
      const previous = points[previousIndex];
      const current = points[index];
      if (segmentIsClear(previous, current, obstacles)) {
        const direction = directionOf(previous, current);
        if (direction !== 'none') {
          const distance = segmentLength(previous, current);
          neighbours[previousIndex].push({ index, direction, distance });
          neighbours[index].push({ index: previousIndex, direction, distance });
        }
      }
    }
    previousIndex = index;
  }
}

function routeState(
  index: number,
  direction: RouteDirection,
  source: Port,
  cost: number,
): RouteState {
  return { key: `${index}:${direction}:${source.edge}`, index, direction, source, cost };
}

class RouteQueue {
  readonly #entries: RouteState[] = [];

  get size(): number {
    return this.#entries.length;
  }

  push(entry: RouteState): void {
    this.#entries.push(entry);
    let index = this.#entries.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const parentEntry = this.#entries[parent];
      if (compareRouteState(parentEntry, entry) <= 0) {
        break;
      }
      this.#entries[index] = parentEntry;
      index = parent;
    }
    this.#entries[index] = entry;
  }

  pop(): RouteState | undefined {
    const first = this.#entries[0];
    const last = this.#entries.pop();
    if (first === undefined || last === undefined || this.#entries.length === 0) {
      return first;
    }
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.#entries.length) {
        break;
      }
      const child =
        right < this.#entries.length &&
        compareRouteState(this.#entries[right], this.#entries[left]) < 0
          ? right
          : left;
      if (compareRouteState(this.#entries[child], last) >= 0) {
        break;
      }
      this.#entries[index] = this.#entries[child];
      index = child;
    }
    this.#entries[index] = last;
    return first;
  }
}

function compareRouteState(a: RouteState, b: RouteState): number {
  const costOrder = a.cost - b.cost;
  if (costOrder !== 0 || a.key === b.key) {
    return costOrder;
  }
  return a.key < b.key ? -1 : 1;
}

function pointInsideRect(point: Point, rect: RoutingRect): boolean {
  return point.x > rect.left && point.x < rect.right && point.y > rect.top && point.y < rect.bottom;
}

function segmentIsClear(start: Point, end: Point, obstacles: readonly RoutingRect[]): boolean {
  return (
    isNonZeroOrthogonalSegment(start, end) &&
    obstacles.every((obstacle) => !segmentCrossesRectInterior(start, end, obstacle))
  );
}

function segmentCrossesRectInterior(start: Point, end: Point, rect: RoutingRect): boolean {
  if (start.y === end.y) {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    return start.y > rect.top && start.y < rect.bottom && maxX > rect.left && minX < rect.right;
  }
  if (start.x === end.x) {
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    return start.x > rect.left && start.x < rect.right && maxY > rect.top && minY < rect.bottom;
  }
  return true;
}

function isNonZeroOrthogonalSegment(start: Point, end: Point): boolean {
  return (start.x === end.x) !== (start.y === end.y);
}

function directionOf(start: Point, end: Point): RouteDirection {
  if (start.x === end.x && start.y !== end.y) {
    return 'vertical';
  }
  if (start.y === end.y && start.x !== end.x) {
    return 'horizontal';
  }
  return 'none';
}

function segmentLength(start: Point, end: Point): number {
  return Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
}

function bendCost(previous: RouteDirection, next: RouteDirection): number {
  return previous === 'none' || previous === next ? 0 : ROUTE_BEND_PENALTY;
}

function pointKey(point: Point): string {
  return `${point.x},${point.y}`;
}

function simplifyPath(points: readonly Point[]): readonly Point[] {
  const simplified: Point[] = [];
  for (const point of points) {
    const last = simplified[simplified.length - 1];
    if (last !== undefined && last.x === point.x && last.y === point.y) {
      continue;
    }
    const beforeLast = simplified[simplified.length - 2];
    if (
      beforeLast !== undefined &&
      last !== undefined &&
      ((beforeLast.x === last.x && last.x === point.x) ||
        (beforeLast.y === last.y && last.y === point.y))
    ) {
      simplified[simplified.length - 1] = point;
    } else {
      simplified.push(point);
    }
  }
  return simplified;
}

function anchorTag(
  instrument: Instrument,
  positioned: PositionedNode,
  edgeUses: EdgeUses,
): TagAnchor {
  const nodeId = positioned.node.id;
  const uses = edgeUses.get(nodeId);
  const pipeFreeEdges = TAG_EDGE_PRIORITY.filter(
    (candidate) => edgeUse(uses, candidate).pipeCount === 0,
  );
  const candidates = pipeFreeEdges.length > 0 ? pipeFreeEdges : TAG_EDGE_PRIORITY;
  const edge = candidates.reduce((leastUsed, candidate) =>
    edgeUse(uses, candidate).tagCount < edgeUse(uses, leastUsed).tagCount ? candidate : leastUsed,
  );
  const stackIndex = edgeUse(uses, edge).tagCount;
  recordEdgeUse(edgeUses, nodeId, edge, 'tagCount');
  return {
    instrument,
    nodeId,
    edge,
    point: stackedEdgePoint(positioned, edge, stackIndex),
  };
}

function edgeUse(uses: Map<NodeEdge, EdgeUse> | undefined, edge: NodeEdge): EdgeUse {
  return uses?.get(edge) ?? EMPTY_EDGE_USE;
}

function recordEdgeUse(
  edgeUses: EdgeUses,
  nodeId: string,
  edge: NodeEdge,
  kind: keyof EdgeUse,
): void {
  const uses = edgeUses.get(nodeId) ?? new Map<NodeEdge, EdgeUse>();
  const current = edgeUse(uses, edge);
  uses.set(edge, { ...current, [kind]: current[kind] + 1 });
  edgeUses.set(nodeId, uses);
}

function stackedEdgePoint(positioned: PositionedNode, edge: NodeEdge, index: number): Point {
  const point = edgePoint(positioned, edge);
  const offset = index * TAG_STACK_STEP_PX;
  switch (edge) {
    case 'top':
      return { x: point.x, y: point.y - offset };
    case 'bottom':
      return { x: point.x, y: point.y + offset };
    case 'left':
      return { x: point.x - offset, y: point.y };
    case 'right':
      return { x: point.x + offset, y: point.y };
  }
}

function edgePoint(positioned: PositionedNode, edge: NodeEdge): Point {
  switch (edge) {
    case 'top':
      return { x: positioned.cx, y: positioned.y - TAG_ANCHOR_GAP_PX };
    case 'bottom':
      return { x: positioned.cx, y: positioned.y + positioned.height + TAG_ANCHOR_GAP_PX };
    case 'left':
      return { x: positioned.x - TAG_ANCHOR_GAP_PX, y: positioned.cy };
    case 'right':
      return { x: positioned.x + positioned.width + TAG_ANCHOR_GAP_PX, y: positioned.cy };
  }
}

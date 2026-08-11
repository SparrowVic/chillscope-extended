import type { SeriesId } from '../../../core/data/measurement.models';
import type {
  NodeEdge,
  PositionedNode,
  SchematicLayout,
  TagAnchor,
} from '../../../core/schematic/schematic.layout';
import type {
  MachineSchematic,
  PipeSide,
  SchematicNodeType,
} from '../../../core/schematic/schematic.models';
import {
  NODE_SYMBOLS,
  effectsForNode,
  staticShapesForNode,
  type SpinKind,
  type SymbolEffect,
  type SymbolEffectKind,
  type SymbolShape,
} from '../../../core/schematic/symbols';
import { SERIES_LABEL_KEYS, SERIES_UNIT_KEYS } from '../../../shared/series-display';
import type { MeasurementStatus } from '../../../shared/severity';
import { compactSvgLabel } from '../../../shared/svg-label';
import { microGauge, type LatestReading, type MicroGauge } from './schematic.view-model';

/**
 * Render-ready view models for the schematic SVG and its instrument tags. Everything positional
 * is resolved here so the template only interpolates — the maths stays out of the markup.
 */

/** Baseline offset of a node's caption below its symbol box. */
const NODE_LABEL_GAP_PX = 16;
const NODE_DRAW_SPREAD_MS = 140;
const PIPE_DRAW_START_MS = 380;
const PIPE_DRAW_SPREAD_MS = 140;
const NODE_HIT_SIZE_PX = 44;
const FOCUS_PAD_PX = 7;
const FOCUS_ARM_PX = 11;

export type ResolvedEffectTone = Exclude<SymbolEffect['tone'], 'incident'>;

export interface SchematicEffectShapeVm {
  /** Stable singleton input: a live tick must not dirty every SVG shape child. */
  readonly shapes: readonly [SymbolShape];
}

export interface SchematicEffectVm {
  readonly kind: SymbolEffectKind;
  readonly drive: SeriesId;
  readonly activation: SymbolEffect['activation'];
  readonly tone: ResolvedEffectTone;
  readonly shapeGroups: readonly SchematicEffectShapeVm[];
}

export interface SchematicSpinVm {
  readonly kind: SpinKind;
  readonly drive: SeriesId;
  /** Moves the group's local origin onto the motion pivot (originX, originY). */
  readonly pivot: string;
  /** Restores the symbol's own coordinates inside the moving group. */
  readonly unpivot: string;
  /** Period multiplier the stylesheet divides the drive duration by. */
  readonly speed: number;
  readonly reverse: boolean;
  readonly shapes: readonly SymbolShape[];
}

export interface SchematicNodeVm {
  readonly id: string;
  readonly type: SchematicNodeType;
  readonly transform: string;
  readonly shapes: readonly SymbolShape[];
  /** Process medium at the component boundary; chroma describes substance, never decoration. */
  readonly medium: PipeSide | 'mixed';
  readonly fullLabel: string;
  readonly label: string;
  readonly labelX: number;
  readonly labelY: number;
  readonly hitX: number;
  readonly hitY: number;
  readonly hitWidth: number;
  readonly hitHeight: number;
  readonly drawDelay: string;
  readonly focusPath: string;
  /** Working-state overlays; the stylesheet owns their choreography per kind. */
  readonly fx: readonly SchematicEffectVm[];
  /** Mechanism layers, each on its own speed/direction against one shared drive gate. */
  readonly spins: readonly SchematicSpinVm[];
}

export interface SchematicPipeVm {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly points: string;
  readonly side: PipeSide;
  readonly lengthPx: number;
  readonly drawDelay: string;
  /** Endpoints on the node boundaries — the renderer prints nozzle dots on them. */
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
}

/** A fine connector from the node boundary to the instrument tag hanging off it. */
export interface SchematicLeaderVm {
  readonly nodeId: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface SchematicStageVm {
  readonly id: string;
}

export interface SchematicFrameVm {
  readonly viewBox: string;
  readonly caption: string;
  /** Switching documents recreates the stage without Angular's identity-tracking warning. */
  readonly stages: readonly [SchematicStageVm];
  readonly machineName: string;
  readonly nodes: readonly SchematicNodeVm[];
  readonly pipes: readonly SchematicPipeVm[];
  readonly leaders: readonly SchematicLeaderVm[];
}

export function buildFrame(
  doc: MachineSchematic,
  layout: SchematicLayout,
  labelOf: (nodeId: string, fallback: string) => string,
  machineName = doc.name,
): SchematicFrameVm {
  const nodesById = new Map(layout.nodes.map((positioned) => [positioned.node.id, positioned]));
  const columnRanks = ranks(layout.nodes.map((positioned) => positioned.node.grid[0]));
  const media = mediaByNode(doc);
  return {
    viewBox: `${layout.x} ${layout.y} ${layout.width} ${layout.height}`,
    caption: `${doc.id} · ${doc.revision}`,
    stages: [{ id: `${doc.id}:${doc.revision}` }],
    machineName,
    nodes: layout.nodes.map((positioned) => {
      const symbol = NODE_SYMBOLS[positioned.node.type];
      const spins = symbol.animatedGroups ?? [];
      const fullLabel = labelOf(positioned.node.id, positioned.node.label);
      const hitWidth = Math.max(positioned.width, NODE_HIT_SIZE_PX);
      const hitHeight = Math.max(positioned.height, NODE_HIT_SIZE_PX);
      const medium =
        positioned.node.heatSource === true ? 'hot' : (media.get(positioned.node.id) ?? 'mixed');
      return {
        id: positioned.node.id,
        type: positioned.node.type,
        transform: `translate(${positioned.x} ${positioned.y})`,
        shapes: staticShapesForNode(positioned.node),
        medium,
        fullLabel,
        label: compactSvgLabel(fullLabel),
        labelX: positioned.cx,
        labelY: positioned.y + positioned.height + NODE_LABEL_GAP_PX,
        hitX: (positioned.width - hitWidth) / 2,
        hitY: (positioned.height - hitHeight) / 2,
        hitWidth,
        hitHeight,
        drawDelay: staggerDelay(
          columnRanks.get(positioned.node.grid[0]) ?? 0,
          columnRanks.size,
          0,
          NODE_DRAW_SPREAD_MS,
        ),
        focusPath: focusCorners(positioned.width, positioned.height),
        fx: effectsForNode(positioned.node).map((effect) =>
          effectVm(effect, medium === 'mixed' ? undefined : medium),
        ),
        spins: spins.map((spin) => ({
          kind: spin.kind,
          drive: spin.drive,
          pivot: `translate(${spin.originX} ${spin.originY})`,
          unpivot: `translate(${-spin.originX} ${-spin.originY})`,
          speed: spin.speed ?? 1,
          reverse: spin.direction === -1,
          shapes: spin.shapes,
        })),
      };
    }),
    pipes: layout.pipes.map((routed, index) => {
      const start = routed.points[0];
      const end = routed.points[routed.points.length - 1];
      return {
        id: `${index}:${routed.pipe.from}:${routed.pipe.to}`,
        fromId: routed.pipe.from,
        toId: routed.pipe.to,
        points: routed.points.map((point) => `${point.x},${point.y}`).join(' '),
        side: routed.pipe.side,
        lengthPx: polylineLength(routed.points),
        drawDelay: staggerDelay(
          index,
          layout.pipes.length,
          PIPE_DRAW_START_MS,
          PIPE_DRAW_SPREAD_MS,
        ),
        startX: start.x,
        startY: start.y,
        endX: end.x,
        endY: end.y,
      };
    }),
    leaders: layout.tags.flatMap((anchor) => {
      const positioned = nodesById.get(anchor.nodeId);
      return positioned ? [leaderLine(anchor, positioned)] : [];
    }),
  };
}

/** From the node boundary straight to the tag's anchor point, along the anchor's edge axis. */
function leaderLine(anchor: TagAnchor, positioned: PositionedNode): SchematicLeaderVm {
  const { point } = anchor;
  switch (anchor.edge) {
    case 'top':
      return { nodeId: anchor.nodeId, x1: point.x, y1: positioned.y, x2: point.x, y2: point.y };
    case 'bottom':
      return {
        nodeId: anchor.nodeId,
        x1: point.x,
        y1: positioned.y + positioned.height,
        x2: point.x,
        y2: point.y,
      };
    case 'left':
      return { nodeId: anchor.nodeId, x1: positioned.x, y1: point.y, x2: point.x, y2: point.y };
    case 'right':
      return {
        nodeId: anchor.nodeId,
        x1: positioned.x + positioned.width,
        y1: point.y,
        x2: point.x,
        y2: point.y,
      };
  }
}

function ranks(values: readonly number[]): ReadonlyMap<number, number> {
  return new Map([...new Set(values)].sort((a, b) => a - b).map((value, index) => [value, index]));
}

function staggerDelay(index: number, count: number, startMs: number, spreadMs: number): string {
  const progress = count <= 1 ? 0 : index / (count - 1);
  return `${Math.round(startMs + progress * spreadMs)}ms`;
}

function mediaByNode(doc: MachineSchematic): ReadonlyMap<string, PipeSide | 'mixed'> {
  const outlets = new Map<string, PipeSide[]>();
  const inlets = new Map<string, PipeSide[]>();
  for (const pipe of doc.pipes) {
    appendSide(outlets, pipe.from, pipe.side);
    appendSide(inlets, pipe.to, pipe.side);
  }
  const media = new Map<string, PipeSide | 'mixed'>();
  for (const node of doc.nodes) {
    media.set(
      node.id,
      uniformSide(outlets.get(node.id) ?? []) ?? uniformSide(inlets.get(node.id) ?? []) ?? 'mixed',
    );
  }
  return media;
}

function appendSide(target: Map<string, PipeSide[]>, nodeId: string, side: PipeSide): void {
  const sides = target.get(nodeId) ?? [];
  sides.push(side);
  target.set(nodeId, sides);
}

function uniformSide(sides: readonly PipeSide[]): PipeSide | undefined {
  return sides.length > 0 && sides.every((side) => side === sides[0]) ? sides[0] : undefined;
}

function effectVm(effect: SymbolEffect, incidentSide: PipeSide | undefined): SchematicEffectVm {
  return {
    kind: effect.kind,
    drive: effect.drive,
    activation: effect.activation,
    tone: effect.tone === 'incident' ? (incidentSide ?? 'status') : effect.tone,
    shapeGroups: effect.shapes.map((shape) => ({ shapes: [shape] as const })),
  };
}

function polylineLength(points: readonly { readonly x: number; readonly y: number }[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    length += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return length;
}

function focusCorners(width: number, height: number): string {
  const left = -FOCUS_PAD_PX;
  const top = -FOCUS_PAD_PX;
  const right = width + FOCUS_PAD_PX;
  const bottom = height + FOCUS_PAD_PX;
  const arm = FOCUS_ARM_PX;
  return [
    `M${left + arm} ${top}H${left}V${top + arm}`,
    `M${right - arm} ${top}H${right}V${top + arm}`,
    `M${right} ${bottom - arm}V${bottom}H${right - arm}`,
    `M${left + arm} ${bottom}H${left}V${bottom - arm}`,
  ].join(' ');
}

export interface SchematicTagVm {
  readonly isaTag: string;
  readonly nodeId: string;
  readonly seriesKey: string;
  readonly unitKey: string;
  readonly edge: NodeEdge;
  readonly leftPct: number;
  readonly topPct: number;
  readonly value: string;
  readonly hasValue: boolean;
  readonly status: MeasurementStatus | 'none';
  readonly pulse: boolean;
  readonly gauge?: MicroGauge;
}

/** The §8 change language never morphs into text, so the idle state is a plain em dash. */
const NO_READING = '—';

export function buildTags(
  layout: SchematicLayout,
  readings: ReadonlyMap<SeriesId, LatestReading>,
  format: (value: number) => string,
): SchematicTagVm[] {
  return layout.tags.map((anchor) => {
    const series = anchor.instrument.series;
    const reading = readings.get(series);
    const gauge = reading ? microGauge(reading.value, reading.thresholds) : undefined;
    return {
      isaTag: anchor.instrument.tag,
      nodeId: anchor.nodeId,
      seriesKey: SERIES_LABEL_KEYS[series],
      unitKey: SERIES_UNIT_KEYS[series],
      edge: anchor.edge,
      leftPct: ((anchor.point.x - layout.x) / layout.width) * 100,
      topPct: ((anchor.point.y - layout.y) / layout.height) * 100,
      value: reading ? format(reading.value) : NO_READING,
      hasValue: reading !== undefined,
      status: gauge?.status ?? 'none',
      pulse: gauge?.status === 'critical',
      ...(gauge ? { gauge } : {}),
    };
  });
}

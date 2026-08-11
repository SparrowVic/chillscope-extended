import {
  SERIES_IDS,
  isSeriesId,
  isSeriesThresholds,
  type SeriesThresholds,
} from '../data/series.catalog';
import {
  type GridPosition,
  type Instrument,
  isMachineProfileId,
  MACHINE_PROFILE_IDS,
  type MachineSchematic,
  type Pipe,
  SCHEMATIC_NODE_TYPES,
  type SchematicNode,
  type SchematicNodeType,
} from './schematic.models';
import { nodeSymbolsOverlap } from './schematic.layout';

/** ISA-5.1 style tag: two capital letters, a dash, a three-digit loop number. */
export const ISA_TAG_PATTERN = /^[A-Z]{2}-\d{3}$/;
const ANIMATED_NODE_TYPES: ReadonlySet<SchematicNodeType> = new Set([
  'pump',
  'heatExchanger',
  'compressor',
]);

/**
 * Defensive exchange limits. Profiles are much smaller (the largest built-in has eleven nodes),
 * but imported JSON is untrusted and must be bounded before layout or SVG work starts.
 */
export const SCHEMATIC_LIMITS = {
  textLength: 160,
  nodes: 32,
  pipes: 64,
  instruments: 16,
  gridCoordinate: 255,
} as const;

export type SchematicValidationResult =
  | { readonly ok: true; readonly doc: MachineSchematic }
  | { readonly ok: false; readonly errors: readonly string[] };

/**
 * Validates an untrusted document (typically parsed JSON) against the §9 schema. On success the
 * returned document is a fresh deep copy with only the known fields, so later mutation of the
 * input cannot corrupt it. On failure every problem is reported at once, as human-readable
 * English strings — the renderer shows them in an error panel, never a broken drawing.
 */
export function validateSchematic(input: unknown): SchematicValidationResult {
  if (!isRecord(input)) {
    return { ok: false, errors: ['Schematic document must be a JSON object.'] };
  }

  const errors: string[] = [];
  rejectUnknownFields(
    input,
    ['id', 'name', 'revision', 'profileId', 'nodes', 'pipes', 'instruments'],
    errors,
  );

  const id = requireString(input, 'id', errors);
  const name = requireString(input, 'name', errors);
  const revision = requireString(input, 'revision', errors);

  const profileId = input['profileId'];
  if (typeof profileId !== 'string' || !isMachineProfileId(profileId)) {
    errors.push(
      `"profileId" ${describe(profileId)} must be one of ${MACHINE_PROFILE_IDS.join(', ')}.`,
    );
  }

  const nodes = validateNodes(input['nodes'], errors);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const pipes = validatePipes(input['pipes'], nodeIds, errors);
  const instruments = validateInstruments(input['instruments'], nodeIds, errors);
  validateNodeInstrumentTags(nodes, instruments, errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    doc: {
      id: id as string,
      name: name as string,
      revision: revision as string,
      profileId: profileId as MachineSchematic['profileId'],
      nodes,
      pipes,
      instruments,
    },
  };
}

function validateNodeInstrumentTags(
  nodes: readonly SchematicNode[],
  instruments: readonly Instrument[],
  errors: string[],
): void {
  const byTag = new Map(instruments.map((instrument) => [instrument.tag, instrument]));
  for (const node of nodes) {
    if (node.tag === undefined) {
      continue;
    }
    const instrument = byTag.get(node.tag);
    if (instrument === undefined) {
      errors.push(`Node "${node.id}" references unknown instrument tag "${node.tag}".`);
    } else if (instrument.attachTo !== node.id) {
      errors.push(
        `Node "${node.id}" uses instrument tag "${node.tag}", but that instrument is attached to "${instrument.attachTo}".`,
      );
    }
  }
}

function validateNodes(value: unknown, errors: string[]): readonly SchematicNode[] {
  if (!Array.isArray(value)) {
    errors.push('"nodes" must be an array.');
    return [];
  }
  if (value.length > SCHEMATIC_LIMITS.nodes) {
    errors.push(`"nodes" must contain at most ${SCHEMATIC_LIMITS.nodes} entries.`);
  }
  const nodes: SchematicNode[] = [];
  for (const [index, entry] of value.slice(0, SCHEMATIC_LIMITS.nodes).entries()) {
    const node = validateNode(entry, index, errors);
    if (node) {
      nodes.push(node);
    }
  }

  const seenIds = new Set<string>();
  const placed: SchematicNode[] = [];
  for (const node of nodes) {
    if (seenIds.has(node.id)) {
      errors.push(`Duplicate node id "${node.id}" — node ids must be unique.`);
    }
    seenIds.add(node.id);

    for (const other of placed) {
      if (!nodeSymbolsOverlap(other, node)) {
        continue;
      }
      if (other.grid[0] === node.grid[0] && other.grid[1] === node.grid[1]) {
        errors.push(
          `Nodes "${other.id}" and "${node.id}" collide at grid [${node.grid[0]}, ${node.grid[1]}].`,
        );
      } else {
        errors.push(
          `Nodes "${other.id}" at grid [${other.grid[0]}, ${other.grid[1]}] and "${node.id}" at grid [${node.grid[0]}, ${node.grid[1]}] have overlapping symbol boxes.`,
        );
      }
    }
    placed.push(node);
  }
  return nodes;
}

function validateNode(entry: unknown, index: number, errors: string[]): SchematicNode | undefined {
  const at = `nodes[${index}]`;
  if (!isRecord(entry)) {
    errors.push(`${at} must be an object.`);
    return undefined;
  }
  const before = errors.length;
  rejectUnknownFields(
    entry,
    ['id', 'type', 'label', 'grid', 'tag', 'level', 'heatSource'],
    errors,
    at,
  );

  const id = requireString(entry, 'id', errors, at);
  const label = requireString(entry, 'label', errors, at);

  const type = entry['type'];
  if (typeof type !== 'string' || !(SCHEMATIC_NODE_TYPES as readonly string[]).includes(type)) {
    errors.push(
      `${at}: unknown node type ${describe(type)} — expected one of ${SCHEMATIC_NODE_TYPES.join(', ')}.`,
    );
  }

  const grid = validateGrid(entry['grid'], at, errors);

  for (const flag of ['level', 'heatSource'] as const) {
    if (entry[flag] !== undefined && typeof entry[flag] !== 'boolean') {
      errors.push(`${at}: "${flag}" must be a boolean when present.`);
    }
  }
  const tag = entry['tag'];
  if (tag !== undefined && (typeof tag !== 'string' || !ISA_TAG_PATTERN.test(tag))) {
    errors.push(
      `${at}: node tag ${describe(tag)} must match the ISA format LL-NNN (e.g. "ST-104").`,
    );
  }
  if (
    typeof tag === 'string' &&
    ISA_TAG_PATTERN.test(tag) &&
    typeof type === 'string' &&
    (SCHEMATIC_NODE_TYPES as readonly string[]).includes(type) &&
    !ANIMATED_NODE_TYPES.has(type as SchematicNodeType)
  ) {
    errors.push(`${at}: node type "${type}" does not accept primary instrument tag "${tag}".`);
  }
  if (entry['level'] === true && type !== 'reservoir') {
    errors.push(`${at}: "level" is only valid for reservoir nodes.`);
  }
  if (entry['heatSource'] === true && type !== 'machine') {
    errors.push(`${at}: "heatSource" is only valid for machine nodes.`);
  }

  if (errors.length > before) {
    return undefined;
  }
  return {
    id: id as string,
    type: type as SchematicNodeType,
    label: label as string,
    grid: grid as GridPosition,
    ...(tag !== undefined ? { tag: tag as string } : {}),
    ...(entry['level'] !== undefined ? { level: entry['level'] as boolean } : {}),
    ...(entry['heatSource'] !== undefined ? { heatSource: entry['heatSource'] as boolean } : {}),
  };
}

function validateGrid(value: unknown, at: string, errors: string[]): GridPosition | undefined {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((coordinate) => typeof coordinate === 'number' && Number.isInteger(coordinate))
  ) {
    errors.push(`${at}: "grid" must be a [column, row] pair of integers.`);
    return undefined;
  }
  const [column, row] = value as [number, number];
  if (!Number.isSafeInteger(column) || !Number.isSafeInteger(row)) {
    errors.push(`${at}: grid position [${column}, ${row}] must use safe integers.`);
    return undefined;
  }
  if (column < 0 || row < 0) {
    errors.push(`${at}: grid position [${column}, ${row}] must be non-negative.`);
    return undefined;
  }
  if (column > SCHEMATIC_LIMITS.gridCoordinate || row > SCHEMATIC_LIMITS.gridCoordinate) {
    errors.push(
      `${at}: grid position [${column}, ${row}] must not exceed ${SCHEMATIC_LIMITS.gridCoordinate} on either axis.`,
    );
    return undefined;
  }
  return [column, row];
}

function validatePipes(
  value: unknown,
  nodeIds: ReadonlySet<string>,
  errors: string[],
): readonly Pipe[] {
  if (!Array.isArray(value)) {
    errors.push('"pipes" must be an array.');
    return [];
  }
  if (value.length > SCHEMATIC_LIMITS.pipes) {
    errors.push(`"pipes" must contain at most ${SCHEMATIC_LIMITS.pipes} entries.`);
  }
  const pipes: Pipe[] = [];
  const seenConnections = new Set<string>();
  for (const [index, entry] of value.slice(0, SCHEMATIC_LIMITS.pipes).entries()) {
    const at = `pipes[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${at} must be an object.`);
      continue;
    }
    const before = errors.length;
    rejectUnknownFields(entry, ['from', 'to', 'side'], errors, at);
    const from = requireString(entry, 'from', errors, at);
    const to = requireString(entry, 'to', errors, at);
    const side = entry['side'];
    if (side !== 'cold' && side !== 'hot') {
      errors.push(`${at}: side ${describe(side)} must be "cold" or "hot".`);
    }
    for (const [field, nodeId] of [
      ['from', from],
      ['to', to],
    ] as const) {
      if (typeof nodeId === 'string' && !nodeIds.has(nodeId)) {
        errors.push(`${at}: "${field}" references unknown node "${nodeId}".`);
      }
    }
    if (typeof from === 'string' && typeof to === 'string' && from === to) {
      errors.push(`${at}: a pipe cannot connect node "${from}" to itself.`);
    }
    if (typeof from === 'string' && typeof to === 'string') {
      const connection = from < to ? JSON.stringify([from, to]) : JSON.stringify([to, from]);
      if (seenConnections.has(connection)) {
        errors.push(`${at}: duplicate pipe connection "${from}" → "${to}".`);
      } else {
        seenConnections.add(connection);
      }
    }
    if (errors.length === before) {
      pipes.push({ from: from as string, to: to as string, side: side as Pipe['side'] });
    }
  }
  return pipes;
}

function validateInstruments(
  value: unknown,
  nodeIds: ReadonlySet<string>,
  errors: string[],
): readonly Instrument[] {
  if (!Array.isArray(value)) {
    errors.push('"instruments" must be an array.');
    return [];
  }
  if (value.length > SCHEMATIC_LIMITS.instruments) {
    errors.push(`"instruments" must contain at most ${SCHEMATIC_LIMITS.instruments} entries.`);
  }
  const instruments: Instrument[] = [];
  const seenTags = new Set<string>();
  for (const [index, entry] of value.slice(0, SCHEMATIC_LIMITS.instruments).entries()) {
    const at = `instruments[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${at} must be an object.`);
      continue;
    }
    const before = errors.length;
    rejectUnknownFields(entry, ['tag', 'series', 'attachTo', 'thresholds'], errors, at);
    const tag = entry['tag'];
    if (typeof tag !== 'string' || !ISA_TAG_PATTERN.test(tag)) {
      errors.push(`${at}: tag ${describe(tag)} must match the ISA format LL-NNN (e.g. "TT-101").`);
    } else if (seenTags.has(tag)) {
      errors.push(`Duplicate instrument tag "${tag}" — instrument tags must be unique.`);
    } else {
      seenTags.add(tag);
    }
    const series = entry['series'];
    if (typeof series !== 'string' || !isSeriesId(series)) {
      errors.push(
        `${at}: series ${describe(series)} is not a known series id (valid: ${SERIES_IDS.join(', ')}).`,
      );
    }
    const attachTo = requireString(entry, 'attachTo', errors, at);
    if (typeof attachTo === 'string' && !nodeIds.has(attachTo)) {
      errors.push(`${at}: "attachTo" references unknown node "${attachTo}".`);
    }
    const thresholds = entry['thresholds'];
    if (thresholds !== undefined && !isSeriesThresholds(thresholds)) {
      errors.push(
        `${at}: "thresholds" must provide finite numbers ordered as criticalMin < warningMin < warningMax < criticalMax.`,
      );
    }
    if (errors.length === before) {
      instruments.push({
        tag: tag as string,
        series: series as Instrument['series'],
        attachTo: attachTo as string,
        ...(thresholds !== undefined
          ? { thresholds: copyThresholds(thresholds as SeriesThresholds) }
          : {}),
      });
    }
  }
  return instruments;
}

function copyThresholds(thresholds: SeriesThresholds): SeriesThresholds {
  return {
    warningMin: thresholds.warningMin,
    warningMax: thresholds.warningMax,
    criticalMin: thresholds.criticalMin,
    criticalMax: thresholds.criticalMax,
  };
}

function requireString(
  record: Record<string, unknown>,
  field: string,
  errors: string[],
  at?: string,
): string | undefined {
  const value = record[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${at ? `${at}: ` : ''}"${field}" must be a non-empty string.`);
    return undefined;
  }
  if (exceedsCodePointLimit(value, SCHEMATIC_LIMITS.textLength)) {
    errors.push(
      `${at ? `${at}: ` : ''}"${field}" must contain at most ${SCHEMATIC_LIMITS.textLength} characters.`,
    );
    return undefined;
  }
  if (containsControlCharacter(value)) {
    errors.push(`${at ? `${at}: ` : ''}"${field}" must not contain control characters.`);
    return undefined;
  }
  return value;
}

function exceedsCodePointLimit(value: string, limit: number): boolean {
  return [...value].length > limit;
}

function rejectUnknownFields(
  record: Record<string, unknown>,
  allowed: readonly string[],
  errors: string[],
  at?: string,
): void {
  const accepted = new Set(allowed);
  for (const field of Object.keys(record)) {
    if (!accepted.has(field)) {
      errors.push(`${at ? `${at}: ` : ''}unknown property ${describe(field)}.`);
    }
  }
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 0x20 || codePoint === 0x7f) {
      return true;
    }
  }
  return false;
}

function describe(value: unknown): string {
  if (typeof value !== 'string') {
    return String(value);
  }
  const clipped = value.slice(0, SCHEMATIC_LIMITS.textLength);
  return `"${clipped}${value.length > clipped.length ? '…' : ''}"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

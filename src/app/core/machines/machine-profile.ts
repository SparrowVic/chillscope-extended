import type { SeriesId } from '../data/series.catalog';
import type {
  GridPosition,
  MachineProfileId,
  MachineSchematic,
  PipeSide,
  SchematicNodeType,
} from '../schematic/schematic.models';
import { SCHEMATIC_NODE_TYPES } from '../schematic/schematic.models';

/**
 * A machine profile is the capability envelope of a machine type (configurator spec §2): a
 * document may only be configured within its bounds. Validation is two-layered — run the
 * structural `validateSchematic` first, then `validateAgainstProfile` on its output.
 */
export type SensorTagPrefix = 'TT' | 'PT' | 'FT' | 'ST';

export interface SensorSlot {
  readonly series: SeriesId;
  readonly tagPrefix: SensorTagPrefix;
  /** Node types the sensor is allowed to hang off. */
  readonly attachToTypes: readonly SchematicNodeType[];
  readonly required: boolean;
}

export interface NodeCountRule {
  readonly min: number;
  readonly max: number;
}

export interface SkeletonCircuitNode {
  readonly type: SchematicNodeType;
  readonly grid: GridPosition;
  /** Thermal side of the pipe leaving this node in the generated circuit. */
  readonly outletSide: PipeSide;
}

export interface MachineProfile {
  readonly id: MachineProfileId;
  /** i18n key of the profile's display name. */
  readonly nameKey: string;
  readonly nodeRules: Readonly<Record<SchematicNodeType, NodeCountRule>>;
  /** When set, the piping must close into a full circuit (no dead ends, no orphan nodes). */
  readonly requiredLoop: boolean;
  readonly sensorSlots: readonly SensorSlot[];
  readonly gridSize: { readonly cols: number; readonly rows: number };
  /** Profile-owned physical order and placement of the minimal generated circuit. */
  readonly skeletonCircuit: readonly SkeletonCircuitNode[];
}

const NONE: NodeCountRule = { min: 0, max: 0 };
const ONE: NodeCountRule = { min: 1, max: 1 };
const OPTIONAL: NodeCountRule = { min: 0, max: 1 };

function nodeRules(
  overrides: Partial<Record<SchematicNodeType, NodeCountRule>>,
): Readonly<Record<SchematicNodeType, NodeCountRule>> {
  const rules = {} as Record<SchematicNodeType, NodeCountRule>;
  for (const type of SCHEMATIC_NODE_TYPES) {
    rules[type] = overrides[type] ?? NONE;
  }
  return rules;
}

/**
 * TCU — temperature control unit (spec models: HB-Therm Thermo-6, Wittmann TEMPRO):
 * reservoir(1), pump(1), heater(1), heat exchanger(1), consumer machine(0–1); full loop;
 * four sensor slots. Valves are allowed (0–2) because every verified TCU modulates cooling
 * with a valve on the cooler line (Regloplas Y6, Advantage AVT); the pressurised-water class
 * additionally carries a suction strainer and a relief valve (Regloplas components 60 and 57).
 */
export const TCU_PROFILE: MachineProfile = {
  id: 'tcu',
  nameKey: 'machines.profiles.tcu',
  nodeRules: nodeRules({
    reservoir: ONE,
    pump: ONE,
    heater: ONE,
    heatExchanger: ONE,
    machine: OPTIONAL,
    valve: { min: 0, max: 2 },
    strainer: OPTIONAL,
    safetyValve: OPTIONAL,
  }),
  requiredLoop: true,
  sensorSlots: [
    {
      series: 'temperature',
      tagPrefix: 'TT',
      attachToTypes: ['heater', 'machine', 'reservoir'],
      required: true,
    },
    { series: 'pressure', tagPrefix: 'PT', attachToTypes: ['pump'], required: true },
    { series: 'flow', tagPrefix: 'FT', attachToTypes: ['heatExchanger', 'pump'], required: true },
    { series: 'rpm', tagPrefix: 'ST', attachToTypes: ['pump'], required: true },
  ],
  gridSize: { cols: 40, rows: 24 },
  skeletonCircuit: [
    { type: 'reservoir', grid: [4, 16], outletSide: 'cold' },
    { type: 'pump', grid: [12, 16], outletSide: 'cold' },
    { type: 'heater', grid: [28, 16], outletSide: 'hot' },
    { type: 'heatExchanger', grid: [28, 4], outletSide: 'cold' },
  ],
};

/**
 * CHILLER — like K-207, plus the refrigeration-circuit node types: compressor(0–1),
 * condenser(0–1), expansion valve(0–1), evaporator(0–1). Generic valves are tolerated as
 * plain circuit fittings (up to two), which K-207 simply does not use. The liquid line may
 * carry its standard filter drier and sight glass (Advantage FYI #279 items 6 and 8), the
 * pump suction a strainer, and the loop a relief valve.
 */
export const CHILLER_PROFILE: MachineProfile = {
  id: 'chiller',
  nameKey: 'machines.profiles.chiller',
  nodeRules: nodeRules({
    reservoir: ONE,
    pump: ONE,
    heatExchanger: ONE,
    machine: OPTIONAL,
    valve: { min: 0, max: 2 },
    compressor: OPTIONAL,
    condenser: OPTIONAL,
    expansionValve: OPTIONAL,
    evaporator: OPTIONAL,
    filterDrier: OPTIONAL,
    sightGlass: OPTIONAL,
    strainer: OPTIONAL,
    safetyValve: OPTIONAL,
  }),
  requiredLoop: true,
  sensorSlots: [
    {
      series: 'temperature',
      tagPrefix: 'TT',
      attachToTypes: ['machine', 'evaporator', 'reservoir'],
      required: true,
    },
    { series: 'pressure', tagPrefix: 'PT', attachToTypes: ['pump', 'compressor'], required: true },
    {
      series: 'flow',
      tagPrefix: 'FT',
      attachToTypes: ['heatExchanger', 'condenser', 'pump'],
      required: true,
    },
    { series: 'rpm', tagPrefix: 'ST', attachToTypes: ['pump', 'compressor'], required: true },
  ],
  gridSize: { cols: 48, rows: 32 },
  skeletonCircuit: [
    { type: 'reservoir', grid: [4, 24], outletSide: 'cold' },
    { type: 'pump', grid: [16, 24], outletSide: 'cold' },
    { type: 'heatExchanger', grid: [28, 8], outletSide: 'cold' },
  ],
};

export const MACHINE_PROFILES: Readonly<Record<MachineProfileId, MachineProfile>> = {
  tcu: TCU_PROFILE,
  chiller: CHILLER_PROFILE,
};

/**
 * Profile-layer validation (configurator spec §2). Expects a document that already passed the
 * structural `validateSchematic`; returns every violation of the profile envelope as English
 * strings, or an empty array when the document fits the profile.
 */
export function validateAgainstProfile(
  doc: MachineSchematic,
  profile: MachineProfile,
): readonly string[] {
  const errors: string[] = [];

  if (doc.profileId !== profile.id) {
    errors.push(
      `Document profile "${doc.profileId}" does not match the validated profile "${profile.id}".`,
    );
  }

  checkNodeCounts(doc, profile, errors);
  checkGridBounds(doc, profile, errors);
  if (profile.requiredLoop) {
    checkLoopClosure(doc, errors);
  }
  checkSensorSlots(doc, profile, errors);

  return errors;
}

function checkNodeCounts(doc: MachineSchematic, profile: MachineProfile, errors: string[]): void {
  for (const type of SCHEMATIC_NODE_TYPES) {
    const rule = profile.nodeRules[type];
    const count = doc.nodes.filter((node) => node.type === type).length;
    if (count < rule.min) {
      errors.push(
        `Profile "${profile.id}" requires at least ${rule.min} node(s) of type ${type}; found ${count}.`,
      );
    } else if (count > rule.max) {
      errors.push(
        `Profile "${profile.id}" allows at most ${rule.max} node(s) of type ${type}; found ${count}.`,
      );
    }
  }
}

function checkGridBounds(doc: MachineSchematic, profile: MachineProfile, errors: string[]): void {
  const { cols, rows } = profile.gridSize;
  for (const node of doc.nodes) {
    const [column, row] = node.grid;
    if (column >= cols || row >= rows) {
      errors.push(
        `Node "${node.id}" at grid [${column}, ${row}] is outside the profile grid of ${cols}x${rows} cells.`,
      );
    }
  }
}

/**
 * Loop closure: at least one pipe, every process node participates, every piped process node has
 * both an incoming and an outgoing pipe, and the piping forms one connected circuit system.
 * A safety valve may terminate one pressure branch because its discharge is deliberately outside
 * the recirculating process. Thermally coupled sub-loops count as closed when they share a node,
 * as the water and refrigerant circuits do in a real chiller's evaporator.
 */
function checkLoopClosure(doc: MachineSchematic, errors: string[]): void {
  if (doc.pipes.length === 0) {
    errors.push('The profile requires a closed piping loop, but the document has no pipes.');
    return;
  }

  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const pipe of doc.pipes) {
    outgoing.set(pipe.from, (outgoing.get(pipe.from) ?? 0) + 1);
    incoming.set(pipe.to, (incoming.get(pipe.to) ?? 0) + 1);
  }

  const terminalSafetyValveIds = new Set<string>();
  for (const node of doc.nodes) {
    const into = incoming.get(node.id) ?? 0;
    const out = outgoing.get(node.id) ?? 0;
    if (into === 0 && out === 0) {
      errors.push(`Node "${node.id}" is not connected to the piping loop.`);
    } else if (node.type === 'safetyValve' && out === 0) {
      terminalSafetyValveIds.add(node.id);
      if (into !== 1) {
        errors.push(
          `Terminal safety valve "${node.id}" must have exactly one incoming pressure branch; found ${into}.`,
        );
      }
    } else if (out === 0) {
      errors.push(`The piping loop does not close: node "${node.id}" has no outgoing pipe.`);
    } else if (into === 0) {
      errors.push(`The piping loop does not close: node "${node.id}" has no incoming pipe.`);
    }
  }

  const circuit: MachineSchematic = {
    ...doc,
    nodes: doc.nodes.filter((node) => !terminalSafetyValveIds.has(node.id)),
    pipes: doc.pipes.filter(
      (pipe) => !terminalSafetyValveIds.has(pipe.from) && !terminalSafetyValveIds.has(pipe.to),
    ),
  };
  if (circuit.pipes.length === 0) {
    errors.push(
      'The profile requires a closed piping loop, but only terminal branches were found.',
    );
    return;
  }

  const components = countWeakComponents(circuit);
  if (components > 1) {
    errors.push(
      `The piping does not form a single connected circuit: found ${components} disconnected groups.`,
    );
  } else if (!isStronglyConnected(circuit)) {
    errors.push('The piping is connected but does not form one closed directed circuit.');
  }
}

function isStronglyConnected(doc: MachineSchematic): boolean {
  if (doc.nodes.length === 0) {
    return true;
  }
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const pipe of doc.pipes) {
    link(outgoing, pipe.from, pipe.to);
    link(incoming, pipe.to, pipe.from);
  }
  const start = doc.nodes[0].id;
  return (
    reachableFrom(start, outgoing).size === doc.nodes.length &&
    reachableFrom(start, incoming).size === doc.nodes.length
  );
}

function link(graph: Map<string, string[]>, from: string, to: string): void {
  const neighbours = graph.get(from) ?? [];
  neighbours.push(to);
  graph.set(from, neighbours);
}

function reachableFrom(start: string, graph: ReadonlyMap<string, readonly string[]>): Set<string> {
  const seen = new Set<string>();
  const pending = [start];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || seen.has(current)) {
      continue;
    }
    seen.add(current);
    pending.push(...(graph.get(current) ?? []));
  }
  return seen;
}

function countWeakComponents(doc: MachineSchematic): number {
  const neighbours = new Map<string, string[]>();
  for (const pipe of doc.pipes) {
    link(neighbours, pipe.from, pipe.to);
    link(neighbours, pipe.to, pipe.from);
  }

  const seen = new Set<string>();
  let components = 0;
  for (const start of neighbours.keys()) {
    if (seen.has(start)) {
      continue;
    }
    components += 1;
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.pop() as string;
      if (seen.has(current)) {
        continue;
      }
      seen.add(current);
      queue.push(...(neighbours.get(current) ?? []));
    }
  }
  return components;
}

function checkSensorSlots(doc: MachineSchematic, profile: MachineProfile, errors: string[]): void {
  const nodeTypeById = new Map(doc.nodes.map((node) => [node.id, node.type]));
  const slotBySeries = new Map(profile.sensorSlots.map((slot) => [slot.series, slot]));
  const countBySeries = new Map<SeriesId, number>();

  for (const instrument of doc.instruments) {
    countBySeries.set(instrument.series, (countBySeries.get(instrument.series) ?? 0) + 1);
    const slot = slotBySeries.get(instrument.series);
    if (!slot) {
      errors.push(
        `Instrument "${instrument.tag}": profile "${profile.id}" has no sensor slot for series ${instrument.series}.`,
      );
      continue;
    }
    if (!instrument.tag.startsWith(`${slot.tagPrefix}-`)) {
      errors.push(
        `Instrument "${instrument.tag}": the tag prefix for series ${instrument.series} must be "${slot.tagPrefix}".`,
      );
    }
    const nodeType = nodeTypeById.get(instrument.attachTo);
    if (nodeType !== undefined && !slot.attachToTypes.includes(nodeType)) {
      errors.push(
        `Instrument "${instrument.tag}" attaches to node "${instrument.attachTo}" of type ${nodeType}; allowed types: ${slot.attachToTypes.join(', ')}.`,
      );
    }
  }

  for (const [series, count] of countBySeries) {
    if (count > 1) {
      errors.push(`Profile "${profile.id}" allows one ${series} instrument slot; found ${count}.`);
    }
  }

  for (const slot of profile.sensorSlots) {
    if (!slot.required) {
      continue;
    }
    const present = doc.instruments.some((instrument) => instrument.series === slot.series);
    if (!present) {
      errors.push(
        `Profile "${profile.id}" requires a ${slot.series} sensor (tag prefix "${slot.tagPrefix}"); none found.`,
      );
    }
  }
}

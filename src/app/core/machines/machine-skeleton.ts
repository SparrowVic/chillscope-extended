import type {
  Instrument,
  MachineSchematic,
  Pipe,
  SchematicNode,
  SchematicNodeType,
} from '../schematic/schematic.models';
import { SCHEMATIC_NODE_TYPES } from '../schematic/schematic.models';
import type { MachineProfile } from './machine-profile';

const NODE_ID_PREFIX: Readonly<Record<SchematicNodeType, string>> = {
  pump: 'PMP',
  heatExchanger: 'HX',
  reservoir: 'RES',
  machine: 'MCH',
  valve: 'VLV',
  heater: 'HTR',
  compressor: 'CMP',
  condenser: 'CND',
  expansionValve: 'EXV',
  evaporator: 'EVP',
  filterDrier: 'FDR',
  sightGlass: 'SGL',
  strainer: 'STR',
  safetyValve: 'SFV',
};

/**
 * Builds the minimal valid document for a profile (configurator spec §3, `create`): every node
 * type at its required minimum, chained into a closed loop, with one instrument per required
 * sensor slot. The result passes both `validateSchematic` and `validateAgainstProfile`; the
 * library store makes the id unique before adding it.
 */
export function skeletonFor(profile: MachineProfile): MachineSchematic {
  const nodes = skeletonNodes(profile);
  return {
    id: `${profile.id.toUpperCase()}-NEW`,
    name: `${profile.id.toUpperCase()}-NEW`,
    revision: 'A/rev.01',
    profileId: profile.id,
    nodes,
    pipes: skeletonPipes(profile, nodes),
    instruments: skeletonInstruments(profile, nodes),
  };
}

function skeletonNodes(profile: MachineProfile): readonly SchematicNode[] {
  assertSkeletonCircuit(profile);
  const nodes: SchematicNode[] = [];
  const occurrences = new Map<SchematicNodeType, number>();
  for (const template of profile.skeletonCircuit) {
    const occurrence = (occurrences.get(template.type) ?? 0) + 1;
    occurrences.set(template.type, occurrence);
    const id = `${NODE_ID_PREFIX[template.type]}${occurrence}`;
    nodes.push({
      id,
      type: template.type,
      label: id,
      grid: [template.grid[0], template.grid[1]],
    });
  }
  return nodes;
}

function assertSkeletonCircuit(profile: MachineProfile): void {
  for (const type of SCHEMATIC_NODE_TYPES) {
    const expected = profile.nodeRules[type].min;
    const actual = profile.skeletonCircuit.filter((node) => node.type === type).length;
    if (actual !== expected) {
      throw new Error(
        `Profile "${profile.id}" skeleton must contain ${expected} node(s) of type ${type}; found ${actual}.`,
      );
    }
  }
}

function skeletonPipes(profile: MachineProfile, nodes: readonly SchematicNode[]): readonly Pipe[] {
  if (nodes.length < 2) {
    return [];
  }
  return nodes.map((node, index) => {
    const next = nodes[(index + 1) % nodes.length];
    return {
      from: node.id,
      to: next.id,
      side: profile.skeletonCircuit[index].outletSide,
    };
  });
}

function skeletonInstruments(
  profile: MachineProfile,
  nodes: readonly SchematicNode[],
): readonly Instrument[] {
  const instruments: Instrument[] = [];
  let loop = 101;
  for (const slot of profile.sensorSlots) {
    if (!slot.required) {
      continue;
    }
    const target = nodes.find((node) => slot.attachToTypes.includes(node.type));
    if (!target) {
      throw new Error(
        `Profile "${profile.id}" requires a ${slot.series} sensor but its minimal node set offers no ${slot.attachToTypes.join('/')} to attach it to.`,
      );
    }
    instruments.push({
      tag: `${slot.tagPrefix}-${loop}`,
      series: slot.series,
      attachTo: target.id,
    });
    loop += 1;
  }
  return instruments;
}

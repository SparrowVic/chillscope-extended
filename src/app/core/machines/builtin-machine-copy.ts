import type { MachineSchematic } from '../schematic/schematic.models';

type Translator = (key: string) => string;

interface BuiltInCopyKeys {
  readonly name: string;
  readonly nodes: ReadonlyMap<string, string>;
}

const BUILT_IN_COPY_KEYS: ReadonlyMap<string, BuiltInCopyKeys> = new Map([
  [
    'K-207',
    {
      name: 'machines.builtIns.k207.name',
      nodes: new Map([
        ['P1', 'machines.builtIns.k207.nodes.P1'],
        ['W1', 'machines.builtIns.k207.nodes.W1'],
        ['Z1', 'machines.builtIns.k207.nodes.Z1'],
        ['M1', 'machines.builtIns.k207.nodes.M1'],
      ]),
    },
  ],
  [
    'TCU-01',
    {
      name: 'machines.builtIns.tcu01.name',
      nodes: new Map([
        ['Z1', 'machines.builtIns.tcu01.nodes.Z1'],
        ['F1', 'machines.builtIns.tcu01.nodes.F1'],
        ['P1', 'machines.builtIns.tcu01.nodes.P1'],
        ['G1', 'machines.builtIns.tcu01.nodes.G1'],
        ['SV1', 'machines.builtIns.tcu01.nodes.SV1'],
        ['M1', 'machines.builtIns.tcu01.nodes.M1'],
        ['Y1', 'machines.builtIns.tcu01.nodes.Y1'],
        ['W1', 'machines.builtIns.tcu01.nodes.W1'],
      ]),
    },
  ],
  [
    'CH-02',
    {
      name: 'machines.builtIns.ch02.name',
      nodes: new Map([
        ['Z1', 'machines.builtIns.ch02.nodes.Z1'],
        ['F1', 'machines.builtIns.ch02.nodes.F1'],
        ['P1', 'machines.builtIns.ch02.nodes.P1'],
        ['M1', 'machines.builtIns.ch02.nodes.M1'],
        ['W1', 'machines.builtIns.ch02.nodes.W1'],
        ['E1', 'machines.builtIns.ch02.nodes.E1'],
        ['S1', 'machines.builtIns.ch02.nodes.S1'],
        ['K1', 'machines.builtIns.ch02.nodes.K1'],
        ['FD1', 'machines.builtIns.ch02.nodes.FD1'],
        ['SG1', 'machines.builtIns.ch02.nodes.SG1'],
        ['R1', 'machines.builtIns.ch02.nodes.R1'],
      ]),
    },
  ],
]);

function translateOrFallback(
  key: string | undefined,
  fallback: string,
  translate: Translator,
): string {
  if (key === undefined) {
    return fallback;
  }
  const text = translate(key);
  return text === key ? fallback : text;
}

/** Localises a built-in name while leaving every user document exactly as authored. */
export function displayMachineName(
  machine: Pick<MachineSchematic, 'id' | 'name'>,
  translate: Translator,
): string {
  return translateOrFallback(BUILT_IN_COPY_KEYS.get(machine.id)?.name, machine.name, translate);
}

/** Node ids are meaningful only inside their built-in document; custom labels always win. */
export function displayNodeLabel(
  machineId: string,
  nodeId: string,
  fallback: string,
  translate: Translator,
): string {
  return translateOrFallback(
    BUILT_IN_COPY_KEYS.get(machineId)?.nodes.get(nodeId),
    fallback,
    translate,
  );
}

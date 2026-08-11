import type { SeriesId, SeriesThresholds } from '../data/series.catalog';

/**
 * A machine schematic is data, not a
 * drawing: a validated document describes nodes on a grid, pipes between them and instruments
 * hung off nodes; a generic renderer draws it. The model includes refrigeration node types and
 * `profileId`.
 * The last four are the fittings real units carry (research log, 2026-08-05): the refrigerant
 * liquid line's filter drier and sight glass, the pump-suction strainer and the relief valve of
 * a pressurised-water loop.
 */
export const SCHEMATIC_NODE_TYPES = [
  'pump',
  'heatExchanger',
  'reservoir',
  'machine',
  'valve',
  'heater',
  'compressor',
  'condenser',
  'expansionValve',
  'evaporator',
  'filterDrier',
  'sightGlass',
  'strainer',
  'safetyValve',
] as const;

export type SchematicNodeType = (typeof SCHEMATIC_NODE_TYPES)[number];

/** The machine-profile envelope a document is configured within (configurator spec §2). */
export const MACHINE_PROFILE_IDS = ['tcu', 'chiller'] as const;

export type MachineProfileId = (typeof MACHINE_PROFILE_IDS)[number];

export function isMachineProfileId(value: string): value is MachineProfileId {
  return (MACHINE_PROFILE_IDS as readonly string[]).includes(value);
}

export type PipeSide = 'cold' | 'hot';

/** `[column, row]` on the layout grid; bounded non-negative integers at the exchange boundary. */
export type GridPosition = readonly [column: number, row: number];

export interface SchematicNode {
  readonly id: string;
  readonly type: SchematicNodeType;
  readonly label: string;
  readonly grid: GridPosition;
  /** ISA tag of this node's primary instrument; motion uses the symbol's physical drive series. */
  readonly tag?: string;
  /** Reservoirs with `level: true` render a liquid level. */
  readonly level?: boolean;
  /** Machines with `heatSource: true` render as the hot side of the loop. */
  readonly heatSource?: boolean;
}

export interface Pipe {
  readonly from: string;
  readonly to: string;
  readonly side: PipeSide;
}

export interface Instrument {
  /** ISA-5.1 style tag, `LL-NNN` (e.g. `TT-101` = temperature transmitter, loop 101). */
  readonly tag: string;
  /** Binds the instrument to the same series catalogue the rest of the app uses. */
  readonly series: SeriesId;
  readonly attachTo: string;
  /**
   * Optional per-machine alarm-band override (configurator spec §2). The simulation physics
   * stays global; only the classification bands may differ per instrument slot.
   */
  readonly thresholds?: SeriesThresholds;
}

export interface MachineSchematic {
  readonly id: string;
  readonly name: string;
  readonly revision: string;
  /** The profile envelope this document must satisfy (configurator spec §2). */
  readonly profileId: MachineProfileId;
  readonly nodes: readonly SchematicNode[];
  readonly pipes: readonly Pipe[];
  readonly instruments: readonly Instrument[];
}

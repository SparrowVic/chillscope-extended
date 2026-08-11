import type { SchematicNode, SchematicNodeType } from './schematic.models';
import type { NodeSymbol, SymbolEffect, SymbolShape } from './symbols-model';
import { HEAT_EXCHANGER, HEATER, MACHINE, PUMP, RESERVOIR } from './symbols-hydronic';
import { COMPRESSOR, CONDENSER, EVAPORATOR, EXPANSION_VALVE } from './symbols-refrigeration';
import { FILTER_DRIER, SAFETY_VALVE, SIGHT_GLASS, STRAINER, VALVE } from './symbols-inline';

/**
 * The symbol library's public face: the per-family definition files feed one frozen record and
 * every consumer keeps importing from here. Types and shared constants live in symbols-model.
 */
export * from './symbols-model';

export const NODE_SYMBOLS: Readonly<Record<SchematicNodeType, NodeSymbol>> = {
  pump: PUMP,
  heatExchanger: HEAT_EXCHANGER,
  reservoir: RESERVOIR,
  machine: MACHINE,
  valve: VALVE,
  heater: HEATER,
  compressor: COMPRESSOR,
  condenser: CONDENSER,
  expansionValve: EXPANSION_VALVE,
  evaporator: EVAPORATOR,
  filterDrier: FILTER_DRIER,
  sightGlass: SIGHT_GLASS,
  strainer: STRAINER,
  safetyValve: SAFETY_VALVE,
};

const EMPTY_RESERVOIR_SHAPES = RESERVOIR.shapes.slice(0, 1);
const NO_EFFECTS: readonly SymbolEffect[] = [];

/** Optional document flags affect the symbol without duplicating geometry in renderers. */
export function staticShapesForNode(node: SchematicNode): readonly SymbolShape[] {
  const shapes = NODE_SYMBOLS[node.type].shapes;
  // The reservoir definition stores its outline first and the liquid fill/line afterwards.
  return node.type === 'reservoir' && node.level !== true ? EMPTY_RESERVOIR_SHAPES : shapes;
}

/** Working-state overlays for a node; a reservoir without a liquid level has nothing to ripple. */
export function effectsForNode(node: SchematicNode): readonly SymbolEffect[] {
  if (
    (node.type === 'reservoir' && node.level !== true) ||
    (node.type === 'machine' && node.heatSource !== true)
  ) {
    return NO_EFFECTS;
  }
  return NODE_SYMBOLS[node.type].effects ?? NO_EFFECTS;
}

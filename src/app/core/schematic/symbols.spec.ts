import { describe, expect, it } from 'vitest';

import { isSeriesId } from '../data/series.catalog';
import {
  SCHEMATIC_NODE_TYPES,
  type SchematicNode,
  type SchematicNodeType,
} from './schematic.models';
import { NODE_SYMBOLS, effectsForNode, type SymbolEffectKind } from './symbols';

function node(overrides: Partial<SchematicNode> & Pick<SchematicNode, 'type'>): SchematicNode {
  return { id: 'N1', label: 'NODE N-1', grid: [0, 0], ...overrides };
}

function effectKinds(type: SchematicNodeType): readonly SymbolEffectKind[] {
  return (NODE_SYMBOLS[type].effects ?? []).map((effect) => effect.kind);
}

describe('symbol working-state metadata', () => {
  it('leads the three driven machines with their canonical mechanism', () => {
    const lead = (type: SchematicNodeType) => NODE_SYMBOLS[type].animatedGroups?.[0];
    expect(lead('pump')?.kind).toBe('rotor');
    expect(lead('heatExchanger')?.kind).toBe('fan');
    expect(lead('compressor')?.kind).toBe('piston');
    expect(lead('pump')?.drive).toBe('rpm');
    expect(lead('heatExchanger')?.drive).toBe('flow');
    expect(lead('compressor')?.drive).toBe('rpm');
  });

  it('keeps every mechanism layer structurally sound', () => {
    for (const type of SCHEMATIC_NODE_TYPES) {
      const symbol = NODE_SYMBOLS[type];
      for (const group of symbol.animatedGroups ?? []) {
        expect(group.shapes.length, `${type}/${group.id}`).toBeGreaterThan(0);
        expect(isSeriesId(group.drive), `${type}/${group.id}`).toBe(true);
        expect(group.speed ?? 1, `${type}/${group.id} speed`).toBeGreaterThan(0);
        expect(group.originX, `${type}/${group.id} x`).toBeGreaterThanOrEqual(0);
        expect(group.originX, `${type}/${group.id} x`).toBeLessThanOrEqual(symbol.width);
        expect(group.originY, `${type}/${group.id} y`).toBeGreaterThanOrEqual(0);
        expect(group.originY, `${type}/${group.id} y`).toBeLessThanOrEqual(symbol.height);
      }
    }
  });

  it('gives every component at least one working-state effect', () => {
    for (const type of SCHEMATIC_NODE_TYPES) {
      expect(effectKinds(type).length, type).toBeGreaterThan(0);
    }
  });

  it('declares a symbol for every schematic node type', () => {
    for (const type of SCHEMATIC_NODE_TYPES) {
      const symbol = NODE_SYMBOLS[type];
      expect(symbol.shapes.length, type).toBeGreaterThan(0);
      expect(symbol.width, type).toBeGreaterThan(0);
      expect(symbol.height, type).toBeGreaterThan(0);
    }
  });

  it('keeps every effect group non-empty for every declared node type', () => {
    for (const type of SCHEMATIC_NODE_TYPES) {
      for (const effect of NODE_SYMBOLS[type].effects ?? []) {
        expect(effect.shapes.length, `${type}/${effect.kind}`).toBeGreaterThan(0);
        expect(isSeriesId(effect.drive), `${type}/${effect.kind}`).toBe(true);
      }
    }
  });

  it('gates semantic effects with the telemetry that gives them physical meaning', () => {
    expect(NODE_SYMBOLS.heater.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ drive: 'temperature', activation: 'positive', tone: 'hot' }),
      ]),
    );
    expect(NODE_SYMBOLS.sightGlass.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ drive: 'pressure', activation: 'warning', tone: 'incident' }),
      ]),
    );
    expect(NODE_SYMBOLS.safetyValve.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          drive: 'pressure',
          activation: 'high-warning',
          tone: 'incident',
        }),
      ]),
    );
  });
});

describe('effectsForNode', () => {
  it('returns the full effect set for ordinary nodes', () => {
    expect(effectsForNode(node({ type: 'heater' }))).toEqual(NODE_SYMBOLS.heater.effects);
  });

  it('gives a reservoir without a liquid level nothing to ripple', () => {
    expect(effectsForNode(node({ type: 'reservoir' }))).toEqual([]);
    expect(effectsForNode(node({ type: 'reservoir', level: false }))).toEqual([]);
    expect(effectsForNode(node({ type: 'reservoir', level: true }))).toEqual(
      NODE_SYMBOLS.reservoir.effects,
    );
  });

  it('shows heat emission only on machines declared as heat sources', () => {
    expect(effectsForNode(node({ type: 'machine' }))).toEqual([]);
    expect(effectsForNode(node({ type: 'machine', heatSource: false }))).toEqual([]);
    expect(effectsForNode(node({ type: 'machine', heatSource: true }))).toEqual(
      NODE_SYMBOLS.machine.effects,
    );
  });
});

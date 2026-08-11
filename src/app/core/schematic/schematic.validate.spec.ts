import { describe, expect, it } from 'vitest';
import { K207_SCHEMATIC } from './k207.schematic';
import { SCHEMATIC_LIMITS, validateSchematic } from './schematic.validate';

interface MutableDoc {
  id: unknown;
  name: unknown;
  revision: unknown;
  profileId?: unknown;
  nodes: Record<string, unknown>[];
  pipes: Record<string, unknown>[];
  instruments: Record<string, unknown>[];
}

function draft(): MutableDoc {
  return JSON.parse(JSON.stringify(K207_SCHEMATIC)) as MutableDoc;
}

function errorsOf(input: unknown): readonly string[] {
  const result = validateSchematic(input);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.errors;
}

describe('validateSchematic', () => {
  it('accepts the K-207 document', () => {
    const result = validateSchematic(draft());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc).toEqual(K207_SCHEMATIC);
    }
  });

  it('returns a copy detached from the input', () => {
    const input = draft();
    const result = validateSchematic(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      input.nodes[0]['id'] = 'HACKED';
      expect(result.doc.nodes[0].id).toBe('P1');
    }
  });

  it('rejects non-object documents', () => {
    for (const input of [null, undefined, 42, 'doc', [1]]) {
      expect(errorsOf(input)).toEqual(['Schematic document must be a JSON object.']);
    }
  });

  it('rejects missing header fields', () => {
    const doc = draft();
    doc.name = '';
    delete (doc as Partial<MutableDoc>).revision;
    const errors = errorsOf(doc);
    expect(errors).toContain('"name" must be a non-empty string.');
    expect(errors).toContain('"revision" must be a non-empty string.');
  });

  it('rejects blank and control-character exchange strings', () => {
    const blank = draft();
    blank.name = '   ';
    expect(errorsOf(blank)).toContain('"name" must be a non-empty string.');

    const controlled = draft();
    controlled.nodes[0]['label'] = 'PUMP\u0000P-1';
    expect(errorsOf(controlled)).toContain(
      'nodes[0]: "label" must not contain control characters.',
    );
  });

  it('rejects unknown properties instead of silently stripping them', () => {
    const doc = draft();
    (doc as MutableDoc & { secret?: boolean }).secret = true;
    doc.nodes[0]['colour'] = 'red';
    doc.instruments[0]['thresholds'] = {
      criticalMin: 35,
      warningMin: 40,
      warningMax: 70,
      criticalMax: 80,
      tolerance: 2,
    };

    const errors = errorsOf(doc);
    expect(errors).toContain('unknown property "secret".');
    expect(errors).toContain('nodes[0]: unknown property "colour".');
    expect(errors.join('\n')).toContain('instruments[0]: "thresholds" must provide finite numbers');
  });

  it('rejects duplicate node ids', () => {
    const doc = draft();
    doc.nodes[1]['id'] = 'P1';
    doc.nodes[1]['grid'] = [7, 2];
    expect(errorsOf(doc)).toContain('Duplicate node id "P1" — node ids must be unique.');
  });

  it('rejects unknown node types', () => {
    const doc = draft();
    doc.nodes[0]['type'] = 'turbine';
    expect(errorsOf(doc).join('\n')).toContain('unknown node type "turbine"');
  });

  it('accepts every refrigeration node type added by the configurator spec', () => {
    const doc = draft();
    doc.nodes.push(
      { id: 'G1', type: 'heater', label: 'HEATER', grid: [0, 0] },
      { id: 'S1', type: 'compressor', label: 'COMPRESSOR', grid: [8, 0] },
      { id: 'K1', type: 'condenser', label: 'CONDENSER', grid: [16, 0] },
      { id: 'R1', type: 'expansionValve', label: 'EXPANSION VALVE', grid: [24, 0] },
      { id: 'E1', type: 'evaporator', label: 'EVAPORATOR', grid: [32, 0] },
    );
    expect(validateSchematic(doc).ok).toBe(true);
  });

  it('rejects a missing or unknown profileId', () => {
    const missing = draft();
    delete missing.profileId;
    expect(errorsOf(missing).join('\n')).toContain('"profileId" undefined must be one of');

    const unknown = draft();
    unknown.profileId = 'freezer';
    expect(errorsOf(unknown)).toContain('"profileId" "freezer" must be one of tcu, chiller.');
  });

  it('accepts and copies per-instrument threshold overrides', () => {
    const doc = draft();
    const thresholds = { warningMin: 40, warningMax: 70, criticalMin: 35, criticalMax: 80 };
    doc.instruments[0]['thresholds'] = { ...thresholds };
    const result = validateSchematic(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.instruments[0].thresholds).toEqual(thresholds);
    }
  });

  it('rejects malformed threshold overrides', () => {
    const doc = draft();
    doc.instruments[0]['thresholds'] = { warningMin: 40, warningMax: 'high' };
    expect(errorsOf(doc)).toContain(
      'instruments[0]: "thresholds" must provide finite numbers ordered as criticalMin < warningMin < warningMax < criticalMax.',
    );
  });

  it('rejects threshold overrides whose bands cross', () => {
    const doc = draft();
    doc.instruments[0]['thresholds'] = {
      criticalMin: 40,
      warningMin: 35,
      warningMax: 70,
      criticalMax: 80,
    };
    expect(errorsOf(doc).join('\n')).toContain('ordered as criticalMin < warningMin');
  });

  it('rejects negative and non-integer grid positions', () => {
    const negative = draft();
    negative.nodes[0]['grid'] = [-1, 6];
    expect(errorsOf(negative)).toContain('nodes[0]: grid position [-1, 6] must be non-negative.');

    const fractional = draft();
    fractional.nodes[0]['grid'] = [1.5, 6];
    expect(errorsOf(fractional)).toContain(
      'nodes[0]: "grid" must be a [column, row] pair of integers.',
    );
  });

  it('bounds grid coordinates before layout turns them into SVG dimensions', () => {
    const beyondLimit = draft();
    beyondLimit.nodes[0]['grid'] = [SCHEMATIC_LIMITS.gridCoordinate + 1, 6];
    expect(errorsOf(beyondLimit)).toContain(
      `nodes[0]: grid position [${SCHEMATIC_LIMITS.gridCoordinate + 1}, 6] must not exceed ${SCHEMATIC_LIMITS.gridCoordinate} on either axis.`,
    );

    const unsafe = draft();
    unsafe.nodes[0]['grid'] = [Number.MAX_SAFE_INTEGER + 1, 6];
    expect(errorsOf(unsafe).join('\n')).toContain('must use safe integers');
  });

  it('rejects two nodes on the same grid cell', () => {
    const doc = draft();
    doc.nodes[2]['grid'] = [16, 24];
    expect(errorsOf(doc)).toContain('Nodes "P1" and "Z1" collide at grid [16, 24].');
  });

  it('rejects wide symbols that overlap from neighbouring grid cells', () => {
    const doc = draft();
    doc.nodes[1]['grid'] = [17, 24];
    expect(errorsOf(doc)).toContain(
      'Nodes "P1" at grid [16, 24] and "W1" at grid [17, 24] have overlapping symbol boxes.',
    );
  });

  it('rejects pipes referencing unknown nodes', () => {
    const doc = draft();
    doc.pipes[0]['to'] = 'X9';
    expect(errorsOf(doc)).toContain('pipes[0]: "to" references unknown node "X9".');
  });

  it('rejects pipes with an invalid side', () => {
    const doc = draft();
    doc.pipes[2]['side'] = 'warm';
    expect(errorsOf(doc)).toContain('pipes[2]: side "warm" must be "cold" or "hot".');
  });

  it('rejects self-referencing pipes', () => {
    const doc = draft();
    doc.pipes[0]['from'] = 'P1';
    expect(errorsOf(doc)).toContain('pipes[0]: a pipe cannot connect node "P1" to itself.');
  });

  it('rejects instruments attached to unknown nodes', () => {
    const doc = draft();
    doc.instruments[0]['attachTo'] = 'K9';
    expect(errorsOf(doc)).toContain('instruments[0]: "attachTo" references unknown node "K9".');
  });

  it('rejects instruments with an unknown series id', () => {
    const doc = draft();
    doc.instruments[1]['series'] = 'humidity';
    expect(errorsOf(doc).join('\n')).toContain(
      'instruments[1]: series "humidity" is not a known series id',
    );
  });

  it('rejects malformed ISA tags on instruments and nodes', () => {
    for (const tag of ['T-101', 'TT101', 'tt-101', 'TT-1', 'TT-1014']) {
      const doc = draft();
      doc.instruments[0]['tag'] = tag;
      expect(errorsOf(doc).join('\n')).toContain('must match the ISA format LL-NNN');
    }

    const doc = draft();
    doc.nodes[0]['tag'] = 'st104';
    expect(errorsOf(doc).join('\n')).toContain(
      'nodes[0]: node tag "st104" must match the ISA format',
    );
  });

  it('requires a primary instrument tag to reference an instrument attached to that node', () => {
    const missing = draft();
    missing.nodes[0]['tag'] = 'ST-999';
    expect(errorsOf(missing)).toContain('Node "P1" references unknown instrument tag "ST-999".');

    const misplaced = draft();
    misplaced.instruments[3]['attachTo'] = 'W1';
    expect(errorsOf(misplaced)).toContain(
      'Node "P1" uses instrument tag "ST-104", but that instrument is attached to "W1".',
    );
  });

  it('rejects render flags on node types that cannot use them', () => {
    const doc = draft();
    doc.nodes[2]['tag'] = 'ST-104';
    doc.nodes[0]['level'] = true;
    doc.nodes[1]['heatSource'] = true;

    const errors = errorsOf(doc);
    expect(errors).toContain(
      'nodes[2]: node type "reservoir" does not accept primary instrument tag "ST-104".',
    );
    expect(errors).toContain('nodes[0]: "level" is only valid for reservoir nodes.');
    expect(errors).toContain('nodes[1]: "heatSource" is only valid for machine nodes.');
  });

  it('rejects duplicate instrument tags', () => {
    const doc = draft();
    doc.instruments[1]['tag'] = 'TT-101';
    expect(errorsOf(doc)).toContain(
      'Duplicate instrument tag "TT-101" — instrument tags must be unique.',
    );
  });

  it('rejects duplicate pipe connections that would render on top of each other', () => {
    const doc = draft();
    doc.pipes.push({ ...doc.pipes[0], side: 'hot' });
    expect(errorsOf(doc)).toContain('pipes[4]: duplicate pipe connection "Z1" → "P1".');
  });

  it('rejects reciprocal pipe connections that would render on the same route', () => {
    const doc = draft();
    doc.pipes.push({ from: 'P1', to: 'Z1', side: 'hot' });
    expect(errorsOf(doc)).toContain('pipes[4]: duplicate pipe connection "P1" → "Z1".');
  });

  it('bounds untrusted collections before iterating or rendering them', () => {
    const doc = draft();
    doc.pipes = Array.from({ length: 100_000 }, () => ({
      from: 'Z1',
      to: 'P1',
      side: 'cold',
    }));

    const errors = errorsOf(doc);
    expect(errors).toContain('"pipes" must contain at most 64 entries.');
    expect(errors.length).toBeLessThan(70);
  });

  it('bounds exchange strings and clips hostile values in diagnostics', () => {
    const doc = draft();
    doc.id = 'X'.repeat(10_000);
    doc.profileId = 'Y'.repeat(10_000);

    const errors = errorsOf(doc);
    expect(errors).toContain('"id" must contain at most 160 characters.');
    expect(errors.join('\n').length).toBeLessThan(1_000);
  });

  it('counts exchange-string limits in Unicode code points', () => {
    const atLimit = draft();
    atLimit.name = '🧊'.repeat(160);
    expect(validateSchematic(atLimit).ok).toBe(true);

    const beyondLimit = draft();
    beyondLimit.name = '🧊'.repeat(161);
    expect(errorsOf(beyondLimit)).toContain('"name" must contain at most 160 characters.');
  });

  it('collects every error instead of stopping at the first', () => {
    const doc = draft();
    doc.nodes[0]['type'] = 'turbine';
    doc.pipes[0]['side'] = 'warm';
    doc.instruments[0]['series'] = 'humidity';
    expect(errorsOf(doc).length).toBeGreaterThanOrEqual(3);
  });
});

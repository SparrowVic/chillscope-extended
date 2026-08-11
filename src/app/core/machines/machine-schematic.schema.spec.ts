import { describe, expect, it } from 'vitest';
import schema from '../../../assets/schema/machine-schematic.schema.json';
import { K207_SCHEMATIC } from '../schematic/k207.schematic';
import { SCHEMATIC_LIMITS, validateSchematic } from '../schematic/schematic.validate';
import { CH02_SCHEMATIC, TCU01_SCHEMATIC } from './builtin.machines';
import { CHILLER_PROFILE, TCU_PROFILE } from './machine-profile';
import { skeletonFor } from './machine-skeleton';
import { checkAgainstSchemaSubset } from './schema-subset';

function broken(mutate: (doc: Record<string, unknown>) => void): Record<string, unknown> {
  const doc = JSON.parse(JSON.stringify(K207_SCHEMATIC)) as Record<string, unknown>;
  mutate(doc);
  return doc;
}

describe('machine-schematic.schema.json', () => {
  it('is a draft 2020-12 schema for the machine schematic document', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.required).toEqual([
      'id',
      'name',
      'revision',
      'profileId',
      'nodes',
      'pipes',
      'instruments',
    ]);
  });

  it('mirrors the TS profile ids and node types', () => {
    expect(schema.properties.profileId.enum).toEqual(['tcu', 'chiller']);
    expect(schema.$defs.node.properties.type.enum).toContain('compressor');
    expect(schema.$defs.node.properties.type.enum).toContain('expansionValve');
    expect(schema.$defs.node.properties.type.enum).toContain('filterDrier');
    expect(schema.$defs.node.properties.type.enum).toContain('sightGlass');
    expect(schema.$defs.node.properties.type.enum).toContain('strainer');
    expect(schema.$defs.node.properties.type.enum).toContain('safetyValve');
    expect(schema.$defs.node.properties.type.enum).toHaveLength(14);
    expect(schema.$defs.node.properties.grid.prefixItems[0].maximum).toBe(
      SCHEMATIC_LIMITS.gridCoordinate,
    );
    expect(schema.$defs.node.properties.grid.prefixItems[1].maximum).toBe(
      SCHEMATIC_LIMITS.gridCoordinate,
    );
  });

  it('accepts every example document', () => {
    for (const doc of [
      K207_SCHEMATIC,
      TCU01_SCHEMATIC,
      CH02_SCHEMATIC,
      skeletonFor(TCU_PROFILE),
      skeletonFor(CHILLER_PROFILE),
    ]) {
      const plain = JSON.parse(JSON.stringify(doc)) as unknown;
      expect(checkAgainstSchemaSubset(schema, plain), doc.id).toEqual([]);
    }
  });

  it('accepts documents with per-instrument threshold overrides', () => {
    const doc = broken((raw) => {
      (raw['instruments'] as Record<string, unknown>[])[0]['thresholds'] = {
        warningMin: 40,
        warningMax: 70,
        criticalMin: 35,
        criticalMax: 80,
      };
    });
    expect(checkAgainstSchemaSubset(schema, doc)).toEqual([]);
  });

  it('documents the threshold ordering that standard JSON Schema cannot express', () => {
    const crossed = broken((raw) => {
      (raw['instruments'] as Record<string, unknown>[])[0]['thresholds'] = {
        criticalMin: 40,
        warningMin: 35,
        warningMax: 70,
        criticalMax: 80,
      };
    });

    expect(checkAgainstSchemaSubset(schema, crossed)).toEqual([]);
    const runtime = validateSchematic(crossed);
    expect(runtime.ok).toBe(false);
    expect(schema.$defs.thresholds.$comment).toContain(
      'strict threshold ordering is intentionally enforced by validateSchematic',
    );
  });

  it('uses Unicode code points for exchange-string length', () => {
    const atLimit = broken((raw) => {
      raw['name'] = '🧊'.repeat(160);
    });
    const beyondLimit = broken((raw) => {
      raw['name'] = '🧊'.repeat(161);
    });

    expect(checkAgainstSchemaSubset(schema, atLimit)).toEqual([]);
    expect(validateSchematic(atLimit).ok).toBe(true);
    expect(checkAgainstSchemaSubset(schema, beyondLimit).join('\n')).toContain('maxLength 160');
    expect(validateSchematic(beyondLimit).ok).toBe(false);
  });

  it('rejects a missing required header field', () => {
    const doc = broken((raw) => delete raw['revision']);
    expect(checkAgainstSchemaSubset(schema, doc).join('\n')).toContain(
      'missing required property "revision"',
    );
  });

  it('rejects an unknown profile id', () => {
    const doc = broken((raw) => {
      raw['profileId'] = 'freezer';
    });
    expect(checkAgainstSchemaSubset(schema, doc).join('\n')).toContain('#/profileId');
  });

  it('rejects an unknown node type', () => {
    const doc = broken((raw) => {
      (raw['nodes'] as Record<string, unknown>[])[0]['type'] = 'turbine';
    });
    expect(checkAgainstSchemaSubset(schema, doc).join('\n')).toContain('#/nodes/0/type');
  });

  it('rejects malformed grids', () => {
    const negative = broken((raw) => {
      (raw['nodes'] as Record<string, unknown>[])[0]['grid'] = [-1, 2];
    });
    expect(checkAgainstSchemaSubset(schema, negative).join('\n')).toContain('below minimum 0');

    const tooLong = broken((raw) => {
      (raw['nodes'] as Record<string, unknown>[])[0]['grid'] = [1, 2, 3];
    });
    expect(checkAgainstSchemaSubset(schema, tooLong).join('\n')).toContain('maxItems 2');

    const tooFar = broken((raw) => {
      (raw['nodes'] as Record<string, unknown>[])[0]['grid'] = [
        SCHEMATIC_LIMITS.gridCoordinate + 1,
        2,
      ];
    });
    expect(checkAgainstSchemaSubset(schema, tooFar).join('\n')).toContain(
      `above maximum ${SCHEMATIC_LIMITS.gridCoordinate}`,
    );
  });

  it('rejects malformed ISA tags and pipe sides', () => {
    const badTag = broken((raw) => {
      (raw['instruments'] as Record<string, unknown>[])[0]['tag'] = 'tt-1';
    });
    expect(checkAgainstSchemaSubset(schema, badTag).join('\n')).toContain('does not match pattern');

    const badSide = broken((raw) => {
      (raw['pipes'] as Record<string, unknown>[])[0]['side'] = 'warm';
    });
    expect(checkAgainstSchemaSubset(schema, badSide).join('\n')).toContain('#/pipes/0/side');
  });

  it('rejects blank and control-character exchange strings', () => {
    const blank = broken((raw) => {
      raw['name'] = '   ';
    });
    expect(checkAgainstSchemaSubset(schema, blank).join('\n')).toContain('#/name');

    const controlled = broken((raw) => {
      (raw['nodes'] as Record<string, unknown>[])[0]['label'] = 'PUMP\nP-1';
    });
    expect(checkAgainstSchemaSubset(schema, controlled).join('\n')).toContain('#/nodes/0/label');
  });

  it('constrains render-only node fields to the types that implement them', () => {
    const taggedReservoir = broken((raw) => {
      (raw['nodes'] as Record<string, unknown>[])[2]['tag'] = 'ST-104';
    });
    expect(checkAgainstSchemaSubset(schema, taggedReservoir).join('\n')).toContain(
      '#/nodes/2/type',
    );

    const pumpLevel = broken((raw) => {
      (raw['nodes'] as Record<string, unknown>[])[0]['level'] = true;
    });
    expect(checkAgainstSchemaSubset(schema, pumpLevel).join('\n')).toContain('#/nodes/0/type');

    const coolerHeat = broken((raw) => {
      (raw['nodes'] as Record<string, unknown>[])[1]['heatSource'] = true;
    });
    expect(checkAgainstSchemaSubset(schema, coolerHeat).join('\n')).toContain('#/nodes/1/type');

    const falseFlags = broken((raw) => {
      (raw['nodes'] as Record<string, unknown>[])[0]['level'] = false;
      (raw['nodes'] as Record<string, unknown>[])[0]['heatSource'] = false;
    });
    expect(checkAgainstSchemaSubset(schema, falseFlags)).toEqual([]);
    expect(validateSchematic(falseFlags).ok).toBe(true);
  });

  it('rejects unknown root and nested properties', () => {
    const unknownRoot = broken((raw) => {
      raw['description'] = 'This field is not part of the public document contract.';
    });
    expect(checkAgainstSchemaSubset(schema, unknownRoot).join('\n')).toContain(
      'unknown property "description"',
    );

    const unknownNodeField = broken((raw) => {
      (raw['nodes'] as Record<string, unknown>[])[0]['colour'] = 'blue';
    });
    expect(checkAgainstSchemaSubset(schema, unknownNodeField).join('\n')).toContain(
      'unknown property "colour"',
    );
  });
});

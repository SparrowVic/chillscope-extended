import { describe, expect, it } from 'vitest';

import { ICON_ROSTER, type CsIconName } from './icon-roster';

const EXPECTED_ICON_NAMES = [
  'gauge-high',
  'table-list',
  'bell',
  'diagram-project',
  'sliders',
  'temperature-half',
  'gauge',
  'water',
  'fan',
  'triangle-exclamation',
  'circle-check',
  'circle-xmark',
  'tower-broadcast',
  'check',
  'code',
  'copy',
  'file-export',
  'file-import',
  'plus',
  'trash-can',
  'xmark',
  'magnifying-glass',
  'filter',
  'calendar-days',
  'clock',
  'arrow-rotate-right',
  'moon',
  'sun',
  'industry',
  'wave-pulse',
  'arrow-right',
  'inbox',
  'circle-info',
  'circle-exclamation',
] as const satisfies readonly CsIconName[];

describe('ICON_ROSTER', () => {
  it('keeps the semantic icon contract stable', () => {
    expect(Object.keys(ICON_ROSTER)).toEqual(EXPECTED_ICON_NAMES);
  });

  it('contains only valid Free Solid definitions', () => {
    for (const definition of Object.values(ICON_ROSTER)) {
      expect(definition.prefix).toBe('fas');
      expect(definition.iconName.length).toBeGreaterThan(0);
      expect(definition.icon.length).toBeGreaterThan(0);
    }
  });

  it('uses the public waveform glyph for the semantic brand mark', () => {
    expect(ICON_ROSTER['wave-pulse'].iconName).toBe('wave-square');
  });
});

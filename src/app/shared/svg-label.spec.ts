import { describe, expect, it } from 'vitest';

import { SVG_LABEL_MAX_LENGTH, compactSvgLabel } from './svg-label';

describe('compactSvgLabel', () => {
  it('keeps short labels unchanged', () => {
    expect(compactSvgLabel('COOLER W-1')).toBe('COOLER W-1');
  });

  it('clips by Unicode characters and adds a single ellipsis', () => {
    const compact = compactSvgLabel('🧊'.repeat(SVG_LABEL_MAX_LENGTH + 10));

    expect([...compact]).toHaveLength(SVG_LABEL_MAX_LENGTH);
    expect(compact.endsWith('…')).toBe(true);
  });
});

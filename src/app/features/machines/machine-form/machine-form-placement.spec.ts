import { describe, expect, it } from 'vitest';

import { CHILLER_PROFILE } from '../../../core/machines/machine-profile';
import type { NodeFormValue } from './machine-form-model';
import { firstFreeCell } from './machine-form-placement';

const HEAT_EXCHANGER: NodeFormValue = {
  id: 'W1',
  type: 'heatExchanger',
  label: 'Cooler',
  column: 0,
  row: 0,
  tag: '',
  level: false,
  heatSource: false,
};

describe('machine form placement', () => {
  it('skips adjacent cells when the new symbol box would overlap', () => {
    expect(
      firstFreeCell(
        [HEAT_EXCHANGER],
        { ...CHILLER_PROFILE.gridSize, cols: 8, rows: 1 },
        'heatExchanger',
      ),
    ).toEqual([7, 0]);
  });

  it('returns no position when every grid cell would overlap', () => {
    expect(
      firstFreeCell(
        [HEAT_EXCHANGER],
        { ...CHILLER_PROFILE.gridSize, cols: 7, rows: 1 },
        'heatExchanger',
      ),
    ).toBeUndefined();
  });
});

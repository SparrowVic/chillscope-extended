import { describe, expect, it } from 'vitest';
import type { MeasurementRow, SeriesDescriptor } from '../../core/data/measurement.models';
import { toDisplayRows, toTableRows } from './measurements.view-model';

const flow: SeriesDescriptor = {
  id: 'flow',
  unit: 'l/min',
  color: '#10b981',
  thresholds: { warningMin: 26, warningMax: 108, criticalMin: 18, criticalMax: 118 },
};

function row(value: number, timestamp = 1_000): MeasurementRow {
  return { series: 'flow', value, timestamp };
}

describe('toTableRows', () => {
  it('classifies against the descriptor bands', () => {
    const rows = toTableRows([row(60), row(20), row(0)], [flow]);
    expect(rows.map((entry) => entry.status)).toEqual(['ok', 'warning', 'critical']);
  });

  it('treats the band edges as inside the band', () => {
    expect(toTableRows([row(26), row(108)], [flow]).map((e) => e.status)).toEqual(['ok', 'ok']);
  });

  it('normalises negative zero, which would otherwise print as "-0 l/min"', () => {
    const [entry] = toTableRows([row(-0)], [flow]);
    expect(Object.is(entry.value, -0)).toBe(false);
    expect(entry.value).toBe(0);
  });

  it('keys a row by series and timestamp', () => {
    expect(toTableRows([row(60, 42)], [flow])[0].id).toBe('flow-42');
  });

  it('falls back to an ok status when the descriptor is unavailable', () => {
    const [entry] = toTableRows([row(999)], []);
    expect(entry.status).toBe('ok');
  });
});

describe('toDisplayRows', () => {
  it('prints one reading for both journal faces — table and phone list agree by construction', () => {
    const [entry] = toDisplayRows(toTableRows([row(96.4, 42)], [flow]), 'pl');

    expect(entry.id).toBe('flow-42');
    expect(entry.icon).toBe('water');
    expect(entry.seriesKey).toBe('series.flow');
    expect(entry.unitKey).toBe('units.litersPerMinute');
    expect(entry.valueText).toBe('96,4');
    expect(entry.statusKey).toBe('severity.ok');
    expect(entry.status).toBe('ok');
    expect(entry.dateText.length).toBeGreaterThan(0);
  });

  it('formats the value with the active language, like every other reading', () => {
    const [entry] = toDisplayRows(toTableRows([row(96.4)], [flow]), 'en');
    expect(entry.valueText).toBe('96.4');
  });
});

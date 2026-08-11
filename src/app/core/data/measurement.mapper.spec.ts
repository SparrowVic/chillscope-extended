import { describe, expect, it } from 'vitest';
import type {
  AlarmsResponseDto,
  MeasurementsResponseDto,
  SeriesDescriptorDto,
} from './measurement.dto';
import {
  fromAlarmsDto,
  fromMeasurementsDto,
  fromSeriesDescriptorsDto,
  toChartSeries,
  toCycleFold,
  toMeasurementRows,
} from './measurement.mapper';
import type { SeriesDescriptor } from './measurement.models';

const TEMPERATURE: SeriesDescriptor = {
  id: 'temperature',
  unit: '°C',
  color: 'temperature',
  thresholds: { criticalMin: 47, warningMin: 49, warningMax: 74, criticalMax: 84 },
};

describe('measurement DTO mappers', () => {
  it('drops malformed measurements without breaking column alignment', () => {
    const dto = {
      measures: [
        { name: 'temperature', value: 60, date: '2026-08-05T10:00:00.000Z' },
        { name: 'temperature', value: Number.NaN, date: '2026-08-05T10:01:00.000Z' },
        { name: 'temperature', value: 61, date: 'not-a-date' },
      ],
    } satisfies MeasurementsResponseDto;

    expect(fromMeasurementsDto(dto, [TEMPERATURE])[0].points).toEqual({
      t: [Date.parse('2026-08-05T10:00:00.000Z')],
      v: [60],
    });
    expect(toMeasurementRows(dto)).toHaveLength(1);
  });

  it('drops malformed catalogue bands at the HTTP boundary', () => {
    const malformed = {
      id: 'temperature',
      unit: '°C',
      color: 'temperature',
      thresholds: { criticalMin: 50, warningMin: 40, warningMax: 74, criticalMax: 84 },
    } satisfies SeriesDescriptorDto;
    expect(fromSeriesDescriptorsDto([malformed])).toEqual([]);
  });

  it('drops malformed alarms instead of leaking NaN or unknown enums into the UI', () => {
    const valid = {
      id: 'temperature-1',
      series: 'temperature',
      severity: 'warning',
      value: 80,
      threshold: 74,
      date: '2026-08-05T10:00:00.000Z',
      durationMs: 60_000,
    } as const;
    const dto = {
      alarms: [valid, { ...valid, date: 'bad' }, { ...valid, value: Number.POSITIVE_INFINITY }],
    } satisfies AlarmsResponseDto;

    expect(fromAlarmsDto(dto)).toHaveLength(1);
  });

  it('hands the chart localised labels and units instead of raw API symbols', () => {
    const series = fromMeasurementsDto(
      {
        measures: [{ name: 'temperature', value: 60, date: '2026-08-05T10:00:00.000Z' }],
      },
      [TEMPERATURE],
    );
    const copy = {
      temperature: 'Temperatura',
      pressure: 'Ciśnienie',
      flow: 'Przepływ',
      rpm: 'Obroty',
    } as const;
    const units = {
      temperature: 'st. C',
      pressure: 'bar',
      flow: 'l/min',
      rpm: 'obr/min',
    } as const;

    expect(toChartSeries(series, copy, units)[0]).toMatchObject({
      label: 'Temperatura',
      unit: 'st. C',
    });
  });
});

describe('toCycleFold', () => {
  const hour = (day: number, at: number): number => new Date(2026, 7, day, at).getTime();

  it('returns an empty fold for no samples', () => {
    expect(toCycleFold({ t: [], v: [] })).toEqual({ days: [], values: [] });
  });

  it('lays samples into local day rows with 24 cells each', () => {
    const fold = toCycleFold({
      t: [hour(3, 0), hour(3, 23), hour(4, 12)],
      v: [10, 20, 30],
    });

    expect(fold.days).toEqual([new Date(2026, 7, 3).getTime(), new Date(2026, 7, 4).getTime()]);
    expect(fold.values).toHaveLength(48);
    expect(fold.values[0]).toBe(10);
    expect(fold.values[23]).toBe(20);
    expect(fold.values[24 + 12]).toBe(30);
  });

  it('keeps unsampled hours null instead of zero', () => {
    const fold = toCycleFold({ t: [hour(3, 5)], v: [42] });

    expect(fold.values[5]).toBe(42);
    expect(fold.values[6]).toBeNull();
    expect(fold.values.filter((value) => value !== null)).toHaveLength(1);
  });

  it('averages multiple samples that land in one hour', () => {
    const base = hour(3, 8);
    const fold = toCycleFold({ t: [base, base + 20 * 60 * 1000], v: [10, 30] });

    expect(fold.values[8]).toBe(20);
  });

  it('bridges days without samples so rows stay contiguous', () => {
    const fold = toCycleFold({ t: [hour(3, 12), hour(5, 12)], v: [1, 2] });

    expect(fold.days).toHaveLength(3);
    expect(fold.values.slice(24, 48).every((value) => value === null)).toBe(true);
  });
});

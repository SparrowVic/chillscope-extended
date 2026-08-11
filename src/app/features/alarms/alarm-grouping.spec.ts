import { describe, expect, it } from 'vitest';
import type { Alarm } from '../../core/data/measurement.models';
import { startOfDay } from '../../shared/time';
import { groupAlarmsByDay } from './alarm-grouping';

function alarm(id: string, timestamp: number): Alarm {
  return {
    id,
    series: 'temperature',
    severity: 'warning',
    value: 90,
    threshold: 74,
    timestamp,
    durationMs: 60_000,
  };
}

const NOON = Date.parse('2026-08-04T12:00:00.000Z');
const DAY = 86_400_000;

describe('groupAlarmsByDay', () => {
  it('returns nothing for an empty list', () => {
    expect(groupAlarmsByDay([])).toEqual([]);
  });

  it('groups by local day start, newest day first', () => {
    const groups = groupAlarmsByDay([
      alarm('old', NOON - DAY),
      alarm('new', NOON),
      alarm('mid', NOON - 3_600_000),
    ]);

    expect(groups.map((group) => group.dayStart)).toEqual([
      startOfDay(NOON),
      startOfDay(NOON - DAY),
    ]);
    expect(groups[0].alarms.map((entry) => entry.id)).toEqual(['new', 'mid']);
  });

  it('orders alarms inside a day newest first', () => {
    const groups = groupAlarmsByDay([alarm('a', NOON - 7_200_000), alarm('b', NOON)]);
    expect(groups[0].alarms.map((entry) => entry.id)).toEqual(['b', 'a']);
  });

  it('leaves the array it was given untouched', () => {
    const input = [alarm('a', NOON - DAY), alarm('b', NOON)];
    groupAlarmsByDay(input);
    expect(input.map((entry) => entry.id)).toEqual(['a', 'b']);
  });
});

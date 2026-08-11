import type { Alarm } from '../../core/data/measurement.models';
import { startOfDay } from '../../shared/time';

export interface AlarmDay {
  readonly dayStart: number;
  readonly alarms: readonly Alarm[];
}

export function groupAlarmsByDay(alarms: readonly Alarm[]): AlarmDay[] {
  const byDay = new Map<number, Alarm[]>();

  for (const alarm of [...alarms].sort((left, right) => right.timestamp - left.timestamp)) {
    const dayStart = startOfDay(alarm.timestamp);
    const day = byDay.get(dayStart);

    if (day) {
      day.push(alarm);
    } else {
      byDay.set(dayStart, [alarm]);
    }
  }

  return [...byDay].map(([dayStart, group]) => ({ dayStart, alarms: group }));
}

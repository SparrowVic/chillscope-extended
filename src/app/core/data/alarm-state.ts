import type { Alarm } from './measurement.models';

/** An episode is active through its final sampled instant and never before it starts. */
export function isAlarmActiveAt(alarm: Alarm, now: number): boolean {
  return alarm.timestamp <= now && alarm.timestamp + alarm.durationMs >= now;
}

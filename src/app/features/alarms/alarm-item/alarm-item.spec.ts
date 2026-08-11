import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Alarm } from '../../../core/data/measurement.models';
import { formatMeasurement } from '../../../shared/intl';
import { provideTestTransloco } from '../../../testing/transloco';
import { formatRelativeTime, formatTimeOfDay } from '../alarm-format';
import { AlarmItem } from './alarm-item';

/** Local wall-clock construction: the visible clock reading must match the viewer's day. */
const FIRED = new Date(2026, 7, 4, 14, 30).getTime();
const DURATION_MS = 90 * 60_000;

function alarm(overrides: Partial<Alarm> = {}): Alarm {
  return {
    id: 'temperature-critical-0',
    series: 'temperature',
    severity: 'critical',
    value: 82.4,
    threshold: 74,
    timestamp: FIRED,
    durationMs: DURATION_MS,
    ...overrides,
  };
}

describe('AlarmItem', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ...provideTestTransloco({
          'series.temperature': 'Temperatura',
          'severity.critical': 'Krytyczne',
          'severity.warning': 'Ostrzeżenie',
          'units.celsius': '°C',
          'alarms.table.threshold': 'Próg',
          'alarms.item.duration': 'Czas trwania',
        }),
      ],
    });
  });

  function render(entry: Alarm, now: number): HTMLElement {
    const fixture = TestBed.createComponent(AlarmItem);
    fixture.componentRef.setInput('alarm', entry);
    fixture.componentRef.setInput('now', now);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('leads with severity and series, before any number', () => {
    const element = render(alarm(), FIRED + DURATION_MS);
    const head = element.querySelector('.alarm-item__head');
    const tag = element.querySelector('.cs-tag');
    const series = element.querySelector('.alarm-item__series');
    const reading = element.querySelector('.alarm-item__reading');

    expect(head?.contains(tag)).toBe(true);
    expect(tag?.textContent).toContain('Krytyczne');
    expect(series?.textContent).toContain('Temperatura');
    // Severity tag precedes the series name, and the whole head precedes the reading row.
    expect(
      tag && series && tag.compareDocumentPosition(series) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      head && reading && head.compareDocumentPosition(reading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows the value, its threshold and the duration in plain sight', () => {
    const element = render(alarm(), FIRED + DURATION_MS);
    const text = element.textContent ?? '';

    expect(element.querySelector('.alarm-item__value')?.textContent).toContain(
      formatMeasurement(82.4, 'pl'),
    );
    expect(text).toContain('Próg');
    expect(text).toContain(formatMeasurement(74, 'pl'));
    expect(text).toContain('Czas trwania');
  });

  it('prints both the exact clock time and the relative age — nothing lives in a title', () => {
    const now = FIRED + 2 * 60 * 60_000;
    const element = render(alarm(), now);
    const time = element.querySelector('time');

    expect(element.querySelector('.alarm-item__clock')?.textContent).toBe(
      formatTimeOfDay(FIRED, 'pl'),
    );
    expect(element.querySelector('.alarm-item__ago')?.textContent).toContain(
      formatRelativeTime(FIRED, now, 'pl'),
    );
    expect(time?.getAttribute('datetime')).toBe(new Date(FIRED).toISOString());
    expect(time?.hasAttribute('title')).toBe(false);
  });

  it('lights the pulse lamp only while a critical episode is still active', () => {
    const active = render(alarm(), FIRED + DURATION_MS / 2);
    expect(active.querySelector('.alarm-item__lamp .cs-led--pulse')).not.toBeNull();
  });

  it('keeps the lamp dark once the episode has ended', () => {
    const ended = render(alarm(), FIRED + DURATION_MS + 60_000);
    expect(ended.querySelector('.cs-led--pulse')).toBeNull();
  });

  it('never lights the lamp for a warning, even while it is active', () => {
    const warning = render(alarm({ severity: 'warning' }), FIRED + DURATION_MS / 2);
    expect(warning.querySelector('.cs-led--pulse')).toBeNull();
  });
});

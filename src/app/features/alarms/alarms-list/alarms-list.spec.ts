import { TestBed } from '@angular/core/testing';
import { providePrimeNG } from 'primeng/config';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Alarm } from '../../../core/data/measurement.models';
import { provideTestTransloco } from '../../../testing/transloco';
import { AlarmsList, ALARMS_PAGE_SIZE } from './alarms-list';

function alarms(count: number): Alarm[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `temperature-${index}`,
    series: 'temperature',
    severity: 'warning',
    value: 80,
    threshold: 74,
    timestamp: Date.UTC(2026, 7, 5) - index * 60_000,
    durationMs: 60_000,
  }));
}

function alarmAt(id: string, timestamp: number, severity: Alarm['severity']): Alarm {
  return {
    id,
    series: 'temperature',
    severity,
    value: 80,
    threshold: 74,
    timestamp,
    durationMs: 60_000,
  };
}

describe('AlarmsList', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ...provideTestTransloco({
          'alarms.list.pagination': 'Alarm pages',
          'alarms.list.previous': 'Previous',
          'alarms.list.next': 'Next',
          'alarms.list.page': 'Page {{page}} of {{pages}} · {{count}} alarms',
        }),
        providePrimeNG({}),
      ],
    });
  });

  it('groups entries under day headings that carry a visible tally', () => {
    // Local-time construction on purpose: the grouping is by the viewer's day.
    const today = new Date(2026, 7, 5, 12, 0).getTime();
    const yesterday = new Date(2026, 7, 4, 9, 0).getTime();
    const fixture = TestBed.createComponent(AlarmsList);
    fixture.componentRef.setInput('alarms', [
      alarmAt('a', today, 'warning'),
      alarmAt('b', today - 60_000, 'critical'),
      alarmAt('c', yesterday, 'warning'),
    ]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    const sections = element.querySelectorAll('.alarms-list__day');
    expect(sections).toHaveLength(2);

    // Newest day first, holding both of its entries and announcing its critical share.
    const [first, second] = sections;
    expect(first.querySelectorAll('app-alarm-item')).toHaveLength(2);
    expect(first.querySelector('.alarms-list__heading-count')?.textContent).toContain('2');
    expect(first.querySelector('.alarms-list__heading-critical')?.textContent).toContain('1');

    // A day without criticals earns no red mark — dark cockpit.
    expect(second.querySelectorAll('app-alarm-item')).toHaveLength(1);
    expect(second.querySelector('.alarms-list__heading-count')?.textContent).toContain('1');
    expect(second.querySelector('.alarms-list__heading-critical')).toBeNull();
  });

  it('keeps the DOM bounded while paging a very large result', () => {
    const fixture = TestBed.createComponent(AlarmsList);
    fixture.componentRef.setInput('alarms', alarms(ALARMS_PAGE_SIZE * 2 + 25));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelectorAll('app-alarm-item')).toHaveLength(ALARMS_PAGE_SIZE);
    const buttons = element.querySelectorAll<HTMLButtonElement>('.alarms-list__pager button');
    buttons[1].click();
    fixture.detectChanges();
    expect(element.querySelectorAll('app-alarm-item')).toHaveLength(ALARMS_PAGE_SIZE);

    element.querySelectorAll<HTMLButtonElement>('.alarms-list__pager button')[1].click();
    fixture.detectChanges();
    expect(element.querySelectorAll('app-alarm-item')).toHaveLength(25);
  });
});

import { TestBed } from '@angular/core/testing';
import { providePrimeNG } from 'primeng/config';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Alarm, AlarmSeverity } from '../../../core/data/measurement.models';
import { provideTestTransloco } from '../../../testing/transloco';
import { AlarmsSummary } from './alarms-summary';

function alarm(severity: AlarmSeverity, index: number): Alarm {
  return {
    id: `temperature-${severity}-${index}`,
    series: 'temperature',
    severity,
    value: 80,
    threshold: 74,
    timestamp: Date.UTC(2026, 7, 5) - index * 60_000,
    durationMs: 60_000,
  };
}

function alarms(warning: number, critical: number): Alarm[] {
  return [
    ...Array.from({ length: warning }, (_, index) => alarm('warning', index)),
    ...Array.from({ length: critical }, (_, index) => alarm('critical', index)),
  ];
}

describe('AlarmsSummary', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...provideTestTransloco({}), providePrimeNG({})],
    });
  });

  function render(input: Alarm[]): HTMLElement {
    const fixture = TestBed.createComponent(AlarmsSummary);
    fixture.componentRef.setInput('alarms', input);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('lights the severity lamps only while their counts are non-zero', () => {
    const element = render(alarms(2, 1));
    const [total, warning, critical] = element.querySelectorAll('.cs-led');

    expect(total.classList.contains('alarms-summary__led--dim')).toBe(true);
    expect(warning.classList.contains('alarms-summary__led--dim')).toBe(false);
    expect(warning.classList.contains('cs-led--pulse')).toBe(false);
    expect(critical.classList.contains('cs-led--pulse')).toBe(true);
  });

  it('goes dark cockpit when the window holds no alarms', () => {
    const element = render([]);
    const lamps = [...element.querySelectorAll('.cs-led')];

    expect(lamps).toHaveLength(3);
    expect(lamps.every((lamp) => lamp.classList.contains('alarms-summary__led--dim'))).toBe(true);
    expect(element.querySelector('.cs-led--pulse')).toBeNull();
  });

  it('splits the severity meter by the critical share of the window', () => {
    const element = render(alarms(3, 1));
    const warning = element.querySelector<HTMLElement>('.alarms-summary__meter-fill--warning');
    const critical = element.querySelector<HTMLElement>('.alarms-summary__meter-fill--critical');

    expect(warning?.style.transform).toBe('scaleX(1)');
    expect(critical?.style.transform).toBe('scaleX(0.25)');
  });

  it('leaves the meter rail bare when the window is empty', () => {
    const element = render([]);
    const fills = element.querySelectorAll<HTMLElement>('.alarms-summary__meter-fill');

    expect([...fills].map((fill) => fill.style.transform)).toEqual(['scaleX(0)', 'scaleX(0)']);
  });
});

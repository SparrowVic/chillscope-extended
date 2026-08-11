import { TestBed } from '@angular/core/testing';
import type { Signal } from '@angular/core';
import { providePrimeNG } from 'primeng/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { provideTestTransloco } from '../../../testing/transloco';
import { HOUR_MS, MINUTE_MS } from '../../../shared/time';
import { AlarmsFilters } from './alarms-filters';

interface FilterView {
  readonly rangeSelection: Signal<string>;
}

describe('AlarmsFilters', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        ...provideTestTransloco({}),
        providePrimeNG({}),
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ages a fixed preset window into a custom range as the wall clock advances', () => {
    const openedAt = Date.UTC(2026, 7, 5, 12);
    vi.setSystemTime(openedAt);
    const fixture = TestBed.createComponent(AlarmsFilters);
    fixture.componentRef.setInput('range', { from: openedAt - HOUR_MS, to: openedAt });
    fixture.componentRef.setInput('severity', 'all');
    fixture.componentRef.setInput('series', []);
    fixture.detectChanges();
    const view = fixture.componentInstance as unknown as FilterView;
    expect(view.rangeSelection()).toBe('lastHour');

    vi.advanceTimersByTime(3 * MINUTE_MS);
    fixture.detectChanges();

    expect(view.rangeSelection()).toBe('custom');
  });

  it('renders every inline filter when the summary contains structural flow', () => {
    const now = Date.UTC(2026, 7, 5, 12);
    vi.setSystemTime(now);
    const fixture = TestBed.createComponent(AlarmsFilters);
    fixture.componentRef.setInput('range', { from: now - HOUR_MS, to: now });
    fixture.componentRef.setInput('severity', 'all');
    fixture.componentRef.setInput('series', []);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelectorAll('cs-select')).toHaveLength(2);
    expect(element.querySelectorAll('cs-multi-select')).toHaveLength(1);
  });
});

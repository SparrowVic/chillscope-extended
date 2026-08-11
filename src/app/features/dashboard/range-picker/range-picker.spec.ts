import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslocoService } from '@jsverse/transloco';
import { providePrimeNG } from 'primeng/config';
import { DatePicker } from 'primeng/datepicker';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FilterLayout,
  type FilterShellMode,
} from '../../../shared/components/filter-shell/filter-layout';
import { HOUR_MS } from '../../../shared/time';
import { provideTestTransloco } from '../../../testing/transloco';
import { RangePicker } from './range-picker';

describe('RangePicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        ...provideTestTransloco({
          'range.label': 'Range',
          'range.preset.lastHour': 'Last hour',
          'range.presetShort.lastHour': '1 h',
        }),
        providePrimeNG({}),
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the click time rather than the coarse display clock for a preset', () => {
    const openedAt = Date.UTC(2026, 7, 5, 12);
    vi.setSystemTime(openedAt);
    const fixture = TestBed.createComponent(RangePicker);
    fixture.componentRef.setInput('range', { from: openedAt - HOUR_MS, to: openedAt });
    fixture.componentRef.setInput('bucket', 'raw');
    fixture.detectChanges();
    vi.setSystemTime(openedAt + 30_000);
    const emitted = vi.fn();
    fixture.componentRef.instance.rangeChange.subscribe(emitted);
    const element = fixture.nativeElement as HTMLElement;

    element.querySelector<HTMLButtonElement>('.cs-segmented-control__option')?.click();

    expect(emitted).toHaveBeenCalledWith({
      from: openedAt + 30_000 - HOUR_MS,
      to: openedAt + 30_000,
    });
  });

  it('renders a legible tabular date range with a typographic separator', () => {
    const openedAt = Date.UTC(2026, 7, 5, 12);
    vi.setSystemTime(openedAt);
    const fixture = TestBed.createComponent(RangePicker);
    fixture.componentRef.setInput('range', { from: openedAt - HOUR_MS, to: openedAt });
    fixture.componentRef.setInput('bucket', 'raw');
    fixture.detectChanges();

    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '.p-datepicker-input',
    );
    const datePicker = fixture.debugElement.query(By.directive(DatePicker))
      .componentInstance as DatePicker;

    expect(input?.classList.contains('cs-mono')).toBe(true);
    expect(datePicker.rangeSeparator).toBe('–');
    expect(datePicker.dateFormat).toBeUndefined();
  });

  it('uses a compact localized date format only inside the phone sheet', async () => {
    TestBed.overrideProvider(FilterLayout, {
      useValue: { mode: signal<FilterShellMode>('sheet').asReadonly() },
    });
    const transloco = TestBed.inject(TranslocoService);
    transloco.setActiveLang('en');
    const openedAt = Date.UTC(2026, 0, 2, 12);
    const rangeStart = Date.UTC(2025, 11, 31, 12);
    vi.setSystemTime(openedAt);
    const fixture = TestBed.createComponent(RangePicker);
    fixture.componentRef.setInput('range', { from: rangeStart, to: openedAt });
    fixture.componentRef.setInput('bucket', 'raw');
    fixture.detectChanges();
    await fixture.whenStable();

    const datePicker = fixture.debugElement.query(By.directive(DatePicker))
      .componentInstance as DatePicker;
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '.p-datepicker-input',
    );
    expect(datePicker.dateFormat).toBe('m/d/y');
    expect(input?.value).toMatch(/25.*26/);
    expect(input?.title).toMatch(/2025.*2026/);

    transloco.setActiveLang('pl');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(datePicker.dateFormat).toBe('d.m.y');
    expect(input?.value).toMatch(/25.*26/);
  });
});

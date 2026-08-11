import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { provideTestTransloco } from '../../../testing/transloco';
import type { MeasurementDisplayRow } from '../measurements.view-model';
import { MeasurementList } from './measurement-list';

const TRANSLATIONS: Readonly<Record<string, string>> = {
  'measurements.table.caption': 'Lista pomiarów',
  'measurements.log.pagination': 'Stronicowanie dziennika pomiarów',
  'table.previous': 'Poprzednia strona',
  'table.next': 'Następna strona',
  'table.showing': 'Pozycje {{first}}–{{last}} z {{total}}',
  'series.flow': 'Przepływ',
  'units.litersPerMinute': 'l/min',
  'severity.ok': 'OK',
  'severity.critical': 'Krytyczny',
};

function displayRow(overrides: Partial<MeasurementDisplayRow> = {}): MeasurementDisplayRow {
  return {
    id: 'flow-1000',
    icon: 'water',
    seriesKey: 'series.flow',
    dateText: '11.08.2026, 14:05:00',
    valueText: '96,4',
    unitKey: 'units.litersPerMinute',
    statusKey: 'severity.ok',
    status: 'ok',
    ...overrides,
  };
}

interface RenderOptions {
  readonly rows?: readonly MeasurementDisplayRow[];
  readonly total?: number;
  readonly page?: number;
  readonly loading?: boolean;
}

function render({ rows = [displayRow()], total = 1, page = 0, loading = false }: RenderOptions = {}) {
  const fixture = TestBed.createComponent(MeasurementList);
  fixture.componentRef.setInput('rows', rows);
  fixture.componentRef.setInput('total', total);
  fixture.componentRef.setInput('page', page);
  fixture.componentRef.setInput('pageSize', 25);
  fixture.componentRef.setInput('loading', loading);
  fixture.detectChanges();
  return fixture;
}

describe('MeasurementList', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...provideTestTransloco(TRANSLATIONS)],
    });
  });

  it('renders one list item per row with the reading as the headline and the time secondary', () => {
    const element = render().nativeElement as HTMLElement;
    const list = element.querySelector('ol.measurement-list__items');
    const item = list?.querySelector('li.measurement-list__item');

    expect(list?.getAttribute('aria-label')).toBe('Lista pomiarów');
    expect(list?.querySelectorAll('li')).toHaveLength(1);
    expect(item?.querySelector('.measurement-list__series')?.textContent?.trim()).toBe('Przepływ');
    expect(item?.querySelector('.measurement-list__value')?.textContent?.trim()).toBe('96,4');
    expect(item?.querySelector('.measurement-list__unit')?.textContent?.trim()).toBe('l/min');
    expect(item?.querySelector('.measurement-list__time')?.textContent?.trim()).toBe(
      '11.08.2026, 14:05:00',
    );
  });

  it('speaks severity as visible text next to the lamp, never colour or a tooltip alone', () => {
    const element = render({
      rows: [displayRow({ status: 'critical', statusKey: 'severity.critical' })],
    }).nativeElement as HTMLElement;
    const status = element.querySelector('.log-status--critical');

    expect(status?.querySelector('.cs-tag')?.textContent?.trim()).toBe('Krytyczny');
  });

  it('reports the visible slice of the filtered log through the shared paginator sentence', () => {
    const element = render({ total: 60, page: 1 }).nativeElement as HTMLElement;

    expect(element.querySelector('.measurement-list__report')?.textContent?.trim()).toBe(
      'Pozycje 26–50 z 60',
    );
  });

  it('walks pages with the thumb keys and pins them at the range ends', () => {
    const fixture = render({ total: 60, page: 0 });
    const emitted = vi.fn();
    fixture.componentInstance.pageChange.subscribe(emitted);
    const element = fixture.nativeElement as HTMLElement;
    const [previous, next] = element.querySelectorAll<HTMLButtonElement>(
      '.measurement-list__page-key',
    );

    expect(previous.disabled).toBe(true);
    next.click();
    expect(emitted).toHaveBeenCalledWith(1);

    fixture.componentRef.setInput('page', 2);
    fixture.detectChanges();
    expect(
      element.querySelectorAll<HTMLButtonElement>('.measurement-list__page-key')[1].disabled,
    ).toBe(true);
  });

  it('shows the empty state only once loading has settled', () => {
    const settled = render({ rows: [], total: 0 }).nativeElement as HTMLElement;
    expect(settled.querySelector('app-empty-state')).not.toBeNull();

    const loading = render({ rows: [], total: 0, loading: true }).nativeElement as HTMLElement;
    expect(loading.querySelector('app-empty-state')).toBeNull();
    expect(loading.querySelector('ol')).toBeNull();
  });
});

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { providePrimeNG } from 'primeng/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeasurementSortField } from '../../../core/data/measurement.models';
import {
  FilterLayout,
  type FilterShellMode,
} from '../../../shared/components/filter-shell/filter-layout';
import { provideTestTransloco } from '../../../testing/transloco';
import { CsSelect } from '../../../shared/controls/select/select';
import type { MeasurementTableRow } from '../measurements.view-model';
import { MeasurementsTable } from './measurements-table';

const ROW: MeasurementTableRow = {
  id: 'rpm-1000',
  series: 'rpm',
  value: 2_800,
  timestamp: 1_000,
  status: 'ok',
};

describe('MeasurementsTable', () => {
  /** The app-wide viewport tier, hand-driven: 'inline' is the desktop table, 'sheet' the phone list. */
  const mode = signal<FilterShellMode>('inline');

  beforeEach(() => {
    mode.set('inline');
    TestBed.configureTestingModule({
      providers: [
        ...provideTestTransloco({
          'measurements.table.caption': 'Pomiary',
          'measurements.table.sortBy': 'Sortuj według',
          'measurements.table.date': 'Data',
          'measurements.table.series': 'Seria',
          'measurements.table.value': 'Wartość',
          'measurements.table.status': 'Status',
          'measurements.table.ascending': 'Rosnąco',
          'measurements.table.descending': 'Malejąco',
          'measurements.table.sortAscending': 'Sortuj rosnąco',
          'measurements.table.sortDescending': 'Sortuj malejąco',
          'table.showing': 'Pozycje {{first}}–{{last}} z {{total}}',
          'table.previous': 'Poprzednia strona',
          'table.next': 'Następna strona',
          'measurements.log.pagination': 'Stronicowanie dziennika pomiarów',
          'series.rpm': 'Obroty',
          'units.rpm': 'obr/min',
          'severity.ok': 'OK',
        }),
        providePrimeNG({}),
        { provide: FilterLayout, useValue: { mode } as unknown as FilterLayout },
      ],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(MeasurementsTable);
    fixture.componentRef.setInput('rows', [ROW]);
    fixture.componentRef.setInput('total', 60);
    fixture.componentRef.setInput('page', 0);
    fixture.componentRef.setInput('pageSize', 25);
    fixture.componentRef.setInput('sort', 'date');
    fixture.componentRef.setInput('direction', 'desc');
    fixture.detectChanges();
    return fixture;
  }

  it('localises the RPM unit instead of leaking the API unit', () => {
    const fixture = render();
    expect(
      fixture.nativeElement.querySelector('.measurements-table__unit')?.textContent.trim(),
    ).toBe('obr/min');
  });

  it('offers series sorting from the desktop header too', () => {
    const fixture = render();

    expect(fixture.nativeElement.querySelector('th[psortablecolumn="name"]')).not.toBeNull();
  });

  it('shows one journal face at a time: the table inline, the list on the phone tier', () => {
    const desktop = render();
    expect(desktop.nativeElement.querySelector('p-table')).not.toBeNull();
    expect(desktop.nativeElement.querySelector('app-measurement-list')).toBeNull();

    mode.set('sheet');
    const phone = render();
    expect(phone.nativeElement.querySelector('p-table')).toBeNull();
    expect(phone.nativeElement.querySelector('app-measurement-list')).not.toBeNull();
    expect(phone.nativeElement.querySelector('li.measurement-list__item')).not.toBeNull();
  });

  it('keeps server-side sorting available when the desktop header is hidden', () => {
    mode.set('sheet');
    const fixture = render();
    const emitted = vi.fn();
    fixture.componentInstance.pageRequest.subscribe(emitted);

    const select = fixture.debugElement.query(By.directive(CsSelect))
      .componentInstance as CsSelect<MeasurementSortField>;
    select.value.set('name');

    expect(emitted).toHaveBeenCalledWith({
      page: 0,
      size: 25,
      sort: 'name',
      direction: 'desc',
    });
    expect(
      fixture.nativeElement.querySelector('select.measurements-table__sort-select'),
    ).toBeNull();
  });

  it('translates the phone pager back into the same server-side page request', () => {
    mode.set('sheet');
    const fixture = render();
    const emitted = vi.fn();
    fixture.componentInstance.pageRequest.subscribe(emitted);

    const element = fixture.nativeElement as HTMLElement;
    const keys = element.querySelectorAll<HTMLButtonElement>('.measurement-list__page-key');
    keys[1].click();

    expect(emitted).toHaveBeenCalledWith({
      page: 1,
      size: 25,
      sort: 'date',
      direction: 'desc',
    });
  });
});

import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { TableModule } from 'primeng/table';
import type { TableLazyLoadEvent } from 'primeng/types/table';

import type { MeasurementSortField, SortDirection } from '../../../core/data/measurement.models';
import { injectActiveLanguage } from '../../../core/i18n/active-language';
import { injectTranslator } from '../../../core/i18n/translator';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { FilterLayout } from '../../../shared/components/filter-shell/filter-layout';
import { CsSelect } from '../../../shared/controls/select/select';
import type { SelectOption } from '../../../shared/controls/select-option';
import { MeasurementList } from '../measurement-list/measurement-list';
import { toDisplayRows, type MeasurementTableRow } from '../measurements.view-model';

export interface MeasurementsPageRequest {
  readonly page: number;
  readonly size: number;
  readonly sort: MeasurementSortField;
  readonly direction: SortDirection;
}

const PAGE_SIZES = [25, 50, 100];

const MOBILE_SORT_OPTIONS: readonly SelectOption<MeasurementSortField>[] = [
  { value: 'date', label: 'measurements.table.date' },
  { value: 'name', label: 'measurements.table.series' },
  { value: 'value', label: 'measurements.table.value' },
];

/**
 * The paginator interpolates its own `{first}`, `{last}` and `{totalRecords}` placeholders, so
 * transloco only supplies the sentence around them.
 */
const PAGE_REPORT_PARAMS = { first: '{first}', last: '{last}', total: '{totalRecords}' };

function toSortField(field: string | readonly string[] | null | undefined): MeasurementSortField {
  return field === 'name' || field === 'value' ? field : 'date';
}

function toDirection(order: number | null | undefined, fallback: SortDirection): SortDirection {
  if (order === null || order === undefined) {
    return fallback;
  }
  return order < 0 ? 'desc' : 'asc';
}

/**
 * The measurement log: one server-side paging/sorting contract behind two faces. The desktop
 * table keeps PrimeNG's header sorting and paginator; the phone tier (the app-wide sheet
 * threshold from `FilterLayout`) swaps in the compact measurement list with its own sort row
 * and thumb pager — both emit the same `MeasurementsPageRequest`.
 */
@Component({
  selector: 'app-measurements-table',
  imports: [CsSelect, EmptyState, MeasurementList, TableModule, TranslocoPipe],
  templateUrl: './measurements-table.html',
  styleUrls: ['./measurements-table.css', '../log-status.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MeasurementsTable {
  readonly rows = input.required<readonly MeasurementTableRow[]>();
  readonly total = input.required<number>();
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly sort = input.required<MeasurementSortField>();
  readonly direction = input.required<SortDirection>();
  readonly loading = input(false);

  readonly pageRequest = output<MeasurementsPageRequest>();

  readonly #language = injectActiveLanguage();
  readonly #translator = injectTranslator();
  readonly #layout = inject(FilterLayout);

  protected readonly phone = computed(() => this.#layout.mode() === 'sheet');

  protected readonly pageSizes = PAGE_SIZES;
  protected readonly mobileSortOptions = MOBILE_SORT_OPTIONS;
  protected readonly pageReportParams = PAGE_REPORT_PARAMS;

  /**
   * A data table needs an accessible name and PrimeNG exposes no `ariaLabel` input, so it goes onto
   * the `<table>` element through the pass-through API instead.
   */
  protected readonly passThrough = computed(() => ({
    table: {
      'aria-label': this.#translator()('measurements.table.caption'),
      'aria-busy': this.loading(),
    },
  }));

  protected readonly first = computed(() => this.page() * this.pageSize());
  protected readonly sortOrder = computed(() => (this.direction() === 'asc' ? 1 : -1));

  protected readonly displayRows = computed(() => toDisplayRows(this.rows(), this.#language()));

  protected onLazyLoad(event: TableLazyLoadEvent): void {
    const size = event.rows || this.pageSize();
    this.pageRequest.emit({
      page: Math.floor((event.first ?? 0) / size),
      size,
      sort: toSortField(event.sortField),
      direction: toDirection(event.sortOrder, this.direction()),
    });
  }

  protected onListPage(page: number): void {
    this.pageRequest.emit({
      page,
      size: this.pageSize(),
      sort: this.sort(),
      direction: this.direction(),
    });
  }

  protected onMobileSortField(sort: MeasurementSortField): void {
    this.#emitMobileSort(sort, this.direction());
  }

  protected toggleMobileDirection(): void {
    this.#emitMobileSort(this.sort(), this.direction() === 'asc' ? 'desc' : 'asc');
  }

  #emitMobileSort(sort: MeasurementSortField, direction: SortDirection): void {
    this.pageRequest.emit({ page: 0, size: this.pageSize(), sort, direction });
  }
}

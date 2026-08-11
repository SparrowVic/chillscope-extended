import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { MeasurementsFacade } from '../../core/data/measurements.facade';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { FilterLayout } from '../../shared/components/filter-shell/filter-layout';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { ExportButton } from './export-button/export-button';
import { MeasurementsFilters } from './measurements-filters/measurements-filters';
import {
  MeasurementsTable,
  type MeasurementsPageRequest,
} from './measurements-table/measurements-table';
import { toTableRows } from './measurements.view-model';
import { TapeDeck } from './tape-deck/tape-deck';

@Component({
  selector: 'app-measurements',
  imports: [
    ErrorPanel,
    ExportButton,
    MeasurementsFilters,
    MeasurementsTable,
    PageHeader,
    TapeDeck,
    TranslocoPipe,
  ],
  templateUrl: './measurements.html',
  styleUrl: './measurements.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Measurements {
  protected readonly facade = inject(MeasurementsFacade);

  readonly #layout = inject(FilterLayout);

  /**
   * On the sheet tier the CSV export moves from the page header to the log's own head: the file
   * is the filtered log, and the header row has no room to keep a 44px action honest there.
   */
  protected readonly phone = computed(() => this.#layout.mode() === 'sheet');

  protected readonly availableSeries = computed(() =>
    this.facade.catalogue().map((descriptor) => descriptor.id),
  );

  protected readonly tableRows = computed(() =>
    toTableRows(this.facade.rows(), this.facade.catalogue()),
  );

  /** What the filters select, which is what the export covers — not the page currently on screen. */
  protected readonly query = this.facade.query;

  constructor() {
    // The paged resource stays idle for every other screen, so this view switches it on and off.
    this.facade.setPagingEnabled(true);
    inject(DestroyRef).onDestroy(() => this.facade.setPagingEnabled(false));
  }

  protected onPageRequest(request: MeasurementsPageRequest): void {
    // Changing the size or the sort resets the page, so the requested page has to be applied last.
    this.facade.setPageSize(request.size);
    this.facade.setSort(request.sort, request.direction);
    this.facade.setPage(request.page);
  }
}

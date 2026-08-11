import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { CsIcon } from '../../../shared/icons/cs-icon/cs-icon';
import type { MeasurementDisplayRow } from '../measurements.view-model';

/**
 * The journal's phone face: a compact measurement item per row — series and status on top, the
 * value with its unit as the headline, the timestamp secondary — over a thumb-sized pager.
 * Purely presentational: the host still speaks the same server-side paging contract the desktop
 * table does, and sorting stays with the host's sort row.
 */
@Component({
  selector: 'app-measurement-list',
  imports: [CsIcon, EmptyState, TranslocoPipe],
  templateUrl: './measurement-list.html',
  styleUrls: ['./measurement-list.css', '../log-status.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MeasurementList {
  readonly rows = input.required<readonly MeasurementDisplayRow[]>();
  readonly total = input.required<number>();
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly loading = input(false);

  readonly pageChange = output<number>();

  readonly #lastPage = computed(() => Math.max(Math.ceil(this.total() / this.pageSize()) - 1, 0));

  protected readonly hasPrevious = computed(() => this.page() > 0);
  protected readonly hasNext = computed(() => this.page() < this.#lastPage());

  /** The same placeholders the desktop paginator prints, fed with real numbers. */
  protected readonly reportParams = computed(() => ({
    first: this.total() === 0 ? 0 : this.page() * this.pageSize() + 1,
    last: Math.min(this.total(), (this.page() + 1) * this.pageSize()),
    total: this.total(),
  }));

  protected previous(): void {
    if (this.hasPrevious()) {
      this.pageChange.emit(this.page() - 1);
    }
  }

  protected next(): void {
    if (this.hasNext()) {
      this.pageChange.emit(this.page() + 1);
    }
  }
}

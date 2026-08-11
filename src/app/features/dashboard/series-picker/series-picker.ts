import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { SeriesDescriptor, SeriesId } from '../../../core/data/measurement.models';
import { CsMultiSelect } from '../../../shared/controls/multi-select/multi-select';
import { nonEmptySelection } from '../../../shared/controls/non-empty-selection';
import type { SelectOption } from '../../../shared/controls/select-option';
import { SERIES_LABEL_KEYS } from '../../../shared/series-display';

@Component({
  selector: 'app-series-picker',
  imports: [CsMultiSelect],
  templateUrl: './series-picker.html',
  styleUrl: './series-picker.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeriesPicker {
  readonly available = input.required<readonly SeriesDescriptor[]>();
  readonly selected = input.required<readonly SeriesId[]>();
  readonly selectedChange = output<SeriesId[]>();

  /** A chart with no series is not a state worth reaching, so clearing the last one snaps back. */
  readonly #selection = nonEmptySelection(this.selected);

  protected readonly picked = this.#selection.picked;

  /**
   * When /api/series fails the catalogue is empty, but the selection survives — without an option
   * to match, the multi-select would render the chips as bare remove buttons with no label.
   */
  protected readonly options = computed<SelectOption<SeriesId>[]>(() => {
    const available = this.available().map((descriptor) => descriptor.id);
    const ids = available.length > 0 ? available : this.picked();
    return ids.map((id) => ({ value: id, label: SERIES_LABEL_KEYS[id] }));
  });

  protected onPicked(ids: SeriesId[]): void {
    const accepted = this.#selection.commit(ids);
    if (accepted) {
      this.selectedChange.emit(accepted);
    }
  }
}

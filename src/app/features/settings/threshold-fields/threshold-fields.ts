import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { TranslocoPipe } from '@jsverse/transloco';

import type { SeriesId } from '../../../core/data/measurement.models';
import { injectActiveLanguage } from '../../../core/i18n/active-language';
import { CsIcon } from '../../../shared/icons/cs-icon/cs-icon';
import { CsInputNumber } from '../../../shared/controls/input-number/input-number';
import { CsThresholdEnvelope } from '../../../shared/components/threshold-envelope/threshold-envelope';
import { decimalFormat } from '../../../shared/intl';
import { SERIES_LABEL_KEYS } from '../../../shared/series-display';
import type { ThresholdBandValue } from '../settings-form';

/** Summary values print exactly the precision the inputs accept, without trailing zeros. */
const MAX_SUMMARY_FRACTION_DIGITS = 3;

let groupSequence = 0;

/**
 * One series' alarm band as a disclosure row: sixteen identical number fields would otherwise
 * stack into an unreadable wall on a phone. The header stays a readable summary — series name,
 * the shared envelope zone map and the four bounds in mono — while the field grid folds away.
 * The fields stay MOUNTED while folded ([inert] + visibility, never `@if`): the form is one
 * tree, and folding a group must not discard its edits, dirtiness or validity.
 */
@Component({
  selector: 'app-threshold-fields',
  imports: [CsIcon, CsInputNumber, CsThresholdEnvelope, FormField, TranslocoPipe],
  templateUrl: './threshold-fields.html',
  styleUrl: './threshold-fields.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThresholdFields {
  readonly series = input.required<SeriesId>();
  readonly unit = input.required<string>();
  /** Series palette colour, used only for the legend dot that names the series. */
  readonly color = input.required<string>();
  readonly band = input.required<FieldTree<ThresholdBandValue>>();

  protected readonly bodyId = `threshold-group-${++groupSequence}`;
  protected readonly open = signal(false);

  readonly #locale = injectActiveLanguage();

  protected readonly seriesLabelKey = computed(() => SERIES_LABEL_KEYS[this.series()]);

  /**
   * A folded group may not hide its problems: the header flags the aggregate verdict of every
   * field inside, whether or not those fields are currently on screen.
   */
  protected readonly groupInvalid = computed(() => this.band()().invalid());

  protected readonly summary = computed(() => {
    const { criticalMin, warningMin, warningMax, criticalMax } = this.band()().value();
    const bound = (value: number | null): string =>
      value === null ? '—' : decimalFormat(this.#locale(), fractionDigitsOf(value)).format(value);
    return `${bound(criticalMin)} / ${bound(warningMin)} – ${bound(warningMax)} / ${bound(criticalMax)}`;
  });

  protected toggle(): void {
    this.open.update((open) => !open);
  }
}

function fractionDigitsOf(value: number): number {
  for (let digits = 0; digits < MAX_SUMMARY_FRACTION_DIGITS; digits += 1) {
    const scale = 10 ** digits;
    if (Math.round(value * scale) / scale === value) {
      return digits;
    }
  }
  return MAX_SUMMARY_FRACTION_DIGITS;
}

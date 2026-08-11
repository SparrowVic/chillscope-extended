import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';

import { toMeasurementRows } from '../../../core/data/measurement.mapper';
import type { SeriesDescriptor } from '../../../core/data/measurement.models';
import {
  MeasurementsRepository,
  type MeasurementsQuery,
} from '../../../core/data/measurements.repository';
import { injectActiveLanguage } from '../../../core/i18n/active-language';
import { CsIcon } from '../../../shared/icons/cs-icon/cs-icon';
import { roundMeasurement } from '../../../shared/intl';
import { SERIES_LABEL_KEYS, SERIES_UNIT_KEYS } from '../../../shared/series-display';
import { csvFileName, csvSeparator, toCsvBlob } from '../measurements.csv';
import { toTableRows, type MeasurementTableRow } from '../measurements.view-model';
import { offerDownload } from '../../../shared/download';
import { injectToast } from '../../../shared/toasts';

@Component({
  selector: 'app-export-button',
  imports: [ButtonModule, CsIcon, ToastModule, TranslocoPipe],
  templateUrl: './export-button.html',
  styleUrl: './export-button.css',
  host: { '(animationend)': 'settleSheen($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MessageService],
})
export class ExportButton {
  /** The filter window, not the page on screen: the file covers everything the filters select. */
  readonly query = input.required<MeasurementsQuery>();
  readonly descriptors = input.required<readonly SeriesDescriptor[]>();

  readonly #document = inject(DOCUMENT);
  readonly #transloco = inject(TranslocoService);
  readonly #toast = injectToast();
  readonly #language = injectActiveLanguage();

  /**
   * The table pages server-side, so what it holds is one page of many — exporting it produced a
   * 25-row file named after the whole range. The full range is fetched on demand instead of being
   * kept beside the page: it is the expensive request, and nothing needs it until the button is hit.
   */
  readonly #pending = signal<MeasurementsQuery | undefined>(undefined);
  readonly #rows = inject(MeasurementsRepository).measurementsFor(this.#pending);

  protected readonly busy = computed(() => this.#pending() !== undefined);

  /** §8b: one sheen pass as the success acknowledgement; animationend takes the class off. */
  readonly #sheen = signal(false);

  protected readonly buttonClass = computed(() => {
    if (this.busy()) {
      return 'cs-loading-bar';
    }
    return this.#sheen() ? 'export-button__sheen' : '';
  });

  constructor() {
    // Writing a file is a side effect, and the answer arrives asynchronously; `status` rather than
    // `isLoading` because the request is still idle until the resource's own effect has picked it up.
    effect(() => {
      const pending = this.#pending();
      const status = this.#rows.status();
      if (
        pending === undefined ||
        status === 'idle' ||
        status === 'loading' ||
        status === 'reloading'
      ) {
        return;
      }
      if (status === 'error') {
        // `value()` rethrows in the error state, default value or not, so it must not be touched.
        this.#pending.set(undefined);
        this.#toast.error('errors.loadMeasurements');
        return;
      }
      // Read before clearing the request: dropping it resets the resource to its empty default.
      const answer = this.#rows.value();
      this.#pending.set(undefined);
      this.#save(toTableRows(toMeasurementRows(answer), untracked(this.descriptors)), pending);
    });
  }

  protected download(): void {
    if (!this.busy()) {
      this.#pending.set(this.query());
    }
  }

  protected settleSheen(event: AnimationEvent): void {
    // Ends-with, not equals: emulated encapsulation scopes the keyframe name with a prefix.
    if (event.animationName.endsWith('export-sheen')) {
      this.#sheen.set(false);
    }
  }

  #save(rows: readonly MeasurementTableRow[], { from, to }: MeasurementsQuery): void {
    if (rows.length === 0) {
      this.#toast.warn('measurements.export.empty');
      return;
    }

    const translate = (key: string): string => this.#transloco.translate<string>(key);

    const blob = toCsvBlob(
      [
        [
          translate('measurements.table.date'),
          translate('measurements.table.series'),
          translate('measurements.table.value'),
          translate('measurements.table.unit'),
          translate('measurements.table.status'),
        ],
        // ISO timestamps and dot decimals keep the file parseable whatever the active language is.
        // The value is rounded the way the table rounds it, so a cell matches the row it came from.
        ...rows.map((row) => [
          new Date(row.timestamp).toISOString(),
          translate(SERIES_LABEL_KEYS[row.series]),
          String(roundMeasurement(row.value)),
          translate(SERIES_UNIT_KEYS[row.series]),
          translate(`severity.${row.status}`),
        ]),
      ],
      csvSeparator(untracked(this.#language)),
    );

    offerDownload(
      this.#document,
      csvFileName(translate('measurements.export.filename'), from, to),
      blob,
    );
    // Only where motion is positively welcome: with the animation suppressed there is no
    // animationend to take the class off again, so it must not go on in the first place.
    if (this.#allowsSheen()) {
      this.#sheen.set(true);
    }
  }

  #allowsSheen(): boolean {
    const view = this.#document.defaultView;
    return (
      view !== null &&
      typeof view.matchMedia === 'function' &&
      !view.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }
}

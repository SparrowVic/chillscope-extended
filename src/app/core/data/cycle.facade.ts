import { computed, inject, Injectable, linkedSignal, signal } from '@angular/core';

import { heldValue } from './held-value';
import { toCycleFold, toMeasurementRows, type CycleFold } from './measurement.mapper';
import type { SeriesId } from './measurement.models';
import { MeasurementsRepository, type MeasurementsQuery } from './measurements.repository';

export type CycleDays = 7 | 14 | 30;

export const CYCLE_DAY_CHOICES: readonly CycleDays[] = [7, 14, 30];

const DAY_MS = 24 * 60 * 60 * 1000;
const EMPTY_FOLD: CycleFold = { days: [], values: [] };

/**
 * The daily-rhythm query: one series, hourly buckets, a whole number of days back from "now".
 * Deliberately independent of the dashboard's range pipeline — the heatmap answers "when does
 * the circuit run hot" over weeks while the line chart answers "what happened" in the selected
 * window, and coupling the two would make either question destroy the other's context.
 */
@Injectable({ providedIn: 'root' })
export class CycleFacade {
  readonly #repository = inject(MeasurementsRepository);

  readonly #seriesId = signal<SeriesId>('temperature');
  readonly #days = signal<CycleDays>(14);

  readonly seriesId = this.#seriesId.asReadonly();
  readonly days = this.#days.asReadonly();

  /** "Now" re-stamps on every input change, so the window tracks interaction, not construction. */
  readonly #anchor = linkedSignal<{ readonly series: SeriesId; readonly days: CycleDays }, number>({
    source: computed(() => ({ series: this.#seriesId(), days: this.#days() })),
    computation: () => Date.now(),
  });

  readonly #query = computed<MeasurementsQuery>(() => ({
    series: [this.#seriesId()],
    from: this.#anchor() - this.#days() * DAY_MS,
    to: this.#anchor(),
    bucket: '1h',
  }));

  readonly #resource = this.#repository.measurementsFor(this.#query);

  readonly #shown = heldValue(this.#resource, { measures: [] });

  /** Day×hour rows for the selected series; presentation (label, unit, colour) joins in the view. */
  readonly fold = computed<CycleFold>(() => {
    const rows = toMeasurementRows(this.#shown()).filter((row) => row.series === this.#seriesId());
    if (rows.length === 0) {
      return EMPTY_FOLD;
    }
    return toCycleFold({ t: rows.map((row) => row.timestamp), v: rows.map((row) => row.value) });
  });

  readonly error = computed(() => this.#resource.error());
  readonly isLoading = computed(() => this.#resource.isLoading());
  /** Only the first answer earns an overlay; a series/window switch refreshes the held rows. */
  readonly isInitialLoading = computed(() => this.isLoading() && this.fold().days.length === 0);

  setSeries(series: SeriesId): void {
    this.#seriesId.set(series);
  }

  setDays(days: CycleDays): void {
    this.#days.set(days);
  }

  reload(): void {
    this.#resource.reload();
  }
}

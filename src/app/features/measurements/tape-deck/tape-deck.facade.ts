import { Injectable, computed, inject } from '@angular/core';

import type { MeasurementsResponseDto } from '../../../core/data/measurement.dto';
import type { MeasurementSeries } from '../../../core/data/measurement.models';
import { MeasurementsFacade, orderedSeries } from '../../../core/data/measurements.facade';
import {
  MeasurementsRepository,
  } from '../../../core/data/measurements.repository';
import { heldValue } from '../../../core/data/held-value';

const EMPTY_MEASUREMENTS: MeasurementsResponseDto = { measures: [] };

/**
 * Data source for the tape deck. While the Pomiary screen is on, the application facade parks its
 * unpaged request in favour of the paged one the table uses (see `MeasurementsFacade`), yet the
 * tapes need the whole loaded range — min/max notches, the ghost sparkline, the last sample. So
 * the deck carries its own unpaged resource over the same query, provided by the deck component
 * and destroyed with it.
 */
@Injectable()
export class TapeDeckFacade {
  readonly #facade = inject(MeasurementsFacade);
  readonly #repository = inject(MeasurementsRepository);

  readonly #measurements = this.#repository.measurementsFor(this.#facade.query);

  /**
   * A resource drops its value the moment the request changes, so every live tick would blank the
   * deck for the simulated latency. Holding the last resolved response keeps the tapes lit; they
   * glide when the new sample lands.
   */
  readonly #shown = heldValue(this.#measurements, EMPTY_MEASUREMENTS);

  /**
   * One tape per SELECTED series, in selection order. Ordering by the selection — not by the held
   * response — is what removes a deselected tape immediately, even mid-flight; a newly selected
   * one appears when its data lands. The catalogue carries the Settings threshold overrides, so
   * an edited band redraws the zones live.
   */
  readonly series = computed<MeasurementSeries[]>(() =>
    orderedSeries(this.#shown(), this.#facade.catalogue(), this.#facade.selectedSeries()),
  );

  readonly isLoading = this.#measurements.isLoading;
  readonly error = computed(() => this.#facade.catalogueError() ?? this.#measurements.error());

  reload(): void {
    this.#facade.reload();
    this.#measurements.reload();
  }
}

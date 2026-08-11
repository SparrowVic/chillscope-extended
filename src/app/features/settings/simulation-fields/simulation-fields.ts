import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { TranslocoPipe } from '@jsverse/transloco';

import { SIMULATION_SEED } from '../../../core/data/series.catalog';
import {
  DEFAULT_LIVE_INTERVAL_MS,
  LIVE_INTERVAL_MS_RANGE,
} from '../../../core/settings/settings.store';
import { CsInputNumber } from '../../../shared/controls/input-number/input-number';
import { CsSlider } from '../../../shared/controls/slider/slider';
import { FAILURE_RATE_PERCENT_RANGE } from '../settings-form';

/**
 * Each simulation setting is one value behind two hands: a slider for coarse, thumb-friendly
 * sweeps and a number field for the exact figure. The number field owns the `[formField]`
 * binding — required/range verdicts and their messages surface where the value is typed — while
 * the slider writes into the same field imperatively, so both hands move one form state.
 */
@Component({
  selector: 'app-simulation-fields',
  imports: [CsInputNumber, CsSlider, FormField, TranslocoPipe],
  templateUrl: './simulation-fields.html',
  styleUrl: './simulation-fields.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SimulationFields {
  readonly liveIntervalMs = input.required<FieldTree<number | null>>();
  readonly failureRatePercent = input.required<FieldTree<number | null>>();

  protected readonly intervalRange = LIVE_INTERVAL_MS_RANGE;
  protected readonly failureRange = FAILURE_RATE_PERCENT_RANGE;

  /** A cleared field parks the slider on a sane value; the required error tells the real story. */
  protected readonly intervalSliderValue = computed(
    () => this.liveIntervalMs()().value() ?? DEFAULT_LIVE_INTERVAL_MS,
  );
  protected readonly failureSliderValue = computed(
    () => this.failureRatePercent()().value() ?? FAILURE_RATE_PERCENT_RANGE.min,
  );

  /**
   * A direct `value.set` deliberately bypasses a `[formField]` binding, so dirtiness — what arms
   * the Save button — has to be declared alongside it.
   */
  protected setFromSlider(field: FieldTree<number | null>, value: number): void {
    const state = field();
    state.value.set(value);
    state.markAsDirty();
  }

  /**
   * This screen is the one place the UI admits the backend is simulated — it already sets the fake
   * backend's failure rate — so reading the fixed seed here is display, not a layering leak.
   */
  protected readonly seed = SIMULATION_SEED;
}

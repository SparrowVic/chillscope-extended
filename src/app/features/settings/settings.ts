import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  computed,
  inject,
  signal,
} from '@angular/core';
import { form, FormRoot } from '@angular/forms/signals';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';

import { SettingsStore } from '../../core/settings/settings.store';
import { PageHeader } from '../../shared/components/page-header/page-header';
import type { PendingChangesAware } from '../../shared/guards/pending-changes';
import { AppearanceFields } from './appearance-fields/appearance-fields';
import { SettingsActions } from './settings-actions/settings-actions';
import {
  settingsFormSchema,
  THRESHOLD_SERIES,
  toFormValue,
  toSimulationSettings,
} from './settings-form';
import { SimulationFields } from './simulation-fields/simulation-fields';
import { ThresholdFields } from './threshold-fields/threshold-fields';
import { injectToast } from '../../shared/toasts';

@Component({
  selector: 'app-settings',
  imports: [
    AppearanceFields,
    FormRoot,
    PageHeader,
    SettingsActions,
    SimulationFields,
    ThresholdFields,
    ToastModule,
    TranslocoPipe,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MessageService],
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class Settings implements PendingChangesAware {
  readonly #settings = inject(SettingsStore);
  readonly #transloco = inject(TranslocoService);
  readonly #toast = injectToast();
  readonly #window = inject(DOCUMENT).defaultView;

  /**
   * Seeded once and re-seeded only where the store is written on purpose. Tracking the store
   * continuously used to rebuild the whole model — and drop every pending edit — the moment anything
   * else touched it.
   */
  readonly #model = signal(this.#snapshot());

  protected readonly form = form(this.#model, settingsFormSchema, {
    submission: { action: async () => this.#persist() },
  });

  protected readonly thresholdGroups = THRESHOLD_SERIES.map((series) => ({
    ...series,
    band: this.form.thresholds[series.id],
  }));

  protected readonly saveDisabled = computed(() => {
    const state = this.form();
    return state.invalid() || !state.dirty();
  });

  /** The action dock narrates the form's state, so a dead Save button never goes unexplained. */
  protected readonly formDirty = computed(() => this.form().dirty());
  protected readonly formInvalid = computed(() => this.form().invalid());

  protected restoreDefaults(): void {
    this.#settings.reset();
    this.#reseed();
    if (this.#settings.persistenceFailed()) {
      this.#toast.warn('settings.actions.persistenceFailed');
    } else {
      this.#toast.success('settings.actions.resetDone');
    }
  }

  canDeactivate(): boolean {
    return (
      !this.form().dirty() ||
      (this.#window?.confirm(this.#transloco.translate('common.discardChanges')) ?? true)
    );
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.form().dirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  async #persist(): Promise<void> {
    const simulation = toSimulationSettings(this.#model());
    if (simulation === undefined) {
      // Unreachable: submission is disabled while any field is cleared. The guard exists so the
      // mapper can be honest about `null` without a type escape here.
      return;
    }
    this.#settings.setSimulation(simulation);

    this.#reseed();
    if (this.#settings.persistenceFailed()) {
      this.#toast.warn('settings.actions.persistenceFailed');
    } else {
      this.#toast.success('settings.actions.saved');
    }
  }

  /** The store clamps what it is given, so the form has to read back what was actually stored. */
  #reseed(): void {
    this.#model.set(this.#snapshot());
    this.form().reset();
  }

  #snapshot() {
    return toFormValue({
      liveIntervalMs: this.#settings.liveIntervalMs(),
      failureRate: this.#settings.failureRate(),
      thresholds: this.#settings.thresholds(),
    });
  }
}

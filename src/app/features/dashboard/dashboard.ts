import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { RangeSelectedDetail } from '@chillscope/chart/types';
import { TranslocoPipe } from '@jsverse/transloco';
import { SkeletonModule } from 'primeng/skeleton';

import { AlarmsFacade } from '../../core/data/alarms.facade';
import { MeasurementsFacade } from '../../core/data/measurements.facade';
import { MachineLibraryStore } from '../../core/machines/machine-library.store';
import { SettingsStore } from '../../core/settings/settings.store';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { LiveToggle } from '../../shared/components/live-toggle/live-toggle';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { MINUTE_MS } from '../../shared/time';
import { ChartPanel } from './chart-panel/chart-panel';
import { CyclePanel } from './cycle-panel/cycle-panel';
import { DashboardFilters } from './dashboard-filters/dashboard-filters';
import { RecentAlarms } from './recent-alarms/recent-alarms';
import { SchematicPanel } from './schematic/schematic-panel/schematic-panel';

@Component({
  selector: 'app-dashboard',
  imports: [
    ChartPanel,
    CyclePanel,
    DashboardFilters,
    ErrorPanel,
    LiveToggle,
    PageHeader,
    RecentAlarms,
    SchematicPanel,
    SkeletonModule,
    TranslocoPipe,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  protected readonly measurements = inject(MeasurementsFacade);
  protected readonly alarms = inject(AlarmsFacade);

  /** The hero renders whatever machine the library says is active (configurator spec §3). */
  protected readonly activeMachine = inject(MachineLibraryStore).active;

  protected readonly theme = inject(SettingsStore).theme;

  readonly #window = inject(DOCUMENT).defaultView;

  constructor() {
    // The screen gates live work, while the root facade retains the user's choice across routes.
    // This keeps non-measurement pages idle without making navigation toggle live mode off.
    const releaseLive = this.measurements.activateLive();
    const releaseSchematic = this.measurements.activateSchematic();
    inject(DestroyRef).onDestroy(() => {
      releaseLive();
      releaseSchematic();
      this.alarms.deactivateDashboard();
    });

    /**
     * The alarm panel describes the window on the chart. Detecting alarms means scanning that whole
     * window, so the panel follows it only at the simulator's own one-minute resolution: a live tick
     * every second would otherwise queue full scans faster than the worker can drain them.
     */
    effect(() => {
      const { from, to } = this.measurements.range();
      this.alarms.setDashboardRange(
        Math.floor(from / MINUTE_MS) * MINUTE_MS,
        Math.ceil(to / MINUTE_MS) * MINUTE_MS,
      );
    });
  }

  readonly #chartRangeHistory = signal<readonly RangeSelectedDetail[]>([]);

  protected readonly chartZoomDepth = computed(() => this.#chartRangeHistory().length);
  protected readonly chartResetKey = signal(0);

  protected onChartRangeSelected(range: RangeSelectedDetail): void {
    const current = this.measurements.range();
    if (range.from === current.from && range.to === current.to) {
      return;
    }
    this.#chartRangeHistory.update((history) => [...history, current]);
    this.measurements.setRange(range.from, range.to);
  }

  protected onFilterRangeChange(from: number, to: number): void {
    this.#chartRangeHistory.set([]);
    this.chartResetKey.update((key) => key + 1);
    this.measurements.setRange(from, to);
  }

  protected undoChartRange(): void {
    const history = this.#chartRangeHistory();
    const previous = history.at(-1);
    if (previous === undefined) {
      return;
    }
    this.#chartRangeHistory.set(history.slice(0, -1));
    this.chartResetKey.update((key) => key + 1);
    this.measurements.setRange(previous.from, previous.to);
  }

  protected restoreChartRange(): void {
    const initial = this.#chartRangeHistory().at(0);
    if (initial === undefined) {
      return;
    }
    this.#chartRangeHistory.set([]);
    this.chartResetKey.update((key) => key + 1);
    this.measurements.setRange(initial.from, initial.to);
  }

  /** A chunk that failed to download cannot be retried in place; only a fresh document load helps. */
  protected reloadPage(): void {
    this.#window?.location.reload();
  }
}

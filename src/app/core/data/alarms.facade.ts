import { Injectable, computed, inject, signal } from '@angular/core';
import { injectClock } from '../../shared/clock';
import { ActiveMachineTelemetry } from '../machines/active-machine-telemetry';
import { isAlarmActiveAt } from './alarm-state';
import type { AlarmsResponseDto } from './measurement.dto';
import { fromAlarmsDto } from './measurement.mapper';
import type { Alarm, AlarmSeverityFilter, SeriesId } from './measurement.models';
import { MeasurementsRepository, type AlarmsQuery } from './measurements.repository';
import { BUCKET_MS, MAX_RANGE_MS } from './series.catalog';
import { heldValue } from './held-value';

const DEFAULT_SPAN_MS = 24 * 3_600_000;
const EMPTY_ALARMS: AlarmsResponseDto = { alarms: [] };

/** How often the active-alarm window advances. Coarse on purpose: it is a badge, not a chart. */
const ACTIVE_REFRESH_MS = 30_000;

/** Only episodes whose sampled duration reaches `now` are still active. */
export function alarmsActiveAt(alarms: readonly Alarm[], now: number): Alarm[] {
  return alarms.filter((alarm) => isAlarmActiveAt(alarm, now));
}

@Injectable({ providedIn: 'root' })
export class AlarmsFacade {
  readonly #repository = inject(MeasurementsRepository);
  readonly #machineTelemetry = inject(ActiveMachineTelemetry);

  readonly #from = signal(Date.now() - DEFAULT_SPAN_MS);
  readonly #to = signal(Date.now());
  readonly #severity = signal<AlarmSeverityFilter>('all');
  /** Empty means every series, which keeps the filter out of the request until a user picks one. */
  readonly #series = signal<readonly SeriesId[]>([]);
  readonly #screenActive = signal(false);

  /** Thresholds are part of the request, so an edit in Settings refetches without a manual reload. */
  readonly #query = computed<AlarmsQuery | undefined>(() =>
    this.#screenActive()
      ? {
          series: this.#series(),
          from: this.#from(),
          to: this.#to(),
          severity: this.#severity(),
          thresholds: this.#machineTelemetry.thresholds(),
        }
      : undefined,
  );

  readonly #resource = this.#repository.alarmsFor(this.#query);

  readonly range = computed(() => ({ from: this.#from(), to: this.#to() }));
  readonly severity = this.#severity.asReadonly();
  readonly series = this.#series.asReadonly();

  /**
   * A resource drops its value as soon as the request changes, so the list would blink empty for the
   * whole simulated latency every time a filter moves. The previous answer stays until the next one
   * arrives.
   */
  readonly #shown = heldValue(this.#resource, EMPTY_ALARMS);

  readonly alarms = computed<Alarm[]>(() => fromAlarmsDto(this.#shown()));

  readonly isLoading = this.#resource.isLoading;
  readonly error = this.#resource.error;

  /**
   * The Dashboard journal follows the chart window, but it must never inherit the invisible series
   * or severity filters owned by the Alarms screen. It therefore has its own range and resource;
   * only the active-machine thresholds are shared with the other alarm feeds.
   */
  readonly #dashboardRange = signal<{ readonly from: number; readonly to: number } | undefined>(
    undefined,
  );

  readonly #dashboardQuery = computed<AlarmsQuery | undefined>(() => {
    const range = this.#dashboardRange();
    return range === undefined
      ? undefined
      : {
          series: [],
          ...range,
          severity: 'all',
          thresholds: this.#machineTelemetry.thresholds(),
        };
  });

  readonly #dashboardResource = this.#repository.alarmsFor(this.#dashboardQuery);

  /** The journal keeps its last answer while a live chart tick requests the next window. */
  readonly #dashboardShown = heldValue(this.#dashboardResource, EMPTY_ALARMS);

  readonly dashboardAlarms = computed<Alarm[]>(() => fromAlarmsDto(this.#dashboardShown()));
  readonly dashboardIsLoading = this.#dashboardResource.isLoading;
  readonly dashboardError = this.#dashboardResource.error;

  /**
   * The navigation badge mirrors the ACTIVE count, so it needs a query no
   * screen can bend. Screens mutate the filtered query above; this one only follows a coarse
   * clock (a fixed last-24h window sliding forward) and the thresholds.
   */
  readonly #now = injectClock(ACTIVE_REFRESH_MS);
  /**
   * `sampleRange` treats `to` as exclusive. The active feed must therefore include the sample at
   * the current minute boundary, even when the clock itself is exactly aligned to that boundary.
   * This end still changes only once per raw bucket, so the 30-second expiry clock does not cause
   * redundant requests.
   */
  readonly #activeQueryEnd = computed(
    () => Math.floor(this.#now() / BUCKET_MS.raw) * BUCKET_MS.raw + BUCKET_MS.raw,
  );

  readonly #activeQuery = computed<AlarmsQuery>(() => ({
    series: [],
    from: this.#activeQueryEnd() - DEFAULT_SPAN_MS,
    to: this.#activeQueryEnd(),
    severity: 'all',
    thresholds: this.#machineTelemetry.thresholds(),
  }));

  readonly #activeResource = this.#repository.alarmsFor(this.#activeQuery);

  /** Same hold as #shown: the badge must not blink to zero for every simulated latency. */
  readonly #activeShown = heldValue(this.#activeResource, EMPTY_ALARMS);

  readonly #activeFeedAlarms = computed<Alarm[]>(() => fromAlarmsDto(this.#activeShown()));
  readonly activeAlarms = computed<Alarm[]>(() =>
    alarmsActiveAt(this.#activeFeedAlarms(), this.#now()),
  );
  readonly activeCount = computed(() => this.activeAlarms().length);

  setRange(from: number, to: number): void {
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
      return;
    }
    this.#from.set(Math.max(from, to - MAX_RANGE_MS));
    this.#to.set(to);
  }

  /** Activates the full journal query only for the lifetime of the Alarms route. */
  activateScreen(from: number, to: number): void {
    this.setRange(from, to);
    this.#screenActive.set(true);
  }

  deactivateScreen(): void {
    this.#screenActive.set(false);
  }

  setDashboardRange(from: number, to: number): void {
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
      return;
    }
    const range = { from: Math.max(from, to - MAX_RANGE_MS), to };
    const current = this.#dashboardRange();
    if (current?.from !== range.from || current.to !== range.to) {
      this.#dashboardRange.set(range);
    }
  }

  /** Stops the expensive alarm scan as soon as the Dashboard route is destroyed. */
  deactivateDashboard(): void {
    this.#dashboardRange.set(undefined);
  }

  setSeverity(severity: AlarmSeverityFilter): void {
    this.#severity.set(severity);
  }

  setSeries(ids: readonly SeriesId[]): void {
    this.#series.set([...ids]);
  }

  reload(): void {
    this.#resource.reload();
  }

  reloadDashboard(): void {
    this.#dashboardResource.reload();
  }
}

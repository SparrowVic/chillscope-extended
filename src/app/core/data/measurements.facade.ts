import {
  DOCUMENT,
  DestroyRef,
  Injectable,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  type WritableSignal,
} from '@angular/core';
import { SettingsStore } from '../settings/settings.store';
import { ActiveMachineTelemetry } from '../machines/active-machine-telemetry';
import { heldValue } from './held-value';
import type { MeasurementsResponseDto, SeriesDescriptorDto } from './measurement.dto';
import {
  fromMeasurementsDto,
  fromSeriesDescriptorsDto,
  toMeasurementRows,
} from './measurement.mapper';
import type {
  MeasurementRow,
  MeasurementSeries,
  MeasurementSortField,
  SeriesDescriptor,
  SeriesId,
  SortDirection,
} from './measurement.models';
import {
  MeasurementsRepository,
  type MeasurementsQuery,
  type PagedMeasurementsQuery,
} from './measurements.repository';
import {
  BUCKET_MS,
  MAX_POINTS,
  MAX_RANGE_MS,
  SERIES_IDS,
  type BucketId,
  resolveBucket,
  widenToBudget,
} from './series.catalog';

const HOUR = 3_600_000;
const DEFAULT_SPAN_MS = 6 * HOUR;
const DEFAULT_PAGE_SIZE = 25;
const SCHEMATIC_SAMPLE_COUNT = 2;
const EMPTY_MEASUREMENTS: MeasurementsResponseDto = { measures: [] };
const EMPTY_CATALOGUE: readonly SeriesDescriptorDto[] = [];

function sameSeries(a: readonly SeriesId[], b: readonly SeriesId[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * The tapes and the chart both render "one entry per SELECTED series, in selection order".
 * Ordering by the selection rather than by the response is what drops a deselected series
 * immediately, even mid-flight, and lets a newly selected one appear when its data lands.
 */
export function orderedSeries(
  measurements: MeasurementsResponseDto,
  catalogue: readonly SeriesDescriptor[],
  order: readonly SeriesId[],
): MeasurementSeries[] {
  const loaded = new Map(
    fromMeasurementsDto(measurements, catalogue).map((entry) => [entry.id, entry]),
  );
  return order.flatMap((id) => {
    const entry = loaded.get(id);
    return entry === undefined ? [] : [entry];
  });
}

interface BucketSource {
  readonly from: number;
  readonly to: number;
  readonly auto: BucketId;
}

@Injectable({ providedIn: 'root' })
export class MeasurementsFacade {
  readonly #repository = inject(MeasurementsRepository);
  readonly #settings = inject(SettingsStore);
  readonly #machineTelemetry = inject(ActiveMachineTelemetry);

  readonly #catalogueResource = this.#repository.seriesCatalogue;
  readonly #from = signal(Date.now() - DEFAULT_SPAN_MS);
  readonly #to = signal(Date.now());
  readonly #liveEnabled = signal(false);
  readonly #liveConsumers = signal(0);
  readonly #schematicConsumers = signal(0);
  readonly #schematicNow = signal(Date.now());
  readonly #pagingEnabled = signal(false);
  readonly #pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly #sort = signal<MeasurementSortField>('date');
  readonly #direction = signal<SortDirection>('desc');

  /** Keep the vocabulary during a reload or transient failure just like the data resources below. */
  readonly #shownCatalogue = heldValue(this.#catalogueResource, EMPTY_CATALOGUE);

  /** Backend bands before global and machine-specific calibration. */
  readonly #baselineCatalogue = computed<SeriesDescriptor[]>(() =>
    fromSeriesDescriptorsDto(this.#shownCatalogue()),
  );

  /** Measured values do not depend on thresholds, so changing calibration never refetches data. */
  readonly catalogue = computed<SeriesDescriptor[]>(() => {
    const overrides = this.#machineTelemetry.thresholds();
    return this.#baselineCatalogue().map((descriptor) => {
      const override = overrides[descriptor.id];
      return override === undefined ? descriptor : { ...descriptor, thresholds: override };
    });
  });

  /** Value equality: a threshold edit rebuilds the catalogue but must not restart the pipeline. */
  readonly #availableSeries = computed(() => this.#baselineCatalogue().map((entry) => entry.id), {
    equal: sameSeries,
  });

  readonly #seriesSelectionTouched = signal(false);
  readonly #selectedSeries = linkedSignal<
    { readonly available: readonly SeriesId[]; readonly touched: boolean },
    readonly SeriesId[]
  >({
    source: () => ({
      available: this.#availableSeries(),
      touched: this.#seriesSelectionTouched(),
    }),
    computation: ({ available, touched }, previous) => {
      const current = previous?.value ?? SERIES_IDS;
      if (available.length === 0) {
        return current;
      }
      if (!touched) {
        return available;
      }
      const kept = current.filter((id) => available.includes(id));
      return kept.length > 0 ? kept : available;
    },
    equal: sameSeries,
  });

  readonly #autoBucket = computed(() => resolveBucket(this.#from(), this.#to(), MAX_POINTS));

  /** Include the endpoints: two ranges may resolve to the same auto bucket but still reset a choice. */
  readonly #bucketSource = computed<BucketSource>(() => ({
    from: this.#from(),
    to: this.#to(),
    auto: this.#autoBucket(),
  }));

  /** Resolved from the range width, but a user choice in the filter bar wins until the range moves. */
  readonly #bucket = linkedSignal<BucketSource, BucketId>({
    source: this.#bucketSource,
    computation: ({ auto }) => auto,
  });

  /** What the filters select: the one query the export and the tape deck also answer to. */
  readonly query = computed<MeasurementsQuery>(() => ({
    series: this.#selectedSeries(),
    from: this.#from(),
    to: this.#to(),
    bucket: this.#bucket(),
  }));

  /**
   * The table asks for one page at a time, so while it is on screen the unpaged request would only
   * duplicate it — and it is the expensive one, covering the whole range at once.
   */
  readonly #seriesQuery = computed<MeasurementsQuery | undefined>(() =>
    this.#pagingEnabled() ? undefined : this.query(),
  );

  readonly #measurements = this.#repository.measurementsFor(this.#seriesQuery);

  /**
   * The synoptic is an instrument, not a second chart. It needs a fresh raw tail from every series
   * regardless of chart selection, range or aggregation. Keeping this as a tiny, separately gated
   * request avoids both a dead default schematic and hauling unused chart columns on every refresh.
   */
  readonly #schematicQuery = computed<MeasurementsQuery | undefined>(() => {
    if (this.#schematicConsumers() === 0) {
      return undefined;
    }
    const series = this.#availableSeries();
    if (series.length === 0) {
      return undefined;
    }
    const step = BUCKET_MS.raw;
    const to = Math.ceil(this.#schematicNow() / step) * step;
    return {
      series,
      from: to - step * SCHEMATIC_SAMPLE_COUNT,
      to,
      bucket: 'raw',
    };
  });

  readonly #schematicMeasurements = this.#repository.measurementsFor(this.#schematicQuery);

  readonly #page = linkedSignal<MeasurementsQuery, number>({
    source: this.query,
    computation: () => 0,
  });

  readonly #pagedQuery = computed<PagedMeasurementsQuery | undefined>(() =>
    this.#pagingEnabled()
      ? {
          ...this.query(),
          page: this.#page(),
          size: this.#pageSize(),
          sort: this.#sort(),
          direction: this.#direction(),
        }
      : undefined,
  );

  readonly #pagedMeasurements = this.#repository.pagedMeasurementsFor(this.#pagedQuery);

  /**
   * A resource drops its value the moment the request changes, so the table and the paginator would
   * collapse to empty for the whole simulated latency on every page or sort click. Holding the last
   * resolved page under the loading mask keeps the layout still.
   */
  readonly #shownPage = heldValue(this.#pagedMeasurements, EMPTY_MEASUREMENTS);

  /**
   * The same hold for the unpaged pipeline: without it every live tick would blank the schematic
   * tags to em-dashes and empty the chart for the whole simulated latency, because the resource
   * drops its value the moment the tick moves the window (the guard the table and the tape deck
   * already carry).
   */
  readonly #shownMeasurements = heldValue(this.#measurements, EMPTY_MEASUREMENTS);

  /** Hold the last instrument snapshot while the next raw minute resolves, just like the chart. */
  readonly #shownSchematicMeasurements = heldValue(this.#schematicMeasurements, EMPTY_MEASUREMENTS);

  readonly selectedSeries = this.#selectedSeries.asReadonly();
  readonly bucket = this.#bucket.asReadonly();
  readonly liveEnabled = this.#liveEnabled.asReadonly();
  readonly pagingEnabled = this.#pagingEnabled.asReadonly();
  readonly page = this.#page.asReadonly();
  readonly pageSize = this.#pageSize.asReadonly();
  readonly sort = this.#sort.asReadonly();
  readonly direction = this.#direction.asReadonly();

  readonly range = computed(() => ({ from: this.#from(), to: this.#to() }));

  readonly catalogueError = this.#catalogueResource.error;
  readonly isLoading = computed(
    () => this.#catalogueResource.isLoading() || this.#measurements.isLoading(),
  );
  readonly error = computed(() => this.#catalogueResource.error() ?? this.#measurements.error());

  readonly series = computed<MeasurementSeries[]>(() => {
    return orderedSeries(this.#shownMeasurements(), this.catalogue(), this.#selectedSeries());
  });

  readonly schematicSeries = computed<MeasurementSeries[]>(() =>
    orderedSeries(
      this.#shownSchematicMeasurements(),
      this.catalogue(),
      this.#availableSeries(),
    ),
  );

  /** The configurator applies its own draft calibration to this uncalibrated live tail. */
  readonly schematicBaselineSeries = computed<MeasurementSeries[]>(() =>
    orderedSeries(
      this.#shownSchematicMeasurements(),
      this.#baselineCatalogue(),
      this.#availableSeries(),
    ),
  );

  readonly isLoadingSchematic = computed(
    () => this.#catalogueResource.isLoading() || this.#schematicMeasurements.isLoading(),
  );
  readonly schematicError = computed(
    () => this.#catalogueResource.error() ?? this.#schematicMeasurements.error(),
  );

  readonly hasData = computed(() => this.series().some((entry) => entry.points.t.length > 0));

  /** Loading worth announcing: only when there is no previous answer to keep on screen. A live
      tick refreshes in place; the first load (and an empty range) still gets its overlay. */
  readonly isInitialLoading = computed(() => this.isLoading() && !this.hasData());

  readonly rows = computed<MeasurementRow[]>(() => toMeasurementRows(this.#shownPage()));

  readonly total = computed(() => this.#shownPage().total ?? 0);

  readonly isLoadingRows = this.#pagedMeasurements.isLoading;
  readonly rowsError = this.#pagedMeasurements.error;

  /**
   * Live mode pauses while the tab is hidden: browsers coalesce background timers hard enough
   * that the tick would only abort in-flight requests without ever letting one resolve, and
   * nothing is looking anyway. Fronting the tab ticks once immediately, then resumes the beat.
   */
  readonly #pageVisible = signal(true);

  constructor() {
    const document = inject(DOCUMENT);
    this.#pageVisible.set(!document.hidden);
    const onVisibility = (): void => this.#pageVisible.set(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() =>
      document.removeEventListener('visibilitychange', onVisibility),
    );

    effect((onCleanup) => {
      if (!this.#liveEnabled() || this.#liveConsumers() === 0 || !this.#pageVisible()) {
        return;
      }
      // Catch up right away — after a hidden stretch the window is stale by however long the
      // tab was in the background. On a plain live start this is a no-op-sized nudge to "now".
      this.tick();
      const handle = setInterval(() => this.tick(), this.#settings.liveIntervalMs());
      onCleanup(() => clearInterval(handle));
    });

    effect((onCleanup) => {
      if (this.#schematicConsumers() === 0 || !this.#pageVisible()) {
        return;
      }
      this.#refreshSchematicClock();
      const handle = setInterval(
        () => this.#refreshSchematicClock(),
        this.#settings.liveIntervalMs(),
      );
      onCleanup(() => clearInterval(handle));
    });
  }

  setSeries(ids: readonly SeriesId[]): void {
    if (ids.length > 0) {
      this.#seriesSelectionTouched.set(true);
      this.#selectedSeries.set([...ids]);
    }
  }

  /** Chart zoom can hand back a degenerate window; ignoring it keeps the query signal valid. */
  setRange(from: number, to: number): void {
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
      return;
    }
    this.#from.set(Math.max(from, to - MAX_RANGE_MS));
    this.#to.set(to);
    // A window that no longer ends at "now" would be dragged forward again by the next tick, so
    // choosing a historical range switches live mode off instead of fighting it.
    if (to < Date.now() - this.#settings.liveIntervalMs()) {
      this.#liveEnabled.set(false);
    }
  }

  setSpan(spanMs: number): void {
    const now = Date.now();
    this.setRange(now - spanMs, now);
  }

  setBucket(bucket: BucketId): void {
    this.#bucket.set(widenToBudget(bucket, this.#from(), this.#to(), MAX_POINTS));
  }

  resetBucket(): void {
    this.#bucket.set(this.#autoBucket());
  }

  setLiveEnabled(enabled: boolean): void {
    this.#liveEnabled.set(enabled);
  }

  /**
   * Consumers gate the interval without owning the user's session preference. A lease keeps route
   * hand-offs safe when outgoing and incoming views overlap for part of a render cycle.
   */
  activateLive(): () => void {
    return this.#acquireConsumer(this.#liveConsumers);
  }

  /** The all-series instrument tail exists only while a schematic consumer is mounted. */
  activateSchematic(): () => void {
    return this.#acquireConsumer(this.#schematicConsumers);
  }

  #acquireConsumer(counter: WritableSignal<number>): () => void {
    counter.update((count) => count + 1);
    let active = true;
    return (): void => {
      if (!active) {
        return;
      }
      active = false;
      counter.update((count) => Math.max(0, count - 1));
    };
  }

  /** One live step: keep the width, move the window up to now. */
  tick(): void {
    const now = Date.now();
    const from = this.#from();
    const to = this.#to();
    const span = to - from;
    const nextFrom = now - span;
    const stepMs = BUCKET_MS.raw;
    // The generated columns change only when either exclusive edge crosses the native sample grid.
    // Checking both edges matters for zoomed spans that are not exact minute multiples: their left
    // edge can drop a sample before the right edge gains one.
    const sameGrid =
      Math.ceil(nextFrom / stepMs) === Math.ceil(from / stepMs) &&
      Math.ceil(now / stepMs) === Math.ceil(to / stepMs);
    if (sameGrid) {
      return;
    }
    this.#from.set(nextFrom);
    this.#to.set(now);
  }

  setPagingEnabled(enabled: boolean): void {
    this.#pagingEnabled.set(enabled);
  }

  setPage(page: number): void {
    this.#page.set(Math.max(0, page));
  }

  setPageSize(size: number): void {
    this.#pageSize.set(Math.max(1, size));
    this.#page.set(0);
  }

  setSort(field: MeasurementSortField, direction: SortDirection): void {
    this.#sort.set(field);
    this.#direction.set(direction);
    this.#page.set(0);
  }

  reload(): void {
    this.#catalogueResource.reload();
    this.#measurements.reload();
    this.#schematicMeasurements.reload();
    this.#pagedMeasurements.reload();
  }

  /** Only crossing the simulator's native sample grid can change the raw instrument tail. */
  #refreshSchematicClock(): void {
    const now = Date.now();
    const step = BUCKET_MS.raw;
    if (Math.ceil(now / step) !== Math.ceil(this.#schematicNow() / step)) {
      this.#schematicNow.set(now);
    }
  }
}

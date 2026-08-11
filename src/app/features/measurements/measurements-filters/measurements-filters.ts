import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import type { SeriesId } from '../../../core/data/measurement.models';
import { MAX_RANGE_MS, type BucketId } from '../../../core/data/series.catalog';
import { BUCKET_OPTIONS } from '../../../shared/bucket-options';
import { injectClock } from '../../../shared/clock';
import { CsFilterShell } from '../../../shared/components/filter-shell/filter-shell';
import { CsDateRange, type DateRange } from '../../../shared/controls/date-range/date-range';
import { CsMultiSelect } from '../../../shared/controls/multi-select/multi-select';
import { nonEmptySelection } from '../../../shared/controls/non-empty-selection';
import { CsSelect } from '../../../shared/controls/select/select';
import type { SelectOption } from '../../../shared/controls/select-option';
import { SERIES_LABEL_KEYS } from '../../../shared/series-display';
import {
  MINUTE_MS,
  clampRangeStart,
  endOfDayExclusive,
  matchRangePreset,
  rangePresetShortLabelKey,
  startOfDay,
  type TimeRange,
} from '../../../shared/time';

/** Only the date bounds depend on the clock here, so once a minute is more than enough. */
const CLOCK_INTERVAL_MS = MINUTE_MS;

/** Live updates and the coarse UI clock can differ slightly while still describing "last …". */
const PRESET_TOLERANCE_MS = 2 * MINUTE_MS;

@Component({
  selector: 'app-measurements-filters',
  imports: [CsDateRange, CsFilterShell, CsMultiSelect, CsSelect, TranslocoPipe],
  templateUrl: './measurements-filters.html',
  styleUrl: './measurements-filters.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MeasurementsFilters {
  readonly availableSeries = input.required<readonly SeriesId[]>();
  readonly selectedSeries = input.required<readonly SeriesId[]>();
  readonly range = input.required<TimeRange>();
  readonly bucket = input.required<BucketId>();

  readonly seriesChange = output<SeriesId[]>();
  readonly rangeChange = output<TimeRange>();
  readonly bucketChange = output<BucketId>();

  readonly #now = injectClock(CLOCK_INTERVAL_MS);

  /** At least one series has to stay selected, otherwise there is nothing to query. */
  readonly #selection = nonEmptySelection(this.selectedSeries);

  /** The one control tree lives in the shell; overlay tiers stage edits until Apply. */
  private readonly shell = viewChild.required(CsFilterShell);

  #stagedSeries: SeriesId[] | undefined;
  #stagedRange: TimeRange | undefined;
  #stagedBucket: BucketId | undefined;

  protected readonly bucketOptions = BUCKET_OPTIONS;
  protected readonly pickedSeries = this.#selection.picked;

  /** A tab left open across midnight must not lose the ability to select the current day. */
  protected readonly maxDate = computed(() => new Date(this.#now()));
  /** The backend answers 400 for anything wider, so the picker must not offer it. */
  protected readonly minDate = computed(() => new Date(this.#now() - MAX_RANGE_MS));

  /** Keep meaningful chips while a catalogue reload or failure temporarily removes the options. */
  protected readonly seriesOptions = computed<SelectOption<SeriesId>[]>(() => {
    const available = this.availableSeries();
    const ids = available.length > 0 ? available : this.pickedSeries();
    return ids.map((id) => ({ value: id, label: SERIES_LABEL_KEYS[id] }));
  });

  /** The range is half-open, so the last day it covers ends one millisecond before `to`. */
  protected readonly pickedRange = computed<DateRange>(() => ({
    from: new Date(this.range().from),
    to: new Date(this.range().to - 1),
  }));

  /** Entry-key badge: how many filters currently narrow the log (the series subset). */
  protected readonly activeCount = computed(() => {
    const available = this.availableSeries();
    const narrowed = available.length > 0 && this.selectedSeries().length < available.length;
    return narrowed ? 1 : 0;
  });

  /** APPLIED state for the entry-key summary — a staged draft never leaks into it. */
  protected readonly summaryRangeKey = computed(() => {
    const preset = matchRangePreset(this.range(), PRESET_TOLERANCE_MS, this.#now());
    return preset === undefined ? 'range.custom' : rangePresetShortLabelKey(preset);
  });

  protected onSeriesPicked(ids: SeriesId[]): void {
    const accepted = this.#selection.commit(ids);
    if (accepted === undefined) {
      return;
    }
    if (this.shell().deferred()) {
      this.#stagedSeries = accepted;
    } else {
      this.seriesChange.emit(accepted);
    }
  }

  /** The picker reports the opening click with no end date yet; that is not a range change. */
  protected onRangePicked({ from, to }: DateRange): void {
    if (from === null || to === null) {
      return;
    }
    // Picking today would otherwise ask for a window ending tomorrow at 00:00, and the generator is
    // a pure function of the timestamp: the first page would be readings that have not happened.
    const end = Math.min(endOfDayExclusive(to.getTime()), Date.now());
    const start = clampRangeStart(startOfDay(from.getTime()), end, MAX_RANGE_MS);
    if (end <= start) {
      return;
    }
    if (this.shell().deferred()) {
      this.#stagedRange = { from: start, to: end };
    } else {
      this.rangeChange.emit({ from: start, to: end });
    }
  }

  protected onBucketPicked(bucket: BucketId): void {
    if (this.shell().deferred()) {
      this.#stagedBucket = bucket;
    } else {
      this.bucketChange.emit(bucket);
    }
  }

  /** Apply: the staged draft lands on the real query signals in one pass. */
  protected commitStaged(): void {
    const series = this.#stagedSeries;
    const range = this.#stagedRange;
    const bucket = this.#stagedBucket;
    this.#clearStaged();
    if (series !== undefined) {
      this.seriesChange.emit(series);
    }
    if (range !== undefined) {
      this.rangeChange.emit(range);
    }
    if (bucket !== undefined) {
      this.bucketChange.emit(bucket);
    }
  }

  /** Cancel/Reset: drop the staged draft; the re-embedded controls re-read the applied state. */
  protected discardStaged(): void {
    this.#clearStaged();
    this.#selection.commit([...this.selectedSeries()]);
  }

  #clearStaged(): void {
    this.#stagedSeries = undefined;
    this.#stagedRange = undefined;
    this.#stagedBucket = undefined;
  }
}

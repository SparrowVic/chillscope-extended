import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';

import { injectActiveLanguage } from '../../../core/i18n/active-language';
import { MAX_RANGE_MS, type BucketId } from '../../../core/data/series.catalog';
import { BUCKET_OPTIONS } from '../../../shared/bucket-options';
import { injectClock } from '../../../shared/clock';
import { FilterLayout } from '../../../shared/components/filter-shell/filter-layout';
import { CsDateRange, type DateRange } from '../../../shared/controls/date-range/date-range';
import {
  CsSegmentedControl,
  type SegmentedControlOption,
} from '../../../shared/controls/segmented-control/segmented-control';
import type { SelectOption } from '../../../shared/controls/select-option';
import { CsSelect } from '../../../shared/controls/select/select';
import {
  MINUTE_MS,
  RANGE_PRESET_IDS,
  RANGE_PRESET_SPANS,
  clampRangeStart,
  matchRangePreset,
  rangePresetLabelKey,
  rangePresetShortLabelKey,
  type RangePresetId,
  type TimeRange,
} from '../../../shared/time';

type BucketChoice = 'auto' | BucketId;
type RangePresetChoice = RangePresetId | 'custom';

/** Live updates and the coarse UI clock can differ slightly while still describing “last …”. */
const PRESET_TOLERANCE_MS = 2 * MINUTE_MS;

/** Only the date bounds depend on the clock here, so once a minute is more than enough. */
const CLOCK_INTERVAL_MS = MINUTE_MS;

const BUCKET_CHOICES: readonly SelectOption<BucketChoice>[] = [
  { value: 'auto', label: 'bucket.auto' },
  ...BUCKET_OPTIONS,
];

const RANGE_PRESET_OPTIONS: readonly SegmentedControlOption<RangePresetChoice>[] =
  RANGE_PRESET_IDS.map((id) => ({
    value: id,
    label: rangePresetLabelKey(id),
    shortLabel: rangePresetShortLabelKey(id),
  }));

const CUSTOM_RANGE = 'custom' as const;

@Component({
  selector: 'app-range-picker',
  imports: [CsDateRange, CsSegmentedControl, CsSelect],
  templateUrl: './range-picker.html',
  styleUrl: './range-picker.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RangePicker {
  readonly range = input.required<TimeRange>();
  /** What the facade actually serves, which may be wider than the choice the user clicked. */
  readonly bucket = input.required<BucketId>();
  readonly rangeChange = output<TimeRange>();
  readonly bucketChange = output<BucketId>();
  readonly bucketReset = output<void>();

  readonly #now = injectClock(CLOCK_INTERVAL_MS);
  readonly #filterLayout = inject(FilterLayout);
  readonly #language = injectActiveLanguage();

  protected readonly presetOptions = RANGE_PRESET_OPTIONS;
  protected readonly bucketChoices = BUCKET_CHOICES;

  /** The backend rejects anything wider, and a tab left open overnight must not go stale on "today". */
  protected readonly maxDate = computed(() => new Date(this.#now()));
  protected readonly minDate = computed(() => new Date(this.#now() - MAX_RANGE_MS));

  protected readonly dateFormat = computed<string | undefined>(() => {
    if (this.#filterLayout.mode() !== 'sheet') {
      return undefined;
    }
    return this.#language() === 'pl' ? 'd.m.y' : 'm/d/y';
  });

  protected readonly activePreset = computed<RangePresetId | undefined>(() =>
    matchRangePreset(this.range(), PRESET_TOLERANCE_MS, this.#now()),
  );

  protected readonly activePresetChoice = computed<RangePresetChoice>(
    () => this.activePreset() ?? CUSTOM_RANGE,
  );

  protected readonly pickedDates = linkedSignal<TimeRange, DateRange>({
    source: this.range,
    computation: ({ from, to }) => ({ from: new Date(from), to: new Date(to) }),
  });

  /** Mirrors the facade: an override survives until the range moves, then automatic takes over. */
  readonly #overridden = linkedSignal<TimeRange, boolean>({
    source: this.range,
    computation: () => false,
  });

  /**
   * Reads the bucket back from the facade rather than remembering what was clicked, because the
   * facade widens a choice the range cannot afford — the select must not claim otherwise.
   */
  protected readonly bucketChoice = computed<BucketChoice>(() =>
    this.#overridden() ? this.bucket() : 'auto',
  );

  protected selectPreset(id: RangePresetId): void {
    // The display clock is intentionally coarse, but a user action must end at the actual click.
    // Otherwise the facade can mistake a minute-old preset for a historical range and disable LIVE.
    const to = Date.now();
    this.rangeChange.emit({ from: to - RANGE_PRESET_SPANS[id], to });
  }

  protected onPresetPicked(choice: RangePresetChoice): void {
    if (choice !== CUSTOM_RANGE) {
      this.selectPreset(choice);
    }
  }

  protected onDatesPicked(dates: DateRange): void {
    this.pickedDates.set(dates);
    const { from, to } = dates;
    if (!from || !to) {
      return;
    }
    // `sampleAt` is a pure function of the timestamp and will happily invent the future, so the
    // upper bound is the wall clock rather than whatever the picker was willing to hand over.
    const end = Math.min(to.getTime(), Date.now());
    const start = clampRangeStart(from.getTime(), end, MAX_RANGE_MS);
    if (end > start) {
      this.rangeChange.emit({ from: start, to: end });
    }
  }

  protected onBucketPicked(choice: BucketChoice): void {
    this.#overridden.set(choice !== 'auto');
    if (choice === 'auto') {
      this.bucketReset.emit();
    } else {
      this.bucketChange.emit(choice);
    }
  }
}

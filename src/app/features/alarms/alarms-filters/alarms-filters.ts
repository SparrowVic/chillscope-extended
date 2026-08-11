import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import type { AlarmSeverityFilter, SeriesId } from '../../../core/data/measurement.models';
import { MAX_RANGE_MS, SERIES_IDS } from '../../../core/data/series.catalog';
import { injectClock } from '../../../shared/clock';
import { CsFilterShell } from '../../../shared/components/filter-shell/filter-shell';
import { CsDateRange, type DateRange } from '../../../shared/controls/date-range/date-range';
import { CsMultiSelect } from '../../../shared/controls/multi-select/multi-select';
import { CsSelect } from '../../../shared/controls/select/select';
import type { SelectOption } from '../../../shared/controls/select-option';
import { SERIES_LABEL_KEYS } from '../../../shared/series-display';
import {
  MINUTE_MS,
  RANGE_PRESET_IDS,
  RANGE_PRESET_SPANS,
  clampRangeStart,
  endOfDayExclusive,
  matchRangePreset,
  rangePresetLabelKey,
  rangePresetShortLabelKey,
  startOfDay,
  type RangePresetId,
  type TimeRange,
} from '../../../shared/time';

type RangeSelection = RangePresetId | 'custom';

interface RangeSelectionSource {
  readonly range: TimeRange;
  readonly now: number;
}

/** A preset window is only recognisable while its end still tracks the wall clock. */
const RANGE_MATCH_TOLERANCE_MS = 2 * MINUTE_MS;

const CLOCK_INTERVAL_MS = MINUTE_MS;

const SEVERITY_OPTIONS: readonly SelectOption<AlarmSeverityFilter>[] = [
  { value: 'all', label: 'severity.all' },
  { value: 'warning', label: 'severity.warning' },
  { value: 'critical', label: 'severity.critical' },
];

const SERIES_OPTIONS: readonly SelectOption<SeriesId>[] = SERIES_IDS.map((id) => ({
  value: id,
  label: SERIES_LABEL_KEYS[id],
}));

const RANGE_OPTIONS: readonly SelectOption<RangeSelection>[] = [
  ...RANGE_PRESET_IDS.map((id) => ({ value: id, label: rangePresetLabelKey(id) })),
  { value: 'custom', label: 'range.custom' },
];

@Component({
  selector: 'app-alarms-filters',
  imports: [CsDateRange, CsFilterShell, CsMultiSelect, CsSelect, TranslocoPipe],
  templateUrl: './alarms-filters.html',
  styleUrl: './alarms-filters.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlarmsFilters {
  readonly range = input.required<TimeRange>();
  readonly severity = input.required<AlarmSeverityFilter>();
  readonly series = input.required<readonly SeriesId[]>();

  readonly rangeChange = output<TimeRange>();
  readonly severityChange = output<AlarmSeverityFilter>();
  readonly seriesChange = output<SeriesId[]>();

  readonly #now = injectClock(CLOCK_INTERVAL_MS);

  /** The one control tree lives in the shell; overlay tiers stage edits until Apply. */
  private readonly shell = viewChild.required(CsFilterShell);

  #stagedSeverity: AlarmSeverityFilter | undefined;
  #stagedSeries: SeriesId[] | undefined;
  #stagedRange: TimeRange | undefined;

  protected readonly severityOptions = SEVERITY_OPTIONS;
  protected readonly seriesOptions = SERIES_OPTIONS;
  protected readonly rangeOptions = RANGE_OPTIONS;

  /** A tab left open across midnight must not lose the ability to select the current day. */
  protected readonly maxDate = computed(() => new Date(this.#now()));
  /** The backend answers 400 for anything wider, so the picker must not offer it. */
  protected readonly minDate = computed(() => new Date(this.#now() - MAX_RANGE_MS));

  protected readonly pickedSeries = computed(() => [...this.series()]);

  protected readonly rangeSelection = linkedSignal<RangeSelectionSource, RangeSelection>({
    source: () => ({ range: this.range(), now: this.#now() }),
    computation: ({ range, now }, previous) => {
      const sameRange =
        previous !== undefined &&
        previous.source.range.from === range.from &&
        previous.source.range.to === range.to;
      // A half-finished custom picker remains selected across clock ticks. Presets, on the other
      // hand, age into "custom" once their fixed end no longer follows the wall clock.
      if (sameRange && previous.value === 'custom') {
        return 'custom';
      }
      return matchRangePreset(range, RANGE_MATCH_TOLERANCE_MS, now) ?? 'custom';
    },
  });

  /** Locally writable so the picker keeps the half-finished range the user is still choosing. */
  protected readonly customRange = linkedSignal<TimeRange, DateRange>({
    source: this.range,
    computation: (range) => ({ from: new Date(range.from), to: new Date(range.to - 1) }),
  });

  /** Entry-key badge: how many filters narrow the journal beyond "everything". */
  protected readonly activeCount = computed(
    () => (this.severity() === 'all' ? 0 : 1) + (this.series().length > 0 ? 1 : 0),
  );

  /** APPLIED state for the entry-key summary — a staged draft never leaks into it. */
  protected readonly summaryRangeKey = computed(() => {
    const preset = matchRangePreset(this.range(), RANGE_MATCH_TOLERANCE_MS, this.#now());
    return preset === undefined ? 'range.custom' : rangePresetShortLabelKey(preset);
  });

  protected onSeverityPicked(severity: AlarmSeverityFilter): void {
    if (this.shell().deferred()) {
      this.#stagedSeverity = severity;
    } else {
      this.severityChange.emit(severity);
    }
  }

  protected onSeriesPicked(ids: SeriesId[]): void {
    if (this.shell().deferred()) {
      this.#stagedSeries = ids;
    } else {
      this.seriesChange.emit(ids);
    }
  }

  protected onRangeSelectionChange(selection: RangeSelection): void {
    this.rangeSelection.set(selection);

    if (selection === 'custom') {
      return;
    }

    const to = Date.now();
    const range = { from: to - RANGE_PRESET_SPANS[selection], to };
    if (this.shell().deferred()) {
      this.#stagedRange = range;
    } else {
      this.rangeChange.emit(range);
    }
  }

  protected onCustomRangeChange(range: DateRange): void {
    this.customRange.set(range);

    if (!range.from || !range.to) {
      return;
    }

    // Half-open like everywhere else, and never past the wall clock: alarms dated in the future
    // would otherwise render as "in 3 hours" under the "Today" heading.
    const to = Math.min(endOfDayExclusive(range.to.getTime()), Date.now());
    const from = clampRangeStart(startOfDay(range.from.getTime()), to, MAX_RANGE_MS);
    if (to <= from) {
      return;
    }
    if (this.shell().deferred()) {
      this.#stagedRange = { from, to };
    } else {
      this.rangeChange.emit({ from, to });
    }
  }

  /** Apply: the staged draft lands on the real query signals in one pass. */
  protected commitStaged(): void {
    const severity = this.#stagedSeverity;
    const series = this.#stagedSeries;
    const range = this.#stagedRange;
    this.#clearStaged();
    if (severity !== undefined) {
      this.severityChange.emit(severity);
    }
    if (series !== undefined) {
      this.seriesChange.emit(series);
    }
    if (range !== undefined) {
      this.rangeChange.emit(range);
    }
  }

  /** Cancel/Reset: drop the staged draft and re-derive the local buffers from the applied state. */
  protected discardStaged(): void {
    this.#clearStaged();
    this.rangeSelection.set(
      matchRangePreset(this.range(), RANGE_MATCH_TOLERANCE_MS, this.#now()) ?? 'custom',
    );
    this.customRange.set({
      from: new Date(this.range().from),
      to: new Date(this.range().to - 1),
    });
  }

  #clearStaged(): void {
    this.#stagedSeverity = undefined;
    this.#stagedSeries = undefined;
    this.#stagedRange = undefined;
  }
}

import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';

import type { Alarm } from '../../../core/data/measurement.models';
import { injectActiveLanguage } from '../../../core/i18n/active-language';
import { injectClock } from '../../../shared/clock';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { CsIcon } from '../../../shared/icons/cs-icon/cs-icon';
import { formatDayHeading } from '../alarm-format';
import { groupAlarmsByDay } from '../alarm-grouping';
import { AlarmItem } from '../alarm-item/alarm-item';

/** Every row states an age, so the list needs its own clock to keep them honest. */
const CLOCK_INTERVAL_MS = 30_000;
const SKELETON_ROWS = [0, 1, 2, 3, 4];
export const ALARMS_PAGE_SIZE = 100;

@Component({
  selector: 'app-alarms-list',
  imports: [AlarmItem, ButtonModule, CsIcon, EmptyState, SkeletonModule, TranslocoPipe],
  templateUrl: './alarms-list.html',
  styleUrl: './alarms-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlarmsList {
  readonly alarms = input.required<readonly Alarm[]>();
  readonly loading = input(false);

  readonly #language = injectActiveLanguage();

  protected readonly now = injectClock(CLOCK_INTERVAL_MS);
  protected readonly skeletonRows = SKELETON_ROWS;

  protected readonly page = linkedSignal<readonly Alarm[], number>({
    source: this.alarms,
    computation: () => 0,
  });
  protected readonly pageCount = computed(() => Math.ceil(this.alarms().length / ALARMS_PAGE_SIZE));
  readonly #visibleAlarms = computed(() => {
    const start = this.page() * ALARMS_PAGE_SIZE;
    return this.alarms().slice(start, start + ALARMS_PAGE_SIZE);
  });

  /** Kept apart from the headings so a clock tick relabels the days without regrouping them. */
  readonly #groups = computed(() => groupAlarmsByDay(this.#visibleAlarms()));

  protected readonly days = computed(() =>
    this.#groups().map((group) => ({
      dayStart: group.dayStart,
      heading: formatDayHeading(group.dayStart, this.now(), this.#language()),
      alarms: group.alarms,
      /** The day tally rides the heading so a phone can triage days without scanning rows. */
      count: group.alarms.length,
      critical: group.alarms.filter((alarm) => alarm.severity === 'critical').length,
    })),
  );

  protected previousPage(): void {
    this.page.update((page) => Math.max(0, page - 1));
  }

  protected nextPage(): void {
    this.page.update((page) => Math.min(this.pageCount() - 1, page + 1));
  }
}

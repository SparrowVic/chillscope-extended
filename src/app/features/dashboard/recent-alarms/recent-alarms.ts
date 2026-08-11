import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SkeletonModule } from 'primeng/skeleton';

import type { Alarm, AlarmSeverity } from '../../../core/data/measurement.models';
import { injectActiveLanguage } from '../../../core/i18n/active-language';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { ErrorPanel } from '../../../shared/components/error-panel/error-panel';
import { CsIcon } from '../../../shared/icons/cs-icon/cs-icon';
import { injectClock } from '../../../shared/clock';
import { SERIES_LABEL_KEYS, SERIES_UNIT_KEYS } from '../../../shared/series-display';
import { MINUTE_MS } from '../../../shared/time';
import { formatRelativeTime } from '../../alarms/alarm-format';
import { injectMeasurementFormatter, injectTimestampFormatter } from '../formatting';

/** A dashboard journal column, not the Alarms view — anything longer sits behind "view all". */
const MAX_ENTRIES = 8;

interface AlarmEntry {
  readonly id: string;
  readonly seriesKey: string;
  readonly unitKey: string;
  readonly severityKey: string;
  readonly severity: AlarmSeverity;
  readonly value: string;
  readonly threshold: string;
  readonly relativeTime: string;
  readonly exactTime: string;
  readonly isoTime: string;
}

@Component({
  selector: 'app-recent-alarms',
  imports: [CsIcon, EmptyState, ErrorPanel, RouterLink, SkeletonModule, TranslocoPipe],
  templateUrl: './recent-alarms.html',
  styleUrl: './recent-alarms.css',
  host: { class: 'cs-panel' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecentAlarms {
  readonly alarms = input.required<readonly Alarm[]>();
  readonly loading = input(false);
  readonly failed = input(false);
  readonly retry = output<void>();

  readonly #formatValue = injectMeasurementFormatter();
  readonly #formatTimestamp = injectTimestampFormatter();
  readonly #language = injectActiveLanguage();

  /** "5 minutes ago" must age even when no new alarm arrives; the simulator ticks once a minute. */
  readonly #now = injectClock(MINUTE_MS);

  protected readonly placeholders = [1, 2, 3];

  protected readonly entries = computed<AlarmEntry[]>(() => {
    const value = this.#formatValue();
    const timestamp = this.#formatTimestamp();
    const lang = this.#language();
    const now = this.#now();

    return this.alarms()
      .slice(0, MAX_ENTRIES)
      .map((alarm) => ({
        id: alarm.id,
        seriesKey: SERIES_LABEL_KEYS[alarm.series],
        unitKey: SERIES_UNIT_KEYS[alarm.series],
        severityKey: `severity.${alarm.severity}`,
        severity: alarm.severity,
        value: value(alarm.value),
        threshold: value(alarm.threshold),
        relativeTime: formatRelativeTime(alarm.timestamp, now, lang),
        exactTime: timestamp(alarm.timestamp),
        isoTime: new Date(alarm.timestamp).toISOString(),
      }));
  });
}

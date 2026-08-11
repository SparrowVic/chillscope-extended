import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { isAlarmActiveAt } from '../../../core/data/alarm-state';
import type { Alarm } from '../../../core/data/measurement.models';
import { injectActiveLanguage } from '../../../core/i18n/active-language';
import { CsIcon } from '../../../shared/icons/cs-icon/cs-icon';
import { formatMeasurement } from '../../../shared/intl';
import { SERIES_LABEL_KEYS, SERIES_UNIT_KEYS } from '../../../shared/series-display';
import {
  formatAbsoluteTime,
  formatDuration,
  formatRelativeTime,
  formatTimeOfDay,
} from '../alarm-format';

@Component({
  selector: 'app-alarm-item',
  imports: [CsIcon, TranslocoPipe],
  templateUrl: './alarm-item.html',
  styleUrl: './alarm-item.css',
  host: { class: 'alarm-item' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlarmItem {
  readonly alarm = input.required<Alarm>();
  /** Supplied by the list so one clock drives every row instead of one timer per alarm. */
  readonly now = input.required<number>();

  readonly #language = injectActiveLanguage();

  protected readonly seriesKey = computed(() => SERIES_LABEL_KEYS[this.alarm().series]);
  protected readonly severityKey = computed(() => `severity.${this.alarm().severity}`);
  protected readonly unitKey = computed(() => SERIES_UNIT_KEYS[this.alarm().series]);

  /** A pulse means exactly what the motion contract says: this critical episode is still live. */
  protected readonly live = computed(
    () => this.alarm().severity === 'critical' && isAlarmActiveAt(this.alarm(), this.now()),
  );

  protected readonly value = computed(() =>
    formatMeasurement(this.alarm().value, this.#language()),
  );
  protected readonly threshold = computed(() =>
    formatMeasurement(this.alarm().threshold, this.#language()),
  );
  protected readonly duration = computed(() =>
    formatDuration(this.alarm().durationMs, this.#language()),
  );
  protected readonly relativeTime = computed(() =>
    formatRelativeTime(this.alarm().timestamp, this.now(), this.#language()),
  );
  protected readonly timeOfDay = computed(() =>
    formatTimeOfDay(this.alarm().timestamp, this.#language()),
  );
  protected readonly absoluteTime = computed(() =>
    formatAbsoluteTime(this.alarm().timestamp, this.#language()),
  );
  protected readonly isoTime = computed(() => new Date(this.alarm().timestamp).toISOString());
}

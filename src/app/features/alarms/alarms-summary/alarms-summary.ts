import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { SkeletonModule } from 'primeng/skeleton';

import type { Alarm } from '../../../core/data/measurement.models';
import { injectActiveLanguage } from '../../../core/i18n/active-language';
import { formatCount } from '../../../shared/intl';
import { CsDigitMorph } from '../../../shared/motion/digit-morph/digit-morph';

/** `total` carries the neutral LED; the other two wear their severity colour. */
type CounterTone = 'total' | 'warning' | 'critical';

interface SummaryCounter {
  readonly tone: CounterTone;
  readonly labelKey: string;
  readonly value: string;
  /** Dark cockpit: a lamp with nothing to report is a hollow ring, not a lit dot. */
  readonly dim: boolean;
  /** Breath is reserved for the critical lamp while its count is non-zero (§8). */
  readonly pulse: boolean;
}

@Component({
  selector: 'app-alarms-summary',
  imports: [CsDigitMorph, SkeletonModule, TranslocoPipe],
  templateUrl: './alarms-summary.html',
  styleUrl: './alarms-summary.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlarmsSummary {
  readonly alarms = input.required<readonly Alarm[]>();
  readonly loading = input(false);

  readonly #language = injectActiveLanguage();

  /** The list below shows skeletons while it loads; three zeroes here would contradict it. */
  protected readonly pending = computed(() => this.loading() && this.alarms().length === 0);

  readonly #tally = computed(() => {
    const alarms = this.alarms();
    let critical = 0;
    for (const alarm of alarms) {
      if (alarm.severity === 'critical') {
        critical += 1;
      }
    }
    return { total: alarms.length, warning: alarms.length - critical, critical };
  });

  protected readonly counters = computed<SummaryCounter[]>(() => {
    const { total, warning, critical } = this.#tally();
    const language = this.#language();

    return [
      {
        tone: 'total',
        labelKey: 'alarms.summary.total',
        value: formatCount(total, language),
        dim: true,
        pulse: false,
      },
      {
        tone: 'warning',
        labelKey: 'alarms.summary.warning',
        value: formatCount(warning, language),
        dim: warning === 0,
        pulse: false,
      },
      {
        tone: 'critical',
        labelKey: 'alarms.summary.critical',
        value: formatCount(critical, language),
        dim: critical === 0,
        pulse: critical > 0,
      },
    ];
  });

  /**
   * Both fills share the left origin, so the critical layer overlays the start of the warning
   * layer: the visible amber run is exactly the warning share. The warning layer therefore spans
   * the whole track whenever anything exists, and the empty window leaves a bare rail.
   */
  protected readonly meter = computed(() => {
    const { total, critical } = this.#tally();
    return {
      warningScale: total > 0 ? 1 : 0,
      criticalScale: total > 0 ? critical / total : 0,
    };
  });
}

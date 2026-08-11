import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';

import { AlarmsFacade } from '../../core/data/alarms.facade';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { CsIcon } from '../../shared/icons/cs-icon/cs-icon';
import { DAY_MS } from '../../shared/time';
import { AlarmsFilters } from './alarms-filters/alarms-filters';
import { AlarmsList } from './alarms-list/alarms-list';
import { AlarmsSummary } from './alarms-summary/alarms-summary';

const DEFAULT_RANGE_MS = 7 * DAY_MS;

@Component({
  selector: 'app-alarms',
  imports: [
    AlarmsFilters,
    AlarmsList,
    AlarmsSummary,
    ButtonModule,
    CsIcon,
    ErrorPanel,
    PageHeader,
    TranslocoPipe,
  ],
  templateUrl: './alarms.html',
  styleUrl: './alarms.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Alarms {
  protected readonly facade = inject(AlarmsFacade);

  constructor() {
    /** A week usually contains simulated episodes while keeping the journal query route-scoped. */
    const to = Date.now();
    this.facade.activateScreen(to - DEFAULT_RANGE_MS, to);
    inject(DestroyRef).onDestroy(() => this.facade.deactivateScreen());
  }
}

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import { AlarmsFacade } from '../../core/data/alarms.facade';
import { CsIcon } from '../../shared/icons/cs-icon/cs-icon';
import type { CsIconName } from '../../shared/icons/icon-roster';

interface NavigationItem {
  readonly route: string;
  readonly labelKey: string;
  readonly compactLabelKey: string;
  readonly icon: CsIconName;
}

const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  {
    route: '/dashboard',
    labelKey: 'menu.dashboard',
    compactLabelKey: 'menu.dashboardCompact',
    icon: 'gauge-high',
  },
  {
    route: '/measurements',
    labelKey: 'menu.measurements',
    compactLabelKey: 'menu.measurementsCompact',
    icon: 'table-list',
  },
  {
    route: '/alarms',
    labelKey: 'menu.alarms',
    compactLabelKey: 'menu.alarms',
    icon: 'bell',
  },
  {
    route: '/machines',
    labelKey: 'menu.machines',
    compactLabelKey: 'menu.machines',
    icon: 'diagram-project',
  },
  {
    route: '/settings',
    labelKey: 'menu.settings',
    compactLabelKey: 'menu.settings',
    icon: 'sliders',
  },
];

@Component({
  selector: 'app-navigation',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe, CsIcon],
  templateUrl: './navigation.html',
  styleUrl: './navigation.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppNavigation {
  readonly #alarms = inject(AlarmsFacade);

  protected readonly items = NAVIGATION_ITEMS;
  protected readonly alarmCount = this.#alarms.activeCount;
  protected readonly alarmBadge = computed(() => {
    const count = this.alarmCount();
    return count > 99 ? '99+' : `${count}`;
  });
}

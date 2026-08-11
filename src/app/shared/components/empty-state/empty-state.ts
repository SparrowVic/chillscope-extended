import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { CsIcon } from '../../icons/cs-icon/cs-icon';
import type { CsIconName } from '../../icons/icon-roster';

@Component({
  selector: 'app-empty-state',
  imports: [CsIcon, TranslocoPipe],
  templateUrl: './empty-state.html',
  styleUrl: './empty-state.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyState {
  readonly titleKey = input('states.emptyTitle');
  readonly messageKey = input<string>();
  readonly icon = input<CsIconName>('inbox');
}

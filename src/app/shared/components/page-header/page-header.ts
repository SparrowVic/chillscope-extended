import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { CsIcon } from '../../icons/cs-icon/cs-icon';
import type { CsIconName } from '../../icons/icon-roster';

@Component({
  selector: 'app-page-header',
  imports: [CsIcon, TranslocoPipe],
  templateUrl: './page-header.html',
  styleUrl: './page-header.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeader {
  readonly titleKey = input.required<string>();
  readonly subtitleKey = input<string>();
  readonly icon = input<CsIconName>();
}

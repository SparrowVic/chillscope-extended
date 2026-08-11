import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';

import { CsIcon } from '../../icons/cs-icon/cs-icon';

@Component({
  selector: 'app-error-panel',
  imports: [ButtonModule, CsIcon, MessageModule, TranslocoPipe],
  templateUrl: './error-panel.html',
  styleUrl: './error-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorPanel {
  readonly titleKey = input('states.errorTitle');
  readonly messageKey = input('states.errorMessage');
  readonly detail = input<string>();
  readonly retrying = input(false);
  readonly retry = output<void>();
}

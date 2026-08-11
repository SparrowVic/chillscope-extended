import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmPopupModule } from 'primeng/confirmpopup';

import { CsIcon } from '../../../shared/icons/cs-icon/cs-icon';

/**
 * The form's action dock. Besides Save and Reset it narrates the form state the buttons answer
 * to — the dirty lamp for unsaved work, the crit line when validation is what holds Save shut —
 * because on a phone the offending field may be folded away two screens up.
 */
@Component({
  selector: 'app-settings-actions',
  imports: [ButtonModule, ConfirmPopupModule, CsIcon, TranslocoPipe],
  templateUrl: './settings-actions.html',
  styleUrl: './settings-actions.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.settings-actions--sticky]': 'dirty()',
  },
  providers: [ConfirmationService],
})
export class SettingsActions {
  readonly saveDisabled = input(false, { transform: booleanAttribute });
  readonly dirty = input(false, { transform: booleanAttribute });
  readonly invalid = input(false, { transform: booleanAttribute });
  readonly resetRequested = output<void>();

  readonly #confirmation = inject(ConfirmationService);
  readonly #transloco = inject(TranslocoService);

  /**
   * The popup anchors to a DOM node, and `onClick` re-emits the event after `currentTarget` has
   * been cleared. `private` rather than `#` because Angular rejects queries on ES private fields.
   */
  private readonly resetButton = viewChild.required<unknown, ElementRef<HTMLElement>>(
    'resetButton',
    { read: ElementRef },
  );

  protected confirmReset(): void {
    this.#confirmation.confirm({
      target: this.resetButton().nativeElement,
      message: this.#transloco.translate('settings.actions.resetConfirm'),
      acceptLabel: this.#transloco.translate('common.confirm'),
      rejectLabel: this.#transloco.translate('common.cancel'),
      accept: () => this.resetRequested.emit(),
    });
  }
}

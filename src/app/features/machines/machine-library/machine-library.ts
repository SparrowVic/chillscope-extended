import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmPopupModule } from 'primeng/confirmpopup';

import type { MachineProfileId } from '../../../core/schematic/schematic.models';
import { CsIcon } from '../../../shared/icons/cs-icon/cs-icon';
import { CsDecode } from '../../../shared/motion/decode';

/** Everything a library row needs to render, resolved by the screen component. */
export interface MachineRow {
  readonly id: string;
  readonly name: string;
  readonly profileNameKey: string;
  readonly builtIn: boolean;
  readonly active: boolean;
  readonly selected: boolean;
}

/**
 * The library column (configurator spec §4): the list of built-in and user documents with the
 * duplicate / remove / set-active actions, and one create button per machine profile. Selection
 * is which document the editor shows; activation is which machine the whole app follows.
 */
@Component({
  selector: 'app-machine-library',
  imports: [ButtonModule, ConfirmPopupModule, CsDecode, CsIcon, TranslocoPipe],
  templateUrl: './machine-library.html',
  styleUrl: './machine-library.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'cs-panel' },
  providers: [ConfirmationService],
})
export class MachineLibrary {
  readonly rows = input.required<readonly MachineRow[]>();

  readonly selected = output<string>();
  readonly created = output<MachineProfileId>();
  readonly duplicated = output<string>();
  readonly removed = output<string>();
  readonly activated = output<string>();

  readonly #confirmation = inject(ConfirmationService);
  readonly #transloco = inject(TranslocoService);

  protected confirmRemove(event: Event, id: string): void {
    this.#confirmation.confirm({
      target: event.currentTarget as EventTarget,
      message: this.#transloco.translate('machines.library.removeConfirm', { id }),
      acceptLabel: this.#transloco.translate('common.confirm'),
      rejectLabel: this.#transloco.translate('common.cancel'),
      accept: () => this.removed.emit(id),
    });
  }
}

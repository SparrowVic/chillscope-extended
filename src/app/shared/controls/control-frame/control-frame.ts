import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { TooltipModule } from 'primeng/tooltip';

import { CsIcon } from '../../icons/cs-icon/cs-icon';
import type { ControlFrameState } from '../base-form-control';

@Component({
  selector: 'cs-control-frame',
  imports: [CsIcon, TooltipModule, TranslocoPipe],
  templateUrl: './control-frame.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'cs-control-frame',
    '[class.cs-control-frame--inline]': 'inline()',
    '[class.cs-control-frame--invalid]': 'state().invalid',
  },
  styleUrl: './control-frame.css',
})
export class ControlFrame {
  readonly state = input.required<ControlFrameState>();

  /** Puts the label beside the control instead of above it — the natural layout for a switch. */
  readonly inline = input(false, { transform: booleanAttribute });
}

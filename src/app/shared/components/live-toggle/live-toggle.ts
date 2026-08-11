import { ChangeDetectionStrategy, Component, model } from '@angular/core';

import { CsSwitch } from '../../controls/switch/switch';

/**
 * The one LIVE switch (DESIGN §6): a pulsing LED while live, next to the switch whose own label
 * doubles as the engraved LIVE tag — the same reading as the system strip's live indicator.
 * Shared because the Dashboard and the tape deck both offer live mode on their own screen.
 */
@Component({
  selector: 'app-live-toggle',
  imports: [CsSwitch],
  templateUrl: './live-toggle.html',
  styleUrl: './live-toggle.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.live-toggle--on]': 'enabled()' },
})
export class LiveToggle {
  readonly enabled = model.required<boolean>();
}

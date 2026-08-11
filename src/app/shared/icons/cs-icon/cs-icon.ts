import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import type { IconDefinition, SizeProp } from '@fortawesome/fontawesome-svg-core';

import { ICON_ROSTER, type CsIconName } from '../icon-roster';

/**
 * The single door to Font Awesome. Templates name icons semantically while the roster owns the
 * concrete public-package definition; interaction state belongs to the surrounding control.
 */
@Component({
  selector: 'cs-icon',
  imports: [FaIconComponent],
  templateUrl: './cs-icon.html',
  styleUrl: './cs-icon.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsIcon {
  readonly name = input.required<CsIconName>();
  readonly size = input<SizeProp>();

  protected readonly definition = computed<IconDefinition>(() => ICON_ROSTER[this.name()]);
}

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { CsIcon } from '../../../../shared/icons/cs-icon/cs-icon';

/**
 * The machine form's engraved section caption. Wide viewports print the plain caption + rule +
 * count; when `collapsible` (the compact stage) the same line becomes an accordion header — a
 * heading-wrapped disclosure button whose accessible name carries the count, with a crit lamp
 * confessing schema errors hidden inside a folded section. The fields it fronts stay mounted
 * either way; only visibility changes, so no form tree is ever duplicated or torn down.
 */
@Component({
  selector: 'app-mform-caption',
  imports: [CsIcon, TranslocoPipe],
  templateUrl: './section-caption.html',
  styleUrl: './section-caption.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionCaption {
  readonly labelKey = input.required<string>();
  readonly count = input<number | undefined>(undefined);
  readonly collapsible = input(false);
  readonly expanded = input(true);
  readonly invalid = input(false);
  /** id of the rows container the disclosure controls. */
  readonly controlsId = input<string | undefined>(undefined);

  readonly toggled = output<void>();
}

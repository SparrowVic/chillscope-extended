import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { MeasurementsFacade } from '../../../core/data/measurements.facade';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { ErrorPanel } from '../../../shared/components/error-panel/error-panel';
import { LiveToggle } from '../../../shared/components/live-toggle/live-toggle';
import { Tape } from '../tape/tape';
import { TapeDeckFacade } from './tape-deck.facade';

/**
 * The SERIES TAPES deck (DESIGN §6 Measurements): one vertical instrument per selected series
 * above the measurement log. Below the desktop tier the grid re-lays — one full-width column on
 * phones, two-or-more conscious columns on tablets — every tape complete; the page scrolls,
 * never the deck.
 */
@Component({
  selector: 'app-tape-deck',
  imports: [EmptyState, ErrorPanel, LiveToggle, Tape, TranslocoPipe],
  providers: [TapeDeckFacade],
  templateUrl: './tape-deck.html',
  styleUrl: './tape-deck.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TapeDeck {
  protected readonly deck = inject(TapeDeckFacade);
  protected readonly measurements = inject(MeasurementsFacade);

  constructor() {
    // The screen gates interval work; the root facade keeps the user's live preference so a route
    // change cannot silently turn the switch off.
    const releaseLive = this.measurements.activateLive();
    inject(DestroyRef).onDestroy(releaseLive);
  }
}

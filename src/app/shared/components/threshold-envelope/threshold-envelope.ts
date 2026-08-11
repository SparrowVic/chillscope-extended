import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Threshold positions on the track, as percentage strings ready for style bindings. `null` while
 * the band is incomplete or mis-ordered — the track then renders empty rather than painting a
 * zone map that contradicts what the validators are about to reject.
 */
interface EnvelopeModel {
  readonly criticalMin: string;
  readonly warningMin: string;
  readonly warningMax: string;
  readonly criticalMax: string;
}

/** Crit zones stay visible at the track's ends: the domain extends past them by this fraction. */
const ENVELOPE_MARGIN = 0.1;

/**
 * The one operating-envelope readout (§8b): a static zone map of a four-bound alarm band, drawn
 * wherever those bounds are edited — settings profiles and per-sensor overrides alike, so both
 * surfaces speak a single severity-band grammar. Both paints are plain backgrounds recomputed
 * only when a bound changes — nothing here ever animates, so no reduced-motion branch is owed.
 * The host keeps its height while the band is invalid: an empty rail reads as "no verdict yet"
 * without the row jumping under the user's caret. The bound fields are the labels; the track
 * only maps them, so it says nothing to AT.
 */
@Component({
  selector: 'cs-threshold-envelope',
  templateUrl: './threshold-envelope.html',
  styleUrl: './threshold-envelope.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
})
export class CsThresholdEnvelope {
  readonly criticalMin = input.required<number | null>();
  readonly warningMin = input.required<number | null>();
  readonly warningMax = input.required<number | null>();
  readonly criticalMax = input.required<number | null>();

  protected readonly envelope = computed<EnvelopeModel | null>(() => {
    const criticalMin = this.criticalMin();
    const warningMin = this.warningMin();
    const warningMax = this.warningMax();
    const criticalMax = this.criticalMax();
    if (
      criticalMin === null ||
      warningMin === null ||
      warningMax === null ||
      criticalMax === null
    ) {
      return null;
    }
    if (!(criticalMin < warningMin && warningMin < warningMax && warningMax < criticalMax)) {
      return null;
    }

    const margin = (criticalMax - criticalMin) * ENVELOPE_MARGIN;
    const start = criticalMin - margin;
    const span = criticalMax + margin - start;
    const at = (value: number): string => `${(((value - start) / span) * 100).toFixed(2)}%`;
    return {
      criticalMin: at(criticalMin),
      warningMin: at(warningMin),
      warningMax: at(warningMax),
      criticalMax: at(criticalMax),
    };
  });
}

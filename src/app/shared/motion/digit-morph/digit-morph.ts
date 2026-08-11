import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  inject,
  input,
  linkedSignal,
} from '@angular/core';

/** §8: 45ms per digit, counted from the left edge of the value. */
const STAGGER_MS = 45;

interface MorphCell {
  /** Changes only when the character at this position changes, so only those cells re-animate. */
  readonly key: string;
  readonly char: string;
  readonly outChar: string | null;
  readonly delay: string | null;
}

/** Spaces collapse inside inline spans; U+00A0 keeps the column (§8). */
function glyph(char: string): string {
  return char === ' ' ? '\u00a0' : char;
}

/**
 * The §8 value-change language: per-character spans (a mono face keeps the widths stable), and on
 * change the old digit slides 0.3em up and out while the new one rises in — 400ms `--cs-ease`,
 * 45ms stagger per digit. Only characters that actually changed animate; under reduced motion the
 * swap is instant. Wear it inside a `.cs-mono` context — it inherits the face, it does not set it.
 */
@Component({
  selector: 'cs-digit-morph',
  templateUrl: './digit-morph.html',
  styleUrl: './digit-morph.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsDigitMorph {
  readonly value = input.required<string>();

  /** The optional call keeps test environments without a media query engine working. */
  readonly #reducedMotion =
    inject(DOCUMENT).defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;

  protected readonly cells = linkedSignal<string, MorphCell[]>({
    source: this.value,
    computation: (next, previous) => {
      const before = previous === undefined ? [] : [...previous.source];
      const animate = before.length > 0 && !(this.#reducedMotion?.matches ?? false);
      return [...next].map((raw, index) => {
        const char = glyph(raw);
        const old = before[index];
        if (animate && old !== undefined && old !== raw) {
          return {
            key: `${index}:${old}>${raw}`,
            char,
            outChar: glyph(old),
            delay: `${index * STAGGER_MS}ms`,
          };
        }
        return { key: `${index}:${raw}`, char, outChar: null, delay: null };
      });
    },
  });
}

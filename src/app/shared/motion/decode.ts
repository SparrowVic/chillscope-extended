import { DestroyRef, Directive, DOCUMENT, ElementRef, inject, input } from '@angular/core';

/** Industrial charset only — the noise must look like telemetry, not like a hacker film. */
const GLYPHS = '0123456789#/·:-';
const TICK_MS = 34;
const DURATION_MS = 460;

/**
 * One-shot decode-in for SHORT, MONOSPACE text: glyphs churn and settle left to right, as if the
 * reading were acquiring signal lock. Monospace is a hard requirement — a fixed advance width is
 * what keeps siblings from reflowing while the noise plays. The real text is exposed to
 * assistive tech the whole time through aria-label; the churn is presentation only.
 *
 * Plays once per directive lifetime (i.e. once per route entry or @for identity change), never
 * on data updates — a value that scrambles on every tick reads as instability, not liveness.
 */
@Directive({ selector: '[appDecode]', host: { '[attr.aria-label]': 'null' } })
export class CsDecode {
  /** Optional explicit text; defaults to the element's initial content. */
  readonly appDecode = input<string>('');

  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #document = inject(DOCUMENT);
  #frame: number | null = null;

  constructor() {
    const view = this.#document.defaultView;
    const reduced =
      view !== null &&
      typeof view.matchMedia === 'function' &&
      view.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      if (this.#frame !== null && view !== null) {
        view.cancelAnimationFrame(this.#frame);
      }
    });

    if (view === null || reduced || typeof view.requestAnimationFrame !== 'function') {
      return;
    }

    // Content is only reliable after the first render; one frame later is soon enough to start.
    view.requestAnimationFrame(() => {
      const target = this.appDecode() || this.#element.textContent?.trim() || '';
      if (target.length === 0 || target.length > 40) {
        return;
      }
      this.#element.setAttribute('aria-label', target);
      const start = performance.now();
      let lastTick = 0;

      const step = (now: number): void => {
        const progress = Math.min(1, (now - start) / DURATION_MS);
        if (now - lastTick >= TICK_MS || progress === 1) {
          lastTick = now;
          const settled = Math.floor(progress * target.length);
          let text = target.slice(0, settled);
          for (let index = settled; index < target.length; index += 1) {
            const source = target[index] ?? '';
            text +=
              source === ' ' ? ' ' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          }
          this.#element.textContent = text;
        }
        if (progress < 1) {
          this.#frame = view.requestAnimationFrame(step);
        } else {
          this.#element.textContent = target;
          this.#element.removeAttribute('aria-label');
          this.#frame = null;
        }
      };
      this.#frame = view.requestAnimationFrame(step);
    });
  }
}

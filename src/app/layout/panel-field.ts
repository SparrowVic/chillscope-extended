import { DOCUMENT, DestroyRef, Injectable, inject } from '@angular/core';

const CAPABILITY_QUERY =
  '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)';
/** Matches the fade the spotlight ring runs in CSS, so the vars are not cleared mid-fade. */
const CLEAR_DELAY_MS = 300;

/**
 * Every `.cs-panel` rim brightens around the pointer, painted by CSS from three custom properties
 * written here. One delegated listener pair
 * serves the whole application — no per-panel directive, no template changes; a component earns
 * the behaviour by wearing the class it already wears for its surface.
 *
 * Writes happen on pointer events (already frame-paced by the browser for mouse input) against a
 * rect cached on entry, so steady-state cost is one `setProperty` pair per moved frame and zero
 * layout reads. The rect refreshes on scroll, which is the only way a hovered panel moves.
 */
@Injectable({ providedIn: 'root' })
export class PanelFieldEngine {
  readonly #document = inject(DOCUMENT);
  #panel: HTMLElement | null = null;
  #rect: DOMRect | null = null;
  #clearTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const view = this.#document.defaultView;
    if (view === null || typeof view.matchMedia !== 'function') {
      return;
    }
    const capability = view.matchMedia(CAPABILITY_QUERY);

    const onOver = (event: Event): void => {
      if (!capability.matches) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const panel = target.closest<HTMLElement>('.cs-panel');
      if (panel === this.#panel) {
        return;
      }
      this.#release();
      if (panel !== null) {
        this.#panel = panel;
        this.#rect = panel.getBoundingClientRect();
        panel.style.setProperty('--spot-o', '1');
      }
    };

    const onMove = (event: PointerEvent): void => {
      const panel = this.#panel;
      const rect = this.#rect;
      if (panel === null || rect === null) {
        return;
      }
      panel.style.setProperty('--spot-x', `${Math.round(event.clientX - rect.left)}px`);
      panel.style.setProperty('--spot-y', `${Math.round(event.clientY - rect.top)}px`);
    };

    const onScroll = (): void => {
      if (this.#panel !== null) {
        this.#rect = this.#panel.getBoundingClientRect();
      }
    };

    this.#document.addEventListener('pointerover', onOver, { passive: true });
    this.#document.addEventListener('pointermove', onMove, { passive: true });
    this.#document.addEventListener('scroll', onScroll, { passive: true, capture: true });

    inject(DestroyRef).onDestroy(() => {
      this.#document.removeEventListener('pointerover', onOver);
      this.#document.removeEventListener('pointermove', onMove);
      this.#document.removeEventListener('scroll', onScroll, { capture: true });
      if (this.#clearTimer !== null) {
        clearTimeout(this.#clearTimer);
      }
    });
  }

  #release(): void {
    const previous = this.#panel;
    this.#panel = null;
    this.#rect = null;
    if (previous === null) {
      return;
    }
    previous.style.setProperty('--spot-o', '0');
    if (this.#clearTimer !== null) {
      clearTimeout(this.#clearTimer);
    }
    // Drop the inline vars once the fade ends, so a settled DOM carries no leftover style noise.
    this.#clearTimer = setTimeout(() => {
      previous.style.removeProperty('--spot-x');
      previous.style.removeProperty('--spot-y');
      previous.style.removeProperty('--spot-o');
      this.#clearTimer = null;
    }, CLEAR_DELAY_MS);
  }
}

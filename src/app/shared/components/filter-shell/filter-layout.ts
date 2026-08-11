import { computed, DestroyRef, Injectable, inject, signal, type Signal } from '@angular/core';

/**
 * Where a filter surface should place its one control tree:
 * - `inline`  — the desktop toolbar row, unchanged from the original design;
 * - `drawer`  — tablet: a side drawer keeps the filtered content visible beside the controls;
 * - `sheet`   — phone: a bottom sheet inside comfortable thumb reach.
 */
export type FilterShellMode = 'inline' | 'drawer' | 'sheet';

/** Phones, including large ones and landscape smalls. Matches the shell's own 640px CSS tier. */
const SHEET_QUERY = '(max-width: 640px)';
/** Tablet territory; aligns with the system strip's 1024px two-row threshold. */
const DRAWER_QUERY = '(max-width: 1024px)';

function mediaSignal(query: string, destroyRef: DestroyRef): Signal<boolean> {
  const view = typeof window === 'undefined' ? undefined : window;
  // jsdom and SSR both lack matchMedia; a static `false` degrades to the inline toolbar.
  if (view === undefined || typeof view.matchMedia !== 'function') {
    return signal(false).asReadonly();
  }
  const list = view.matchMedia(query);
  const matches = signal(list.matches);
  const onChange = (event: MediaQueryListEvent): void => matches.set(event.matches);
  list.addEventListener('change', onChange);
  destroyRef.onDestroy(() => list.removeEventListener('change', onChange));
  return matches.asReadonly();
}

/**
 * The one viewport-tier decision every adaptive filter surface shares. A service rather than a
 * per-component matchMedia so all three screens flip layout on the same thresholds — and so specs
 * can substitute a hand-driven mode without stubbing matchMedia.
 */
@Injectable({ providedIn: 'root' })
export class FilterLayout {
  readonly #destroyRef = inject(DestroyRef);
  readonly #sheet = mediaSignal(SHEET_QUERY, this.#destroyRef);
  readonly #drawer = mediaSignal(DRAWER_QUERY, this.#destroyRef);

  readonly mode: Signal<FilterShellMode> = computed(() =>
    this.#sheet() ? 'sheet' : this.#drawer() ? 'drawer' : 'inline',
  );
}

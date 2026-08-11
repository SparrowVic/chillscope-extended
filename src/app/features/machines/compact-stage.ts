import { DOCUMENT, DestroyRef, inject, signal, type Signal } from '@angular/core';

/**
 * The one breakpoint of the Machines workspace. At and above 900px the screen is a true two-pane
 * master–detail; below 900px the library and editor become stages the user navigates between,
 * the editor tabs wear the segmented grammar and the save/revert docks pin above the mobile
 * navigation reserve. The editor's tab semantics historically keyed on this same query, so every
 * adaptive consumer here flips on one line, never on a private width.
 */
export const MACHINES_WIDE_QUERY = '(min-width: 900px)';

/**
 * `true` while the Machines workspace is in its compact (staged) mode. Without `matchMedia`
 * (jsdom) the signal stays `false`, so specs exercise the two-pane contract by default and opt
 * into the compact one by stubbing the query.
 */
export function injectCompactStage(): Signal<boolean> {
  const documentRef = inject(DOCUMENT);
  const destroyRef = inject(DestroyRef);
  const compact = signal(false);

  const mediaQuery = documentRef.defaultView?.matchMedia?.(MACHINES_WIDE_QUERY);
  if (mediaQuery !== undefined) {
    const update = ({ matches }: Pick<MediaQueryList, 'matches'>): void => compact.set(!matches);
    const onChange = (event: MediaQueryListEvent): void => update(event);

    update(mediaQuery);
    mediaQuery.addEventListener('change', onChange);
    destroyRef.onDestroy(() => mediaQuery.removeEventListener('change', onChange));
  }

  return compact.asReadonly();
}

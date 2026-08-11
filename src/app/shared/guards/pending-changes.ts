import type { CanDeactivateFn } from '@angular/router';

/** Route components with a local draft expose one synchronous decision point to the router. */
export interface PendingChangesAware {
  canDeactivate(): boolean;
}

export const pendingChangesGuard: CanDeactivateFn<PendingChangesAware> = (component) =>
  component.canDeactivate();

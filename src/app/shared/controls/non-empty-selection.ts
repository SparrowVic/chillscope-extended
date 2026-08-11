import { linkedSignal, type Signal } from '@angular/core';

export interface NonEmptySelection<T> {
  /** Bind this to the control, not the source: it is what pushes a refused change back. */
  readonly picked: Signal<T[]>;
  /** Returns the accepted selection, or `undefined` when the change was refused. */
  commit(next: T[]): T[] | undefined;
}

/**
 * A picker that must never reach an empty selection — with no series there is nothing to query, so
 * clearing the last option snaps back instead of emptying the screen. The signal is what makes the
 * snap-back visible: PrimeNG keeps its own copy of the value, and only a fresh array identity makes
 * it take ours.
 */
export function nonEmptySelection<T>(source: Signal<readonly T[]>): NonEmptySelection<T> {
  const picked = linkedSignal<readonly T[], T[]>({
    source,
    computation: (values) => [...values],
  });

  return {
    picked,
    commit(next: T[]): T[] | undefined {
      if (next.length === 0) {
        picked.set([...source()]);
        return undefined;
      }
      picked.set(next);
      return next;
    },
  };
}

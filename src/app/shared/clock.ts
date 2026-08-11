import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, type Signal, signal } from '@angular/core';

/**
 * A coarse wall clock as a signal. Anything that renders "how long ago" or bounds a date picker at
 * "today" needs to notice that time passed — this is a monitoring view that stays open for hours,
 * and a `new Date()` captured at construction quietly goes stale.
 */
export function injectClock(intervalMs: number): Signal<number> {
  const now = signal(Date.now());
  const document = inject(DOCUMENT);
  let handle: ReturnType<typeof setInterval> | undefined;

  const stop = (): void => {
    if (handle !== undefined) {
      clearInterval(handle);
      handle = undefined;
    }
  };
  const start = (): void => {
    if (handle === undefined) {
      handle = setInterval(() => now.set(Date.now()), intervalMs);
    }
  };
  const onVisibility = (): void => {
    if (document.hidden) {
      stop();
      return;
    }
    now.set(Date.now());
    start();
  };

  if (!document.hidden) {
    start();
  }
  document.addEventListener('visibilitychange', onVisibility);
  inject(DestroyRef).onDestroy(() => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
  });
  return now.asReadonly();
}

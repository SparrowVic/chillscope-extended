import { linkedSignal, type Signal } from '@angular/core';
import type { HttpResourceRef } from '@angular/common/http';

interface Hold<T> {
  readonly pending: boolean;
  readonly value: T;
}

/**
 * A resource drops its value the moment its request changes, so anything rendering it blinks empty
 * for the whole round trip every time a filter moves. This holds the previous answer until the next
 * one arrives — the shape every facade in `core/data` needs, stated once.
 *
 * `hasValue()` is not defensive noise: reading `value()` on an errored resource throws, and that
 * surfaces as an unhandled `ResourceValueError`. The error itself is what the view renders instead,
 * so the fallback stands in only for the frame the hold cannot cover.
 */
export function heldValue<T>(resource: HttpResourceRef<T>, fallback: T): Signal<T> {
  return linkedSignal<Hold<T>, T>({
    source: () => ({
      pending: resource.isLoading() || resource.error() !== undefined,
      value: resource.hasValue() ? resource.value() : fallback,
    }),
    computation: (next, previous) =>
      next.pending && previous !== undefined ? previous.value : next.value,
  });
}

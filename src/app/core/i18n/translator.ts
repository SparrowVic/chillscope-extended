import { computed, inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';

/**
 * Text handed to a consumer that cannot use the pipe — the chart canvas and PrimeNG's own
 * translation table above all. `selectTranslation()` emits only once the active language file is
 * in memory, which keeps raw keys from reaching the consumer on the first paint.
 */
export function injectTranslator(): Signal<(key: string) => string> {
  const transloco = inject(TranslocoService);
  const translation = toSignal(transloco.selectTranslation());

  return computed(() => {
    const loaded = translation() !== undefined;
    return (key: string) => (loaded ? transloco.translate<string>(key) : key);
  });
}

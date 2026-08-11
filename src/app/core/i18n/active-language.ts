import { computed, inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';

import { type AppLanguage, toAppLanguage } from './transloco.config';

/**
 * Transloco exposes the active language as an observable only, so anything that needs it inside
 * the reactive graph — `Intl` formatting above all — goes through this bridge.
 */
export function injectActiveLanguage(): Signal<AppLanguage> {
  const transloco = inject(TranslocoService);
  const lang = toSignal(transloco.langChanges$, { initialValue: transloco.getActiveLang() });
  return computed(() => toAppLanguage(lang()));
}

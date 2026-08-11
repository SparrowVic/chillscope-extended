import { computed, inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';

export interface SelectOption<T> {
  readonly value: T;
  /** Translation key, not a display string. */
  readonly label: string;
  readonly disabled?: boolean;
}

export interface TranslatedSelectOption<T> extends SelectOption<T> {
  readonly text: string;
}

/**
 * PrimeNG reads `optionLabel` straight off the option object, so option labels cannot go through
 * the transloco pipe. Waiting for `selectTranslation()` rather than `langChanges$` keeps raw keys
 * from flashing while the next language file is still downloading.
 */
export function translateOptions<T>(
  options: Signal<readonly SelectOption<T>[]>,
): Signal<TranslatedSelectOption<T>[]> {
  const transloco = inject(TranslocoService);
  const translation = toSignal(transloco.selectTranslation());

  return computed(() => {
    const loaded = translation() !== undefined;
    return options().map((option) => ({
      ...option,
      text: loaded ? transloco.translate<string>(option.label) : option.label,
    }));
  });
}

import { inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';

/** An error stays long enough to be read twice; a confirmation only has to be noticed. */
const TOAST_LIFE_MS = 3_000;
const ERROR_TOAST_LIFE_MS = 5_000;

export interface Toasts {
  /** A confirmation of something the user just did. */
  success(titleKey: string): void;
  /** Something did not go through, but the screen is still usable. */
  warn(titleKey: string): void;
  /** A failure worth a second line — the persistence toasts carry one. */
  error(titleKey: string, messageKey?: string): void;
}

/**
 * The toast vocabulary the app actually uses: three severities, translation keys rather than
 * strings, and the one lifetime rule. Six components each carried their own `#notify` plus a
 * private lifetime constant, and two of them disagreed on argument order.
 *
 * Deliberately not a general wrapper over `MessageService` — anything needing a sticky toast, a
 * key or a custom life should reach for the service itself rather than grow this.
 */
export function injectToast(): Toasts {
  const messages = inject(MessageService);
  const transloco = inject(TranslocoService);

  return {
    success: (titleKey) =>
      messages.add({
        severity: 'success',
        summary: transloco.translate(titleKey),
        life: TOAST_LIFE_MS,
      }),
    warn: (titleKey) =>
      messages.add({
        severity: 'warn',
        summary: transloco.translate(titleKey),
        life: TOAST_LIFE_MS,
      }),
    error: (titleKey, messageKey) =>
      messages.add({
        severity: 'error',
        summary: transloco.translate(titleKey),
        detail: messageKey === undefined ? undefined : transloco.translate(messageKey),
        life: ERROR_TOAST_LIFE_MS,
      }),
  };
}

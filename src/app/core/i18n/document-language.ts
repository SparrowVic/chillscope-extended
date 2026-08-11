import {
  DOCUMENT,
  effect,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
  type EnvironmentProviders,
} from '@angular/core';

import { injectActiveLanguage } from './active-language';

/**
 * `<html lang>` is what screen readers use to pick a pronunciation, so it has to follow the
 * language actually rendered rather than the one baked into index.html.
 */
export function provideDocumentLanguage(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      const documentRef = inject(DOCUMENT);
      const language = injectActiveLanguage();

      effect(() => {
        documentRef.documentElement.lang = language();
      });
    }),
  ]);
}

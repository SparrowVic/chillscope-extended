import { type EnvironmentProviders, isDevMode, makeEnvironmentProviders } from '@angular/core';
import { provideTransloco } from '@jsverse/transloco';

import { provideDocumentLanguage } from './document-language';
import { providePrimeNgTranslation } from './primeng-translation';
import { TranslocoHttpLoader } from './transloco.loader';

export const APP_LANGUAGES = ['pl', 'en'] as const;

export type AppLanguage = (typeof APP_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: AppLanguage = 'pl';

export function isAppLanguage(value: unknown): value is AppLanguage {
  return APP_LANGUAGES.includes(value as AppLanguage);
}

export function toAppLanguage(value: unknown): AppLanguage {
  return isAppLanguage(value) ? value : DEFAULT_LANGUAGE;
}

export function provideAppTransloco(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideTransloco({
      config: {
        availableLangs: [...APP_LANGUAGES],
        defaultLang: DEFAULT_LANGUAGE,
        fallbackLang: DEFAULT_LANGUAGE,
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
        missingHandler: { useFallbackTranslation: true },
      },
      loader: TranslocoHttpLoader,
    }),
    // Anything that renders text outside Transloco's reach has to be told about the active
    // language explicitly, so both bridges ship with the setup instead of being opt-in.
    provideDocumentLanguage(),
    providePrimeNgTranslation(),
  ]);
}

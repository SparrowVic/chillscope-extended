import type { EnvironmentProviders, Provider } from '@angular/core';
import { TRANSLOCO_LOADER, type Translation, type TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';

import { provideAppTransloco } from '../core/i18n/transloco.config';

/** A catalogue, or a function of the requested language for specs that assert switching. */
export type TestCatalogue = Translation | ((language: string) => Translation);

/**
 * The real Transloco wiring plus a loader that answers from memory — the provider pair every
 * component spec repeats. Only the catalogue differs between them, so only the catalogue is a
 * parameter; PrimeNG, HTTP and store doubles stay explicit at each call site because those ARE
 * the thing under test.
 *
 * This file is compiled as application code (`tsconfig.app.json` covers `src/**\/*.ts`), so it
 * must not reach into `@angular/core/testing`. Nothing in the app imports it, so it is tree-shaken.
 */
export function provideTestTransloco(
  catalogue: TestCatalogue = {},
): (Provider | EnvironmentProviders)[] {
  const resolve = typeof catalogue === 'function' ? catalogue : () => catalogue;
  const loader: TranslocoLoader = { getTranslation: (language: string) => of(resolve(language)) };

  return [provideAppTransloco(), { provide: TRANSLOCO_LOADER, useValue: loader }];
}

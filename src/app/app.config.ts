import {
  type ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  isDevMode,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';
import { providePrimeNG } from 'primeng/config';

import { ChillscopePreset } from './theme/chillscope-preset';
import { fakeBackendInterceptor } from './core/simulation/fake-backend.interceptor';
import { provideAppTransloco } from './core/i18n/transloco.config';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
      // Route changes ride the View Transitions API where it exists: the strip and navigation
      // carry their own view-transition-name so they stay put while #main-content plays a
      // shared-axis move (styles.css §8). Elsewhere the plain cs-route-enter fallback runs.
      withViewTransitions(),
    ),
    provideHttpClient(withInterceptors([fakeBackendInterceptor])),
    provideAppTransloco(),
    providePrimeNG({
      ripple: true,
      // The stacking ladder of the mobile shell: navigation 100 < the adaptive filter dialog
      // 1150/1151 (filter-shell.css) < PrimeNG floating panels < toast/confirm. Without this,
      // a select opened INSIDE the filter sheet would paint underneath it, and a toast could
      // sink below the sheet's backdrop.
      zIndex: { modal: 1300, overlay: 1250, menu: 1250, tooltip: 1350 },
      theme: {
        preset: ChillscopePreset,
        options: {
          darkModeSelector: '.app-dark',
          cssLayer: {
            name: 'primeng',
            order: 'theme, base, primeng',
          },
        },
      },
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};

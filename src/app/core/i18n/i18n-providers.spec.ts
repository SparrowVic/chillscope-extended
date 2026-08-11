import { provideHttpClient } from '@angular/common/http';
import { ApplicationInitStatus, DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TRANSLOCO_LOADER, TranslocoService, type TranslocoLoader } from '@jsverse/transloco';
import { PrimeNG, providePrimeNG } from 'primeng/config';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { provideAppTransloco } from './transloco.config';

const CATALOGUES: Readonly<Record<string, Record<string, string>>> = {
  pl: {
    'primeng.dayNamesMin': 'Nd Pn Wt Śr Cz Pt So',
    'primeng.dateFormat': 'dd.mm.yy',
    'primeng.firstDayOfWeek': '1',
  },
  en: {
    'primeng.dayNamesMin': 'Su Mo Tu We Th Fr Sa',
    'primeng.dateFormat': 'mm/dd/yy',
    'primeng.firstDayOfWeek': '0',
  },
};

class StubLoader implements TranslocoLoader {
  getTranslation(lang: string) {
    return of(CATALOGUES[lang] ?? {});
  }
}

describe('i18n providers', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideAppTransloco(),
        providePrimeNG({}),
        { provide: TRANSLOCO_LOADER, useClass: StubLoader },
      ],
    });

    // TestBed runs the app initializers — where both bridges live — on the first injection.
    TestBed.inject(ApplicationInitStatus);
    TestBed.tick();
  });

  it('mirrors the active language onto <html lang>', () => {
    const documentRef = TestBed.inject(DOCUMENT);
    expect(documentRef.documentElement.lang).toBe('pl');

    TestBed.inject(TranslocoService).setActiveLang('en');
    TestBed.tick();

    expect(documentRef.documentElement.lang).toBe('en');
  });

  it('teaches PrimeNG the active language', () => {
    const primeng = TestBed.inject(PrimeNG);
    expect(primeng.getTranslation('monthNames')[0]).toBe('styczeń');
    expect(primeng.getTranslation('firstDayOfWeek')).toBe(1);
    expect(primeng.getTranslation('dateFormat')).toBe('dd.mm.yy');

    TestBed.inject(TranslocoService).setActiveLang('en');
    TestBed.tick();

    expect(primeng.getTranslation('monthNames')[0]).toBe('January');
    expect(primeng.getTranslation('firstDayOfWeek')).toBe(0);
  });
});

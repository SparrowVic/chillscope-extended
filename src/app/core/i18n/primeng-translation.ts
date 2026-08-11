import {
  effect,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
  type EnvironmentProviders,
} from '@angular/core';
import type { Translation } from 'primeng/api';
import { PrimeNG } from 'primeng/config';

import { injectActiveLanguage } from './active-language';
import { injectTranslator } from './translator';

type Translate = (key: string) => string;

/** 1 January 2023 was a Sunday, and PrimeNG indexes day names from Sunday. */
const FIRST_SUNDAY_UTC = Date.UTC(2023, 0, 1);

const DAY_COUNT = 7;
const MONTH_COUNT = 12;

function dayNames(locale: string, weekday: 'long' | 'short'): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday, timeZone: 'UTC' });
  return Array.from({ length: DAY_COUNT }, (_, day) =>
    format.format(FIRST_SUNDAY_UTC + day * 24 * 60 * 60 * 1000),
  );
}

function monthNames(locale: string, month: 'long' | 'short'): string[] {
  const format = new Intl.DateTimeFormat(locale, { month, timeZone: 'UTC' });
  return Array.from({ length: MONTH_COUNT }, (_, index) => format.format(Date.UTC(2023, index, 1)));
}

/**
 * Day and month names come from `Intl` rather than the catalogue: they are pure locale data, and
 * hand-copying 38 strings per language only creates something that can drift. The two-letter
 * column headers stay in the catalogue because `Intl`'s narrow form is ambiguous in Polish
 * (Monday and Friday both narrow to "P").
 */
export function buildPrimeNgTranslation(locale: string, translate: Translate): Translation {
  return {
    dayNames: dayNames(locale, 'long'),
    dayNamesShort: dayNames(locale, 'short'),
    dayNamesMin: translate('primeng.dayNamesMin').split(' '),
    monthNames: monthNames(locale, 'long'),
    monthNamesShort: monthNames(locale, 'short'),
    dateFormat: translate('primeng.dateFormat'),
    firstDayOfWeek: Number(translate('primeng.firstDayOfWeek')),
    today: translate('common.today'),
    clear: translate('common.clear'),
    apply: translate('common.apply'),
    accept: translate('common.yes'),
    reject: translate('common.no'),
    chooseDate: translate('primeng.chooseDate'),
    chooseMonth: translate('primeng.chooseMonth'),
    chooseYear: translate('primeng.chooseYear'),
    prevMonth: translate('primeng.prevMonth'),
    nextMonth: translate('primeng.nextMonth'),
    prevYear: translate('primeng.prevYear'),
    nextYear: translate('primeng.nextYear'),
    prevDecade: translate('primeng.prevDecade'),
    nextDecade: translate('primeng.nextDecade'),
    prevHour: translate('primeng.prevHour'),
    nextHour: translate('primeng.nextHour'),
    prevMinute: translate('primeng.prevMinute'),
    nextMinute: translate('primeng.nextMinute'),
    prevSecond: translate('primeng.prevSecond'),
    nextSecond: translate('primeng.nextSecond'),
    emptyMessage: translate('common.noResults'),
    emptyFilterMessage: translate('common.noResults'),
    emptySearchMessage: translate('common.noResults'),
    emptySelectionMessage: translate('primeng.emptySelection'),
    // PrimeNG interpolates its own {0} placeholder here, not Transloco's {{ }}.
    selectionMessage: translate('primeng.selection'),
    aria: {
      close: translate('common.close'),
      selectAll: translate('common.selectAll'),
      unselectAll: translate('common.clearAll'),
      firstPageLabel: translate('table.first'),
      lastPageLabel: translate('table.last'),
      nextPageLabel: translate('table.next'),
      prevPageLabel: translate('table.previous'),
      previousPageLabel: translate('table.previous'),
      rowsPerPageLabel: translate('table.rowsPerPage'),
      jumpToPageDropdownLabel: translate('table.page'),
      jumpToPageInputLabel: translate('table.page'),
    },
  };
}

/**
 * PrimeNG keeps its own catalogue — month names, paginator labels, every `aria.*` string — and
 * without this bridge it answers in English no matter which language the application renders.
 */
export function providePrimeNgTranslation(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      const primeng = inject(PrimeNG);
      const language = injectActiveLanguage();
      const translator = injectTranslator();

      effect(() => {
        primeng.setTranslation(buildPrimeNgTranslation(language(), translator()));
      });
    }),
  ]);
}

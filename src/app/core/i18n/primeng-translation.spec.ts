import { describe, expect, it } from 'vitest';

import { buildPrimeNgTranslation } from './primeng-translation';

const CATALOGUE: Readonly<Record<string, string>> = {
  'primeng.dayNamesMin': 'Nd Pn Wt Śr Cz Pt So',
  'primeng.dateFormat': 'dd.mm.yy',
  'primeng.firstDayOfWeek': '1',
  'primeng.nextHour': 'Następna godzina',
  'table.first': 'Pierwsza strona',
  'table.previous': 'Poprzednia strona',
};

const translate = (key: string): string => CATALOGUE[key] ?? key;

describe('buildPrimeNgTranslation', () => {
  it('derives day and month names from the requested locale', () => {
    const translation = buildPrimeNgTranslation('pl', translate);

    expect(translation.dayNames?.[1]).toBe('poniedziałek');
    expect(translation.monthNames?.[0]).toBe('styczeń');
    expect(translation.monthNamesShort).toHaveLength(12);
    expect(buildPrimeNgTranslation('en', translate).monthNames?.[0]).toBe('January');
  });

  it('starts the week on the day the catalogue asks for', () => {
    expect(buildPrimeNgTranslation('pl', translate).firstDayOfWeek).toBe(1);
  });

  it('splits the column headers into one label per day', () => {
    expect(buildPrimeNgTranslation('pl', translate).dayNamesMin).toEqual([
      'Nd',
      'Pn',
      'Wt',
      'Śr',
      'Cz',
      'Pt',
      'So',
    ]);
  });

  it('localizes the time-picker controls', () => {
    expect(buildPrimeNgTranslation('pl', translate).nextHour).toBe('Następna godzina');
  });

  it('names the paginator controls', () => {
    const aria = buildPrimeNgTranslation('pl', translate).aria;

    expect(aria?.firstPageLabel).toBe('Pierwsza strona');
    expect(aria?.prevPageLabel).toBe('Poprzednia strona');
    expect(aria?.previousPageLabel).toBe('Poprzednia strona');
  });
});

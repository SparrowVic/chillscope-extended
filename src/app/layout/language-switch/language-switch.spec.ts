import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../assets/i18n/en.json';
import pl from '../../../assets/i18n/pl.json';
import type { AppLanguage } from '../../core/i18n/transloco.config';
import { provideTestTransloco } from '../../testing/transloco';
import { SettingsStore } from '../../core/settings/settings.store';
import { LanguageSwitch } from './language-switch';

const LANGUAGE = signal<AppLanguage>('pl');
const SET_LANGUAGE = vi.fn((language: AppLanguage): void => LANGUAGE.set(language));

function render(): ComponentFixture<LanguageSwitch> {
  const fixture = TestBed.createComponent(LanguageSwitch);
  fixture.detectChanges();
  return fixture;
}

describe('LanguageSwitch', () => {
  beforeEach(() => {
    LANGUAGE.set('pl');
    SET_LANGUAGE.mockClear();
    TestBed.configureTestingModule({
      providers: [
        ...provideTestTransloco((language: string) => language === 'en' ? en : pl),
        {
          provide: SettingsStore,
          useValue: { language: LANGUAGE.asReadonly(), setLanguage: SET_LANGUAGE },
        },
      ],
    });
  });

  it('renders localized language choices as a named native button group', () => {
    const element = render().nativeElement as HTMLElement;
    const group = element.querySelector('[role="group"]');
    const buttons = [...element.querySelectorAll<HTMLButtonElement>('button')];

    expect(group?.getAttribute('aria-labelledby')).toBe('language-switch-label');
    expect(element.querySelector('#language-switch-label')?.textContent?.trim()).toBe('Język');
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(['PL', 'EN']);
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Polski',
      'Angielski',
    ]);
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
  });

  it('persists the selection and mirrors it into Transloco', () => {
    const fixture = render();
    const buttons = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ];

    buttons[1]?.click();
    fixture.detectChanges();
    TestBed.tick();

    expect(SET_LANGUAGE).toHaveBeenCalledWith('en');
    expect(TestBed.inject(TranslocoService).getActiveLang()).toBe('en');
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });
});

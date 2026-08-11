import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../assets/i18n/en.json';
import pl from '../../../assets/i18n/pl.json';
import { provideTestTransloco } from '../../testing/transloco';
import { SettingsStore, type ThemeMode } from '../../core/settings/settings.store';
import { ThemeSwitch } from './theme-switch';

const THEME = signal<ThemeMode>('light');
const SET_THEME = vi.fn((theme: ThemeMode): void => THEME.set(theme));

function render(): ComponentFixture<ThemeSwitch> {
  const fixture = TestBed.createComponent(ThemeSwitch);
  fixture.detectChanges();
  return fixture;
}

describe('ThemeSwitch', () => {
  beforeEach(() => {
    THEME.set('light');
    SET_THEME.mockClear();
    TestBed.configureTestingModule({
      providers: [
        ...provideTestTransloco((language: string) => language === 'en' ? en : pl),
        {
          provide: SettingsStore,
          useValue: { theme: THEME.asReadonly(), setTheme: SET_THEME },
        },
      ],
    });
  });

  it('renders a named group of native toggle buttons', () => {
    const element = render().nativeElement as HTMLElement;
    const group = element.querySelector('[role="group"]');
    const buttons = [...element.querySelectorAll<HTMLButtonElement>('button')];

    expect(group?.getAttribute('aria-labelledby')).toBe('theme-switch-label');
    expect(element.querySelector('#theme-switch-label')?.textContent?.trim()).toBe('Motyw');
    expect(buttons.map((button) => button.type)).toEqual(['button', 'button']);
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['Jasny', 'Ciemny']);
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
  });

  it('writes the selected theme through the settings store', () => {
    const fixture = render();
    const buttons = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ];

    buttons[1]?.click();
    fixture.detectChanges();

    expect(SET_THEME).toHaveBeenCalledWith('dark');
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });
});

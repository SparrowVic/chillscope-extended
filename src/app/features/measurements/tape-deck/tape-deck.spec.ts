import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { providePrimeNG } from 'primeng/config';
import { beforeEach, describe, expect, it } from 'vitest';

import { MeasurementsFacade } from '../../../core/data/measurements.facade';
import { provideTestTransloco } from '../../../testing/transloco';
import { TapeDeck } from './tape-deck';

const TRANSLATIONS: Readonly<Record<string, string>> = {
  'measurements.deck.title': 'Taśmy serii',
  'live.short': 'Na żywo',
};

describe('TapeDeck', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideTestTransloco(TRANSLATIONS),
        providePrimeNG({}),
      ],
    });
  });

  it('renders the deck section with its title and the live switch', () => {
    const fixture = TestBed.createComponent(TapeDeck);
    fixture.detectChanges();
    const deck = fixture.nativeElement as HTMLElement;

    expect(deck.querySelector('section')?.getAttribute('aria-label')).toBe('Taśmy serii');
    expect(deck.querySelector('.tape-deck__title')?.textContent?.trim()).toBe('Taśmy serii');
    expect(deck.querySelector('cs-switch')).not.toBeNull();
  });

  it('stops the screen consumer without clearing the session live preference', () => {
    const fixture = TestBed.createComponent(TapeDeck);
    fixture.detectChanges();
    const facade = TestBed.inject(MeasurementsFacade);

    facade.setLiveEnabled(true);
    expect(facade.liveEnabled()).toBe(true);

    fixture.destroy();
    expect(facade.liveEnabled()).toBe(true);
  });
});

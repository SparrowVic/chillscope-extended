import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTransloco, TranslocoTestingModule } from '@jsverse/transloco';
import { providePrimeNG } from 'primeng/config';
import { beforeEach, describe, expect, it } from 'vitest';

import { CsInputNumber } from './input-number';

@Component({
  imports: [CsInputNumber],
  template: `
    <cs-input-number label="decimal" [value]="1.5" />
    <cs-input-number label="integer" inputMode="numeric" [value]="2" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class InputNumberHost {}

describe('CsInputNumber', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideTransloco({ config: { availableLangs: ['en'], defaultLang: 'en' } }),
        providePrimeNG({}),
      ],
      imports: [TranslocoTestingModule],
    });
  });

  it('requests the keyboard that matches the value domain', async () => {
    const fixture = TestBed.createComponent(InputNumberHost);
    fixture.detectChanges();
    await fixture.whenStable();

    const inputs = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>(
        '.p-inputnumber-input',
      ),
    ];

    expect(inputs.map((input) => input.inputMode)).toEqual(['decimal', 'numeric']);
  });
});

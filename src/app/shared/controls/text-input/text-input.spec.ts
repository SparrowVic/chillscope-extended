import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, FormField, required } from '@angular/forms/signals';
import { providePrimeNG } from 'primeng/config';
import { beforeEach, describe, expect, it } from 'vitest';

import { provideTestTransloco } from '../../../testing/transloco';
import { CsTextInput } from './text-input';

@Component({
  imports: [CsTextInput, FormField],
  template: `<cs-text-input label="machines.form.name" [formField]="form.name" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly model = signal({ name: 'K-207' });
  readonly form = form(this.model, (machine) => {
    required(machine.name);
  });
}

describe('CsTextInput', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...provideTestTransloco({ 'machines.form.name': 'Nazwa' }), providePrimeNG({})],
    });
  });

  it('binds as a Signal Forms value control host', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('K-207');

    input.value = 'K-208';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.model().name).toBe('K-208');
  });
});

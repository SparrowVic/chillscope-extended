import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { form, FormField } from '@angular/forms/signals';
import { TranslocoService } from '@jsverse/transloco';
import { providePrimeNG } from 'primeng/config';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../assets/i18n/en.json';
import pl from '../../../../assets/i18n/pl.json';
import { provideTestTransloco } from '../../../testing/transloco';
import { CsMultiSelect } from './multi-select';

interface HostModel {
  series: string[];
}

@Component({
  imports: [CsMultiSelect, FormField],
  template: `
    <cs-multi-select
      label="series.label"
      [formField]="form.series"
      [options]="options"
      [maxSelectedLabels]="1"
      [showToggleAll]="showToggleAll()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly model = signal<HostModel>({ series: ['temperature', 'pressure'] });
  readonly form = form(this.model);
  readonly showToggleAll = signal(true);
  readonly options = [
    { value: 'temperature', label: 'series.temperature' },
    { value: 'pressure', label: 'series.pressure' },
  ];
}

describe('CsMultiSelect', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(
        (media: string): MediaQueryList =>
          ({
            matches: false,
            media,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(() => true),
          }) as unknown as MediaQueryList,
      ),
    );
    TestBed.configureTestingModule({
      providers: [
        ...provideTestTransloco((language) => (language === 'pl' ? pl : en)),
        providePrimeNG({}),
      ],
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  async function render(): Promise<{
    readonly fixture: ComponentFixture<Host>;
    readonly host: Host;
  }> {
    TestBed.inject(TranslocoService).setActiveLang('en');
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.p-multiselect')?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    return { fixture, host: fixture.componentInstance };
  }

  it('shows a visible localized label for the built-in toggle-all checkbox', async () => {
    const { fixture } = await render();
    const label = document.body.querySelector<HTMLLabelElement>('.cs-multiselect__toggle-label');
    const checkbox = label?.htmlFor ? document.getElementById(label.htmlFor) : null;
    const selection = (fixture.nativeElement as HTMLElement).querySelector('.p-multiselect-label');

    expect(label?.textContent?.trim()).toBe('All');
    expect(selection?.textContent?.trim()).toBe('2 items selected');
    expect(checkbox).toBeInstanceOf(HTMLInputElement);
    expect(checkbox?.getAttribute('aria-labelledby')).toBe(label?.id);

    TestBed.inject(TranslocoService).setActiveLang('pl');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(label?.textContent?.trim()).toBe('Wszystkie');
    expect(selection?.textContent?.trim()).toBe('Wybrane pozycje: 2');
  });

  it('keeps the accessible combobox focusable without invoking a touch keyboard', async () => {
    const { fixture } = await render();
    const combobox = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '.p-hidden-accessible input[role="combobox"]',
    );

    expect(combobox?.readOnly).toBe(true);
    expect(combobox?.inputMode).toBe('none');
    expect(combobox?.autocomplete).toBe('off');
    expect(combobox?.tabIndex).toBe(0);
    expect(document.activeElement).toBe(combobox);
  });

  it('keeps selection behavior inside the PrimeNG checkbox', async () => {
    const { host } = await render();
    const label = document.body.querySelector<HTMLLabelElement>('.cs-multiselect__toggle-label');

    label?.click();

    expect(host.model().series).toEqual([]);
  });

  it('removes the toggle label together with the toggle-all affordance', async () => {
    const { fixture, host } = await render();
    host.showToggleAll.set(false);
    fixture.detectChanges();

    expect(document.body.querySelector('.cs-multiselect__toggle-label')).toBeNull();
  });
});

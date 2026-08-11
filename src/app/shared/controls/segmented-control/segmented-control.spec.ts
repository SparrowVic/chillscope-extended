import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { disabled, form, FormField, schema } from '@angular/forms/signals';
import { provideTransloco, TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';

import { CsSegmentedControl, type SegmentedControlOption } from './segmented-control';

type Mode = 'automatic' | 'manual';

interface SegmentedModel {
  mode: Mode;
}

@Component({
  selector: 'cs-segmented-control-host',
  imports: [CsSegmentedControl, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <cs-segmented-control label="mode" [formField]="form.mode" [options]="options" /> `,
})
class SegmentedControlHost {
  readonly model = signal<SegmentedModel>({ mode: 'automatic' });
  readonly isDisabled = signal(false);
  readonly form = form(
    this.model,
    schema<SegmentedModel>((model) => {
      disabled(model.mode, () => this.isDisabled());
    }),
  );
  readonly options: readonly SegmentedControlOption<Mode>[] = [
    { value: 'automatic', label: 'automatic' },
    { value: 'manual', label: 'manual' },
  ];
}

describe('CsSegmentedControl', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideTransloco({ config: { availableLangs: ['en'], defaultLang: 'en' } })],
      imports: [TranslocoTestingModule],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(SegmentedControlHost);
    fixture.detectChanges();
    return { fixture, host: fixture.componentInstance };
  }

  it('exposes one labelled pressed option', () => {
    const { fixture } = render();
    const group = (fixture.nativeElement as HTMLElement).querySelector('[role="group"]');
    const buttons = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ];

    expect(group?.getAttribute('aria-labelledby')).toBeTruthy();
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
  });

  it('writes a picked segment through the Signal Forms contract', () => {
    const { fixture, host } = render();
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      'button',
    );

    buttons[1]?.click();

    expect(host.model().mode).toBe('manual');
    expect(host.form.mode().dirty()).toBe(true);
  });

  it('reports touched when focus leaves the control', () => {
    const { fixture, host } = render();
    const group = (fixture.nativeElement as HTMLElement).querySelector('[role="group"]');

    group?.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));

    expect(host.form.mode().touched()).toBe(true);
  });

  it('disables every segment through the shared control input', () => {
    const { fixture, host } = render();
    host.isDisabled.set(true);
    fixture.detectChanges();

    const buttons = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ];
    expect(buttons.every((button) => button.disabled)).toBe(true);
  });
});

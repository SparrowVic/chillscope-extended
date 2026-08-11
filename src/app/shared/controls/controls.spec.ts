import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { form, FormField, required, schema } from '@angular/forms/signals';
import { provideTransloco, TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';

import { CsSelect } from './select/select';
import { CsSwitch } from './switch/switch';

interface Preferences {
  colour: string;
  notify: boolean;
}

const preferencesSchema = schema<Preferences>((preferences) => {
  required(preferences.colour);
});

/**
 * `FormField` is what binds Signal Forms to the control layer, and until this spec existed only the
 * Settings screen exercised it — `CsSwitch`, the codebase's one `FormCheckboxControl`, not at all.
 */
@Component({
  selector: 'cs-controls-host',
  imports: [CsSelect, CsSwitch, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <cs-select
      ariaLabel="colour"
      ariaDescribedBy="colour-help"
      appendTo="body"
      label="colour"
      [formField]="form.colour"
      [options]="options"
    />
    <span id="colour-help">colour hint</span>
    <cs-switch label="notify" [formField]="form.notify" />
  `,
})
class ControlsHost {
  readonly model = signal<Preferences>({ colour: 'red', notify: false });
  readonly form = form(this.model, preferencesSchema);
  readonly options = [
    { value: 'red', label: 'red' },
    { value: 'blue', label: 'blue' },
  ];
}

describe('the control layer bound through FormField', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideTransloco({ config: { availableLangs: ['en'], defaultLang: 'en' } })],
      imports: [TranslocoTestingModule],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(ControlsHost);
    fixture.detectChanges();
    return {
      fixture,
      host: fixture.componentInstance,
      select: fixture.debugElement.query(By.directive(CsSelect))
        .componentInstance as CsSelect<string>,
      toggle: fixture.debugElement.query(By.directive(CsSwitch)).componentInstance as CsSwitch,
    };
  }

  it('pushes the model value into the value control', () => {
    expect(render().select.value()).toBe('red');
  });

  it('pushes the model value into the checkbox control', () => {
    expect(render().toggle.checked()).toBe(false);
  });

  it('writes a value change back into the model', () => {
    const { host, select } = render();
    select.value.set('blue');
    expect(host.model().colour).toBe('blue');
    expect(host.form.colour().dirty()).toBe(true);
  });

  it('writes a checkbox change back into the model', () => {
    const { host, toggle } = render();
    toggle.checked.set(true);
    expect(host.model().notify).toBe(true);
  });

  it('carries the required metadata from the schema down to the control', () => {
    const { select, toggle } = render();
    expect(select.required()).toBe(true);
    expect(toggle.required()).toBe(false);
  });

  it('reports touched back up to the field', () => {
    const { host, select } = render();
    expect(host.form.colour().touched()).toBe(false);
    select.touched.set(true);
    expect(host.form.colour().touched()).toBe(true);
  });

  it('forwards compact-context accessibility and overlay placement to PrimeNG', () => {
    const { fixture, select } = render();
    const combobox = fixture.nativeElement.querySelector('[role="combobox"]') as HTMLElement;

    expect(combobox.getAttribute('aria-label')).toBe('colour');
    expect(combobox.getAttribute('aria-describedby')).toBe('colour-help');
    expect(select.appendTo()).toBe('body');
  });

  it('stacks standard controls and keeps inline controls on one row', () => {
    const { fixture } = render();
    const frames = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('cs-control-frame'),
    ];

    expect(getComputedStyle(frames[0] as HTMLElement).display).toBe('flex');
    expect(getComputedStyle(frames[0] as HTMLElement).flexDirection).toBe('column');
    expect(getComputedStyle(frames[1] as HTMLElement).flexDirection).toBe('row');
  });

  it('turns a failing validator into an error on the control', () => {
    const { fixture, select } = render();
    select.value.set('');
    // `FormField` mirrors validity onto the control while change detection runs, not on write.
    fixture.detectChanges();
    expect(select.invalid()).toBe(true);
    expect(select.errors().map((error) => error.kind)).toContain('required');
  });
});

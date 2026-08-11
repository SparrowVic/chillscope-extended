import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { InputNumberModule } from 'primeng/inputnumber';
import type { InputNumberPassThrough } from 'primeng/types/inputnumber';

import { injectActiveLanguage } from '../../../core/i18n/active-language';
import { BaseFormControl } from '../base-form-control';
import { ControlFrame } from '../control-frame/control-frame';

@Component({
  selector: 'cs-input-number',
  imports: [ControlFrame, FormsModule, InputNumberModule, TranslocoPipe],
  templateUrl: './input-number.html',
  styleUrl: './input-number.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsInputNumber extends BaseFormControl<number | null> {
  readonly min = input<number | undefined>();
  readonly max = input<number | undefined>();
  readonly step = input(1);
  readonly showButtons = input(false, { transform: booleanAttribute });
  readonly minFractionDigits = input<number>();
  readonly maxFractionDigits = input<number>();
  readonly inputMode = input<'decimal' | 'numeric'>('decimal');

  /** Unit symbols such as `°C` are language neutral, so this is a literal, not a key. */
  readonly suffix = input<string>();

  protected readonly locale = injectActiveLanguage();
  protected readonly passThrough = computed<InputNumberPassThrough>(() => ({
    pcInputText: {
      root: {
        inputmode: this.inputMode(),
      },
    },
  }));
}

import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { MultiSelectModule } from 'primeng/multiselect';

import { BaseFormControl } from '../base-form-control';
import { ControlFrame } from '../control-frame/control-frame';
import { type SelectOption, translateOptions } from '../select-option';

@Component({
  selector: 'cs-multi-select',
  imports: [ControlFrame, FormsModule, MultiSelectModule, TranslocoPipe],
  templateUrl: './multi-select.html',
  styleUrl: './multi-select.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsMultiSelect<T> extends BaseFormControl<T[]> {
  readonly options = input.required<readonly SelectOption<T>[]>();
  readonly display = input<'comma' | 'chip'>('chip');
  readonly showToggleAll = input(true, { transform: booleanAttribute });
  readonly filter = input(false, { transform: booleanAttribute });
  readonly maxSelectedLabels = input(3);

  protected readonly resolvedOptions = translateOptions(this.options);
  protected readonly toggleAllId = `${this.controlId}-toggle-all`;
  protected readonly toggleAllLabelId = `${this.toggleAllId}-label`;
  protected readonly passThrough = computed(() => ({
    hiddenInput: {
      autocomplete: 'off',
      inputmode: 'none',
      readonly: true,
    },
    pcHeaderCheckbox: {
      input: {
        id: this.toggleAllId,
        'aria-labelledby': this.toggleAllLabelId,
      },
    },
  }));
}

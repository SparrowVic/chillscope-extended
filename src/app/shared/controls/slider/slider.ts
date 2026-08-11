import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SliderModule } from 'primeng/slider';

import { injectActiveLanguage } from '../../../core/i18n/active-language';
import { BaseFormControl } from '../base-form-control';
import { ControlFrame } from '../control-frame/control-frame';
import { decimalFormat } from '../../intl';

@Component({
  selector: 'cs-slider',
  imports: [ControlFrame, FormsModule, SliderModule],
  templateUrl: './slider.html',
  styleUrl: './slider.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  /** `onSlideEnd` never fires for arrow keys, so a keyboard user would never mark the field touched. */
  host: { '(focusout)': 'touched.set(true)' },
})
export class CsSlider extends BaseFormControl<number> {
  /** Widened to `undefined` because `FormField` feeds these from the schema's own metadata. */
  readonly min = input<number | undefined>(0);
  readonly max = input<number | undefined>(100);

  readonly step = input(1);
  readonly showValue = input(true, { transform: booleanAttribute });
  readonly fractionDigits = input(0);

  /** Unit symbols are language neutral, so this is a literal, not a translation key. */
  readonly suffix = input<string>();

  readonly #locale = injectActiveLanguage();

  /** PrimeNG's slider has no labellable input; its handle is named through `aria-labelledby`. */
  protected override readonly labelFor: string | undefined = undefined;

  protected readonly sliderMin = computed(() => this.min() ?? 0);
  protected readonly sliderMax = computed(() => this.max() ?? 100);

  /** The unit renders beside the number, smaller and muted — never inside the mono span. */
  protected readonly displayValue = computed(() =>
    decimalFormat(this.#locale(), this.fractionDigits()).format(this.value()),
  );
}

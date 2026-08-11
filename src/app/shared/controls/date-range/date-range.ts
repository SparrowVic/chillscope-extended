import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { DatePickerModule } from 'primeng/datepicker';
import type { DatePickerPassThrough } from 'primeng/types/datepicker';

import { injectActiveLanguage } from '../../../core/i18n/active-language';
import { BaseFormControl } from '../base-form-control';
import { ControlFrame } from '../control-frame/control-frame';

export interface DateRange {
  readonly from: Date | null;
  readonly to: Date | null;
}

@Component({
  selector: 'cs-date-range',
  imports: [ControlFrame, DatePickerModule, FormsModule, TranslocoPipe],
  templateUrl: './date-range.html',
  styleUrl: './date-range.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsDateRange extends BaseFormControl<DateRange> {
  readonly minDate = input<Date>();
  readonly maxDate = input<Date>();
  readonly showTime = input(false, { transform: booleanAttribute });
  readonly showButtonBar = input(true, { transform: booleanAttribute });
  readonly dateFormat = input<string>();

  readonly #language = injectActiveLanguage();

  protected readonly fullRangeLabel = computed(() => {
    const { from, to } = this.value();
    if (!from) {
      return undefined;
    }
    const format = new Intl.DateTimeFormat(this.#language(), {
      dateStyle: 'medium',
      ...(this.showTime() ? { timeStyle: 'short' as const } : {}),
    });
    return to ? `${format.format(from)} – ${format.format(to)}` : format.format(from);
  });

  protected readonly passThrough = computed<DatePickerPassThrough>(() => ({
    pcInputText: {
      root: {
        autocomplete: 'off',
        inputmode: 'none',
        title: this.fullRangeLabel(),
        'aria-description': this.fullRangeLabel(),
      },
    },
  }));

  protected readonly pickedDates = computed<Date[] | null>(() => {
    const { from, to } = this.value();
    if (!from) {
      return null;
    }
    return to ? [from, to] : [from];
  });

  /** The picker reports a half-open range while the user is still picking the second date. */
  protected onPicked(dates: Date[] | null): void {
    this.value.set({ from: dates?.[0] ?? null, to: dates?.[1] ?? null });
  }
}

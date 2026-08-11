import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';

import { injectTranslator } from '../../../core/i18n/translator';
import { BaseFormControl } from '../base-form-control';
import { ControlFrame } from '../control-frame/control-frame';

/**
 * The plain text control — ids, names, revisions, ISA tags. Born in the Machines forms and
 * promoted here once the app settled on one shared control set.
 */
@Component({
  selector: 'cs-text-input',
  imports: [ControlFrame, FormsModule, InputTextModule],
  templateUrl: './text-input.html',
  styleUrl: './text-input.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsTextInput extends BaseFormControl<string> {
  /** Identifiers and ISA tags are data — they read better in the mono face. */
  readonly mono = input(false, { transform: booleanAttribute });

  readonly #translate = injectTranslator();

  /** `null` removes the attribute — the pipe would print a literal "undefined" placeholder. */
  protected readonly placeholderText = computed(() => {
    const key = this.placeholder();
    return key ? this.#translate()(key) : null;
  });
}

import { booleanAttribute, computed, Directive, inject, input, model } from '@angular/core';
import type {
  FormCheckboxControl,
  FormValueControl,
  ValidationError,
} from '@angular/forms/signals';

import { SettingsStore } from '../../core/settings/settings.store';

export type ControlSize = 'small' | 'normal' | 'large';

export type ControlValidationError = ValidationError.WithOptionalFieldTree;

/** Everything `ControlFrame` needs to draw the label, the hint and the error message. */
export interface ControlFrameState {
  readonly labelId: string;
  /**
   * Id of the element the `<label for=…>` should point at, or `undefined` for a widget that has no
   * labellable element of its own — a `role="slider"` handle is named through `aria-labelledby`.
   */
  readonly labelFor: string | undefined;
  readonly hintId: string;
  readonly errorId: string;
  readonly label: string | undefined;
  readonly hint: string | undefined;
  readonly tooltip: string | undefined;
  readonly required: boolean;
  readonly invalid: boolean;
  readonly errorKey: string | undefined;
  readonly errorParams: Record<string, unknown>;
}

let controlSequence = 0;

/**
 * Shared chrome for every control in `shared/controls`: the framework-facing part of
 * `FormUiControl` plus the presentation inputs Signal Forms deliberately leaves to the
 * application. Concrete controls add either a `value` model (`BaseFormControl`) or a `checked`
 * model (`BaseCheckboxControl`) — never both, because each contract forbids the other.
 *
 * Selectorless `@Directive()` is what lets an abstract base declare `input()` and `model()`.
 */
@Directive()
export abstract class BaseControl {
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly required = input(false, { transform: booleanAttribute });
  readonly invalid = input(false, { transform: booleanAttribute });
  readonly errors = input<readonly ControlValidationError[]>([]);
  readonly touched = model(false);

  /** Translation keys, not display strings — the control resolves them. */
  readonly label = input<string>();
  readonly hint = input<string>();
  readonly tooltip = input<string>();
  readonly placeholder = input<string>();

  readonly size = input<ControlSize>('normal');

  readonly controlId = `cs-control-${++controlSequence}`;
  readonly labelId = `${this.controlId}-label`;
  readonly hintId = `${this.controlId}-hint`;
  readonly errorId = `${this.controlId}-error`;

  /** Overridden by controls whose focusable element carries no id a `<label for>` can reach. */
  protected readonly labelFor: string | undefined = this.controlId;

  protected readonly firstError = computed<ControlValidationError | undefined>(
    () => this.errors()[0],
  );

  protected readonly showError = computed(
    () => this.touched() && (this.invalid() || this.errors().length > 0),
  );

  readonly #density = inject(SettingsStore).density;

  /**
   * PrimeNG only knows the two off-normal sizes; its default covers `'normal'`. An explicit
   * `size` input wins; otherwise interface density decides how controls scale.
   */
  protected readonly primeSize = computed<'small' | 'large' | undefined>(() => {
    const size = this.size();
    if (size !== 'normal') {
      return size;
    }
    const density = this.#density();
    if (density === 'compact') {
      return 'small';
    }
    return density === 'comfortable' ? 'large' : undefined;
  });

  protected readonly frame = computed<ControlFrameState>(() => {
    const error = this.showError() ? this.firstError() : undefined;
    return {
      labelId: this.labelId,
      labelFor: this.labelFor,
      hintId: this.hintId,
      errorId: this.errorId,
      label: this.label(),
      hint: this.hint(),
      tooltip: this.tooltip(),
      required: this.required(),
      invalid: this.showError(),
      errorKey: error ? errorTranslationKey(error) : undefined,
      errorParams: error ? errorTranslationParams(error) : {},
    };
  });

  /** The frame renders the error in place of the hint, so at most one of them is describing us. */
  protected readonly describedBy = computed<string | undefined>(() => {
    const frame = this.frame();
    if (frame.errorKey) {
      return this.errorId;
    }
    return frame.hint ? this.hintId : undefined;
  });

  /**
   * PrimeNG exposes `ariaDescribedBy` on the input-number only. Everywhere else the hint and the
   * error would go unannounced, so they are folded into the accessible name instead of being lost.
   */
  protected readonly labelledBy = computed<string | undefined>(() => {
    const ids = [this.label() ? this.labelId : undefined, this.describedBy()].filter(
      (id): id is string => id !== undefined,
    );
    return ids.length > 0 ? ids.join(' ') : undefined;
  });
}

@Directive()
export abstract class BaseFormControl<T> extends BaseControl implements FormValueControl<T> {
  readonly value = model.required<T>();
}

@Directive()
export abstract class BaseCheckboxControl extends BaseControl implements FormCheckboxControl {
  readonly checked = model.required<boolean>();
}

/** A validator may carry its own translation key in `message`; otherwise the kind names it. */
function errorTranslationKey(error: ControlValidationError): string {
  return error.message ?? `validation.${error.kind}`;
}

const NON_PARAMETER_KEYS = new Set(['kind', 'message', 'fieldTree', 'formField']);

/**
 * Built-in errors carry their bound value — `min`, `maxLength` and friends — as own properties,
 * which is exactly what the message interpolates.
 */
function errorTranslationParams(error: ControlValidationError): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(error).filter(([key]) => !NON_PARAMETER_KEYS.has(key) && !key.startsWith('_')),
  );
}

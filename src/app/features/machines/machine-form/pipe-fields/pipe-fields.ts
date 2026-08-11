import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';

import type { PipeSide } from '../../../../core/schematic/schematic.models';
import {
  CsSegmentedControl,
  type SegmentedControlOption,
} from '../../../../shared/controls/segmented-control/segmented-control';
import type { SelectOption } from '../../../../shared/controls/select-option';
import { CsSelect } from '../../../../shared/controls/select/select';
import { CsIcon } from '../../../../shared/icons/cs-icon/cs-icon';
import type { PipeFormValue } from '../machine-form-model';

const SIDE_OPTIONS: readonly SegmentedControlOption<PipeSide>[] = [
  { value: 'cold', label: 'machines.form.sideCold' },
  { value: 'hot', label: 'machines.form.sideHot' },
];

/** One pipe route row: from / to constrained to existing nodes, plus the temperature side. */
@Component({
  selector: 'app-pipe-fields',
  imports: [ButtonModule, CsIcon, CsSegmentedControl, CsSelect, FormField, TranslocoPipe],
  templateUrl: './pipe-fields.html',
  styleUrls: ['../row-fields.css', './pipe-fields.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PipeFields {
  readonly field = input.required<FieldTree<PipeFormValue>>();
  readonly nodeOptions = input.required<readonly SelectOption<string>[]>();
  readonly locked = input(false, { transform: booleanAttribute });
  readonly removed = output<void>();

  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly sideOptions = SIDE_OPTIONS;

  /** The conduit glyph inks in the route's temperature side. */
  protected readonly hot = computed(() => this.field().side().value() === 'hot');

  /** The form hands the keyboard to this strip right after appending it. */
  focusFirst(): void {
    this.#host.nativeElement.querySelector<HTMLElement>('input, [tabindex]')?.focus();
  }
}

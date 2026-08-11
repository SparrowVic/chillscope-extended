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

import type { SchematicNodeType } from '../../../../core/schematic/schematic.models';
import { NODE_SYMBOLS, staticShapesForNode } from '../../../../core/schematic/symbols';
import { CsInputNumber } from '../../../../shared/controls/input-number/input-number';
import type { SelectOption } from '../../../../shared/controls/select-option';
import { CsSelect } from '../../../../shared/controls/select/select';
import { CsSwitch } from '../../../../shared/controls/switch/switch';
import { CsTextInput } from '../../../../shared/controls/text-input/text-input';
import { CsIcon } from '../../../../shared/icons/cs-icon/cs-icon';
import { SchematicShapes } from '../../../dashboard/schematic/schematic-shapes/schematic-shapes';
import { nodeSupportsTag, type NodeFormValue } from '../machine-form-model';

/** One node record strip of the machine form: a live symbol well, identity, grid placement and
 * render flags. */
@Component({
  selector: 'app-node-fields',
  imports: [
    ButtonModule,
    CsIcon,
    CsInputNumber,
    CsSelect,
    CsSwitch,
    CsTextInput,
    FormField,
    SchematicShapes,
    TranslocoPipe,
  ],
  templateUrl: './node-fields.html',
  styleUrls: ['../row-fields.css', './node-fields.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NodeFields {
  readonly field = input.required<FieldTree<NodeFormValue>>();
  readonly typeOptions = input.required<readonly SelectOption<SchematicNodeType>[]>();
  readonly locked = input(false, { transform: booleanAttribute });
  readonly removed = output<void>();

  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly supportsAnimation = computed(() =>
    nodeSupportsTag(this.field().type().value()),
  );
  protected readonly supportsLevel = computed(() => this.field().type().value() === 'reservoir');
  protected readonly supportsHeatSource = computed(() => this.field().type().value() === 'machine');

  protected readonly symbol = computed(() => NODE_SYMBOLS[this.field().type().value()]);

  /** `staticShapesForNode` judges a document node; the well fakes one from the row's live fields
   * so the preview tracks the type and level switches without a rendered document. */
  protected readonly previewShapes = computed(() =>
    staticShapesForNode({
      id: 'preview',
      type: this.field().type().value(),
      label: '',
      grid: [0, 0],
      level: this.field().level().value(),
    }),
  );

  /** The form hands the keyboard to this strip right after appending it. */
  focusFirst(): void {
    this.#host.nativeElement.querySelector<HTMLElement>('input, [tabindex]')?.focus();
  }
}

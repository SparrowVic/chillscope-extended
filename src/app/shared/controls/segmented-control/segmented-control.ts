import {
  afterRenderEffect,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  inject,
  input,
  output,
  viewChild,
  viewChildren,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { BaseFormControl } from '../base-form-control';
import { ControlFrame } from '../control-frame/control-frame';
import type { SelectOption } from '../select-option';

export interface SegmentedControlOption<T> extends SelectOption<T> {
  /** A compact face for the segment; `label` remains its full accessible name. */
  readonly shortLabel?: string;
}

interface RenderedSegment<T> extends SegmentedControlOption<T> {
  readonly selected: boolean;
}

@Component({
  selector: 'cs-segmented-control',
  imports: [ControlFrame, TranslocoPipe],
  templateUrl: './segmented-control.html',
  styleUrl: './segmented-control.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsSegmentedControl<T> extends BaseFormControl<T> {
  readonly options = input.required<readonly SegmentedControlOption<T>[]>();
  readonly numeric = input(false, { transform: booleanAttribute });
  /** Fires for every accepted activation, including a deliberate repeat of the current value. */
  readonly selected = output<T>();

  protected override readonly labelFor = undefined;

  private readonly group = viewChild<ElementRef<HTMLElement>>('group');
  private readonly optionButtons = viewChildren<ElementRef<HTMLButtonElement>>('optionButton');
  #resizeObserver: ResizeObserver | null = null;

  constructor() {
    super();
    // The thumb is a measured element, not a styled state: the active option's box is read after
    // each render and handed to CSS as --thumb-x/-w, so a selection change GLIDES between faces
    // instead of teleporting. Density and label length changes re-measure via ResizeObserver.
    afterRenderEffect(() => {
      this.renderedOptions();
      this.#placeThumb();
    });
    inject(DestroyRef).onDestroy(() => this.#resizeObserver?.disconnect());
  }

  #placeThumb(): void {
    const group = this.group()?.nativeElement;
    if (group === undefined) {
      return;
    }
    if (this.#resizeObserver === null && typeof globalThis.ResizeObserver === 'function') {
      this.#resizeObserver = new ResizeObserver(() => this.#placeThumb());
      this.#resizeObserver.observe(group);
    }
    const active = this.optionButtons().find((button) =>
      button.nativeElement.classList.contains('cs-segmented-control__option--active'),
    )?.nativeElement;
    if (active === undefined) {
      group.style.setProperty('--thumb-on', '0');
      return;
    }
    group.style.setProperty('--thumb-x', `${active.offsetLeft}px`);
    group.style.setProperty('--thumb-w', `${active.offsetWidth}px`);
    group.style.setProperty('--thumb-on', '1');
  }

  protected readonly renderedOptions = computed<readonly RenderedSegment<T>[]>(() => {
    const selectedValue = this.value();
    return this.options().map((option) => ({
      ...option,
      selected: Object.is(option.value, selectedValue),
    }));
  });

  protected select(option: RenderedSegment<T>): void {
    if (!this.disabled() && !option.disabled) {
      this.value.set(option.value);
      this.selected.emit(option.value);
    }
  }

  protected onFocusOut(event: FocusEvent): void {
    const group = event.currentTarget;
    const next = event.relatedTarget;
    if (group instanceof HTMLElement && !(next instanceof Node && group.contains(next))) {
      this.touched.set(true);
    }
  }
}

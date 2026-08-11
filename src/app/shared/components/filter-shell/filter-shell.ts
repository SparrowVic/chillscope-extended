import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  DestroyRef,
  DOCUMENT,
  effect,
  type ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  type TemplateRef,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';

import { CsIcon } from '../../icons/cs-icon/cs-icon';
import { FilterLayout } from './filter-layout';

let filterShellSequence = 0;

/**
 * The one adaptive filter surface (mobile redesign, Mission A). Three placements, ONE control
 * tree: the feature hands over a single `<ng-template>` and the shell instantiates it in exactly
 * one place at a time —
 *
 * - inline (desktop): the unchanged toolbar row on the shared `.cs-panel`;
 * - drawer (tablet): a compact entry bar opening a side drawer;
 * - sheet (phone): the same entry bar opening a bottom sheet.
 *
 * Because the template is embedded in at most one placement, duplicated control ids are
 * impossible by construction, and closing the overlay destroys the embedded view — so any
 * half-edited control state inside it reverts to the applied values on the next open.
 *
 * Draft semantics stay with the feature: it checks `deferred()` in its change handlers (stage in
 * overlay modes, commit immediately inline) and listens to `applied` / `discarded` / `resetted`.
 * The overlay is a real dialog: role/aria-modal, focus trap, Escape, outside-press dismiss,
 * body scroll lock, focus restore to the entry key, safe-area padding.
 */
@Component({
  selector: 'cs-filter-shell',
  imports: [NgTemplateOutlet, TranslocoPipe, CsIcon],
  templateUrl: './filter-shell.html',
  styleUrl: './filter-shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsFilterShell {
  /** Translation key naming the surface — the toolbar's aria-label and the dialog title. */
  readonly label = input.required<string>();
  /** How many filters currently narrow the data; 0 hides the badge. */
  readonly activeCount = input(0);

  /** The overlay's Apply was pressed: commit the staged draft. Fired before the close. */
  readonly applied = output<void>();
  /** The overlay closed without Apply (cancel, Escape, outside press): drop the staged draft. */
  readonly discarded = output<void>();
  /** Reset was pressed: the draft returned to the applied values; the overlay stays open. */
  readonly resetted = output<void>();

  readonly #document = inject(DOCUMENT);
  readonly #destroyRef = inject(DestroyRef);
  readonly #injector = inject(Injector);

  /** The single projected control tree. Queried by TemplateRef: the shell owns placement only. */
  protected readonly controls = contentChild.required<TemplateRef<unknown>>('controls');

  readonly mode = inject(FilterLayout).mode;
  /** True whenever edits should be staged rather than committed on every change. */
  readonly deferred = computed(() => this.mode() !== 'inline');

  protected readonly open = signal(false);
  /** Bumping the epoch re-embeds the control template — Reset's "back to applied" mechanism. */
  protected readonly epoch = signal(0);
  protected readonly epochList = computed(() => [this.epoch()]);

  protected readonly titleId = `cs-filter-shell-${++filterShellSequence}-title`;

  protected readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');
  protected readonly entry = viewChild<ElementRef<HTMLButtonElement>>('entry');
  /** Backdrop + dialog wrapper; re-parented onto document.body while open (see openOverlay). */
  protected readonly portal = viewChild<ElementRef<HTMLElement>>('portal');

  #restoreFocusTo: HTMLElement | null = null;
  #previousBodyOverflow: string | null = null;
  #onDocumentPointerDown: ((event: PointerEvent) => void) | null = null;
  /** The body-level portal node. Kept for destroy: see the onDestroy note below. */
  #portalElement: HTMLElement | null = null;

  constructor() {
    // Crossing back into the inline tier while the overlay is open: the overlay ceases to exist,
    // so its staged draft is discarded and the inline row (fresh embed) shows applied values.
    effect(() => {
      if (!this.deferred() && this.open()) {
        this.#close(true);
      }
    });

    this.#destroyRef.onDestroy(() => {
      this.#unlock();
      // Destroying a component removes only its HOST element; a portal re-parented onto
      // document.body sits outside that subtree and would survive as an orphan (e.g. when the
      // route changes while the sheet is open). A normal @if close removes it through Angular,
      // making this remove() a no-op on an already-detached node.
      this.#portalElement?.remove();
      this.#portalElement = null;
    });
  }

  protected openOverlay(): void {
    if (this.open()) {
      return;
    }
    const active = this.#document.activeElement;
    this.#restoreFocusTo = active instanceof HTMLElement ? active : null;
    this.open.set(true);
    this.#lock();
    afterNextRender(
      {
        write: () => {
          // Escape every ancestor containing block: an ancestor with a transform (the .cs-rise
          // entrance animation on the feature panel, a view-transition frame) captures
          // position:fixed and anchors the dialog to the PANEL instead of the viewport. On
          // document.body no transform/filter ancestor exists. Angular still owns the moved
          // nodes — bindings keep updating and closing the @if removes them from the body.
          // (Native <dialog>+showModal() was rejected deliberately: its top layer paints above
          // ALL non-top-layer content, which would occlude every PrimeNG appendTo="body"
          // overlay opened from the controls inside the sheet.)
          const portal = this.portal()?.nativeElement;
          if (portal !== undefined && portal.parentElement !== this.#document.body) {
            this.#document.body.appendChild(portal);
            this.#portalElement = portal;
          }
          this.dialog()?.nativeElement.focus();
        },
      },
      { injector: this.#injector },
    );
  }

  protected applyAndClose(): void {
    this.applied.emit();
    this.#close(false);
  }

  protected cancelAndClose(): void {
    this.#close(true);
  }

  protected resetDraft(): void {
    // Re-embedding the template rebuilds every control from the applied inputs; the feature
    // clears its own staged fields on `resetted`.
    this.epoch.update((epoch) => epoch + 1);
    this.resetted.emit();
  }

  protected onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      // A PrimeNG overlay open inside the dialog handles its own Escape and prevents the
      // default; the sheet only reacts to an Escape nobody else claimed.
      if (!event.defaultPrevented) {
        event.preventDefault();
        this.cancelAndClose();
      }
      return;
    }
    if (event.key === 'Tab') {
      this.#trapTab(event);
    }
  }

  #close(discarded: boolean): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    this.epoch.update((epoch) => epoch + 1);
    this.#unlock();
    if (discarded) {
      this.discarded.emit();
    }
    const target = this.#restoreFocusTo ?? this.entry()?.nativeElement ?? null;
    this.#restoreFocusTo = null;
    target?.focus();
  }

  /** Body scroll lock plus light-dismiss: a press outside the dialog cancels. */
  #lock(): void {
    const body = this.#document.body;
    this.#previousBodyOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    const onPointerDown = (event: PointerEvent): void => {
      const dialog = this.dialog()?.nativeElement;
      const target = event.target;
      if (dialog === undefined || !(target instanceof Node)) {
        return;
      }
      // Presses inside the dialog and inside body-appended PrimeNG overlay panels both belong
      // to the dialog's editing session; only true outside presses dismiss.
      if (dialog.contains(target)) {
        return;
      }
      const overlay =
        target instanceof Element
          ? target.closest(
              '.p-overlay, .p-select-overlay, .p-multiselect-overlay, .p-datepicker-panel, .p-confirmpopup, .p-toast',
            )
          : null;
      if (overlay !== null) {
        return;
      }
      this.cancelAndClose();
    };
    this.#document.addEventListener('pointerdown', onPointerDown, true);
    this.#onDocumentPointerDown = onPointerDown;
  }

  #unlock(): void {
    if (this.#previousBodyOverflow !== null) {
      this.#document.body.style.overflow = this.#previousBodyOverflow;
      this.#previousBodyOverflow = null;
    }
    if (this.#onDocumentPointerDown !== null) {
      this.#document.removeEventListener('pointerdown', this.#onDocumentPointerDown, true);
      this.#onDocumentPointerDown = null;
    }
  }

  /** Keeps Tab cycling inside the dialog while it is modal. */
  #trapTab(event: KeyboardEvent): void {
    const dialog = this.dialog()?.nativeElement;
    if (dialog === undefined) {
      return;
    }
    const tabbables = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (element) => element.getClientRects().length > 0 || element === this.#document.activeElement,
    );
    if (tabbables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = tabbables[0];
    const last = tabbables[tabbables.length - 1];
    const active = this.#document.activeElement;
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

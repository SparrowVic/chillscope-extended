import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';

import type { MeasurementSeries } from '../../../core/data/measurement.models';
import { injectTranslator } from '../../../core/i18n/translator';
import { calibrateSeriesForMachine } from '../../../core/machines/active-machine-telemetry';
import { displayMachineName } from '../../../core/machines/builtin-machine-copy';
import { MACHINE_PROFILES, validateAgainstProfile } from '../../../core/machines/machine-profile';
import { SettingsStore } from '../../../core/settings/settings.store';
import { K207_SCHEMATIC } from '../../../core/schematic/k207.schematic';
import type { MachineSchematic } from '../../../core/schematic/schematic.models';
import { validateSchematic } from '../../../core/schematic/schematic.validate';
import { SchematicPanel } from '../../dashboard/schematic/schematic-panel/schematic-panel';
import { ErrorPanel } from '../../../shared/components/error-panel/error-panel';
import { CsIcon } from '../../../shared/icons/cs-icon/cs-icon';
import { CsDecode } from '../../../shared/motion/decode';
import type { CsIconName } from '../../../shared/icons/icon-roster';
import { injectCompactStage } from '../compact-stage';
import { MachineDiagram } from '../machine-diagram/machine-diagram';
import { MachineForm } from '../machine-form/machine-form';
import { MachineJson } from '../machine-json/machine-json';

type EditorTab = 'form' | 'json' | 'diagram';

interface EditorTabKey {
  readonly id: EditorTab;
  readonly icon: CsIconName;
  readonly labelKey: string;
}

/** Order matters twice over: it is the DOM order and the order arrow keys rove through. */
const EDITOR_TABS: readonly EditorTabKey[] = [
  { id: 'form', icon: 'sliders', labelKey: 'machines.editor.tabs.form' },
  { id: 'json', icon: 'code', labelKey: 'machines.editor.tabs.json' },
  { id: 'diagram', icon: 'diagram-project', labelKey: 'machines.editor.tabs.diagram' },
];

/**
 * The editor pane (configurator spec §4): the Formularz | JSON | Diagram tabs over the selected
 * document, with the Dashboard's own schematic renderer as the fixed live preview — an invalid
 * draft renders the §9 error panel there, never a broken drawing. The tabs share one draft:
 * whichever tab last edited holds the truth the preview and the Diagram canvas render, and all
 * tab panels stay mounted so switching never discards a half-typed draft. The tablist is one
 * horizontal row at every width — compact viewports restyle it as a full-width segmented
 * switch (app navigation, not desktop tabs) and fold the live preview behind a disclosure.
 */
@Component({
  selector: 'app-machine-editor',
  imports: [
    ButtonModule,
    CsDecode,
    CsIcon,
    ErrorPanel,
    MachineDiagram,
    MachineForm,
    MachineJson,
    SchematicPanel,
    TranslocoPipe,
  ],
  templateUrl: './machine-editor.html',
  styleUrl: './machine-editor.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MachineEditor {
  readonly doc = input<MachineSchematic>(K207_SCHEMATIC);
  readonly locked = input(false);
  /** Whether this document is the machine the whole app follows (the store's activeId). */
  readonly active = input(false);
  readonly series = input.required<readonly MeasurementSeries[]>();
  readonly telemetryLoading = input(false);
  readonly telemetryFailed = input(false);

  readonly saved = output<MachineSchematic>();
  readonly duplicateRequested = output<void>();
  readonly dirtyChange = output<boolean>();

  readonly #destroyRef = inject(DestroyRef);
  readonly #document = inject(DOCUMENT);
  readonly #translator = injectTranslator();
  readonly #settings = inject(SettingsStore);

  protected readonly tabs = EDITOR_TABS;
  protected readonly tab = signal<EditorTab>('form');
  protected readonly compact = injectCompactStage();

  readonly #structuralDraft = computed(() => {
    const result = validateSchematic(this.#draft());
    return result.ok ? result.doc : undefined;
  });

  protected readonly profile = computed(
    () => MACHINE_PROFILES[this.#structuralDraft()?.profileId ?? this.doc().profileId],
  );
  protected readonly displayName = computed(() =>
    displayMachineName(this.doc(), this.#translator()),
  );
  protected readonly previewSeries = computed(() =>
    calibrateSeriesForMachine(
      this.series(),
      this.#structuralDraft() ?? this.doc(),
      this.#settings.thresholds(),
    ),
  );

  /**
   * The one draft all three tabs share (spec §4.3): the most recent edit from any tab, re-seeded
   * from the document on selection change and on every save. The preview renders it, and the
   * Diagram tab both consumes and produces it.
   */
  readonly #draft = linkedSignal<MachineSchematic, unknown>({
    source: this.doc,
    computation: (doc) => doc,
  });

  protected readonly previewDoc = this.#draft.asReadonly();
  readonly #formSeed = linkedSignal(this.doc);
  readonly #jsonSeed = linkedSignal(this.doc);
  readonly #jsonEditPending = linkedSignal<MachineSchematic, boolean>({
    source: this.doc,
    computation: () => false,
  });

  protected readonly formSeed = this.#formSeed.asReadonly();
  protected readonly jsonSeed = this.#jsonSeed.asReadonly();
  protected readonly diagramVisited = signal(false);

  /**
   * The compact preview disclosure: phone vertical space is spent on the editing surface, so
   * the live preview folds shut when the compact stage engages and reopens per explicit tap.
   * Wide viewports always show it — the toggle exists only in the compact DOM.
   */
  readonly #previewCollapsed = linkedSignal<boolean, boolean>({
    source: this.compact,
    computation: (compact) => compact,
  });

  protected readonly previewOpen = computed(() => !this.compact() || !this.#previewCollapsed());

  /** A folded preview must still confess a draft that would not render clean. */
  protected readonly previewFlagged = computed(
    () => this.#structuralDraft() === undefined || this.profileErrors().length > 0,
  );

  protected togglePreview(): void {
    this.#previewCollapsed.update((collapsed) => !collapsed);
  }

  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');
  private readonly tablist = viewChild<ElementRef<HTMLElement>>('tablist');
  #tabResizeObserver: ResizeObserver | null = null;

  readonly dirty = computed(
    () => this.#jsonEditPending() || !sameDocument(this.#draft(), this.doc()),
  );

  constructor() {
    effect(() => this.dirtyChange.emit(this.dirty()));

    // The selection marker is a measured element, not a styled state (the segmented control's
    // mechanism, adapted to a tablist): the active tab's box is read after each render and
    // handed to CSS as --tab-thumb-*, so selection GLIDES between tabs instead of teleporting.
    // Density, label-length and breakpoint changes re-measure via ResizeObserver — the tablist
    // alone is not enough, because a language switch resizes the keys without resizing it.
    afterRenderEffect(() => {
      this.tab();
      this.compact();
      this.#placeTabThumb();
    });
    this.#destroyRef.onDestroy(() => this.#tabResizeObserver?.disconnect());
  }

  #placeTabThumb(): void {
    const tablist = this.tablist()?.nativeElement;
    if (tablist === undefined) {
      return;
    }
    if (this.#tabResizeObserver === null && typeof globalThis.ResizeObserver === 'function') {
      this.#tabResizeObserver = new ResizeObserver(() => this.#placeTabThumb());
      this.#tabResizeObserver.observe(tablist);
      for (const button of this.tabButtons()) {
        this.#tabResizeObserver.observe(button.nativeElement);
      }
    }
    const active = this.tabButtons().find((button) =>
      button.nativeElement.classList.contains('editor__tab--on'),
    )?.nativeElement;
    if (active === undefined) {
      tablist.style.setProperty('--tab-thumb-on', '0');
      return;
    }
    // Wide keys keep the retired static marker's optical inset (the tab's own block padding);
    // the compact segmented thumb fills the whole key like the shell's gliding segment.
    const inset = this.compact()
      ? 0
      : Number.parseFloat(globalThis.getComputedStyle(active).paddingTop) || 0;
    const start = active.offsetLeft + inset;
    const length = Math.max(active.offsetWidth - 2 * inset, 0);
    tablist.style.setProperty('--tab-thumb-x', `${start}px`);
    tablist.style.setProperty('--tab-thumb-len', `${length}`);
    tablist.style.setProperty('--tab-thumb-on', '1');
  }

  /**
   * The renderer's panel already lists structural errors; this adds the profile layer, which
   * only the configurator knows about (spec §2 two-layer validation).
   */
  protected readonly profileErrors = computed<readonly string[]>(() => {
    const structural = this.#structuralDraft();
    return structural
      ? validateAgainstProfile(structural, MACHINE_PROFILES[structural.profileId])
      : [];
  });

  protected onDraft(draft: unknown): void {
    this.#draft.set(draft);
  }

  protected onJsonEditPending(pending: boolean): void {
    this.#jsonEditPending.set(pending);
  }

  /** A failed lazy chunk cannot be retried in place; a document reload requests it afresh. */
  protected reloadPage(): void {
    this.#document.defaultView?.location.reload();
  }

  protected select(tab: EditorTab): void {
    if (tab === this.tab()) {
      return;
    }
    const structural = this.#structuralDraft();
    if (structural !== undefined) {
      if (tab === 'form') {
        this.#formSeed.set(structural);
      } else if (tab === 'json') {
        this.#jsonSeed.set(structural);
      }
    }
    if (tab === 'diagram') {
      this.diagramVisited.set(true);
    }
    this.tab.set(tab);
  }

  /** Roving the one horizontal tablist with arrows, per the ARIA tabs pattern. */
  protected onTablistKeydown(event: KeyboardEvent): void {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const count = EDITOR_TABS.length;
    const current = EDITOR_TABS.findIndex((key) => key.id === this.tab());
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? count - 1
          : (current + (event.key === 'ArrowRight' ? 1 : -1) + count) % count;
    this.select((EDITOR_TABS[next] as EditorTabKey).id);
    this.tabButtons()[next]?.nativeElement.focus();
  }
}

function sameDocument(draft: unknown, doc: MachineSchematic): boolean {
  try {
    return JSON.stringify(draft) === JSON.stringify(doc);
  } catch {
    return false;
  }
}

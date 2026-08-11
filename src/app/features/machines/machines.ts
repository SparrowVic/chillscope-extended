import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
  type ElementRef,
  type Signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';

import { MeasurementsFacade } from '../../core/data/measurements.facade';
import { injectTranslator } from '../../core/i18n/translator';
import { displayMachineName } from '../../core/machines/builtin-machine-copy';
import {
  MachineLibraryStore,
  type MachineStoreFailure,
} from '../../core/machines/machine-library.store';
import { MACHINE_PROFILES } from '../../core/machines/machine-profile';
import type { MachineProfileId, MachineSchematic } from '../../core/schematic/schematic.models';
import { PageHeader } from '../../shared/components/page-header/page-header';
import type { PendingChangesAware } from '../../shared/guards/pending-changes';
import { CsIcon } from '../../shared/icons/cs-icon/cs-icon';
import { injectCompactStage } from './compact-stage';
import { MachineEditor } from './machine-editor/machine-editor';
import { MachineLibrary, type MachineRow } from './machine-library/machine-library';
import { injectToast } from '../../shared/toasts';

/** Which pane a compact viewport is showing; both panes render side by side when wide. */
type MachinesStage = 'library' | 'editor';

/**
 * The Machines screen (configurator spec §4): the library and the editor of the selected
 * document. Wide viewports show them as a two-pane master–detail; compact ones show one STAGE
 * at a time — the editor with a back key, the library as the machine selector — while both
 * panes stay mounted, so a half-typed draft survives every stage switch. Selection is a screen
 * concern — which document is being *edited*; the store's `activeId` is which machine the whole
 * app *follows*.
 */
@Component({
  selector: 'app-machines',
  imports: [CsIcon, MachineEditor, MachineLibrary, PageHeader, ToastModule, TranslocoPipe],
  templateUrl: './machines.html',
  styleUrl: './machines.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MessageService],
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class Machines implements PendingChangesAware {
  readonly #store = inject(MachineLibraryStore);
  readonly #measurements = inject(MeasurementsFacade);
  readonly #toast = injectToast();
  readonly #translator = injectTranslator();
  readonly #transloco = inject(TranslocoService);
  readonly #window = inject(DOCUMENT).defaultView;
  readonly #injector = inject(Injector);
  readonly #dirty = signal(false);

  protected readonly series = this.#measurements.schematicBaselineSeries;
  protected readonly telemetryLoading = this.#measurements.isLoadingSchematic;
  protected readonly telemetryFailed = computed(
    () => this.#measurements.schematicError() !== undefined,
  );

  protected readonly compact = injectCompactStage();

  /**
   * The editor opens first: the screen exists to configure the machine it preselects, and a
   * rotation out of the two-pane layout must land on the surface that may hold unsaved work.
   */
  protected readonly stage = signal<MachinesStage>('editor');

  private readonly libraryPane = viewChild<ElementRef<HTMLElement>>('libraryPane');
  private readonly editorPane = viewChild<ElementRef<HTMLElement>>('editorPane');

  constructor() {
    const releaseSchematic = this.#measurements.activateSchematic();
    inject(DestroyRef).onDestroy(releaseSchematic);
  }

  /** Editing starts on whatever machine the app is following right now. */
  readonly #selectedId = signal(this.#store.activeId());

  /** Falls back to the active document when the selected one disappears (e.g. was removed). */
  protected readonly selectedDoc = computed<MachineSchematic>(() => {
    const id = this.#selectedId();
    return this.#store.machines().find((machine) => machine.id === id) ?? this.#store.active();
  });

  protected readonly selectedLocked = computed(() => this.#store.isBuiltIn(this.selectedDoc().id));
  protected readonly selectedActive = computed(
    () => this.selectedDoc().id === this.#store.activeId(),
  );

  protected readonly rows = computed<readonly MachineRow[]>(() => {
    const selectedId = this.selectedDoc().id;
    const activeId = this.#store.activeId();
    const translate = this.#translator();
    return this.#store.machines().map((machine) => ({
      id: machine.id,
      name: displayMachineName(machine, translate),
      profileNameKey: MACHINE_PROFILES[machine.profileId].nameKey,
      builtIn: this.#store.isBuiltIn(machine.id),
      active: machine.id === activeId,
      selected: machine.id === selectedId,
    }));
  });

  protected showLibrary(): void {
    this.#openStage('library');
  }

  protected select(id: string): void {
    if (id === this.selectedDoc().id) {
      // Re-selecting is stage navigation, not a selection change — nothing to discard.
      this.#openStage('editor');
      return;
    }
    if (this.#confirmDiscard()) {
      this.#selectedId.set(id);
      this.#dirty.set(false);
      this.#openStage('editor');
    }
  }

  protected create(profileId: MachineProfileId): void {
    if (this.#confirmDiscard()) {
      const result = this.#store.create(profileId);
      if (result.ok) {
        this.#selectedId.set(result.doc.id);
        this.#dirty.set(false);
        this.#openStage('editor');
      } else {
        this.#showStoreFailure(result);
      }
    }
  }

  protected duplicate(id: string): void {
    if (!this.#confirmDiscard()) {
      return;
    }
    const result = this.#store.duplicate(id);
    if (result.ok) {
      this.#selectedId.set(result.doc.id);
      this.#dirty.set(false);
      this.#openStage('editor');
    } else {
      this.#showStoreFailure(result);
    }
  }

  protected remove(id: string): void {
    if (this.#selectedId() === id && !this.#confirmDiscard()) {
      return;
    }
    const result = this.#store.remove(id);
    if (!result.ok) {
      this.#showStoreFailure(result);
      return;
    }
    if (this.#selectedId() === id) {
      this.#selectedId.set(this.#store.activeId());
      this.#dirty.set(false);
    }
  }

  protected activate(id: string): void {
    const result = this.#store.setActive(id);
    if (!result.ok) {
      this.#showStoreFailure(result);
    }
  }

  /** A save may rename the document; the selection follows the id the store confirmed. */
  protected onSaved(doc: MachineSchematic): void {
    this.#selectedId.set(doc.id);
    this.#dirty.set(false);
  }

  protected onDirtyChange(dirty: boolean): void {
    this.#dirty.set(dirty);
  }

  canDeactivate(): boolean {
    return this.#confirmDiscard();
  }

  /** `preventDefault()` is the standard dirty signal; the deprecated `returnValue` stays unset. */
  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.#dirty()) {
      event.preventDefault();
    }
  }

  /**
   * Stage navigation must move the reading position with it: the freshly revealed pane takes
   * programmatic focus (silent — the ring stays reserved for :focus-visible), which also scrolls
   * it into view after the hidden pane collapses the page.
   */
  #openStage(stage: MachinesStage): void {
    this.stage.set(stage);
    if (!this.compact()) {
      return;
    }
    const pane: Signal<ElementRef<HTMLElement> | undefined> =
      stage === 'library' ? this.libraryPane : this.editorPane;
    afterNextRender(() => pane()?.nativeElement.focus(), { injector: this.#injector });
  }

  #confirmDiscard(): boolean {
    return (
      !this.#dirty() ||
      (this.#window?.confirm(this.#transloco.translate('common.discardChanges')) ?? true)
    );
  }

  #showStoreFailure(failure: MachineStoreFailure): void {
    if (failure.reason !== 'persistence') {
      return;
    }
    this.#toast.error('machines.library.persistenceTitle', 'machines.library.persistenceMessage');
  }
}

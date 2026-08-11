import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  untracked,
  viewChild,
  viewChildren,
  type ElementRef,
  type Signal,
} from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';

import { machineValidationCopies } from '../../../core/i18n/machine-validation-copy';
import { MachineLibraryStore } from '../../../core/machines/machine-library.store';
import {
  CHILLER_PROFILE,
  MACHINE_PROFILES,
  type MachineProfile,
} from '../../../core/machines/machine-profile';
import { K207_SCHEMATIC } from '../../../core/schematic/k207.schematic';
import {
  SCHEMATIC_NODE_TYPES,
  type MachineSchematic,
  type SchematicNodeType,
} from '../../../core/schematic/schematic.models';
import { CsIcon } from '../../../shared/icons/cs-icon/cs-icon';
import { CsTextInput } from '../../../shared/controls/text-input/text-input';
import { injectCompactStage } from '../compact-stage';
import { machineFieldOptions } from './machine-field-options';
import {
  machineFormSchema,
  toMachineFormValue,
  toSchematicDocument,
  type NodeFormValue,
} from './machine-form-model';
import { firstFreeCell } from './machine-form-placement';
import { NodeFields } from './node-fields/node-fields';
import { PipeFields } from './pipe-fields/pipe-fields';
import { SectionCaption } from './section-caption/section-caption';
import { SensorFields } from './sensor-fields/sensor-fields';
import { injectToast } from '../../../shared/toasts';
import { machineDocumentErrors } from '../../../core/machines/machine-document';
import { canonicalMachineJson } from './machine-form-model';

/** The three record sections a compact viewport folds; the nameplate never folds. */
type FormSection = 'nodes' | 'pipes' | 'sensors';
type SectionState = Readonly<Record<FormSection, boolean>>;

const SECTIONS_FOLDED: SectionState = { nodes: false, pipes: false, sensors: false };

/**
 * The Formularz tab (configurator spec §4.1): machine info, nodes, pipes and sensor slots, all
 * fenced by the selected document's profile. Per-field rules live in the Signal Forms schema;
 * everything cross-field is judged by the two document validators on the mapped draft, and Save
 * reaches the library store only when both layers agree. On the compact stage the three record
 * sections become accordions — folded sections keep their fields MOUNTED (one form tree,
 * hidden not destroyed) and confess hidden schema errors on their caption — and the save/revert
 * strip docks above the mobile navigation reserve.
 */
@Component({
  selector: 'app-machine-form',
  imports: [
    ButtonModule,
    CsIcon,
    CsTextInput,
    FormField,
    NodeFields,
    PipeFields,
    SectionCaption,
    SensorFields,
    TranslocoPipe,
  ],
  templateUrl: './machine-form.html',
  styleUrl: './machine-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  /* The locked-state hook (blueprint §G): affordance chrome is @if-guarded away, and this class
     lets the stylesheet keep documentary ink steady if any is ever added at this level. */
  host: { '[class.mform--locked]': 'locked()' },
})
export class MachineForm {
  /** Defaults keep construction safe: real inputs arrive before the first template read. */
  readonly doc = input<MachineSchematic>(K207_SCHEMATIC);
  /** Parent-owned shared draft, refreshed only when another editing surface takes over. */
  readonly seed = input<MachineSchematic | undefined>(undefined);
  readonly profile = input<MachineProfile>(CHILLER_PROFILE);
  /** Built-ins are read-only here; the library's duplicate action is the way in. */
  readonly locked = input(false);

  /** The live draft for the editor's preview — untrusted on purpose, the preview validates it. */
  readonly draftChange = output<unknown>();
  readonly saved = output<MachineSchematic>();

  readonly #store = inject(MachineLibraryStore);
  readonly #toast = injectToast();
  readonly #injector = inject(Injector);

  protected readonly compact = injectCompactStage();

  /**
   * Which record sections are open. Compact starts every fold shut — the form reads as an
   * overview (nameplate + three counted captions) until one section is opened deliberately —
   * and a document switch closes them again. Wide viewports ignore the map entirely.
   */
  protected readonly openSections = linkedSignal<MachineSchematic, SectionState>({
    source: this.doc,
    computation: () => SECTIONS_FOLDED,
  });

  protected toggleSection(section: FormSection): void {
    this.openSections.update((state) => ({ ...state, [section]: !state[section] }));
  }

  protected sectionHidden(section: FormSection): boolean {
    return this.compact() && !this.openSections()[section];
  }

  /* `viewChildren` queries cannot live on ES-private (#) members (NG1053). */
  private readonly nodeRows = viewChildren(NodeFields);
  private readonly pipeRows = viewChildren(PipeFields);
  private readonly nodeGhost = viewChild<ElementRef<HTMLButtonElement>>('nodeGhost');
  private readonly pipeGhost = viewChild<ElementRef<HTMLButtonElement>>('pipeGhost');

  /** The model produced by input hydration; only user-created model references own the draft. */
  #hydratedModel: ReturnType<typeof toMachineFormValue> | undefined;

  /** Re-seeds itself whenever another document is selected or a save lands. */
  protected readonly model = linkedSignal(() => {
    const hydrated = toMachineFormValue(this.seed() ?? this.doc(), this.profile());
    this.#hydratedModel = hydrated;
    return hydrated;
  });

  protected readonly form = form(
    this.model,
    machineFormSchema(
      () => this.profile(),
      () => this.locked(),
    ),
  );

  readonly #draft = computed(() => toSchematicDocument(this.model(), this.profile().id));

  readonly #savedCanonical = computed(() => canonicalMachineJson(this.doc()));

  protected readonly dirty = computed(
    () => JSON.stringify(this.#draft()) !== this.#savedCanonical(),
  );

  /** Save is gated on the same two layers that guard the store (configurator spec §4.1). */
  readonly #documentErrors = computed<readonly string[]>(() => {
    return machineDocumentErrors(this.#draft(), this.profile());
  });

  /** Errors the store returned for the last save attempt (e.g. an id collision). */
  protected readonly storeErrors = linkedSignal<unknown, readonly string[]>({
    source: this.model,
    computation: () => [],
  });
  protected readonly storeErrorCopies = computed(() => machineValidationCopies(this.storeErrors()));

  /* A folded section must confess its schema errors on the caption (accordion contract). */
  protected readonly nodesInvalid = computed(() => this.form.nodes().invalid());
  protected readonly pipesInvalid = computed(() => this.form.pipes().invalid());
  protected readonly sensorsInvalid = computed(() => this.form.sensors().invalid());

  constructor() {
    effect(() => {
      this.doc();
      this.seed();
      untracked(() => this.form().reset());
    });
    effect(() => {
      const model = this.model();
      const draft = this.#draft();
      if (model !== this.#hydratedModel) {
        this.draftChange.emit(draft);
      }
    });
  }

  readonly #fieldOptions = machineFieldOptions(
    () => this.profile(),
    () => this.model().nodes,
  );

  protected readonly typeOptions = this.#fieldOptions.typeOptions;
  protected readonly nodeOptions = this.#fieldOptions.nodeOptions;
  protected readonly attachOptions = this.#fieldOptions.attachOptions;

  protected readonly nodeCount = computed(() => this.model().nodes.length);
  protected readonly pipeCount = computed(() => this.model().pipes.length);
  protected readonly sensorCount = computed(() => this.model().sensors.length);

  /** The type addNode() would place next: the first profile-allowed type still under its cap. */
  readonly #nextNodeType = computed<SchematicNodeType | undefined>(() => {
    const profile = this.profile();
    const counts = new Map<SchematicNodeType, number>();
    for (const node of this.model().nodes) {
      counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
    }
    return SCHEMATIC_NODE_TYPES.find(
      (candidate) =>
        profile.nodeRules[candidate].max > 0 &&
        (counts.get(candidate) ?? 0) < profile.nodeRules[candidate].max,
    );
  });

  /** Why the node ghost is inert, or `null` while adding is possible. */
  protected readonly addNodeBlocked = computed<'limit' | 'grid' | null>(() => {
    const type = this.#nextNodeType();
    if (type === undefined) {
      return 'limit';
    }
    return firstFreeCell(this.model().nodes, this.profile().gridSize, type) === undefined
      ? 'grid'
      : null;
  });

  protected readonly addNodeLabel = computed<string>(() => {
    switch (this.addNodeBlocked()) {
      case 'limit':
        return 'machines.form.nodeLimit';
      case 'grid':
        return 'machines.form.gridFull';
      default:
        return 'machines.form.addNode';
    }
  });

  protected readonly saveDisabled = computed(() => {
    const state = this.form();
    return this.locked() || !this.dirty() || state.invalid() || this.#documentErrors().length > 0;
  });

  protected addNode(): void {
    const type = this.#nextNodeType();
    if (type === undefined) {
      return;
    }
    const nodes = this.model().nodes;
    const position = firstFreeCell(nodes, this.profile().gridSize, type);
    if (position === undefined) {
      return;
    }
    const id = nextNodeId(nodes);
    const [column, row] = position;
    this.model.update((value) => ({
      ...value,
      nodes: [
        ...value.nodes,
        { id, type, label: id, column, row, tag: '', level: false, heatSource: false },
      ],
    }));
    this.#focusNewRow(this.nodeRows);
  }

  protected removeNode(index: number): void {
    this.model.update((value) => ({
      ...value,
      nodes: value.nodes.filter((_, at) => at !== index),
    }));
    this.#focusAfterRemove(this.nodeRows, index, this.nodeGhost);
  }

  protected addPipe(): void {
    this.model.update((value) => ({
      ...value,
      pipes: [...value.pipes, { from: '', to: '', side: 'cold' as const }],
    }));
    this.#focusNewRow(this.pipeRows);
  }

  /** Adding is a hand-off: the fresh strip's first control receives the keyboard. */
  #focusNewRow(rows: Signal<readonly { focusFirst(): void }[]>): void {
    afterNextRender(() => rows().at(-1)?.focusFirst(), { injector: this.#injector });
  }

  /**
   * Removing hands the keyboard to the strip that slid into the gap (or the previous one when
   * the last strip died), and to the section's ghost slot when the list empties — the focused
   * remove key is destroyed with its strip, and without a hand-off focus falls to `<body>`.
   */
  #focusAfterRemove(
    rows: Signal<readonly { focusFirst(): void }[]>,
    index: number,
    ghost: Signal<ElementRef<HTMLButtonElement> | undefined>,
  ): void {
    afterNextRender(
      () => {
        const list = rows();
        const survivor = list[Math.min(index, list.length - 1)];
        if (survivor) {
          survivor.focusFirst();
        } else {
          ghost()?.nativeElement.focus();
        }
      },
      { injector: this.#injector },
    );
  }

  protected removePipe(index: number): void {
    this.model.update((value) => ({
      ...value,
      pipes: value.pipes.filter((_, at) => at !== index),
    }));
    this.#focusAfterRemove(this.pipeRows, index, this.pipeGhost);
  }

  protected revert(): void {
    const doc = this.doc();
    const model = toMachineFormValue(doc, MACHINE_PROFILES[doc.profileId]);
    this.#hydratedModel = model;
    this.model.set(model);
    this.form().reset();
    this.draftChange.emit(doc);
  }

  protected save(): void {
    if (this.saveDisabled()) {
      return;
    }
    const result = this.#store.update(this.doc().id, this.#draft());
    if (!result.ok) {
      if (result.reason === 'persistence') {
        this.#toast.error(
          'machines.library.persistenceTitle',
          'machines.library.persistenceMessage',
        );
      } else {
        this.storeErrors.set(result.errors);
      }
      return;
    }
    this.#toast.success('machines.form.saved');
    this.saved.emit(result.doc);
  }
}

/** N-numbered ids keep clear of the skeleton's typed prefixes and the user's own names. */
function nextNodeId(nodes: readonly NodeFormValue[]): string {
  const taken = new Set(nodes.map((node) => node.id));
  for (let n = 1; ; n += 1) {
    const candidate = `N${n}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

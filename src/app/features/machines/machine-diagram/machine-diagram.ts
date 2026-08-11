import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { form } from '@angular/forms/signals';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';

import { injectTranslator } from '../../../core/i18n/translator';
import { machineValidationCopies } from '../../../core/i18n/machine-validation-copy';
import { displayNodeLabel } from '../../../core/machines/builtin-machine-copy';
import { MachineLibraryStore } from '../../../core/machines/machine-library.store';
import {
  CHILLER_PROFILE,
  MACHINE_PROFILES,
  validateAgainstProfile,
  type MachineProfile,
} from '../../../core/machines/machine-profile';
import { K207_SCHEMATIC } from '../../../core/schematic/k207.schematic';
import {
  PLACEMENT_STEP_PX,
  isSchematicRoutable,
  tryLayoutSchematic,
} from '../../../core/schematic/schematic.layout';
import type { GridPosition, MachineSchematic } from '../../../core/schematic/schematic.models';
import { validateSchematic } from '../../../core/schematic/schematic.validate';
import { CsIcon } from '../../../shared/icons/cs-icon/cs-icon';
import { SchematicShapes } from '../../dashboard/schematic/schematic-shapes/schematic-shapes';
import { machineFieldOptions } from '../machine-form/machine-field-options';
import {
  machineFormSchema,
  toMachineFormValue,
  toSchematicDocument,
  type MachineFormValue,
  type PipeFormValue,
} from '../machine-form/machine-form-model';
import { NodeFields } from '../machine-form/node-fields/node-fields';
import { PipeFields } from '../machine-form/pipe-fields/pipe-fields';
import { SensorFields } from '../machine-form/sensor-fields/sensor-fields';
import {
  blockedCells,
  dragTargetCell,
  dropVerdict,
  edgeScrollDelta,
  sameCell,
  steppedCell,
  toLayoutPoint,
  type CanvasBox,
  type CellOccupant,
  type LayoutPoint,
} from './diagram-drag';
import {
  TAG_CHIP_HEIGHT_PX,
  TAG_HIT_HEIGHT_PX,
  TAG_CHIP_WIDTH_PX,
  buildDiagram,
  cellRect,
  markerFor,
  type DiagramNodeVm,
  type DiagramSelection,
} from './diagram-view';
import { injectToast } from '../../../shared/toasts';
import { machineDocumentErrors } from '../../../core/machines/machine-document';
import { canonicalMachineJson } from '../machine-form/machine-form-model';

/** Pointer travel (layout px) below which a press still counts as a click, not a drag. */
const DRAG_THRESHOLD_PX = 4;
const EDGE_SCROLL_ZONE_PX = 48;
const EDGE_SCROLL_STEP_PX = 18;
const SHAKE_MS = 350;
/** Lifetime of the keyboard cell-target preview flash. */
const KEY_FLASH_MS = 700;
/** Lifetime of the pipes' re-route settle crossfade after a successful move. */
const PIPE_SETTLE_MS = 320;
/** Clearance between a selection and its floating toolbar, and rows too shallow to fit it. */
const TOOLBAR_GAP_PX = 12;
const TOOLBAR_FLIP_PX = 72;
/** Half the widest toolbar; keeps the centred toolbar inside the canvas near its edges. */
const TOOLBAR_CLAMP_PX = 64;
const NO_EMISSION = Symbol('no diagram draft emission');

/**
 * The zoom detents of the edit canvas. Discrete keys instead of pinch: the canvas pans on the
 * browser's own scrolling, and a custom two-finger recogniser would race the native pan into
 * pointercancel — keys deliver touch zoom with zero gesture conflict. 0.35 fits a full profile
 * grid on a phone; drag/keyboard math is zoom-proof because every pointer projection measures
 * the rendered box at capture time.
 */
const ZOOM_LEVELS: readonly number[] = [0.35, 0.5, 0.65, 0.8, 1, 1.25, 1.5];

/** The arrow keys the canvas, and the dock's nudge cluster, move a selected node with. */
export type NudgeKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

interface CellFlash {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly rejected: boolean;
}

interface DragState {
  readonly pointerId: number;
  readonly nodeIndex: number;
  readonly nodeId: string;
  readonly captureTarget: SVGSVGElement;
  readonly originCell: GridPosition;
  readonly origin: LayoutPoint;
  readonly point: LayoutPoint;
  readonly projection: CanvasProjection;
  readonly moved: boolean;
}

interface CanvasProjection {
  readonly box: CanvasBox;
  readonly layoutWidth: number;
  readonly layoutX: number;
  readonly layoutY: number;
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly scrollViewport: { readonly left: number; readonly right: number } | undefined;
  readonly maxScrollLeft: number;
  readonly windowScrollX: number;
  readonly windowScrollY: number;
}

interface DiagramOperationError {
  readonly key: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

/**
 * The Diagram tab (configurator spec §4.3, phase B): the schematic engine's layout rendered as
 * an *edit* surface — drag a node between grid cells with a live ghost and collision rejection,
 * click or Tab onto a node/pipe/sensor to select it, and edit the selection in a properties
 * panel built from the Form tab's own field components (one set of constrained fields, zero
 * duplicated validation). The component edits the editor's shared draft: it re-seeds its model
 * from every foreign draft (Form/JSON) and shows the §9 error panel instead of the canvas when
 * that draft does not validate.
 */
@Component({
  selector: 'app-machine-diagram',
  imports: [
    ButtonModule,
    CsIcon,
    NodeFields,
    PipeFields,
    SchematicShapes,
    SensorFields,
    TranslocoPipe,
  ],
  templateUrl: './machine-diagram.html',
  styleUrls: ['./machine-diagram.css', './diagram-controls.css', './diagram-interactions.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MachineDiagram {
  readonly doc = input<MachineSchematic>(K207_SCHEMATIC);
  readonly profile = input<MachineProfile>(CHILLER_PROFILE);
  readonly locked = input(false);
  /** The editor's shared draft — untrusted, possibly JSON-tab damage; validate before drawing. */
  readonly draft = input<unknown>(K207_SCHEMATIC);

  readonly draftChange = output<unknown>();
  readonly saved = output<MachineSchematic>();

  readonly #store = inject(MachineLibraryStore);
  readonly #destroyRef = inject(DestroyRef);
  readonly #toast = injectToast();
  readonly #transloco = inject(TranslocoService);
  readonly #translator = injectTranslator();

  private readonly svgRef = viewChild<ElementRef<SVGSVGElement>>('svg');
  private readonly scrollRef = viewChild<ElementRef<HTMLElement>>('scroll');
  private readonly canvasRef = viewChild<ElementRef<HTMLElement>>('canvas');
  private readonly propsRef = viewChild<ElementRef<HTMLElement>>('props');

  /** The candidate document this component most recently emitted, recognised by reference. */
  #lastEmitted: unknown = NO_EMISSION;
  /** The model created by the latest foreign draft hydration; it must not echo to the parent. */
  #hydratedModel: MachineFormValue | undefined;
  /** Consumed by the model effect after a non-echo draft replaces the editor's local model. */
  #foreignHydrationPending = false;

  /**
   * The edit model, re-seeded from every *foreign* draft (another tab's edit, a selection or a
   * save) but kept when the incoming draft is just this component's own emission echoed back —
   * otherwise each keystroke in the properties panel would rebuild the form under the caret.
   * An invalid foreign draft keeps the last good model; the canvas shows errors instead.
   */
  protected readonly model = linkedSignal<unknown, MachineFormValue>({
    source: this.draft,
    computation: (raw, previous) => {
      if (previous !== undefined && raw === this.#lastEmitted) {
        this.#lastEmitted = NO_EMISSION;
        this.#foreignHydrationPending = false;
        return previous.value;
      }
      this.#lastEmitted = NO_EMISSION;
      this.#foreignHydrationPending = previous !== undefined;
      const structural = validateSchematic(raw);
      const hydrated = structural.ok
        ? toMachineFormValue(structural.doc, this.profile())
        : (previous?.value ?? toMachineFormValue(this.doc(), this.profile()));
      this.#hydratedModel = hydrated;
      return hydrated;
    },
  });

  protected readonly form = form(
    this.model,
    machineFormSchema(
      () => this.profile(),
      () => this.locked(),
    ),
  );

  readonly #candidate = computed(() => toSchematicDocument(this.model(), this.profile().id));

  readonly #draftValidation = computed(() => validateSchematic(this.draft()));
  readonly #canvasValidation = computed(() => validateSchematic(this.#candidate()));
  readonly #profileErrors = computed<readonly string[]>(() => {
    const validation = this.#canvasValidation();
    return validation.ok ? validateAgainstProfile(validation.doc, this.profile()) : [];
  });
  readonly #layoutResult = computed(() => {
    const validation = this.#canvasValidation();
    return validation.ok && this.#profileErrors().length === 0
      ? tryLayoutSchematic(validation.doc)
      : undefined;
  });

  /** Foreign damage (e.g. the JSON tab) first; then anything the properties panel broke. */
  protected readonly errors = computed<readonly string[]>(() => {
    const draftValidation = this.#draftValidation();
    if (!draftValidation.ok) {
      return draftValidation.errors;
    }
    const canvasValidation = this.#canvasValidation();
    if (!canvasValidation.ok) {
      return canvasValidation.errors;
    }
    const profileErrors = this.#profileErrors();
    if (profileErrors.length > 0) {
      return profileErrors;
    }
    const layoutResult = this.#layoutResult();
    return layoutResult && !layoutResult.ok ? [layoutResult.error] : [];
  });

  protected readonly errorCopies = computed(() => machineValidationCopies(this.errors()));

  readonly #layout = computed(() => {
    const result = this.#layoutResult();
    return result?.ok ? result.layout : undefined;
  });

  protected readonly view = computed(() => {
    const layout = this.#layout();
    const validation = this.#canvasValidation();
    if (!layout || !validation.ok) {
      return undefined;
    }
    const translate = this.#translator();
    return buildDiagram(layout, this.profile().gridSize, (nodeId, fallback) =>
      displayNodeLabel(validation.doc.id, nodeId, fallback, translate),
    );
  });

  constructor() {
    effect(() => {
      this.draft();
      const model = this.model();
      const candidate = this.#candidate();
      if (this.#foreignHydrationPending) {
        this.#foreignHydrationPending = false;
        untracked(() => {
          this.#cancelDrag();
          this.deselect();
        });
      }
      if (model === this.#hydratedModel) {
        return;
      }
      this.#lastEmitted = candidate;
      this.draftChange.emit(candidate);
    });
    effect(() => {
      this.doc();
      untracked(() => {
        this.#cancelDrag();
        this.form().reset();
      });
    });
    effect(() => {
      if (this.locked()) {
        untracked(() => this.#cancelDrag());
      }
    });
    this.#destroyRef.onDestroy(() => {
      this.#cancelDrag();
      clearTimeout(this.#shakeTimer);
      clearTimeout(this.#keyFlashTimer);
      clearTimeout(this.#settleTimer);
    });
  }

  // ---- selection ----------------------------------------------------------------------------

  protected readonly selection = linkedSignal<MachineSchematic, DiagramSelection | undefined>({
    source: this.doc,
    computation: () => undefined,
  });

  /** The selection, dropped when its index no longer exists (e.g. the node was removed). */
  protected readonly selected = computed<DiagramSelection | undefined>(() => {
    const selection = this.selection();
    if (!selection) {
      return undefined;
    }
    const value = this.model();
    const length = {
      node: value.nodes.length,
      pipe: value.pipes.length,
      sensor: value.sensors.length,
    }[selection.kind];
    return selection.index < length ? selection : undefined;
  });

  /**
   * A one-element list keyed by the selection's identity: moving the selection recreates the
   * bracket elements, so their 120ms draw-in restarts for every newly selected thing.
   */
  protected readonly markers = computed(() => {
    const selection = this.selected();
    const layout = this.#layout();
    if (!selection || !layout || this.draggingIndex() !== undefined) {
      return [];
    }
    const marker = markerFor(selection, layout);
    return marker ? [{ key: `${selection.kind}:${selection.index}`, marker }] : [];
  });

  /**
   * The floating quick-action strip, projected from SVG user space into the zoomed canvas. It
   * flips below shallow selections and hides while a drag is in flight.
   */
  protected readonly toolbar = computed(() => {
    const vm = this.view();
    const entry = this.markers()[0];
    const selection = this.selected();
    if (!vm || !entry || !selection || this.draggingIndex() !== undefined) {
      return undefined;
    }
    const { marker } = entry;
    const zoom = this.zoom();
    const half = marker.kind === 'box' ? (marker.height / 2) * zoom : 0;
    const centerX = (marker.mid.x - vm.x) * zoom;
    const centerY = (marker.mid.y - vm.y) * zoom;
    const below = centerY - half < TOOLBAR_FLIP_PX;
    const edge = below ? centerY + half : centerY - half;
    const canvasWidth = vm.width * zoom;
    return {
      key: entry.key,
      kind: selection.kind,
      below,
      left: Math.min(Math.max(centerX, TOOLBAR_CLAMP_PX), canvasWidth - TOOLBAR_CLAMP_PX),
      top: edge + (below ? TOOLBAR_GAP_PX : -TOOLBAR_GAP_PX),
    };
  });

  protected select(kind: DiagramSelection['kind'], index: number): void {
    this.#clearOperationFeedback();
    this.selection.set({ kind, index });
  }

  protected deselect(): void {
    this.#clearOperationFeedback();
    this.selection.set(undefined);
    this.focusedNodeId.set(undefined);
  }

  protected isSelected(kind: DiagramSelection['kind'], index: number): boolean {
    const selection = this.selected();
    return selection?.kind === kind && selection.index === index;
  }

  protected focusProperties(): void {
    const props = this.propsRef()?.nativeElement;
    if (!props) {
      return;
    }
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    props.scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    props.focus({ preventScroll: true });
  }

  protected onToolbarEscape(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.#cancelDrag();
    this.deselect();
    this.canvasRef()?.nativeElement.focus();
  }

  protected removeSelected(): void {
    const selection = this.selected();
    if (!selection || this.locked()) {
      return;
    }
    if (selection.kind === 'node') {
      this.removeNode(selection.index);
    } else if (selection.kind === 'pipe') {
      this.removePipe(selection.index);
    }
  }

  // ---- hover dependency web: a node lights the pipes and sensor tags that depend on it --------

  protected readonly hoveredNodeId = signal<string | undefined>(undefined);
  protected readonly focusedNodeId = signal<string | undefined>(undefined);

  readonly #webNodeId = computed(() => {
    const focused = this.focusedNodeId();
    if (focused !== undefined) {
      return focused;
    }
    const selection = this.selected();
    if (selection?.kind === 'node') {
      return this.model().nodes[selection.index]?.id;
    }
    return this.hoveredNodeId();
  });

  protected readonly web = computed(() => {
    const id = this.#webNodeId();
    const vm = this.view();
    if (id === undefined || vm === undefined || !vm.nodes.some((node) => node.id === id)) {
      return undefined;
    }
    const neighbours = vm.pipes.flatMap((pipe) =>
      pipe.from === id ? [pipe.to] : pipe.to === id ? [pipe.from] : [],
    );
    return {
      nodes: new Set([id, ...neighbours]),
      pipes: new Set(
        vm.pipes.filter((pipe) => pipe.from === id || pipe.to === id).map((pipe) => pipe.index),
      ),
      tags: new Set(vm.tags.filter((tag) => tag.attachTo === id).map((tag) => tag.index)),
    };
  });

  protected isDimmedNode(id: string): boolean {
    const web = this.web();
    return web !== undefined && !web.nodes.has(id);
  }

  protected focusNode(node: DiagramNodeVm): void {
    this.focusedNodeId.set(node.id);
    this.select('node', node.index);
  }

  protected blurNode(id: string): void {
    if (this.focusedNodeId() === id) {
      this.focusedNodeId.set(undefined);
    }
  }

  protected onSelectionKeydown(
    event: KeyboardEvent,
    kind: DiagramSelection['kind'],
    index: number,
  ): void {
    if (event.key !== 'Enter' && event.key !== 'F2' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.select(kind, index);
    if (event.key === 'Enter' || event.key === 'F2') {
      this.focusProperties();
    }
  }

  // ---- drag ---------------------------------------------------------------------------------

  readonly #drag = signal<DragState | undefined>(undefined);

  protected readonly shakeId = signal<string | undefined>(undefined);
  protected readonly moveAnnouncement = signal('');
  /** Keyboard cell-target preview: the cell an arrow move just landed on (or bounced off). */
  protected readonly keyFlash = signal<CellFlash | undefined>(undefined);
  /** True briefly after a successful move, while the re-routed pipes crossfade into place. */
  protected readonly pipesSettling = signal(false);
  #shakeTimer: ReturnType<typeof setTimeout> | undefined;
  #keyFlashTimer: ReturnType<typeof setTimeout> | undefined;
  #settleTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly draggingIndex = computed(() => {
    const drag = this.#drag();
    return drag?.moved ? drag.nodeIndex : undefined;
  });

  /** The grid materialises while either input mode is placing a node. */
  protected readonly gridLit = computed(
    () => this.draggingIndex() !== undefined || this.keyFlash() !== undefined,
  );

  readonly #draggedNodeId = computed(() => {
    const drag = this.#drag();
    return drag?.moved ? drag.nodeId : undefined;
  });

  /** No-go cells for the lifted node; memoised on the node's identity, not on pointer travel. */
  protected readonly blocked = computed(() => {
    const nodeId = this.#draggedNodeId();
    if (nodeId === undefined) {
      return [];
    }
    return blockedCells(this.#occupants(), this.profile().gridSize, nodeId).map(cellRect);
  });

  protected readonly ghost = computed(() => {
    const drag = this.#drag();
    if (!drag?.moved) {
      return undefined;
    }
    const grid = this.profile().gridSize;
    const cell = dragTargetCell(drag.originCell, drag.origin, drag.point, grid);
    if (!cell) {
      return undefined;
    }
    const verdict = dropVerdict(this.#occupants(), grid, drag.nodeId, cell);
    return { ...cellRect(cell), rejected: verdict !== 'free' };
  });

  /**
   * CSS-transform positioning (px equal layout units inside the SVG): the lifted node tracks the
   * pointer with transitions off, and on release the same property springs to the snapped cell.
   */
  protected nodeStyle(node: DiagramNodeVm): string {
    const drag = this.#drag();
    if (!drag?.moved || drag.nodeIndex !== node.index) {
      return `translate(${node.x}px, ${node.y}px)`;
    }
    const dx = drag.point.x - drag.origin.x;
    const dy = drag.point.y - drag.origin.y;
    return `translate(${node.x + dx}px, ${node.y + dy}px)`;
  }

  protected onNodePointerDown(event: PointerEvent, node: DiagramNodeVm): void {
    if (event.isPrimary === false || this.#drag() !== undefined) {
      return;
    }
    this.select('node', node.index);
    const target = event.currentTarget as SVGGElement;
    target.focus?.();
    if (this.locked() || event.button !== 0) {
      return;
    }
    const originCell = this.#nodeCell(node.index);
    const projection = this.#captureProjection();
    const captureTarget = this.svgRef()?.nativeElement;
    if (!originCell || !projection || !captureTarget) {
      return;
    }
    const point = this.#layoutPoint(event, projection);
    this.#drag.set({
      pointerId: event.pointerId,
      nodeIndex: node.index,
      nodeId: node.id,
      captureTarget,
      originCell,
      origin: point,
      point,
      projection,
      moved: false,
    });
    try {
      captureTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers (tests, assistive tech) have no active pointer to capture; the drag
      // still works through the events bubbling to the SVG.
    }
  }

  protected onPointerMove(event: PointerEvent): void {
    const drag = this.#drag();
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    this.#scrollNearEdge(event.clientX, drag.projection);
    const point = this.#layoutPoint(event, drag.projection);
    const moved =
      drag.moved ||
      Math.hypot(point.x - drag.origin.x, point.y - drag.origin.y) > DRAG_THRESHOLD_PX;
    this.#drag.set({ ...drag, point, moved });
  }

  protected onPointerUp(event: PointerEvent): void {
    const drag = this.#drag();
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    const point = this.#layoutPoint(event, drag.projection);
    const moved =
      drag.moved ||
      Math.hypot(point.x - drag.origin.x, point.y - drag.origin.y) > DRAG_THRESHOLD_PX;
    this.#finishDrag(drag);
    if (!moved || this.locked()) {
      return;
    }
    const grid = this.profile().gridSize;
    const cell = dragTargetCell(drag.originCell, drag.origin, point, grid);
    if (cell && dropVerdict(this.#occupants(), grid, drag.nodeId, cell) === 'free') {
      if (!sameCell(cell, drag.originCell) && !this.#moveNode(drag.nodeIndex, cell)) {
        this.#shake(drag.nodeId, cell);
      }
    } else {
      this.#shake(drag.nodeId, cell ?? this.#nodeCell(drag.nodeIndex));
    }
  }

  protected onPointerCancel(event: PointerEvent): void {
    const drag = this.#drag();
    if (event.pointerId === drag?.pointerId) {
      this.#finishDrag(drag);
    }
  }

  // ---- keyboard (spec §6): arrows move the selected node under the same collision rules ------

  protected onCanvasKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.#cancelDrag();
      this.deselect();
      return;
    }
    if (this.#stepSelectedNode(event.key)) {
      event.preventDefault();
    }
  }

  /**
   * The dock's nudge cluster (touch and compact widths): the precision-drag alternative — the
   * exact keyboard pipeline, so collision rules, cell flash, rejection shake and the polite
   * position announcement stay one implementation.
   */
  protected nudgeSelected(key: NudgeKey): void {
    this.#stepSelectedNode(key);
  }

  /** True when the key addressed a movable selected node — accepted or visibly rejected. */
  #stepSelectedNode(key: string): boolean {
    const selection = this.selected();
    if (!selection || selection.kind !== 'node' || this.locked()) {
      return false;
    }
    const node = this.model().nodes[selection.index];
    if (!node || node.column === null || node.row === null) {
      return false;
    }
    const target = steppedCell([node.column, node.row], key);
    if (!target) {
      return false;
    }
    const collisionFree =
      dropVerdict(this.#occupants(), this.profile().gridSize, node.id, target) === 'free';
    const accepted = collisionFree && this.#moveNode(selection.index, target);
    if (!accepted) {
      this.#shake(node.id, target);
    }
    this.#flashCell(target, !accepted);
    return true;
  }

  // ---- zoom: discrete detents; the SVG rescales, the layout units never change ---------------

  protected readonly zoom = signal(1);

  protected readonly zoomedWidth = computed(() => {
    const vm = this.view();
    return vm === undefined ? 0 : vm.width * this.zoom();
  });

  protected readonly zoomLabel = computed(() => `${Math.round(this.zoom() * 100)}%`);
  protected readonly canZoomIn = computed(() => this.zoom() < (ZOOM_LEVELS.at(-1) ?? 1));
  protected readonly canZoomOut = computed(() => this.zoom() > (ZOOM_LEVELS[0] ?? 1));

  protected zoomIn(): void {
    this.#stepZoom(1);
  }

  protected zoomOut(): void {
    this.#stepZoom(-1);
  }

  protected zoomReset(): void {
    this.zoom.set(1);
  }

  #stepZoom(direction: 1 | -1): void {
    const at = ZOOM_LEVELS.indexOf(this.zoom());
    const index = at === -1 ? ZOOM_LEVELS.indexOf(1) : at;
    const next = ZOOM_LEVELS[Math.min(Math.max(index + direction, 0), ZOOM_LEVELS.length - 1)];
    if (next !== undefined) {
      this.zoom.set(next);
    }
  }

  // ---- properties panel plumbing (the very option builders the Form tab uses) -----------------

  readonly #fieldOptions = machineFieldOptions(
    () => this.profile(),
    () => this.model().nodes,
  );

  protected readonly typeOptions = this.#fieldOptions.typeOptions;
  protected readonly nodeOptions = this.#fieldOptions.nodeOptions;
  protected readonly attachOptions = this.#fieldOptions.attachOptions;

  protected removeNode(index: number): void {
    if (this.locked()) {
      return;
    }
    const value = this.model();
    const node = value.nodes[index];
    if (!node) {
      return;
    }

    const incoming = value.pipes.filter((pipe) => pipe.to === node.id);
    const outgoing = value.pipes.filter((pipe) => pipe.from === node.id);
    const terminalSafetyBranch =
      node.type === 'safetyValve' && incoming.length === 1 && outgoing.length === 0;
    const simpleCircuitNode = incoming.length === 1 && outgoing.length === 1;
    const candidate = this.#withoutNode(value, index, incoming, outgoing, simpleCircuitNode);
    const typeCount = value.nodes.filter((entry) => entry.type === node.type).length;

    if (typeCount <= this.profile().nodeRules[node.type].min) {
      this.#rejectOperation(candidate, {
        key: 'machines.diagram.deleteRequired',
        params: { id: node.id },
      });
      return;
    }
    const sensor = value.sensors.find((entry) => entry.attachTo === node.id);
    if (sensor) {
      this.#rejectOperation(candidate, {
        key: 'machines.diagram.deleteInstrumented',
        params: { id: node.id, tag: sensor.tag },
      });
      return;
    }
    if (!terminalSafetyBranch && !simpleCircuitNode) {
      this.#rejectOperation(candidate, {
        key: 'machines.diagram.deleteComplex',
        params: { id: node.id, incoming: incoming.length, outgoing: outgoing.length },
      });
      return;
    }
    this.#applyOperation(candidate, 'machines.diagram.deleteWouldInvalidate');
  }

  protected removePipe(index: number): void {
    if (this.locked()) {
      return;
    }
    const value = this.model();
    if (!value.pipes[index]) {
      return;
    }
    const candidate: MachineFormValue = {
      ...value,
      pipes: value.pipes.filter((_, at) => at !== index),
    };
    this.#applyOperation(candidate, 'machines.diagram.deletePipeWouldInvalidate');
  }

  // ---- save / revert (the same two-layer gate the Form tab applies) --------------------------

  protected readonly storeErrors = linkedSignal<unknown, readonly string[]>({
    source: this.model,
    computation: () => [],
  });
  protected readonly operationError = linkedSignal<
    MachineFormValue,
    DiagramOperationError | undefined
  >({
    source: this.model,
    computation: () => undefined,
  });
  protected readonly storeErrorCopies = computed(() => machineValidationCopies(this.storeErrors()));

  readonly #savedCanonical = computed(() => canonicalMachineJson(this.doc()));

  protected readonly dirty = computed(
    () => JSON.stringify(this.#candidate()) !== this.#savedCanonical(),
  );

  protected readonly saveDisabled = computed(
    () => this.locked() || !this.dirty() || this.errors().length > 0,
  );

  protected save(): void {
    if (this.saveDisabled()) {
      return;
    }
    const result = this.#store.update(this.doc().id, this.#candidate());
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

  protected revert(): void {
    this.deselect();
    const doc = this.doc();
    const model = toMachineFormValue(doc, MACHINE_PROFILES[doc.profileId]);
    this.#hydratedModel = model;
    this.#lastEmitted = doc;
    this.model.set(model);
    this.form().reset();
    this.draftChange.emit(doc);
  }

  // ---- internals -----------------------------------------------------------------------------

  protected readonly tagChipWidth = TAG_CHIP_WIDTH_PX;
  protected readonly tagChipHeight = TAG_CHIP_HEIGHT_PX;
  protected readonly tagHitHeight = TAG_HIT_HEIGHT_PX;
  protected readonly placementStep = PLACEMENT_STEP_PX;

  readonly #occupants = computed<readonly CellOccupant[]>(() =>
    this.model().nodes.flatMap((node) =>
      node.column !== null && node.row !== null
        ? [{ id: node.id, type: node.type, grid: [node.column, node.row] as GridPosition }]
        : [],
    ),
  );

  #moveNode(index: number, cell: GridPosition): boolean {
    const current = this.#nodeCell(index);
    if (current && sameCell(current, cell)) {
      return true;
    }
    const value = this.model();
    const nodeId = value.nodes[index]?.id;
    const candidate: MachineFormValue = {
      ...value,
      nodes: value.nodes.map((node, at) =>
        at === index ? { ...node, column: cell[0], row: cell[1] } : node,
      ),
    };
    const validation = validateSchematic(toSchematicDocument(candidate, this.profile().id));
    if (
      !validation.ok ||
      validateAgainstProfile(validation.doc, this.profile()).length > 0 ||
      !isSchematicRoutable(validation.doc)
    ) {
      return false;
    }
    this.model.set(candidate);
    this.#settlePipes();
    if (nodeId !== undefined) {
      this.#announcePosition(nodeId, cell, false);
    }
    return true;
  }

  #withoutNode(
    value: MachineFormValue,
    index: number,
    incoming: readonly PipeFormValue[],
    outgoing: readonly PipeFormValue[],
    bridge: boolean,
  ): MachineFormValue {
    const node = value.nodes[index];
    if (!node) {
      return value;
    }
    const inlet = incoming[0];
    const outlet = outgoing[0];
    const firstConnection = value.pipes.findIndex(
      (pipe) => pipe.from === node.id || pipe.to === node.id,
    );
    const bridgedPipe =
      bridge && inlet && outlet ? { from: inlet.from, to: outlet.to, side: inlet.side } : undefined;

    return {
      ...value,
      nodes: value.nodes.filter((_, at) => at !== index),
      pipes: value.pipes.flatMap((pipe, at) => {
        const connected = pipe.from === node.id || pipe.to === node.id;
        if (!connected) {
          return [pipe];
        }
        return at === firstConnection && bridgedPipe ? [bridgedPipe] : [];
      }),
    };
  }

  #applyOperation(candidate: MachineFormValue, errorKey: string): void {
    const errors = this.#operationValidationErrors(candidate);
    if (errors.length > 0) {
      this.storeErrors.set(errors);
      this.operationError.set({ key: errorKey });
      return;
    }
    this.canvasRef()?.nativeElement.focus();
    this.deselect();
    this.storeErrors.set([]);
    this.operationError.set(undefined);
    this.model.set(candidate);
    this.#settlePipes();
  }

  #rejectOperation(candidate: MachineFormValue, error: DiagramOperationError): void {
    this.storeErrors.set(this.#operationValidationErrors(candidate));
    this.operationError.set(error);
  }

  #operationValidationErrors(candidate: MachineFormValue): readonly string[] {
    return machineDocumentErrors(toSchematicDocument(candidate, this.profile().id), this.profile());
  }

  #clearOperationFeedback(): void {
    if (this.operationError() === undefined) {
      return;
    }
    this.operationError.set(undefined);
    this.storeErrors.set([]);
  }

  /** Two timeouts so a second rejection on the same node restarts the CSS animation. */
  #shake(id: string, cell: GridPosition | undefined): void {
    clearTimeout(this.#shakeTimer);
    this.shakeId.set(undefined);
    if (cell !== undefined) {
      this.#announcePosition(id, cell, true);
    }
    this.#shakeTimer = setTimeout(() => {
      this.shakeId.set(id);
      this.#shakeTimer = setTimeout(() => this.shakeId.set(undefined), SHAKE_MS);
    });
  }

  /** Same restart trick as {@link #shake}: drop the element, then recreate it a tick later. */
  #flashCell(cell: GridPosition, rejected: boolean): void {
    clearTimeout(this.#keyFlashTimer);
    this.keyFlash.set(undefined);
    this.#keyFlashTimer = setTimeout(() => {
      this.keyFlash.set({ ...cellRect(cell), rejected });
      this.#keyFlashTimer = setTimeout(() => this.keyFlash.set(undefined), KEY_FLASH_MS);
    });
  }

  /** Re-routed pipes crossfade rather than teleport; the class toggle re-runs the animation. */
  #settlePipes(): void {
    clearTimeout(this.#settleTimer);
    this.pipesSettling.set(false);
    this.#settleTimer = setTimeout(() => {
      this.pipesSettling.set(true);
      this.#settleTimer = setTimeout(() => this.pipesSettling.set(false), PIPE_SETTLE_MS);
    });
  }

  #nodeCell(index: number): GridPosition | undefined {
    const node = this.model().nodes[index];
    return node && node.column !== null && node.row !== null ? [node.column, node.row] : undefined;
  }

  #announcePosition(id: string, cell: GridPosition, rejected: boolean): void {
    const node = this.#transloco.translate('machines.diagram.nodeAria', { id });
    const column = this.#transloco.translate('machines.form.column');
    const row = this.#transloco.translate('machines.form.row');
    const position = `${node}. ${column} ${cell[0]}. ${row} ${cell[1]}.`;
    this.moveAnnouncement.set(
      rejected ? `${position} ${this.#transloco.translate('validation.invalid')}` : position,
    );
  }

  #cancelDrag(): void {
    const drag = this.#drag();
    if (drag) {
      this.#finishDrag(drag);
    }
  }

  #finishDrag(drag: DragState): void {
    this.#drag.set(undefined);
    try {
      drag.captureTarget.releasePointerCapture(drag.pointerId);
    } catch {
      // Synthetic pointers and a browser-driven pointercancel may already have released capture.
    }
  }

  #captureProjection(): CanvasProjection | undefined {
    const svg = this.svgRef()?.nativeElement;
    const view = this.view();
    if (!svg || view === undefined) {
      return undefined;
    }
    const box = svg.getBoundingClientRect();
    const scroll = this.scrollRef()?.nativeElement;
    const scrollBox = scroll?.getBoundingClientRect();
    const window = svg.ownerDocument.defaultView;
    return {
      box: { left: box.left, top: box.top, width: box.width },
      layoutWidth: view.width,
      layoutX: view.x,
      layoutY: view.y,
      scrollLeft: scroll?.scrollLeft ?? 0,
      scrollTop: scroll?.scrollTop ?? 0,
      scrollViewport:
        scrollBox === undefined ? undefined : { left: scrollBox.left, right: scrollBox.right },
      maxScrollLeft:
        scroll === undefined ? 0 : Math.max(0, scroll.scrollWidth - scroll.clientWidth),
      windowScrollX: window?.scrollX ?? 0,
      windowScrollY: window?.scrollY ?? 0,
    };
  }

  #scrollNearEdge(clientX: number, projection: CanvasProjection): void {
    const scroll = this.scrollRef()?.nativeElement;
    const viewport = projection.scrollViewport;
    if (!scroll || !viewport || projection.maxScrollLeft === 0) {
      return;
    }
    const delta = edgeScrollDelta(
      clientX,
      viewport.left,
      viewport.right,
      EDGE_SCROLL_ZONE_PX,
      EDGE_SCROLL_STEP_PX,
    );
    if (delta === 0) {
      return;
    }
    const next = Math.min(projection.maxScrollLeft, Math.max(0, scroll.scrollLeft + delta));
    if (next !== scroll.scrollLeft) {
      scroll.scrollLeft = next;
    }
  }

  #layoutPoint(event: PointerEvent, projection: CanvasProjection): LayoutPoint {
    const svg = this.svgRef()?.nativeElement;
    const scroll = this.scrollRef()?.nativeElement;
    const window = svg?.ownerDocument.defaultView;
    const scrollX = (scroll?.scrollLeft ?? projection.scrollLeft) - projection.scrollLeft;
    const scrollY = (scroll?.scrollTop ?? projection.scrollTop) - projection.scrollTop;
    const windowScrollX = (window?.scrollX ?? projection.windowScrollX) - projection.windowScrollX;
    const windowScrollY = (window?.scrollY ?? projection.windowScrollY) - projection.windowScrollY;
    return toLayoutPoint(
      event.clientX,
      event.clientY,
      {
        left: projection.box.left - scrollX - windowScrollX,
        top: projection.box.top - scrollY - windowScrollY,
        width: projection.box.width,
      },
      projection.layoutWidth,
      projection.layoutX,
      projection.layoutY,
    );
  }
}

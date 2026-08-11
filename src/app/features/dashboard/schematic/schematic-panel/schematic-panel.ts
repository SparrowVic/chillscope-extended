import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import type { MeasurementSeries } from '../../../../core/data/measurement.models';
import { classify } from '../../../../core/data/series.catalog';
import { machineValidationCopies } from '../../../../core/i18n/machine-validation-copy';
import { injectTranslator } from '../../../../core/i18n/translator';
import {
  displayMachineName,
  displayNodeLabel,
} from '../../../../core/machines/builtin-machine-copy';
import { K207_SCHEMATIC } from '../../../../core/schematic/k207.schematic';
import { tryLayoutSchematic } from '../../../../core/schematic/schematic.layout';
import { validateSchematic } from '../../../../core/schematic/schematic.validate';
import {
  CsSegmentedControl,
  type SegmentedControlOption,
} from '../../../../shared/controls/segmented-control/segmented-control';
import type { MeasurementStatus } from '../../../../shared/severity';
import { CsDigitMorph } from '../../../../shared/motion/digit-morph/digit-morph';
import { injectMeasurementFormatter } from '../../formatting';
import {
  buildFrame,
  buildTags,
  type SchematicEffectVm,
  type SchematicNodeVm,
  type SchematicPipeVm,
  type SchematicTagVm,
} from '../schematic-frame';
import { SchematicShapes } from '../schematic-shapes/schematic-shapes';
import {
  effectDurationSeconds,
  effectIntensity,
  effectIsActive,
  flowDurationSeconds,
  latestReadings,
  packetDurationSeconds,
  spinDurationSeconds,
  telemetryState,
  type TelemetryState,
} from '../schematic.view-model';

/**
 * The Dashboard hero validates the machine document, lays it out through the
 * schematic engine and renders it — nodes from the symbol library, temperature-tinted pipes with
 * a flow-scaled dash animation, and live instrument tags hung off their nodes. A document that
 * fails validation renders the error panel, never a broken drawing.
 *
 * Machine working state is information, so this surface can glow and
 * move: every component carries its own working choreography, gated on its drive actually
 * running, and the whole drawing draws itself in when the active machine changes.
 */
/**
 * How the drawing meets a panel narrower than itself: `pan` keeps the deliberate 1:1 canvas
 * (touch pans it natively inside the panel), `fit` scales the whole circuit into view for
 * orientation. Only narrow screens surface the switch — wider panels fit the drawing anyway.
 */
export type SchematicView = 'pan' | 'fit';

const VIEW_OPTIONS: readonly SegmentedControlOption<SchematicView>[] = [
  { value: 'pan', label: 'dashboard.schematic.view.pan' },
  { value: 'fit', label: 'dashboard.schematic.view.fit' },
];

@Component({
  selector: 'app-schematic-panel',
  imports: [CsDigitMorph, CsSegmentedControl, SchematicShapes, TranslocoPipe],
  templateUrl: './schematic-panel.html',
  // Five focused sheets stay within budget: process, instruments, console chrome, choreography
  // rules, and the keyframe vocabulary those rules reference.
  styleUrls: [
    './schematic-panel.css',
    '../schematic-instruments.css',
    '../schematic-console.css',
    '../schematic-motion.css',
    '../schematic-keyframes.css',
  ],
  host: { class: 'cs-panel' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchematicPanel {
  /** Untrusted by design — the §9 contract is "validate, then draw". */
  readonly doc = input<unknown>(K207_SCHEMATIC);
  readonly series = input.required<readonly MeasurementSeries[]>();
  /** The Machines editor reuses the panel as its live preview under its own caption. */
  readonly titleKey = input('dashboard.schematic.title');
  /** The configurator adds profile-envelope failures after structural validation. */
  readonly externalErrors = input<readonly string[]>([]);
  readonly telemetryLoading = input(false);
  readonly telemetryFailed = input(false);

  readonly #translator = injectTranslator();
  readonly #transloco = inject(TranslocoService);
  readonly #format = injectMeasurementFormatter();

  protected readonly viewOptions = VIEW_OPTIONS;
  /** Session-local by design: the deliberate pannable canvas stays the default on every visit. */
  protected readonly view = signal<SchematicView>('pan');

  private readonly scroll = viewChild<ElementRef<HTMLElement>>('scroll');

  constructor() {
    // Re-centre after a machine switch as well as on first paint; a retained scroll offset from a
    // wider document can otherwise leave the next machine entirely outside the mobile viewport.
    // Tracks the view mode too: returning from overview would otherwise land on the left edge.
    afterRenderEffect(() => {
      this.frame();
      this.view();
      const element = this.scroll()?.nativeElement;
      if (element) {
        element.scrollLeft = (element.scrollWidth - element.clientWidth) / 2;
      }
    });
  }

  readonly #validation = computed(() => validateSchematic(this.doc()));

  readonly #layoutResult = computed(() => {
    const validation = this.#validation();
    return validation.ok && this.externalErrors().length === 0
      ? tryLayoutSchematic(validation.doc)
      : undefined;
  });

  protected readonly errors = computed<readonly string[]>(() => {
    const validation = this.#validation();
    if (!validation.ok) {
      return validation.errors;
    }
    const externalErrors = this.externalErrors();
    if (externalErrors.length > 0) {
      return externalErrors;
    }
    const layoutResult = this.#layoutResult();
    return layoutResult && !layoutResult.ok ? [layoutResult.error] : [];
  });

  protected readonly errorCopies = computed(() => machineValidationCopies(this.errors()));

  readonly #validated = computed(() => {
    const validation = this.#validation();
    const layoutResult = this.#layoutResult();
    return validation.ok && layoutResult?.ok
      ? { doc: validation.doc, layout: layoutResult.layout }
      : undefined;
  });

  protected readonly frame = computed(() => {
    const validated = this.#validated();
    if (!validated) {
      return undefined;
    }
    const translate = this.#translator();
    return buildFrame(
      validated.doc,
      validated.layout,
      (nodeId, fallback) => displayNodeLabel(validated.doc.id, nodeId, fallback, translate),
      displayMachineName(validated.doc, translate),
    );
  });

  readonly #readings = computed(() => latestReadings(this.series()));

  protected readonly tags = computed(() => {
    const validated = this.#validated();
    return validated ? buildTags(validated.layout, this.#readings(), this.#format()) : [];
  });

  /** Worst instrument status per node — the outline tint that says "look here" (§1). */
  readonly #nodeStatuses = computed<ReadonlyMap<string, MeasurementStatus>>(() => {
    const statuses = new Map<string, MeasurementStatus>();
    for (const tag of this.tags()) {
      if (tag.status === 'none') {
        continue;
      }
      const current = statuses.get(tag.nodeId);
      if (!current || RANK[tag.status] > RANK[current]) {
        statuses.set(tag.nodeId, tag.status);
      }
    }
    return statuses;
  });

  protected nodeStatus(nodeId: string): MeasurementStatus | undefined {
    return this.#nodeStatuses().get(nodeId);
  }

  readonly #flowReading = computed(() => this.#readings().get('flow'));

  /** Unknown is a first-class state: loss of telemetry is not a measured stop. */
  protected readonly flowState = computed<TelemetryState>(() =>
    telemetryState(this.#flowReading()),
  );

  protected readonly telemetryDisplayState = computed<TelemetryDisplayState>(() => {
    if (this.telemetryFailed()) {
      return this.#flowReading() === undefined ? 'error' : 'stale';
    }
    if (this.telemetryLoading() && this.#flowReading() === undefined) {
      return 'syncing';
    }
    return this.flowState();
  });

  protected readonly flowDuration = computed(() => {
    const reading = this.#flowReading();
    return reading === undefined ? null : seconds(flowDurationSeconds(reading.value));
  });

  readonly #motion = computed<MotionSnapshot>(() => {
    const readings = this.#readings();
    const flowRunning = this.flowState() === 'running';
    const nodes = new Map<string, NodeMotion>();
    for (const node of this.frame()?.nodes ?? []) {
      const effects = new Map<string, EffectMotion>();
      let running = false;
      for (const effect of node.fx) {
        const reading = readings.get(effect.drive);
        const active = flowRunning && effectIsActive(reading, effect.activation);
        const intensity = active ? effectIntensity(reading, effect.activation) : 0;
        running ||= active;
        effects.set(effect.kind, {
          active,
          duration: `${effectDurationSeconds(effect.kind, intensity).toFixed(3)}s`,
          opacity: 0.08 + intensity * 0.42,
          status: reading === undefined ? 'none' : classify(reading.value, reading.thresholds),
        });
      }
      // One drive gate for the whole mechanism: the first group's series decides, every layer
      // shares the clock; per-group speed/direction live in the template as CSS inputs.
      const lead = node.spins[0];
      const spinReading = lead ? readings.get(lead.drive) : undefined;
      const spinSeconds = lead
        ? spinDurationSeconds(lead.kind, spinReading?.value ?? 0)
        : undefined;
      const spin = {
        running: flowRunning && spinSeconds !== undefined,
        duration: seconds(spinSeconds),
      };
      running ||= spin.running;
      nodes.set(node.id, { effects, running, spin });
    }
    return { nodes };
  });

  readonly #pipeMotions = computed<ReadonlyMap<string, PipeMotion>>(() => {
    const reading = this.#flowReading();
    const running = this.flowState() === 'running';
    return new Map(
      (this.frame()?.pipes ?? []).map((pipe) => {
        const fromStatus = this.#nodeStatuses().get(pipe.fromId);
        const toStatus = this.#nodeStatuses().get(pipe.toId);
        const status = worstStatus(fromStatus, toStatus);
        const duration =
          reading === undefined ? undefined : packetDurationSeconds(reading.value, pipe.lengthPx);
        return [
          pipe.id,
          {
            anomalyMoving: running && (status === 'warning' || status === 'critical'),
            packetDuration: seconds(duration),
            reverseAnomaly:
              toStatus !== undefined &&
              (fromStatus === undefined || RANK[toStatus] > RANK[fromStatus]),
            status,
          },
        ];
      }),
    );
  });

  readonly #hoveredNode = signal<string | undefined>(undefined);
  readonly #focusedNode = signal<string | undefined>(undefined);
  protected readonly inspectedNode = computed(() => this.#focusedNode() ?? this.#hoveredNode());

  protected nodeMotion(node: SchematicNodeVm): NodeMotion {
    return this.#motion().nodes.get(node.id) ?? IDLE_NODE_MOTION;
  }

  protected effectMotion(nodeId: string, effect: SchematicEffectVm): EffectMotion {
    return this.#motion().nodes.get(nodeId)?.effects.get(effect.kind) ?? IDLE_EFFECT_MOTION;
  }

  protected spinMotion(nodeId: string): SpinMotion {
    return this.#motion().nodes.get(nodeId)?.spin ?? IDLE_SPIN_MOTION;
  }

  protected pipeMotion(pipe: SchematicPipeVm): PipeMotion {
    return this.#pipeMotions().get(pipe.id) ?? IDLE_PIPE_MOTION;
  }

  protected readonly diagramLabel = computed(() => {
    const frame = this.frame();
    if (!frame) {
      return '';
    }
    const translate = this.#translator();
    const subject = this.#transloco.translate<string>('dashboard.schematic.ariaLabel', {
      machine: frame.machineName,
    });
    return `${subject} ${frame.caption}. ${translate(`dashboard.schematic.state.${this.telemetryDisplayState()}`)}`;
  });

  protected nodeLabel(node: SchematicNodeVm): string {
    const status = this.nodeStatus(node.id);
    return status === undefined
      ? node.fullLabel
      : `${node.fullLabel} — ${this.#translator()(`severity.${status}`)}`;
  }

  protected tagPulse(tag: SchematicTagVm): boolean {
    return tag.pulse && this.flowState() === 'running';
  }

  protected inspectWithPointer(nodeId: string): void {
    this.#hoveredNode.set(nodeId);
  }

  protected clearPointerInspection(nodeId: string): void {
    if (this.#hoveredNode() === nodeId) {
      this.#hoveredNode.set(undefined);
    }
  }

  protected inspectWithFocus(nodeId: string): void {
    this.#focusedNode.set(nodeId);
  }

  protected clearFocusInspection(nodeId: string): void {
    if (this.#focusedNode() === nodeId) {
      this.#focusedNode.set(undefined);
    }
  }

  protected nodeIsDimmed(nodeId: string): boolean {
    const inspected = this.inspectedNode();
    return inspected !== undefined && inspected !== nodeId;
  }

  protected pipeIsInspected(pipe: SchematicPipeVm): boolean {
    const inspected = this.inspectedNode();
    return inspected !== undefined && (pipe.fromId === inspected || pipe.toId === inspected);
  }

  protected pipeIsDimmed(pipe: SchematicPipeVm): boolean {
    return this.inspectedNode() !== undefined && !this.pipeIsInspected(pipe);
  }
}

const RANK: Readonly<Record<MeasurementStatus, number>> = { ok: 0, warning: 1, critical: 2 };
type TelemetryDisplayState = TelemetryState | 'syncing' | 'error' | 'stale';

interface EffectMotion {
  readonly active: boolean;
  readonly duration: string;
  readonly opacity: number;
  readonly status: MeasurementStatus | 'none';
}

interface SpinMotion {
  readonly running: boolean;
  readonly duration: string | null;
}

interface NodeMotion {
  readonly effects: ReadonlyMap<string, EffectMotion>;
  readonly running: boolean;
  readonly spin: SpinMotion;
}

interface MotionSnapshot {
  readonly nodes: ReadonlyMap<string, NodeMotion>;
}

interface PipeMotion {
  readonly anomalyMoving: boolean;
  readonly packetDuration: string | null;
  readonly reverseAnomaly: boolean;
  readonly status: MeasurementStatus | undefined;
}

const IDLE_EFFECT_MOTION: EffectMotion = {
  active: false,
  duration: '3s',
  opacity: 0,
  status: 'none',
};
const IDLE_SPIN_MOTION: SpinMotion = { running: false, duration: null };
const IDLE_NODE_MOTION: NodeMotion = {
  effects: new Map(),
  running: false,
  spin: IDLE_SPIN_MOTION,
};
const IDLE_PIPE_MOTION: PipeMotion = {
  anomalyMoving: false,
  packetDuration: null,
  reverseAnomaly: false,
  status: undefined,
};

function seconds(value: number | undefined): string | null {
  return value === undefined ? null : `${value.toFixed(3)}s`;
}

function worstStatus(
  first: MeasurementStatus | undefined,
  second: MeasurementStatus | undefined,
): MeasurementStatus | undefined {
  if (first === undefined) {
    return second;
  }
  if (second === undefined) {
    return first;
  }
  return RANK[first] >= RANK[second] ? first : second;
}

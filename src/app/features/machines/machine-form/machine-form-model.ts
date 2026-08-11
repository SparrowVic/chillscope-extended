import {
  applyEach,
  disabled,
  max,
  min,
  required,
  schema,
  validate,
  type Schema,
  type ValidationError,
} from '@angular/forms/signals';

import type { SeriesId, SeriesThresholds } from '../../../core/data/series.catalog';
import { MACHINE_PROFILES, type MachineProfile } from '../../../core/machines/machine-profile';
import type {
  MachineSchematic,
  PipeSide,
  SchematicNodeType,
} from '../../../core/schematic/schematic.models';
import { ISA_TAG_PATTERN } from '../../../core/schematic/schematic.validate';
import { NODE_SYMBOLS } from '../../../core/schematic/symbols';

/**
 * A node carries a primary instrument tag exactly when its symbol has a moving group for that
 * instrument to drive — the symbol library is the single source of that fact, so adding an
 * animated symbol lights the tag field up without touching the form.
 */
export function nodeSupportsTag(type: SchematicNodeType): boolean {
  return (NODE_SYMBOLS[type].animatedGroups?.length ?? 0) > 0;
}

/**
 * The Signal Forms model of a machine document (configurator spec §4.1) and the pure mappings
 * between it and the schematic document. The form deliberately edits a *loose* value — empty
 * strings, `null` numbers — and `toSchematicDocument` produces the untrusted object that both
 * validators judge; per-field rules here only catch what a single field can know about itself.
 */

export interface ThresholdOverrideValue {
  enabled: boolean;
  warningMin: number | null;
  warningMax: number | null;
  criticalMin: number | null;
  criticalMax: number | null;
}

export interface NodeFormValue {
  id: string;
  type: SchematicNodeType;
  label: string;
  column: number | null;
  row: number | null;
  /** ISA tag of the instrument animating the node, or empty for none. */
  tag: string;
  level: boolean;
  heatSource: boolean;
}

export interface PipeFormValue {
  from: string;
  to: string;
  side: PipeSide;
}

/** One row per profile sensor slot, index-aligned with `profile.sensorSlots`. */
export interface SensorFormValue {
  series: SeriesId;
  tag: string;
  attachTo: string;
  thresholds: ThresholdOverrideValue;
}

export interface MachineFormValue {
  id: string;
  name: string;
  revision: string;
  nodes: NodeFormValue[];
  pipes: PipeFormValue[];
  sensors: SensorFormValue[];
}

const NO_OVERRIDE: ThresholdOverrideValue = {
  enabled: false,
  warningMin: null,
  warningMax: null,
  criticalMin: null,
  criticalMax: null,
};

export function toMachineFormValue(
  doc: MachineSchematic,
  profile: MachineProfile,
): MachineFormValue {
  return {
    id: doc.id,
    name: doc.name,
    revision: doc.revision,
    nodes: doc.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      label: node.label,
      column: node.grid[0],
      row: node.grid[1],
      tag: node.tag ?? '',
      level: node.level ?? false,
      heatSource: node.heatSource ?? false,
    })),
    pipes: doc.pipes.map((pipe) => ({ from: pipe.from, to: pipe.to, side: pipe.side })),
    // One row per slot: the first instrument of the slot's series fills it. A document carrying
    // several instruments of one series can only be shaped in the JSON tab, never in the form.
    sensors: profile.sensorSlots.map((slot) => {
      const instrument = doc.instruments.find((entry) => entry.series === slot.series);
      return {
        series: slot.series,
        tag: instrument?.tag ?? `${slot.tagPrefix}-`,
        attachTo: instrument?.attachTo ?? '',
        thresholds: instrument?.thresholds ? toOverride(instrument.thresholds) : NO_OVERRIDE,
      };
    }),
  };
}

function toOverride(thresholds: SeriesThresholds): ThresholdOverrideValue {
  return { enabled: true, ...thresholds };
}

/**
 * The untrusted document candidate for the two validators. Optional fields are omitted rather
 * than emptied, so a round-trip through the form leaves a valid document byte-identical. The
 * profile id is passed alongside the value because the form never changes a document's profile.
 */
export function toSchematicDocument(
  value: MachineFormValue,
  profileId: string,
): Record<string, unknown> {
  return {
    id: value.id,
    name: value.name,
    revision: value.revision,
    profileId,
    nodes: value.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      label: node.label,
      grid: [node.column ?? -1, node.row ?? -1],
      ...(nodeSupportsTag(node.type) && node.tag !== '' ? { tag: node.tag } : {}),
      ...(node.type === 'reservoir' && node.level ? { level: true } : {}),
      ...(node.type === 'machine' && node.heatSource ? { heatSource: true } : {}),
    })),
    pipes: value.pipes.map((pipe) => ({ from: pipe.from, to: pipe.to, side: pipe.side })),
    instruments: value.sensors.map((sensor) => ({
      tag: sensor.tag,
      series: sensor.series,
      attachTo: sensor.attachTo,
      ...(sensor.thresholds.enabled ? { thresholds: toThresholds(sensor.thresholds) } : {}),
    })),
  };
}

function toThresholds(override: ThresholdOverrideValue): Record<string, unknown> {
  return {
    warningMin: override.warningMin ?? Number.NaN,
    warningMax: override.warningMax ?? Number.NaN,
    criticalMin: override.criticalMin ?? Number.NaN,
    criticalMax: override.criticalMax ?? Number.NaN,
  };
}

/**
 * Per-field rules only; everything cross-field (node counts, collisions, loop closure, slot
 * attachment) is the two validators' job on the mapped document. The profile arrives as a getter
 * because the logic functions are lazy — they re-read it whenever the edited document changes.
 * `locked` disables the whole tree for built-in documents, which only duplication can edit.
 */
export function machineFormSchema(
  profile: () => MachineProfile,
  locked: () => boolean,
): Schema<MachineFormValue> {
  return schema<MachineFormValue>((machine) => {
    disabled(machine, () => locked());

    required(machine.id);
    required(machine.name);
    required(machine.revision);

    applyEach(machine.nodes, (node) => {
      required(node.id);
      required(node.label);
      required(node.column);
      min(node.column, 0);
      max(node.column, () => profile().gridSize.cols - 1);
      required(node.row);
      min(node.row, 0);
      max(node.row, () => profile().gridSize.rows - 1);
      validate(node.tag, ({ value }) => isaTagError(value(), true));
    });

    applyEach(machine.pipes, (pipe) => {
      required(pipe.from);
      required(pipe.to);
      validate(pipe.to, ({ value, valueOf }) => {
        const to = value();
        return to !== '' && to === valueOf(pipe.from) ? { kind: 'pipeSelf' } : null;
      });
    });

    applyEach(machine.sensors, (sensor) => {
      required(sensor.tag);
      required(sensor.attachTo);
      validate(sensor.tag, ({ value, valueOf }) => {
        const tag = value();
        if (tag === '') {
          return null;
        }
        const invalid = isaTagError(tag, false);
        if (invalid) {
          return invalid;
        }
        const slot = profile().sensorSlots.find((entry) => entry.series === valueOf(sensor.series));
        if (slot && !tag.startsWith(`${slot.tagPrefix}-`)) {
          const error = { kind: 'tagPrefix', prefix: slot.tagPrefix };
          return error as ValidationError.WithoutFieldTree;
        }
        return null;
      });

      // An enabled override must be complete — a half-filled band cannot classify anything.
      const band = sensor.thresholds;
      for (const field of [band.warningMin, band.warningMax, band.criticalMin, band.criticalMax]) {
        validate(field, ({ value, valueOf }) =>
          valueOf(band.enabled) && value() === null ? { kind: 'required' } : null,
        );
      }
    });
  });
}

function isaTagError(tag: string, emptyAllowed: boolean): ValidationError.WithoutFieldTree | null {
  if (tag === '' && emptyAllowed) {
    return null;
  }
  return ISA_TAG_PATTERN.test(tag) ? null : { kind: 'isaTag' };
}

/**
 * The saved document as an editor's own round-trip spells it. Comparing a draft against this —
 * rather than against the stored JSON — is what keeps "dirty" honest: opening a document and
 * changing nothing must not read as an edit merely because the form normalises optional fields.
 */
export function canonicalMachineJson(doc: MachineSchematic): string {
  const profile = MACHINE_PROFILES[doc.profileId];
  return JSON.stringify(toSchematicDocument(toMachineFormValue(doc, profile), profile.id));
}

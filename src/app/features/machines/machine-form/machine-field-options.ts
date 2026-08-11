import { computed, type Signal } from '@angular/core';

import type { MachineProfile } from '../../../core/machines/machine-profile';
import {
  SCHEMATIC_NODE_TYPES,
  type SchematicNodeType,
} from '../../../core/schematic/schematic.models';
import type { SelectOption } from '../../../shared/controls/select-option';
import type { NodeFormValue } from './machine-form-model';

export interface MachineFieldOptions {
  /** The node types this profile still allows, in the vocabulary's own order. */
  readonly typeOptions: Signal<readonly SelectOption<SchematicNodeType>[]>;
  /** Every named node — what a pipe end may point at. */
  readonly nodeOptions: Signal<readonly SelectOption<string>[]>;
  /** One list per sensor slot, index-aligned with `profile.sensorSlots`. */
  readonly attachOptions: Signal<readonly (readonly SelectOption<string>[])[]>;
}

/**
 * The select vocabularies the constrained row fields need, built once for both editing surfaces:
 * the Form tab and the Diagram tab's properties panel render the same field components, so they
 * must offer the same choices. Profile and nodes arrive as getters so each list keeps its own
 * memoisation — retyping a node id must not rebuild the node-type list.
 */
export function machineFieldOptions(
  profile: () => MachineProfile,
  nodes: () => readonly NodeFormValue[],
): MachineFieldOptions {
  // A node without an id is a half-typed row: it can be neither a pipe end nor a sensor's mount.
  const namedNodes = computed(() => nodes().filter((node) => node.id !== ''));

  return {
    typeOptions: computed(() =>
      SCHEMATIC_NODE_TYPES.filter((type) => profile().nodeRules[type].max > 0).map((type) => ({
        value: type,
        label: `machines.nodeTypes.${type}`,
      })),
    ),
    nodeOptions: computed(() => namedNodes().map((node) => ({ value: node.id, label: node.id }))),
    attachOptions: computed(() =>
      profile().sensorSlots.map((slot) =>
        namedNodes()
          .filter((node) => slot.attachToTypes.includes(node.type))
          .map((node) => ({ value: node.id, label: node.id })),
      ),
    ),
  };
}

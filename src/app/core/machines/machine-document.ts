import { validateSchematic } from '../schematic/schematic.validate';
import type { MachineProfile } from './machine-profile';
import { validateAgainstProfile } from './machine-profile';

/**
 * The two-layer contract in one place: a document is checked structurally first, and only the
 * canonicalised result is worth measuring against its profile envelope. The order matters — the
 * profile validator assumes the shape the structural pass guarantees — so editors that need both
 * answers ask here rather than re-spelling the sequence.
 *
 * Returns the first layer that has something to say; an empty array means the document is valid.
 */
export function machineDocumentErrors(
  candidate: unknown,
  profile: MachineProfile,
): readonly string[] {
  const structural = validateSchematic(candidate);
  return structural.ok ? validateAgainstProfile(structural.doc, profile) : structural.errors;
}

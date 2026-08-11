import { computed, DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { K207_SCHEMATIC } from '../schematic/k207.schematic';
import type { MachineProfileId, MachineSchematic } from '../schematic/schematic.models';
import { SCHEMATIC_LIMITS, validateSchematic } from '../schematic/schematic.validate';
import { BUILTIN_MACHINES } from './builtin.machines';
import { MACHINE_PROFILES, validateAgainstProfile } from './machine-profile';
import { skeletonFor } from './machine-skeleton';
import { openLocalStorage, readJson, writeJson } from '../storage';

const STORAGE_KEY = 'chillscope.machines';
const STORAGE_VERSION = 2;
const LEGACY_GRID_SCALE = 4;

export type MachineStoreFailure =
  | { readonly ok: false; readonly reason: 'rejected'; readonly errors: readonly string[] }
  | { readonly ok: false; readonly reason: 'persistence' };

export type MachineDocumentResult =
  { readonly ok: true; readonly doc: MachineSchematic } | MachineStoreFailure;

export type MachineActionResult = { readonly ok: true } | MachineStoreFailure;

export type MachineUpdateResult = MachineDocumentResult;

/**
 * The machine library (configurator spec §3): the built-in documents plus the user's own,
 * persisted in localStorage and re-validated on every read — a stored document that fails
 * either validation layer is dropped with a console.warn, never rendered. The dashboard and
 * the system strip consume `active()`; the Machines screen edits through the actions.
 */
@Injectable({ providedIn: 'root' })
export class MachineLibraryStore {
  readonly #document = inject(DOCUMENT);
  readonly #storage = openLocalStorage(this.#document);
  readonly #restored = readLibrary(this.#storage);
  readonly #storageForWrites = this.#restored.writesAllowed ? this.#storage : undefined;

  readonly #userMachines = signal<readonly MachineSchematic[]>(this.#restored.userMachines);
  readonly #activeId = signal(this.#restored.activeId ?? K207_SCHEMATIC.id);

  readonly machines = computed<readonly MachineSchematic[]>(() => [
    ...BUILTIN_MACHINES,
    ...this.#userMachines(),
  ]);

  readonly activeId = this.#activeId.asReadonly();

  /** Always resolves to a document; falls back to K-207 when the stored id no longer exists. */
  readonly active = computed<MachineSchematic>(
    () => this.machines().find((machine) => machine.id === this.#activeId()) ?? K207_SCHEMATIC,
  );

  constructor() {
    if (!this.machines().some((machine) => machine.id === this.#activeId())) {
      this.#activeId.set(K207_SCHEMATIC.id);
    }
    if (this.#restored.needsMigration) {
      writeLibrary(this.#storageForWrites, this.#userMachines(), this.#activeId());
    }
  }

  isBuiltIn(id: string): boolean {
    return BUILTIN_MACHINES.some((machine) => machine.id === id);
  }

  /** Creates a minimal valid document for the profile, with a unique id, and returns it. */
  create(profileId: MachineProfileId): MachineDocumentResult {
    const skeleton = skeletonFor(MACHINE_PROFILES[profileId]);
    const id = this.#uniqueId(skeleton.id);
    const doc: MachineSchematic = { ...skeleton, id, name: id };
    return this.#commit([...this.#userMachines(), doc], this.#activeId())
      ? { ok: true, doc }
      : { ok: false, reason: 'persistence' };
  }

  /** Copies any document (built-ins included) into a new user document. */
  duplicate(id: string): MachineDocumentResult {
    const source = this.machines().find((machine) => machine.id === id);
    if (!source) {
      return { ok: false, reason: 'rejected', errors: [`No machine with id "${id}" exists.`] };
    }
    const copyId = this.#uniqueId(source.id);
    const copyNumber = copyId.slice(copyId.lastIndexOf('-') + 1);
    const nameSuffix = ` (${copyNumber})`;
    const candidate: MachineSchematic = {
      ...structuredClone(source),
      id: copyId,
      name: appendWithinTextLimit(source.name, nameSuffix),
    };
    const structural = validateSchematic(candidate);
    if (!structural.ok) {
      return { ok: false, reason: 'rejected', errors: structural.errors };
    }
    const doc = structural.doc;
    const profileErrors = validateAgainstProfile(doc, MACHINE_PROFILES[doc.profileId]);
    if (profileErrors.length > 0) {
      return { ok: false, reason: 'rejected', errors: profileErrors };
    }
    return this.#commit([...this.#userMachines(), doc], this.#activeId())
      ? { ok: true, doc }
      : { ok: false, reason: 'persistence' };
  }

  /**
   * Replaces a user document after re-running both validation layers on the untrusted input.
   * Built-ins are immutable — duplicate them instead. A rename is allowed when the new id does
   * not collide with any other document.
   */
  update(id: string, input: unknown): MachineUpdateResult {
    if (this.isBuiltIn(id)) {
      return {
        ok: false,
        reason: 'rejected',
        errors: ['Built-in machines cannot be edited; duplicate them instead.'],
      };
    }
    const index = this.#userMachines().findIndex((machine) => machine.id === id);
    if (index < 0) {
      return {
        ok: false,
        reason: 'rejected',
        errors: [`No machine with id "${id}" exists.`],
      };
    }
    const structural = validateSchematic(input);
    if (!structural.ok) {
      return { ok: false, reason: 'rejected', errors: structural.errors };
    }
    const doc = structural.doc;
    const profileErrors = validateAgainstProfile(doc, MACHINE_PROFILES[doc.profileId]);
    if (profileErrors.length > 0) {
      return { ok: false, reason: 'rejected', errors: profileErrors };
    }
    if (doc.id !== id && this.machines().some((machine) => machine.id === doc.id)) {
      return {
        ok: false,
        reason: 'rejected',
        errors: [`A machine with id "${doc.id}" already exists.`],
      };
    }
    const machines = this.#userMachines().map((machine, at) => (at === index ? doc : machine));
    const activeId = this.#activeId() === id ? doc.id : this.#activeId();
    return this.#commit(machines, activeId)
      ? { ok: true, doc }
      : { ok: false, reason: 'persistence' };
  }

  /** Removes a user document; built-ins refuse. Removing the active machine falls back to K-207. */
  remove(id: string): MachineActionResult {
    if (this.isBuiltIn(id)) {
      return {
        ok: false,
        reason: 'rejected',
        errors: ['Built-in machines cannot be removed.'],
      };
    }
    if (!this.#userMachines().some((machine) => machine.id === id)) {
      return {
        ok: false,
        reason: 'rejected',
        errors: [`No machine with id "${id}" exists.`],
      };
    }
    const machines = this.#userMachines().filter((machine) => machine.id !== id);
    const activeId = this.#activeId() === id ? K207_SCHEMATIC.id : this.#activeId();
    return this.#commit(machines, activeId) ? { ok: true } : { ok: false, reason: 'persistence' };
  }

  setActive(id: string): MachineActionResult {
    if (!this.machines().some((machine) => machine.id === id)) {
      return {
        ok: false,
        reason: 'rejected',
        errors: [`No machine with id "${id}" exists.`],
      };
    }
    if (id === this.#activeId()) {
      return { ok: true };
    }
    return this.#commit(this.#userMachines(), id)
      ? { ok: true }
      : { ok: false, reason: 'persistence' };
  }

  /** Writes the complete snapshot before publishing either signal, so failures need no rollback. */
  #commit(userMachines: readonly MachineSchematic[], activeId: string): boolean {
    if (!writeLibrary(this.#storageForWrites, userMachines, activeId)) {
      return false;
    }
    this.#userMachines.set(userMachines);
    this.#activeId.set(activeId);
    return true;
  }

  #uniqueId(base: string): string {
    const taken = new Set(this.machines().map((machine) => machine.id));
    if (!taken.has(base)) {
      return base;
    }
    for (let n = 2; ; n += 1) {
      const candidate = appendWithinTextLimit(base, `-${n}`);
      if (!taken.has(candidate)) {
        return candidate;
      }
    }
  }
}

function appendWithinTextLimit(value: string, suffix: string): string {
  const suffixPoints = [...suffix];
  const available = Math.max(0, SCHEMATIC_LIMITS.textLength - suffixPoints.length);
  return [...value].slice(0, available).join('') + suffix;
}

interface RestoredLibrary {
  readonly userMachines: readonly MachineSchematic[];
  readonly activeId: string | undefined;
  readonly needsMigration: boolean;
  readonly writesAllowed: boolean;
}

const EMPTY_LIBRARY: RestoredLibrary = {
  userMachines: [],
  activeId: undefined,
  needsMigration: false,
  writesAllowed: true,
};

const UNSUPPORTED_LIBRARY: RestoredLibrary = {
  ...EMPTY_LIBRARY,
  writesAllowed: false,
};

function readLibrary(storage: Storage | undefined): RestoredLibrary {
  const stored = readJson(storage, STORAGE_KEY);
  return stored === undefined ? EMPTY_LIBRARY : parseLibrary(stored);
}

function parseLibrary(value: unknown): RestoredLibrary {
  if (typeof value !== 'object' || value === null) {
    return EMPTY_LIBRARY;
  }
  const raw = value as Record<string, unknown>;
  const version = raw['version'];
  if (version !== undefined && version !== 1 && version !== STORAGE_VERSION) {
    return UNSUPPORTED_LIBRARY;
  }
  const needsMigration = version !== STORAGE_VERSION;
  const entries = Array.isArray(raw['userMachines']) ? raw['userMachines'] : [];

  const userMachines: MachineSchematic[] = [];
  const seenIds = new Set(BUILTIN_MACHINES.map((machine) => machine.id));
  for (const entry of entries) {
    const candidate = needsMigration ? migrateLegacyMachine(entry) : entry;
    const doc = parseStoredMachine(candidate, seenIds);
    if (doc) {
      userMachines.push(doc);
      seenIds.add(doc.id);
    }
  }

  const activeId = raw['activeId'];
  return {
    userMachines,
    activeId: typeof activeId === 'string' ? activeId : undefined,
    needsMigration,
    writesAllowed: true,
  };
}

function migrateLegacyMachine(entry: unknown): unknown {
  if (!isRecord(entry) || !Array.isArray(entry['nodes'])) {
    return entry;
  }
  return { ...entry, nodes: entry['nodes'].map(migrateLegacyNode) };
}

function migrateLegacyNode(entry: unknown): unknown {
  if (!isRecord(entry)) {
    return entry;
  }
  const grid = entry['grid'];
  if (
    !Array.isArray(grid) ||
    grid.length !== 2 ||
    typeof grid[0] !== 'number' ||
    typeof grid[1] !== 'number'
  ) {
    return entry;
  }
  return { ...entry, grid: [grid[0] * LEGACY_GRID_SCALE, grid[1] * LEGACY_GRID_SCALE] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Both validation layers run on every stored document; invalid ones are dropped with a warning. */
function parseStoredMachine(
  entry: unknown,
  seenIds: ReadonlySet<string>,
): MachineSchematic | undefined {
  const structural = validateSchematic(entry);
  if (!structural.ok) {
    console.warn('Dropping invalid stored machine document:', structural.errors);
    return undefined;
  }
  const doc = structural.doc;
  const profileErrors = validateAgainstProfile(doc, MACHINE_PROFILES[doc.profileId]);
  if (profileErrors.length > 0) {
    console.warn(`Dropping stored machine "${doc.id}" that violates its profile:`, profileErrors);
    return undefined;
  }
  if (seenIds.has(doc.id)) {
    console.warn(`Dropping stored machine with duplicate id "${doc.id}".`);
    return undefined;
  }
  return doc;
}

function writeLibrary(
  storage: Storage | undefined,
  userMachines: readonly MachineSchematic[],
  activeId: string,
): boolean {
  return writeJson(storage, STORAGE_KEY, { version: STORAGE_VERSION, userMachines, activeId });
}

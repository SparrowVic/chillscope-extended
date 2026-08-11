import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { K207_SCHEMATIC } from '../schematic/k207.schematic';
import type { MachineSchematic } from '../schematic/schematic.models';
import { CH02_SCHEMATIC } from './builtin.machines';
import { MachineLibraryStore, type MachineDocumentResult } from './machine-library.store';

const STORAGE_KEY = 'chillscope.machines';

function freshStore(): MachineLibraryStore {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(MachineLibraryStore);
}

function expectDocument(result: MachineDocumentResult): MachineSchematic {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`Expected a machine document, received ${result.reason}.`);
  }
  return result.doc;
}

function asLegacyGrid(doc: MachineSchematic): MachineSchematic {
  return {
    ...doc,
    nodes: doc.nodes.map((node) => ({
      ...node,
      grid: [node.grid[0] / 4, node.grid[1] / 4] as const,
    })),
  };
}

describe('MachineLibraryStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with the three built-ins and K-207 active', () => {
    const store = freshStore();
    expect(store.machines().map((machine) => machine.id)).toEqual(['K-207', 'TCU-01', 'CH-02']);
    expect(store.activeId()).toBe('K-207');
    expect(store.active()).toBe(K207_SCHEMATIC);
    for (const machine of store.machines()) {
      expect(store.isBuiltIn(machine.id)).toBe(true);
    }
  });

  it('creates a fresh, valid document from a profile skeleton', () => {
    const store = freshStore();
    const created = expectDocument(store.create('tcu'));
    expect(created.profileId).toBe('tcu');
    expect(store.machines().some((machine) => machine.id === created.id)).toBe(true);
    expect(store.isBuiltIn(created.id)).toBe(false);

    const again = expectDocument(store.create('tcu'));
    expect(again.id).not.toBe(created.id);
  });

  it('duplicates a built-in into an editable user copy with a unique id', () => {
    const store = freshStore();
    const copy = expectDocument(store.duplicate('K-207'));
    expect(copy.id).toBe('K-207-2');
    expect(copy.nodes).toEqual(K207_SCHEMATIC.nodes);
    expect(store.isBuiltIn('K-207-2')).toBe(false);
    expect(store.duplicate('GHOST')).toEqual({
      ok: false,
      reason: 'rejected',
      errors: ['No machine with id "GHOST" exists.'],
    });
  });

  it('keeps duplicated ids and names inside the exchange limit across a reload', () => {
    const source: MachineSchematic = {
      ...K207_SCHEMATIC,
      id: '🧊'.repeat(160),
      name: 'N'.repeat(160),
    };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 2, userMachines: [source], activeId: 'K-207' }),
    );
    const first = freshStore();
    const copy = expectDocument(first.duplicate(source.id));

    expect([...copy.id]).toHaveLength(160);
    expect(copy.id.endsWith('-2')).toBe(true);
    expect([...copy.name]).toHaveLength(160);
    expect(copy.name.endsWith(' (2)')).toBe(true);

    const second = freshStore();
    expect(second.machines().some((machine) => machine.id === copy.id)).toBe(true);
  });

  it('refuses to update built-ins and unknown machines', () => {
    const store = freshStore();
    expect(store.update('K-207', K207_SCHEMATIC)).toEqual({
      ok: false,
      reason: 'rejected',
      errors: ['Built-in machines cannot be edited; duplicate them instead.'],
    });
    const missing = store.update('GHOST', K207_SCHEMATIC);
    expect(missing).toEqual({
      ok: false,
      reason: 'rejected',
      errors: ['No machine with id "GHOST" exists.'],
    });
  });

  it('updates a user document only when both validation layers pass', () => {
    const store = freshStore();
    const copy = expectDocument(store.duplicate('K-207'));

    const structurallyBroken = store.update(copy.id, { id: copy.id });
    expect(structurallyBroken).toMatchObject({ ok: false, reason: 'rejected' });

    const profileBroken = store.update(copy.id, { ...copy, pipes: [] });
    expect(profileBroken).toMatchObject({ ok: false, reason: 'rejected' });
    if (!profileBroken.ok && profileBroken.reason === 'rejected') {
      expect(profileBroken.errors.join('\n')).toContain('closed piping loop');
    }

    const renamed = store.update(copy.id, { ...copy, name: 'My machine' });
    expect(renamed.ok).toBe(true);
    expect(store.machines().find((machine) => machine.id === copy.id)?.name).toBe('My machine');
  });

  it('rejects a rename onto an existing id', () => {
    const store = freshStore();
    const copy = expectDocument(store.duplicate('K-207'));
    const collision = store.update(copy.id, { ...copy, id: 'TCU-01' });
    expect(collision).toEqual({
      ok: false,
      reason: 'rejected',
      errors: ['A machine with id "TCU-01" already exists.'],
    });
  });

  it('never removes built-ins, removes user docs and falls back the active id', () => {
    const store = freshStore();
    expect(store.remove('K-207')).toEqual({
      ok: false,
      reason: 'rejected',
      errors: ['Built-in machines cannot be removed.'],
    });

    const copy = expectDocument(store.duplicate('CH-02'));
    expect(store.setActive(copy.id)).toEqual({ ok: true });
    expect(store.active().id).toBe(copy.id);

    expect(store.remove(copy.id)).toEqual({ ok: true });
    expect(store.activeId()).toBe('K-207');
    expect(store.machines().some((machine) => machine.id === copy.id)).toBe(false);
  });

  it('activates only existing machines', () => {
    const store = freshStore();
    expect(store.setActive('CH-02')).toEqual({ ok: true });
    expect(store.active()).toBe(CH02_SCHEMATIC);
    expect(store.setActive('GHOST')).toEqual({
      ok: false,
      reason: 'rejected',
      errors: ['No machine with id "GHOST" exists.'],
    });
    expect(store.active()).toBe(CH02_SCHEMATIC);
  });

  it('persists user documents and the active id across store instances', () => {
    const first = freshStore();
    const copy = expectDocument(first.duplicate('TCU-01'));
    expect(first.setActive(copy.id)).toEqual({ ok: true });

    const second = freshStore();
    expect(second.machines().some((machine) => machine.id === copy.id)).toBe(true);
    expect(second.activeId()).toBe(copy.id);
    expect(second.active().id).toBe(copy.id);
  });

  it('migrates an unversioned snapshot without losing valid documents or the active id', () => {
    const current: MachineSchematic = {
      ...K207_SCHEMATIC,
      id: 'USR-LEGACY',
      name: 'Legacy machine',
    };
    const legacy = asLegacyGrid(current);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ userMachines: [legacy], activeId: legacy.id }),
    );

    const store = freshStore();

    expect(store.active().id).toBe(legacy.id);
    expect(store.active().nodes).toEqual(current.nodes);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({
      version: 2,
      activeId: legacy.id,
      userMachines: [{ id: legacy.id, nodes: current.nodes }],
    });
  });

  it('migrates a version 1 snapshot before validation and preserves the active machine', () => {
    const current: MachineSchematic = {
      ...K207_SCHEMATIC,
      id: 'USR-V1',
      name: 'Version one machine',
    };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, userMachines: [asLegacyGrid(current)], activeId: current.id }),
    );

    const store = freshStore();
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<
      string,
      unknown
    >;

    expect(store.active()).toEqual(current);
    expect(persisted['version']).toBe(2);
    expect(persisted['activeId']).toBe(current.id);
    expect(persisted['userMachines']).toEqual([current]);
  });

  it('does not overwrite snapshots from a newer storage version', () => {
    const futureSnapshot = JSON.stringify({ version: 3, userMachines: [], activeId: 'K-207' });
    localStorage.setItem(STORAGE_KEY, futureSnapshot);

    const store = freshStore();

    expect(store.machines()).toHaveLength(3);
    expect(store.activeId()).toBe('K-207');
    expect(store.create('tcu')).toEqual({ ok: false, reason: 'persistence' });
    expect(localStorage.getItem(STORAGE_KEY)).toBe(futureSnapshot);
  });

  it('keeps the last durable snapshot when browser storage rejects a write', () => {
    const store = freshStore();
    const copy = expectDocument(store.duplicate('TCU-01'));
    expect(store.setActive(copy.id)).toEqual({ ok: true });
    const machinesBeforeFailure = store.machines();
    const storedBeforeFailure = localStorage.getItem(STORAGE_KEY);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage quota exceeded.', 'QuotaExceededError');
    });

    expect(store.update(copy.id, { ...copy, name: 'Unsaved rename' })).toEqual({
      ok: false,
      reason: 'persistence',
    });
    expect(store.setActive('K-207')).toEqual({ ok: false, reason: 'persistence' });
    expect(store.remove(copy.id)).toEqual({ ok: false, reason: 'persistence' });
    expect(store.create('chiller')).toEqual({ ok: false, reason: 'persistence' });
    expect(store.duplicate('K-207')).toEqual({ ok: false, reason: 'persistence' });

    expect(store.machines()).toEqual(machinesBeforeFailure);
    expect(store.machines().find((machine) => machine.id === copy.id)?.name).toBe(copy.name);
    expect(store.activeId()).toBe(copy.id);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(storedBeforeFailure);
  });

  it('drops stored documents that fail structural validation, with a console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ userMachines: [{ id: 'BROKEN' }], activeId: 'K-207' }),
    );
    const store = freshStore();
    expect(store.machines().some((machine) => machine.id === 'BROKEN')).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('drops stored documents that violate their profile, with a console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const invalid: MachineSchematic = { ...K207_SCHEMATIC, id: 'USR-1', pipes: [] };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ userMachines: [invalid], activeId: 'USR-1' }),
    );
    const store = freshStore();
    expect(store.machines().some((machine) => machine.id === 'USR-1')).toBe(false);
    expect(store.activeId()).toBe('K-207');
    expect(warn).toHaveBeenCalled();
  });

  it('drops stored documents that shadow a built-in id, with a console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const impostor: MachineSchematic = { ...K207_SCHEMATIC, name: 'Shadow copy' };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ userMachines: [impostor], activeId: 'K-207' }),
    );
    const store = freshStore();
    expect(store.machines().filter((machine) => machine.id === 'K-207')).toHaveLength(1);
    expect(store.active().name).toBe(K207_SCHEMATIC.name);
    expect(warn).toHaveBeenCalled();
  });

  it('survives corrupted storage payloads', () => {
    localStorage.setItem(STORAGE_KEY, 'not json at all');
    const store = freshStore();
    expect(store.machines()).toHaveLength(3);
    expect(store.activeId()).toBe('K-207');
  });

  it('falls back to K-207 when the stored active id no longer exists', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ userMachines: [], activeId: 'GHOST' }));
    const store = freshStore();
    expect(store.activeId()).toBe('K-207');
    expect(store.active()).toBe(K207_SCHEMATIC);
  });
});

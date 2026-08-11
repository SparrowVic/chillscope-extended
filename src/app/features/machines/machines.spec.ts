import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MeasurementsFacade } from '../../core/data/measurements.facade';
import { provideTestTransloco } from '../../testing/transloco';
import { CH02_SCHEMATIC, TCU01_SCHEMATIC } from '../../core/machines/builtin.machines';
import { MachineLibraryStore } from '../../core/machines/machine-library.store';
import { K207_SCHEMATIC } from '../../core/schematic/k207.schematic';
import type { MachineSchematic } from '../../core/schematic/schematic.models';
import { Machines } from './machines';

const CUSTOM_MACHINE: MachineSchematic = {
  ...TCU01_SCHEMATIC,
  id: 'CUSTOM-01',
  name: 'Custom cooling skid',
};

const MACHINE_STORE = {
  machines: () => [K207_SCHEMATIC, TCU01_SCHEMATIC, CH02_SCHEMATIC, CUSTOM_MACHINE],
  activeId: () => K207_SCHEMATIC.id,
  active: () => K207_SCHEMATIC,
  isBuiltIn: (id: string) => id !== CUSTOM_MACHINE.id,
  create: vi.fn(() => ({ ok: false as const, reason: 'persistence' as const })),
  duplicate: vi.fn(() => ({ ok: false as const, reason: 'persistence' as const })),
  remove: vi.fn(() => ({ ok: false as const, reason: 'persistence' as const })),
  setActive: vi.fn(() => ({ ok: false as const, reason: 'persistence' as const })),
  update: vi.fn(() => ({ ok: false as const, reason: 'persistence' as const })),
};

const RELEASE_SCHEMATIC = vi.fn();

const MEASUREMENTS = {
  schematicBaselineSeries: () => [],
  isLoadingSchematic: () => false,
  schematicError: () => undefined,
  activateSchematic: vi.fn(() => RELEASE_SCHEMATIC),
};

function stubViewportWidth(width: number): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => {
      const threshold = Number.parseFloat(
        /min-width:\s*([\d.]+)px/u.exec(query)?.[1] ?? 'Infinity',
      );
      return {
        matches: width >= threshold,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(() => true),
      } as unknown as MediaQueryList;
    }),
  );
}

function stubCompactViewport(): void {
  stubViewportWidth(899);
}

describe('Machines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        ...provideTestTransloco({
          'machines.builtIns.k207.name': 'Chłodziarka K-207',
          'machines.builtIns.tcu01.name': 'Termostat TCU-01',
          'machines.builtIns.ch02.name': 'Chłodziarka CH-02',
          'machines.library.createTcu': 'Nowy TCU',
          'machines.library.persistenceTitle': 'Nie zapisano biblioteki maszyn',
          'machines.library.persistenceMessage':
            'Pamięć przeglądarki odrzuciła zmianę. Poprzednia biblioteka maszyn pozostała bez zmian.',
        }),
        providePrimeNG({}),
        { provide: MachineLibraryStore, useValue: MACHINE_STORE },
        { provide: MeasurementsFacade, useValue: MEASUREMENTS },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows both panes side by side, without stage chrome, on wide viewports', () => {
    const fixture = TestBed.createComponent(Machines);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector<HTMLElement>('.machines__pane--library')?.hidden).toBe(false);
    expect(element.querySelector<HTMLElement>('.machines__pane--editor')?.hidden).toBe(false);
    expect(element.querySelector('.machines__back')).toBeNull();
  });

  it('opens on the editor stage on compact widths and navigates back to the library', () => {
    stubCompactViewport();
    const fixture = TestBed.createComponent(Machines);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const library = element.querySelector<HTMLElement>('.machines__pane--library');
    const editor = element.querySelector<HTMLElement>('.machines__pane--editor');

    expect(editor?.hidden).toBe(false);
    expect(library?.hidden).toBe(true);

    const back = element.querySelector<HTMLButtonElement>('.machines__back');
    expect(back).not.toBeNull();
    back?.click();
    fixture.detectChanges();

    expect(library?.hidden).toBe(false);
    expect(editor?.hidden).toBe(true);
  });

  it.each([
    [899, true],
    [900, false],
    [901, false],
  ] as const)('uses one compact/wide boundary at %ipx', (width, compact) => {
    stubViewportWidth(width);
    const fixture = TestBed.createComponent(Machines);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.machines__back') !== null).toBe(compact);
    expect(element.querySelector<HTMLElement>('.machines__pane--library')?.hidden).toBe(compact);
  });

  it('keeps ONE mounted editor across stage round-trips — selection is stage navigation', () => {
    stubCompactViewport();
    const fixture = TestBed.createComponent(Machines);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const editorInstance = element.querySelector('app-machine-editor');
    expect(editorInstance).not.toBeNull();

    element.querySelector<HTMLButtonElement>('.machines__back')?.click();
    fixture.detectChanges();
    // Re-selecting the already-open document navigates without touching the store.
    element.querySelector<HTMLButtonElement>('.lrow--selected .lrow__select')?.click();
    fixture.detectChanges();

    expect(element.querySelector<HTMLElement>('.machines__pane--editor')?.hidden).toBe(false);
    expect(element.querySelectorAll('app-machine-editor')).toHaveLength(1);
    expect(element.querySelector('app-machine-editor')).toBe(editorInstance);
  });

  it('owns the live schematic telemetry only while the configurator is mounted', () => {
    const fixture = TestBed.createComponent(Machines);

    expect(MEASUREMENTS.activateSchematic).toHaveBeenCalledOnce();
    fixture.destroy();
    expect(RELEASE_SCHEMATIC).toHaveBeenCalledOnce();
  });

  it('localises built-in library rows without replacing a custom name', () => {
    const fixture = TestBed.createComponent(Machines);
    fixture.detectChanges();

    const names = [...fixture.nativeElement.querySelectorAll('.lrow__name')].map(
      (element: Element) => element.textContent?.trim(),
    );
    expect(names).toEqual([
      'Chłodziarka K-207',
      'Termostat TCU-01',
      'Chłodziarka CH-02',
      'Custom cooling skid',
    ]);
  });

  it('reports a rejected localStorage write without changing the selection', () => {
    const fixture = TestBed.createComponent(Machines);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const messages = fixture.debugElement.injector.get(MessageService);
    const add = vi.spyOn(messages, 'add');
    const create = [...element.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Nowy TCU'),
    );
    expect(create).toBeDefined();

    create?.click();
    fixture.detectChanges();

    expect(MACHINE_STORE.create).toHaveBeenCalledWith('tcu');
    expect(add).toHaveBeenCalledWith({
      severity: 'error',
      summary: 'Nie zapisano biblioteki maszyn',
      detail:
        'Pamięć przeglądarki odrzuciła zmianę. Poprzednia biblioteka maszyn pozostała bez zmian.',
      life: 5_000,
    });
    expect(element.querySelector('.lrow--selected .lrow__id')?.textContent?.trim()).toBe(
      K207_SCHEMATIC.id,
    );
  });
});

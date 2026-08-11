import { describe, expect, it } from 'vitest';

import en from '../../../assets/i18n/en.json';
import pl from '../../../assets/i18n/pl.json';
import { machineValidationCopy, machineValidationCopies } from './machine-validation-copy';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function lookup(catalogue: unknown, key: string): string {
  let value = catalogue;
  for (const segment of key.split('.')) {
    if (!isRecord(value)) {
      return key;
    }
    value = value[segment];
  }
  return typeof value === 'string' ? value : key;
}

function render(error: string, catalogue: unknown): string {
  const copy = machineValidationCopy(error);
  return Object.entries(copy.params ?? {}).reduce(
    (text, [key, value]) => text.replaceAll('{{' + key + '}}', value),
    lookup(catalogue, copy.key),
  );
}

describe('machine validation presentation copy', () => {
  it('localises a structural path while preserving its field and node id', () => {
    const technical = 'pipes[3]: "to" references unknown node "GHOST".';

    expect(render(technical, en)).toBe('pipes[3]: "to" references the unknown node "GHOST".');
    expect(render(technical, pl)).toBe(
      'pipes[3]: pole "to" odwołuje się do nieznanego węzła "GHOST".',
    );
  });

  it('preserves profile coordinates and dimensions in both languages', () => {
    const technical = 'Node "M1" at grid [12, 4] is outside the profile grid of 12x8 cells.';

    expect(render(technical, en)).toBe('Node "M1" at [12, 4] is outside the 12×8 profile grid.');
    expect(render(technical, pl)).toBe(
      'Węzeł "M1" w polu [12, 4] znajduje się poza siatką profilu 12×8.',
    );
  });

  it('localises safe-integer and maximum grid bounds without losing coordinates', () => {
    const unsafe =
      'nodes[2]: grid position [9007199254740992, 4] must use safe integers.';
    const excessive =
      'nodes[1]: grid position [256, 2] must not exceed 255 on either axis.';

    expect(render(unsafe, en)).toBe(
      'nodes[2]: grid position [9007199254740992, 4] must use safe integers.',
    );
    expect(render(unsafe, pl)).toBe(
      'nodes[2]: pozycja [9007199254740992, 4] musi używać bezpiecznych liczb całkowitych.',
    );
    expect(render(excessive, en)).toBe(
      'nodes[1]: grid position [256, 2] cannot exceed 255 on either axis.',
    );
    expect(render(excessive, pl)).toBe(
      'nodes[1]: żadna współrzędna pozycji [256, 2] nie może przekraczać 255.',
    );
  });

  it('localises terminal safety-valve topology errors in both languages', () => {
    const branchCount =
      'Terminal safety valve "SV1" must have exactly one incoming pressure branch; found 2.';
    const terminalBranchesOnly =
      'The profile requires a closed piping loop, but only terminal branches were found.';

    expect(render(branchCount, en)).toBe(
      'Terminal safety valve "SV1" must have exactly 1 incoming pressure branch; found 2.',
    );
    expect(render(branchCount, pl)).toBe(
      'Końcowy zawór bezpieczeństwa "SV1" musi mieć dokładnie 1 ciśnieniową rurę wchodzącą; znaleziono: 2.',
    );
    expect(render(terminalBranchesOnly, en)).toBe(
      'The profile requires a closed piping loop; terminal relief branches alone do not form one.',
    );
    expect(render(terminalBranchesOnly, pl)).toBe(
      'Profil wymaga zamkniętego obiegu; same końcowe odnogi zaworów bezpieczeństwa go nie tworzą.',
    );
  });

  it('describes node tags as primary instrumentation rather than motion drivers', () => {
    const technical =
      'nodes[2]: node type "reservoir" does not accept primary instrument tag "ST-104".';

    expect(render(technical, en)).toBe(
      'nodes[2]: node type "reservoir" does not accept primary instrument tag "ST-104".',
    );
    expect(render(technical, pl)).toBe(
      'nodes[2]: typ węzła "reservoir" nie obsługuje tagu przyrządu głównego "ST-104".',
    );
  });

  it('localises store and layout failures without losing their ids', () => {
    expect(render('A machine with id "CUSTOM-7" already exists.', pl)).toBe(
      'Maszyna o identyfikatorze "CUSTOM-7" już istnieje.',
    );
    expect(
      render('Cannot lay out schematic "CUSTOM-7": unknown node "GHOST". Validate first.', pl),
    ).toBe(
      'Nie można rozmieścić schematu "CUSTOM-7": węzeł "GHOST" nie istnieje. Najpierw sprawdź dokument.',
    );
    expect(
      render('Cannot lay out schematic pipe "P1" → "M1" without crossing a node.', pl),
    ).toBe(
      'Rura "P1" → "M1" nie ma wolnej trasy. Przesuń jeden z otaczających podzespołów.',
    );
  });

  it('uses localised safe fallback copy instead of exposing an unknown English diagnostic', () => {
    const technical = 'A future validator emitted this English diagnostic.';

    expect(render(technical, pl)).toBe(
      'Nie można wyświetlić szczegółów tego błędu walidacji. Sprawdź strukturę dokumentu.',
    );
    expect(render(technical, pl)).not.toContain(technical);
  });

  it('maps an error list in order', () => {
    expect(
      machineValidationCopies([
        'Built-in machines cannot be edited; duplicate them instead.',
        'No machine with id "MISSING" exists.',
      ]).map(({ key }) => key),
    ).toEqual(['machines.validation.builtInEdit', 'machines.validation.machineMissing']);
  });
});

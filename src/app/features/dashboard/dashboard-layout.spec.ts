import { describe, expect, it } from 'vitest';

/**
 * The dashboard's seating order is a contract, not a styling accident: on one column the machine's
 * current state leads and the operational alarm journal outranks both history bands, while desktop
 * seats the journal beside the hero. jsdom computes no grid, so the contract is asserted on the
 * stylesheet and template sources — the same file-reading pattern as the colour-contrast spec.
 */

interface FileReader {
  readFileSync(path: string, encoding: 'utf8'): string;
}

interface NodeProcess {
  cwd(): string;
  getBuiltinModule(name: 'fs'): FileReader;
}

const nodeProcess = (globalThis as typeof globalThis & { process?: NodeProcess }).process;
if (!nodeProcess) {
  throw new Error('The dashboard layout contract spec requires the Node test runtime.');
}

const reader = nodeProcess.getBuiltinModule('fs');
const root = `${nodeProcess.cwd()}/src/app/features/dashboard`;
const STYLES = reader.readFileSync(`${root}/dashboard.css`, 'utf8');
const TEMPLATE = reader.readFileSync(`${root}/dashboard.html`, 'utf8');

/** Every grid-template-areas declaration, each as its row list, in source order. */
function areaBlocks(css: string): readonly (readonly string[])[] {
  return [...css.matchAll(/grid-template-areas:\s*((?:'[^']*'\s*)+);/g)].map((match) =>
    [...match[1].matchAll(/'([^']*)'/g)].map((row) => row[1].trim()),
  );
}

describe('dashboard layout contract', () => {
  const blocks = areaBlocks(STYLES);

  it('declares exactly the one-column order and the desktop seating', () => {
    expect(blocks).toHaveLength(2);
  });

  it('ranks one column operationally: state, alarms, then the history bands', () => {
    expect(blocks[0]).toEqual(['hero', 'journal', 'chart', 'cycle']);
  });

  it('seats the journal beside the hero on desktop, bands full-width below', () => {
    expect(blocks[1]).toEqual(['hero journal', 'chart chart', 'cycle cycle']);
  });

  it('keeps the template DOM in the one-column order, so tab and reading order agree', () => {
    const positions = [
      TEMPLATE.indexOf('<app-schematic-panel'),
      TEMPLATE.indexOf('<app-recent-alarms'),
      TEMPLATE.indexOf('dashboard__chart-area'),
      TEMPLATE.indexOf('dashboard__cycle-area'),
    ];

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

import { TestBed } from '@angular/core/testing';
import type { RangeSelectedDetail } from '@chillscope/chart/types';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { provideTestTransloco } from '../../../testing/transloco';
import type { ChartPanel as ChartPanelClass } from './chart-panel';

const TRANSLATIONS: Readonly<Record<string, string>> = {
  'dashboard.chart.title': 'Przebieg pomiarów',
  'chart.zoomHint': 'Przeciągnij po wykresie, aby przybliżyć zakres.',
  'chart.zoomHintTouch': 'Rozsuń palce na wykresie, aby przybliżyć zakres.',
  'chart.rangeActions': 'Zakres wykresu',
  'chart.undoRange': 'Cofnij',
  'chart.restoreRange': 'Cały zakres',
  'chart.empty': 'Brak danych',
  'chart.loading': 'Wczytywanie…',
  'chart.ariaLabel': 'Pomiary w czasie',
};

/**
 * The real element registration skips already-defined tags, so inert stand-ins defined before the
 * component module loads keep jsdom from booting Vue + ECharts against a canvas it cannot paint.
 * The upgrade is not under test here — the panel's own chrome and its boundary wiring are.
 */
/** A type-only alias erases at compile time, so it cannot trigger the element registration. */
let ChartPanel: typeof ChartPanelClass;

beforeAll(async () => {
  for (const tag of ['chillscope-chart', 'chillscope-cycle-heatmap']) {
    if (!customElements.get(tag)) {
      customElements.define(tag, class extends HTMLElement {});
    }
  }
  ({ ChartPanel } = await import('./chart-panel'));
});

describe('ChartPanel', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...provideTestTransloco(TRANSLATIONS)],
    });
  });

  function render(zoomDepth = 0, resetKey = 0) {
    const fixture = TestBed.createComponent(ChartPanel);
    fixture.componentRef.setInput('series', []);
    fixture.componentRef.setInput('theme', 'light');
    fixture.componentRef.setInput('zoomDepth', zoomDepth);
    fixture.componentRef.setInput('resetKey', resetKey);
    fixture.detectChanges();
    return fixture;
  }

  it('carries one zoom hint per pointer world, each with its own gesture grammar', () => {
    const panel = render().nativeElement as HTMLElement;
    const fine = panel.querySelector('.chart-panel__hint--fine');
    const coarse = panel.querySelector('.chart-panel__hint--coarse');

    expect(fine?.textContent).toContain('Przeciągnij');
    expect(coarse?.textContent).toContain('Rozsuń palce');
  });

  it('shows undo and full-range actions only while a zoom history exists', () => {
    expect(
      (render().nativeElement as HTMLElement).querySelector('.chart-panel__actions'),
    ).toBeNull();

    const fixture = render(2);
    const actions = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      '.chart-panel__action',
    );
    expect([...actions].map((action) => action.textContent?.trim())).toEqual([
      'Cofnij',
      'Cały zakres',
    ]);

    let undone = 0;
    let restored = 0;
    fixture.componentInstance.undoRange.subscribe(() => {
      undone += 1;
    });
    fixture.componentInstance.restoreRange.subscribe(() => {
      restored += 1;
    });
    actions[0]?.click();
    actions[1]?.click();
    expect(undone).toBe(1);
    expect(restored).toBe(1);
  });

  it('forwards the reset key to the custom element', () => {
    const element = (render(1, 7).nativeElement as HTMLElement).querySelector(
      'chillscope-chart',
    ) as (HTMLElement & { resetKey?: number }) | null;

    expect(element?.resetKey).toBe(7);
  });

  it('routes the custom element restore request to the range owner', () => {
    const fixture = render(1);
    let restored = 0;
    fixture.componentInstance.restoreRange.subscribe(() => {
      restored += 1;
    });

    (fixture.nativeElement as HTMLElement)
      .querySelector('chillscope-chart')
      ?.dispatchEvent(new CustomEvent('restoreRequested'));

    expect(restored).toBe(1);
  });

  it('re-emits the custom element rangeSelected detail unchanged', () => {
    const fixture = render();
    const detail: RangeSelectedDetail = { from: 1_000, to: 2_000 };
    const selections: RangeSelectedDetail[] = [];
    fixture.componentInstance.rangeSelected.subscribe((range) => selections.push(range));

    (fixture.nativeElement as HTMLElement)
      .querySelector('chillscope-chart')
      ?.dispatchEvent(new CustomEvent<RangeSelectedDetail>('rangeSelected', { detail }));

    expect(selections).toEqual([detail]);
  });
});

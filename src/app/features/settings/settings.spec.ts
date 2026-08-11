import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { providePrimeNG } from 'primeng/config';
import { beforeEach, describe, expect, it } from 'vitest';

import { provideTestTransloco } from '../../testing/transloco';
import { CsInputNumber } from '../../shared/controls/input-number/input-number';
import { CsSlider } from '../../shared/controls/slider/slider';
import { Settings } from './settings';
import { SimulationFields } from './simulation-fields/simulation-fields';
import { ThresholdFields } from './threshold-fields/threshold-fields';

/**
 * Behaviour of the mobile-first Settings screen: threshold groups fold progressively but stay
 * ONE mounted form tree, group headers surface the errors folded away beneath them, and the
 * action dock narrates the state that arms or blocks Save.
 */
describe('Settings', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ...provideTestTransloco({
          'settings.actions.unsaved': 'Unsaved changes',
          'settings.actions.blocked': 'Fix the highlighted fields to save',
          'settings.thresholds.groupInvalid': 'Contains validation errors',
        }),
        providePrimeNG({}),
      ],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(Settings);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const groups = fixture.debugElement.queryAll(By.directive(ThresholdFields));
    return {
      fixture,
      element,
      groups,
      /** The four bound number wrappers of one series group, in template order. */
      boundsOf: (groupIndex: number) =>
        groups[groupIndex]
          .queryAll(By.directive(CsInputNumber))
          .map((debug) => debug.componentInstance as CsInputNumber),
      toggleOf: (groupIndex: number) =>
        (groups[groupIndex].nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
          '.threshold-fields__toggle',
        ),
      bodyOf: (groupIndex: number) =>
        (groups[groupIndex].nativeElement as HTMLElement).querySelector<HTMLElement>(
          '.threshold-fields__body',
        ),
      status: () => element.querySelector<HTMLElement>('.settings-actions__status'),
      actionDock: () => element.querySelector<HTMLElement>('app-settings-actions'),
      saveButton: () => element.querySelector<HTMLButtonElement>('p-button[type="submit"] button'),
    };
  }

  it('folds all four series groups by default but keeps every field mounted in one tree', () => {
    const { groups, bodyOf, toggleOf, element } = render();

    expect(groups).toHaveLength(4);
    for (let index = 0; index < groups.length; index += 1) {
      expect(toggleOf(index)?.getAttribute('aria-expanded')).toBe('false');
      expect(bodyOf(index)?.hasAttribute('inert')).toBe(true);
    }
    // Four bounds per series, all alive while folded — the whole tree is 16 threshold inputs.
    expect(element.querySelectorAll('app-threshold-fields cs-input-number')).toHaveLength(16);
  });

  it('opens a group without recreating its fields and keeps an edit across a fold round-trip', () => {
    const { fixture, groups, bodyOf, toggleOf, boundsOf } = render();
    const fieldsBefore = boundsOf(0);

    toggleOf(0)?.click();
    fixture.detectChanges();
    expect(toggleOf(0)?.getAttribute('aria-expanded')).toBe('true');
    expect(bodyOf(0)?.hasAttribute('inert')).toBe(false);

    const criticalMax = fieldsBefore[3];
    criticalMax.value.set(90);
    fixture.detectChanges();

    toggleOf(0)?.click();
    fixture.detectChanges();

    expect(bodyOf(0)?.hasAttribute('inert')).toBe(true);
    expect(boundsOf(0)[3]).toBe(criticalMax);
    expect(boundsOf(0)[3].value()).toBe(90);
    const summary = (groups[0].nativeElement as HTMLElement).querySelector(
      '.threshold-fields__summary',
    );
    expect(summary?.textContent).toContain('90');
  });

  it('flags a folded group that holds validation errors, and only that group', () => {
    const { fixture, groups, toggleOf, boundsOf, status } = render();

    toggleOf(0)?.click();
    fixture.detectChanges();
    // 60 < the temperature warningMax (74): criticalOutsideWarning.
    boundsOf(0)[3].value.set(60);
    fixture.detectChanges();
    toggleOf(0)?.click();
    fixture.detectChanges();

    const flagged = groups.map(
      (group) =>
        (group.nativeElement as HTMLElement).querySelector('.threshold-fields__flag') !== null,
    );
    expect(flagged).toEqual([true, false, false, false]);
    expect(status()?.textContent).toContain('Fix the highlighted fields to save');
  });

  it('narrates unsaved-but-valid work in the dock and arms Save', () => {
    const { fixture, toggleOf, boundsOf, status, actionDock, saveButton } = render();
    expect(saveButton()?.disabled).toBe(true);
    expect(status()?.textContent?.trim()).toBe('');
    expect(actionDock()?.classList.contains('settings-actions--sticky')).toBe(false);

    toggleOf(0)?.click();
    fixture.detectChanges();
    boundsOf(0)[3].value.set(90);
    fixture.detectChanges();

    expect(status()?.textContent).toContain('Unsaved changes');
    expect(saveButton()?.disabled).toBe(false);
    expect(actionDock()?.classList.contains('settings-actions--sticky')).toBe(true);
  });

  it('drives the form through the slider half of a simulation pair', () => {
    const { fixture, status } = render();
    const simulation = fixture.debugElement.query(By.directive(SimulationFields));
    const intervalSlider = simulation.queryAll(By.directive(CsSlider))[0]
      .componentInstance as CsSlider;
    const intervalNumber = simulation.queryAll(By.directive(CsInputNumber))[0]
      .componentInstance as CsInputNumber;

    intervalSlider.value.set(2_000);
    fixture.detectChanges();

    expect(intervalNumber.value()).toBe(2_000);
    expect(status()?.textContent).toContain('Unsaved changes');
  });

  it('pins the action dock above the mobile navigation reserve it stamps', () => {
    render();
    const styles = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n');

    expect(styles).toContain('--settings-dock: var(--cs-mobile-navigation-reserve)');
    expect(styles).toContain('bottom: var(--settings-dock');
    expect(styles).toMatch(
      /\.settings-actions--sticky\[[^\]]+\]\s*\{\s*position:\s*static;\s*bottom:\s*auto;/,
    );
  });
});

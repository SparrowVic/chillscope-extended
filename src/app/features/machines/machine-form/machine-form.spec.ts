import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { provideTestTransloco } from '../../../testing/transloco';
import { MachineLibraryStore } from '../../../core/machines/machine-library.store';
import { MachineForm } from './machine-form';

/**
 * The compact accordion contract of the Form tab: folded sections HIDE their record strips
 * without destroying them (one Signal Forms tree, ever), captions carry the counts and confess
 * hidden schema errors, and wide viewports keep the plain engraved captions.
 */
describe('MachineForm', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ...provideTestTransloco({
          'machines.form.nodes': 'Nodes',
          'machines.form.pipes': 'Piping',
          'machines.form.sensors': 'Sensors',
        }),
        providePrimeNG({}),
        MessageService,
        { provide: MachineLibraryStore, useValue: { update: vi.fn() } },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubViewport(matches: boolean): void {
    const mediaQuery = {
      matches,
      media: '(min-width: 900px)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    } as unknown as MediaQueryList;
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mediaQuery),
    );
  }

  function stubCompactViewport(): void {
    stubViewport(false);
  }

  function render() {
    const fixture = TestBed.createComponent(MachineForm);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('prints plain captions and visible record strips on wide viewports', () => {
    stubViewport(true);
    const { element } = render();

    expect(element.querySelectorAll('.caption__toggle')).toHaveLength(0);
    expect(element.querySelectorAll('h3.caption__row').length).toBeGreaterThanOrEqual(4);
    expect(element.querySelector<HTMLElement>('#mform-rows-nodes')?.hidden).toBe(false);
  });

  it('folds the record sections on compact widths without destroying their fields', () => {
    stubCompactViewport();
    const { fixture, element } = render();

    const toggles = [...element.querySelectorAll<HTMLButtonElement>('.caption__toggle')];
    expect(toggles).toHaveLength(3);
    expect(toggles.every((toggle) => toggle.getAttribute('aria-expanded') === 'false')).toBe(true);

    const nodeRows = element.querySelector<HTMLElement>('#mform-rows-nodes');
    expect(nodeRows?.hidden).toBe(true);
    // Hidden, not destroyed: the fold keeps every field of the one form tree in the DOM.
    expect(nodeRows?.querySelectorAll('input').length).toBeGreaterThan(0);

    toggles[0].click();
    fixture.detectChanges();
    expect(toggles[0].getAttribute('aria-expanded')).toBe('true');
    expect(nodeRows?.hidden).toBe(false);
  });

  it('confesses schema errors hidden inside a folded section on its caption', async () => {
    stubCompactViewport();
    const { fixture, element } = render();
    const nodesToggle = element.querySelector<HTMLButtonElement>('.caption__toggle');
    expect(nodesToggle?.querySelector('.caption__alert')).toBeNull();

    nodesToggle?.click();
    fixture.detectChanges();
    const idInput = element.querySelector<HTMLInputElement>('#mform-rows-nodes input');
    expect(idInput).not.toBeNull();
    if (idInput !== null) {
      idInput.value = '';
      idInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    nodesToggle?.click();
    fixture.detectChanges();
    expect(element.querySelector<HTMLElement>('#mform-rows-nodes')?.hidden).toBe(true);
    expect(nodesToggle?.querySelector('.caption__alert')).not.toBeNull();
  });

  it('keeps the machine nameplate outside the fold system', () => {
    stubCompactViewport();
    const { element } = render();

    // id / name / revision stay reachable on every stage — identity never folds.
    expect(element.querySelector('.mform__machine input')).not.toBeNull();
    expect(element.querySelectorAll('.caption__toggle')).toHaveLength(3);
  });
});

import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import pl from '../../../../assets/i18n/pl.json';
import { provideTestTransloco } from '../../../testing/transloco';
import { TCU01_SCHEMATIC } from '../../../core/machines/builtin.machines';
import { K207_SCHEMATIC } from '../../../core/schematic/k207.schematic';
import type { MachineSchematic } from '../../../core/schematic/schematic.models';
import { MACHINE_JSON_PARSE_DEBOUNCE_MS } from '../machine-json/machine-json';
import { MachineEditor } from './machine-editor';

interface MatchMediaController {
  setMatches(matches: boolean): void;
}

function stubEditorWidth(initialMatches: boolean): MatchMediaController {
  let matches = initialMatches;
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: '(min-width: 900px)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.delete(listener);
    }),
    dispatchEvent: vi.fn(() => true),
  } as unknown as MediaQueryList;

  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mediaQuery),
  );

  return {
    setMatches(nextMatches: boolean): void {
      if (matches === nextMatches) {
        return;
      }
      matches = nextMatches;
      const event = Object.assign(new Event('change'), {
        matches,
        media: mediaQuery.media,
      }) as MediaQueryListEvent;
      for (const listener of listeners) {
        if (typeof listener === 'function') {
          listener.call(mediaQuery, event);
        } else {
          listener.handleEvent(event);
        }
      }
    },
  };
}

describe('MachineEditor', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MachineEditor],
      providers: [...provideTestTransloco(pl), providePrimeNG({}), MessageService],
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function render(doc?: MachineSchematic) {
    const fixture = TestBed.createComponent(MachineEditor);
    if (doc !== undefined) {
      fixture.componentRef.setInput('doc', doc);
    }
    fixture.componentRef.setInput('series', []);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('offers all three tabs enabled — the Diagram tab is phase B, delivered', () => {
    const { element } = render();

    const tabs = [...element.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs).toHaveLength(3);
    expect(tabs.every((tab) => !tab.disabled)).toBe(true);
    expect(element.querySelector('#machine-tab-diagram')).not.toBeNull();
    expect(element.querySelector('.diagram__svg')).toBeNull();
  });

  it('keeps ONE horizontal tablist with Left/Right roving on compact widths', () => {
    stubEditorWidth(false);
    const { fixture, element } = render();
    const tablists = [...element.querySelectorAll<HTMLElement>('[role="tablist"]')];
    const tabs = [...element.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tablists).toHaveLength(1);
    expect(tablists[0].getAttribute('aria-orientation')).toBe('horizontal');
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);

    tabs[0].focus();
    const ignoredVerticalArrow = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    tabs[0].dispatchEvent(ignoredVerticalArrow);
    fixture.detectChanges();
    expect(ignoredVerticalArrow.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(tabs[0]);

    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);

    tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(tabs[0]);
  });

  it('keeps the same horizontal semantics and Home/End roving from 900px', () => {
    stubEditorWidth(true);
    const { fixture, element } = render();
    const tablist = element.querySelector<HTMLElement>('[role="tablist"]');
    const tabs = [...element.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tablist?.getAttribute('aria-orientation')).toBe('horizontal');

    tabs[0].focus();
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(tabs[2]);

    tabs[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(tabs[0]);
  });

  it('survives a breakpoint change with the same tablist and keyboard mapping', () => {
    const width = stubEditorWidth(false);
    const { fixture, element } = render();
    const tablist = element.querySelector<HTMLElement>('[role="tablist"]');
    const tabs = [...element.querySelectorAll<HTMLButtonElement>('[role="tab"]')];

    width.setMatches(true);
    fixture.detectChanges();
    expect(tablist?.getAttribute('aria-orientation')).toBe('horizontal');
    expect(tablist?.isConnected).toBe(true);

    tabs[0].focus();
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(tabs[1]);
  });

  it('keeps every surface panel mounted while switching tabs — no duplicated trees', () => {
    const { fixture, element } = render();

    element.querySelector<HTMLButtonElement>('#machine-tab-json')?.click();
    fixture.detectChanges();

    const formPanel = element.querySelector<HTMLElement>('#machine-panel-form');
    const jsonPanel = element.querySelector<HTMLElement>('#machine-panel-json');
    expect(formPanel?.hidden).toBe(true);
    expect(jsonPanel?.hidden).toBe(false);
    // Hidden, not destroyed: exactly one form tree and one JSON editor exist at all times.
    expect(element.querySelectorAll('app-machine-form')).toHaveLength(1);
    expect(element.querySelectorAll('.mjson__editor')).toHaveLength(1);
    expect(formPanel?.querySelector('input')).not.toBeNull();
  });

  it('folds the live preview behind a flag-carrying disclosure on compact widths', () => {
    stubEditorWidth(false);
    const { fixture, element } = render();

    const toggle = element.querySelector<HTMLButtonElement>('.editor__preview-toggle');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('app-schematic-panel')).toBeNull();

    toggle?.click();
    fixture.detectChanges();
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('app-schematic-panel')).not.toBeNull();
  });

  it('always shows the live preview and no disclosure on wide viewports', () => {
    stubEditorWidth(true);
    const { element } = render();

    expect(element.querySelector('.editor__preview-toggle')).toBeNull();
    expect(element.querySelector('app-schematic-panel')).not.toBeNull();
  });

  it('prints the followed-machine lamp only for the active document', () => {
    const { fixture, element } = render();
    expect(element.querySelector('.editor__active')).toBeNull();

    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();
    expect(element.querySelector('.editor__active')).not.toBeNull();
  });

  it('hands the latest valid draft from Form to JSON and back without data loss', async () => {
    vi.useFakeTimers();
    const { fixture, element } = render();
    const formPanel = element.querySelector<HTMLElement>('#machine-panel-form') as HTMLElement;
    const name = formPanel.querySelectorAll<HTMLInputElement>('input')[1];
    name.value = 'Shared form draft';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('#machine-tab-json')?.click();
    fixture.detectChanges();
    const textarea = element.querySelector<HTMLTextAreaElement>(
      '.mjson__editor',
    ) as HTMLTextAreaElement;
    expect(JSON.parse(textarea.value).name).toBe('Shared form draft');

    textarea.value = JSON.stringify({ ...K207_SCHEMATIC, name: 'JSON owns the draft' }, null, 2);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(MACHINE_JSON_PARSE_DEBOUNCE_MS);
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('#machine-tab-form')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(formPanel.querySelectorAll<HTMLInputElement>('input')[1].value).toBe(
      'JSON owns the draft',
    );
  });

  it('marks a JSON keystroke dirty before the debounced draft is available', () => {
    vi.useFakeTimers();
    const { fixture, element } = render();
    const textarea = element.querySelector<HTMLTextAreaElement>(
      '.mjson__editor',
    ) as HTMLTextAreaElement;

    textarea.value += '\n';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentRef.instance.dirty()).toBe(true);

    vi.advanceTimersByTime(MACHINE_JSON_PARSE_DEBOUNCE_MS);
    fixture.detectChanges();

    expect(fixture.componentRef.instance.dirty()).toBe(false);
  });

  it('keeps a JSON profile change as the shared draft owner', async () => {
    vi.useFakeTimers();
    const { fixture, element } = render();
    element.querySelector<HTMLButtonElement>('#machine-tab-json')?.click();
    fixture.detectChanges();
    const textarea = element.querySelector<HTMLTextAreaElement>(
      '.mjson__editor',
    ) as HTMLTextAreaElement;
    textarea.value = JSON.stringify({ ...TCU01_SCHEMATIC, name: 'JSON profile owner' }, null, 2);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    vi.advanceTimersByTime(MACHINE_JSON_PARSE_DEBOUNCE_MS);
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('#machine-tab-form')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const formPanel = element.querySelector<HTMLElement>('#machine-panel-form');
    expect(formPanel?.querySelectorAll<HTMLInputElement>('input')[1]?.value).toBe(
      'JSON profile owner',
    );
  });

  it('reverts a foreign-profile Form draft to the exact saved document', async () => {
    vi.useFakeTimers();
    const { fixture, element } = render();
    element.querySelector<HTMLButtonElement>('#machine-tab-json')?.click();
    fixture.detectChanges();
    const textarea = element.querySelector<HTMLTextAreaElement>(
      '.mjson__editor',
    ) as HTMLTextAreaElement;
    textarea.value = JSON.stringify(TCU01_SCHEMATIC, null, 2);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(MACHINE_JSON_PARSE_DEBOUNCE_MS);
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('#machine-tab-form')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const revert = element.querySelector<HTMLButtonElement>('.mform__actions button');
    expect(revert?.disabled).toBe(false);
    revert?.click();
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('#machine-tab-json')?.click();
    fixture.detectChanges();
    const restored = JSON.parse(textarea.value) as MachineSchematic;
    expect(restored).toEqual(K207_SCHEMATIC);
  });

  it('does not lay out a structurally valid draft that violates its profile', () => {
    const broken = { ...K207_SCHEMATIC, pipes: [] };
    const { element } = render(broken);

    expect(element.querySelector('.editor__preview .schematic__svg')).toBeNull();
    expect(element.querySelector('.editor__preview .schematic__errors')).not.toBeNull();
  });

  it('localises a built-in name in the header but preserves a custom name', () => {
    expect(render().element.querySelector('.editor__name')?.textContent?.trim()).toBe(
      'Chłodziarka K-207',
    );

    const custom = { ...K207_SCHEMATIC, id: 'CUSTOM-01', name: 'My cooling skid' };
    expect(render(custom).element.querySelector('.editor__name')?.textContent?.trim()).toBe(
      'My cooling skid',
    );
  });

  it('switches to the Diagram tab and shows its edit canvas for the default document', async () => {
    const { fixture, element } = render();

    element.querySelector<HTMLButtonElement>('#machine-tab-diagram')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelector('#machine-tab-diagram')?.getAttribute('aria-selected')).toBe(
      'true',
    );
    const panel = element.querySelector<HTMLElement>('#machine-panel-diagram');
    expect(panel?.hidden).toBe(false);
    expect(panel?.querySelector('.diagram__svg')).not.toBeNull();
    expect(panel?.querySelectorAll('.diagram__node').length).toBeGreaterThan(0);
    expect(
      [...(panel?.querySelectorAll('.diagram__node-label') ?? [])].map((label) =>
        label.textContent?.trim(),
      ),
    ).toContain('POMPA P-1');
  });
});

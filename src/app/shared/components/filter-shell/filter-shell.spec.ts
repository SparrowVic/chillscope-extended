import { ChangeDetectionStrategy, Component, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { provideTestTransloco } from '../../../testing/transloco';
import { FilterLayout, type FilterShellMode } from './filter-layout';
import { CsFilterShell } from './filter-shell';

@Component({
  imports: [CsFilterShell],
  template: `
    <!-- The transformed wrapper reproduces the field bug: a transformed ancestor becomes the
         containing block for position:fixed, so the overlay MUST escape this subtree. -->
    <div class="transformed-frame" style="transform: translateY(-200px)">
      <cs-filter-shell
        label="filters.test"
        [activeCount]="2"
        (applied)="events.push('applied')"
        (discarded)="events.push('discarded')"
        (resetted)="events.push('resetted')"
      >
        <span csFilterSummary>
          @if (true) {
            summary
          }
        </span>
        <ng-template #controls>
          <input id="filter-probe" aria-label="probe" />
        </ng-template>
      </cs-filter-shell>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly events: string[] = [];
}

describe('CsFilterShell', () => {
  let mode: WritableSignal<FilterShellMode>;

  beforeEach(() => {
    mode = signal<FilterShellMode>('sheet');
    TestBed.configureTestingModule({
      providers: [
        ...provideTestTransloco({}),
        { provide: FilterLayout, useValue: { mode } as unknown as FilterLayout },
      ],
    });
  });

  function probes(): NodeListOf<HTMLElement> {
    return document.querySelectorAll<HTMLElement>('#filter-probe');
  }

  function entryButton(fixture: ComponentFixture<Host>): HTMLButtonElement {
    const entry = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.filter-shell__entry',
    );
    if (entry === null) {
      throw new Error('entry button not rendered');
    }
    return entry;
  }

  async function open(fixture: ComponentFixture<Host>): Promise<HTMLElement> {
    const entry = entryButton(fixture);
    entry.focus();
    entry.click();
    fixture.detectChanges();
    await fixture.whenStable();
    // Document-level on purpose: once portaled the dialog no longer lives under the fixture.
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (dialog === null) {
      throw new Error('dialog not rendered');
    }
    return dialog;
  }

  it('renders the one control tree in exactly one placement per mode — never twice', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    // Sheet tier, closed: the controls exist nowhere, only the entry key.
    expect(probes().length).toBe(0);

    await open(fixture);
    expect(probes().length).toBe(1);

    // Back to the inline tier: the overlay ceases, the toolbar carries the single instance.
    mode.set('inline');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(probes().length).toBe(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('uses the marked control template when the summary contains structural flow', () => {
    mode.set('inline');
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    expect(probes()).toHaveLength(1);
  });

  it('portals the overlay to body level, out of reach of transformed ancestors', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    const dialog = await open(fixture);

    // The overlay escaped the component subtree — including the transformed wrapper that
    // would otherwise capture position:fixed and anchor the sheet to the panel.
    expect((fixture.nativeElement as HTMLElement).contains(dialog)).toBe(false);
    expect(dialog.closest('.transformed-frame')).toBeNull();
    expect(dialog.closest('.cs-panel')).toBeNull();
    const portal = dialog.closest('.filter-shell__portal');
    expect(portal?.parentElement).toBe(document.body);
    expect(document.querySelector('.filter-shell__backdrop')?.closest('.filter-shell__portal')).toBe(
      portal,
    );

    // Closing removes the body-level portal again — nothing leaks between opens.
    dialog.querySelector<HTMLButtonElement>('.filter-shell__action--primary')?.click();
    fixture.detectChanges();
    expect(document.querySelector('.filter-shell__portal')).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('opens a real modal dialog: role, aria-modal, a titled label and initial focus', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    const dialog = await open(fixture);

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const titleId = dialog.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId ?? '')?.textContent).toContain('filters.test');
    expect(document.activeElement).toBe(dialog);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('Apply emits applied (no discard) and returns focus to the entry key', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const dialog = await open(fixture);

    dialog.querySelector<HTMLButtonElement>('.filter-shell__action--primary')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.events).toEqual(['applied']);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(entryButton(fixture));
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('Escape closes as a discard and restores focus', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const dialog = await open(fixture);

    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.events).toEqual(['discarded']);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(entryButton(fixture));
  });

  it('an Escape already claimed by an inner overlay leaves the dialog open', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const dialog = await open(fixture);

    const claimed = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    claimed.preventDefault();
    dialog.dispatchEvent(claimed);
    fixture.detectChanges();

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(fixture.componentInstance.events).toEqual([]);
  });

  it('Reset re-embeds the control tree (draft back to applied) and keeps the dialog open', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const dialog = await open(fixture);
    const before = probes()[0];
    before.setAttribute('data-dirty', 'yes');

    dialog.querySelector<HTMLButtonElement>('.filter-shell__foot .filter-shell__action')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.events).toEqual(['resetted']);
    const after = probes();
    expect(after.length).toBe(1);
    expect(after[0].hasAttribute('data-dirty')).toBe(false);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('an outside press dismisses as a discard; presses inside the dialog do not', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const dialog = await open(fixture);

    dialog.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(fixture.componentInstance.events).toEqual(['discarded']);
  });

  it('leaving the overlay tiers while open discards the draft and hands back the toolbar', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await open(fixture);

    mode.set('inline');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.events).toEqual(['discarded']);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(probes().length).toBe(1);
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('the entry key names itself, its state and the active-filter count for AT', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const entry = entryButton(fixture);

    expect(entry.getAttribute('aria-haspopup')).toBe('dialog');
    expect(entry.getAttribute('aria-expanded')).toBe('false');
    expect(entry.querySelector('.sr-only')?.textContent).toContain('filters.activeCount');
    expect(entry.querySelector('.filter-shell__count')?.textContent?.trim()).toBe('2');
  });

  it('unlocks body scroll and reclaims the body-level portal if destroyed while open', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await open(fixture);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.querySelector('.filter-shell__portal')).not.toBeNull();

    // A route change destroys the component but removes only its HOST element — the portal
    // lives on document.body and must be reclaimed explicitly, or it survives as an orphan.
    fixture.destroy();

    expect(document.body.style.overflow).not.toBe('hidden');
    expect(document.querySelector('.filter-shell__portal')).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    vi.restoreAllMocks();
  });
});

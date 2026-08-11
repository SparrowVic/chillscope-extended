import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import pl from '../../../assets/i18n/pl.json';
import { provideTestTransloco } from '../../testing/transloco';
import { AlarmsFacade } from '../../core/data/alarms.facade';
import type { Alarm } from '../../core/data/measurement.models';
import { MachineLibraryStore } from '../../core/machines/machine-library.store';
import { CsSelect } from '../../shared/controls/select/select';
import { AppShell } from './app-shell';

const ACTIVE_ALARM_COUNT = signal(0);
const ACTIVE_ALARMS = signal<readonly Alarm[]>([]);

@Component({
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class EmptyRoute {}

function render(): HTMLElement {
  const fixture = TestBed.createComponent(AppShell);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function renderFixture() {
  const fixture = TestBed.createComponent(AppShell);
  fixture.detectChanges();
  return fixture;
}

describe('AppShell', () => {
  beforeEach(() => {
    ACTIVE_ALARM_COUNT.set(0);
    ACTIVE_ALARMS.set([]);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'measurements', component: EmptyRoute }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideTestTransloco(pl),
        providePrimeNG({}),
        {
          provide: AlarmsFacade,
          useValue: {
            activeCount: ACTIVE_ALARM_COUNT.asReadonly(),
            activeAlarms: ACTIVE_ALARMS.asReadonly(),
          },
        },
      ],
    });
  });

  it('renders one labelled navigation with all five destinations', () => {
    const shell = render();
    const nav = shell.querySelector('nav');

    expect(shell.querySelectorAll('nav')).toHaveLength(1);
    expect(nav?.getAttribute('aria-label')).toBe('Menu główne');

    const labels = [...(nav?.querySelectorAll('.navigation__item') ?? [])].map((item) =>
      item.getAttribute('aria-label'),
    );
    expect(labels).toEqual(['Pulpit', 'Pomiary', 'Alarmy', 'Maszyny', 'Ustawienia']);
  });

  it('marks the current destination for sighted and assistive-technology users', async () => {
    const fixture = renderFixture();
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/measurements');
    fixture.detectChanges();

    const shell = fixture.nativeElement as HTMLElement;
    const active = shell.querySelector<HTMLAnchorElement>('.navigation__item--active');
    expect(active?.getAttribute('href')).toBe('/measurements');
    expect(active?.getAttribute('aria-current')).toBe('page');
  });

  it('points the skip link at the main landmark', () => {
    const shell = render();
    const skip = shell.querySelector<HTMLAnchorElement>('.skip-link');

    expect(skip?.textContent?.trim()).toBe('Przejdź do treści');
    expect(skip?.getAttribute('href')).toBe('#main-content');
    expect(shell.querySelector('main#main-content')).not.toBeNull();
  });

  it('describes the active alarm count without replacing the navigation label', () => {
    ACTIVE_ALARM_COUNT.set(123);
    const shell = render();
    const alarmLink = shell.querySelector<HTMLAnchorElement>('a[href="/alarms"]');
    const descriptionId = alarmLink?.getAttribute('aria-describedby');

    expect(alarmLink?.textContent).toContain('Alarmy');
    expect(descriptionId).toBe('navigation-active-alarm-count');
    expect(alarmLink?.querySelector('.navigation__badge')?.textContent?.trim()).toBe('99+');
    expect(shell.querySelector(`#${descriptionId}`)?.textContent?.trim()).toBe(
      'Aktywne alarmy: 123',
    );
  });

  it('shows the active-machine switcher and a muted LIVE indicator in the system strip', () => {
    const fixture = renderFixture();
    const shell = fixture.nativeElement as HTMLElement;

    expect(shell.querySelector('.strip__context')).not.toBeNull();
    expect(shell.querySelector('.strip__telemetry')).not.toBeNull();
    expect(shell.querySelector('.strip__controls')).not.toBeNull();

    const machineSelect = shell.querySelector<HTMLElement>('.machine-select [role="combobox"]');
    expect(machineSelect?.getAttribute('aria-label')).toBe('Wybierz aktywną maszynę');
    expect(shell.querySelector('select.machine-select__input')).toBeNull();

    const control = fixture.debugElement.query(By.directive(CsSelect))
      .componentInstance as CsSelect<string>;
    expect(control.value()).toBe('K-207');
    expect(control.options()).toEqual([
      { value: 'K-207', label: 'K-207 · Chłodziarka K-207' },
      { value: 'TCU-01', label: 'TCU-01 · Termostat TCU-01' },
      { value: 'CH-02', label: 'CH-02 · Chłodziarka CH-02' },
    ]);
    expect(control.appendTo()).toBe('body');

    const live = shell.querySelector('.live');
    expect(live).not.toBeNull();
    expect(live?.classList.contains('live--on')).toBe(false);
    expect(live?.querySelector('.sr-only')?.textContent?.trim()).toBe('Podgląd na żywo wyłączony');

    expect(shell.querySelector('.strip__state')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Stan maszyny: Poprawne',
    );
    const clock = shell.querySelector<HTMLTimeElement>('time.clock');
    expect(clock?.getAttribute('aria-label')).toBe('Aktualny czas');
    expect(clock?.dateTime).toMatch(/^2026-/);
  });

  it('rolls the shared machine select back when persistence rejects the candidate', () => {
    const machines = TestBed.inject(MachineLibraryStore);
    vi.spyOn(machines, 'setActive').mockReturnValue({ ok: false, reason: 'persistence' });
    const fixture = renderFixture();
    const control = fixture.debugElement.query(By.directive(CsSelect))
      .componentInstance as CsSelect<string>;

    control.value.set('TCU-01');
    fixture.detectChanges();
    fixture.detectChanges();

    expect(control.value()).toBe('K-207');
    expect(
      fixture.nativeElement
        .querySelector('.machine-select [role="combobox"]')
        ?.getAttribute('aria-describedby'),
    ).toBe('machine-select-error');
    expect(fixture.nativeElement.querySelector('#machine-select-error')?.getAttribute('role')).toBe(
      'alert',
    );
  });
});

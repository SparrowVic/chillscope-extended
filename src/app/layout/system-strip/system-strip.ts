import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter, map } from 'rxjs';

import { AlarmsFacade } from '../../core/data/alarms.facade';
import { MeasurementsFacade } from '../../core/data/measurements.facade';
import { injectActiveLanguage } from '../../core/i18n/active-language';
import { injectTranslator } from '../../core/i18n/translator';
import { displayMachineName } from '../../core/machines/builtin-machine-copy';
import { MachineLibraryStore } from '../../core/machines/machine-library.store';
import { SettingsStore } from '../../core/settings/settings.store';
import type { AlarmSeverity } from '../../core/data/measurement.models';
import { injectClock } from '../../shared/clock';
import { CsSelect } from '../../shared/controls/select/select';
import type { SelectOption } from '../../shared/controls/select-option';
import { CsIcon } from '../../shared/icons/cs-icon/cs-icon';
import { CsDigitMorph } from '../../shared/motion/digit-morph/digit-morph';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../../shared/time';
import { LanguageSwitch } from '../language-switch/language-switch';
import { ThemeSwitch } from '../theme-switch/theme-switch';

/**
 * When the simulated K-207 last came up. A constant, not `Date.now()`: the machine's uptime must
 * not reset every time the monitoring page reloads, and a fixed epoch keeps it deterministic.
 */
const MACHINE_BOOT_MS = Date.UTC(2026, 6, 19, 4, 12, 0);

function pad(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

/** Machine context, live state and preferences above the current route. */
@Component({
  selector: 'app-system-strip',
  imports: [RouterLink, TranslocoPipe, CsSelect, CsIcon, CsDigitMorph, ThemeSwitch, LanguageSwitch],
  templateUrl: './system-strip.html',
  styleUrl: './system-strip.css',
  host: { role: 'banner', '[class.strip--docked]': 'docked()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SystemStrip {
  readonly #measurements = inject(MeasurementsFacade);
  readonly #alarms = inject(AlarmsFacade);
  readonly #machines = inject(MachineLibraryStore);
  readonly #settings = inject(SettingsStore);
  readonly #router = inject(Router);
  readonly #language = injectActiveLanguage();
  readonly #translator = injectTranslator();
  readonly #now = injectClock(1_000);

  protected readonly live = this.#measurements.liveEnabled;
  protected readonly settingsPersistenceFailed = this.#settings.persistenceFailed;

  /** The machine plate is a switcher now (configurator spec §3): the whole app follows it. */
  protected readonly machines = computed<readonly SelectOption<string>[]>(() => {
    const translate = this.#translator();
    return this.#machines.machines().map((machine) => ({
      value: machine.id,
      label: `${machine.id} · ${displayMachineName(machine, translate)}`,
    }));
  });
  protected readonly activeMachineId = this.#machines.activeId;
  protected readonly selectedMachineId = linkedSignal(() => this.activeMachineId());
  protected readonly machineSwitchFailed = signal(false);
  private readonly machineSelect = viewChild<CsSelect<string>>('machineSelect');

  constructor() {
    /* The selector owns a candidate until the atomic localStorage write succeeds. Keeping that
       buffer separate from activeId lets PrimeNG roll back instead of displaying an uncommitted
       machine when persistence is unavailable. */
    effect(() => {
      const selectedId = this.selectedMachineId();
      const activeId = this.activeMachineId();
      if (selectedId === activeId) {
        return;
      }

      const result = this.#machines.setActive(selectedId);
      this.machineSwitchFailed.set(!result.ok && result.reason === 'persistence');
      if (!result.ok) {
        this.selectedMachineId.set(activeId);
        this.machineSelect()?.value.set(activeId);
      }
    });
  }

  readonly #url = toSignal(
    this.#router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.#router.url),
    ),
    { initialValue: this.#router.url },
  );

  /** §5: the strip scrolls away with the page except on the Dashboard. */
  protected readonly docked = computed(() => this.#url().startsWith('/dashboard'));

  /** The machine's state is the worst active alarm severity — the one-glance synoptic verdict. */
  protected readonly state = computed<AlarmSeverity | 'ok'>(() => {
    const active = this.#alarms.activeAlarms();
    if (active.some((alarm) => alarm.severity === 'critical')) {
      return 'critical';
    }
    return active.some((alarm) => alarm.severity === 'warning') ? 'warning' : 'ok';
  });

  protected readonly uptimeText = computed(() => {
    const elapsed = Math.max(0, this.#now() - MACHINE_BOOT_MS);
    const days = Math.floor(elapsed / DAY_MS);
    const hours = Math.floor((elapsed % DAY_MS) / HOUR_MS);
    const minutes = Math.floor((elapsed % HOUR_MS) / MINUTE_MS);
    const seconds = Math.floor((elapsed % MINUTE_MS) / 1_000);
    return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  });

  readonly #timeFormat = computed(
    () =>
      new Intl.DateTimeFormat(this.#language(), {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
  );

  protected readonly clockText = computed(() => this.#timeFormat().format(this.#now()));
  protected readonly clockDateTime = computed(() => new Date(this.#now()).toISOString());
}

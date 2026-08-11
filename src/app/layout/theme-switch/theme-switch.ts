import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { SettingsStore, type ThemeMode } from '../../core/settings/settings.store';
import { CsIcon } from '../../shared/icons/cs-icon/cs-icon';
import type { CsIconName } from '../../shared/icons/icon-roster';

interface ThemeOption {
  readonly value: ThemeMode;
  readonly labelKey: string;
  readonly icon: CsIconName;
}

const THEMES: readonly ThemeOption[] = [
  { value: 'light', labelKey: 'theme.light', icon: 'sun' },
  { value: 'dark', labelKey: 'theme.dark', icon: 'moon' },
];

@Component({
  selector: 'app-theme-switch',
  imports: [CsIcon, TranslocoPipe],
  templateUrl: './theme-switch.html',
  styleUrl: './theme-switch.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeSwitch {
  readonly #settings = inject(SettingsStore);

  protected readonly theme = this.#settings.theme;
  protected readonly options = THEMES;

  protected select(theme: ThemeMode): void {
    this.#settings.setTheme(theme);
  }
}

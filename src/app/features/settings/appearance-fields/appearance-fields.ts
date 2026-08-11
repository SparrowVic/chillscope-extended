import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { SettingsStore, type Density, type ThemeMode } from '../../../core/settings/settings.store';
import type { AppLanguage } from '../../../core/i18n/transloco.config';
import {
  CsSegmentedControl,
  type SegmentedControlOption,
} from '../../../shared/controls/segmented-control/segmented-control';
import { CsSelect } from '../../../shared/controls/select/select';
import type { SelectOption } from '../../../shared/controls/select-option';

/**
 * Appearance applies on change rather than on Save. The same two settings sit one click away in the
 * top bar, where they apply instantly — a select that looked identical but waited for a button read
 * as a bug, and the deferred copy is what used to wipe out the rest of the form when the top bar
 * was used mid-edit. Density follows the same commit rule: it is a look, not a simulation input.
 *
 * Because nothing here is ever a draft, the store is read and written directly, exactly as the top
 * bar's own switches do — routing it through the Settings screen would only be a relay.
 */
@Component({
  selector: 'app-appearance-fields',
  imports: [CsSegmentedControl, CsSelect],
  templateUrl: './appearance-fields.html',
  styleUrl: './appearance-fields.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppearanceFields {
  readonly #settings = inject(SettingsStore);

  protected readonly language = this.#settings.language;
  protected readonly theme = this.#settings.theme;
  protected readonly density = this.#settings.density;

  protected readonly languageOptions: readonly SelectOption<AppLanguage>[] = [
    { value: 'pl', label: 'language.pl' },
    { value: 'en', label: 'language.en' },
  ];

  protected readonly themeOptions: readonly SelectOption<ThemeMode>[] = [
    { value: 'light', label: 'theme.light' },
    { value: 'dark', label: 'theme.dark' },
  ];

  /** Three fixed looks, one glance — an instrument switch, not a dropdown. */
  protected readonly densityOptions: readonly SegmentedControlOption<Density>[] = [
    { value: 'compact', label: 'settings.appearance.density.compact' },
    { value: 'normal', label: 'settings.appearance.density.normal' },
    { value: 'comfortable', label: 'settings.appearance.density.comfortable' },
  ];

  protected setLanguage(language: AppLanguage): void {
    this.#settings.setLanguage(language);
  }

  protected setTheme(theme: ThemeMode): void {
    this.#settings.setTheme(theme);
  }

  protected setDensity(density: Density): void {
    this.#settings.setDensity(density);
  }
}

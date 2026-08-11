import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { APP_LANGUAGES, type AppLanguage } from '../../core/i18n/transloco.config';
import { SettingsStore } from '../../core/settings/settings.store';

interface LanguageOption {
  readonly value: AppLanguage;
  readonly codeKey: string;
  readonly labelKey: string;
}

const CODE_KEYS: Readonly<Record<AppLanguage, string>> = {
  pl: 'language.shortPl',
  en: 'language.shortEn',
};

const LABEL_KEYS: Readonly<Record<AppLanguage, string>> = {
  pl: 'language.pl',
  en: 'language.en',
};

const LANGUAGES: readonly LanguageOption[] = APP_LANGUAGES.map((value) => ({
  value,
  codeKey: CODE_KEYS[value],
  labelKey: LABEL_KEYS[value],
}));

@Component({
  selector: 'app-language-switch',
  imports: [TranslocoPipe],
  templateUrl: './language-switch.html',
  styleUrl: './language-switch.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageSwitch {
  readonly #settings = inject(SettingsStore);
  readonly #transloco = inject(TranslocoService);

  protected readonly language = this.#settings.language;
  protected readonly options = LANGUAGES;

  constructor() {
    // Transloco keeps the active language outside the reactive graph, so mirroring the persisted
    // choice into it is a genuine side effect rather than a derived value.
    effect(() => this.#transloco.setActiveLang(this.#settings.language()));
  }

  protected select(language: AppLanguage): void {
    this.#settings.setLanguage(language);
  }
}

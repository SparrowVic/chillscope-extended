import { computed, DOCUMENT, effect, inject, Injectable, signal } from '@angular/core';
import type { SeriesId, SeriesThresholds } from '../data/measurement.models';
import { isSeriesId, isSeriesThresholds } from '../data/series.catalog';
import { DEFAULT_LANGUAGE, isAppLanguage, type AppLanguage } from '../i18n/transloco.config';
import { openLocalStorage, readJson, writeJson } from '../storage';
import { clamp } from '../math';

export type ThemeMode = 'light' | 'dark';

/** Drives the §6 token triplet via `html[data-density]` plus PrimeNG's `size` in the wrappers. */
export type Density = 'compact' | 'normal' | 'comfortable';

/** The language catalogue belongs to the i18n setup; this is only a name the Settings screen uses. */
export type LanguageCode = AppLanguage;

/** Thresholds hold overrides only, so a series the user never touched simply has no entry. */
export type ThresholdOverrides = Readonly<Partial<Record<SeriesId, SeriesThresholds>>>;

export interface Settings {
  readonly theme: ThemeMode;
  readonly language: LanguageCode;
  readonly density: Density;
  readonly liveIntervalMs: number;
  readonly failureRate: number;
  readonly thresholds: ThresholdOverrides;
}

export interface SimulationSettingsInput {
  readonly liveIntervalMs: number;
  readonly failureRate: number;
  readonly thresholds: ThresholdOverrides;
}

export const DEFAULT_DENSITY: Density = 'normal';
export const DEFAULT_LIVE_INTERVAL_MS = 5_000;
export const DEFAULT_FAILURE_RATE = 0;

export const LIVE_INTERVAL_MS_RANGE = { min: 1_000, max: 60_000 } as const;
export const FAILURE_RATE_RANGE = { min: 0, max: 1 } as const;

const STORAGE_KEY = 'chillscope.settings';

/** Must match theme.options.darkModeSelector in app.config.ts. */
const DARK_MODE_CLASS = 'app-dark';

/** Must match the html[data-density] selectors in styles.css. */
const DENSITY_ATTRIBUTE = 'data-density';

@Injectable({ providedIn: 'root' })
export class SettingsStore {
  readonly #document = inject(DOCUMENT);
  readonly #storage = openLocalStorage(this.#document);
  readonly #restored = readSettings(this.#storage);

  readonly #theme = signal(this.#restored.theme ?? preferredTheme(this.#document));
  readonly #language = signal(this.#restored.language ?? DEFAULT_LANGUAGE);
  readonly #density = signal(this.#restored.density ?? DEFAULT_DENSITY);
  readonly #liveIntervalMs = signal(this.#restored.liveIntervalMs ?? DEFAULT_LIVE_INTERVAL_MS);
  readonly #failureRate = signal(this.#restored.failureRate ?? DEFAULT_FAILURE_RATE);
  readonly #thresholds = signal(this.#restored.thresholds ?? noThresholds());
  readonly #persistenceFailed = signal(false);

  readonly theme = this.#theme.asReadonly();
  readonly language = this.#language.asReadonly();
  readonly density = this.#density.asReadonly();
  readonly liveIntervalMs = this.#liveIntervalMs.asReadonly();
  readonly failureRate = this.#failureRate.asReadonly();
  readonly thresholds = this.#thresholds.asReadonly();
  readonly persistenceFailed = this.#persistenceFailed.asReadonly();

  readonly #snapshot = computed<Settings>(() => ({
    theme: this.#theme(),
    language: this.#language(),
    density: this.#density(),
    liveIntervalMs: this.#liveIntervalMs(),
    failureRate: this.#failureRate(),
    thresholds: this.#thresholds(),
  }));

  constructor() {
    effect(() => {
      const dark = this.#theme() === 'dark';
      const root = this.#document.documentElement;
      root.classList.toggle(DARK_MODE_CLASS, dark);
      // index.html paints the dark canvas before Angular starts. Once tokens are available the
      // inline bootstrap colour must go, otherwise switching back to light leaves dark overscroll.
      root.style.background = '';
      const canvas = this.#document.defaultView
        ?.getComputedStyle(root)
        .getPropertyValue('--cs-canvas')
        .trim();
      const themeColor = this.#document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (themeColor && canvas) {
        themeColor.content = canvas;
      }
    });

    effect(() => {
      this.#document.documentElement.setAttribute(DENSITY_ATTRIBUTE, this.#density());
    });

    this.#persist();
  }

  setTheme(theme: ThemeMode): void {
    this.#theme.set(theme);
    this.#persist();
  }

  setLanguage(language: LanguageCode): void {
    this.#language.set(language);
    this.#persist();
  }

  setDensity(density: Density): void {
    this.#density.set(density);
    this.#persist();
  }

  setLiveIntervalMs(intervalMs: number): void {
    this.#liveIntervalMs.set(clampLiveInterval(intervalMs));
    this.#persist();
  }

  setFailureRate(rate: number): void {
    this.#failureRate.set(clampFailureRate(rate));
    this.#persist();
  }

  setThresholds(id: SeriesId, thresholds: SeriesThresholds): void {
    if (!isSeriesThresholds(thresholds)) {
      return;
    }
    this.#thresholds.update((current) => ({ ...current, [id]: thresholds }));
    this.#persist();
  }

  /** Commits the form-owned settings as one browser-storage snapshot. */
  setSimulation(input: SimulationSettingsInput): void {
    const thresholds = validatedThresholds(input.thresholds);
    this.#liveIntervalMs.set(clampLiveInterval(input.liveIntervalMs));
    this.#failureRate.set(clampFailureRate(input.failureRate));
    this.#thresholds.set(thresholds);
    this.#persist();
  }

  reset(): void {
    this.#theme.set(preferredTheme(this.#document));
    this.#language.set(DEFAULT_LANGUAGE);
    this.#density.set(DEFAULT_DENSITY);
    this.#liveIntervalMs.set(DEFAULT_LIVE_INTERVAL_MS);
    this.#failureRate.set(DEFAULT_FAILURE_RATE);
    this.#thresholds.set(noThresholds());
    this.#persist();
  }

  #persist(): void {
    this.#persistenceFailed.set(!writeJson(this.#storage, STORAGE_KEY, this.#snapshot()));
  }
}

/**
 * Thresholds are served by /api/series, so the store starts empty and holds nothing but the
 * overrides the user makes on the Settings screen.
 */
function noThresholds(): ThresholdOverrides {
  return {};
}

/** jsdom and SSR both lack matchMedia, and an unguarded call throws during construction. */
function preferredTheme(document: Document): ThemeMode {
  const view = document.defaultView;
  if (typeof view?.matchMedia !== 'function') {
    return 'light';
  }
  return view.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readSettings(storage: Storage | undefined): Partial<Settings> {
  return parseSettings(readJson(storage, STORAGE_KEY));
}

function parseSettings(value: unknown): Partial<Settings> {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  const raw = value as Record<string, unknown>;
  return {
    theme: raw['theme'] === 'dark' || raw['theme'] === 'light' ? raw['theme'] : undefined,
    language: isAppLanguage(raw['language']) ? raw['language'] : undefined,
    density: isDensity(raw['density']) ? raw['density'] : undefined,
    liveIntervalMs: isFiniteNumber(raw['liveIntervalMs'])
      ? clampLiveInterval(raw['liveIntervalMs'])
      : undefined,
    failureRate: isFiniteNumber(raw['failureRate'])
      ? clampFailureRate(raw['failureRate'])
      : undefined,
    thresholds: parseThresholds(raw['thresholds']),
  };
}

function isDensity(value: unknown): value is Density {
  return value === 'compact' || value === 'normal' || value === 'comfortable';
}

function parseThresholds(value: unknown): ThresholdOverrides | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const parsed: Partial<Record<SeriesId, SeriesThresholds>> = {};
  for (const [id, thresholds] of Object.entries(value)) {
    if (isSeriesId(id) && isSeriesThresholds(thresholds)) {
      parsed[id] = thresholds;
    }
  }
  return parsed;
}

function validatedThresholds(value: ThresholdOverrides): ThresholdOverrides {
  const parsed: Partial<Record<SeriesId, SeriesThresholds>> = {};
  for (const [id, thresholds] of Object.entries(value)) {
    if (isSeriesId(id) && isSeriesThresholds(thresholds)) {
      parsed[id] = thresholds;
    }
  }
  return parsed;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clampLiveInterval(intervalMs: number): number {
  if (!Number.isFinite(intervalMs)) {
    return DEFAULT_LIVE_INTERVAL_MS;
  }
  return clamp(Math.round(intervalMs), LIVE_INTERVAL_MS_RANGE.min, LIVE_INTERVAL_MS_RANGE.max);
}

function clampFailureRate(rate: number): number {
  if (!Number.isFinite(rate)) {
    return DEFAULT_FAILURE_RATE;
  }
  return clamp(rate, FAILURE_RATE_RANGE.min, FAILURE_RATE_RANGE.max);
}

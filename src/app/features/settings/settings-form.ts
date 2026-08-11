import {
  applyEach,
  max,
  min,
  required,
  schema,
  validate,
  type ValidationError,
} from '@angular/forms/signals';

import type { SeriesId, SeriesThresholds } from '../../core/data/measurement.models';
import { SERIES_CATALOG, SERIES_IDS } from '../../core/data/series.catalog';
import {
  FAILURE_RATE_RANGE,
  LIVE_INTERVAL_MS_RANGE,
  type SimulationSettingsInput,
} from '../../core/settings/settings.store';

/** `cs-input-number` clears to `null`, so an empty field is a real state the schema must reject. */
export interface ThresholdBandValue {
  warningMin: number | null;
  warningMax: number | null;
  criticalMin: number | null;
  criticalMax: number | null;
}

/**
 * Theme and language are deliberately absent: the top bar applies them the moment they are clicked,
 * so putting them behind this form's Save button gave one setting two contradictory commit rules —
 * and re-seeding the form from the store discarded whatever else was half-typed at the time.
 */
export interface SettingsFormValue {
  /** `null` because the paired number field can be cleared, exactly like a threshold bound. */
  liveIntervalMs: number | null;
  /** Percent rather than the store's 0–1 fraction, because that is what the slider shows. */
  failureRatePercent: number | null;
  thresholds: Record<SeriesId, ThresholdBandValue>;
}

export interface SettingsSnapshot {
  readonly liveIntervalMs: number;
  readonly failureRate: number;
  /** The store keeps overrides only; a missing entry means "still on the series default". */
  readonly thresholds: Readonly<Partial<Record<SeriesId, SeriesThresholds>>>;
}

export interface ThresholdSeries {
  readonly id: SeriesId;
  readonly unit: string;
  /** Series palette colour for the legend dot beside the series name — never for UI chrome. */
  readonly color: string;
}

/**
 * Defaults come from the catalogue rather than from `/api/series`, because this is the screen that
 * sets the fake backend's failure rate: at 100% the catalogue request never succeeds and the user
 * would be locked out of the very control that unlocks it.
 */
export const THRESHOLD_SERIES: readonly ThresholdSeries[] = SERIES_IDS.map((id) => ({
  id,
  unit: SERIES_CATALOG[id].unit,
  color: SERIES_CATALOG[id].color,
}));

const PERCENT = 100;

/** The failure-rate bounds in the unit the form edits, shared with the companion slider. */
export const FAILURE_RATE_PERCENT_RANGE = {
  min: FAILURE_RATE_RANGE.min * PERCENT,
  max: FAILURE_RATE_RANGE.max * PERCENT,
} as const;

export function toFormValue(snapshot: SettingsSnapshot): SettingsFormValue {
  return {
    liveIntervalMs: snapshot.liveIntervalMs,
    failureRatePercent: Math.round(snapshot.failureRate * PERCENT),
    thresholds: toThresholdBands(snapshot.thresholds),
  };
}

export function toFailureRate(percent: number): number {
  return percent / PERCENT;
}

/**
 * The store input for a Save, or `undefined` while a cleared field makes the form unsaveable.
 * Submission is disabled exactly then, so the `undefined` branch is a type-level guard rather
 * than a reachable code path.
 */
export function toSimulationSettings(value: SettingsFormValue): SimulationSettingsInput | undefined {
  const { liveIntervalMs, failureRatePercent } = value;
  if (liveIntervalMs === null || failureRatePercent === null) {
    return undefined;
  }
  const thresholds: Partial<Record<SeriesId, SeriesThresholds>> = {};
  for (const { id } of THRESHOLD_SERIES) {
    const band = toSeriesThresholds(value.thresholds[id]);
    if (band !== undefined) {
      thresholds[id] = band;
    }
  }
  return { liveIntervalMs, failureRate: toFailureRate(failureRatePercent), thresholds };
}

export function toSeriesThresholds(band: ThresholdBandValue): SeriesThresholds | undefined {
  const { warningMin, warningMax, criticalMin, criticalMax } = band;
  if (warningMin === null || warningMax === null || criticalMin === null || criticalMax === null) {
    return undefined;
  }
  return { warningMin, warningMax, criticalMin, criticalMax };
}

function toThresholdBands(
  overrides: Readonly<Partial<Record<SeriesId, SeriesThresholds>>>,
): Record<SeriesId, ThresholdBandValue> {
  const bands = {} as Record<SeriesId, ThresholdBandValue>;
  for (const id of SERIES_IDS) {
    const { warningMin, warningMax, criticalMin, criticalMax } =
      overrides[id] ?? SERIES_CATALOG[id].thresholds;
    bands[id] = { warningMin, warningMax, criticalMin, criticalMax };
  }
  return bands;
}

/**
 * The band has to read criticalMin < warningMin < warningMax < criticalMax. Every rule is stated on
 * both fields it constrains, because the message is only ever shown on a field the user has
 * touched: attaching the ordering rules to the warning pair alone meant that editing `criticalMax`
 * invalidated the form and rendered no message anywhere, leaving a dead Save button unexplained.
 */
const thresholdBandSchema = schema<ThresholdBandValue>((band) => {
  required(band.criticalMin);
  required(band.warningMin);
  required(band.warningMax);
  required(band.criticalMax);

  validate(band.criticalMin, ({ value, valueOf }) =>
    outsideWarning(
      valueOf(band.warningMin),
      value(),
      (warningMin, criticalMin) => criticalMin < warningMin,
    ),
  );

  validate(band.criticalMax, ({ value, valueOf }) =>
    outsideWarning(
      valueOf(band.warningMax),
      value(),
      (warningMax, criticalMax) => criticalMax > warningMax,
    ),
  );

  validate(band.warningMin, ({ value, valueOf }) => {
    const warningMin = value();
    if (warningMin === null) {
      return null;
    }
    const errors: ValidationError.WithoutFieldTree[] = [];
    const warningMax = valueOf(band.warningMax);
    const criticalMin = valueOf(band.criticalMin);
    if (warningMax !== null && warningMin >= warningMax) {
      errors.push({ kind: 'thresholdOrder' });
    }
    if (criticalMin !== null && warningMin <= criticalMin) {
      errors.push({ kind: 'criticalOutsideWarning' });
    }
    return errors;
  });

  validate(band.warningMax, ({ value, valueOf }) => {
    const warningMax = value();
    if (warningMax === null) {
      return null;
    }
    const errors: ValidationError.WithoutFieldTree[] = [];
    const warningMin = valueOf(band.warningMin);
    const criticalMax = valueOf(band.criticalMax);
    if (warningMin !== null && warningMax <= warningMin) {
      errors.push({ kind: 'thresholdOrder' });
    }
    if (criticalMax !== null && warningMax >= criticalMax) {
      errors.push({ kind: 'criticalOutsideWarning' });
    }
    return errors;
  });
});

function outsideWarning(
  warning: number | null,
  critical: number | null,
  ordered: (warning: number, critical: number) => boolean,
): ValidationError.WithoutFieldTree | null {
  if (warning === null || critical === null || ordered(warning, critical)) {
    return null;
  }
  return { kind: 'criticalOutsideWarning' };
}

/**
 * Both simulation fields carry `required()` because each is edited through a slider–number pair:
 * the slider can never reach an empty value, but its typed twin clears to `null` exactly like a
 * threshold bound, and an empty field must block Save with a message rather than persist garbage.
 */
export const settingsFormSchema = schema<SettingsFormValue>((settings) => {
  required(settings.liveIntervalMs);
  min(settings.liveIntervalMs, LIVE_INTERVAL_MS_RANGE.min);
  max(settings.liveIntervalMs, LIVE_INTERVAL_MS_RANGE.max);

  required(settings.failureRatePercent);
  min(settings.failureRatePercent, FAILURE_RATE_PERCENT_RANGE.min);
  max(settings.failureRatePercent, FAILURE_RATE_PERCENT_RANGE.max);

  applyEach(settings.thresholds, thresholdBandSchema);
});

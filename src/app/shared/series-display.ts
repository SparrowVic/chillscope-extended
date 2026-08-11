import type { SeriesId } from '../core/data/measurement.models';
import type { CsIconName } from './icons/icon-roster';

/**
 * Translation keys, not display strings: both the series name and its unit symbol change with the
 * language — `rpm` reads `obr/min` in Polish. Every screen looks the key up here instead of
 * interpolating `series.${id}` inline, so a renamed key breaks the build rather than the UI.
 */
export const SERIES_LABEL_KEYS: Readonly<Record<SeriesId, string>> = {
  temperature: 'series.temperature',
  pressure: 'series.pressure',
  flow: 'series.flow',
  rpm: 'series.rpm',
};

export const SERIES_UNIT_KEYS: Readonly<Record<SeriesId, string>> = {
  temperature: 'units.celsius',
  pressure: 'units.bar',
  flow: 'units.litersPerMinute',
  rpm: 'units.rpm',
};

/** The one series→glyph vocabulary — the tape deck and the sensor channels must agree. */
export const SERIES_ICON_NAMES: Readonly<Record<SeriesId, CsIconName>> = {
  temperature: 'temperature-half',
  pressure: 'gauge',
  flow: 'water',
  rpm: 'fan',
};

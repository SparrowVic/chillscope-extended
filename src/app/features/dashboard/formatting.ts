import { computed, type Signal } from '@angular/core';
import { injectActiveLanguage } from '../../core/i18n/active-language';
import { compactTimestampFormat, formatMeasurement } from '../../shared/intl';

/**
 * Formatting functions rather than bare `Intl` instances, so a caller cannot skip the
 * negative-zero normalisation that every measured value goes through.
 */
export function injectMeasurementFormatter(): Signal<(value: number) => string> {
  const language = injectActiveLanguage();
  return computed(() => {
    const lang = language();
    return (value: number) => formatMeasurement(value, lang);
  });
}

export function injectTimestampFormatter(): Signal<(timestamp: number) => string> {
  const language = injectActiveLanguage();
  return computed(() => {
    const format = compactTimestampFormat(language());
    return (timestamp: number) => format.format(timestamp);
  });
}

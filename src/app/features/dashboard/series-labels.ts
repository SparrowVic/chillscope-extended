import { computed, type Signal } from '@angular/core';
import type { SeriesId } from '../../core/data/measurement.models';
import { injectTranslator } from '../../core/i18n/translator';
import { SERIES_LABEL_KEYS, SERIES_UNIT_KEYS } from '../../shared/series-display';

/**
 * Resolves one translation key per series eagerly. The four ids are spelled out rather than
 * mapped over `SERIES_IDS`, because only a literal object proves `Record<SeriesId, string>` to
 * the compiler — a renamed series then breaks the build instead of the chart.
 */
function injectSeriesText(
  keys: Readonly<Record<SeriesId, string>>,
): Signal<Readonly<Record<SeriesId, string>>> {
  const translator = injectTranslator();

  return computed(() => {
    const translate = translator();
    return {
      temperature: translate(keys.temperature),
      pressure: translate(keys.pressure),
      flow: translate(keys.flow),
      rpm: translate(keys.rpm),
    };
  });
}

/** Resolved eagerly because the chart is not an Angular template and cannot use the pipe. */
export function injectSeriesLabels(): Signal<Readonly<Record<SeriesId, string>>> {
  return injectSeriesText(SERIES_LABEL_KEYS);
}

/** The ECharts canvas cannot use Transloco pipes, including for language-specific unit symbols. */
export function injectSeriesUnits(): Signal<Readonly<Record<SeriesId, string>>> {
  return injectSeriesText(SERIES_UNIT_KEYS);
}

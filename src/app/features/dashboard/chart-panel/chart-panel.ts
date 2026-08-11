import '@chillscope/chart';

import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  computed,
  input,
  output,
} from '@angular/core';
import type {
  ChartLabels,
  ChartSeries,
  ChartTheme,
  ChartThresholds,
  RangeSelectedDetail,
} from '@chillscope/chart/types';
import { TranslocoPipe } from '@jsverse/transloco';

import { toChartSeries, toChartThresholds } from '../../../core/data/measurement.mapper';
import type { MeasurementSeries } from '../../../core/data/measurement.models';
import { injectActiveLanguage } from '../../../core/i18n/active-language';
import { injectTranslator } from '../../../core/i18n/translator';
import { injectSeriesLabels, injectSeriesUnits } from '../series-labels';

@Component({
  selector: 'app-chart-panel',
  imports: [TranslocoPipe],
  templateUrl: './chart-panel.html',
  styleUrl: './chart-panel.css',
  host: { class: 'cs-panel' },
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartPanel {
  readonly series = input.required<readonly MeasurementSeries[]>();
  readonly theme = input.required<ChartTheme>();
  readonly loading = input(false);
  readonly zoomDepth = input(0);
  readonly resetKey = input(0);
  readonly rangeSelected = output<RangeSelectedDetail>();
  readonly undoRange = output<void>();
  readonly restoreRange = output<void>();

  readonly #seriesLabels = injectSeriesLabels();
  readonly #seriesUnits = injectSeriesUnits();
  readonly #translator = injectTranslator();

  /** The chart formats its own tooltip and axis labels, so it needs the language, not a translation. */
  protected readonly language = injectActiveLanguage();

  protected readonly chartSeries = computed<ChartSeries[]>(() =>
    toChartSeries(this.series(), this.#seriesLabels(), this.#seriesUnits()),
  );

  protected readonly chartThresholds = computed<ChartThresholds>(() =>
    toChartThresholds(this.series()),
  );

  protected readonly chartLabels = computed<ChartLabels>(() => {
    const translate = this.#translator();
    return {
      empty: translate('chart.empty'),
      loading: translate('chart.loading'),
      ariaLabel: translate('chart.ariaLabel'),
    };
  });

  protected onRangeSelected(event: Event): void {
    this.rangeSelected.emit((event as CustomEvent<RangeSelectedDetail>).detail);
  }

  protected onRestoreRequested(): void {
    this.restoreRange.emit();
  }
}

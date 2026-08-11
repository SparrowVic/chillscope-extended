import type { Signal, WritableSignal } from '@angular/core';
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { providePrimeNG } from 'primeng/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SeriesId } from '../../../core/data/measurement.models';
import { SERIES_IDS } from '../../../core/data/series.catalog';
import { provideTestTransloco } from '../../../testing/transloco';
import {
  FilterLayout,
  type FilterShellMode,
} from '../../../shared/components/filter-shell/filter-layout';
import type { SelectOption } from '../../../shared/controls/select-option';
import { SERIES_LABEL_KEYS } from '../../../shared/series-display';
import { MeasurementsFilters } from './measurements-filters';

interface FiltersView {
  readonly seriesOptions: Signal<SelectOption<SeriesId>[]>;
  onSeriesPicked(ids: SeriesId[]): void;
  onBucketPicked(bucket: string): void;
  commitStaged(): void;
  discardStaged(): void;
}

describe('MeasurementsFilters', () => {
  let mode: WritableSignal<FilterShellMode>;

  beforeEach(() => {
    mode = signal<FilterShellMode>('inline');
    TestBed.configureTestingModule({
      providers: [
        ...provideTestTransloco({}),
        providePrimeNG({}),
        { provide: FilterLayout, useValue: { mode } as unknown as FilterLayout },
      ],
    });
  });

  function createFixture(): ComponentFixture<MeasurementsFilters> {
    const fixture = TestBed.createComponent(MeasurementsFilters);
    fixture.componentRef.setInput('availableSeries', SERIES_IDS);
    fixture.componentRef.setInput('selectedSeries', SERIES_IDS);
    fixture.componentRef.setInput('range', { from: 1, to: 2 });
    fixture.componentRef.setInput('bucket', 'raw');
    fixture.detectChanges();
    return fixture;
  }

  it('keeps selected series labelled while the catalogue is temporarily unavailable', () => {
    const fixture = TestBed.createComponent(MeasurementsFilters);
    fixture.componentRef.setInput('availableSeries', []);
    fixture.componentRef.setInput('selectedSeries', SERIES_IDS);
    fixture.componentRef.setInput('range', { from: 1, to: 2 });
    fixture.componentRef.setInput('bucket', 'raw');
    fixture.detectChanges();
    const view = fixture.componentInstance as unknown as FiltersView;

    expect(view.seriesOptions()).toEqual(
      SERIES_IDS.map((id) => ({ value: id, label: SERIES_LABEL_KEYS[id] })),
    );
  });

  it('commits every change immediately on the inline toolbar', () => {
    const fixture = createFixture();
    const emitted = vi.fn();
    fixture.componentInstance.seriesChange.subscribe(emitted);
    const view = fixture.componentInstance as unknown as FiltersView;

    view.onSeriesPicked(['temperature']);

    expect(emitted).toHaveBeenCalledWith(['temperature']);
  });

  it('stages overlay-tier edits and applies them atomically', () => {
    mode.set('sheet');
    const fixture = createFixture();
    const series = vi.fn();
    const bucket = vi.fn();
    fixture.componentInstance.seriesChange.subscribe(series);
    fixture.componentInstance.bucketChange.subscribe(bucket);
    const view = fixture.componentInstance as unknown as FiltersView;

    view.onSeriesPicked(['temperature']);
    view.onBucketPicked('1h');
    expect(series).not.toHaveBeenCalled();
    expect(bucket).not.toHaveBeenCalled();

    view.commitStaged();

    expect(series).toHaveBeenCalledWith(['temperature']);
    expect(bucket).toHaveBeenCalledWith('1h');
  });

  it('a discarded draft never reaches the query signals', () => {
    mode.set('sheet');
    const fixture = createFixture();
    const series = vi.fn();
    fixture.componentInstance.seriesChange.subscribe(series);
    const view = fixture.componentInstance as unknown as FiltersView;

    view.onSeriesPicked(['temperature']);
    view.discardStaged();
    view.commitStaged();

    expect(series).not.toHaveBeenCalled();
  });
});

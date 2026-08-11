import type { HttpResourceRef } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
  type Signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActiveMachineTelemetry } from '../machines/active-machine-telemetry';
import { SettingsStore } from '../settings/settings.store';
import type { MeasurementsResponseDto, SeriesDescriptorDto } from './measurement.dto';
import { MeasurementsFacade } from './measurements.facade';
import { MeasurementsRepository, type MeasurementsQuery } from './measurements.repository';
import { SERIES_IDS } from './series.catalog';

function resource<T>(value: T): HttpResourceRef<T> {
  return {
    isLoading: signal(false),
    error: signal(undefined),
    hasValue: () => true,
    value: () => value,
    reload: vi.fn(),
  } as unknown as HttpResourceRef<T>;
}

class RepositoryStub {
  readonly seriesCatalogue = resource<SeriesDescriptorDto[]>([]);

  measurementsFor(
    query?: Signal<MeasurementsQuery | undefined>,
  ): HttpResourceRef<MeasurementsResponseDto> {
    void query;
    return resource({ measures: [] });
  }

  pagedMeasurementsFor(): HttpResourceRef<MeasurementsResponseDto> {
    return resource({ measures: [] });
  }
}

const TEST_THRESHOLDS = {
  warningMin: 10,
  warningMax: 90,
  criticalMin: 0,
  criticalMax: 100,
};

const FLOW_OVERRIDE = {
  warningMin: 20,
  warningMax: 80,
  criticalMin: 10,
  criticalMax: 90,
};

const TEST_CATALOGUE: SeriesDescriptorDto[] = [
  { id: 'temperature', unit: '°C', color: 'temperature', thresholds: TEST_THRESHOLDS },
  { id: 'pressure', unit: 'bar', color: 'pressure', thresholds: TEST_THRESHOLDS },
  { id: 'flow', unit: 'l/min', color: 'flow', thresholds: TEST_THRESHOLDS },
  { id: 'rpm', unit: 'rpm', color: 'rpm', thresholds: TEST_THRESHOLDS },
];

class TelemetryRepositoryStub extends RepositoryStub {
  override readonly seriesCatalogue = resource<SeriesDescriptorDto[]>(TEST_CATALOGUE);

  readonly queries: Signal<MeasurementsQuery | undefined>[] = [];

  override measurementsFor(
    query: Signal<MeasurementsQuery | undefined>,
  ): HttpResourceRef<MeasurementsResponseDto> {
    const index = this.queries.push(query) - 1;
    return resource(
      index === 1
        ? {
            measures: [
              { name: 'temperature', value: 62, date: '2026-08-05T12:00:00.000Z' },
              { name: 'pressure', value: 3.1, date: '2026-08-05T12:00:00.000Z' },
              { name: 'flow', value: 84, date: '2026-08-05T12:00:00.000Z' },
              { name: 'rpm', value: 2_600, date: '2026-08-05T12:00:00.000Z' },
            ],
          }
        : { measures: [] },
    );
  }
}

class MutableCatalogueRepositoryStub extends RepositoryStub {
  readonly catalogueValue = signal<SeriesDescriptorDto[] | undefined>(undefined);
  readonly catalogueLoading = signal(true);
  readonly catalogueError = signal<unknown>(undefined);

  override readonly seriesCatalogue = {
    isLoading: this.catalogueLoading,
    error: this.catalogueError,
    hasValue: () => this.catalogueValue() !== undefined,
    value: () => this.catalogueValue() ?? [],
    reload: vi.fn(),
  } as unknown as HttpResourceRef<SeriesDescriptorDto[]>;

  resolve(descriptors: SeriesDescriptorDto[]): void {
    this.catalogueValue.set(descriptors);
    this.catalogueError.set(undefined);
    this.catalogueLoading.set(false);
  }

  fail(): void {
    this.catalogueError.set(new Error('catalogue unavailable'));
    this.catalogueLoading.set(false);
  }
}

@Component({
  selector: 'app-test-dashboard-live-route',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class DashboardLiveRoute {
  constructor() {
    const releaseLive = inject(MeasurementsFacade).activateLive();
    inject(DestroyRef).onDestroy(releaseLive);
  }
}

@Component({
  selector: 'app-test-measurements-live-route',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class MeasurementsLiveRoute {
  constructor() {
    const releaseLive = inject(MeasurementsFacade).activateLive();
    inject(DestroyRef).onDestroy(releaseLive);
  }
}

describe('MeasurementsFacade', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('resets a manual bucket whenever the range moves even if the auto bucket stays equal', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: MeasurementsRepository, useClass: RepositoryStub },
        { provide: SettingsStore, useValue: { liveIntervalMs: signal(5_000) } },
        { provide: ActiveMachineTelemetry, useValue: { thresholds: signal({}) } },
      ],
    });
    const facade = TestBed.inject(MeasurementsFacade);
    const { to } = facade.range();

    expect(facade.bucket()).toBe('raw');
    facade.setBucket('1h');
    expect(facade.bucket()).toBe('1h');

    facade.setRange(to - 3_600_000, to);

    expect(facade.bucket()).toBe('raw');
  });

  it('does not refetch live data until the effective sample grid can change', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 7, 5, 12, 0, 5));
    TestBed.configureTestingModule({
      providers: [
        { provide: MeasurementsRepository, useClass: RepositoryStub },
        { provide: SettingsStore, useValue: { liveIntervalMs: signal(5_000) } },
        { provide: ActiveMachineTelemetry, useValue: { thresholds: signal({}) } },
      ],
    });
    const facade = TestBed.inject(MeasurementsFacade);
    const initial = facade.range();

    vi.setSystemTime(Date.UTC(2026, 7, 5, 12, 0, 35));
    facade.tick();
    expect(facade.range()).toEqual(initial);

    vi.setSystemTime(Date.UTC(2026, 7, 5, 12, 1, 5));
    facade.tick();
    expect(facade.range().to).toBe(Date.UTC(2026, 7, 5, 12, 1, 5));
    expect(facade.range().to - facade.range().from).toBe(initial.to - initial.from);
  });

  it('refreshes a partial coarse bucket on the next raw sample', () => {
    vi.useFakeTimers();
    const initialTo = Date.UTC(2026, 7, 5, 12, 0, 5);
    vi.setSystemTime(initialTo);
    TestBed.configureTestingModule({
      providers: [
        { provide: MeasurementsRepository, useClass: RepositoryStub },
        { provide: SettingsStore, useValue: { liveIntervalMs: signal(5_000) } },
        { provide: ActiveMachineTelemetry, useValue: { thresholds: signal({}) } },
      ],
    });
    const facade = TestBed.inject(MeasurementsFacade);
    facade.setRange(initialTo - 3_600_000, initialTo);
    facade.setBucket('6h');
    const initial = facade.range();

    vi.setSystemTime(Date.UTC(2026, 7, 5, 12, 0, 35));
    facade.tick();
    expect(facade.range()).toEqual(initial);

    vi.setSystemTime(Date.UTC(2026, 7, 5, 12, 1, 5));
    facade.tick();
    expect(facade.range().to).toBe(Date.UTC(2026, 7, 5, 12, 1, 5));
  });

  it('refreshes when a non-aligned left edge crosses the raw grid first', () => {
    vi.useFakeTimers();
    const initialTo = Date.UTC(2026, 7, 5, 12, 0, 5);
    vi.setSystemTime(initialTo);
    TestBed.configureTestingModule({
      providers: [
        { provide: MeasurementsRepository, useClass: RepositoryStub },
        { provide: SettingsStore, useValue: { liveIntervalMs: signal(5_000) } },
        { provide: ActiveMachineTelemetry, useValue: { thresholds: signal({}) } },
      ],
    });
    const facade = TestBed.inject(MeasurementsFacade);
    facade.setRange(initialTo - 3_610_000, initialTo);
    facade.setBucket('1h');
    const initial = facade.range();

    vi.setSystemTime(Date.UTC(2026, 7, 5, 12, 0, 8));
    facade.tick();
    expect(facade.range()).toEqual(initial);

    vi.setSystemTime(Date.UTC(2026, 7, 5, 12, 0, 15));
    facade.tick();
    expect(facade.range().to).toBe(Date.UTC(2026, 7, 5, 12, 0, 15));
  });

  it('follows the complete catalogue until the user chooses an explicit subset', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: MeasurementsRepository, useClass: MutableCatalogueRepositoryStub },
        { provide: SettingsStore, useValue: { liveIntervalMs: signal(5_000) } },
        { provide: ActiveMachineTelemetry, useValue: { thresholds: signal({}) } },
      ],
    });
    const facade = TestBed.inject(MeasurementsFacade);
    const repository = TestBed.inject(
      MeasurementsRepository,
    ) as unknown as MutableCatalogueRepositoryStub;

    expect(facade.selectedSeries()).toEqual(SERIES_IDS);

    repository.resolve(TEST_CATALOGUE.slice(0, 1));
    expect(facade.selectedSeries()).toEqual(['temperature']);

    repository.resolve(TEST_CATALOGUE);
    expect(facade.selectedSeries()).toEqual(SERIES_IDS);

    facade.setSeries(['flow']);
    repository.fail();
    expect(facade.selectedSeries()).toEqual(['flow']);

    repository.resolve(TEST_CATALOGUE.filter(({ id }) => id !== 'flow'));
    expect(facade.selectedSeries()).toEqual(['temperature', 'pressure', 'rpm']);
  });

  it('preserves live intent between routes and resumes only while a consumer is mounted', () => {
    vi.useFakeTimers();
    const initialNow = Date.UTC(2026, 7, 5, 12, 0, 5);
    vi.setSystemTime(initialNow);
    TestBed.configureTestingModule({
      providers: [
        { provide: MeasurementsRepository, useClass: RepositoryStub },
        { provide: SettingsStore, useValue: { liveIntervalMs: signal(5_000) } },
        { provide: ActiveMachineTelemetry, useValue: { thresholds: signal({}) } },
      ],
    });
    const facade = TestBed.inject(MeasurementsFacade);

    facade.setLiveEnabled(true);
    const release = facade.activateLive();
    TestBed.tick();

    release();
    TestBed.tick();
    const paused = facade.range();
    vi.advanceTimersByTime(65_000);
    expect(facade.range()).toEqual(paused);
    expect(facade.liveEnabled()).toBe(true);

    facade.activateLive();
    TestBed.tick();
    expect(facade.range().to).toBe(initialNow + 65_000);
    expect(facade.liveEnabled()).toBe(true);
  });

  it('keeps live running until the last overlapping route lease is released', () => {
    vi.useFakeTimers();
    const initialNow = Date.UTC(2026, 7, 5, 12, 0, 5);
    vi.setSystemTime(initialNow);
    TestBed.configureTestingModule({
      providers: [
        { provide: MeasurementsRepository, useClass: RepositoryStub },
        { provide: SettingsStore, useValue: { liveIntervalMs: signal(5_000) } },
        { provide: ActiveMachineTelemetry, useValue: { thresholds: signal({}) } },
      ],
    });
    const facade = TestBed.inject(MeasurementsFacade);

    facade.setLiveEnabled(true);
    const releaseFirst = facade.activateLive();
    const releaseSecond = facade.activateLive();
    releaseFirst();
    releaseFirst();
    TestBed.tick();
    vi.advanceTimersByTime(65_000);
    expect(facade.range().to).toBe(initialNow + 60_000);

    releaseSecond();
    TestBed.tick();
    const paused = facade.range();
    vi.advanceTimersByTime(65_000);
    expect(facade.range()).toEqual(paused);
    expect(facade.liveEnabled()).toBe(true);
  });

  it('keeps one live preference through Dashboard and Measurements navigation', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'dashboard', component: DashboardLiveRoute },
          { path: 'measurements', component: MeasurementsLiveRoute },
        ]),
        { provide: MeasurementsRepository, useClass: RepositoryStub },
        { provide: SettingsStore, useValue: { liveIntervalMs: signal(5_000) } },
        { provide: ActiveMachineTelemetry, useValue: { thresholds: signal({}) } },
      ],
    });
    const facade = TestBed.inject(MeasurementsFacade);
    const harness = await RouterTestingHarness.create('/dashboard');

    facade.setLiveEnabled(true);
    expect(facade.liveEnabled()).toBe(true);

    await harness.navigateByUrl('/measurements', MeasurementsLiveRoute);
    expect(facade.liveEnabled()).toBe(true);

    await harness.navigateByUrl('/dashboard', DashboardLiveRoute);
    expect(facade.liveEnabled()).toBe(true);
  });

  it('loads a tiny all-series raw snapshot for the schematic independently of chart selection', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 7, 5, 12, 0, 5));
    TestBed.configureTestingModule({
      providers: [
        { provide: MeasurementsRepository, useClass: TelemetryRepositoryStub },
        { provide: SettingsStore, useValue: { liveIntervalMs: signal(5_000) } },
        {
          provide: ActiveMachineTelemetry,
          useValue: { thresholds: signal({ flow: FLOW_OVERRIDE }) },
        },
      ],
    });
    const facade = TestBed.inject(MeasurementsFacade);
    const repository = TestBed.inject(MeasurementsRepository) as unknown as TelemetryRepositoryStub;

    expect(facade.selectedSeries()).toEqual(SERIES_IDS);
    expect(repository.queries[0]?.()?.series).toEqual(SERIES_IDS);
    expect(repository.queries[1]?.()).toBeUndefined();

    facade.setRange(Date.UTC(2026, 6, 1), Date.UTC(2026, 6, 1, 1));
    facade.activateLive();
    expect(repository.queries[1]?.()).toBeUndefined();

    const releaseSchematic = facade.activateSchematic();

    expect(repository.queries[1]?.()).toEqual({
      series: ['temperature', 'pressure', 'flow', 'rpm'],
      from: Date.UTC(2026, 7, 5, 11, 59),
      to: Date.UTC(2026, 7, 5, 12, 1),
      bucket: 'raw',
    });
    expect(facade.schematicSeries().map(({ id }) => id)).toEqual([
      'temperature',
      'pressure',
      'flow',
      'rpm',
    ]);
    expect(facade.schematicSeries().find(({ id }) => id === 'flow')?.thresholds).toEqual(
      FLOW_OVERRIDE,
    );
    expect(facade.schematicBaselineSeries().find(({ id }) => id === 'flow')?.thresholds).toEqual(
      TEST_THRESHOLDS,
    );
    expect(facade.series()).toEqual([]);

    vi.advanceTimersByTime(60_000);
    expect(repository.queries[1]?.()).toMatchObject({
      from: Date.UTC(2026, 7, 5, 12, 0),
      to: Date.UTC(2026, 7, 5, 12, 2),
    });

    releaseSchematic();
    expect(repository.queries[1]?.()).toBeUndefined();
  });
});

import type { HttpResourceRef } from '@angular/common/http';
import { signal, type Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActiveMachineTelemetry } from '../machines/active-machine-telemetry';
import type { AlarmsResponseDto } from './measurement.dto';
import type { Alarm } from './measurement.models';
import { AlarmsFacade, alarmsActiveAt } from './alarms.facade';
import { MeasurementsRepository, type AlarmsQuery } from './measurements.repository';

const EMPTY_RESPONSE: AlarmsResponseDto = { alarms: [] };

class AlarmResourceStub {
  readonly response = signal<AlarmsResponseDto>(EMPTY_RESPONSE);
  readonly state = signal('idle');
  readonly ref = {
    isLoading: signal(false),
    error: signal(undefined),
    hasValue: () => true,
    value: this.response,
    status: this.state,
    reload: vi.fn(),
  } as unknown as HttpResourceRef<AlarmsResponseDto>;
}

class RepositoryStub {
  readonly queries: Signal<AlarmsQuery | undefined>[] = [];
  readonly resources: AlarmResourceStub[] = [];

  alarmsFor(query: Signal<AlarmsQuery | undefined>): HttpResourceRef<AlarmsResponseDto> {
    this.queries.push(query);
    const resource = new AlarmResourceStub();
    this.resources.push(resource);
    return resource.ref;
  }
}

function alarm(timestamp: number, durationMs: number): Alarm {
  return {
    id: `temperature-${timestamp}`,
    series: 'temperature',
    severity: 'warning',
    value: 80,
    threshold: 74,
    timestamp,
    durationMs,
  };
}

describe('alarmsActiveAt', () => {
  it('keeps an episode reaching now and drops historical episodes from the badge', () => {
    const now = 100_000;
    expect(alarmsActiveAt([alarm(10_000, 20_000), alarm(90_000, 10_000)], now)).toEqual([
      alarm(90_000, 10_000),
    ]);
  });

  it('does not count a future episode', () => {
    expect(alarmsActiveAt([alarm(110_000, 10_000)], 100_000)).toEqual([]);
  });
});

describe('AlarmsFacade dashboard feed', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('keeps the Dashboard query independent from the Alarms screen filters', () => {
    const thresholds = {};
    TestBed.configureTestingModule({
      providers: [
        { provide: MeasurementsRepository, useClass: RepositoryStub },
        { provide: ActiveMachineTelemetry, useValue: { thresholds: signal(thresholds) } },
      ],
    });
    const repository = TestBed.inject(MeasurementsRepository) as unknown as RepositoryStub;
    const facade = TestBed.inject(AlarmsFacade);
    const from = Date.UTC(2026, 0, 2);
    const to = from + 6 * 3_600_000;

    expect(repository.queries.filter((query) => query() === undefined)).toHaveLength(2);

    facade.setDashboardRange(from, to);
    const dashboardQuery = repository.queries[1];
    expect(dashboardQuery?.()).toMatchObject({ from, to });

    facade.activateScreen(from, to);
    facade.setSeverity('critical');
    facade.setSeries(['pressure']);

    expect(dashboardQuery?.()).toEqual({
      series: [],
      from,
      to,
      severity: 'all',
      thresholds,
    });
    expect(
      repository.queries.some((query) => {
        const value = query();
        return value?.severity === 'critical' && value.series[0] === 'pressure';
      }),
    ).toBe(true);

    facade.deactivateDashboard();
    expect(dashboardQuery?.()).toBeUndefined();
  });

  it('runs the full journal query only while the Alarms screen is active', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: MeasurementsRepository, useClass: RepositoryStub },
        { provide: ActiveMachineTelemetry, useValue: { thresholds: signal({}) } },
      ],
    });
    const repository = TestBed.inject(MeasurementsRepository) as unknown as RepositoryStub;
    const facade = TestBed.inject(AlarmsFacade);
    const from = Date.UTC(2026, 0, 2);
    const to = from + 3_600_000;
    const screenQuery = repository.queries[0];

    expect(screenQuery?.()).toBeUndefined();
    facade.activateScreen(from, to);
    expect(screenQuery?.()).toMatchObject({ from, to });
    facade.deactivateScreen();
    expect(screenQuery?.()).toBeUndefined();
  });

  it('refreshes the active query only when the generator minute grid advances', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 7, 5, 12, 0, 5));
    TestBed.configureTestingModule({
      providers: [
        { provide: MeasurementsRepository, useClass: RepositoryStub },
        { provide: ActiveMachineTelemetry, useValue: { thresholds: signal({}) } },
      ],
    });
    const repository = TestBed.inject(MeasurementsRepository) as unknown as RepositoryStub;
    TestBed.inject(AlarmsFacade);
    const activeQuery = repository.queries[2];
    const initial = activeQuery?.();

    expect(initial?.to).toBe(Date.UTC(2026, 7, 5, 12, 1));
    expect(initial?.from).toBe(Date.UTC(2026, 7, 4, 12, 1));
    vi.advanceTimersByTime(30_000);
    expect(activeQuery?.()).toBe(initial);

    vi.advanceTimersByTime(30_000);
    expect(activeQuery?.()?.to).toBe(Date.UTC(2026, 7, 5, 12, 2));
  });

  it('includes the current raw sample when the clock is exactly minute-aligned', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 7, 5, 12));
    TestBed.configureTestingModule({
      providers: [
        { provide: MeasurementsRepository, useClass: RepositoryStub },
        { provide: ActiveMachineTelemetry, useValue: { thresholds: signal({}) } },
      ],
    });
    const repository = TestBed.inject(MeasurementsRepository) as unknown as RepositoryStub;
    TestBed.inject(AlarmsFacade);

    expect(repository.queries[2]?.()?.to).toBe(Date.UTC(2026, 7, 5, 12, 1));
  });
});

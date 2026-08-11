import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { RangeSelectedDetail } from '@chillscope/chart/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AlarmsFacade } from '../../core/data/alarms.facade';
import { MeasurementsFacade } from '../../core/data/measurements.facade';
import { MachineLibraryStore } from '../../core/machines/machine-library.store';
import { SettingsStore } from '../../core/settings/settings.store';
import { Dashboard } from './dashboard';

interface DashboardRangeHarness {
  readonly chartZoomDepth: () => number;
  readonly chartResetKey: () => number;
  onChartRangeSelected(range: RangeSelectedDetail): void;
  onFilterRangeChange(from: number, to: number): void;
  undoChartRange(): void;
  restoreChartRange(): void;
}

describe('Dashboard chart range history', () => {
  const range = signal<RangeSelectedDetail>({ from: 1_000, to: 9_000 });
  const setRange = vi.fn((from: number, to: number): void => range.set({ from, to }));
  const setDashboardRange = vi.fn();
  let fixture: ComponentFixture<Dashboard> | undefined;
  let dashboard: DashboardRangeHarness;

  beforeEach(async () => {
    range.set({ from: 1_000, to: 9_000 });
    setRange.mockClear();
    setDashboardRange.mockClear();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MeasurementsFacade,
          useValue: {
            activateLive: () => (): void => undefined,
            activateSchematic: () => (): void => undefined,
            range: range.asReadonly(),
            setRange,
          },
        },
        {
          provide: AlarmsFacade,
          useValue: {
            setDashboardRange,
            deactivateDashboard: (): void => undefined,
          },
        },
        {
          provide: MachineLibraryStore,
          useValue: { active: signal(null).asReadonly() },
        },
        {
          provide: SettingsStore,
          useValue: { theme: signal('light').asReadonly() },
        },
      ],
    });
    TestBed.overrideComponent(Dashboard, { set: { template: '' } });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(Dashboard);
    dashboard = fixture.componentInstance as unknown as DashboardRangeHarness;
  });

  afterEach(() => fixture?.destroy());

  it('undoes chart selections one range at a time', () => {
    dashboard.onChartRangeSelected({ from: 2_000, to: 8_000 });
    dashboard.onChartRangeSelected({ from: 3_000, to: 7_000 });

    expect(dashboard.chartZoomDepth()).toBe(2);
    dashboard.undoChartRange();

    expect(setRange).toHaveBeenLastCalledWith(2_000, 8_000);
    expect(dashboard.chartZoomDepth()).toBe(1);
    expect(dashboard.chartResetKey()).toBe(1);
  });

  it('restores the first range after repeated chart selections', () => {
    dashboard.onChartRangeSelected({ from: 2_000, to: 8_000 });
    dashboard.onChartRangeSelected({ from: 3_000, to: 7_000 });

    dashboard.restoreChartRange();

    expect(setRange).toHaveBeenLastCalledWith(1_000, 9_000);
    expect(dashboard.chartZoomDepth()).toBe(0);
    expect(dashboard.chartResetKey()).toBe(1);
  });

  it('clears chart history and local zoom when a filter changes the range', () => {
    dashboard.onChartRangeSelected({ from: 2_000, to: 8_000 });
    dashboard.onFilterRangeChange(10_000, 20_000);
    const callCount = setRange.mock.calls.length;

    dashboard.restoreChartRange();

    expect(setRange).toHaveBeenLastCalledWith(10_000, 20_000);
    expect(setRange).toHaveBeenCalledTimes(callCount);
    expect(dashboard.chartZoomDepth()).toBe(0);
    expect(dashboard.chartResetKey()).toBe(1);
  });

  it('ignores a chart selection that matches the current range', () => {
    dashboard.onChartRangeSelected({ from: 1_000, to: 9_000 });

    expect(setRange).not.toHaveBeenCalled();
    expect(dashboard.chartZoomDepth()).toBe(0);
  });
});

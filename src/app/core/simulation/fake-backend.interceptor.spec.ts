import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AlarmsResponseDto, MeasurementsResponseDto } from '../data/measurement.dto';
import { MAX_RANGE_MS, SERIES_IDS } from '../data/series.catalog';
import { SettingsStore } from '../settings/settings.store';
import { fakeBackendInterceptor } from './fake-backend.interceptor';

const HOUR = 3_600_000;
const FROM = new Date(Date.UTC(2026, 0, 1)).toISOString();
const TO = new Date(Date.UTC(2026, 0, 1) + 6 * HOUR).toISOString();

function statusOf(error: unknown): number {
  return error instanceof HttpErrorResponse ? error.status : 0;
}

describe('fakeBackendInterceptor', () => {
  let http: HttpClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([fakeBackendInterceptor]))],
    });
    http = TestBed.inject(HttpClient);
  });

  it('serves the series catalogue', async () => {
    const catalogue = await firstValueFrom(http.get<unknown[]>('/api/series'));
    expect(catalogue).toHaveLength(SERIES_IDS.length);
  });

  it('pages measurements on the server side', async () => {
    const response = await firstValueFrom(
      http.get<MeasurementsResponseDto>('/api/measurements', {
        params: { series: 'temperature', from: FROM, to: TO, page: 1, size: 10 },
      }),
    );
    expect(response.measures).toHaveLength(10);
    expect(response.page).toBe(1);
    expect(response.total).toBeGreaterThan(10);
  });

  it('accepts 1m as an alias for the native resolution', async () => {
    const params = { series: 'temperature', from: FROM, to: TO };
    const raw = await firstValueFrom(
      http.get<MeasurementsResponseDto>('/api/measurements', {
        params: { ...params, bucket: 'raw' },
      }),
    );
    const minute = await firstValueFrom(
      http.get<MeasurementsResponseDto>('/api/measurements', {
        params: { ...params, bucket: '1m' },
      }),
    );
    expect(minute.measures).toEqual(raw.measures);
  });

  it('detects alarms against the thresholds carried by the request', async () => {
    const response = await firstValueFrom(
      http.get<AlarmsResponseDto>('/api/alarms', {
        params: {
          series: 'temperature',
          from: FROM,
          to: TO,
          thresholds: JSON.stringify({
            temperature: { warningMin: -100, warningMax: 0, criticalMin: -200, criticalMax: 500 },
          }),
        },
      }),
    );
    expect(response.alarms.length).toBeGreaterThan(0);
    expect(response.alarms[0].severity).toBe('warning');
  });

  it.each([
    ['an unknown series', { series: 'humidity', from: FROM, to: TO }],
    ['a missing series', { from: FROM, to: TO }],
    ['a malformed range', { series: 'flow', from: 'yesterday', to: TO }],
    ['an inverted range', { series: 'flow', from: TO, to: FROM }],
    ['an unknown bucket', { series: 'flow', from: FROM, to: TO, bucket: '2w' }],
    [
      'a range wider than the API serves',
      {
        series: 'flow',
        from: new Date(Date.UTC(2026, 0, 1) - MAX_RANGE_MS - HOUR).toISOString(),
        to: TO,
      },
    ],
  ])('answers 400 for %s', async (_case, params) => {
    const request = firstValueFrom(
      http.get('/api/measurements', { params: params as Record<string, string> }),
    );
    await expect(request).rejects.toSatisfy((error: unknown) => statusOf(error) === 400);
  });

  it('answers 400 for thresholds that are not valid JSON', async () => {
    const request = firstValueFrom(
      http.get('/api/alarms', { params: { from: FROM, to: TO, thresholds: '{oops' } }),
    );
    await expect(request).rejects.toSatisfy((error: unknown) => statusOf(error) === 400);
  });

  it.each([
    ['page without size', { series: 'temperature', from: FROM, to: TO, page: 0 }],
    ['size without page', { series: 'temperature', from: FROM, to: TO, size: 25 }],
    ['a zero page size', { series: 'temperature', from: FROM, to: TO, page: 0, size: 0 }],
    ['an excessive page size', { series: 'temperature', from: FROM, to: TO, page: 0, size: 201 }],
    ['duplicate series', { series: 'temperature,temperature', from: FROM, to: TO }],
  ])('answers 400 for %s', async (_case, params) => {
    const request = firstValueFrom(
      http.get('/api/measurements', { params: params as Record<string, string | number> }),
    );
    await expect(request).rejects.toSatisfy((error: unknown) => statusOf(error) === 400);
  });

  it('answers 405 for unsupported methods', async () => {
    const request = firstValueFrom(http.post('/api/series', {}));
    await expect(request).rejects.toSatisfy((error: unknown) => statusOf(error) === 405);
  });

  it('answers 404 for an unknown endpoint', async () => {
    const request = firstValueFrom(http.get('/api/unknown'));
    await expect(request).rejects.toSatisfy((error: unknown) => statusOf(error) === 404);
  });

  it('answers 500 when the failure rate is turned all the way up', async () => {
    TestBed.inject(SettingsStore).setFailureRate(1);
    const request = firstValueFrom(http.get('/api/series'));
    await expect(request).rejects.toSatisfy((error: unknown) => statusOf(error) === 500);
  });
});

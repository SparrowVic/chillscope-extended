import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsStore } from './settings.store';

describe('SettingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('style');
    document.head.querySelector('meta[name="theme-color"]')?.remove();
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
  });

  it('removes the bootstrap background and follows the selected theme in browser chrome', () => {
    const documentRef = TestBed.inject(DOCUMENT);
    documentRef.documentElement.style.background = 'rgb(12, 13, 15)';
    documentRef.documentElement.style.setProperty('--cs-canvas', 'rgb(244, 245, 247)');
    const store = TestBed.inject(SettingsStore);
    TestBed.tick();

    expect(documentRef.documentElement.style.background).toBe('');
    expect(documentRef.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      'rgb(244, 245, 247)',
    );

    documentRef.documentElement.style.setProperty('--cs-canvas', 'rgb(12, 13, 15)');
    store.setTheme('dark');
    TestBed.tick();
    expect(documentRef.documentElement.classList.contains('app-dark')).toBe(true);
    expect(documentRef.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      'rgb(12, 13, 15)',
    );
  });

  it('drops persisted threshold bands with an invalid order', () => {
    localStorage.setItem(
      'chillscope.settings',
      JSON.stringify({
        thresholds: {
          temperature: {
            criticalMin: 50,
            warningMin: 40,
            warningMax: 70,
            criticalMax: 80,
          },
        },
      }),
    );

    expect(TestBed.inject(SettingsStore).thresholds()).toEqual({});
  });

  it('does not let non-finite runtime values poison persisted settings', () => {
    const store = TestBed.inject(SettingsStore);
    store.setLiveIntervalMs(Number.NaN);
    store.setFailureRate(Number.POSITIVE_INFINITY);
    store.setThresholds('temperature', {
      criticalMin: 50,
      warningMin: 40,
      warningMax: 70,
      criticalMax: 80,
    });

    expect(store.liveIntervalMs()).toBe(5_000);
    expect(store.failureRate()).toBe(0);
    expect(store.thresholds()).toEqual({});
    expect(JSON.parse(localStorage.getItem('chillscope.settings') ?? '{}')).toMatchObject({
      liveIntervalMs: 5_000,
      failureRate: 0,
      thresholds: {},
    });
  });

  it('persists the complete simulation form in one snapshot', () => {
    const store = TestBed.inject(SettingsStore);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    try {
      store.setSimulation({
        liveIntervalMs: 2_000,
        failureRate: 0.25,
        thresholds: {
          temperature: {
            criticalMin: 30,
            warningMin: 40,
            warningMax: 70,
            criticalMax: 80,
          },
        },
      });

      expect(setItem).toHaveBeenCalledOnce();
      expect(JSON.parse(localStorage.getItem('chillscope.settings') ?? '{}')).toMatchObject({
        liveIntervalMs: 2_000,
        failureRate: 0.25,
        thresholds: { temperature: { warningMin: 40, warningMax: 70 } },
      });
    } finally {
      setItem.mockRestore();
    }
  });

  it('exposes a failed browser-storage write instead of claiming persistence', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    try {
      expect(TestBed.inject(SettingsStore).persistenceFailed()).toBe(true);
    } finally {
      setItem.mockRestore();
    }
  });
});

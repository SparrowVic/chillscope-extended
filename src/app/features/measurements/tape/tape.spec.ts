import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeasurementSeries } from '../../../core/data/measurement.models';
import { provideTestTransloco } from '../../../testing/transloco';
import { Tape } from './tape';

const TRANSLATIONS: Readonly<Record<string, string>> = {
  'series.flow': 'Przepływ',
  'units.litersPerMinute': 'l/min',
  'stats.trendUp': 'Trend rosnący',
  'stats.trendDown': 'Trend malejący',
  'stats.trendFlat': 'Bez zmian',
};

function flowSeries(values: readonly number[]): MeasurementSeries {
  return {
    id: 'flow',
    unit: 'l/min',
    color: '#2ec4ae',
    thresholds: { warningMin: 26, warningMax: 108, criticalMin: 18, criticalMax: 118 },
    points: { t: values.map((_, index) => index * 60_000), v: [...values] },
  };
}

function render(series: MeasurementSeries): HTMLElement {
  const fixture = TestBed.createComponent(Tape);
  fixture.componentRef.setInput('series', series);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Tape', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...provideTestTransloco(TRANSLATIONS)],
    });
  });

  it('shows the last sample in the pointer chip and translates the scale to it', () => {
    const tape = render(flowSeries([90, 96.4]));

    // The digit morph renders one span per character, so the text is normalised before matching.
    const chip = tape.querySelector('.tape__chip');
    expect(chip?.querySelector('.tape__value')?.textContent?.replace(/\s+/g, '')).toBe('96,4');
    expect(chip?.querySelector('.tape__unit')?.textContent?.trim()).toBe('l/min');
    // The chip's tint is the visual severity channel; the same fact must arrive as text.
    expect(chip?.querySelector('.sr-only')?.textContent?.trim()).toBe('severity.ok');
    const scale = tape.querySelector<HTMLElement>('.tape__scale');
    expect(scale?.style.transform).toMatch(/^translateY\(-\d+(\.\d+)?px\)$/);
  });

  it('prints all four threshold zones on the tape', () => {
    const tape = render(flowSeries([60]));

    const kinds = [...tape.querySelectorAll('.tape__zone')].map((zone) => zone.className);
    expect(kinds).toHaveLength(4);
    expect(kinds.filter((name) => name.includes('tape__zone--critical'))).toHaveLength(2);
    expect(kinds.filter((name) => name.includes('tape__zone--warning'))).toHaveLength(2);
  });

  it('marks the chip with the classify() status of the last sample', () => {
    const critical = render(flowSeries([60, 130]));
    expect(critical.querySelector('.tape__chip--critical')).not.toBeNull();

    const ok = render(flowSeries([60]));
    expect(ok.querySelector('.tape__chip--critical')).toBeNull();
    expect(ok.querySelector('.tape__chip--ok')).not.toBeNull();
  });

  it('reads the trend from the last two samples', () => {
    const tape = render(flowSeries([90, 60]));
    const trend = tape.querySelector('.tape__trend');

    expect(trend?.classList.contains('tape__trend--down')).toBe(true);
    expect(trend?.getAttribute('aria-label')).toBe('Trend malejący');
  });

  it('draws the ghost sparkline and the min/max notches from the loaded range', () => {
    const tape = render(flowSeries([60, 70, 65]));

    expect(tape.querySelector('.tape__spark path')?.getAttribute('d')).toMatch(/^M/);
    expect(tape.querySelectorAll('.tape__notch')).toHaveLength(2);
  });

  it('keeps the resting 32px face grid where ResizeObserver does not exist (jsdom)', () => {
    const tape = render(flowSeries([60]));

    expect(tape.querySelector('.tape__spark')?.getAttribute('viewBox')).toBe('0 0 32 100');
    expect(tape.style.getPropertyValue('--tape-spark-w')).toBe('32px');
    // No measurement, no cap: the chip stretches to the strip exactly as before.
    expect(tape.style.getPropertyValue('--tape-chip-w')).toBe('');
  });

  it('re-lays the strip, chip and reference tail from the observed face width', async () => {
    const callbacks: ResizeObserverCallback[] = [];
    class CapturingResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback);
      }
      observe(): void {
        // The captured callback is fired by hand below.
      }
      unobserve(): void {
        // Unused in this spec.
      }
      disconnect(): void {
        // Unused in this spec.
      }
    }
    vi.stubGlobal('ResizeObserver', CapturingResizeObserver);

    try {
      const fixture = TestBed.createComponent(Tape);
      fixture.componentRef.setInput('series', flowSeries([60]));
      fixture.detectChanges();
      await fixture.whenStable();
      expect(callbacks).toHaveLength(1);

      const entry = { contentRect: { width: 480 } } as unknown as ResizeObserverEntry;
      callbacks[0]([entry], undefined as unknown as ResizeObserver);
      fixture.detectChanges();

      const tape = fixture.nativeElement as HTMLElement;
      expect(tape.style.getPropertyValue('--tape-spark-w')).toBe('44px');
      expect(tape.style.getPropertyValue('--tape-chip-w')).toBe('336px');
      expect(tape.style.getPropertyValue('--tape-tail-w')).toBe('144px');
      expect(tape.querySelector('.tape__spark')?.getAttribute('viewBox')).toBe('0 0 44 100');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

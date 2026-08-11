import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { injectClock } from './clock';

class VisibilityDocument extends EventTarget {
  hidden = false;
}

describe('injectClock', () => {
  const document = new VisibilityDocument();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    document.hidden = false;
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: document }],
    });
  });

  afterEach(() => vi.useRealTimers());

  it('stops in a hidden tab and catches up immediately when it becomes visible', () => {
    const clock = TestBed.runInInjectionContext(() => injectClock(100));

    vi.advanceTimersByTime(100);
    expect(clock()).toBe(1_100);

    document.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(500);
    expect(clock()).toBe(1_100);

    document.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(clock()).toBe(1_600);
  });
});

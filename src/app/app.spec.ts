import { TestBed } from '@angular/core/testing';
import type { VersionEvent } from '@angular/service-worker';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { provideTestTransloco } from './testing/transloco';
import { App } from './app';

let versionUpdates: Subject<VersionEvent>;

describe('App', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    versionUpdates = new Subject<VersionEvent>();
    TestBed.configureTestingModule({
      providers: [
        ...provideTestTransloco({ 'common.updateReady': 'New version ready' }),
        {
          provide: SwUpdate,
          useValue: { isEnabled: true, versionUpdates },
        },
      ],
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('boots before an update notification is needed', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
  });

  it('announces a ready service-worker version', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'current' },
      latestVersion: { hash: 'latest' },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent.trim()).toBe(
      'New version ready',
    );
  });
});

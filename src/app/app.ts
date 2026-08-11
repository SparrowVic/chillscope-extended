import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter } from 'rxjs';

/** Long enough for the update notice to be read once; the staged version activates on reload. */
const UPDATE_RELOAD_MS = 2_500;

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TranslocoPipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly updateReady = signal(false);

  constructor() {
    // Without this, a freshly deployed version sits staged until some later full reload —
    // silently. The worker is disabled in dev, so there is nothing to subscribe to there.
    const updates = inject(SwUpdate);
    if (!updates.isEnabled) return;

    updates.versionUpdates
      .pipe(
        filter((event) => event.type === 'VERSION_READY'),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.updateReady.set(true);
        setTimeout(() => document.location.reload(), UPDATE_RELOAD_MS);
      });
  }
}

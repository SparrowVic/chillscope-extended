import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import { AppNavigation } from '../navigation/navigation';
import { PanelFieldEngine } from '../panel-field';
import { SystemStrip } from '../system-strip/system-strip';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, TranslocoPipe, SystemStrip, AppNavigation],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {
  /** Instantiated for its listeners: the shell is where the app-wide pointer field lives. */
  protected readonly panelField = inject(PanelFieldEngine);
}

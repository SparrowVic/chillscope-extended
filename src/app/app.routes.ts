import { type Routes } from '@angular/router';

import { AppShell } from './layout/app-shell/app-shell';
import { pendingChangesGuard } from './shared/guards/pending-changes';

export const routes: Routes = [
  {
    path: '',
    component: AppShell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'measurements',
        loadComponent: () =>
          import('./features/measurements/measurements').then((m) => m.Measurements),
      },
      {
        path: 'alarms',
        loadComponent: () => import('./features/alarms/alarms').then((m) => m.Alarms),
      },
      {
        path: 'machines',
        loadComponent: () => import('./features/machines/machines').then((m) => m.Machines),
        canDeactivate: [pendingChangesGuard],
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
        canDeactivate: [pendingChangesGuard],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];

import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  {
    path: 'room/:id',
    loadComponent: () =>
      import('./features/game-room/game-room').then((m) => m.GameRoom),
  },
  { path: '**', redirectTo: '' },
];

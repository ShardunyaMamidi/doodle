import {
  ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';

import { routes } from './app.routes';
import { connectionFeature } from './store/connection/connection.reducer';
import { roomFeature } from './store/room/room.reducer';
import { ConnectionEffects } from './store/connection/connection.effects';
import { RoomEffects } from './store/room/room.effects';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    provideStore({
      [connectionFeature.name]: connectionFeature.reducer,
      [roomFeature.name]: roomFeature.reducer,
    }),
    provideEffects([ConnectionEffects, RoomEffects]),
    ...(isDevMode() ? [provideStoreDevtools()] : []),
  ],
};

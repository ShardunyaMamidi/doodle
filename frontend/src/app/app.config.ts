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
import { gameFeature } from './store/game/game.reducer';
import { chatFeature } from './store/chat/chat.reducer';
import { ConnectionEffects } from './store/connection/connection.effects';
import { RoomEffects } from './store/room/room.effects';
import { GameEffects } from './store/game/game.effects';
import { ChatEffects } from './store/chat/chat.effects';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    provideStore({
      [connectionFeature.name]: connectionFeature.reducer,
      [roomFeature.name]: roomFeature.reducer,
      [gameFeature.name]: gameFeature.reducer,
      [chatFeature.name]: chatFeature.reducer,
    }),
    provideEffects([ConnectionEffects, RoomEffects, GameEffects, ChatEffects]),
    ...(isDevMode() ? [provideStoreDevtools()] : []),
  ],
};

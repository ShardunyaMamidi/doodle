import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import {
  EMPTY,
  catchError,
  map,
  merge,
  mergeMap,
  of,
  switchMap,
  takeUntil,
  tap,
  withLatestFrom,
} from 'rxjs';

import { LobbyApiService } from '../../core/api/lobby-api.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { ReconnectService } from '../../core/reconnect/reconnect.service';
import { ConnectionActions } from '../connection/connection.actions';
import { RoomActions } from './room.actions';
import { selectRoomId } from './room.selectors';

@Injectable()
export class RoomEffects {
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store);
  private readonly api = inject(LobbyApiService);
  private readonly realtime = inject(RealtimeService);
  private readonly reconnect = inject(ReconnectService);
  private readonly router = inject(Router);

  // --- Home intents: hit REST, persist creds, navigate into the room ---

  createRoom$ = createEffect(() =>
    this.actions$.pipe(
      ofType(RoomActions.createRoomRequested),
      switchMap(({ req }) =>
        this.api.createRoom(req).pipe(
          tap((res) => {
            this.reconnect.store(res.roomId, { reconnectToken: res.reconnectToken });
            this.router.navigate(['/room', res.roomId], { state: { mode: 'create' } });
          }),
          mergeMap(() => EMPTY),
          catchError(() => of(RoomActions.entryFailed({ message: 'Could not create room' }))),
        ),
      ),
    ),
  );

  joinByCode$ = createEffect(() =>
    this.actions$.pipe(
      ofType(RoomActions.joinByCodeRequested),
      switchMap(({ code, name, avatarId }) =>
        this.api.checkCode(code).pipe(
          tap((res) =>
            this.router.navigate(['/room', res.roomId], {
              state: { mode: 'join', name, avatarId },
            }),
          ),
          mergeMap(() => EMPTY),
          catchError(() => of(RoomActions.entryFailed({ message: 'Invalid room code' }))),
        ),
      ),
    ),
  );

  joinPublic$ = createEffect(() =>
    this.actions$.pipe(
      ofType(RoomActions.joinPublicRequested),
      switchMap(({ name, avatarId }) =>
        this.api.findPublicRoom().pipe(
          tap((res) =>
            this.router.navigate(['/room', res.roomId], {
              state: { mode: 'join', name, avatarId },
            }),
          ),
          mergeMap(() => EMPTY),
          catchError(() => of(RoomActions.entryFailed({ message: 'No public room available' }))),
        ),
      ),
    ),
  );

  // --- STOMP -> NgRx bridge. Declared before publishEntry$ so its watch
  //     subscriptions register before the join/reconnect SEND is queued. ---

  bridge$ = createEffect(() =>
    this.actions$.pipe(
      ofType(RoomActions.enterRoom),
      switchMap(({ roomId }) =>
        merge(
          this.realtime.state$(roomId).pipe(map((event) => RoomActions.serverStateReceived({ event }))),
          this.realtime.sync$(roomId).pipe(map((event) => RoomActions.serverStateReceived({ event }))),
          this.realtime.token$(roomId).pipe(map((token) => RoomActions.tokenReceived({ token }))),
        ).pipe(takeUntil(this.actions$.pipe(ofType(RoomActions.leaveRoom)))),
      ),
    ),
  );

  publishEntry$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(RoomActions.enterRoom),
        tap(({ roomId, mode, name, avatarId }) => {
          if (mode === 'create') {
            const creds = this.reconnect.get(roomId);
            if (creds) this.realtime.reconnect(roomId, creds.reconnectToken);
          } else {
            this.realtime.join(roomId, { playerName: name ?? '', avatarId: avatarId ?? 0 });
          }
        }),
      ),
    { dispatch: false },
  );

  // --- Persist server-issued creds so a later reconnect works ---

  persistToken$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(RoomActions.tokenReceived),
        withLatestFrom(this.store.select(selectRoomId)),
        tap(([{ token }, roomId]) => {
          if (!roomId) return;
          this.reconnect.store(roomId, {
            reconnectToken: token.reconnectToken,
            sessionId: token.sessionId,
          });
        }),
      ),
    { dispatch: false },
  );

  // --- Lobby controls ---

  updateSettings$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(RoomActions.updateSettings),
        withLatestFrom(this.store.select(selectRoomId)),
        tap(([{ settings }, roomId]) => {
          if (roomId) this.realtime.updateSettings(roomId, settings);
        }),
      ),
    { dispatch: false },
  );

  startGame$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(RoomActions.startGame),
        withLatestFrom(this.store.select(selectRoomId)),
        tap(([, roomId]) => {
          if (roomId) this.realtime.start(roomId);
        }),
      ),
    { dispatch: false },
  );

  // --- Leaving the room: closing the socket is how the backend learns ---

  leaveRoom$ = createEffect(() =>
    this.actions$.pipe(
      ofType(RoomActions.leaveRoom),
      map(() => ConnectionActions.disconnect()),
    ),
  );
}

import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { map, switchMap, takeUntil, tap, withLatestFrom } from 'rxjs';

import { RealtimeService } from '../../core/realtime/realtime.service';
import { RoomActions } from '../room/room.actions';
import { selectRoomId } from '../room/room.selectors';
import { ChatActions } from './chat.actions';

@Injectable()
export class ChatEffects {
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store);
  private readonly realtime = inject(RealtimeService);

  /** Bridge the broadcast chat channel into the store. */
  chatBridge$ = createEffect(() =>
    this.actions$.pipe(
      ofType(RoomActions.enterRoom),
      switchMap(({ roomId }) =>
        this.realtime.chat$(roomId).pipe(
          map((event) => ChatActions.messageReceived({ event })),
          takeUntil(this.actions$.pipe(ofType(RoomActions.leaveRoom))),
        ),
      ),
    ),
  );

  sendMessage$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(ChatActions.sendMessage),
        withLatestFrom(this.store.select(selectRoomId)),
        tap(([{ text }, roomId]) => {
          if (roomId && text.trim()) this.realtime.sendChat(roomId, text.trim());
        }),
      ),
    { dispatch: false },
  );
}

import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { map, switchMap, takeUntil, tap, withLatestFrom } from 'rxjs';

import { RealtimeService } from '../../core/realtime/realtime.service';
import { RoomActions } from '../room/room.actions';
import { selectRoomId } from '../room/room.selectors';
import { GameActions } from './game.actions';

@Injectable()
export class GameEffects {
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store);
  private readonly realtime = inject(RealtimeService);

  /** Bridge the private word-choices queue into the store, for the turn's life. */
  wordChoicesBridge$ = createEffect(() =>
    this.actions$.pipe(
      ofType(RoomActions.enterRoom),
      switchMap(({ roomId }) =>
        this.realtime.wordChoices$(roomId).pipe(
          map((payload) => GameActions.wordChoicesReceived({ payload })),
          takeUntil(this.actions$.pipe(ofType(RoomActions.leaveRoom))),
        ),
      ),
    ),
  );

  chooseWord$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(GameActions.chooseWord),
        withLatestFrom(this.store.select(selectRoomId)),
        tap(([{ index }, roomId]) => {
          if (roomId) this.realtime.chooseWord(roomId, index);
        }),
      ),
    { dispatch: false },
  );
}

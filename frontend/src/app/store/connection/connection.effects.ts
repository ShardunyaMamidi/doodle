import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { RxStompState } from '@stomp/rx-stomp';
import { map, switchMap, tap } from 'rxjs';

import { RealtimeService } from '../../core/realtime/realtime.service';
import { ConnectionActions, ConnectionStatus } from './connection.actions';

function toStatus(state: RxStompState): ConnectionStatus {
  switch (state) {
    case RxStompState.OPEN:
      return 'connected';
    case RxStompState.CONNECTING:
      return 'connecting';
    default:
      return 'disconnected';
  }
}

@Injectable()
export class ConnectionEffects {
  private readonly actions$ = inject(Actions);
  private readonly realtime = inject(RealtimeService);

  /** On Connect, activate the socket and mirror its state into the store. */
  connect$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ConnectionActions.connect),
      tap(() => this.realtime.connect()),
      switchMap(() =>
        this.realtime
          .connectionState$()
          .pipe(map((s) => ConnectionActions.statusChanged({ status: toStatus(s) }))),
      ),
    ),
  );

  disconnect$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(ConnectionActions.disconnect),
        tap(() => this.realtime.deactivate()),
      ),
    { dispatch: false },
  );
}

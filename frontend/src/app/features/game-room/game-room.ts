import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';

import { ConnectionActions } from '../../store/connection/connection.actions';
import { EntryMode, RoomActions } from '../../store/room/room.actions';
import { Lobby } from '../lobby/lobby';

interface EntryNavState {
  mode?: EntryMode;
  name?: string;
  avatarId?: number;
}

@Component({
  selector: 'app-game-room',
  imports: [Lobby],
  template: `<app-lobby />`,
})
export class GameRoom implements OnInit, OnDestroy {
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  ngOnInit(): void {
    const roomId = this.route.snapshot.paramMap.get('id');
    const nav = (history.state ?? {}) as EntryNavState;

    // Direct URL loads have no entry context — send the user back to pick a name.
    if (!roomId || !nav.mode) {
      this.router.navigate(['/']);
      return;
    }

    this.store.dispatch(ConnectionActions.connect());
    this.store.dispatch(
      RoomActions.enterRoom({
        roomId,
        mode: nav.mode,
        name: nav.name,
        avatarId: nav.avatarId,
      }),
    );
  }

  ngOnDestroy(): void {
    this.store.dispatch(RoomActions.leaveRoom());
  }
}

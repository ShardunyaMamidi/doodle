import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';

import { RoomActions } from '../../store/room/room.actions';
import {
  selectCanStart,
  selectConnectedPlayerCount,
  selectIsHost,
  selectMySessionId,
  selectPlayers,
  selectRoomCode,
  selectSettings,
} from '../../store/room/room.selectors';

@Component({
  selector: 'app-lobby',
  imports: [FormsModule],
  templateUrl: './lobby.html',
  styleUrl: './lobby.scss',
})
export class Lobby {
  private readonly store = inject(Store);

  readonly players = toSignal(this.store.select(selectPlayers), { initialValue: [] });
  readonly roomCode = toSignal(this.store.select(selectRoomCode), { initialValue: null });
  readonly isHost = toSignal(this.store.select(selectIsHost), { initialValue: false });
  readonly canStart = toSignal(this.store.select(selectCanStart), { initialValue: false });
  readonly settings = toSignal(this.store.select(selectSettings), { initialValue: null });
  readonly mySessionId = toSignal(this.store.select(selectMySessionId), { initialValue: null });
  readonly connectedCount = toSignal(this.store.select(selectConnectedPlayerCount), {
    initialValue: 0,
  });

  readonly inviteLink = computed(() => {
    const code = this.roomCode();
    return code ? `${location.origin}/?code=${code}` : '';
  });

  trackBySession = (_: number, p: { sessionId: string }) => p.sessionId;

  updateRounds(value: number): void {
    this.store.dispatch(RoomActions.updateSettings({ settings: { rounds: Number(value) } }));
  }

  updateTurnTime(value: number): void {
    this.store.dispatch(
      RoomActions.updateSettings({ settings: { turnTimeSeconds: Number(value) } }),
    );
  }

  updateMaxPlayers(value: number): void {
    this.store.dispatch(RoomActions.updateSettings({ settings: { maxPlayers: Number(value) } }));
  }

  start(): void {
    this.store.dispatch(RoomActions.startGame());
  }

  copyInvite(): void {
    if (this.inviteLink()) navigator.clipboard?.writeText(this.inviteLink());
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';

import { ConnectionActions } from '../../store/connection/connection.actions';
import { EntryMode, RoomActions } from '../../store/room/room.actions';
import {
  selectGamePhase,
  selectInGame,
  selectIsChoosingWord,
} from '../../store/game/game.selectors';
import { Lobby } from '../lobby/lobby';
import { CanvasComponent } from '../../canvas/canvas.component';
import { Chat } from './chat/chat';
import { Players } from './players/players';
import { TimerHints } from './timer-hints/timer-hints';
import { WordChoice } from './word-choice/word-choice';
import { TurnEnd } from './overlays/turn-end';
import { RoundEnd } from './overlays/round-end';
import { Results } from './overlays/results';

interface EntryNavState {
  mode?: EntryMode;
  name?: string;
  avatarId?: number;
}

@Component({
  selector: 'app-game-room',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Lobby,
    CanvasComponent,
    Chat,
    Players,
    TimerHints,
    WordChoice,
    TurnEnd,
    RoundEnd,
    Results,
  ],
  template: `
    @switch (phase()) {
      @case ('LOBBY') {
        <app-lobby />
      }
      @default {
        <div class="room">
          <main class="stage">
            <app-timer-hints />

            @switch (phase()) {
              @case ('WORD_SELECTION') {
                <app-canvas />
                @if (isChoosingWord()) { <app-word-choice /> }
              }
              @case ('DRAWING') {
                <app-canvas />
              }
              @case ('TURN_END') {
                <app-canvas />
                <app-turn-end />
              }
              @case ('ROUND_END') {
                <app-round-end />
              }
              @case ('GAME_OVER') {
                <app-results />
              }
            }
          </main>

          <aside class="side">
            <app-players />
            <app-chat />
          </aside>
        </div>
      }
    }
  `,
  styles: [
    `
      .room { display: grid; grid-template-columns: 1fr 20rem; gap: 1rem; max-width: 64rem; margin: 0 auto; padding: 1rem; }
      .stage { display: flex; flex-direction: column; gap: 0.75rem; }
      .side { display: flex; flex-direction: column; gap: 0.75rem; }
      @media (max-width: 48rem) { .room { grid-template-columns: 1fr; } }
    `,
  ],
})
export class GameRoom implements OnInit, OnDestroy {
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly phase = toSignal(this.store.select(selectGamePhase), { initialValue: 'LOBBY' as const });
  readonly isChoosingWord = toSignal(this.store.select(selectIsChoosingWord), {
    initialValue: false,
  });
  readonly inGame = toSignal(this.store.select(selectInGame), { initialValue: false });

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

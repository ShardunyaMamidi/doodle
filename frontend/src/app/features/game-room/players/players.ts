import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';

import { ScoreEntry } from '../../../models/dtos';
import { selectMySessionId } from '../../../store/room/room.selectors';
import {
  selectDrawerSessionId,
  selectStandings,
} from '../../../store/game/game.selectors';

@Component({
  selector: 'app-players',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="scoreboard">
      <h2>Scoreboard</h2>
      <ul>
        @for (p of scoreboard(); track p.sessionId) {
          <li
            class="row"
            [class.me]="p.sessionId === mySessionId()"
            [class.drawing]="p.sessionId === drawerSessionId()"
          >
            <span class="avatar">{{ p.avatarId }}</span>
            <span class="name">{{ p.name }}</span>
            @if (p.sessionId === drawerSessionId()) { <span class="pencil">✏️</span> }
            <span class="score">{{ p.score }}</span>
          </li>
        }
      </ul>
    </aside>
  `,
  styles: [
    `
      .scoreboard { border: 1px solid #eee; border-radius: 0.5rem; padding: 0.75rem; }
      h2 { margin: 0 0 0.5rem; font-size: 1rem; }
      ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
      .row { display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0.4rem; border-radius: 0.35rem; }
      .row.me { background: #eef4ff; }
      .row.drawing { outline: 2px solid #2f7e78; }
      .avatar { width: 1.6rem; height: 1.6rem; border-radius: 50%; background: #d6efed; display: grid; place-items: center; font-size: 0.8rem; }
      .name { flex: 1; }
      .score { font-variant-numeric: tabular-nums; font-weight: 600; }
    `,
  ],
})
export class Players {
  private readonly store = inject(Store);
  readonly scoreboard = toSignal(this.store.select(selectStandings), {
    initialValue: [] as ScoreEntry[],
  });
  readonly drawerSessionId = toSignal(this.store.select(selectDrawerSessionId), {
    initialValue: null,
  });
  readonly mySessionId = toSignal(this.store.select(selectMySessionId), { initialValue: null });
}

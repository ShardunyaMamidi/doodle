import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';

import { selectLastTurn, selectScoreboard } from '../../../store/game/game.selectors';
import { ScoreEntry, TurnEndState } from '../../../models/dtos';

@Component({
  selector: 'app-turn-end',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop">
      <div class="card">
        <h2>Turn over</h2>
        @if (lastTurn(); as t) {
          <p class="word">The word was <strong>{{ t.word }}</strong></p>
        }
        <ol class="scores">
          @for (p of scoreboard(); track p.sessionId) {
            <li><span>{{ p.name }}</span><span class="pts">{{ p.score }}</span></li>
          }
        </ol>
      </div>
    </div>
  `,
  styles: [
    `
      .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); display: grid; place-items: center; z-index: 10; }
      .card { background: #fff; border-radius: 0.75rem; padding: 1.5rem; min-width: 18rem; text-align: center; }
      .word { font-size: 1.1rem; }
      .word strong { color: #2f7e78; }
      .scores { list-style: none; margin: 0.75rem 0 0; padding: 0; }
      .scores li { display: flex; justify-content: space-between; padding: 0.25rem 0; }
      .pts { font-variant-numeric: tabular-nums; font-weight: 600; }
    `,
  ],
})
export class TurnEnd {
  private readonly store = inject(Store);
  readonly lastTurn = toSignal<TurnEndState | null>(this.store.select(selectLastTurn), {
    initialValue: null,
  });
  readonly scoreboard = toSignal(this.store.select(selectScoreboard), {
    initialValue: [] as ScoreEntry[],
  });
}

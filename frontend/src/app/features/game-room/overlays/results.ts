import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';

import { selectFinalScoreboard } from '../../../store/game/game.selectors';
import { ScoreEntry } from '../../../models/dtos';

@Component({
  selector: 'app-results',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop">
      <div class="card">
        <h1>🏆 Game over</h1>
        <ol class="scores">
          @for (p of scoreboard() ?? []; track p.sessionId; let i = $index) {
            <li [class.winner]="i === 0">
              <span class="rank">{{ i + 1 }}</span>
              <span class="name">{{ p.name }}</span>
              <span class="pts">{{ p.score }}</span>
            </li>
          }
        </ol>
        <p class="hint">Returning to the lobby…</p>
      </div>
    </div>
  `,
  styles: [
    `
      .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55); display: grid; place-items: center; z-index: 10; }
      .card { background: #fff; border-radius: 0.75rem; padding: 2rem; min-width: 22rem; text-align: center; }
      .scores { list-style: none; margin: 1rem 0; padding: 0; }
      .scores li { display: flex; align-items: center; gap: 0.75rem; padding: 0.4rem 0.5rem; border-radius: 0.4rem; }
      .scores li.winner { background: #fff6d6; font-weight: 700; }
      .rank { width: 1.5rem; text-align: center; }
      .name { flex: 1; text-align: left; }
      .pts { font-variant-numeric: tabular-nums; }
      .hint { color: #999; }
    `,
  ],
})
export class Results {
  private readonly store = inject(Store);
  readonly scoreboard = toSignal<ScoreEntry[] | null>(this.store.select(selectFinalScoreboard), {
    initialValue: null,
  });
}

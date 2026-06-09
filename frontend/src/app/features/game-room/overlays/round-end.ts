import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';

import { selectCurrentRound, selectScoreboard } from '../../../store/game/game.selectors';
import { ScoreEntry } from '../../../models/dtos';

@Component({
  selector: 'app-round-end',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop">
      <div class="card">
        <h2>Round {{ round() }} complete</h2>
        <ol class="scores">
          @for (p of scoreboard(); track p.sessionId; let i = $index) {
            <li><span>{{ i + 1 }}. {{ p.name }}</span><span class="pts">{{ p.score }}</span></li>
          }
        </ol>
        <p class="hint">Next round starting…</p>
      </div>
    </div>
  `,
  styles: [
    `
      .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); display: grid; place-items: center; z-index: 10; }
      .card { background: #fff; border-radius: 0.75rem; padding: 1.5rem; min-width: 18rem; text-align: center; }
      .scores { list-style: none; margin: 0.75rem 0; padding: 0; }
      .scores li { display: flex; justify-content: space-between; padding: 0.25rem 0; }
      .pts { font-variant-numeric: tabular-nums; font-weight: 600; }
      .hint { color: #999; }
    `,
  ],
})
export class RoundEnd {
  private readonly store = inject(Store);
  readonly round = toSignal(this.store.select(selectCurrentRound), { initialValue: null });
  readonly scoreboard = toSignal(this.store.select(selectScoreboard), {
    initialValue: [] as ScoreEntry[],
  });
}

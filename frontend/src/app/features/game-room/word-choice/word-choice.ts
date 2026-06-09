import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { interval, map, startWith } from 'rxjs';

import { GameActions } from '../../../store/game/game.actions';
import {
  selectWordChoiceDeadline,
  selectWordChoices,
} from '../../../store/game/game.selectors';

@Component({
  selector: 'app-word-choice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop">
      <div class="modal">
        <h2>Choose a word to draw</h2>
        @if (remaining() !== null) { <p class="count">{{ remaining() }}s</p> }
        <div class="choices">
          @for (w of choices(); track $index) {
            <button type="button" (click)="pick($index)">{{ w }}</button>
          }
        </div>
        <p class="hint">If you don't pick, the game auto-advances.</p>
      </div>
    </div>
  `,
  styles: [
    `
      .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); display: grid; place-items: center; z-index: 10; }
      .modal { background: #fff; border-radius: 0.75rem; padding: 1.5rem; max-width: 28rem; text-align: center; }
      .count { font-size: 1.5rem; font-weight: 700; color: #2f7e78; margin: 0.25rem 0; }
      .choices { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; margin: 0.75rem 0; }
      .choices button { padding: 0.6rem 1rem; font-size: 1rem; border: 2px solid #2f7e78; background: #fff; border-radius: 0.5rem; cursor: pointer; }
      .choices button:hover { background: #d6efed; }
      .hint { color: #999; font-size: 0.85rem; margin: 0; }
    `,
  ],
})
export class WordChoice {
  private readonly store = inject(Store);

  private readonly now = toSignal(interval(250).pipe(map(() => Date.now()), startWith(Date.now())), {
    initialValue: Date.now(),
  });

  readonly choices = toSignal<string[] | null>(this.store.select(selectWordChoices), {
    initialValue: null,
  });
  private readonly deadline = toSignal(this.store.select(selectWordChoiceDeadline), {
    initialValue: null,
  });

  readonly remaining = computed<number | null>(() => {
    const d = this.deadline();
    return d == null ? null : Math.max(0, Math.ceil((d - this.now()) / 1000));
  });

  pick(index: number): void {
    this.store.dispatch(GameActions.chooseWord({ index }));
  }
}

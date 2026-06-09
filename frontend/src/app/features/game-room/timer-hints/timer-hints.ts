import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { interval, map, startWith } from 'rxjs';

import {
  selectDrawerName,
  selectDrawerWord,
  selectGamePhase,
  selectIsChoosingWord,
  selectIsDrawer,
  selectTurnDeadline,
  selectWordBlanks,
  selectWordChoiceDeadline,
} from '../../../store/game/game.selectors';

@Component({
  selector: 'app-timer-hints',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar">
      <span class="timer" [class.urgent]="remaining() !== null && remaining()! <= 10">
        @if (remaining() !== null) { ⏱ {{ remaining() }}s } @else { — }
      </span>

      <span class="word">
        @switch (phase()) {
          @case ('WORD_SELECTION') {
            @if (isChoosingWord()) { Pick a word! } @else { {{ drawerName() }} is choosing a word… }
          }
          @case ('DRAWING') {
            @if (isDrawer()) { <strong>{{ drawerWord() ?? wordBlanks() }}</strong> }
            @else { <span class="blanks">{{ wordBlanks() }}</span> }
          }
        }
      </span>
    </div>
  `,
  styles: [
    `
      .bar { display: flex; align-items: center; gap: 1rem; padding: 0.5rem 0.75rem; background: #f4f4f4; border-radius: 0.5rem; }
      .timer { font-variant-numeric: tabular-nums; font-weight: 600; }
      .timer.urgent { color: #c0392b; }
      .word { flex: 1; text-align: center; }
      .blanks { letter-spacing: 0.25em; font-family: monospace; font-size: 1.25rem; }
    `,
  ],
})
export class TimerHints {
  private readonly store = inject(Store);

  // local tick — never goes through the store
  private readonly now = toSignal(interval(250).pipe(map(() => Date.now()), startWith(Date.now())), {
    initialValue: Date.now(),
  });

  readonly phase = toSignal(this.store.select(selectGamePhase), { initialValue: 'LOBBY' as const });
  readonly isDrawer = toSignal(this.store.select(selectIsDrawer), { initialValue: false });
  readonly isChoosingWord = toSignal(this.store.select(selectIsChoosingWord), {
    initialValue: false,
  });
  readonly drawerName = toSignal(this.store.select(selectDrawerName), { initialValue: null });
  readonly wordBlanks = toSignal(this.store.select(selectWordBlanks), { initialValue: null });
  readonly drawerWord = toSignal(this.store.select(selectDrawerWord), { initialValue: null });
  private readonly turnDeadline = toSignal(this.store.select(selectTurnDeadline), {
    initialValue: null,
  });
  private readonly choiceDeadline = toSignal(this.store.select(selectWordChoiceDeadline), {
    initialValue: null,
  });

  readonly remaining = computed<number | null>(() => {
    const deadline = this.phase() === 'WORD_SELECTION' ? this.choiceDeadline() : this.turnDeadline();
    if (deadline == null) return null;
    return Math.max(0, Math.ceil((deadline - this.now()) / 1000));
  });
}

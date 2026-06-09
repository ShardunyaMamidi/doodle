import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';

import { ChatEvent } from '../../../models/dtos';
import { ChatActions } from '../../../store/chat/chat.actions';
import { selectChatMessages } from '../../../store/chat/chat.reducer';
import { selectCanDraw } from '../../../store/game/game.selectors';

@Component({
  selector: 'app-chat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="chat">
      <ul #log class="log">
        @for (m of messages(); track $index) {
          <li class="msg" [class]="m.type">
            @switch (m.type) {
              @case ('system') { <em>{{ m.text }}</em> }
              @case ('correct') { <strong>{{ m.text }}</strong> }
              @case ('close') { <span class="who">{{ m.senderName }}</span> — {{ m.text }} }
              @default { <span class="who">{{ m.senderName }}:</span> {{ m.text }} }
            }
          </li>
        }
      </ul>

      <form class="entry" (submit)="send($event)">
        <input
          type="text"
          maxlength="200"
          [placeholder]="canDraw() ? 'You are drawing…' : 'Type a guess…'"
          [disabled]="canDraw()"
          [ngModel]="draft()"
          (ngModelChange)="draft.set($event)"
          name="draft"
        />
        <button type="submit" [disabled]="canDraw() || !draft().trim()">Send</button>
      </form>
    </section>
  `,
  styles: [
    `
      .chat { display: flex; flex-direction: column; height: 18rem; border: 1px solid #eee; border-radius: 0.5rem; }
      .log { flex: 1; overflow-y: auto; list-style: none; margin: 0; padding: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem; }
      .msg { font-size: 0.9rem; }
      .msg.system { text-align: center; color: #888; }
      .msg.correct { color: #2f7e78; text-align: center; }
      .msg.close .who, .msg.chat .who { font-weight: 600; }
      .msg.close { color: #b8860b; }
      .entry { display: flex; gap: 0.4rem; padding: 0.4rem; border-top: 1px solid #eee; }
      .entry input { flex: 1; padding: 0.4rem; }
    `,
  ],
})
export class Chat {
  private readonly store = inject(Store);
  private readonly log = viewChild<ElementRef<HTMLElement>>('log');

  readonly messages = toSignal(this.store.select(selectChatMessages), {
    initialValue: [] as ChatEvent[],
  });
  readonly canDraw = toSignal(this.store.select(selectCanDraw), { initialValue: false });
  readonly draft = signal('');

  constructor() {
    // auto-scroll to the newest message
    effect(() => {
      this.messages();
      const el = this.log()?.nativeElement;
      if (el) queueMicrotask(() => (el.scrollTop = el.scrollHeight));
    });
  }

  send(e: Event): void {
    e.preventDefault();
    const text = this.draft().trim();
    if (!text || this.canDraw()) return;
    this.store.dispatch(ChatActions.sendMessage({ text }));
    this.draft.set('');
  }
}

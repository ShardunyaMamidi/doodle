import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { Actions, ofType } from '@ngrx/effects';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

import { RoomActions } from '../../store/room/room.actions';

const AVATARS = [0, 1, 2, 3, 4, 5, 6, 7];

@Component({
  selector: 'app-home',
  imports: [FormsModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);

  readonly avatars = AVATARS;
  readonly name = signal('');
  readonly avatarId = signal(0);
  readonly isPublic = signal(false);
  readonly code = signal('');

  readonly error = toSignal(
    this.actions$.pipe(ofType(RoomActions.entryFailed), map((a) => a.message)),
    { initialValue: '' },
  );

  get nameValid(): boolean {
    return this.name().trim().length > 0;
  }

  createRoom(): void {
    if (!this.nameValid) return;
    this.store.dispatch(
      RoomActions.createRoomRequested({
        req: { playerName: this.name().trim(), avatarId: this.avatarId(), isPublic: this.isPublic() },
      }),
    );
  }

  joinByCode(): void {
    if (!this.nameValid || !this.code().trim()) return;
    this.store.dispatch(
      RoomActions.joinByCodeRequested({
        code: this.code().trim().toUpperCase(),
        name: this.name().trim(),
        avatarId: this.avatarId(),
      }),
    );
  }

  joinPublic(): void {
    if (!this.nameValid) return;
    this.store.dispatch(
      RoomActions.joinPublicRequested({ name: this.name().trim(), avatarId: this.avatarId() }),
    );
  }
}

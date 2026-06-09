import { createActionGroup, props } from '@ngrx/store';
import { WordChoicesPrivate } from '../../models/dtos';

export const GameActions = createActionGroup({
  source: 'Game',
  events: {
    // Private word options arriving on /user/queue/.../word-choices
    'Word Choices Received': props<{ payload: WordChoicesPrivate }>(),
    // Drawer picks one of the offered words
    'Choose Word': props<{ index: number }>(),
  },
});

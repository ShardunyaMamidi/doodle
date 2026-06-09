import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { ChatEvent } from '../../models/dtos';

export const ChatActions = createActionGroup({
  source: 'Chat',
  events: {
    'Message Received': props<{ event: ChatEvent }>(),
    'Send Message': props<{ text: string }>(),
    Clear: emptyProps(),
  },
});

import { createActionGroup, emptyProps, props } from '@ngrx/store';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export const ConnectionActions = createActionGroup({
  source: 'Connection',
  events: {
    Connect: emptyProps(),
    Disconnect: emptyProps(),
    'Status Changed': props<{ status: ConnectionStatus }>(),
  },
});

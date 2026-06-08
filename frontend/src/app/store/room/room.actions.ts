import { createActionGroup, emptyProps, props } from '@ngrx/store';
import {
  CreateRoomRequest,
  SettingsUpdateIn,
  TokenOut,
} from '../../models/dtos';
import { RoomStateEvent } from '../../models/room-state-event';

export type EntryMode = 'create' | 'join';

export const RoomActions = createActionGroup({
  source: 'Room',
  events: {
    // --- Home intents (handled by effects, then navigate) ---
    'Create Room Requested': props<{ req: CreateRoomRequest }>(),
    'Join By Code Requested': props<{ code: string; name: string; avatarId: number }>(),
    'Join Public Requested': props<{ name: string; avatarId: number }>(),
    'Entry Failed': props<{ message: string }>(),

    // --- GameRoom lifecycle ---
    // Dispatched when the room screen mounts; drives the STOMP join/reconnect.
    'Enter Room': props<{
      roomId: string;
      mode: EntryMode;
      name?: string;
      avatarId?: number;
    }>(),
    'Server State Received': props<{ event: RoomStateEvent }>(),
    'Token Received': props<{ token: TokenOut }>(),
    'Leave Room': emptyProps(),

    // --- Lobby actions ---
    'Update Settings': props<{ settings: SettingsUpdateIn }>(),
    'Start Game': emptyProps(),
  },
});

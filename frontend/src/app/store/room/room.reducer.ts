import { createFeature, createReducer, on } from '@ngrx/store';
import { PlayerInfo, RoomSettings } from '../../models/dtos';
import { RoomActions } from './room.actions';

export interface RoomState {
  roomId: string | null;
  roomCode: string | null;
  isPublic: boolean | null;
  players: PlayerInfo[];
  settings: RoomSettings | null;
  hostSessionId: string | null;
  /** This client's own server-assigned session id (from TokenOut). */
  mySessionId: string | null;
}

export const initialRoomState: RoomState = {
  roomId: null,
  roomCode: null,
  isPublic: null,
  players: [],
  settings: null,
  hostSessionId: null,
  mySessionId: null,
};

/** Backend sends the full player list each time; de-dupe by sessionId defensively. */
function dedupeBySession(players: PlayerInfo[]): PlayerInfo[] {
  const byId = new Map<string, PlayerInfo>();
  for (const p of players) byId.set(p.sessionId, p);
  return [...byId.values()];
}

export const roomFeature = createFeature({
  name: 'room',
  reducer: createReducer(
    initialRoomState,
    on(RoomActions.enterRoom, (state, { roomId }) => ({
      ...initialRoomState,
      roomId,
      // keep an already-known session id across re-entry
      mySessionId: state.mySessionId,
    })),

    on(RoomActions.serverStateReceived, (state, { event }) => {
      if (event.state === 'LOBBY') {
        const lobby = event.payload;
        return {
          ...state,
          roomCode: lobby.roomCode,
          isPublic: lobby.isPublic,
          players: dedupeBySession(lobby.players),
          settings: lobby.settings,
          hostSessionId: lobby.hostSessionId,
        };
      }
      // Non-LOBBY phases are handled in Sprint 2.
      return state;
    }),

    on(RoomActions.tokenReceived, (state, { token }) => ({
      ...state,
      mySessionId: token.sessionId,
    })),

    on(RoomActions.leaveRoom, () => initialRoomState),
  ),
});

export const { name: roomFeatureKey, reducer: roomReducer } = roomFeature;

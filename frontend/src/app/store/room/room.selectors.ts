import { createSelector } from '@ngrx/store';
import { roomFeature } from './room.reducer';

export const {
  selectRoomId,
  selectRoomCode,
  selectIsPublic,
  selectPlayers,
  selectSettings,
  selectHostSessionId,
  selectMySessionId,
} = roomFeature;

export const selectIsHost = createSelector(
  selectMySessionId,
  selectHostSessionId,
  (mine, host) => mine != null && mine === host,
);

export const selectConnectedPlayerCount = createSelector(
  selectPlayers,
  (players) => players.filter((p) => p.connected).length,
);

/** Host may start once at least 2 players are connected (mirrors backend rule). */
export const selectCanStart = createSelector(
  selectIsHost,
  selectConnectedPlayerCount,
  (isHost, count) => isHost && count >= 2,
);

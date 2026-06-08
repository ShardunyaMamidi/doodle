import { PlayerInfo, RoomSettings, TokenOut } from '../../models/dtos';
import { RoomStateEvent } from '../../models/room-state-event';
import { RoomActions } from './room.actions';
import { initialRoomState, roomReducer, RoomState } from './room.reducer';

const settings: RoomSettings = {
  maxPlayers: 8,
  rounds: 3,
  turnTimeSeconds: 80,
  wordSelectionSeconds: 10,
  language: 'en',
};

function player(id: string, over: Partial<PlayerInfo> = {}): PlayerInfo {
  return {
    sessionId: id,
    name: id,
    avatarId: 0,
    score: 0,
    isHost: false,
    connected: true,
    ...over,
  };
}

function lobbyEvent(players: PlayerInfo[], hostSessionId: string): RoomStateEvent {
  return {
    state: 'LOBBY',
    payload: { roomCode: 'ABC123', isPublic: false, players, settings, hostSessionId },
  };
}

describe('roomReducer', () => {
  it('enterRoom resets the slice but keeps a known session id', () => {
    const prev: RoomState = { ...initialRoomState, mySessionId: 'me', roomCode: 'OLD' };
    const next = roomReducer(prev, RoomActions.enterRoom({ roomId: 'r1', mode: 'create' }));
    expect(next.roomId).toBe('r1');
    expect(next.roomCode).toBeNull();
    expect(next.mySessionId).toBe('me');
  });

  it('serverStateReceived (LOBBY) populates players, settings, host', () => {
    const next = roomReducer(
      initialRoomState,
      RoomActions.serverStateReceived({ event: lobbyEvent([player('a'), player('b')], 'a') }),
    );
    expect(next.players).toHaveLength(2);
    expect(next.hostSessionId).toBe('a');
    expect(next.roomCode).toBe('ABC123');
    expect(next.settings).toEqual(settings);
  });

  it('replaces (not appends) the player list on each LOBBY event', () => {
    let state = roomReducer(
      initialRoomState,
      RoomActions.serverStateReceived({ event: lobbyEvent([player('a'), player('b')], 'a') }),
    );
    state = roomReducer(
      state,
      RoomActions.serverStateReceived({ event: lobbyEvent([player('a')], 'a') }),
    );
    expect(state.players.map((p) => p.sessionId)).toEqual(['a']);
  });

  it('de-dupes players by sessionId within a single event', () => {
    const next = roomReducer(
      initialRoomState,
      RoomActions.serverStateReceived({
        event: lobbyEvent([player('a'), player('a', { name: 'dupe' })], 'a'),
      }),
    );
    expect(next.players).toHaveLength(1);
    expect(next.players[0].name).toBe('dupe');
  });

  it('reflects host migration when hostSessionId changes', () => {
    let state = roomReducer(
      initialRoomState,
      RoomActions.serverStateReceived({ event: lobbyEvent([player('a'), player('b')], 'a') }),
    );
    state = roomReducer(
      state,
      RoomActions.serverStateReceived({ event: lobbyEvent([player('b')], 'b') }),
    );
    expect(state.hostSessionId).toBe('b');
  });

  it('tokenReceived stores my session id', () => {
    const token: TokenOut = { reconnectToken: 't', sessionId: 'mine' };
    const next = roomReducer(initialRoomState, RoomActions.tokenReceived({ token }));
    expect(next.mySessionId).toBe('mine');
  });

  it('ignores non-LOBBY events in Sprint 1', () => {
    const event: RoomStateEvent = {
      state: 'WORD_SELECTION',
      payload: { drawerName: 'a', timeoutSeconds: 10 },
    };
    const next = roomReducer(initialRoomState, RoomActions.serverStateReceived({ event }));
    expect(next).toEqual(initialRoomState);
  });

  it('leaveRoom resets to initial', () => {
    const prev: RoomState = { ...initialRoomState, roomId: 'r1', mySessionId: 'me' };
    expect(roomReducer(prev, RoomActions.leaveRoom())).toEqual(initialRoomState);
  });
});

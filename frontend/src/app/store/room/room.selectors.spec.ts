import { PlayerInfo } from '../../models/dtos';
import { RoomState } from './room.reducer';
import {
  selectCanStart,
  selectConnectedPlayerCount,
  selectIsHost,
} from './room.selectors';

function player(id: string, connected = true): PlayerInfo {
  return { sessionId: id, name: id, avatarId: 0, score: 0, isHost: false, connected };
}

function roomState(over: Partial<RoomState>): RoomState {
  return {
    roomId: 'r1',
    roomCode: 'ABC123',
    isPublic: false,
    players: [],
    settings: null,
    hostSessionId: null,
    mySessionId: null,
    ...over,
  };
}

describe('room selectors', () => {
  it('selectIsHost is true only when my session id equals the host', () => {
    expect(selectIsHost.projector('a', 'a')).toBe(true);
    expect(selectIsHost.projector('a', 'b')).toBe(false);
    expect(selectIsHost.projector(null, null)).toBe(false);
  });

  it('selectConnectedPlayerCount counts only connected players', () => {
    const players = [player('a'), player('b'), player('c', false)];
    expect(selectConnectedPlayerCount.projector(players)).toBe(2);
  });

  it('selectCanStart requires host + at least 2 connected players', () => {
    expect(selectCanStart.projector(true, 2)).toBe(true);
    expect(selectCanStart.projector(true, 1)).toBe(false);
    expect(selectCanStart.projector(false, 5)).toBe(false);
  });

  it('selectConnectedPlayerCount works against a full room state', () => {
    const state = roomState({ players: [player('a'), player('b', false)] });
    expect(selectConnectedPlayerCount.projector(state.players)).toBe(1);
  });
});

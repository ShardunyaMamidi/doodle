import { ScoreEntry } from '../../models/dtos';
import { RoomStateEvent } from '../../models/room-state-event';
import { RoomActions } from '../room/room.actions';
import { GameActions } from './game.actions';
import { gameReducer, initialGameState, GameSliceState } from './game.reducer';

const score = (id: string, s: number): ScoreEntry => ({
  sessionId: id,
  name: id,
  avatarId: 0,
  score: s,
});

function recv(event: RoomStateEvent, state = initialGameState): GameSliceState {
  return gameReducer(state, RoomActions.serverStateReceived({ event }));
}

describe('gameReducer', () => {
  it('WORD_SELECTION sets phase, drawer name and a word-choice deadline', () => {
    const next = recv({
      state: 'WORD_SELECTION',
      payload: { drawerName: 'Alice', timeoutSeconds: 10 },
    });
    expect(next.phase).toBe('WORD_SELECTION');
    expect(next.drawerName).toBe('Alice');
    expect(next.wordChoiceDeadlineEpochMs).toBeGreaterThan(Date.now());
  });

  it('DRAWING (turn start) sets drawer, blanks, length and a turn deadline', () => {
    const next = recv({
      state: 'DRAWING',
      payload: {
        drawerName: 'Alice',
        drawerSessionId: 'a',
        wordBlanks: '_ _ _',
        wordLength: 3,
        timeLeftSeconds: 80,
      },
    });
    expect(next.phase).toBe('DRAWING');
    expect(next.drawerSessionId).toBe('a');
    expect(next.wordBlanks).toBe('_ _ _');
    expect(next.wordLength).toBe(3);
    expect(next.turnDeadlineEpochMs).toBeGreaterThan(Date.now());
    expect(next.wordChoices).toBeNull();
  });

  it('DRAWING hint patch only updates blanks (shape guard)', () => {
    const drawing = recv({
      state: 'DRAWING',
      payload: {
        drawerName: 'Alice',
        drawerSessionId: 'a',
        wordBlanks: '_ _ _',
        wordLength: 3,
        timeLeftSeconds: 80,
      },
    });
    const hinted = recv({ state: 'DRAWING', payload: { currentBlanks: '_ o _' } }, drawing);
    expect(hinted.wordBlanks).toBe('_ o _');
    expect(hinted.drawerSessionId).toBe('a'); // untouched
    expect(hinted.phase).toBe('DRAWING');
  });

  it('TURN_END stores lastTurn + scoreboard', () => {
    const next = recv({
      state: 'TURN_END',
      payload: { word: 'cat', pointsEarned: {}, scoreboard: [score('a', 100)] },
    });
    expect(next.phase).toBe('TURN_END');
    expect(next.lastTurn?.word).toBe('cat');
    expect(next.scoreboard).toHaveLength(1);
  });

  it('ROUND_END stores round number + scoreboard', () => {
    const next = recv({
      state: 'ROUND_END',
      payload: { roundNumber: 2, scoreboard: [score('a', 100)] },
    });
    expect(next.phase).toBe('ROUND_END');
    expect(next.currentRound).toBe(2);
  });

  it('GAME_OVER stores final scoreboard', () => {
    const next = recv({
      state: 'GAME_OVER',
      payload: { finalScoreboard: [score('a', 300), score('b', 150)] },
    });
    expect(next.phase).toBe('GAME_OVER');
    expect(next.finalScoreboard).toHaveLength(2);
    expect(next.scoreboard).toHaveLength(2);
  });

  it('LOBBY clears turn fields', () => {
    const mid = recv({
      state: 'DRAWING',
      payload: {
        drawerName: 'Alice',
        drawerSessionId: 'a',
        wordBlanks: '_ _',
        wordLength: 2,
        timeLeftSeconds: 80,
      },
    });
    const next = recv({
      state: 'LOBBY',
      payload: {
        roomCode: 'X',
        isPublic: false,
        players: [],
        settings: {
          maxPlayers: 8,
          rounds: 3,
          turnTimeSeconds: 80,
          wordSelectionSeconds: 10,
          language: 'en',
        },
        hostSessionId: 'a',
      },
    }, mid);
    expect(next.phase).toBe('LOBBY');
    expect(next.drawerSessionId).toBeNull();
    expect(next.wordBlanks).toBeNull();
  });

  it('wordChoicesReceived stores the 4 options + deadline', () => {
    const next = gameReducer(
      initialGameState,
      GameActions.wordChoicesReceived({
        payload: { words: ['a', 'b', 'c', 'd'], timeoutSeconds: 10 },
      }),
    );
    expect(next.wordChoices).toEqual(['a', 'b', 'c', 'd']);
    expect(next.wordChoiceDeadlineEpochMs).toBeGreaterThan(Date.now());
  });

  it('WORD_SELECTION does NOT wipe word-choices that already arrived (race)', () => {
    // private word-choices arrive BEFORE the WORD_SELECTION broadcast
    const withChoices = gameReducer(
      initialGameState,
      GameActions.wordChoicesReceived({
        payload: { words: ['a', 'b', 'c', 'd'], timeoutSeconds: 10 },
      }),
    );
    const next = recv(
      { state: 'WORD_SELECTION', payload: { drawerName: 'Alice', timeoutSeconds: 10 } },
      withChoices,
    );
    expect(next.wordChoices).toEqual(['a', 'b', 'c', 'd']);
  });

  it('chooseWord records the picked word for the drawer', () => {
    const withChoices = gameReducer(
      initialGameState,
      GameActions.wordChoicesReceived({
        payload: { words: ['cat', 'dog', 'fish', 'bird'], timeoutSeconds: 10 },
      }),
    );
    const next = gameReducer(withChoices, GameActions.chooseWord({ index: 2 }));
    expect(next.drawerWord).toBe('fish');
  });

  it('leaveRoom resets to initial', () => {
    const mid = recv({ state: 'WORD_SELECTION', payload: { drawerName: 'A', timeoutSeconds: 10 } });
    expect(gameReducer(mid, RoomActions.leaveRoom())).toEqual(initialGameState);
  });
});

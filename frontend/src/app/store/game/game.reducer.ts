import { createFeature, createReducer, on } from '@ngrx/store';
import { ScoreEntry, TurnEndState } from '../../models/dtos';
import { GameState as Phase } from '../../models/enums';
import { isHintUpdate } from '../../models/room-state-event';
import { RoomActions } from '../room/room.actions';
import { GameActions } from './game.actions';

export interface GameSliceState {
  phase: Phase;
  currentRound: number | null;
  drawerSessionId: string | null;
  drawerName: string | null;
  wordBlanks: string | null;
  /** The full word the drawer picked (drawer-only; broadcast carries blanks). */
  drawerWord: string | null;
  wordLength: number | null;
  turnDeadlineEpochMs: number | null;
  wordChoices: string[] | null;
  wordChoiceDeadlineEpochMs: number | null;
  scoreboard: ScoreEntry[];
  lastTurn: TurnEndState | null;
  finalScoreboard: ScoreEntry[] | null;
}

export const initialGameState: GameSliceState = {
  phase: 'LOBBY',
  currentRound: null,
  drawerSessionId: null,
  drawerName: null,
  wordBlanks: null,
  drawerWord: null,
  wordLength: null,
  turnDeadlineEpochMs: null,
  wordChoices: null,
  wordChoiceDeadlineEpochMs: null,
  scoreboard: [],
  lastTurn: null,
  finalScoreboard: null,
};

/** Fields tied to a single turn; cleared between turns. */
function clearedTurn(): Partial<GameSliceState> {
  return {
    drawerSessionId: null,
    drawerName: null,
    wordBlanks: null,
    drawerWord: null,
    wordLength: null,
    turnDeadlineEpochMs: null,
    wordChoices: null,
    wordChoiceDeadlineEpochMs: null,
  };
}

/**
 * NOTE: Date.now() in a reducer is a deliberate, contained exception. The backend
 * sends relative seconds; we convert to an absolute deadline once, at receipt, so
 * the timer component can tick locally without dispatching actions every frame.
 */
export const gameFeature = createFeature({
  name: 'game',
  reducer: createReducer(
    initialGameState,

    on(RoomActions.serverStateReceived, (state, { event }) => {
      switch (event.state) {
        case 'LOBBY':
          return { ...state, ...clearedTurn(), phase: 'LOBBY' as Phase, currentRound: null };

        case 'WORD_SELECTION':
          return {
            ...state,
            // Reset the previous turn's drawing fields, but NOT wordChoices: the
            // private word-choices message can arrive before this broadcast.
            drawerSessionId: null,
            drawerName: event.payload.drawerName,
            wordBlanks: null,
            drawerWord: null,
            wordLength: null,
            turnDeadlineEpochMs: null,
            phase: 'WORD_SELECTION',
            wordChoiceDeadlineEpochMs: Date.now() + event.payload.timeoutSeconds * 1000,
          };

        case 'DRAWING': {
          // Mid-turn hint patch rides the DRAWING state — only update the blanks.
          if (isHintUpdate(event.payload)) {
            return { ...state, wordBlanks: event.payload.currentBlanks };
          }
          const d = event.payload;
          return {
            ...state,
            phase: 'DRAWING',
            drawerSessionId: d.drawerSessionId,
            drawerName: d.drawerName,
            wordBlanks: d.wordBlanks,
            wordLength: d.wordLength,
            turnDeadlineEpochMs: Date.now() + d.timeLeftSeconds * 1000,
            wordChoices: null,
            wordChoiceDeadlineEpochMs: null,
          };
        }

        case 'TURN_END':
          return {
            ...state,
            phase: 'TURN_END',
            lastTurn: event.payload,
            scoreboard: event.payload.scoreboard,
          };

        case 'ROUND_END':
          return {
            ...state,
            phase: 'ROUND_END',
            currentRound: event.payload.roundNumber,
            scoreboard: event.payload.scoreboard,
          };

        case 'GAME_OVER':
          return {
            ...state,
            phase: 'GAME_OVER',
            finalScoreboard: event.payload.finalScoreboard,
            scoreboard: event.payload.finalScoreboard,
          };

        default:
          return state;
      }
    }),

    on(GameActions.wordChoicesReceived, (state, { payload }) => ({
      ...state,
      wordChoices: payload.words,
      wordChoiceDeadlineEpochMs: Date.now() + payload.timeoutSeconds * 1000,
    })),

    // Remember the word the drawer picked, so they see it (broadcast carries blanks).
    on(GameActions.chooseWord, (state, { index }) => ({
      ...state,
      drawerWord: state.wordChoices?.[index] ?? null,
    })),

    on(RoomActions.leaveRoom, () => initialGameState),
  ),
});

export const { name: gameFeatureKey, reducer: gameReducer } = gameFeature;

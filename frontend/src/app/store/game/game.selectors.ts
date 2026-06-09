import { createSelector } from '@ngrx/store';
import { ScoreEntry } from '../../models/dtos';
import { gameFeature } from './game.reducer';
import { selectMySessionId, selectPlayers } from '../room/room.selectors';

export const {
  selectPhase: selectGamePhase,
  selectCurrentRound,
  selectDrawerSessionId,
  selectDrawerName,
  selectWordBlanks,
  selectDrawerWord,
  selectWordLength,
  selectTurnDeadlineEpochMs: selectTurnDeadline,
  selectWordChoices,
  selectWordChoiceDeadlineEpochMs: selectWordChoiceDeadline,
  selectScoreboard,
  selectLastTurn,
  selectFinalScoreboard,
} = gameFeature;

export const selectInGame = createSelector(selectGamePhase, (p) => p !== 'LOBBY');

/**
 * Live standings for the in-game scoreboard. The backend only sends a scoreboard
 * at turn/round/game end, so during WORD_SELECTION/DRAWING we fall back to the
 * lobby player list (which carries current scores), sorted high-to-low.
 */
export const selectStandings = createSelector(
  selectScoreboard,
  selectPlayers,
  (scoreboard, players): ScoreEntry[] =>
    scoreboard.length
      ? scoreboard
      : [...players]
          .map((p) => ({
            sessionId: p.sessionId,
            name: p.name,
            avatarId: p.avatarId,
            score: p.score,
          }))
          .sort((a, b) => b.score - a.score),
);

export const selectIsDrawer = createSelector(
  selectDrawerSessionId,
  selectMySessionId,
  (drawer, mine) => mine != null && mine === drawer,
);

export const selectCanDraw = createSelector(
  selectGamePhase,
  selectIsDrawer,
  (phase, isDrawer) => phase === 'DRAWING' && isDrawer,
);

/**
 * During WORD_SELECTION the broadcast carries no drawerSessionId, so we can't use
 * `isDrawer`. Only the drawer receives private word-choices, so their presence in
 * the WORD_SELECTION phase means "I'm the one picking".
 */
export const selectIsChoosingWord = createSelector(
  selectGamePhase,
  selectWordChoices,
  (phase, choices) => phase === 'WORD_SELECTION' && !!choices && choices.length > 0,
);

import {
  DrawingState,
  GameOverState,
  HintUpdate,
  RoomState,
  RoundEndState,
  TurnEndState,
  WordSelectionState,
} from './dtos';

/**
 * Wrapper broadcast on /topic/room/{id}/state (and sent privately on /sync).
 * Discriminated on `state`.
 *
 * Contract dep #4: HintUpdate and DrawingState both ride the DRAWING state.
 * Until the backend adds an explicit eventType tag, distinguish them by shape:
 * a DRAWING payload carrying only `currentBlanks` (no `drawerSessionId`) is a hint patch.
 * See `isHintUpdate` below.
 */
export type RoomStateEvent =
  | { state: 'LOBBY'; payload: RoomState }
  | { state: 'WORD_SELECTION'; payload: WordSelectionState }
  | { state: 'DRAWING'; payload: DrawingState | HintUpdate }
  | { state: 'TURN_END'; payload: TurnEndState }
  | { state: 'ROUND_END'; payload: RoundEndState }
  | { state: 'GAME_OVER'; payload: GameOverState };

/** Shape-guard for contract dep #4. */
export function isHintUpdate(payload: DrawingState | HintUpdate): payload is HintUpdate {
  return (payload as DrawingState).drawerSessionId === undefined;
}

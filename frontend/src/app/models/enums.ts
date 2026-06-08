/** Mirrors backend GameState enum (com.mvp.doodle.model.GameState). */
export type GameState =
  | 'LOBBY'
  | 'WORD_SELECTION'
  | 'DRAWING'
  | 'TURN_END'
  | 'ROUND_END'
  | 'GAME_OVER';

/** Chat event types (backend ChatEvent.type). */
export type ChatType = 'chat' | 'system' | 'correct' | 'close';

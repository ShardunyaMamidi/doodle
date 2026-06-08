import { ChatType } from './enums';

// ---- Shared (outbound/shared) ----

/** Mirrors PlayerInfo. `sessionId` is the server-assigned STOMP session id. */
export interface PlayerInfo {
  sessionId: string;
  name: string;
  avatarId: number;
  score: number;
  isHost: boolean;
  connected: boolean;
}

/** Mirrors ScoreEntry. */
export interface ScoreEntry {
  sessionId: string;
  name: string;
  avatarId: number;
  score: number;
}

/** Mirrors RoomSettings (model). */
export interface RoomSettings {
  maxPlayers: number;
  rounds: number;
  turnTimeSeconds: number;
  wordSelectionSeconds: number;
  language: string;
}

/** Private message telling the client its own session id + reconnect token. */
export interface TokenOut {
  reconnectToken: string;
  sessionId: string;
}

// ---- State payloads (outbound/state) ----

/** LOBBY payload. */
export interface RoomState {
  roomCode: string;
  isPublic: boolean;
  players: PlayerInfo[];
  settings: RoomSettings;
  hostSessionId: string;
}

export interface WordSelectionState {
  drawerName: string;
  timeoutSeconds: number;
}

export interface DrawingState {
  drawerName: string;
  drawerSessionId: string;
  wordBlanks: string;
  wordLength: number;
  timeLeftSeconds: number;
}

/** Mid-turn hint patch. Rides the DRAWING state; distinguished by shape (only currentBlanks). */
export interface HintUpdate {
  currentBlanks: string;
}

export interface TurnEndState {
  word: string;
  pointsEarned: Record<string, number>;
  scoreboard: ScoreEntry[];
}

export interface RoundEndState {
  roundNumber: number;
  scoreboard: ScoreEntry[];
}

export interface GameOverState {
  finalScoreboard: ScoreEntry[];
}

export interface ChatEvent {
  senderName: string;
  text: string;
  type: ChatType;
}

// ---- REST requests / responses (inbound/room, outbound/rest) ----

export interface CreateRoomRequest {
  playerName: string;
  avatarId: number;
  isPublic: boolean;
}

export interface CreateRoomResponse {
  roomId: string;
  roomCode: string;
  reconnectToken: string;
}

export interface PublicRoomResponse {
  roomId: string;
}

export interface RoomCheckResponse {
  roomId: string;
  playerCount: number;
  maxPlayers: number;
}

// ---- STOMP inbound payloads (client -> server) ----

export interface JoinRoomRequest {
  playerName: string;
  avatarId: number;
}

export interface ReconnectIn {
  reconnectToken: string;
}

/** Partial settings update; any field may be omitted (host only, LOBBY only). */
export interface SettingsUpdateIn {
  rounds?: number;
  turnTimeSeconds?: number;
  maxPlayers?: number;
}

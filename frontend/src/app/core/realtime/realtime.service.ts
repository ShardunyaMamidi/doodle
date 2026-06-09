import { Injectable } from '@angular/core';
import { RxStomp, RxStompState } from '@stomp/rx-stomp';
import SockJS from 'sockjs-client';
import { map, Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ChatEvent,
  JoinRoomRequest,
  SettingsUpdateIn,
  TokenOut,
  WordChoicesPrivate,
} from '../../models/dtos';
import { RoomStateEvent } from '../../models/room-state-event';
import { DrawOp } from '../../models/draw-op';

/**
 * Thin wrapper over a single RxStomp connection. Owns the transport only —
 * knows nothing about NgRx. Backend uses SockJS, so we connect via a
 * webSocketFactory rather than a raw brokerURL.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly rx = new RxStomp();
  private activated = false;

  connect(): void {
    if (this.activated) return;
    this.rx.configure({
      webSocketFactory: () => new SockJS(environment.wsUrl) as unknown as WebSocket,
      reconnectDelay: environment.reconnect.delayMs,
    });
    this.rx.activate();
    this.activated = true;
  }

  /** Coarse connection state for the connection store slice. */
  connectionState$(): Observable<RxStompState> {
    return this.rx.connectionState$;
  }

  // ---- Broadcast subscriptions (/topic) ----

  state$(roomId: string): Observable<RoomStateEvent> {
    return this.watch(`/topic/room/${roomId}/state`);
  }

  draw$(roomId: string): Observable<DrawOp> {
    return this.watch(`/topic/room/${roomId}/draw`);
  }

  chat$(roomId: string): Observable<ChatEvent> {
    return this.watch(`/topic/room/${roomId}/chat`);
  }

  // ---- Private subscriptions (/user/queue) ----

  /** Tells this client its own session id + reconnect token. */
  token$(roomId: string): Observable<TokenOut> {
    return this.watch(`/user/queue/room/${roomId}/token`);
  }

  /** Full state resync after a reconnect (and the creator's initial state). */
  sync$(roomId: string): Observable<RoomStateEvent> {
    return this.watch(`/user/queue/room/${roomId}/sync`);
  }

  /** Word options sent privately to the drawer during WORD_SELECTION. */
  wordChoices$(roomId: string): Observable<WordChoicesPrivate> {
    return this.watch(`/user/queue/room/${roomId}/word-choices`);
  }

  // ---- Publishers (/app) ----

  join(roomId: string, req: JoinRoomRequest): void {
    this.publish(`/app/room/${roomId}/join`, req);
  }

  reconnect(roomId: string, reconnectToken: string): void {
    this.publish(`/app/room/${roomId}/reconnect`, { reconnectToken });
  }

  start(roomId: string): void {
    this.publish(`/app/room/${roomId}/start`, {});
  }

  updateSettings(roomId: string, settings: SettingsUpdateIn): void {
    this.publish(`/app/room/${roomId}/settings`, settings);
  }

  sendDraw(roomId: string, op: DrawOp): void {
    this.publish(`/app/room/${roomId}/draw`, op);
  }

  sendChat(roomId: string, text: string): void {
    this.publish(`/app/room/${roomId}/chat`, { text });
  }

  chooseWord(roomId: string, choiceIndex: number): void {
    this.publish(`/app/room/${roomId}/word-choice`, { choiceIndex });
  }

  /** Tear down the connection (e.g. on leaving a room). */
  deactivate(): void {
    if (!this.activated) return;
    this.rx.deactivate();
    this.activated = false;
  }

  private watch<T>(destination: string): Observable<T> {
    return this.rx.watch(destination).pipe(map((m) => JSON.parse(m.body) as T));
  }

  private publish(destination: string, body: unknown): void {
    this.rx.publish({ destination, body: JSON.stringify(body) });
  }
}

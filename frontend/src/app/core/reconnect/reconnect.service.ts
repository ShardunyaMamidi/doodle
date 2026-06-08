import { Injectable } from '@angular/core';

/** What we persist per room so a dropped client can re-attach to its player. */
export interface StoredCredentials {
  reconnectToken: string;
  /** Last known server-assigned session id (updated from each TokenOut). */
  sessionId?: string;
}

/**
 * Stores the SERVER-ISSUED reconnect token (and own session id) in sessionStorage,
 * keyed by roomId. It does not mint tokens — the backend owns them.
 */
@Injectable({ providedIn: 'root' })
export class ReconnectService {
  private key(roomId: string): string {
    return `doodle.creds.${roomId}`;
  }

  store(roomId: string, creds: StoredCredentials): void {
    sessionStorage.setItem(this.key(roomId), JSON.stringify(creds));
  }

  /** Merge a fresh sessionId into stored creds without losing the token. */
  updateSessionId(roomId: string, sessionId: string): void {
    const existing = this.get(roomId);
    if (!existing) return;
    this.store(roomId, { ...existing, sessionId });
  }

  get(roomId: string): StoredCredentials | null {
    const raw = sessionStorage.getItem(this.key(roomId));
    return raw ? (JSON.parse(raw) as StoredCredentials) : null;
  }

  clear(roomId: string): void {
    sessionStorage.removeItem(this.key(roomId));
  }
}

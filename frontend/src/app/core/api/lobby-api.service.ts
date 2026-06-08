import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  CreateRoomRequest,
  CreateRoomResponse,
  PublicRoomResponse,
  RoomCheckResponse,
} from '../../models/dtos';

@Injectable({ providedIn: 'root' })
export class LobbyApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  createRoom(req: CreateRoomRequest): Observable<CreateRoomResponse> {
    return this.http.post<CreateRoomResponse>(`${this.base}/rooms/create`, req);
  }

  /** 404 when no public room is available. */
  findPublicRoom(): Observable<PublicRoomResponse> {
    return this.http.get<PublicRoomResponse>(`${this.base}/rooms/public`);
  }

  /** 404 when the code is invalid. */
  checkCode(code: string): Observable<RoomCheckResponse> {
    return this.http.get<RoomCheckResponse>(`${this.base}/rooms/check/${code}`);
  }
}

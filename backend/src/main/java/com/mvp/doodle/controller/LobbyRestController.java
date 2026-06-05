package com.mvp.doodle.controller;

import com.mvp.doodle.dto.inbound.room.CreateRoomRequest;
import com.mvp.doodle.dto.outbound.rest.CreateRoomResponse;
import com.mvp.doodle.dto.outbound.rest.PublicRoomResponse;
import com.mvp.doodle.dto.outbound.rest.RoomCheckResponse;
import com.mvp.doodle.model.GameRoom;
import com.mvp.doodle.service.RoomService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class LobbyRestController {

    private final RoomService roomService;

    // POST /api/rooms/create
    // Body: { "playerName": "Alice", "avatarId": 3, "isPublic": true }
    // Returns: { "roomId": "...", "roomCode": "ABC123", "playerToken": "..." }
    //
    // playerToken is a UUID the client stores and sends in STOMP CONNECT headers
    // so the WebSocket layer can match this HTTP-created player to their WS session.
    @PostMapping("/rooms/create")
    public ResponseEntity<CreateRoomResponse> createRoom(@RequestBody CreateRoomRequest req) {
        String tempSessionId = UUID.randomUUID().toString();
        GameRoom room = roomService.createRoom(tempSessionId, req);
        String reconnectToken = room.getPlayers().get(tempSessionId).getReconnectToken();
        return ResponseEntity.ok(new CreateRoomResponse(room.getRoomId(), room.getRoomCode(), reconnectToken));
    }

    // GET /api/rooms/public
    // Returns: { "roomId": "..." } or 404 if no room available
    @GetMapping("/rooms/public")
    public ResponseEntity<PublicRoomResponse> findPublicRoom() {
        GameRoom room = roomService.findPublicRoom();
        if (room == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(new PublicRoomResponse(room.getRoomId()));
    }

    // GET /api/rooms/check/{code}
    // Returns: { "roomId": "...", "playerCount": 5, "maxPlayers": 8 } or 404
    @GetMapping("/rooms/check/{code}")
    public ResponseEntity<RoomCheckResponse> checkRoomCode(@PathVariable String code) {
        GameRoom room = roomService.findByCode(code);
        if (room == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(new RoomCheckResponse(
                room.getRoomId(),
                room.getConnectedPlayerCount(),
                room.getSettings().getMaxPlayers()));
    }

    @GetMapping("/health")
    public String health() {
        return "ok";
    }
}

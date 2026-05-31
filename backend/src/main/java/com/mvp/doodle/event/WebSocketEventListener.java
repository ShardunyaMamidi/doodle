package com.mvp.doodle.event;

import com.mvp.doodle.dto.outbound.state.RoomStateEvent;
import com.mvp.doodle.dto.outbound.state.RoomState;
import com.mvp.doodle.dto.outbound.shared.PlayerInfo;
import com.mvp.doodle.model.GameRoom;
import com.mvp.doodle.service.RoomService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketEventListener {

    private final RoomService roomService;
    private final SimpMessagingTemplate messaging;

    // Fired when a player's WebSocket connection is established
    @EventListener
    public void handleConnect(SessionConnectedEvent event) {
        String sessionId = SimpMessageHeaderAccessor.wrap(event.getMessage()).getSessionId();
        log.debug("WebSocket connected: sessionId={}", sessionId);
        // No game action yet — player must explicitly send a /join STOMP message
    }

    // Fired when a player's WebSocket connection drops (or disconnected)
    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {
        String sessionId = SimpMessageHeaderAccessor.wrap(event.getMessage()).getSessionId();
        log.debug("WebSocket disconnected: sessionId={}", sessionId);

        String roomId = roomService.getRoomIdForSession(sessionId);
        if (roomId == null) return;

        roomService.handleDisconnect(sessionId);

        // TODO (Sprint 2): notify GameEngine so it can handle drawer-disconnect mid-turn
        // gameEngine.handlePlayerDisconnect(roomId, sessionId);

        GameRoom room = roomService.getRoom(roomId);
        if (room != null) {
            // Broadcast the updated player list to the rest of the room
            // This can be done for users who are subscribed to /topic/room/{roomId}/state
            messaging.convertAndSend(
                    "/topic/room/" + roomId + "/state",
                    new RoomStateEvent(room.getState(), buildRoomState(room)));
        }
    }

    // -----------------Helper Methods--------------------

    private RoomState buildRoomState(GameRoom room) {
        List<PlayerInfo> players = room.getPlayers().values().stream()
                .map(p -> new PlayerInfo(
                        p.getSessionId(),
                        p.getName(),
                        p.getAvatarId(),
                        p.getScore(),
                        p.getSessionId().equals(room.getHostSessionId()),
                        p.isConnected()))
                .toList();
        // DTO for GameRoom (this hides some of the internal data not needed in FE)
        return new RoomState(
                room.getRoomCode(),
                room.isPublic(),
                players,
                room.getSettings(),
                room.getHostSessionId());
    }
}

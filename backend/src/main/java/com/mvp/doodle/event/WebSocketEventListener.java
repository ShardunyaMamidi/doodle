package com.mvp.doodle.event;

import com.mvp.doodle.service.GameEngine;
import com.mvp.doodle.service.RoomService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketEventListener {

    private final RoomService roomService;
    private final GameEngine gameEngine;

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
        // TODO: for now, the disconnect only updates the player list. We will deal with game-state-specific things later
        gameEngine.broadcastLobbyUpdate(roomId);
    }
}

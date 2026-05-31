package com.mvp.doodle.dto.outbound.state;

import com.mvp.doodle.model.GameState;

// Wrapper broadcast on /topic/room/{id}/state for every state transition
public record RoomStateEvent(
        GameState state,
        Object payload     // LobbyState | DrawingState | TurnEndState | ...
) {}

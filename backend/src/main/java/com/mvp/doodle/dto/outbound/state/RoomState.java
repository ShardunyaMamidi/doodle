package com.mvp.doodle.dto.outbound.state;

import com.mvp.doodle.dto.outbound.shared.PlayerInfo;
import com.mvp.doodle.model.RoomSettings;

import java.util.List;

public record RoomState(
        String roomCode,
        boolean isPublic,
        List<PlayerInfo> players,
        RoomSettings settings,
        String hostSessionId
) {}

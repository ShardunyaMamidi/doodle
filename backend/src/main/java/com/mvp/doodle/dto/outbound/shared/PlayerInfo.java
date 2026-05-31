package com.mvp.doodle.dto.outbound.shared;

public record PlayerInfo(
        String sessionId,
        String name,
        int avatarId,
        int score,
        boolean isHost,
        boolean connected
) {}

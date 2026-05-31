package com.mvp.doodle.dto.outbound.shared;

public record ScoreEntry(
        String sessionId,
        String name,
        int avatarId,
        int score
) {}

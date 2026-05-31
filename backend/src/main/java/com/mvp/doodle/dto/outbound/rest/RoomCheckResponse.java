package com.mvp.doodle.dto.outbound.rest;

public record RoomCheckResponse(
        String roomId,
        int playerCount,
        int maxPlayers
) {}

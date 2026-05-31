package com.mvp.doodle.dto.outbound.rest;

public record CreateRoomResponse(
        String roomId,
        String roomCode,
        String playerToken
) {}

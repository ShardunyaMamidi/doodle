package com.mvp.doodle.dto.outbound.shared;

// sessionId lets the client learn its own server-assigned STOMP session id,
// which it needs to identify itself in the player list (isHost / isDrawer).
public record TokenOut(String reconnectToken, String sessionId) {}

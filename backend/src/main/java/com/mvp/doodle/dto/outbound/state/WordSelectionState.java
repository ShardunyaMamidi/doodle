package com.mvp.doodle.dto.outbound.state;

// Broadcast to the room during WORD_SELECTION (no secret info)
public record WordSelectionState(
        String drawerName,
        int timeoutSeconds
) {}

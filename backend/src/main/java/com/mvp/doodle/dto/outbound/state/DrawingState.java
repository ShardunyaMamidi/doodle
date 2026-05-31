package com.mvp.doodle.dto.outbound.state;

// Broadcast when DRAWING phase starts
public record DrawingState(
        String drawerName,
        String drawerSessionId,
        String wordBlanks,      // "_ _ _ _ _ _"
        int wordLength,
        int timeLeftSeconds
) {}

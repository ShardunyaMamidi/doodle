package com.mvp.doodle.dto.outbound.state;

// Broadcast to the room (other players) during WORD_SELECTION (only info and not the word itself!)
public record WordSelectionState(
        String drawerName,
        int timeoutSeconds
) {}

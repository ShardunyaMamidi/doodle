package com.mvp.doodle.dto.outbound.state;

// Broadcast mid-turn when a letter is revealed
public record HintUpdate(
        String currentBlanks    // e.g. "_ o _ _ l e"
) {}

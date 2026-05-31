package com.mvp.doodle.dto.outbound.state;

// Broadcast for every chat message; correct guesses have empty text
public record ChatEvent(
        String senderName,
        String text,            // empty for "correct" type to hide the answer
        String type             // "chat" | "system" | "correct" | "close"
) {}

package com.mvp.doodle.dto.outbound.state;

import com.mvp.doodle.dto.outbound.shared.ScoreEntry;

import java.util.List;
import java.util.Map;

public record TurnEndState(
        String word,                            // reveal the answer
        Map<String, Integer> pointsEarned,      // sessionId → points earned this turn
        List<ScoreEntry> scoreboard
) {}

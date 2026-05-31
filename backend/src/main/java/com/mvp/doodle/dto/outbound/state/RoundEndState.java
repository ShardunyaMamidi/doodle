package com.mvp.doodle.dto.outbound.state;

import com.mvp.doodle.dto.outbound.shared.ScoreEntry;

import java.util.List;

public record RoundEndState(
        int roundNumber,
        List<ScoreEntry> scoreboard
) {}

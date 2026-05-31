package com.mvp.doodle.dto.outbound.state;

import com.mvp.doodle.dto.outbound.shared.ScoreEntry;

import java.util.List;

public record GameOverState(
        List<ScoreEntry> finalScoreboard
) {}

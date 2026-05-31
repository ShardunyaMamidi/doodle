package com.mvp.doodle.dto.inbound.room;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record SettingsUpdateIn(
        @Min(1) @Max(10) Integer rounds,
        @Min(30) @Max(120) Integer turnTimeSeconds,
        @Min(2) @Max(12) Integer maxPlayers
) {}

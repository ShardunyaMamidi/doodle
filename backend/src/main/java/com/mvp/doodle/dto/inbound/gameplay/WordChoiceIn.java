package com.mvp.doodle.dto.inbound.gameplay;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record WordChoiceIn(
        @Min(0) @Max(2) int choiceIndex
) {}

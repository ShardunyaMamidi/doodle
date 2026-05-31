package com.mvp.doodle.dto.inbound.room;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateRoomRequest(
        @NotBlank @Size(min = 1, max = 20) String playerName,
        @Min(0) @Max(7) int avatarId,
        boolean isPublic
) {
}

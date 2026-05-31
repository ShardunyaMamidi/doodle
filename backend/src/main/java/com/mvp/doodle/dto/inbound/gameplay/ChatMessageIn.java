package com.mvp.doodle.dto.inbound.gameplay;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// The text that player types in chatbox (it could be a guess or normal text)
public record ChatMessageIn(
        @NotBlank @Size(max = 200) String text
) {}

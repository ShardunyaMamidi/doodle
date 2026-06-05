package com.mvp.doodle.dto.inbound.gameplay;

import jakarta.validation.constraints.NotBlank;

public record ReconnectIn(
        @NotBlank String reconnectToken
) {}

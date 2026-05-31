package com.mvp.doodle.dto.inbound.gameplay;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

// Stroke points, color, brush size, etc. that the drawer does
public record DrawMessageIn(
        @NotBlank String type,          // "stroke" | "clear" | "undo"
        List<double[]> points,          // null for clear / undo
        String color,
        float lineWidth
) {}

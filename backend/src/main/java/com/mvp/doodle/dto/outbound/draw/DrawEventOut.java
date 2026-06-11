package com.mvp.doodle.dto.outbound.draw;

import java.util.List;

// Broadcast on /topic/room/{id}/draw (separate from the state channel)
public record DrawEventOut(
        String type,            // "stroke" | "clear" | "undo"
        String strokeId,        // present on strokes; null for clear/undo
        List<double[]> points,
        String color,
        float lineWidth
) {}

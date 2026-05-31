package com.mvp.doodle.dto.outbound.draw;

import com.mvp.doodle.model.DrawEvent;

import java.util.List;

// Sent privately to late joiners / reconnecting players
public record CanvasSnapshot(
        List<DrawEvent> events
) {}

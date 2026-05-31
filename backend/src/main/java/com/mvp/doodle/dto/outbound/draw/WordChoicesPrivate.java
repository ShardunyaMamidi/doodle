package com.mvp.doodle.dto.outbound.draw;

import java.util.List;

// Sent privately to the drawer only via /user/queue/...
public record WordChoicesPrivate(
        List<String> words,     // exactly 3 options
        int timeoutSeconds
) {}

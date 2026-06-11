package com.mvp.doodle.service;

import com.mvp.doodle.dto.inbound.gameplay.DrawMessageIn;
import com.mvp.doodle.model.DrawEvent;
import com.mvp.doodle.model.GameRoom;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class DrawingService {

    // logic to add a stroke, add it to buffer and broadcast
    public DrawEvent addStroke(GameRoom room, DrawMessageIn msg){
        DrawEvent event = new DrawEvent(
                msg.type(), msg.strokeId(), msg.points(), msg.color(), msg.lineWidth(), System.currentTimeMillis());
        room.getCanvasBuffer().add(event);
        return event;
    }

    // Adding clear event, incase user has mentioned clear; different from reset
    public void clearCanvas(GameRoom room) {
        room.getCanvasBuffer().clear();
        room.getCanvasBuffer().add(new DrawEvent(
        "clear", null, null, null, 0, 0));
    }

    // Undo: a stroke is streamed across several batches that share a strokeId, so
    // undo must remove ALL events of the most recent stroke, not just the last batch.
    public boolean undoLast(GameRoom room) {
        List<DrawEvent> buffer = room.getCanvasBuffer();
        String targetId = null;
        int lastStrokeIdx = -1;
        for (int i = buffer.size() - 1; i >= 0; i--) {
            if ("stroke".equals(buffer.get(i).getType())) {
                lastStrokeIdx = i;
                targetId = buffer.get(i).getStrokeId();
                break;
            }
        }
        if (lastStrokeIdx < 0) return false;

        if (targetId != null) {
            final String id = targetId;
            buffer.removeIf(e -> "stroke".equals(e.getType()) && id.equals(e.getStrokeId()));
        } else {
            buffer.remove(lastStrokeIdx); // legacy stroke without an id
        }
        buffer.add(new DrawEvent("undo", null, null, null, 0, System.currentTimeMillis()));
        return true;
    }

    // Get snaphost of drawEvents for late joiners/reconnecting players
    public List<DrawEvent> getSnapshot(GameRoom room) {
        return List.copyOf(room.getCanvasBuffer());
    }

    public void resetCanvas(GameRoom room) {
        room.getCanvasBuffer().clear();
    }
}

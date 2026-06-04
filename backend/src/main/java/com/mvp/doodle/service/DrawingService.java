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
                msg.type(), msg.points(), msg.color(), msg.lineWidth(), System.currentTimeMillis());
        room.getCanvasBuffer().add(event);
        return event;
    }

    // Adding clear event, incase user has mentioned clear; different from reset
    public void clearCanvas(GameRoom room) {
        room.getCanvasBuffer().clear();
        room.getCanvasBuffer().add(new DrawEvent(
        "clear", null, null, 0, 0));
    }

    // Undo event (removing the last 'stroke' event)
    public void undoLast(GameRoom room) {
        List<DrawEvent> buffer = room.getCanvasBuffer();
        for (int i = buffer.size() - 1; i >= 0; i--) {
            if ("stroke".equals(buffer.get(i).getType())) {
                buffer.remove(i);
                break;
            }
        }

        // add undo event into the buffer
        buffer.add(new DrawEvent(
                "undo", null, null, 0, System.currentTimeMillis()));
    }

    // Get snaphost of drawEvents for late joiners/reconnecting players
    public List<DrawEvent> getSnapshot(GameRoom room) {
        return List.copyOf(room.getCanvasBuffer());
    }

    public void resetCanvas(GameRoom room) {
        room.getCanvasBuffer().clear();
    }
}

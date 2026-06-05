package com.mvp.doodle.controller;

import com.mvp.doodle.dto.inbound.gameplay.ChatMessageIn;
import com.mvp.doodle.dto.inbound.gameplay.DrawMessageIn;
import com.mvp.doodle.dto.inbound.gameplay.ReconnectIn;
import com.mvp.doodle.dto.inbound.gameplay.WordChoiceIn;
import com.mvp.doodle.model.GameRoom;
import com.mvp.doodle.dto.inbound.room.JoinRoomRequest;
import com.mvp.doodle.dto.inbound.room.SettingsUpdateIn;
import com.mvp.doodle.service.GameEngine;
import com.mvp.doodle.service.RoomService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;

// Responsible for Websocket Communication
// Handles event transitions and broadcasting messages
// The path is inbound (client -> server)
@Controller
public class RoomController {
    private final RoomService roomService;
    private final GameEngine gameEngine;

    public RoomController(RoomService roomService, GameEngine gameEngine) {
        this.roomService = roomService;
        this.gameEngine = gameEngine;
    }

    @MessageMapping("/room/{roomId}/join")
    public void join(@DestinationVariable String roomId, @Payload JoinRoomRequest req, SimpMessageHeaderAccessor header) {
        String sid = header.getSessionId();
        GameRoom room = roomService.joinRoom(roomId, sid, req);
        gameEngine.sendReconnectToken(roomId, sid, room);
        gameEngine.broadcastLobbyUpdate(roomId);
    }

    @MessageMapping("/room/{roomId}/reconnect")
    public void reconnect(@DestinationVariable String roomId, @Payload ReconnectIn msg, SimpMessageHeaderAccessor header) {
        gameEngine.handleReconnectByToken(roomId, header.getSessionId(), msg.reconnectToken());
    }

    @MessageMapping("/room/{roomId}/start")
    public void startGame(@DestinationVariable String roomId, SimpMessageHeaderAccessor header) {
        gameEngine.startGame(roomId, header.getSessionId());
    }

    @MessageMapping("/room/{roomId}/word-choice")
    public void wordChoice(@DestinationVariable String roomId, @Payload WordChoiceIn msg, SimpMessageHeaderAccessor header) {
        gameEngine.handleWordChoice(roomId, header.getSessionId(), msg.choiceIndex());
    }

    @MessageMapping("/room/{roomId}/draw")
    public void draw(@DestinationVariable String roomId, @Payload DrawMessageIn msg, SimpMessageHeaderAccessor header) {
        gameEngine.handleDraw(roomId, header.getSessionId(), msg);
    }

    @MessageMapping("/room/{roomId}/chat")
    public void chat(@DestinationVariable String roomId, @Payload ChatMessageIn msg, SimpMessageHeaderAccessor header) {
        gameEngine.handleChat(roomId, header.getSessionId(), msg);
    }

    @MessageMapping("/room/{roomId}/settings")
    public void updateSettings(@DestinationVariable String roomId, @Payload SettingsUpdateIn msg, SimpMessageHeaderAccessor header) {
        roomService.updateSettings(roomId, header.getSessionId(), msg);
        gameEngine.broadcastLobbyUpdate(roomId);
    }

}

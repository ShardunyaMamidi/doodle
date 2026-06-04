package com.mvp.doodle.service;

import com.mvp.doodle.dto.inbound.room.CreateRoomRequest;
import com.mvp.doodle.dto.inbound.room.JoinRoomRequest;
import com.mvp.doodle.dto.inbound.room.SettingsUpdateIn;
import com.mvp.doodle.exception.RoomFullException;
import com.mvp.doodle.exception.RoomNotFoundException;
import com.mvp.doodle.model.GameRoom;
import com.mvp.doodle.model.GameState;
import com.mvp.doodle.model.Player;
import com.mvp.doodle.model.RoomSettings;
import org.springframework.stereotype.Service;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;

@Service
public class RoomService {
    // Memory for rooms
    private final ConcurrentHashMap<String, GameRoom> rooms = new ConcurrentHashMap<>();
    // Memory for sessionId - roomId (imp for finding out which room the session is from)
    private final ConcurrentHashMap<String, String> sessionToRoom = new ConcurrentHashMap<>();
    // Memory for shareCode - roomId
    private final ConcurrentHashMap<String, String> codeToRoom = new ConcurrentHashMap<>();

    // When creating a room, the creator becomes the first player and the host
    public GameRoom createRoom(String sessionId, CreateRoomRequest request) {
        String roomId = UUID.randomUUID().toString();
        String code = generateUniqueCode();
        GameRoom room = new GameRoom(roomId, code, request.isPublic());
        Player host = new Player(sessionId, request.playerName(), request.avatarId());
        host.setConnected(true);
        // Adding the host into the room in a concurrent queue (to preserver order)
        room.getPlayers().put(sessionId, host);
        room.setHostSessionId(sessionId);
        rooms.put(roomId, room);
        sessionToRoom.put(sessionId, roomId);
        codeToRoom.put(code, roomId);

        return room;
    }

    // Joining a room (public auto-match)
    public GameRoom joinRoom(String roomId, String sessionId, JoinRoomRequest request) {
        GameRoom room = getRoom(roomId);
        if (room == null) throw new RoomNotFoundException(roomId);
        room.getLock().lock();
        try {
            // Checking the count and must not cross the maxPlayer
            if (room.getConnectedPlayerCount() >= room.getSettings().getMaxPlayers())
                throw new RoomFullException(roomId);
            Player player = new Player(sessionId, request.playerName(), request.avatarId());
            player.setConnected(true);
            room.getPlayers().put(sessionId, player);
            sessionToRoom.put(sessionId, roomId);
            return room;
        } finally {
            room.getLock().unlock();
        }
    }

    // Joining a room via 'code'
    public GameRoom joinRoomByCode(String code, String sessionId, JoinRoomRequest request) {
        String roomId = codeToRoom.get(code.toUpperCase());
        if (roomId == null) throw new RoomNotFoundException("code = " + code);
        return joinRoom(roomId, sessionId, request);
    }

    // Finding public rooms available
    public GameRoom findPublicRoom() {
        // Conditions to find an available room:
        // Room must be public,
        // Room's game state must be a LOBBY,
        // Room must have less than the maximum players
        return rooms.values().stream().filter(room -> room.isPublic()
                && room.getState().equals(GameState.LOBBY)
                && room.getConnectedPlayerCount() < room.getSettings().getMaxPlayers())
                .findFirst().orElse(null);
    }

    // Leaving the room
    public void leaveRoom(String sessionId) {
        // Fetch the roomId using the sessionId from sessionToRoom
        String roomId = sessionToRoom.remove(sessionId);
        if (roomId == null) return;
        GameRoom room = getRoom(roomId);
        room.getLock().lock();
        try {
            room.getPlayers().remove(sessionId);
            // Incase the room is empty, we can remove the room itself
            if (room.getPlayers().isEmpty()) {
                cleanupRoom(roomId, room.getRoomCode());
            } else if (sessionId.equals(room.getHostSessionId())) {
                // Incase the host is leaving the room, transfer the host
                transferHost(room);
            }
        } finally {
            room.getLock().unlock();
        }
    }

    // Handling player disconnect
    public void handleDisconnect(String sessionId) {
        String roomId = getRoomIdForSession(sessionId);
        if (roomId == null) return ;
        GameRoom room = rooms.get(roomId);
        if (room == null) return ;
        room.getLock().lock();
        try {
            Player player = room.getPlayers().get(sessionId);
            if (player != null) player.setConnected(false);
            if (room.getConnectedPlayerCount() == 0) {
                // In the future, we can add a small delay of 1min in case a player joins
                cleanupRoom(roomId, room.getRoomCode());
            } else if (sessionId.equals(room.getHostSessionId())) {
                transferHost(room);
            }
        } finally {
            room.getLock().unlock();
        }
    }

    // Handling the transfer of host player
    private void transferHost(GameRoom room) {
        room.getPlayers().values()
                .stream()
                .filter(Player::isConnected)
                .findFirst()
                .ifPresent(p -> room.setHostSessionId(p.getSessionId()));
    }

    // Generating a unique code to share
    private String generateUniqueCode() {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion
        ThreadLocalRandom rng = ThreadLocalRandom.current();
        String code;
        do {
            StringBuilder sb = new StringBuilder(6);
            for (int i = 0; i < 6; i++) sb.append(chars.charAt(rng.nextInt(chars.length())));
            code = sb.toString();
        } while (codeToRoom.containsKey(code));
        return code;
    }

    // Clearing the room incase no one exists
    private void cleanupRoom(String roomId, String code) {
        rooms.remove(roomId);
        codeToRoom.remove(code);
    }

    public void updateSettings(String roomId, String sessionId, SettingsUpdateIn updates) {
        GameRoom room = getRoom(roomId);
        if (room == null) throw new RoomNotFoundException(roomId);
        room.getLock().lock();
        try {
            if (room.getState() != GameState.LOBBY) throw new IllegalStateException("Settings can only be changed when in Lobby");
            if (!sessionId.equals(room.getHostSessionId())) throw new IllegalStateException("Only the host can change settings");

            RoomSettings settings = room.getSettings();
            if (updates.rounds() != null)          settings.setRounds(updates.rounds());
            if (updates.turnTimeSeconds() != null)  settings.setTurnTimeSeconds(updates.turnTimeSeconds());
            if (updates.maxPlayers() != null)       settings.setMaxPlayers(updates.maxPlayers());
        } finally {
            room.getLock().unlock();
        }
    }

    public GameRoom getRoom(String roomId)              { return rooms.get(roomId); }
    public String getRoomIdForSession(String sessionId) { return sessionToRoom.get(sessionId); }
    public GameRoom findByCode(String code)             {
        String roomId = codeToRoom.get(code.toUpperCase());
        return roomId != null ? rooms.get(roomId) : null;
    }

}

package com.mvp.doodle.model;

import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.locks.ReentrantLock;

@Getter
@Setter
public class GameRoom {

    private final String roomId;
    private final String roomCode; // share it to other players
    private boolean isPublic;

    // Initial game state is LOBBY
    private GameState state = GameState.LOBBY;
    private RoomSettings settings = new RoomSettings();

    // LinkedHashMap preserves insertion order for consistent drawer rotation
    // sessionId: Player
    private final Map<String, Player> players = new LinkedHashMap<>();
    private String hostSessionId;

    // Round tracking
    private int currentRound = 0;
    private List<String> drawerOrder;
    private int currentDrawerIndex = -1;

    // Turn tracking
    private String currentWord;
    private List<String> wordChoices;
    private long turnDeadlineEpochMs;
    private int hintLevel = 0;
    private String currentBlanks;

    // Canvas buffer for late-join replay
    private final List<DrawEvent> canvasBuffer = new ArrayList<>();

    // Every room has its own lock, so that multiple players cannot join at the same time.
    private final ReentrantLock lock = new ReentrantLock();

    public GameRoom(String roomId, String roomCode, boolean isPublic) {
        this.roomId = roomId;
        this.roomCode = roomCode;
        this.isPublic = isPublic;
    }

    // --- helper methods ---

    public Player getCurrentDrawer() {
        return players.get(drawerOrder.get(currentDrawerIndex));
    }

    public String getCurrentDrawerSessionId() {
        return drawerOrder.get(currentDrawerIndex);
    }

    public List<Player> getGuessers() {
        return players.values().stream()
                .filter(p -> p.isConnected() && !p.getSessionId().equals(getCurrentDrawerSessionId()))
                .toList();
    }

    public boolean allGuessed() {
        return getGuessers().stream().allMatch(Player::isHasGuessedThisTurn);
    }

    public int getConnectedPlayerCount() {
        return (int) players.values().stream().filter(Player::isConnected).count();
    }
}

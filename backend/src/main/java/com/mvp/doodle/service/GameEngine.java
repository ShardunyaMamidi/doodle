package com.mvp.doodle.service;

import com.mvp.doodle.dto.outbound.draw.WordChoicesPrivate;
import com.mvp.doodle.dto.outbound.shared.PlayerInfo;
import com.mvp.doodle.dto.outbound.shared.ScoreEntry;
import com.mvp.doodle.dto.outbound.state.*;
import com.mvp.doodle.model.GameRoom;
import com.mvp.doodle.model.GameState;
import com.mvp.doodle.model.Player;
import org.springframework.messaging.MessageHeaders;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.*;

@Service
public class GameEngine {

    private final RoomService roomService;
    private final WordService wordService;
    private final SimpMessagingTemplate messaging;
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(4);
    // Timers of different rooms
    private final ConcurrentHashMap<String, List<ScheduledFuture<?>>> roomTimers = new ConcurrentHashMap<>();

    public GameEngine(RoomService roomService, WordService wordService, SimpMessagingTemplate messaging) {
        this.roomService = roomService;
        this.wordService = wordService;
        this.messaging = messaging;
    }

    // LOBBY -> WORD_SELECTION (When host starts the game)
    public void startGame(String roomId, String hostSessionId) {
        GameRoom room = roomService.getRoom(roomId);
        room.getLock().lock();
        try {
            // Must be in lobby state, game must start by the host, must have more than 1 player
            validateRoomBeforeGameStart(room, hostSessionId);

            room.setCurrentRound(1);
            List<String> playersOrder = new ArrayList<>(room.getPlayers().keySet());
            // Shuffle it and use it for drawing order
            Collections.shuffle(playersOrder);
            room.setDrawerOrder(playersOrder);
            // The current is not decided yet, hence the room's currentDrawer is -1
            // Will be updated based on playersOrder in word_selection phase
            room.setCurrentDrawerIndex(-1);

            // transition to WORD_SELECTION
            transitionToWordSelection(room);
        } finally {
            room.getLock().unlock();
        }
    }

    private void transitionToWordSelection(GameRoom room) {
        // Setting the current drawer to the first player in playersOrder
        room.setCurrentDrawerIndex(room.getCurrentDrawerIndex() + 1);
        room.setState(GameState.WORD_SELECTION);

        // reset their answering status from prev round
        room.getPlayers().values().forEach(Player::resetForNewTurn);
        // TODO: Yet to implement
        //drawingService.resetCanvas(room);
        // Set hint level to 0
        room.setHintLevel(0);

        // Provide the words to the drawer and only drawer
        List<String> choices = wordService.getChoices(room.getSettings().getLanguage(), 4);
        room.setWordChoices(choices);

        String drawerId = room.getCurrentDrawerSessionId();
        // sending the word choices to the drawer
        sendToUser(drawerId, "/queue/room/" + room.getRoomId() + "/word-choices", new WordChoicesPrivate(choices, room.getSettings().getWordSelectionSeconds()));

        // Broadcast this to other players (only who's drawing and not the word!)
        Player drawer = room.getCurrentDrawer();
        broadcastState(room, new WordSelectionState(drawer.getName(),
                room.getSettings().getWordSelectionSeconds()));

        // Now we can start the timer for word selection, in case the drawer doesn't pick a word; we must handle that as well
        // we can handle that in timeout handlers
        scheduleTimer(room.getRoomId(), room.getSettings().getWordSelectionSeconds() * 1000L, () -> onWordSelectionTimeout(room.getRoomId()));
    }

    private void transitionToDrawing(GameRoom room, String chosenWord) {
        cancelTimers(room.getRoomId());
        room.setState(GameState.DRAWING);
        room.setCurrentWord(chosenWord);
        room.setCurrentBlanks(wordService.generateBlanks(chosenWord));

        int turnTime = room.getSettings().getTurnTimeSeconds();
        room.setTurnDeadlineEpochMs(System.currentTimeMillis() + turnTime * 1000L);

        // Broadcast drawing state (only blanks and no words)
        broadcastState(room,
                new DrawingState(room.getCurrentDrawer().getName(), room.getCurrentDrawerSessionId(), room.getCurrentBlanks(), chosenWord.length(), turnTime));

        // Schedule turn timout
        scheduleTimer(room.getRoomId(), turnTime * 1000L, () -> onDrawingTimeout(room.getRoomId()));

        double[] hintIntervals = {0.4, 0.6, 0.8};
        for (double fraction: hintIntervals) {
            long delayMs = (long)(turnTime * fraction * 1000);
            // When the time croses one of these, we must reveal a hint
            scheduleTimer(room.getRoomId(), delayMs, () -> onHintReveal(room.getRoomId()));
        }
    }

    private void transitionToTurnEnd(GameRoom room) {
        cancelTimers(room.getRoomId());
        room.setState(GameState.TURN_END);

        // Score the drawer
        // TODO: Implement this later
        // int drawerPoints = scoringService.scoreDrawer(room);
        // room.getCurrentDrawer().setScore(room.getCurrentDrawer().getScore() + drawerPoints));

        // collect points from players
        // they earn points when they answer correctly and that is handled else where
        Map<String, Integer> earned = new HashMap<>();

        broadcastState(room,
                new TurnEndState(room.getCurrentWord(), earned, buildScoreboard(room)));

        // Give a small delay 5s for UX purpose and advance to next round
        scheduleTimer(room.getRoomId(), 5000, () -> advanceNextTurn(room.getRoomId()));
    }

    // Checking if there are more drawers this round, is it last round or is it gameover
    private void advanceNextTurn(String roomId) {
        GameRoom room = roomService.getRoom(roomId);
        room.getLock().lock();

        try {
            int nextIndex = room.getCurrentDrawerIndex() + 1;
            if (nextIndex < room.getDrawerOrder().size()) {   // Still player is there to draw
                transitionToWordSelection(room);
            } else if (room.getCurrentRound() < room.getSettings().getRounds()) {
                // a round has completed, more rounds to go
                transitionToRoundEnd(room);
            } else {
                // All rounds finished and last player has drawn
                transitionToGameOver(room);
            }
        } finally {
            room.getLock().unlock();
        }
    }

    private void transitionToRoundEnd(GameRoom room) {
        room.setState(GameState.ROUND_END);
        // Broadcast the round results
        broadcastState(room,
                new RoundEndState(room.getCurrentRound(), buildScoreboard(room)));

        scheduleTimer(room.getRoomId(), 5000, () -> {
            room.getLock().lock();
            try {
                room.setCurrentRound(room.getCurrentRound() + 1);
                // Still the current drawer is not known
                room.setCurrentDrawerIndex(-1);
                Collections.shuffle(room.getDrawerOrder());
                // Setting current drawer is handled in below method
                transitionToWordSelection(room);
            } finally {
                room.getLock().unlock();
            }
        });
    }

    private void transitionToGameOver(GameRoom room) {
        cancelTimers(room.getRoomId());
        room.setState(GameState.GAME_OVER);
        broadcastState(room,
                new GameOverState(buildScoreboard(room)));

        // Transition to lobby after 5s
        scheduleTimer(room.getRoomId(), 5000, () -> {
            room.getLock().lock();
            try {
                room.setState(GameState.LOBBY);
                room.getPlayers().values().forEach(player -> player.setScore(0));
                broadcastState(room, buildLobbyState(room));
            } finally {
                room.getLock().unlock();
            }
        });
    }

    private List<ScoreEntry> buildScoreboard(GameRoom room) {
        return room.getPlayers().values().stream()
                .map(p -> new ScoreEntry(p.getSessionId(), p.getName(), p.getAvatarId(), p.getScore()))
                .sorted(Comparator.comparingInt(ScoreEntry::score).reversed())
                .toList();
    }

    private RoomState buildLobbyState(GameRoom room) {
        List<PlayerInfo> players = room.getPlayers().values().stream()
                .map(p -> new PlayerInfo(
                        p.getSessionId(),
                        p.getName(),
                        p.getAvatarId(),
                        p.getScore(),
                        p.getSessionId().equals(room.getHostSessionId()),
                        p.isConnected()))
                .toList();
        return new RoomState(
                room.getRoomCode(),
                room.isPublic(),
                players,
                room.getSettings(),
                room.getHostSessionId());
    }

    public void broadcastLobbyUpdate(String roomId) {
        GameRoom room = roomService.getRoom(roomId);
        if (room == null) return;
        broadcastState(room, buildLobbyState(room));
    }


    // --------- VALIDATIONS----------//

    private void validateRoomBeforeGameStart(GameRoom room, String hostSessionId) {
        validate(room.getState() == GameState.LOBBY, "Game can only be started from the lobby");
        validate(hostSessionId.equals(room.getHostSessionId()), "Only the host can start the game");
        validate(room.getConnectedPlayerCount() >= 2, "At least 2 players are required to start");
    }

    private void validate(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }

    // -----------MESSAGING HELPERS----------------//

    private void broadcastState(GameRoom room, Object payload) {
        messaging.convertAndSend("/topic/room/" + room.getRoomId() + "/state"
                , new RoomStateEvent(room.getState(), payload));
    }

    private void broadcastToRoom(String roomId, String dest, Object payload) {
        messaging.convertAndSend(dest, payload);
    }

    private void sendToUser(String sessionId, String destination, Object payload) {
        messaging.convertAndSendToUser(sessionId, destination, payload, createHeaders(sessionId));
    }

    private MessageHeaders createHeaders(String sessionId) {
        SimpMessageHeaderAccessor accessor = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
        accessor.setSessionId(sessionId);
        accessor.setLeaveMutable(true);
        return accessor.getMessageHeaders();
    }

    private void scheduleTimer(String roomId, long delayMs, Runnable task) {
        ScheduledFuture<?> f = scheduler.schedule(task, delayMs, TimeUnit.MILLISECONDS);
        roomTimers.computeIfAbsent(roomId, k -> new CopyOnWriteArrayList<>()).add(f);
    }

    private void cancelTimers(String roomId) {
        List<ScheduledFuture<?>> timers = roomTimers.remove(roomId);
        if (timers != null) timers.forEach(f -> f.cancel(false));
    }

    //----------------TIMEOUT HANDLERS-----------------//

    private void onWordSelectionTimeout(String roomId) {
        GameRoom room = roomService.getRoom(roomId);
        if (room == null || !GameState.WORD_SELECTION.equals(room.getState())) return ;
        room.getLock().lock();
        try {
            // Auto pick the first word
            String word = room.getWordChoices().getFirst();
            transitionToDrawing(room, word);
        } finally {
            room.getLock().unlock();
        }
    }

    private void onDrawingTimeout(String roomId) {
        GameRoom room = roomService.getRoom(roomId);
        if (room == null || !GameState.DRAWING.equals(room.getState())) return ;
        room.getLock().lock();
        try {
            // In case the time ends before anyone guessing
            transitionToTurnEnd(room);
        } finally {
            room.getLock().unlock();
        }
    }

    private void onHintReveal(String roomId) {
        GameRoom room = roomService.getRoom(roomId);
        if (room == null || !GameState.DRAWING.equals(room.getState())) return ;
        room.getLock().lock();
        try {
            room.setHintLevel(room.getHintLevel() + 1);
            String newBlanks = wordService.revealNextHint(room.getCurrentWord(), room.getCurrentBlanks());
            room.setCurrentBlanks(newBlanks);
            broadcastToRoom(roomId, "/topic/room/" + roomId + "/state",
                    new RoomStateEvent(GameState.DRAWING, new HintUpdate(newBlanks)));
        } finally {
            room.getLock().unlock();
        }
    }
}

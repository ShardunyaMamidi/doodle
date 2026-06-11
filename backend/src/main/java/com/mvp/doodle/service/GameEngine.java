package com.mvp.doodle.service;

import com.mvp.doodle.dto.inbound.gameplay.ChatMessageIn;
import com.mvp.doodle.dto.inbound.gameplay.DrawMessageIn;
import com.mvp.doodle.dto.outbound.draw.CanvasSnapshot;
import com.mvp.doodle.dto.outbound.draw.DrawEventOut;
import com.mvp.doodle.dto.outbound.draw.WordChoicesPrivate;
import com.mvp.doodle.dto.outbound.shared.PlayerInfo;
import com.mvp.doodle.dto.outbound.shared.ScoreEntry;
import com.mvp.doodle.dto.outbound.shared.TokenOut;
import com.mvp.doodle.dto.outbound.state.*;
import com.mvp.doodle.model.DrawEvent;
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
import java.util.stream.Collectors;

@Service
public class GameEngine {

    private final RoomService roomService;
    private final WordService wordService;
    private final DrawingService drawingService;
    private final ScoringService scoringService;
    private final SimpMessagingTemplate messaging;
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(4);
    // Timers of different rooms: roomId -- List<Timers>
    private final ConcurrentHashMap<String, List<ScheduledFuture<?>>> roomTimers = new ConcurrentHashMap<>();

    public GameEngine(RoomService roomService, WordService wordService, SimpMessagingTemplate messaging, DrawingService drawingService, ScoringService scoringService) {
        this.roomService = roomService;
        this.wordService = wordService;
        this.messaging = messaging;
        this.drawingService = drawingService;
        this.scoringService = scoringService;
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

        drawingService.resetCanvas(room);
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

        // Broadcast drawing state with blanks to all players
        broadcastState(room,
                new DrawingState(room.getCurrentDrawer().getName(), room.getCurrentDrawerSessionId(), room.getCurrentBlanks(), chosenWord.length(), turnTime));

        // Drawer must always know the actual word (critical when the word was auto-selected on timeout)
        String drawerId = room.getCurrentDrawerSessionId();
        sendToUser(drawerId, "/queue/room/" + room.getRoomId() + "/sync",
                new RoomStateEvent(GameState.DRAWING,
                        new DrawingState(room.getCurrentDrawer().getName(), drawerId, chosenWord, chosenWord.length(), turnTime)));

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
        int drawerPoints = scoringService.scoreDrawer(room);
        room.getCurrentDrawer().setScore(room.getCurrentDrawer().getScore() + drawerPoints);

        // collect points from players
        // they earn points when they answer correctly and that is handled else where
        Map<String, Integer> earned = room.getGuessers().stream()
                        .collect(Collectors.toMap(Player::getName, Player::getScore));
        earned.put(room.getCurrentDrawer().getName(), drawerPoints);

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

    // Creating and broadcasting draw events based on type
    public void handleDraw(String roomId, String sessionId, DrawMessageIn msg) {
        GameRoom room = roomService.getRoom(roomId);
        if (room != null) {
            room.getLock().lock();
            try {
                if (room.getState() != GameState.DRAWING) return ;
                if (!sessionId.equals(room.getCurrentDrawerSessionId())) return ;

                switch (msg.type()) {
                    case "stroke" -> {
                        DrawEvent event = drawingService.addStroke(room, msg);
                        broadcastDrawingState(roomId, new DrawEventOut(event.getType(), event.getStrokeId(), event.getPoints(), event.getColor(), event.getLineWidth()));
                    }
                    case "clear" -> {
                        drawingService.clearCanvas(room);
                        broadcastDrawingState(roomId, new DrawEventOut("clear", null, null, null, 0));
                    }
                    case "undo" -> {
                        if (drawingService.undoLast(room)) {
                            broadcastDrawingState(roomId, new DrawEventOut("undo", null, null, null, 0));
                        }
                    }
                }
            } finally {
                room.getLock().unlock();
            }
        }
    }

    // Handling chat interface; based on words said it the chat
    // This method handles chat of player with sessionId
    public void handleChat(String roomId, String sessionId, ChatMessageIn msg) {
        GameRoom room = roomService.getRoom(roomId);
        if (room != null) {
            room.getLock().lock();
            try {
                Player sender = room.getPlayers().get(sessionId);
                if (sender == null || !sender.isConnected()) return;
                String text = sanitize(msg.text());
                // If not drawing state, we can assume it is a normal chat
                if (room.getState() != GameState.DRAWING) {
                    broadcastChat(roomId, new ChatEvent(sender.getName(), text, "chat"));
                    return;
                }
                // The current drawer cannot chat
                if (sessionId.equals(room.getCurrentDrawerSessionId())) return ;

                // Check the guessed word
                WordService.GuessResult result = wordService.checkGuess(text, room.getCurrentWord());
                switch (result) {
                    case CORRECT -> {
                        sender.setHasGuessedThisTurn(true);
                        int guessOrder = (int) room.getPlayers().values().stream().
                                filter(Player::isHasGuessedThisTurn).count();
                        sender.setGuessOrder(guessOrder);

                        // score the sender/guesser
                        int timeLeft = (int)((room.getTurnDeadlineEpochMs() - System.currentTimeMillis()) / 1000);
                        int pts = scoringService.scoreGuesser(timeLeft, room.getSettings().getTurnTimeSeconds(), sender.getGuessOrder(), room.getGuessers().size());
                        sender.setScore(sender.getScore() + pts);

                        // Broadcast in chat
                        broadcastChat(roomId, new ChatEvent(sender.getName(), sender.getName() + " has guessed the word!", "correct"));
                        // If everyone guessed, we can transition to turn end
                        if (room.allGuessed()) {
                            transitionToTurnEnd(room);
                        }
                    }

                    case CLOSE -> {
                        // Just broadcast to everyone that the sender's answer is close
                        broadcastChat(roomId, new ChatEvent(sender.getName(), "It's close!", "close"));
                    }

                    case WRONG -> {
                        broadcastChat(roomId, new ChatEvent(sender.getName(), text, "chat"));
                    }
                }
            } finally {
                room.getLock().unlock();
            }
        }
    }

    // handling the word chosen by the user
    public void handleWordChoice(String roomId, String sessionId, int wordChoiceIndex) {
        GameRoom room = roomService.getRoom(roomId);
        if (room != null) {
            room.getLock().lock();
            try {
                if (!GameState.WORD_SELECTION.equals(room.getState())) return ;
                if(!sessionId.equals(room.getCurrentDrawerSessionId())) return ;

                List<String> wordChoices = room.getWordChoices();
                if (wordChoiceIndex < 0 || wordChoiceIndex >= wordChoices.size()) return ;
                String chosenWord = wordChoices.get(wordChoiceIndex);

                transitionToDrawing(room, chosenWord);

            } finally {
                room.getLock().unlock();
            }
        }
    }


    // Called after RoomService.handleDisconnect has already marked the player disconnected
    public void handlePlayerDisconnect(String roomId, String sessionId) {
        GameRoom room = roomService.getRoom(roomId);
        if (room == null) return;
        room.getLock().lock();
        try {
            if (room.getConnectedPlayerCount() == 0) {
                // Grace period — if nobody reconnects in 15s, destroy the room
                scheduleTimer(roomId, 15_000, () -> {
                    GameRoom r = roomService.getRoom(roomId);
                    if (r != null && r.getConnectedPlayerCount() == 0) {
                        roomService.cleanupRoom(roomId, r.getRoomCode());
                    }
                });
                return;
            }

            if (room.getState() == GameState.DRAWING
                    && sessionId.equals(room.getCurrentDrawerSessionId())) {
                // Drawer left mid-turn → end the turn immediately, no one earns points
                transitionToTurnEnd(room);
            } else if (room.getState() == GameState.WORD_SELECTION
                    && sessionId.equals(room.getCurrentDrawerSessionId())) {
                // Drawer left during word pick → skip their turn
                advanceNextTurn(roomId);
            } else if (room.getState() == GameState.LOBBY) {
                broadcastLobbyUpdate(roomId);
            }
            // TURN_END / ROUND_END / GAME_OVER are transient — scheduled timers handle the next transition
        } finally {
            room.getLock().unlock();
        }
    }

    // Send reconnect token privately to a newly joined player
    // Must be stored in the session storage
    public void sendReconnectToken(String roomId, String sessionId, GameRoom room) {
        Player player = room.getPlayers().get(sessionId);
        if (player == null) return;
        sendToUser(sessionId, "/queue/room/" + roomId + "/token", new TokenOut(player.getReconnectToken(), sessionId));
    }

    // Reconnect via token: transfer player to new sessionId then sync state

    public void handleReconnectByToken(String roomId, String newSessionId, String token) {
        boolean found = roomService.reconnectPlayer(roomId, newSessionId, token);
        if (!found) return;
        handlePlayerReconnect(roomId, newSessionId);
    }

    // handling player reconnection
    // Must receive all the game information (drawing status, scoreboard, game phase)
    public void handlePlayerReconnect(String roomId, String sessionId) {
        GameRoom room = roomService.getRoom(roomId);
        if (room == null) return;
        room.getLock().lock();

        try {
            Player player = room.getPlayers().get(sessionId);
            if (player == null) return;
            player.setConnected(true);

            // Let the (re)connected client learn its new session id alongside its token.
            sendToUser(sessionId, "/queue/room/" + roomId + "/token", new TokenOut(player.getReconnectToken(), sessionId));
            sendToUser(sessionId, "/queue/room/" + roomId + "/sync", buildStateSyncPayload(room, sessionId));

            if (GameState.DRAWING.equals(room.getState())) {
                sendToUser(sessionId, "/queue/room/" + roomId + "/canvas-sync", new CanvasSnapshot(drawingService.getSnapshot(room)));
            } else if (GameState.WORD_SELECTION.equals(room.getState()) && sessionId.equals(room.getCurrentDrawerSessionId())) {
                sendToUser(sessionId, "/queue/room/" + roomId + "/word-choices", new WordChoicesPrivate(room.getWordChoices(), room.getSettings().getWordSelectionSeconds()));
            }

        } finally {
            room.getLock().unlock();
        }
    }

    // Build the payload that syncs all the info for player reconnection
    private RoomStateEvent buildStateSyncPayload(GameRoom room, String sessionId) {
        Object payload = switch (room.getState()) {
            case LOBBY -> buildLobbyState(room);
            case WORD_SELECTION -> new WordSelectionState(
                    room.getCurrentDrawer().getName(),
                    room.getSettings().getWordSelectionSeconds());
            case DRAWING -> {
                int timeLeft = (int) Math.max(0, (room.getTurnDeadlineEpochMs() - System.currentTimeMillis()) / 1000);
                boolean isDrawer = sessionId.equals(room.getCurrentDrawerSessionId());
                String word = isDrawer ? room.getCurrentWord() : room.getCurrentBlanks();
                yield new DrawingState(
                        room.getCurrentDrawer().getName(),
                        room.getCurrentDrawerSessionId(),
                        word,
                        room.getCurrentWord().length(),
                        timeLeft);
            }
            case TURN_END -> new TurnEndState(room.getCurrentWord(), Map.of(), buildScoreboard(room));
            case ROUND_END -> new RoundEndState(room.getCurrentRound(), buildScoreboard(room));
            case GAME_OVER -> new GameOverState(buildScoreboard(room));
        };
        return new RoomStateEvent(room.getState(), payload);
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

    public void broadcastLobbyUpdate(String roomId) {
        GameRoom room = roomService.getRoom(roomId);
        if (room == null) return;
        broadcastState(room, buildLobbyState(room));
    }

    public void broadcastDrawingState(String roomId, DrawEventOut event) {
        messaging.convertAndSend("/topic/room/" + roomId + "/draw", event);
    }

    public void broadcastChat(String roomId, ChatEvent event) {
        messaging.convertAndSend("/topic/room/" + roomId + "/chat", event);
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

    private String sanitize(String text) {
        return text.trim().toLowerCase().strip();
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

package com.mvp.doodle.service;

import com.mvp.doodle.dto.inbound.gameplay.ChatMessageIn;
import com.mvp.doodle.dto.inbound.gameplay.DrawMessageIn;
import com.mvp.doodle.dto.inbound.room.CreateRoomRequest;
import com.mvp.doodle.dto.inbound.room.JoinRoomRequest;
import com.mvp.doodle.dto.outbound.draw.CanvasSnapshot;
import com.mvp.doodle.dto.outbound.draw.DrawEventOut;
import com.mvp.doodle.dto.outbound.draw.WordChoicesPrivate;
import com.mvp.doodle.dto.outbound.state.ChatEvent;
import com.mvp.doodle.model.GameRoom;
import com.mvp.doodle.model.GameState;
import com.mvp.doodle.model.Player;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class GameEngineTest {

    // The only collaborator we fake. SimpMessagingTemplate needs a live STOMP
    // broker to do anything real, so we mock it: calls are recorded (and do
    // nothing), and we can later `verify(...)` that the engine broadcast what
    // it should. Every OTHER collaborator is the real thing — we want to
    // exercise the genuine room/word/scoring/drawing logic.
    private SimpMessagingTemplate messaging;

    private RoomService roomService;
    private GameEngine engine;

    @BeforeEach
    void setUp() {
        messaging = mock(SimpMessagingTemplate.class);
        roomService = new RoomService();
        WordService wordService = new WordService();
        wordService.loadWords(); // @PostConstruct doesn't run in a plain unit test
        DrawingService drawingService = new DrawingService();
        ScoringService scoringService = new ScoringService();
        engine = new GameEngine(roomService, wordService, messaging, drawingService, scoringService);
    }

    // ═════════════════════════════════════════════════════════════════════
    //  startGame  (LOBBY → WORD_SELECTION)
    // ═════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("startGame rejects a non-host caller")
    void startGame_notHost_throws() {
        GameRoom room = roomWith(2); // host = p0

        assertThatThrownBy(() -> engine.startGame(room.getRoomId(), "p1"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("host");
    }

    @Test
    @DisplayName("startGame rejects a game with fewer than 2 players")
    void startGame_tooFewPlayers_throws() {
        GameRoom room = roomWith(1); // host alone

        assertThatThrownBy(() -> engine.startGame(room.getRoomId(), "p0"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("2 players");
    }

    @Test
    @DisplayName("startGame moves the room to WORD_SELECTION and privately offers words to the drawer")
    void startGame_transitionsToWordSelection() {
        GameRoom room = roomWith(2);

        engine.startGame(room.getRoomId(), "p0");

        assertThat(room.getState()).isEqualTo(GameState.WORD_SELECTION);
        assertThat(room.getCurrentRound()).isEqualTo(1);
        assertThat(room.getDrawerOrder()).hasSize(2);

        // The current drawer receives the word choices on their private queue
        String drawer = room.getCurrentDrawerSessionId();
        verify(messaging).convertAndSendToUser(
                eq(drawer),
                eq("/queue/room/" + room.getRoomId() + "/word-choices"),
                any(WordChoicesPrivate.class),
                any(Map.class));
    }

    // ═════════════════════════════════════════════════════════════════════
    //  handleWordChoice  (WORD_SELECTION → DRAWING)
    // ═════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("handleWordChoice by the drawer starts the DRAWING phase")
    void handleWordChoice_drawerPicks_transitionsToDrawing() {
        GameRoom room = roomWith(2);
        engine.startGame(room.getRoomId(), "p0");

        engine.handleWordChoice(room.getRoomId(), room.getCurrentDrawerSessionId(), 0);

        assertThat(room.getState()).isEqualTo(GameState.DRAWING);
        assertThat(room.getCurrentWord()).isNotNull();
    }

    @Test
    @DisplayName("handleWordChoice from a non-drawer is ignored")
    void handleWordChoice_nonDrawer_ignored() {
        GameRoom room = roomWith(2);
        engine.startGame(room.getRoomId(), "p0");

        engine.handleWordChoice(room.getRoomId(), anyGuesser(room), 0);

        // Still waiting for the real drawer to choose
        assertThat(room.getState()).isEqualTo(GameState.WORD_SELECTION);
    }

    // ═════════════════════════════════════════════════════════════════════
    //  handleChat  (guessing, masking)
    // ═════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("A correct guess marks the player as guessed, awards points, and broadcasts a 'correct' event")
    void handleChat_correctGuess_marksAndScores() {
        GameRoom room = roomWith(3); // 1 drawer + 2 guessers → turn won't end yet
        driveToDrawing(room);
        String guesser = anyGuesser(room);
        String word = room.getCurrentWord();
        clearInvocations(messaging);

        engine.handleChat(room.getRoomId(), guesser, new ChatMessageIn(word));

        Player g = room.getPlayers().get(guesser);
        assertThat(g.isHasGuessedThisTurn()).isTrue();
        assertThat(g.getScore()).isPositive();
        assertThat(capturedChat(room).type()).isEqualTo("correct");
        // Only one of two guessers has guessed → still DRAWING
        assertThat(room.getState()).isEqualTo(GameState.DRAWING);
    }

    @Test
    @DisplayName("When the last remaining guesser guesses correctly, the turn ends")
    void handleChat_lastGuesserCorrect_endsTurn() {
        GameRoom room = roomWith(2); // 1 drawer + 1 guesser → that guess ends the turn
        driveToDrawing(room);
        String guesser = anyGuesser(room);

        engine.handleChat(room.getRoomId(), guesser, new ChatMessageIn(room.getCurrentWord()));

        assertThat(room.getState()).isEqualTo(GameState.TURN_END);
    }

    @Test
    @DisplayName("A close guess broadcasts a 'close' hint without revealing the answer")
    void handleChat_closeGuess_broadcastsClose() {
        GameRoom room = roomWith(3);
        driveToDrawing(room);
        String guesser = anyGuesser(room);
        String oneLetterOff = room.getCurrentWord() + "x"; // 1 insertion → CLOSE
        clearInvocations(messaging);

        engine.handleChat(room.getRoomId(), guesser, new ChatMessageIn(oneLetterOff));

        assertThat(capturedChat(room).type()).isEqualTo("close");
    }

    @Test
    @DisplayName("A wrong guess is broadcast as a normal chat message")
    void handleChat_wrongGuess_broadcastsChat() {
        GameRoom room = roomWith(3);
        driveToDrawing(room);
        String guesser = anyGuesser(room);
        clearInvocations(messaging);

        engine.handleChat(room.getRoomId(), guesser, new ChatMessageIn("zzzqwx"));

        assertThat(capturedChat(room).type()).isEqualTo("chat");
    }

    @Test
    @DisplayName("The drawer's chat is silently dropped (can't leak the answer)")
    void handleChat_drawerMessage_dropped() {
        GameRoom room = roomWith(3);
        driveToDrawing(room);
        clearInvocations(messaging);

        // Drawer types the actual word — must NOT be broadcast to the chat topic
        engine.handleChat(room.getRoomId(), room.getCurrentDrawerSessionId(),
                new ChatMessageIn(room.getCurrentWord()));

        verify(messaging, never()).convertAndSend(eq(chatDest(room)), any(Object.class));
    }

    // ═════════════════════════════════════════════════════════════════════
    //  handleDraw
    // ═════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("A stroke from the drawer is buffered and broadcast")
    void handleDraw_stroke_buffersAndBroadcasts() {
        GameRoom room = roomWith(2);
        driveToDrawing(room);
        clearInvocations(messaging);

        engine.handleDraw(room.getRoomId(), room.getCurrentDrawerSessionId(), strokeMsg());

        assertThat(room.getCanvasBuffer()).hasSize(1);
        verify(messaging).convertAndSend(eq(drawDest(room)), any(DrawEventOut.class));
    }

    @Test
    @DisplayName("A stroke from anyone other than the drawer is ignored")
    void handleDraw_nonDrawer_ignored() {
        GameRoom room = roomWith(2);
        driveToDrawing(room);
        clearInvocations(messaging);

        engine.handleDraw(room.getRoomId(), anyGuesser(room), strokeMsg());

        assertThat(room.getCanvasBuffer()).isEmpty();
        verify(messaging, never()).convertAndSend(eq(drawDest(room)), any(Object.class));
    }

    @Test
    @DisplayName("REGRESSION: an undo with nothing to undo is not broadcast")
    void handleDraw_undoWithNothing_notBroadcast() {
        GameRoom room = roomWith(2);
        driveToDrawing(room); // canvas is empty
        clearInvocations(messaging);

        engine.handleDraw(room.getRoomId(), room.getCurrentDrawerSessionId(),
                new DrawMessageIn("undo", null, null, 0));

        verify(messaging, never()).convertAndSend(eq(drawDest(room)), any(Object.class));
    }

    // ═════════════════════════════════════════════════════════════════════
    //  handlePlayerDisconnect
    // ═════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("Drawer disconnecting mid-DRAWING ends the turn immediately")
    void handlePlayerDisconnect_drawerInDrawing_endsTurn() {
        GameRoom room = roomWith(2);
        driveToDrawing(room);
        String drawer = room.getCurrentDrawerSessionId();

        roomService.handleDisconnect(drawer);            // real flow: marked offline first
        engine.handlePlayerDisconnect(room.getRoomId(), drawer);

        assertThat(room.getState()).isEqualTo(GameState.TURN_END);
    }

    @Test
    @DisplayName("Drawer disconnecting during WORD_SELECTION skips to the next drawer")
    void handlePlayerDisconnect_drawerInWordSelection_skipsTurn() {
        GameRoom room = roomWith(2);
        engine.startGame(room.getRoomId(), "p0"); // WORD_SELECTION, drawer index 0
        String drawer = room.getCurrentDrawerSessionId();

        roomService.handleDisconnect(drawer);
        engine.handlePlayerDisconnect(room.getRoomId(), drawer);

        // Turn was skipped — the rotation advanced to the next drawer
        assertThat(room.getCurrentDrawerIndex()).isEqualTo(1);
    }

    @Test
    @DisplayName("When the last player disconnects, the room is not cleaned up synchronously (grace period)")
    void handlePlayerDisconnect_lastPlayer_keepsRoomForGracePeriod() {
        GameRoom room = roomWith(1);

        roomService.handleDisconnect("p0");              // now 0 connected
        engine.handlePlayerDisconnect(room.getRoomId(), "p0");

        // Cleanup is deferred to a 15s timer, so the room still exists right now
        assertThat(roomService.getRoom(room.getRoomId())).isSameAs(room);
    }

    // ═════════════════════════════════════════════════════════════════════
    //  handlePlayerReconnect
    // ═════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("Reconnecting marks the player online and sends them a state sync")
    void handlePlayerReconnect_marksOnlineAndSyncs() {
        GameRoom room = roomWith(2);
        roomService.handleDisconnect("p1");
        clearInvocations(messaging);

        engine.handlePlayerReconnect(room.getRoomId(), "p1");

        assertThat(room.getPlayers().get("p1").isConnected()).isTrue();
        verify(messaging).convertAndSendToUser(
                eq("p1"),
                eq("/queue/room/" + room.getRoomId() + "/sync"),
                any(),
                any(Map.class));
    }

    @Test
    @DisplayName("Reconnecting during DRAWING also pushes a canvas snapshot to replay")
    void handlePlayerReconnect_duringDrawing_sendsCanvasSnapshot() {
        GameRoom room = roomWith(3);
        driveToDrawing(room);
        String guesser = anyGuesser(room);
        roomService.handleDisconnect(guesser);
        clearInvocations(messaging);

        engine.handlePlayerReconnect(room.getRoomId(), guesser);

        verify(messaging).convertAndSendToUser(
                eq(guesser),
                eq("/queue/room/" + room.getRoomId() + "/canvas-sync"),
                any(CanvasSnapshot.class),
                any(Map.class));
    }

    // ═════════════════════════════════════════════════════════════════════
    //  Test helpers
    // ═════════════════════════════════════════════════════════════════════

    /** Creates a LOBBY room with `count` connected players: host "p0", then "p1", "p2"... */
    private GameRoom roomWith(int count) {
        GameRoom room = roomService.createRoom("p0", new CreateRoomRequest("Player0", 0, true));
        for (int i = 1; i < count; i++) {
            roomService.joinRoom(room.getRoomId(), "p" + i, new JoinRoomRequest("Player" + i, 0));
        }
        return room;
    }

    /** Starts the game and has the drawer pick a word, leaving the room in DRAWING. */
    private void driveToDrawing(GameRoom room) {
        engine.startGame(room.getRoomId(), "p0");
        engine.handleWordChoice(room.getRoomId(), room.getCurrentDrawerSessionId(), 0);
    }

    /** Any connected player who is not the current drawer. */
    private String anyGuesser(GameRoom room) {
        return room.getPlayers().keySet().stream()
                .filter(sid -> !sid.equals(room.getCurrentDrawerSessionId()))
                .findFirst().orElseThrow();
    }

    /** Captures the single ChatEvent broadcast to the room's chat topic. */
    private ChatEvent capturedChat(GameRoom room) {
        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        verify(messaging).convertAndSend(eq(chatDest(room)), captor.capture());
        return (ChatEvent) captor.getValue();
    }

    private String chatDest(GameRoom room) {
        return "/topic/room/" + room.getRoomId() + "/chat";
    }

    private String drawDest(GameRoom room) {
        return "/topic/room/" + room.getRoomId() + "/draw";
    }

    private DrawMessageIn strokeMsg() {
        return new DrawMessageIn("stroke", List.of(new double[]{1, 2, 0.5}), "#000000", 5f);
    }
}

package com.mvp.doodle.service;

import com.mvp.doodle.dto.inbound.room.CreateRoomRequest;
import com.mvp.doodle.dto.inbound.room.JoinRoomRequest;
import com.mvp.doodle.exception.RoomFullException;
import com.mvp.doodle.exception.RoomNotFoundException;
import com.mvp.doodle.model.GameRoom;
import com.mvp.doodle.model.Player;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomServiceTest {

    private RoomService roomService;

    @BeforeEach
    void setUp() {
        // RoomService keeps all state in in-memory maps, so a fresh instance is
        // a completely clean slate — no Spring, no database, nothing to reset.
        roomService = new RoomService();
    }

    // ─────────────────────────────────────────────────────────────────────
    //  createRoom
    // ─────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("createRoom registers the room and makes the creator a connected host")
    void createRoom_creatorBecomesConnectedHost() {
        GameRoom room = roomService.createRoom("host-sid", createReq("Alice"));

        // Creator is the host and is connected
        assertThat(room.getHostSessionId()).isEqualTo("host-sid");
        Player host = room.getPlayers().get("host-sid");
        assertThat(host.getName()).isEqualTo("Alice");
        assertThat(host.isConnected()).isTrue();

        // Room is reachable through every lookup map
        assertThat(roomService.getRoom(room.getRoomId())).isSameAs(room);
        assertThat(roomService.getRoomIdForSession("host-sid")).isEqualTo(room.getRoomId());
        assertThat(roomService.findByCode(room.getRoomCode())).isSameAs(room);
    }

    @Test
    @DisplayName("Generated room code uses the unambiguous charset (no 0/O/1/I)")
    void createRoom_codeUsesSafeCharset() {
        GameRoom room = roomService.createRoom("host-sid", createReq("Alice"));

        // 6 chars, only A–Z (minus I,O) and 2–9
        assertThat(room.getRoomCode()).matches("[A-HJ-NP-Z2-9]{6}");
    }

    // ─────────────────────────────────────────────────────────────────────
    //  joinRoom
    // ─────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("joinRoom adds the player and maps their session to the room")
    void joinRoom_addsPlayer() {
        GameRoom room = roomService.createRoom("host-sid", createReq("Alice"));

        roomService.joinRoom(room.getRoomId(), "bob-sid", joinReq("Bob"));

        assertThat(room.getPlayers()).containsKey("bob-sid");
        assertThat(roomService.getRoomIdForSession("bob-sid")).isEqualTo(room.getRoomId());
    }

    @Test
    @DisplayName("joinRoom rejects a player when the room is already full")
    void joinRoom_whenFull_throwsRoomFull() {
        GameRoom room = roomService.createRoom("host-sid", createReq("Alice"));
        room.getSettings().setMaxPlayers(2); // host + 1 more = full
        roomService.joinRoom(room.getRoomId(), "bob-sid", joinReq("Bob"));

        assertThatThrownBy(() ->
                roomService.joinRoom(room.getRoomId(), "carol-sid", joinReq("Carol")))
                .isInstanceOf(RoomFullException.class);
    }

    @Test
    @DisplayName("joinRoom on a non-existent room throws RoomNotFound")
    void joinRoom_unknownRoom_throwsRoomNotFound() {
        assertThatThrownBy(() ->
                roomService.joinRoom("no-such-room", "bob-sid", joinReq("Bob")))
                .isInstanceOf(RoomNotFoundException.class);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  handleDisconnect — marks disconnected, keeps the player (for reconnect)
    // ─────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("handleDisconnect marks the player offline but keeps them in the room")
    void handleDisconnect_marksOfflineButKeepsPlayer() {
        GameRoom room = roomService.createRoom("host-sid", createReq("Alice"));
        roomService.joinRoom(room.getRoomId(), "bob-sid", joinReq("Bob"));

        roomService.handleDisconnect("bob-sid");

        Player bob = room.getPlayers().get("bob-sid");
        assertThat(bob).isNotNull();                 // still in the room
        assertThat(bob.isConnected()).isFalse();      // but marked offline
    }

    @Test
    @DisplayName("handleDisconnect transfers host when the host drops and others remain")
    void handleDisconnect_hostDrops_transfersHost() {
        GameRoom room = roomService.createRoom("host-sid", createReq("Alice"));
        roomService.joinRoom(room.getRoomId(), "bob-sid", joinReq("Bob"));

        roomService.handleDisconnect("host-sid");

        // Host role moves to the remaining connected player
        assertThat(room.getHostSessionId()).isEqualTo("bob-sid");
    }

    @Test
    @DisplayName("handleDisconnect does NOT clean up the room (grace period is GameEngine's job)")
    void handleDisconnect_doesNotCleanupRoom() {
        GameRoom room = roomService.createRoom("host-sid", createReq("Alice"));

        roomService.handleDisconnect("host-sid"); // last player disconnects

        // Room still exists — RoomService leaves cleanup to the engine's timer
        assertThat(roomService.getRoom(room.getRoomId())).isSameAs(room);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  reconnectPlayer — swap a player onto a new sessionId, re-key everything
    // ─────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("reconnectPlayer re-keys the player across players, session map, drawer order and host")
    void reconnectPlayer_reKeysEverything() {
        GameRoom room = roomService.createRoom("old-sid", createReq("Alice"));
        Player player = room.getPlayers().get("old-sid");
        String token = player.getReconnectToken();
        // Pretend a game is in progress so drawerOrder must be re-keyed too
        room.setDrawerOrder(new ArrayList<>(List.of("old-sid")));

        boolean ok = roomService.reconnectPlayer(room.getRoomId(), "new-sid", token);

        assertThat(ok).isTrue();
        // players map re-keyed
        assertThat(room.getPlayers()).containsKey("new-sid").doesNotContainKey("old-sid");
        // sessionToRoom re-keyed
        assertThat(roomService.getRoomIdForSession("new-sid")).isEqualTo(room.getRoomId());
        assertThat(roomService.getRoomIdForSession("old-sid")).isNull();
        // drawerOrder re-keyed
        assertThat(room.getDrawerOrder()).containsExactly("new-sid");
        // host pointer re-keyed
        assertThat(room.getHostSessionId()).isEqualTo("new-sid");
    }

    @Test
    @DisplayName("reconnectPlayer preserves the player's score and name across the swap")
    void reconnectPlayer_preservesPlayerData() {
        GameRoom room = roomService.createRoom("old-sid", createReq("Alice"));
        Player player = room.getPlayers().get("old-sid");
        player.setScore(250);
        String token = player.getReconnectToken();

        roomService.reconnectPlayer(room.getRoomId(), "new-sid", token);

        Player moved = room.getPlayers().get("new-sid");
        assertThat(moved.getScore()).isEqualTo(250);
        assertThat(moved.getName()).isEqualTo("Alice");
        assertThat(moved.getSessionId()).isEqualTo("new-sid");
    }

    @Test
    @DisplayName("reconnectPlayer returns false for an unrecognized token")
    void reconnectPlayer_invalidToken_returnsFalse() {
        GameRoom room = roomService.createRoom("old-sid", createReq("Alice"));

        boolean ok = roomService.reconnectPlayer(room.getRoomId(), "new-sid", "bogus-token");

        assertThat(ok).isFalse();
    }

    @Test
    @DisplayName("reconnectPlayer returns false for an unknown room")
    void reconnectPlayer_unknownRoom_returnsFalse() {
        boolean ok = roomService.reconnectPlayer("no-such-room", "new-sid", "any-token");

        assertThat(ok).isFalse();
    }

    // ─────────────────────────────────────────────────────────────────────
    //  cleanupRoom
    // ─────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("cleanupRoom removes the room from both the id and code lookups")
    void cleanupRoom_removesFromAllMaps() {
        GameRoom room = roomService.createRoom("host-sid", createReq("Alice"));

        roomService.cleanupRoom(room.getRoomId(), room.getRoomCode());

        assertThat(roomService.getRoom(room.getRoomId())).isNull();
        assertThat(roomService.findByCode(room.getRoomCode())).isNull();
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Test helpers
    // ─────────────────────────────────────────────────────────────────────

    private CreateRoomRequest createReq(String name) {
        return new CreateRoomRequest(name, 0, true);
    }

    private JoinRoomRequest joinReq(String name) {
        return new JoinRoomRequest(name, 0);
    }
}

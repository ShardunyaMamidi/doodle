# Doodle Dash — Backend Test Plan

> **Scope:** Backend only (Spring Boot, WebSocket/STOMP, in-memory state)
> **Tools:** JUnit 5, Mockito, `@SpringBootTest`, `WebSocketStompClient`
> **Reference:** [Backend Sprint Plan — Appendix B](./backend-sprint-plan.md)

---

## Strategy

Two layers of tests:

| Layer | Tool | Speed | Purpose |
|---|---|---|---|
| **Unit** | JUnit 5 + Mockito | Fast | Test one class in isolation — no Spring, no network |
| **Integration** | `@SpringBootTest` + `WebSocketStompClient` | Slow | Boot the full app and simulate real STOMP traffic |

### Suggested implementation order

Build confidence from simple → complex:

```
1. ScoringServiceTest     ← pure math, zero setup
2. WordServiceTest        ← no dependencies
3. DrawingServiceTest     ← only needs a GameRoom instance
4. RoomServiceTest        ← in-memory only, no Spring
5. GameEngineTest         ← needs Mockito for messaging
6. GameIntegrationTest    ← last; needs everything working
```

---

## Layer 1 — Unit Tests

### 1. `ScoringServiceTest`

Pure math, no mocks required.

- [ ] `scoreGuesser` — first guesser, lots of time left → high score
- [ ] `scoreGuesser` — last guesser, little time left → low score but never below the 10-point minimum
- [ ] `scoreGuesser` — order bonus decreases as guess order increases
- [ ] `scoreDrawer` — all guessers guessed → 100 points
- [ ] `scoreDrawer` — nobody guessed → 0 points
- [ ] `scoreDrawer` — half guessed → proportional score (~50)
- [ ] `scoreDrawer` — zero guessers in room → 0 (no divide-by-zero)

### 2. `WordServiceTest`

No dependencies on other classes.

- [ ] `checkGuess` — exact match (case-insensitive) → `CORRECT`
- [ ] `checkGuess` — match after stripping punctuation/extra spaces → `CORRECT`
- [ ] `checkGuess` — 1 letter off (e.g. `"elphant"` vs `"elephant"`) → `CLOSE`
- [ ] `checkGuess` — 2+ letters off → `WRONG`
- [ ] `checkGuess` — empty/blank guess → `WRONG`
- [ ] `generateBlanks("apple")` → `"_ _ _ _ _"`
- [ ] `generateBlanks` — multi-word preserves the space gap
- [ ] `revealNextHint` — replaces exactly one `_` with the correct letter
- [ ] `revealNextHint` — never reveals a space position
- [ ] `revealNextHint` — repeated calls eventually reveal all letters
- [ ] `getChoices` — returns the requested count
- [ ] `getChoices` — no duplicates in the returned list

### 3. `DrawingServiceTest`

Only needs a `GameRoom` instance — no Spring.

- [ ] `addStroke` — appends event to buffer and returns it
- [ ] `clearCanvas` — wipes buffer and adds a single `"clear"` event
- [ ] `undoLast` — removes the last `"stroke"` and returns `true`
- [ ] `undoLast` — returns `false` on an empty buffer (no crash)
- [ ] `undoLast` — returns `false` after `clearCanvas` (nothing to undo) ← regression guard
- [ ] `undoLast` — skips `"clear"`/`"undo"` markers to find the last real stroke
- [ ] `undoLast` — does NOT append an `"undo"` marker when no stroke was removed ← regression guard
- [ ] `getSnapshot` — returns an immutable copy (mutating the buffer afterward doesn't change the snapshot)
- [ ] `resetCanvas` — wipes the buffer completely

### 4. `RoomServiceTest`

In-memory only, no Spring context.

- [ ] `createRoom` — creator is host + connected, room registered in all maps
- [ ] `joinRoom` — adds player and maps session → room
- [ ] `joinRoom` — rejects when room is at `maxPlayers`
- [ ] `handleDisconnect` — marks player `connected=false`, keeps them in the room
- [ ] `handleDisconnect` — host leaves with others present → host transfers to next connected player
- [ ] `handleDisconnect` — does NOT clean up the room (grace period handled by GameEngine)
- [ ] `reconnectPlayer` — valid token re-keys `players`, `sessionToRoom`, `drawerOrder`, and host to the new sessionId
- [ ] `reconnectPlayer` — invalid token → returns `false`
- [ ] `reconnectPlayer` — preserves player score and name across the swap
- [ ] `cleanupRoom` — removes the room from `rooms` and `codeToRoom`
- [ ] `generateUniqueCode` — produced codes are unique and use the safe charset (no 0/O/1/I)

### 5. `GameEngineTest`

Mock `SimpMessagingTemplate`; use real `RoomService` / `WordService` / `ScoringService` / `DrawingService`.

**Game start**
- [ ] `startGame` — rejected when caller is not the host
- [ ] `startGame` — rejected with fewer than 2 connected players
- [ ] `startGame` — transitions `LOBBY` → `WORD_SELECTION`
- [ ] `startGame` — shuffles and sets the drawer order

**Word selection → drawing**
- [ ] `handleWordChoice` — drawer picks a word → transitions to `DRAWING`
- [ ] `handleWordChoice` — non-drawer attempt is ignored
- [ ] word-selection timeout auto-picks the first word

**Chat / guessing**
- [ ] `handleChat` — correct guess → player marked guessed, score added, `"correct"` event broadcast (answer hidden)
- [ ] `handleChat` — correct guess by the last remaining guesser → `transitionToTurnEnd` fires
- [ ] `handleChat` — close guess → `"close"` event
- [ ] `handleChat` — wrong guess → normal `"chat"` event with text
- [ ] `handleChat` — drawer's message is silently dropped
- [ ] `handleChat` — already-guessed player can't re-trigger scoring

**Drawing**
- [ ] `handleDraw` — non-drawer stroke is ignored
- [ ] `handleDraw` — stroke ignored when not in `DRAWING` state
- [ ] `handleDraw` — `"undo"` with nothing to undo does NOT broadcast ← regression guard

**Disconnect / reconnect**
- [ ] `handlePlayerDisconnect` — drawer leaves mid-turn → turn ends
- [ ] `handlePlayerDisconnect` — drawer leaves during word selection → turn skipped
- [ ] `handlePlayerDisconnect` — last player leaves → grace-period cleanup scheduled
- [ ] `handlePlayerReconnect` — player marked connected, state-sync payload sent
- [ ] `handlePlayerReconnect` — mid-drawing reconnect also receives a canvas snapshot

**Round / game progression**
- [ ] `advanceNextTurn` — more drawers remain → next word selection
- [ ] `advanceNextTurn` — round complete, more rounds → `ROUND_END`
- [ ] `advanceNextTurn` — last round complete → `GAME_OVER`
- [ ] `GAME_OVER` → returns to `LOBBY` with all scores reset

---

## Layer 2 — Integration Test

### `GameIntegrationTest`

`@SpringBootTest(webEnvironment = RANDOM_PORT)` with a real `WebSocketStompClient`. Connect multiple live clients and assert on the messages they receive (use a `BlockingQueue` per subscription + poll with a timeout).

**Lobby lifecycle**
- [ ] Client connects, joins a room, receives a lobby update with the player list
- [ ] Second client joins → both see the updated roster
- [ ] Joining client receives its reconnect token privately

**Game flow**
- [ ] Host starts the game → all clients receive `WORD_SELECTION` state
- [ ] Drawer receives word choices privately; non-drawers do NOT
- [ ] Drawer picks a word → all clients receive `DRAWING` state with blanks (not the word)
- [ ] Drawer sends strokes → all other clients receive the draw events
- [ ] Guesser sends the correct answer → receives `"correct"` event + score update
- [ ] All guessers correct → `TURN_END` with the revealed word and scoreboard
- [ ] Full single-round game runs to `GAME_OVER`, then returns to `LOBBY`

**Resilience**
- [ ] Drawer disconnects mid-turn → turn ends gracefully, game advances
- [ ] Player disconnects then reconnects with token → receives full state sync
- [ ] Reconnect during `DRAWING` → receives the canvas snapshot to replay

---

## Test Infrastructure Notes

- **Location:** `backend/src/test/java/com/mvp/doodle/...` mirroring the main package layout (`service/`, `controller/`, etc.).
- **Naming:** `<ClassName>Test` for unit, `<Feature>IntegrationTest` for integration.
- **Builders:** Add a small test helper to construct a populated `GameRoom` (host + N players) to avoid repetitive setup across `DrawingServiceTest`, `RoomServiceTest`, and `GameEngineTest`.
- **Timers:** `GameEngine` uses a real `ScheduledExecutorService`. For unit tests, prefer calling transition/timeout methods directly rather than waiting on wall-clock delays. For integration tests, use short timeouts via test config (e.g. a `@TestConfiguration` overriding `RoomSettings`) and `Awaitility` for polling instead of `Thread.sleep`.
- **Assertions:** Consider AssertJ (`assertThat(...)`) for readable fluent assertions — it ships with `spring-boot-starter-test`.

---

## Definition of Done (testing)

- [ ] All 5 unit test classes written and green
- [ ] Integration test covers the happy-path full game + one reconnect scenario
- [ ] `mvn test` passes cleanly from a fresh checkout
- [ ] Regression guards for the undo-after-clear bug are in place

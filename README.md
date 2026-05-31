# 🎨 Doodle

> Draw it. Guess it. Laugh about it.

Doodle is a real-time multiplayer drawing and guessing game — think of it as your own hosted version of skribbl.io. One player draws, everyone else races to guess the word, and the fastest fingers score the most points. Built for a group of friends, a team ice-breaker, or just a good time.

---

## What is it?

Each round, one player gets a secret word and has to draw it on a shared canvas — no letters allowed. Everyone else types their guesses in the chat. Guess early, score big. As time ticks down, letter hints start appearing to give slower guessers a fighting chance. After everyone's had a turn to draw, the scoreboard crowns a winner and you jump straight back in.

A few things that make it feel right:
- **Drawing actually feels good** — strokes are smooth and render in real-time on everyone else's screen with no noticeable lag
- **No account needed** — pick a name, grab an avatar, and you're in
- **Public or private** — jump into a random room or create a private one with an invite code for your friends
- **Host controls** — configure the number of rounds, turn time, and word difficulty before starting

---

## The Stack

This is a full-stack project with a clear split between what handles the game logic and what handles the visuals.

**Backend — Spring Boot**
- Runs the entire game as a server-authoritative state machine. The server decides when turns start and end, validates guesses, reveals hints, and keeps all players in sync. Clients only render what the server tells them — no cheating.
- Real-time communication is handled over **WebSocket with STOMP**, which gives us a clean pub/sub model. Every room gets its own set of topics, and secret information (like the word choices offered to the drawer) is sent only to that player via a private queue.

**Frontend — Angular 17+**
- Standalone components, lazy-loaded routes, and Angular signals for reactive state. The game state flows from a single `GameStateService` that subscribes to the server's STOMP channels and fans out to the components that need it.
- Drawing is powered by **[signature_pad](https://github.com/szimek/signature_pad)** — an open-source library that captures smooth, pressure-sensitive strokes. The drawer's strokes are batched and streamed to the server every ~50ms, which fans them out to every guesser's canvas in real-time.
- The UI has a hand-drawn, oil-paint notebook aesthetic — think ruled paper, paint blobs bleeding off the edges, and Permanent Marker fonts. All of it is done in SCSS with Google Fonts; no image assets needed for the UI chrome.

---

## How it Works (the quick version)

```
Player opens the app
  → picks a name + doodle avatar
  → creates or joins a room (public auto-match or private invite code)
  → lands in the lobby

Host starts the game
  → server shuffles the drawer order
  → each turn: drawer gets 3 word choices (only they see this)
  → drawer picks a word → canvas goes live → turn timer starts

While the turn runs:
  → drawer's strokes stream to everyone else in real-time
  → guessers type in chat → server checks each guess server-side
  → correct guess → hidden from chat, points awarded, hints keep coming
  → turn ends when time runs out or everyone guesses correctly

After all players have drawn:
  → scoreboard, bragging rights, back to lobby
```

---

## Features

- ✏️ Real-time collaborative canvas with smooth stroke rendering
- 💬 Live chat with server-side guess validation and masking
- 🔤 Progressive hint reveals as the turn timer runs down
- 🏆 Turn-by-turn scoring with a live scoreboard
- 🔒 Private rooms with a 6-character invite code
- 🌐 Public room auto-matching
- 👑 Host migration if the host disconnects
- 🔄 Reconnect support — rejoin mid-game and catch up on the canvas

---


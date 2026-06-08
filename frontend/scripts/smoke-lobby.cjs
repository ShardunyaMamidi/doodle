/* eslint-disable */
// Headless end-to-end check of the Sprint 1 lobby contract against the real backend.
// Exercises: create->reconnect flow, join flow, the sessionId tweak, live player
// list updates, and host migration on disconnect.
const SockJS = require('sockjs-client');
const { Client } = require('@stomp/stompjs');

const BASE = 'http://localhost:8080';
const WS = `${BASE}/ws-doodle`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
}

function connectStomp(name) {
  return new Promise((resolve, reject) => {
    const client = new Client({
      webSocketFactory: () => new SockJS(WS),
      reconnectDelay: 0,
      onConnect: () => resolve(client),
      onStompError: (f) => reject(new Error(`${name} STOMP error: ${f.body}`)),
    });
    client.activate();
  });
}

function sub(client, dest, bag, key) {
  client.subscribe(dest, (m) => {
    bag[key] = bag[key] || [];
    bag[key].push(JSON.parse(m.body));
  });
}

(async () => {
  // --- Client A creates a room over REST ---
  const createRes = await fetch(`${BASE}/api/rooms/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerName: 'Alice', avatarId: 1, isPublic: false }),
  }).then((r) => r.json());
  check('REST create returns roomId/roomCode/reconnectToken',
    !!createRes.roomId && !!createRes.roomCode && !!createRes.reconnectToken);
  const roomId = createRes.roomId;

  // --- A connects, subscribes, then RECONNECTS (rebinds temp host session) ---
  const a = await connectStomp('A');
  const aBag = {};
  sub(a, `/topic/room/${roomId}/state`, aBag, 'state');
  sub(a, `/user/queue/room/${roomId}/sync`, aBag, 'sync');
  sub(a, `/user/queue/room/${roomId}/token`, aBag, 'token');
  await wait(150);
  a.publish({ destination: `/app/room/${roomId}/reconnect`, body: JSON.stringify({ reconnectToken: createRes.reconnectToken }) });
  await wait(400);

  check('A token carries its own sessionId (backend tweak)',
    aBag.token?.[0]?.sessionId != null);
  const aSession = aBag.token?.[0]?.sessionId;
  check('A receives private /sync with LOBBY state',
    aBag.sync?.[0]?.state === 'LOBBY');
  check('A sync shows exactly 1 player (no duplicate host)',
    aBag.sync?.[0]?.payload?.players?.length === 1);
  check('A is the host', aBag.sync?.[0]?.payload?.hostSessionId === aSession);

  // --- Client B joins by the same room ---
  const b = await connectStomp('B');
  const bBag = {};
  sub(b, `/topic/room/${roomId}/state`, bBag, 'state');
  sub(b, `/user/queue/room/${roomId}/token`, bBag, 'token');
  await wait(150);
  b.publish({ destination: `/app/room/${roomId}/join`, body: JSON.stringify({ playerName: 'Bob', avatarId: 2 }) });
  await wait(400);

  check('B token carries its own sessionId', bBag.token?.[0]?.sessionId != null);
  const bSession = bBag.token?.[0]?.sessionId;

  const lastA = aBag.state?.[aBag.state.length - 1];
  check('A sees a broadcast LOBBY with 2 players after B joins',
    lastA?.state === 'LOBBY' && lastA?.payload?.players?.length === 2);
  check('A and B have distinct session ids', aSession && bSession && aSession !== bSession);

  // --- Host migration: A disconnects, B should become host ---
  await a.deactivate();
  await wait(500);
  const lastB = bBag.state?.[bBag.state.length - 1];
  check('B sees updated lobby after A disconnects',
    lastB?.state === 'LOBBY');
  check('Host migrated to B', lastB?.payload?.hostSessionId === bSession);
  const aEntry = lastB?.payload?.players?.find((p) => p.sessionId === aSession);
  check('A now shows as disconnected (connected=false)', aEntry?.connected === false);

  await b.deactivate();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

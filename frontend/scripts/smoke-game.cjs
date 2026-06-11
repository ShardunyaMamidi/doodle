/* eslint-disable */
// Headless end-to-end check of the Sprint 2 game flow against the real backend:
// start -> WORD_SELECTION -> private word-choices(4) -> DRAWING(blanks) ->
// correct guess -> correct ChatEvent -> TURN_END(revealed word + scoreboard).
const SockJS = require('sockjs-client');
const { Client } = require('@stomp/stompjs');

const BASE = process.env.DOODLE_BASE || 'http://localhost:8080';
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
    (bag[key] ||= []).push(JSON.parse(m.body));
  });
}
const last = (arr) => (arr && arr.length ? arr[arr.length - 1] : undefined);

(async () => {
  const createRes = await fetch(`${BASE}/api/rooms/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerName: 'Alice', avatarId: 1, isPublic: false }),
  }).then((r) => r.json());
  const roomId = createRes.roomId;

  // Host A: create -> reconnect
  const a = await connectStomp('A');
  const aBag = {};
  sub(a, `/topic/room/${roomId}/state`, aBag, 'state');
  sub(a, `/topic/room/${roomId}/chat`, aBag, 'chat');
  sub(a, `/topic/room/${roomId}/draw`, aBag, 'draw');
  sub(a, `/user/queue/room/${roomId}/sync`, aBag, 'sync');
  sub(a, `/user/queue/room/${roomId}/token`, aBag, 'token');
  sub(a, `/user/queue/room/${roomId}/word-choices`, aBag, 'wc');
  await wait(150);
  a.publish({ destination: `/app/room/${roomId}/reconnect`, body: JSON.stringify({ reconnectToken: createRes.reconnectToken }) });
  await wait(300);
  const aSession = aBag.token?.[0]?.sessionId;

  // Guesser B: join
  const b = await connectStomp('B');
  const bBag = {};
  sub(b, `/topic/room/${roomId}/state`, bBag, 'state');
  sub(b, `/topic/room/${roomId}/chat`, bBag, 'chat');
  sub(b, `/topic/room/${roomId}/draw`, bBag, 'draw');
  sub(b, `/user/queue/room/${roomId}/token`, bBag, 'token');
  sub(b, `/user/queue/room/${roomId}/word-choices`, bBag, 'wc');
  await wait(150);
  b.publish({ destination: `/app/room/${roomId}/join`, body: JSON.stringify({ playerName: 'Bob', avatarId: 2 }) });
  await wait(300);
  const bSession = bBag.token?.[0]?.sessionId;

  // Host starts the game
  a.publish({ destination: `/app/room/${roomId}/start`, body: '{}' });
  await wait(400);

  const aWordSel = (aBag.state || []).find((e) => e.state === 'WORD_SELECTION');
  check('WORD_SELECTION broadcast received', !!aWordSel);
  check('WORD_SELECTION carries drawerName (no word)', !!aWordSel?.payload?.drawerName && aWordSel?.payload?.word === undefined);

  // Exactly one client is the drawer (got private word-choices with 4 words)
  const aIsDrawer = !!aBag.wc?.length;
  const bIsDrawer = !!bBag.wc?.length;
  check('exactly one client received private word-choices', aIsDrawer !== bIsDrawer);
  const drawer = aIsDrawer ? { c: a, bag: aBag, id: aSession } : { c: b, bag: bBag, id: bSession };
  const guesser = aIsDrawer ? { c: b, bag: bBag, id: bSession } : { c: a, bag: aBag, id: aSession };
  const choices = drawer.bag.wc[0].words;
  check('word-choices contains 4 options', Array.isArray(choices) && choices.length === 4);

  // Drawer picks the first word
  drawer.c.publish({ destination: `/app/room/${roomId}/word-choice`, body: JSON.stringify({ choiceIndex: 0 }) });
  await wait(400);
  const chosenWord = choices[0];

  const drawingEvt = (drawer.bag.state || []).find((e) => e.state === 'DRAWING' && e.payload?.drawerSessionId);
  check('DRAWING broadcast with blanks + drawerSessionId', !!drawingEvt && typeof drawingEvt.payload.wordBlanks === 'string');
  check('DRAWING drawerSessionId matches the drawer', drawingEvt?.payload?.drawerSessionId === drawer.id);
  check('DRAWING does not leak the word (blanks only)', drawingEvt?.payload?.wordBlanks?.includes('_'));

  // ── Drawing: streamed stroke (strokeId + normalized coords) reaches the guesser ──
  drawer.c.publish({
    destination: `/app/room/${roomId}/draw`,
    body: JSON.stringify({ type: 'stroke', strokeId: 's-1', color: '#000000', lineWidth: 4, points: [[0.1, 0.1, 0.5], [0.2, 0.2, 0.5]] }),
  });
  await wait(200);
  const gStroke = (guesser.bag.draw || []).find((d) => d.type === 'stroke');
  check('guesser receives the drawer stroke', !!gStroke);
  check('stroke carries the strokeId (reassembly)', gStroke?.strokeId === 's-1');
  check('stroke coords round-trip as normalized 0..1', JSON.stringify(gStroke?.points) === JSON.stringify([[0.1, 0.1, 0.5], [0.2, 0.2, 0.5]]));

  // Non-drawer draw messages are ignored by the backend.
  const drawCountBefore = (drawer.bag.draw || []).length;
  guesser.c.publish({
    destination: `/app/room/${roomId}/draw`,
    body: JSON.stringify({ type: 'stroke', strokeId: 'hax', color: '#f00', lineWidth: 9, points: [[0.5, 0.5, 0.5]] }),
  });
  await wait(200);
  check('non-drawer draw is dropped (no broadcast)', (drawer.bag.draw || []).length === drawCountBefore);

  // Undo propagates to the guesser.
  drawer.c.publish({ destination: `/app/room/${roomId}/draw`, body: JSON.stringify({ type: 'undo' }) });
  await wait(200);
  check('undo reaches the guesser', (guesser.bag.draw || []).some((d) => d.type === 'undo'));

  // Guesser submits the correct word
  guesser.c.publish({ destination: `/app/room/${roomId}/chat`, body: JSON.stringify({ text: chosenWord }) });
  await wait(500);

  const correctMsg = (guesser.bag.chat || []).find((m) => m.type === 'correct');
  check('correct guess produces a "correct" ChatEvent', !!correctMsg);

  // With 2 players (1 drawer + 1 guesser), all guessed -> TURN_END
  const turnEnd = (drawer.bag.state || []).find((e) => e.state === 'TURN_END');
  check('TURN_END reached after all guessed', !!turnEnd);
  check('TURN_END reveals the word', turnEnd?.payload?.word === chosenWord);
  check('TURN_END carries a scoreboard', Array.isArray(turnEnd?.payload?.scoreboard) && turnEnd.payload.scoreboard.length === 2);

  await a.deactivate();
  await b.deactivate();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

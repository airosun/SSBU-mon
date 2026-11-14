// SSBU-mon server: lobby, challenges, random matchmaking, CPU battles, spectating, chat.
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { Battle } = require('./engine/battle.js');
const { validateTeam } = require('./engine/validate.js');
const { chooseAction, randomTeam } = require('./engine/ai.js');
const MOVES = require('../shared/moves.js');
const FIGHTERS = require('../shared/fighters.json');
const DEX = require('../shared/dex.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/shared/dex.js', (req, res) => res.sendFile(path.join(__dirname, '..', 'shared', 'dex.js')));
const dexPayload = JSON.stringify({ fighters: FIGHTERS, moves: MOVES, items: DEX.ITEMS, natures: DEX.NATURES, types: DEX.TYPES, chart: DEX.CHART, eviolite: DEX.EVIOLITE_USERS });
app.get('/api/dex', (req, res) => { res.type('json').send(dexPayload); });
app.get('/healthz', (req, res) => res.send('ok'));

// ---------------- state ----------------
const users = new Map();      // clientId -> { id, name, sockets:Set, battles:Set, searching:null|team, lastSeen }
const battles = new Map();    // battleId -> { battle, players:[clientId|'cpu', ...], spectators:Set(socketId), chat:[], created, format }
const challenges = new Map(); // `${from}->${to}` -> { from, to, team }
const lobbyChat = [];
let searchQueue = [];         // clientIds

const clean = s => String(s || '').replace(/[<>]/g, '').trim().slice(0, 24);
const userList = () => [...users.values()].filter(u => u.sockets.size).map(u => ({ id: u.id, name: u.name, searching: !!u.searching }));
const battleList = () => [...battles.entries()].filter(([, b]) => !b.battle.ended).map(([id, b]) => ({ id, p1: b.battle.sides[0].name, p2: b.battle.sides[1].name, turn: b.battle.turn }));
function broadcastLobby() { io.to('lobby').emit('lobby', { users: userList(), battles: battleList() }); }
function emitTo(clientId, ev, data) { const u = users.get(clientId); if (u) for (const sid of u.sockets) io.to(sid).emit(ev, data); }

// ---------------- battles ----------------
function startBattle(players) {
  // players: [{ clientId|'cpu', name, team }]
  const id = Math.random().toString(36).slice(2, 10);
  const entry = { players: players.map(p => p.clientId), spectators: new Set(), chat: [], created: Date.now() };
  entry.battle = new Battle({ id, players: players.map(p => ({ name: p.name, team: p.team })), onUpdate: () => onBattleUpdate(id) });
  battles.set(id, entry);
  for (const p of players) if (p.clientId !== 'cpu') { const u = users.get(p.clientId); if (u) u.battles.add(id); }
  onBattleUpdate(id);
  broadcastLobby();
  return id;
}
function battlePayload(id, perspective) {
  const e = battles.get(id); const b = e.battle;
  const p = perspective === null ? 0 : perspective;
  return {
    id, you: perspective, state: b.publicState(p), log: b.log,
    request: perspective === null ? null : b.getRequest(perspective), chat: e.chat,
    players: e.players.map((cid, i) => ({ name: b.sides[i].name, cpu: cid === 'cpu' })),
  };
}
function onBattleUpdate(id) {
  const e = battles.get(id); if (!e) return;
  const b = e.battle;
  e.players.forEach((cid, i) => {
    if (cid === 'cpu') {
      const req = b.getRequest(i);
      if (['preview', 'move', 'switch'].includes(req.kind) && !e.cpuPending) {
        e.cpuPending = true;
        setTimeout(() => { e.cpuPending = false; if (!b.ended) { const c = chooseAction(b, i); if (c) b.choose(i, c); } }, 450);
      }
    } else emitTo(cid, 'battle', battlePayload(id, i));
  });
  for (const sid of e.spectators) io.to(sid).emit('battle', battlePayload(id, null));
  if (b.ended && !e.endedAt) { e.endedAt = Date.now(); broadcastLobby(); }
}
function sideOf(e, clientId) { return e.players.indexOf(clientId); }

// clean up finished battles and stale users
setInterval(() => {
  const now = Date.now();
  for (const [id, e] of battles) {
    if (e.endedAt && now - e.endedAt > 15 * 60 * 1000) battles.delete(id);
    // auto-forfeit players disconnected for 2+ minutes
    if (!e.battle.ended) e.players.forEach((cid, i) => {
      if (cid === 'cpu') return;
      const u = users.get(cid);
      if (u && !u.sockets.size && now - u.lastSeen > 120000) e.battle.forfeit(i);
    });
  }
}, 15000);

// ---------------- sockets ----------------
io.on('connection', socket => {
  let me = null;
  socket.on('hello', ({ clientId, name }) => {
    clientId = String(clientId || '').slice(0, 40) || socket.id;
    me = users.get(clientId);
    if (!me) { me = { id: clientId, name: clean(name) || 'Guest' + Math.floor(Math.random() * 9000 + 1000), sockets: new Set(), battles: new Set(), searching: null }; users.set(clientId, me); }
    else if (clean(name)) me.name = clean(name);
    me.sockets.add(socket.id); me.lastSeen = Date.now();
    socket.join('lobby');
    socket.emit('welcome', { id: me.id, name: me.name, chat: lobbyChat.slice(-50) });
    for (const bid of me.battles) if (battles.has(bid)) { const e = battles.get(bid); socket.emit('battle', battlePayload(bid, sideOf(e, me.id))); }
    broadcastLobby();
  });
  const need = fn => (...args) => { if (me) fn(...args); };

  socket.on('rename', need(name => { const n = clean(name); if (n) { me.name = n; socket.emit('welcome', { id: me.id, name: me.name }); broadcastLobby(); } }));
  socket.on('chat', need(({ room, text }) => {
    text = String(text || '').slice(0, 300).trim(); if (!text) return;
    const msg = { name: me.name, text, t: Date.now() };
    if (room === 'lobby') { lobbyChat.push(msg); if (lobbyChat.length > 200) lobbyChat.shift(); io.to('lobby').emit('chat', { room, msg }); }
    else if (battles.has(room)) {
      const e = battles.get(room);
      e.battle.log.push({ cls: 'chat', text: `${me.name}: ${text}` });
      onBattleUpdate(room);
    }
  }));

  socket.on('cpu', need(({ team }, ack) => {
    const v = validateTeam(team);
    if (!v.ok) return ack && ack({ error: v.errors.join('\n') });
    const cpuTeam = validateTeam(randomTeam()).team;
    const id = startBattle([{ clientId: me.id, name: me.name, team: v.team }, { clientId: 'cpu', name: 'CPU', team: cpuTeam }]);
    ack && ack({ id });
  }));

  socket.on('search', need(({ team }, ack) => {
    const v = validateTeam(team);
    if (!v.ok) return ack && ack({ error: v.errors.join('\n') });
    searchQueue = searchQueue.filter(id => id !== me.id && users.get(id) && users.get(id).searching && users.get(id).sockets.size);
    if (searchQueue.length) {
      const oppId = searchQueue.shift(); const opp = users.get(oppId);
      const oppTeam = opp.searching; opp.searching = null;
      const id = startBattle([{ clientId: opp.id, name: opp.name, team: oppTeam }, { clientId: me.id, name: me.name, team: v.team }]);
      emitTo(opp.id, 'searchStatus', { searching: false });
      ack && ack({ id });
    } else {
      me.searching = v.team; searchQueue.push(me.id);
      ack && ack({ searching: true });
    }
    broadcastLobby();
  }));
  socket.on('cancelSearch', need(() => { me.searching = null; searchQueue = searchQueue.filter(id => id !== me.id); socket.emit('searchStatus', { searching: false }); broadcastLobby(); }));

  socket.on('challenge', need(({ to, team }, ack) => {
    const target = users.get(to);
    if (!target || to === me.id) return ack && ack({ error: 'That player is not online.' });
    const v = validateTeam(team);
    if (!v.ok) return ack && ack({ error: v.errors.join('\n') });
    challenges.set(`${me.id}->${to}`, { from: me.id, to, team: v.team });
    emitTo(to, 'challenged', { from: me.id, name: me.name });
    ack && ack({ ok: true });
  }));
  socket.on('cancelChallenge', need(({ to }) => { challenges.delete(`${me.id}->${to}`); emitTo(to, 'challengeCancelled', { from: me.id }); }));
  socket.on('respond', need(({ from, accept, team }, ack) => {
    const key = `${from}->${me.id}`; const ch = challenges.get(key);
    if (!ch) return ack && ack({ error: 'That challenge is no longer available.' });
    if (!accept) { challenges.delete(key); emitTo(from, 'challengeDeclined', { by: me.name }); return ack && ack({ ok: true }); }
    const v = validateTeam(team);
    if (!v.ok) return ack && ack({ error: v.errors.join('\n') });
    challenges.delete(key);
    const opp = users.get(from);
    const id = startBattle([{ clientId: from, name: opp ? opp.name : 'Player', team: ch.team }, { clientId: me.id, name: me.name, team: v.team }]);
    ack && ack({ id });
  }));

  socket.on('choose', need(({ id, choice }, ack) => {
    const e = battles.get(id); if (!e) return ack && ack({ error: 'Battle not found.' });
    const side = sideOf(e, me.id); if (side < 0) return ack && ack({ error: 'You are not in this battle.' });
    const err = e.battle.choose(side, choice || {});
    ack && ack(err ? { error: err } : { ok: true });
  }));
  socket.on('undo', need(({ id }) => {
    const e = battles.get(id); if (!e) return;
    const side = sideOf(e, me.id); if (side < 0) return;
    const s = e.battle.sides[side];
    if (s.choice && !e.battle.sides[1 - side].choice && e.battle.phase === 'move') { s.choice = null; onBattleUpdate(id); }
  }));
  socket.on('forfeit', need(({ id }) => {
    const e = battles.get(id); if (!e) return;
    const side = sideOf(e, me.id); if (side >= 0) e.battle.forfeit(side);
  }));
  socket.on('spectate', need(({ id }, ack) => {
    const e = battles.get(id); if (!e) return ack && ack({ error: 'Battle not found.' });
    const side = sideOf(e, me.id);
    if (side >= 0) { socket.emit('battle', battlePayload(id, side)); return ack && ack({ ok: true }); }
    e.spectators.add(socket.id); socket.emit('battle', battlePayload(id, null)); ack && ack({ ok: true });
  }));
  socket.on('leaveBattle', need(({ id }) => {
    const e = battles.get(id); if (!e) return;
    e.spectators.delete(socket.id);
    if (e.battle.ended) me.battles.delete(id);
  }));

  socket.on('disconnect', () => {
    if (!me) return;
    me.sockets.delete(socket.id); me.lastSeen = Date.now();
    for (const e of battles.values()) e.spectators.delete(socket.id);
    if (!me.sockets.size) { me.searching = null; searchQueue = searchQueue.filter(id => id !== me.id); }
    broadcastLobby();
  });
});

server.listen(PORT, () => console.log(`SSBU-mon running on http://localhost:${PORT}`));

// SSBU-mon server: lobby, challenges, matchmaking queues, CPU matches, spectating, chat, Fighter Pass.
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { Match } = require('./match.js');
const { validateEliteTeam } = require('./engine/validate.js');
const { verify, genFighter } = require('./engine/roster.js');
const AI = require('./engine/ai.js');
const Pass = require('./pass.js');
const MOVES = require('../shared/moves.js');
const FIGHTERS = require('../shared/fighters.json');
const DEX = require('../shared/dex.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '..', 'public')));
for (const f of ['dex.js', 'movetext.js']) app.get('/shared/' + f, (req, res) => res.sendFile(path.join(__dirname, '..', 'shared', f)));
const dexPayload = JSON.stringify({ fighters: FIGHTERS, moves: MOVES, items: DEX.ITEMS, natures: DEX.NATURES, types: DEX.TYPES, chart: DEX.CHART, eviolite: DEX.EVIOLITE_USERS, pass: { perDay: Pass.ROLLS_PER_DAY, keep: Pass.KEEP_PER_ROLL } });
app.get('/api/dex', (req, res) => res.type('json').send(dexPayload));
app.get('/healthz', (req, res) => res.send('ok'));

// ---------------- state ----------------
const users = new Map();     // clientId -> { id, name, sockets:Set, matches:Set, searching:null|{key, team}, lastSeen }
const matches = new Map();   // id -> { match, players:[clientId|'cpu'], spectators:Set(socketId), endedAt }
const challenges = new Map(); // `${from}->${to}` -> { from, to, mode, format, team }
const queues = new Map();    // `${mode}:${format}` -> [clientId]
const lobbyChat = [];

const MODES = ['standard', 'elite'], FORMATS = ['singles', 'doubles'];
const LABEL = { standard: 'Standard', elite: 'Elite Smash', singles: 'Singles', doubles: 'Doubles' };
const clean = s => String(s || '').replace(/[<>]/g, '').trim().slice(0, 24);
const userList = () => [...users.values()].filter(u => u.sockets.size).map(u => ({ id: u.id, name: u.name, searching: u.searching ? u.searching.key : null }));
const matchList = () => [...matches.entries()].filter(([, e]) => !e.match.ended).map(([id, e]) => ({ id, p1: e.match.players[0].name, p2: e.match.players[1].name, mode: e.match.mode, format: e.match.format, phase: e.match.phase, turn: e.match.battle ? e.match.battle.turn : 0 }));
function broadcastLobby() { io.to('lobby').emit('lobby', { users: userList(), matches: matchList() }); }
function emitTo(clientId, ev, data) { const u = users.get(clientId); if (u) for (const sid of u.sockets) io.to(sid).emit(ev, data); }

function checkMode(mode, format) { return MODES.includes(mode) && FORMATS.includes(format); }
function prepTeam(mode, team) {
  if (mode !== 'elite') return { ok: true, team: null };
  return validateEliteTeam(team, verify);
}

// ---------------- matches ----------------
function startMatch(mode, format, players) {
  const id = Math.random().toString(36).slice(2, 10);
  const entry = { players: players.map(p => p.clientId), spectators: new Set(), endedAt: null };
  matches.set(id, entry);
  for (const p of players) if (p.clientId !== 'cpu') { const u = users.get(p.clientId); if (u) { u.matches.add(id); u.searching = null; } }
  entry.match = new Match({
    id, mode, format,
    players: players.map(p => ({ id: p.clientId, name: p.name, cpu: p.clientId === 'cpu', team: p.team })),
    onUpdate: () => onMatchUpdate(id),
  });
  onMatchUpdate(id);
  broadcastLobby();
  return id;
}
function onMatchUpdate(id) {
  const e = matches.get(id); if (!e || !e.match) return;
  e.players.forEach((cid, i) => { if (cid !== 'cpu') emitTo(cid, 'match', e.match.view(i)); });
  for (const sid of e.spectators) io.to(sid).emit('match', e.match.view(null));
  if (e.match.ended && !e.endedAt) { e.endedAt = Date.now(); broadcastLobby(); }
}
function cpuEliteTeam(format) {
  const pool = FIGHTERS.slice().sort(() => Math.random() - 0.5).slice(0, 6).map(f => genFighter(f));
  const builds = AI.buildTeam(pool, format === 'doubles');
  return pool.map((b, i) => Object.assign({}, b, builds[i]));
}

setInterval(() => {
  const now = Date.now();
  for (const [id, e] of matches) {
    if (e.endedAt && now - e.endedAt > 15 * 60 * 1000) { matches.delete(id); continue; }
    if (!e.match.ended) e.players.forEach((cid, i) => {
      if (cid === 'cpu') return;
      const u = users.get(cid);
      if (u && !u.sockets.size && now - u.lastSeen > 180000) e.match.forfeit(i);
    });
  }
}, 15000);

// ---------------- sockets ----------------
io.on('connection', socket => {
  let me = null;
  socket.on('hello', ({ clientId, name }) => {
    clientId = String(clientId || '').slice(0, 40) || socket.id;
    me = users.get(clientId);
    if (!me) { me = { id: clientId, name: clean(name) || 'Guest' + Math.floor(Math.random() * 9000 + 1000), sockets: new Set(), matches: new Set(), searching: null }; users.set(clientId, me); }
    else if (clean(name)) me.name = clean(name);
    me.sockets.add(socket.id); me.lastSeen = Date.now();
    socket.join('lobby');
    socket.emit('welcome', { id: me.id, name: me.name, chat: lobbyChat.slice(-50), pass: Pass.status(me.id) });
    for (const mid of me.matches) { const e = matches.get(mid); if (e) socket.emit('match', e.match.view(e.players.indexOf(me.id))); }
    broadcastLobby();
  });
  const need = fn => (...args) => { if (me) fn(...args); };
  const reply = (ack, data) => typeof ack === 'function' && ack(data);

  socket.on('rename', need(name => { const n = clean(name); if (n) { me.name = n; socket.emit('welcome', { id: me.id, name: me.name }); broadcastLobby(); } }));
  socket.on('chat', need(({ room, text }) => {
    text = String(text || '').slice(0, 300).trim(); if (!text) return;
    if (room === 'lobby') {
      const msg = { name: me.name, text, t: Date.now() };
      lobbyChat.push(msg); if (lobbyChat.length > 200) lobbyChat.shift();
      io.to('lobby').emit('chat', { room, msg });
    } else if (matches.has(room)) {
      const m = matches.get(room).match;
      (m.battle ? m.battle.log : m.log).push({ cls: 'chat', text: `${me.name}: ${text}` });
      onMatchUpdate(room);
    }
  }));

  // ----- Fighter Pass -----
  socket.on('pass:status', need((_, ack) => reply(ack, Pass.status(me.id))));
  socket.on('pass:roll', need((_, ack) => reply(ack, Pass.roll(me.id))));
  socket.on('pass:claim', need(({ uids }, ack) => reply(ack, Pass.claim(me.id, uids))));

  // ----- starting matches -----
  socket.on('cpu', need(({ mode, format, team }, ack) => {
    if (!checkMode(mode, format)) return reply(ack, { error: 'Unknown mode.' });
    const v = prepTeam(mode, team); if (!v.ok) return reply(ack, { error: v.errors.join('\n') });
    const id = startMatch(mode, format, [{ clientId: me.id, name: me.name, team: v.team }, { clientId: 'cpu', name: 'CPU', team: mode === 'elite' ? cpuEliteTeam(format) : null }]);
    reply(ack, { id });
  }));
  socket.on('search', need(({ mode, format, team }, ack) => {
    if (!checkMode(mode, format)) return reply(ack, { error: 'Unknown mode.' });
    const v = prepTeam(mode, team); if (!v.ok) return reply(ack, { error: v.errors.join('\n') });
    const key = `${mode}:${format}`;
    for (const q of queues.values()) { const i = q.indexOf(me.id); if (i >= 0) q.splice(i, 1); }
    const q = (queues.get(key) || []).filter(id => { const u = users.get(id); return id !== me.id && u && u.sockets.size && u.searching && u.searching.key === key; });
    queues.set(key, q);
    if (q.length) {
      const opp = users.get(q.shift());
      const oppTeam = opp.searching.team; opp.searching = null;
      emitTo(opp.id, 'searchStatus', { searching: null });
      const id = startMatch(mode, format, [{ clientId: opp.id, name: opp.name, team: oppTeam }, { clientId: me.id, name: me.name, team: v.team }]);
      reply(ack, { id });
    } else { me.searching = { key, team: v.team }; q.push(me.id); reply(ack, { searching: key }); }
    broadcastLobby();
  }));
  socket.on('cancelSearch', need(() => {
    for (const q of queues.values()) { const i = q.indexOf(me.id); if (i >= 0) q.splice(i, 1); }
    me.searching = null; socket.emit('searchStatus', { searching: null }); broadcastLobby();
  }));
  socket.on('challenge', need(({ to, mode, format, team }, ack) => {
    const target = users.get(to);
    if (!target || to === me.id || !target.sockets.size) return reply(ack, { error: 'That player is not online.' });
    if (!checkMode(mode, format)) return reply(ack, { error: 'Unknown mode.' });
    const v = prepTeam(mode, team); if (!v.ok) return reply(ack, { error: v.errors.join('\n') });
    challenges.set(`${me.id}->${to}`, { from: me.id, to, mode, format, team: v.team });
    emitTo(to, 'challenged', { from: me.id, name: me.name, mode, format, label: `${LABEL[mode]} ${LABEL[format]}` });
    reply(ack, { ok: true });
  }));
  socket.on('cancelChallenge', need(({ to }) => { challenges.delete(`${me.id}->${to}`); emitTo(to, 'challengeCancelled', { from: me.id }); }));
  socket.on('respond', need(({ from, accept, team }, ack) => {
    const key = `${from}->${me.id}`; const ch = challenges.get(key);
    if (!ch) return reply(ack, { error: 'That challenge is no longer available.' });
    if (!accept) { challenges.delete(key); emitTo(from, 'challengeDeclined', { by: me.name }); return reply(ack, { ok: true }); }
    const v = prepTeam(ch.mode, team); if (!v.ok) return reply(ack, { error: v.errors.join('\n') });
    challenges.delete(key);
    const opp = users.get(from);
    const id = startMatch(ch.mode, ch.format, [{ clientId: from, name: opp ? opp.name : 'Player', team: ch.team }, { clientId: me.id, name: me.name, team: v.team }]);
    emitTo(from, 'challengeAccepted', {});
    reply(ack, { id });
  }));

  // ----- in a match -----
  socket.on('act', need(({ id, action }, ack) => {
    const e = matches.get(id); if (!e) return reply(ack, { error: 'Match not found.' });
    const n = e.players.indexOf(me.id); if (n < 0) return reply(ack, { error: 'You are not in this match.' });
    const err = e.match.act(n, action || {});
    reply(ack, err ? { error: err } : { ok: true });
  }));
  socket.on('spectate', need(({ id }, ack) => {
    const e = matches.get(id); if (!e) return reply(ack, { error: 'Match not found.' });
    const n = e.players.indexOf(me.id);
    if (n >= 0) socket.emit('match', e.match.view(n));
    else { e.spectators.add(socket.id); socket.emit('match', e.match.view(null)); }
    reply(ack, { ok: true });
  }));
  socket.on('leave', need(({ id }) => {
    const e = matches.get(id); if (!e) return;
    e.spectators.delete(socket.id);
    if (e.match.ended) me.matches.delete(id);
  }));

  socket.on('disconnect', () => {
    if (!me) return;
    me.sockets.delete(socket.id); me.lastSeen = Date.now();
    for (const e of matches.values()) e.spectators.delete(socket.id);
    if (!me.sockets.size) { me.searching = null; for (const q of queues.values()) { const i = q.indexOf(me.id); if (i >= 0) q.splice(i, 1); } }
    broadcastLobby();
  });
});

server.listen(PORT, () => console.log(`SSBU-mon running on http://localhost:${PORT}`));

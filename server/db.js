// Storage for accounts, sessions, saved rosters/teams and Fighter Pass rolls.
// With DATABASE_URL set (e.g. a free Neon Postgres) everything is stored in Postgres and survives
// restarts. Without it (local dev, tests) it falls back to memory plus a best-effort data/db.json file,
// which a Render free instance loses on every restart.
const fs = require('fs');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  username_lc TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS user_data (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pass_state (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL
);`;

function postgresStore(url) {
  const { Pool } = require('pg');
  const local = /localhost|127\.0\.0\.1|\/var\/run|host=\//.test(url);
  const pool = new Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: true }, max: 5 });
  const q = (text, params) => pool.query(text, params);
  const one = async (text, params) => (await q(text, params)).rows[0] || null;
  return {
    kind: 'postgres',
    async init() { await q(SCHEMA); await q('DELETE FROM sessions WHERE expires_at < now()'); },
    async createUser(username, passHash) {
      try { return await one('INSERT INTO users (username, username_lc, pass_hash) VALUES ($1, $2, $3) RETURNING id, username', [username, username.toLowerCase(), passHash]); }
      catch (e) { if (e.code === '23505') return null; throw e; }
    },
    getUserByName: name => one('SELECT id, username, pass_hash FROM users WHERE username_lc = $1', [name.toLowerCase()]),
    async createSession(tokenHash, userId, expires) { await q('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [tokenHash, userId, expires]); },
    getSession: tokenHash => one('SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()', [tokenHash]),
    async deleteSession(tokenHash) { await q('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]); },
    async setPassword(userId, passHash) { await q('UPDATE users SET pass_hash = $2 WHERE id = $1', [userId, passHash]); await q('DELETE FROM sessions WHERE user_id = $1', [userId]); },
    async getData(userId) { const r = await one('SELECT data, version FROM user_data WHERE user_id = $1', [userId]); return r ? { data: r.data, version: r.version } : { data: null, version: 0 }; },
    // optimistic concurrency: only writes when the caller saw the latest version; returns the new version or null
    async setData(userId, data, version) {
      if (version === 0) {
        const r = await one('INSERT INTO user_data (user_id, data, version) VALUES ($1, $2, 1) ON CONFLICT (user_id) DO NOTHING RETURNING version', [userId, data]);
        return r ? r.version : null;
      }
      const r = await one('UPDATE user_data SET data = $2, version = version + 1, updated_at = now() WHERE user_id = $1 AND version = $3 RETURNING version', [userId, data, version]);
      return r ? r.version : null;
    },
    async getPass(key) { const r = await one('SELECT data FROM pass_state WHERE key = $1', [key]); return r ? r.data : null; },
    async setPass(key, data) { await q('INSERT INTO pass_state (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data', [key, data]); },
    async close() { await pool.end(); },
  };
}

function memoryStore(file) {
  let s = { users: [], sessions: {}, data: {}, pass: {}, nextId: 1 };
  if (file) { try { s = Object.assign(s, JSON.parse(fs.readFileSync(file, 'utf8'))); } catch {} }
  let timer = null;
  const save = () => {
    if (!file) return;
    clearTimeout(timer);
    timer = setTimeout(() => { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(s)); } catch {} }, 300);
  };
  const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
  return {
    kind: 'memory',
    async init() {},
    async createUser(username, passHash) {
      if (s.users.some(u => u.username_lc === username.toLowerCase())) return null;
      const u = { id: s.nextId++, username, username_lc: username.toLowerCase(), pass_hash: passHash };
      s.users.push(u); save(); return { id: u.id, username };
    },
    async getUserByName(name) { const u = s.users.find(x => x.username_lc === name.toLowerCase()); return u ? { id: u.id, username: u.username, pass_hash: u.pass_hash } : null; },
    async createSession(tokenHash, userId, expires) { s.sessions[tokenHash] = { userId, expires: +expires }; save(); },
    async getSession(tokenHash) {
      const x = s.sessions[tokenHash]; if (!x || x.expires < Date.now()) return null;
      const u = s.users.find(y => y.id === x.userId); return u ? { id: u.id, username: u.username } : null;
    },
    async deleteSession(tokenHash) { delete s.sessions[tokenHash]; save(); },
    async setPassword(userId, passHash) {
      const u = s.users.find(y => y.id === userId); if (u) u.pass_hash = passHash;
      for (const [k, v] of Object.entries(s.sessions)) if (v.userId === userId) delete s.sessions[k];
      save();
    },
    async getData(userId) { const r = s.data[userId]; return r ? { data: clone(r.data), version: r.version } : { data: null, version: 0 }; },
    async setData(userId, data, version) {
      const r = s.data[userId];
      if ((r ? r.version : 0) !== version) return null;
      s.data[userId] = { data: clone(data), version: version + 1 }; save(); return version + 1;
    },
    async getPass(key) { return clone(s.pass[key] || null); },
    async setPass(key, data) { s.pass[key] = clone(data); save(); },
    async close() {},
  };
}

function createStore(opts = {}) {
  const url = opts.url !== undefined ? opts.url : process.env.DATABASE_URL;
  if (url) return postgresStore(url);
  return memoryStore(opts.file !== undefined ? opts.file : path.join(__dirname, '..', 'data', 'db.json'));
}

module.exports = { createStore };

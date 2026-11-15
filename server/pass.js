// Fighter Pass: 3 rolls per day (US Eastern day). Each roll shows 20 random fighters; the player keeps up to 5.
// Rolls are tracked per browser id. Until accounts exist this lives in memory with a best-effort file copy,
// so a server restart can reset the day's counts.
const fs = require('fs');
const path = require('path');
const { rollPool, sign } = require('./engine/roster.js');

const ROLLS_PER_DAY = 3;
const KEEP_PER_ROLL = 5;
const FILE = path.join(__dirname, '..', 'data', 'pass.json');
let state = {};
try { state = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { state = {}; }
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(state)); } catch {} }, 500);
}
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()); }
function entry(clientId) {
  const d = today();
  let e = state[clientId];
  if (!e || e.day !== d) { e = state[clientId] = { day: d, used: 0, pending: e && e.pending ? e.pending : null }; }
  return e;
}

function status(clientId) {
  const e = entry(clientId);
  return { rollsLeft: ROLLS_PER_DAY - e.used, perDay: ROLLS_PER_DAY, keep: KEEP_PER_ROLL, pending: e.pending ? e.pending.fighters : null };
}
function roll(clientId) {
  const e = entry(clientId);
  if (e.pending) return { pending: e.pending.fighters, rollsLeft: ROLLS_PER_DAY - e.used };
  if (e.used >= ROLLS_PER_DAY) return { error: 'No Fighter Pass rolls left today. Come back tomorrow!' };
  e.used++;
  e.pending = { fighters: rollPool(20) };
  save();
  return { pending: e.pending.fighters, rollsLeft: ROLLS_PER_DAY - e.used };
}
function claim(clientId, uids) {
  const e = entry(clientId);
  if (!e.pending) return { error: 'There is no Fighter Pass roll to claim.' };
  uids = [...new Set(uids || [])];
  if (uids.length > KEEP_PER_ROLL) return { error: `You can keep up to ${KEEP_PER_ROLL} fighters.` };
  const chosen = e.pending.fighters.filter(f => uids.includes(f.uid));
  if (chosen.length !== uids.length) return { error: 'Those fighters were not in your roll.' };
  e.pending = null; save();
  return { fighters: chosen.map(sign), rollsLeft: ROLLS_PER_DAY - e.used };
}

module.exports = { status, roll, claim, ROLLS_PER_DAY, KEEP_PER_ROLL };

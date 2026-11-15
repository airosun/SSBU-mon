// Trainer cards: a signed-in player's avatar, title, short bio and a showcased Elite team.
const FIGHTERS = require('../shared/fighters.json');
const { FINAL_SMASHES } = require('../shared/megas.js');
const AVATARS = new Set([...FIGHTERS.map(f => f.id), ...Object.values(FINAL_SMASHES).map(x => x.id)]);
const text = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

// userData: the player's saved roster/teams (already signature-checked)
function sanitizeProfile(input, userData) {
  input = input || {};
  const out = { avatar: AVATARS.has(input.avatar) ? input.avatar : null, title: text(input.title, 32), bio: text(input.bio, 160), favoriteTeam: null };
  const i = input.favoriteTeam;
  const teams = (userData && userData.elite) || [];
  if (Number.isInteger(i) && teams[i]) {
    const byUid = Object.fromEntries(((userData && userData.roster) || []).map(f => [f.uid, f]));
    const mons = teams[i].mons.map(m => byUid[m.uid] && { species: byUid[m.uid].species, gender: m.gender || byUid[m.uid].gender || null, nature: byUid[m.uid].nature, ability: byUid[m.uid].ability, item: m.item, moves: m.moves.filter(Boolean) }).filter(Boolean);
    if (mons.length) out.favoriteTeam = { name: teams[i].name, mons };
  }
  return out;
}

module.exports = { sanitizeProfile, AVATARS };

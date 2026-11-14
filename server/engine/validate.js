const MOVES = require('../../shared/moves.js');
const FIGHTERS = require('../../shared/fighters.json');
const { NATURES, ITEMS, EVIOLITE_USERS } = require('../../shared/dex.js');
const BY_ID = Object.fromEntries(FIGHTERS.map(f => [f.id, f]));
const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

// Returns { ok, team (sanitised), errors[] }
function validateTeam(team) {
  const errors = [];
  if (!Array.isArray(team) || team.length < 1 || team.length > 6) return { ok: false, errors: ['A team needs 1 to 6 fighters.'] };
  const seen = new Set(); const clean = [];
  team.forEach((set, i) => {
    const tag = `Slot ${i + 1}`;
    const f = set && BY_ID[set.species];
    if (!f) { errors.push(`${tag}: unknown fighter.`); return; }
    if (seen.has(f.id)) errors.push(`${tag}: ${f.name} is already on the team (one of each fighter).`);
    seen.add(f.id);
    const abilities = [...f.abilities.map(a => a.name), f.hidden.name];
    const ability = abilities.includes(set.ability) ? set.ability : null;
    if (!ability) errors.push(`${f.name}: choose a valid ability.`);
    let item = set.item || '';
    if (item && !ITEMS[item]) errors.push(`${f.name}: unknown item ${item}.`);
    if (item === 'Eviolite' && !EVIOLITE_USERS.includes(f.id)) errors.push(`${f.name} can't use Eviolite.`);
    const moves = (set.moves || []).filter(Boolean);
    if (moves.length < 1 || moves.length > 4) errors.push(`${f.name}: needs 1 to 4 moves.`);
    if (new Set(moves).size !== moves.length) errors.push(`${f.name}: duplicate moves.`);
    for (const mv of moves) if (!MOVES[mv] || !f.learnset.includes(mv)) errors.push(`${f.name} can't learn ${mv}.`);
    const nature = NATURES[set.nature] ? set.nature : 'Hardy';
    const evs = {}; let total = 0;
    for (const s of STATS) { const v = Math.max(0, Math.min(252, (set.evs && set.evs[s]) | 0)); evs[s] = v; total += v; }
    if (total > 510) errors.push(`${f.name}: EVs total ${total} (max 510).`);
    const ivs = {};
    for (const s of STATS) { const v = set.ivs && set.ivs[s] !== undefined ? set.ivs[s] | 0 : 31; ivs[s] = Math.max(0, Math.min(31, v)); }
    clean.push({ species: f.id, nickname: f.name, ability, item, nature, evs, ivs, moves });
  });
  return { ok: errors.length === 0, team: clean, errors };
}

module.exports = { validateTeam };

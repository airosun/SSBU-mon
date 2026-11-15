// Team legality. Fighters come with a fixed nature, IVs and ability (from a draft pool or the
// Fighter Pass); the player chooses only moves and items. VGC clauses: one of each fighter,
// one of each item.
const MOVES = require('../../shared/moves.js');
const FIGHTERS = require('../../shared/fighters.json');
const { NATURES, ITEMS } = require('../../shared/dex.js');
const { FINAL_SMASHES } = require('../../shared/megas.js');
const BY_ID = Object.fromEntries(FIGHTERS.map(f => [f.id, f]));
const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

// base: { uid, species, nature, ivs, ability }   build: { moves, item }
function buildSet(base, build, errors) {
  const f = BY_ID[base.species];
  if (!f) { errors.push('Unknown fighter.'); return null; }
  const moves = [...new Set((build.moves || []).filter(Boolean))];
  if (moves.length < 1 || moves.length > 4) errors.push(`${f.name}: choose 1 to 4 moves.`);
  for (const mv of moves) if (!MOVES[mv] || !f.learnset.includes(mv)) errors.push(`${f.name} can't learn ${mv}.`);
  const item = build.item || '';
  const fs = FINAL_SMASHES[item];
  if (item && !ITEMS[item] && !fs) errors.push(`${f.name}: unknown item ${item}.`);
  if (fs && fs.base !== f.id) errors.push(`${item} only works for ${BY_ID[fs.base].name}.`);
  if (![...f.abilities.map(a => a.name), f.hidden.name].includes(base.ability)) errors.push(`${f.name}: invalid ability.`);
  if (!NATURES[base.nature]) errors.push(`${f.name}: invalid nature.`);
  const ivs = {};
  for (const s of STATS) { const v = base.ivs ? base.ivs[s] : 31; if (!Number.isInteger(v) || v < 0 || v > 31) errors.push(`${f.name}: invalid IVs.`); ivs[s] = v; }
  return { uid: base.uid, species: f.id, nature: base.nature, ivs, ability: base.ability, item, moves };
}

function checkClauses(sets, errors) {
  const species = new Set(), items = new Set();
  for (const s of sets) {
    if (!s) continue;
    const name = BY_ID[s.species].name;
    if (species.has(s.species)) errors.push(`Only one ${name} allowed per team.`);
    species.add(s.species);
    if (s.item) { if (items.has(s.item)) errors.push(`Item clause: only one ${s.item} per team.`); items.add(s.item); }
  }
}

// Standard: picks are 6 entries from the server-held pool; builds are [{moves, item}]
function validateStandardBuild(poolPicks, builds) {
  const errors = [];
  if (!Array.isArray(builds) || builds.length !== poolPicks.length) return { ok: false, errors: ['Build all 6 fighters.'] };
  const sets = poolPicks.map((base, i) => buildSet(base, builds[i] || {}, errors));
  checkClauses(sets, errors);
  return { ok: !errors.length, errors, team: sets };
}

// Elite: full sets from the player's roster, each carrying the server's signature
function validateEliteTeam(team, verify) {
  const errors = [];
  if (!Array.isArray(team) || team.length !== 6) return { ok: false, errors: ['An Elite Smash team needs exactly 6 fighters.'] };
  const sets = team.map(t => {
    if (!t || !verify(t)) { errors.push(`${(BY_ID[t && t.species] || { name: 'A fighter' }).name} isn't a verified roster fighter.`); return null; }
    return buildSet(t, t, errors);
  });
  checkClauses(sets, errors);
  return { ok: !errors.length, errors, team: sets };
}

module.exports = { validateStandardBuild, validateEliteTeam, buildSet, checkClauses };

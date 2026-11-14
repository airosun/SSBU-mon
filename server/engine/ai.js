// Simple CPU opponent: picks the move with the best expected damage (with some variety),
// uses setup/status moves occasionally, and switches into the best matchup when forced.
const MOVES = require('../../shared/moves.js');
const FIGHTERS = require('../../shared/fighters.json');
const { effectiveness } = require('../../shared/dex.js');

const GOOD_ITEMS = ['Leftovers', 'Life Orb', 'Choice Band', 'Choice Specs', 'Choice Scarf', 'Focus Sash', 'Sitrus Berry', 'Lum Berry', 'Assault Vest', 'Expert Belt', 'Rocky Helmet', 'Heavy-Duty Boots'];

function randomTeam(rng = Math.random, size = 6) {
  const pool = FIGHTERS.slice();
  const team = [];
  while (team.length < size && pool.length) {
    const f = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    const physical = f.stats.atk >= f.stats.spa;
    const attacks = f.learnset.filter(n => MOVES[n].cat !== 'Status');
    const statusMoves = f.learnset.filter(n => MOVES[n].cat === 'Status');
    // prefer STAB + matching category, then coverage
    const score = n => { const m = MOVES[n]; let s = m.power || 60; if (f.types.includes(m.type)) s *= 1.5; if ((m.cat === 'Physical') === physical) s *= 1.3; else s *= 0.6; if (m.acc !== true && m.acc < 85) s *= 0.8; return s + rng() * 30; };
    const picks = [];
    const sorted = attacks.sort((a, b) => score(b) - score(a));
    const usedTypes = new Set();
    for (const n of sorted) { if (picks.length >= 3) break; if (usedTypes.has(MOVES[n].type)) continue; picks.push(n); usedTypes.add(MOVES[n].type); }
    const st = statusMoves.length ? statusMoves[Math.floor(rng() * statusMoves.length)] : null;
    if (st && rng() < 0.6) picks.push(st);
    for (const n of sorted) { if (picks.length >= 4) break; if (!picks.includes(n)) picks.push(n); }
    const abil = rng() < 0.5 ? f.abilities[0].name : f.hidden.name;
    let item = GOOD_ITEMS[Math.floor(rng() * GOOD_ITEMS.length)];
    if (item.startsWith('Choice') && picks.some(n => MOVES[n].cat === 'Status')) item = 'Leftovers';
    if (item === 'Assault Vest' && picks.some(n => MOVES[n].cat === 'Status')) item = 'Sitrus Berry';
    if (item === 'Choice Band' && !physical) item = 'Choice Specs';
    if (item === 'Choice Specs' && physical) item = 'Choice Band';
    const fast = f.stats.spe >= 85;
    const evs = physical ? { atk: 252, spe: fast ? 252 : 0, hp: fast ? 4 : 252, def: 0, spa: 0, spd: 0 } : { spa: 252, spe: fast ? 252 : 0, hp: fast ? 4 : 252, def: 0, atk: 0, spd: 0 };
    const nature = physical ? (fast ? 'Jolly' : 'Adamant') : (fast ? 'Timid' : 'Modest');
    team.push({ species: f.id, ability: abil, item, nature, evs, moves: picks.slice(0, 4) });
  }
  return team;
}

function matchupScore(b, mon, foe) {
  if (!foe) return 0;
  let best = 0;
  for (const mv of mon.moves) best = Math.max(best, b.estimate(mon, foe, mv.name));
  let threat = 0;
  for (const t of foe.types) threat = Math.max(threat, effectiveness(t, mon.types));
  return best / foe.maxhp - threat * 0.25 + mon.hp / mon.maxhp * 0.3;
}

function chooseAction(b, sideN, rng = Math.random) {
  const req = b.getRequest(sideN);
  const side = b.sides[sideN];
  if (req.kind === 'preview') return { lead: Math.floor(rng() * side.team.length) };
  if (req.kind === 'switch') {
    const foe = b.active(b.sides[1 - sideN]);
    const options = side.team.map((m, i) => ({ m, i })).filter(o => !o.m.fainted && o.m !== b.active(side));
    options.sort((x, y) => matchupScore(b, y.m, foe) - matchupScore(b, x.m, foe));
    return { index: options[0].i };
  }
  if (req.kind !== 'move') return null;
  if (req.locked || req.struggle) return { type: 'move', index: 0 };
  const mon = b.active(side); const foe = b.active(b.sides[1 - sideN]);
  const usable = req.moves.filter(m => !m.disabled);
  let best = null; let bestScore = -1;
  for (const m of usable) {
    const md = MOVES[m.name];
    let s;
    if (md.cat === 'Status') {
      s = foe ? foe.maxhp * 0.12 : 0;
      if (md.boosts && md.boosts.target === 'self' && Object.values(md.boosts).some(v => typeof v === 'number' && v > 0) && mon.hp / mon.maxhp > 0.6) s = foe.maxhp * 0.25;
      if (md.heal && mon.hp / mon.maxhp < 0.5) s = foe.maxhp * 0.5;
      if (md.heal && mon.hp / mon.maxhp > 0.85) s = 0;
      if (md.status && foe && foe.status) s = 0;
      if (md.special === 'protect') s = foe.maxhp * 0.05;
      if (md.hazard && b.sides[1 - sideN].conditions[md.hazard]) s = 0;
    } else s = b.estimate(mon, foe, m.name);
    if (foe && s >= foe.hp && md.prio > 0) s *= 1.5;
    s *= 0.85 + rng() * 0.3;
    if (s > bestScore) { bestScore = s; best = m; }
  }
  // consider switching if badly outmatched
  if (req.canSwitch && foe && rng() < 0.35) {
    const cur = matchupScore(b, mon, foe);
    const options = side.team.map((m, i) => ({ m, i })).filter(o => !o.m.fainted && o.m !== mon);
    let alt = null; let altScore = cur + 0.5;
    for (const o of options) { const sc = matchupScore(b, o.m, foe); if (sc > altScore) { alt = o; altScore = sc; } }
    if (alt) return { type: 'switch', index: alt.i };
  }
  return { type: 'move', index: best ? best.index : 0 };
}

module.exports = { chooseAction, randomTeam };

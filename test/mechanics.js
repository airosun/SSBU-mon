// Targeted checks of a few mechanics. Usage: node test/mechanics.js
const assert = require('assert');
const { Battle } = require('../server/engine/battle.js');
const { validateTeam } = require('../server/engine/validate.js');

function mk(species, ability, moves, extra = {}) { return Object.assign({ species, ability, moves, nature: 'Hardy', evs: {} }, extra); }
function battle(t1, t2) {
  const b = new Battle({ players: [{ name: 'A', team: validateTeam(t1).team }, { name: 'B', team: validateTeam(t2).team }], rng: seeded(7) });
  b.choose(0, { lead: 0 }); b.choose(1, { lead: 0 });
  return b;
}
function seeded(s) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
const text = b => b.log.map(l => l.text).join('\n');
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('ok  ', name); } catch (e) { console.log('FAIL', name, '\n', e.message); process.exitCode = 1; } }

const v = validateTeam([mk('mario', 'Super Mushroom', ['Fire Punch']), mk('mario', 'Super Mushroom', ['Fly'])]);
test('validator rejects duplicates and unlearnable moves', () => { assert(!v.ok); assert(v.errors.some(e => /already/.test(e))); assert(v.errors.some(e => /can't learn Fly/.test(e))); });

test('Lucina Illusion disguises as last party member until hit', () => {
  const b = battle([mk('lucina', 'Masked Marth', ['Swords Dance']), mk('ike', 'Great Aether', ['Counter'])], [mk('pikachu', 'Static', ['Thunderbolt'])]);
  assert.match(text(b), /A sent out Ike!/);
  assert.equal(b.publicState(1).sides[0].active.name, 'Ike');
  b.choose(0, { type: 'move', index: 0 }); b.choose(1, { type: 'move', index: 0 });
  assert.match(text(b), /illusion wore off/);
  assert.equal(b.publicState(1).sides[0].active.name, 'Lucina');
});

test('Ice Climbers hit twice (Popo & Nana)', () => {
  const b = battle([mk('ice-climbers', 'Popo & Nana', ['Ice Shard'])], [mk('king-dedede', 'Self-Proclaimed King', ['Protect'])]);
  b.log = []; b.sides[1].team[0].v = {};
  b.choose(0, { type: 'move', index: 0 }); b.choose(1, { type: 'move', index: 0 });
  // Dedede protects on turn 1; use turn 2 instead
  b.choose(0, { type: 'move', index: 0 }); b.choose(1, { type: 'move', index: 0 });
  assert.match(text(b), /Hit 2 times!/);
});

test('U-turn asks the user to pick a switch mid-turn', () => {
  const b = battle([mk('diddy-kong', 'Monkey Business', ['U-turn']), mk('mario', 'Super Mushroom', ['Fire Punch'])], [mk('bowser', 'Spiked Shell', ['Flamethrower'])]);
  b.choose(0, { type: 'move', index: 0 }); b.choose(1, { type: 'move', index: 0 });
  const r = b.getRequest(0);
  assert.equal(r.kind, 'switch'); assert.equal(r.reason, 'pivot');
  assert.equal(b.choose(0, { index: 1 }), null);
  assert.equal(b.active(b.sides[0]).species.id, 'mario');
});

test('Lightning Rod absorbs Electric moves', () => {
  const b = battle([mk('pikachu', 'Lightning Rod', ['Thunderbolt'])], [mk('pichu', 'Lightning Rod', ['Thunderbolt'])]);
  b.choose(0, { type: 'move', index: 0 }); b.choose(1, { type: 'move', index: 0 });
  assert.match(text(b), /absorbed the attack/);
});

test('Intimidate lowers Attack; Clear Body blocks it', () => {
  const b = battle([mk('king-dedede', 'Self-Proclaimed King', ['Body Slam'])], [mk('daisy', 'Sarasaland Pride', ['Seed Bomb'])]);
  assert.match(text(b), /prevents its stats from being lowered/);
  const b2 = battle([mk('king-dedede', 'Self-Proclaimed King', ['Body Slam'])], [mk('mario', 'Super Mushroom', ['Fire Punch'])]);
  assert.equal(b2.active(b2.sides[1]).boosts.atk, -1);
});

test('Meta Knight disguise takes no damage from first hit', () => {
  const b = battle([mk('meta-knight', 'Mask of Mystery', ['Swords Dance'])], [mk('mario', 'Super Mushroom', ['Fire Punch'])]);
  b.choose(0, { type: 'move', index: 0 }); b.choose(1, { type: 'move', index: 0 });
  const mk1 = b.active(b.sides[0]);
  assert.equal(mk1.hp, mk1.maxhp); assert.match(text(b), /mask fell off/);
});

test('Hydro Storm summons rain', () => {
  const b = battle([mk('richter', 'Hydro Storm', ['Hydro Pump'])], [mk('mario', 'Super Mushroom', ['Fire Punch'])]);
  assert.equal(b.field.weather, 'rain');
});

console.log(`${passed} passed`);

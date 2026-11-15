// Targeted checks of mechanics, the match flow and roster signing. Usage: node test/mechanics.js
const assert = require('assert');
const { Battle } = require('../server/engine/battle.js');
const { Match } = require('../server/match.js');
const { sign, verify, genFighter } = require('../server/engine/roster.js');
const { validateEliteTeam, validateStandardBuild } = require('../server/engine/validate.js');

const ivs31 = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const mk = (species, ability, moves, extra = {}) => Object.assign({ species, ability, moves, nature: 'Hardy', ivs: ivs31 }, extra);
function seeded(s) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
const battle = (t1, t2, format = 'singles') => new Battle({ format, players: [{ name: 'A', team: t1 }, { name: 'B', team: t2 }], rng: seeded(7) });
const text = b => b.log.map(l => l.text).join('\n');
const mv = (index, target) => ({ actions: [{ pos: 0, type: 'move', index, target }] });
let passed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('ok  ', name); } catch (e) { console.log('FAIL', name, '\n', e.stack); process.exitCode = 1; } }

(async () => {
  await test('roster signatures detect tampering', () => {
    const f = sign(genFighter('mario'));
    assert(verify(f));
    assert(!verify(Object.assign({}, f, { ivs: ivs31 })));
    assert(!verify(Object.assign({}, f, { nature: f.nature === 'Adamant' ? 'Modest' : 'Adamant' })));
  });

  await test('Elite team: 6 verified fighters, species and item clauses', () => {
    const ids = ['mario', 'link', 'pikachu', 'samus', 'kirby', 'fox'];
    const team = ids.map(id => Object.assign(sign(genFighter(id)), { moves: ['Protect'], item: '' }));
    team.forEach((t, i) => { const f = require('../shared/fighters.json').find(x => x.id === t.species); t.moves = [f.learnset[0]]; });
    assert(validateEliteTeam(team, verify).ok);
    team[0].item = 'Leftovers'; team[1].item = 'Leftovers';
    assert(validateEliteTeam(team, verify).errors.some(e => /Item clause/.test(e)));
    team[1].item = ''; team[1].ivs = ivs31;
    assert(!validateEliteTeam(team, verify).ok);
  });

  await test('Standard build rejects unlearnable moves', () => {
    const base = [genFighter('mario')];
    assert(!validateStandardBuild(base, [{ moves: ['Fly'] }]).ok);
    assert(validateStandardBuild(base, [{ moves: ['Fire Punch'], item: 'Leftovers' }]).ok);
  });

  await test('Lucina Illusion disguises as last brought fighter until hit', () => {
    const b = battle([mk('lucina', 'Masked Marth', ['Swords Dance']), mk('ike', 'Great Aether', ['Counter'])], [mk('pikachu', 'Static', ['Thunderbolt'])]);
    assert.match(text(b), /A sent out Ike!/);
    b.choose(0, mv(0)); b.choose(1, mv(0));
    assert.match(text(b), /illusion wore off/);
  });

  await test('U-turn asks for a switch mid-turn', () => {
    const b = battle([mk('diddy-kong', 'Monkey Business', ['U-turn']), mk('mario', 'Super Mushroom', ['Fire Punch'])], [mk('bowser', 'Spiked Shell', ['Flamethrower'])]);
    b.choose(0, mv(0)); b.choose(1, mv(0));
    const r = b.getRequest(0);
    assert.equal(r.kind, 'switch'); assert.deepEqual(r.slots, [0]);
    assert.equal(b.choose(0, { switches: [{ pos: 0, index: 1 }] }), null);
    assert.equal(b.sides[0].active[0].species.id, 'mario');
  });

  await test('Doubles: spread move hits both foes; Intimidate hits both', () => {
    const b = battle(
      [mk('king-dedede', 'Self-Proclaimed King', ['Body Slam']), mk('steve', 'Crafting', ['Earthquake'])],
      [mk('mario', 'Super Mushroom', ['Fire Punch']), mk('link', 'Triforce of Courage', ['Sacred Sword'])], 'doubles');
    assert.equal(b.sides[1].active[0].boosts.atk, -1); assert.equal(b.sides[1].active[1].boosts.atk, -1);
    b.choose(0, { actions: [{ pos: 0, type: 'move', index: 0, target: { side: 1, pos: 0 } }, { pos: 1, type: 'move', index: 0 }] });
    b.choose(1, { actions: [{ pos: 0, type: 'move', index: 0, target: { side: 0, pos: 0 } }, { pos: 1, type: 'move', index: 0, target: { side: 0, pos: 0 } }] });
    const t = text(b);
    assert.match(t, /B's Mario lost/); assert.match(t, /B's Link lost/); assert.match(t, /A's King Dedede lost/);
  });

  await test('Doubles: the fighter that faints is replaced from the bench', () => {
    const b = battle(
      [mk('pichu', 'Static', ['Thunder Shock'], { ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } }), mk('mario', 'Super Mushroom', ['Fire Punch']), mk('link', 'Triforce of Courage', ['Sacred Sword'])],
      [mk('mewtwo', 'Pressure', ['Psystrike']), mk('ganondorf', 'Calamity', ['Close Combat'])], 'doubles');
    b.choose(0, { actions: [{ pos: 0, type: 'move', index: 0, target: { side: 1, pos: 0 } }, { pos: 1, type: 'move', index: 0, target: { side: 1, pos: 0 } }] });
    b.choose(1, { actions: [{ pos: 0, type: 'move', index: 0, target: { side: 0, pos: 0 } }, { pos: 1, type: 'move', index: 0, target: { side: 0, pos: 1 } }] });
    const r = b.getRequest(0);
    assert.equal(r.kind, 'switch');
    assert.equal(b.choose(0, { switches: r.slots.map(pos => ({ pos, index: 2 })).slice(0, 1) }), null);
  });

  await test('Standard match flow: draft -> build -> lineup -> battle', async () => {
    let last;
    const m = new Match({ id: 't', mode: 'standard', format: 'doubles', players: [{ id: 'a', name: 'A', cpu: true }, { id: 'b', name: 'B', cpu: true }], onUpdate: x => { last = x.phase; } });
    m.cpuDelay = 0;
    for (const p of m.players) p.pending = false;
    m.cpuAct();
    await new Promise(r => { const t = setInterval(() => { if (m.ended) { clearInterval(t); r(); } }, 5); });
    assert.equal(m.battle.sides[0].team.length, 4);
    assert.equal(last, 'ended');
  });

  await test('Final Smash: transforms once per team, keeps HP, stone stays put', () => {
    const b = battle(
      [mk('bowser', 'Spiked Shell', ['Flamethrower', 'Protect'], { item: 'Bowserite' }), mk('charizard', 'Blaze', ['Flamethrower'], { item: 'Charizardite Y' })],
      [mk('wario', 'Treasure Greed', ['Knock Off'])], 'singles');
    const req = b.getRequest(0);
    assert.equal(req.actives[0].finalSmash.name, 'Giga Bowser');
    const hp = b.sides[0].active[0].hp;
    b.choose(0, { actions: [{ pos: 0, type: 'move', index: 1, mega: true }] }); b.choose(1, mv(0));
    const bw = b.sides[0].team[0];
    assert.equal(bw.species.id, 'giga-bowser'); assert.equal(bw.ability, 'Giga Might'); assert.equal(bw.hp <= hp, true);
    assert.equal(bw.item, 'Bowserite');
    assert.match(text(b), /is using its Final Smash/);
    // Charizard can't Final Smash now: the team already used it
    if (!b.ended) { b.sides[0].team[0].hp = 1; }
    const sw = b.sides[0].team[1]; assert.equal(b.canFinalSmash(sw), false);
  });

  await test('Final Smash stone must match its fighter', () => {
    const v = validateStandardBuild([genFighter('mario')], [{ moves: ['Fire Punch'], item: 'Bowserite' }]);
    assert(!v.ok && v.errors.some(e => /only works for Bowser/.test(e)));
    assert(validateStandardBuild([genFighter('mewtwo')], [{ moves: ['Psychic'], item: 'Mewtwonite Y' }]).ok);
  });

  console.log(`${passed} passed`);
})();

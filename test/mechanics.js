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
  await test('Eviolite boosts only not-fully-evolved fighters (incl. Jigglypuff)', () => {
    const fj = require('../shared/fighters.json');
    const L = id => fj.find(x => x.id === id);
    for (const [id, boosted] of [['jigglypuff', true], ['pikachu', true], ['pichu', true], ['squirtle', true], ['ivysaur', true], ['kirby', false], ['charizard', false]]) {
      const f = L(id); const ab = f.abilities[0].name;
      const b = battle([mk(id, ab, [f.learnset[0]], { item: 'Eviolite' }), mk(id, ab, [f.learnset[0]])], [mk('mario', 'Super Mushroom', ['Protect'])]);
      const [held, plain] = b.sides[0].team;
      for (const st of ['def', 'spd']) {
        const r = b.getStat(held, st) / b.getStat(plain, st);
        assert(boosted ? r >= 1.45 && r <= 1.55 : r === 1, `${id} ${st} ratio ${r}`);
      }
    }
  });

  await test('weather and field changes carry the field state for the battlefield effects', () => {
    const b = battle([mk('mario', 'Super Mushroom', ['Rain Dance', 'Trick Room'])], [mk('kirby', 'Warp Star', ['Protect'])]);
    b.choose(0, mv(0)); b.choose(1, mv(0));
    const rain = b.log.find(l => l.a && l.a.k === 'field' && l.a.f.weather === 'rain');
    assert(rain && /rain/.test(rain.text) && rain.a.f.weatherTurns === 5, 'rain start tagged');
    b.choose(0, mv(1)); b.choose(1, mv(0));
    assert(b.log.some(l => l.a && l.a.k === 'field' && l.a.f.trickroom === 5), 'trick room tagged');
    for (let i = 0; i < 4; i++) { b.choose(0, mv(0)); b.choose(1, mv(0)); }
    const stop = b.log.find(l => l.text === 'The rain stopped.');
    assert(stop && stop.a && stop.a.k === 'field' && stop.a.f.weather === '', 'rain end tagged');
  });

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
      [mk('bowser', 'Spiked Shell', ['Flamethrower', 'Protect'], { item: 'Giga Mushroom' }), mk('charizard', 'Blaze', ['Flamethrower'], { item: 'Charizardite Y' })],
      [mk('wario', 'Treasure Greed', ['Knock Off'])], 'singles');
    const req = b.getRequest(0);
    assert.equal(req.actives[0].finalSmash.name, 'Giga Bowser');
    const hp = b.sides[0].active[0].hp;
    b.choose(0, { actions: [{ pos: 0, type: 'move', index: 1, mega: true }] }); b.choose(1, mv(0));
    const bw = b.sides[0].team[0];
    assert.equal(bw.species.id, 'giga-bowser'); assert.equal(bw.ability, 'Giga Might'); assert.equal(bw.hp <= hp, true);
    assert.equal(bw.item, 'Giga Mushroom');
    assert.match(text(b), /is using its Final Smash/);
    // Charizard can't Final Smash now: the team already used it
    if (!b.ended) { b.sides[0].team[0].hp = 1; }
    const sw = b.sides[0].team[1]; assert.equal(b.canFinalSmash(sw), false);
  });

  await test('Final Smash stone must match its fighter', () => {
    const v = validateStandardBuild([genFighter('mario')], [{ moves: ['Fire Punch'], item: 'Giga Mushroom' }]);
    assert(!v.ok && v.errors.some(e => /only works for Bowser/.test(e)));
    assert(validateStandardBuild([genFighter('mewtwo')], [{ moves: ['Psychic'], item: 'Mewtwonite Y' }]).ok);
  });

  await test('Pneuma: Pyra and Mythra share the Aegis Core Crystal and become the same Pneuma', () => {
    const F = require('../shared/fighters.json');
    const pyra = F.find(f => f.id === 'pyra'), mythra = F.find(f => f.id === 'mythra');
    const sum = f => Object.values(f.stats).reduce((a, c) => a + c, 0);
    assert.equal(sum(pyra), 550); assert.equal(sum(mythra), 550); assert.equal(pyra.stats.hp, mythra.stats.hp);
    const stats = [];
    for (const f of [pyra, mythra]) {
      const b = battle([mk(f.id, f.abilities[0].name, [f.learnset[0]], { item: 'Aegis Core Crystal' })], [mk('mario', 'Super Mushroom', ['Protect'])]);
      b.choose(0, { actions: [{ pos: 0, type: 'move', index: 0, mega: true }] }); b.choose(1, mv(0));
      const m = b.sides[0].team[0]; assert.equal(m.species.id, 'pneuma'); assert.equal(m.ability, 'Trinity Aegis');
      stats.push(JSON.stringify(m.stats));
    }
    assert.equal(stats[0], stats[1]);
    assert(validateStandardBuild([genFighter('pyra')], [{ moves: [pyra.learnset[0]], item: 'Aegis Core Crystal' }]).ok);
    assert(validateStandardBuild([genFighter('mythra')], [{ moves: [mythra.learnset[0]], item: 'Aegis Core Crystal' }]).ok);
    const bad = validateStandardBuild([genFighter('mario')], [{ moves: ['Fire Punch'], item: 'Aegis Core Crystal' }]);
    assert(bad.errors.some(e => /only works for Pyra or Mythra/.test(e)));
  });

  await test('no ability shares a name with a Final Smash or its stone; old saved names still work', () => {
    const F = require('../shared/fighters.json');
    const { FINAL_SMASHES } = require('../shared/megas.js');
    const { RENAMED_ABILITIES } = require('../shared/dex.js');
    const A = require('../server/engine/abilities.js');
    const taken = new Set(Object.entries(FINAL_SMASHES).flatMap(([st, x]) => [st, x.name]).map(n => n.toLowerCase()));
    for (const f of F) for (const a of [...f.abilities, f.hidden]) assert(!taken.has(a.name.toLowerCase()), `${f.name}: ${a.name}`);
    for (const x of Object.values(FINAL_SMASHES)) assert(A[x.ability.name], `missing spec for ${x.ability.name}`);
    // a fighter signed with an old ability name is still valid and gets the new name
    const f = sign(Object.assign(genFighter('kazuya'), { ability: 'Devil Gene' }));
    const team = [f, ...['mario', 'link', 'samus', 'kirby', 'fox'].map(id => sign(genFighter(id)))].map(t => Object.assign(t, { moves: [F.find(x => x.id === t.species).learnset[0]], item: '' }));
    const v = validateEliteTeam(team, verify); assert(v.ok, v.errors && v.errors.join());
    assert.equal(v.team[0].ability, RENAMED_ABILITIES['Devil Gene']);
  });

  await test('a flinch is logged with an animation event', () => {
    const b = battle([mk('incineroar', 'Intimidate', ['Fake Out'])], [mk('mario', 'Super Mushroom', ['Fire Punch'])]);
    const F = require('../shared/fighters.json'); b.sides[0].team[0].ability = F.find(f => f.id === 'incineroar').abilities[0].name;
    // make the Fake Out user faster so the target flinches before moving
    b.sides[0].team[0].stats.spe = 999;
    b.choose(0, mv(0)); b.choose(1, mv(0));
    const ev = b.log.find(l => l.a && l.a.k === 'flinch');
    assert(ev, 'flinch event'); assert.match(ev.text, /flinched/);
  });

  await test('genders: infatuation needs opposite genders; genderless and "both" are immune', () => {
    const G = require('../shared/genders.js');
    const MOVES = require('../shared/moves.js');
    const tryInfatuate = (attacker, gender) => {
      let hits = 0;
      for (let k = 0; k < 40; k++) {
        const b = battle([mk(attacker, require('../shared/fighters.json').find(f => f.id === attacker).abilities[0].name, ['Pound'], { gender })], [mk('isabelle', 'Cheerful Secretary', ['Protect'])]);
        const a = b.sides[0].team[0], t = b.sides[1].team[0];
        b.rng = () => 0.01;   // the 30% roll always succeeds
        b.contactReactions(a, t, MOVES['Pound']);
        if (a.v.attract) hits++;
      }
      return hits;
    };
    assert.equal(G.defaultGender('isabelle'), 'F');
    assert.equal(tryInfatuate('mario', 'M'), 40, 'male attacker vs female Isabelle');
    assert.equal(tryInfatuate('samus', 'F'), 0, 'female vs female');
    assert.equal(tryInfatuate('kirby', 'F'), 0, 'genderless (gender request ignored)');
    assert.equal(tryInfatuate('ice-climbers', 'M'), 0, '"both" acts genderless');
  });

  await test('genders: rolled by the sheet ratio, chosen in Elite, fixed ones forced, old saves default', () => {
    const G = require('../shared/genders.js');
    let males = 0; for (let i = 0; i < 4000; i++) if (genFighter('squirtle').gender === 'M') males++;
    assert(males > 3300 && males < 3700, 'about 87.5% male: ' + males);
    assert.equal(genFighter('mario').gender, 'M'); assert.equal(genFighter('kirby').gender, 'N'); assert.equal(genFighter('banjo-and-kazooie').gender, 'B');
    const F = require('../shared/fighters.json');
    const pika = Object.assign(sign(genFighter('pikachu')), { moves: [F.find(f => f.id === 'pikachu').learnset[0]], item: '', gender: 'F' });
    const mario = Object.assign(sign(genFighter('mario')), { moves: ['Fire Punch'], item: '', gender: 'F' });
    const rest = ['link', 'samus', 'kirby', 'fox'].map(id => Object.assign(sign(genFighter(id)), { moves: [F.find(f => f.id === id).learnset[0]], item: '' }));
    const v = validateEliteTeam([pika, mario, ...rest], verify);
    assert(v.ok, v.errors && v.errors.join());
    assert.equal(v.team[0].gender, 'F', 'Pikachu can be chosen female'); assert.equal(v.team[1].gender, 'M', 'Mario is always male');
    const old = sign(genFighter('pikachu')); delete old.gender;
    assert(verify(old), 'gender is not part of the signature, so old saved fighters still verify');
    assert.equal(G.normalize('pikachu', undefined), 'M');
    const s = validateStandardBuild([Object.assign(genFighter('jigglypuff'), { gender: 'F' })], [{ moves: ['Pound'] }]);
    assert.equal(s.team[0].gender, 'F', 'Standard keeps the rolled gender');
  });

  console.log(`${passed} passed`);
})();

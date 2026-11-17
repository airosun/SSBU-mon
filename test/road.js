// Road to 50 Wins: boss data, starting a run, fights, recruiting, editing, saving. Usage: node test/road.js
const assert = require('assert');
const Road = require('../server/road.js');
const { createStore } = require('../server/db.js');
const { Match } = require('../server/match.js');
const { genFighter, sign } = require('../server/engine/roster.js');
const { buildSet, checkClauses } = require('../server/engine/validate.js');
const AI = require('../server/engine/ai.js');
const FIGHTERS = require('../shared/fighters.json');
const { ITEMS } = require('../shared/dex.js');

let passed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('ok  ', name); } catch (e) { console.log('FAIL', name, '\n', e.stack); process.exitCode = 1; } }
const eliteTeam = ids => { const pool = ids.map(id => sign(genFighter(id))); const b = AI.buildTeam(pool, false); return pool.map((p, i) => Object.assign({}, p, b[i])); };
const bst = id => Object.values(FIGHTERS.find(f => f.id === id).stats).reduce((a, b) => a + b, 0);

(async () => {
  const store = createStore({ url: '', file: null }); await store.init(); Road.useStore(store);
  let n = 0; const started = [];
  const fakeStart = (team, boss) => { started.push({ team, boss }); return 'm' + ++n; };

  await test('50 fixed bosses: legal teams, every fighter appears, Final Smashes from floor 15, rising difficulty', () => {
    const B = Road.BOSSES;
    assert.equal(B.length, 50);
    const seen = new Set();
    B.forEach(b => {
      const errors = [];
      const sets = b.team.map(s => buildSet(s, s, errors)); checkClauses(sets, errors);
      assert.deepEqual(errors, [], `floor ${b.floor} is a legal team`);
      assert.equal(b.team.length, 6);
      b.team.forEach(s => seen.add(s.species));
      const stones = b.team.filter(s => s.item && !ITEMS[s.item]).length;
      assert.equal(stones, b.floor >= 15 ? 1 : 0, `floor ${b.floor} stones`);
      assert.equal(b.bst, b.team.reduce((x, s) => x + bst(s.species), 0));
    });
    assert.equal(seen.size, FIGHTERS.length, 'every fighter is on some boss team');
    for (let i = 1; i < 50; i++) assert(B[i].skill >= B[i - 1].skill);
    assert(B[49].bst > B[0].bst + 1000);
    for (const m of [10, 20, 30, 40, 50]) assert(B[m - 1].milestone && B.slice(m - 10, m).every(b => b.bst <= B[m - 1].bst), `floor ${m} is the strongest of its ten`);
    assert.equal(new Set(B.map(b => b.name)).size, 50, 'every boss has its own name');
  });

  await test('the boss file is the same every time (no randomness at load)', () => {
    delete require.cache[require.resolve('../server/data/road_bosses.json')];
    assert.deepEqual(require('../server/data/road_bosses.json'), Road.BOSSES);
  });

  await test('start: random team (random moves, no items); one run at a time', async () => {
    const v = await Road.start('g:a', { source: 'random' });
    assert.equal(v.run.floor, 1); assert.equal(v.run.team.length, 6);
    assert(v.run.team.every(s => s.moves.length >= 2 && !s.item && !s.sig));
    assert.equal(new Set(v.run.team.map(s => s.species)).size, 6);
    assert.equal(v.run.boss.floor, 1); assert.equal(v.run.boss.team.length, 6);
    assert((await Road.start('g:a', { source: 'random' })).error, 'already running');
  });

  await test('start: Elite team (validated) and fighters you own (signed only)', async () => {
    const team = eliteTeam(['mario', 'link', 'kirby', 'fox', 'samus', 'ness']);
    const v = await Road.start('g:b', { source: 'elite', team });
    assert.deepEqual(v.run.team.map(s => s.item), team.map(s => s.item));
    const owned = ['bowser', 'yoshi', 'peach', 'pikachu', 'zelda', 'marth'].map(id => sign(genFighter(id)));
    assert((await Road.start('g:c', { source: 'roster', fighters: owned.map(f => Object.assign({}, f, { nature: 'Adamant', ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } })) })).error, 'edited fighters are refused');
    const r = await Road.start('g:c', { source: 'roster', fighters: owned });
    assert.deepEqual(r.run.team.map(s => s.species), owned.map(f => f.species));
    assert(r.run.team.every(s => s.moves.length === 4));
  });

  await test('edit moves and items between floors (illegal ones refused), not mid-fight', async () => {
    const v = await Road.get('g:c');
    const builds = v.run.team.map(s => ({ moves: s.moves.slice(0, 3), item: '' }));
    builds[0].item = 'Giga Mushroom';   // Bowser's Final Smash stone: usable from floor 1
    const e = await Road.edit('g:c', builds);
    assert.equal(e.run.team[0].item, 'Giga Mushroom'); assert.equal(e.run.team[1].moves.length, 3);
    builds[1].moves = ['Not A Move']; assert((await Road.edit('g:c', builds)).error);
    builds[1].moves = ['Tackle']; builds[1].item = 'Giga Mushroom'; assert((await Road.edit('g:c', builds)).error, 'stone only for Bowser');
    await Road.fight('g:c', fakeStart);
    assert((await Road.edit('g:c', builds)).error, 'not during a fight');
  });

  await test('win: floor goes up, then recruit a boss fighter (or skip); loss ends the run', async () => {
    const before = (await Road.get('g:a')).run;
    const f = await Road.fight('g:a', fakeStart);
    assert.equal(started[started.length - 1].boss.floor, 1);
    assert.equal((await Road.fight('g:a', fakeStart)).id, f.id, 'asking again returns the same fight');
    let v = await Road.finished('g:a', f.id, 0, { lineup: ['mario'] });
    assert.equal(v.run.floor, 2); assert.equal(v.best, 1); assert.equal(v.run.recruitFloor, 1); assert.equal(v.run.recruit.length, 6);
    assert((await Road.fight('g:a', fakeStart)).error, 'decide on recruiting first');
    const boss1 = Road.BOSSES[0].team;
    const pick = boss1.findIndex(s => !before.team.some(t => t.species === s.species));
    v = await Road.recruit('g:a', pick, 2);
    assert.equal(v.run.team[2].species, boss1[pick].species);
    assert.equal(v.run.team[2].nature, boss1[pick].nature, 'recruits keep the boss build');
    assert.equal(v.run.recruitFloor, null);
    const f2 = await Road.fight('g:a', fakeStart);
    v = await Road.finished('g:a', f2.id, 0); v = await Road.recruit('g:a', null);
    assert.equal(v.run.floor, 3);
    const f3 = await Road.fight('g:a', fakeStart);
    v = await Road.finished('g:a', f3.id, 1);
    assert.equal(v.run.status, 'lost'); assert.equal(v.best, 2); assert.equal(v.lastRun.cleared, 2);
    assert((await Road.fight('g:a', fakeStart)).error);
    v = await Road.dismiss('g:a'); assert.equal(v.run, null);
    assert.equal((await Road.start('g:a', { source: 'random' })).run.floor, 1, 'new run from floor 1');
  });

  await test('recruit rules: no duplicate species; a clashing item is dropped', async () => {
    const team = eliteTeam(['mario', 'link', 'kirby', 'fox', 'samus', 'ness']);
    await Road.start('g:d', { source: 'elite', team });
    const f = await Road.fight('g:d', fakeStart); await Road.finished('g:d', f.id, 0);
    const boss = Road.BOSSES[0].team; const dupe = boss.findIndex(s => team.some(t => t.species === s.species));
    if (dupe >= 0) assert((await Road.recruit('g:d', dupe, team.findIndex(t => t.species !== boss[dupe].species))).error);
    assert((await Road.recruit('g:d', 0, 9)).error, 'must replace one of your 6');
  });

  await test('clearing floor 50 finishes the run; abandon records the run', async () => {
    const team = eliteTeam(['bowser', 'yoshi', 'peach', 'pikachu', 'zelda', 'marth']);
    await Road.start('g:e', { source: 'elite', team });
    for (let fl = 1; fl <= 50; fl++) { const f = await Road.fight('g:e', fakeStart); const v = await Road.finished('g:e', f.id, 0); if (fl < 50) await Road.recruit('g:e', null); else { assert.equal(v.run.status, 'cleared'); assert.equal(v.clears, 1); assert.equal(v.best, 50); } }
    await Road.dismiss('g:e');
    await Road.start('g:e', { source: 'random' });
    const v = await Road.abandon('g:e'); assert.equal(v.run, null); assert.equal(v.lastRun.status, 'abandoned');
  });

  await test('saved runs survive a restart (same store) and move from guest to account on sign-in', async () => {
    const file = require('path').join(require('os').tmpdir(), 'road-test-' + Date.now() + '.json');
    const s1 = createStore({ url: '', file }); await s1.init(); Road.useStore(s1);
    await Road.start('g:z', { source: 'random' });
    const f = await Road.fight('g:z', fakeStart); await Road.finished('g:z', f.id, 0); await Road.recruit('g:z', null);
    await new Promise(r => setTimeout(r, 500));
    const s2 = createStore({ url: '', file }); await s2.init(); Road.useStore(s2);
    assert.equal((await Road.get('g:z')).run.floor, 2, 'run picked up where it left off');
    const v = await Road.absorb('g:z', 'u:7');
    assert.equal(v.run.floor, 2); assert.equal(v.best, 1);
    assert.equal((await Road.get('g:z')).run, null);
    Road.useStore(store);
  });

  await test('a real floor fight runs to the end against the boss CPU', async () => {
    const boss = Road.BOSSES[24];
    const me = eliteTeam(['mario', 'link', 'kirby', 'fox', 'samus', 'ness']);
    const m = new Match({ id: 'r1', mode: 'elite', format: 'singles', timed: false, road: { floor: boss.floor, boss: boss.name },
      players: [{ id: 'cpu', name: 'Me', cpu: true, team: me }, { id: 'cpu', name: boss.name, cpu: true, team: boss.team.map(s => Object.assign({}, s)), skill: boss.skill }] });
    m.cpuDelay = 0;
    for (let i = 0; i < 400 && !m.ended; i++) await new Promise(r => setTimeout(r, 2));
    assert(m.ended, 'fight finished'); assert.equal(m.view(0).road.floor, 25);
  });

  console.log(`${passed} passed`);
})();

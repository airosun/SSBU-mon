// Timer, battle records/stats, replays storage and the damage calculator. Usage: node test/features.js
const assert = require('assert');
const { Match, CLOCK } = require('../server/match.js');
const { createStore } = require('../server/db.js');
const Stats = require('../server/stats.js');
const { calc } = require('../server/calc.js');
const { genFighter } = require('../server/engine/roster.js');
const AI = require('../server/engine/ai.js');

let passed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('ok  ', name); } catch (e) { console.log('FAIL', name, '\n', e.stack); process.exitCode = 1; } }
const eliteTeam = ids => { const pool = ids.map(id => genFighter(id)); const b = AI.buildTeam(pool, false); return pool.map((p, i) => Object.assign({}, p, b[i])); };
function pvp(timed = true) {
  return new Match({ id: 'm' + Math.random().toString(36).slice(2, 7), mode: 'elite', format: 'singles', timed,
    players: [{ id: 'u:1', name: 'Ash', team: eliteTeam(['mario', 'link', 'kirby', 'fox', 'samus', 'ness']) }, { id: 'u:2', name: 'Gary', team: eliteTeam(['bowser', 'yoshi', 'peach', 'pikachu', 'zelda', 'marth']) }] });
}

(async () => {
  await test('timer: lineup phase auto-picks when time runs out', () => {
    const m = pvp(); let t = m.lastTick;
    assert.equal(m.phase, 'preview'); assert(m.view(0).clock.phase > 0);
    m.act(0, { type: 'lineup', order: [0, 1, 2] });
    m.tick(t += (CLOCK.preview + 1) * 1000);
    assert.equal(m.phase, 'battle', 'Gary was given a lineup automatically');
    assert.match(m.log.map(l => l.text).join('\n'), /ran out of time/);
  });
  await test('timer: turn limit picks a move; empty bank loses; game clock decides by fighters left', () => {
    const m = pvp(); let t = m.lastTick;
    m.act(0, { type: 'lineup', order: [0, 1, 2] }); m.act(1, { type: 'lineup', order: [0, 1, 2] });
    const before = m.battle.log.length;
    m.tick(t += 1000); m.tick(t += (CLOCK.turn + 1) * 1000);
    const after = m.battle.log.slice(before).map(l => l.text).join('\n');
    assert.equal((after.match(/ran out of turn time/g) || []).length, 2, 'both sides had moves picked for them');
    assert.match(after, /used /);
    assert.match(m.battle.log.map(l => l.text).join('\n'), /ran out of turn time/);
    // bank: drain player 0 while they wait
    if (!m.battle.ended) { m.clock.players[0].bank = 500; m.tick(t += 1000); assert(m.battle.ended); assert.equal(m.battle.winner, 1); assert.match(m.battle.log.map(l => l.text).join('\n'), /Ash ran out of time/); }
    const g = pvp(); let u = g.lastTick; g.act(0, { type: 'lineup', order: [0, 1, 2] }); g.act(1, { type: 'lineup', order: [0, 1, 2] });
    g.battle.sides[1].team[2].hp = 0; g.battle.sides[1].team[2].fainted = true;
    g.clock.game = 500; g.tick(u += 1000);
    assert(g.battle.ended); assert.equal(g.battle.winner, 0, 'more fighters left wins');
  });
  await test('CPU matches are not timed', () => {
    const m = pvp(false); assert(!m.view(0).clock); m.tick(Date.now() + 1e7); assert.equal(m.phase, 'preview');
  });
  await test('finished battles produce a record with teams and a replay', () => {
    const m = pvp(false); m.act(0, { type: 'lineup', order: [2, 0, 1] }); m.act(1, { type: 'lineup', order: [0, 1, 2] });
    assert.equal(m.record([1, 2]), null, 'not over yet');
    m.forfeit(1);
    const r = m.record([1, 2]);
    assert.equal(r.winner, 0); assert.deepEqual(r.teams[0], ['kirby', 'mario', 'link']);
    assert(r.replay.start && r.replay.log.length && r.replay.final.ended);
  });
  await test('opponent info: moves used, then ability/item shown in messages', () => {
    const m = pvp(false); m.act(0, { type: 'lineup', order: [0, 1, 2] }); m.act(1, { type: 'lineup', order: [0, 1, 2] });
    const b = m.battle; const foe = b.sides[1].active[0];
    b.useMove(foe, foe.moves[0].name, {});
    b.add('effect', `${foe.label}'s ${foe.ability} activated!`);
    const seen = b.publicState(0).sides[1].active[0].seen;
    assert.deepEqual(seen.moves, [foe.moves[0].name]); assert.equal(seen.ability, foe.ability);
    assert.equal(b.publicState(1).sides[1].active[0].seen, undefined, 'your own fighters show full info instead');
  });
  for (const [label, store] of [['memory', createStore({ url: '', file: '' })], ...(process.env.TEST_DATABASE_URL ? [['postgres', createStore({ url: process.env.TEST_DATABASE_URL })]] : [])]) {
    await store.init();
    await test(`${label}: battles feed records, usage and replays`, async () => {
      const tag = Math.random().toString(36).slice(2, 8);
      const mk = (i, w, u, cpu2, teams) => ({ id: tag + i, mode: 'elite', format: 'singles', players: ['A', cpu2 ? 'CPU' : 'B'], cpu: [false, !!cpu2], users: u, winner: w, turns: 7, teams, replay: { start: {}, log: [{ text: 'hi' }], final: { ended: true } } });
      const uid = 900000 + Math.floor(Math.random() * 90000);
      await store.saveBattle(mk(1, 0, [uid, null], false, [['mario', 'link', 'kirby'], ['fox', 'samus', 'ness']]));
      await store.saveBattle(mk(2, 1, [uid, null], true, [['mario', 'zelda', 'kirby'], ['fox', 'samus', 'ness']]));
      await store.saveBattle(mk(3, null, [null, uid], false, [['bowser', 'yoshi', 'peach'], ['mario', 'link', 'pit']]));
      const rec = Stats.record(await store.userSides(uid));
      assert.deepEqual(rec.total, { wins: 1, losses: 1, ties: 1 }); assert.deepEqual(rec.pvp, { wins: 1, losses: 0, ties: 1 });
      const top = Stats.fighterTable(await store.userSides(uid));
      assert.equal(top[0].species, 'mario'); assert.equal(top[0].games, 3);
      const usage = Stats.usage(await store.usageSides({ days: 1 }));
      assert(usage.teams >= 5); assert(usage.rows.find(r => r.species === 'mario').games >= 3);
      const b = await store.getBattle(tag + 1); assert.equal(b.replay.log[0].text, 'hi'); assert.equal(b.winner, 0);
      const mine = await store.recentBattles({ userId: uid }); assert.equal(mine.length, 3); assert(mine.every(x => !x.replay && x.hasReplay));
      const pub = await store.recentBattles({}); assert(!pub.some(x => x.id === tag + 2), 'CPU battles are not in the public list');
    });
    if (store.close) await store.close();
  }
  await test('trainer cards: only real avatars, trimmed text, showcase from your own saved team', () => {
    const { sanitizeProfile } = require('../server/profile.js');
    const data = { roster: [{ uid: 'a', species: 'mario', nature: 'Adamant', ability: 'Super Mushroom' }], elite: [{ name: 'Mine', mons: [{ uid: 'a', moves: ['Fire Punch', ''], item: 'Leftovers' }, { uid: 'ghost', moves: [] }] }] };
    const p = sanitizeProfile({ avatar: 'giga-bowser', title: '<b>' + 'x'.repeat(50), bio: 'hi\n there', favoriteTeam: 0 }, data);
    assert.equal(p.avatar, 'giga-bowser'); assert.equal(p.title.length, 32); assert(!p.title.includes('<')); assert.equal(p.bio, 'hi there');
    assert.deepEqual(p.favoriteTeam, { name: 'Mine', mons: [{ species: 'mario', gender: null, nature: 'Adamant', ability: 'Super Mushroom', item: 'Leftovers', moves: ['Fire Punch'] }] });
    assert.equal(sanitizeProfile({ avatar: 'not-real', favoriteTeam: 5 }, data).avatar, null);
    assert.equal(sanitizeProfile({ favoriteTeam: 5 }, data).favoriteTeam, null);
  });
  await test('usage by period: since a time, or all time', async () => {
    const st = createStore({ url: '', file: '' }); await st.init();
    await st.saveBattle({ id: 'p1', mode: 'standard', format: 'singles', players: ['A', 'B'], cpu: [false, false], users: [null, null], winner: 0, turns: 3, teams: [['mario'], ['link']], replay: null });
    assert.equal((await st.usageSides({ since: null })).length, 2);
    assert.equal((await st.usageSides({ since: new Date(Date.now() + 60000) })).length, 0);
    assert.equal((await st.usageSides({ since: new Date(Date.now() - 60000) })).length, 2);
  });
  await test('Battler Cards: curse words and slurs are blocked, disguised spellings too; alternate-gender avatars allowed', () => {
    const { isClean, mask } = require('../server/moderation.js');
    const { sanitizeProfile, cleanForDisplay } = require('../server/profile.js');
    const rev = w => w.split('').reverse().join('');   // keep the word list out of plain sight
    for (const w of ['kcuf', 'tihs', 'hctib', 'reggin', 'toggaf', 'drater', 'cips', 'kcabtew']) assert(!isClean(rev(w)), 'blocked: ' + w.length);
    for (const w of ['f u c k', 's.h.i.t', 'sh1t', 'b!tch', 'FUUUCK']) assert(!isClean(w), 'disguised: ' + w.length);
    for (const w of ['Scunthorpe', 'assassin main', 'class act', 'spicy food', 'Hispanic', 'snigger', 'Shiitake', 'Dick Grayson', 'Peach & Daisy', 'a b c']) assert(isClean(w), 'allowed: ' + w);
    assert.equal(sanitizeProfile({ title: 'the ' + rev('tihs') }, {}).error.includes('title'), true);
    assert(sanitizeProfile({ bio: 'f u c k this' }, {}).error.includes('About you'));
    const data = { roster: [{ uid: 'a', species: 'mario' }], elite: [{ name: rev('tihs') + ' team', mons: [{ uid: 'a', moves: [] }] }] };
    assert(sanitizeProfile({ favoriteTeam: 0 }, data).error.includes('team'));
    assert(!/[a-z]{4}/i.test(cleanForDisplay({ title: rev('tihs'), bio: '', favoriteTeam: null }).title), 'old saved text is masked');
    assert.equal(sanitizeProfile({ avatar: 'pichu~F' }, {}).avatar, 'pichu~F');
    assert.equal(sanitizeProfile({ avatar: 'grima~F' }, {}).avatar, 'grima~F');
    assert.equal(sanitizeProfile({ avatar: 'mario~F' }, {}).avatar, null, 'no female Mario sprite');
    assert.equal(sanitizeProfile({ color: 'ocean' }, {}).color, 'ocean'); assert.equal(sanitizeProfile({ color: 'neon<script>' }, {}).color, 'classic');
  });
  await test('damage calc matches engine rules', () => {
    const base = calc({ attacker: { species: 'mario', move: 'Flamethrower' }, defender: { species: 'link' } });
    const sun = calc({ attacker: { species: 'mario', move: 'Flamethrower' }, defender: { species: 'link' }, field: { weather: 'sun' } });
    assert(base.min < base.max); assert(Math.abs(sun.max / base.max - 1.5) < 0.03);
    assert.equal(calc({ attacker: { species: 'mario', move: 'Earthquake' }, defender: { species: 'charizard' } }).max, 0);
    const scr = calc({ attacker: { species: 'mario', move: 'Flamethrower' }, defender: { species: 'link' }, field: { lightscreen: true } });
    assert(Math.abs(scr.max / base.max - 0.5) < 0.03);
    const fs = calc({ attacker: { species: 'kazuya', move: 'Close Combat', item: 'Devil Gene', finalSmash: true }, defender: { species: 'mario' } });
    const nofs = calc({ attacker: { species: 'kazuya', move: 'Close Combat', item: 'Devil Gene' }, defender: { species: 'mario' } });
    assert(fs.max > nofs.max, 'Devil Kazuya hits harder');
    assert(calc({ attacker: { species: 'nope' } }).error);
  });
  console.log(`${passed} passed`);
})();

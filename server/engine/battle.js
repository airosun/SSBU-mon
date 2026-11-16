// SSBU-mon battle engine — VGC style. Level 50. Singles (1 active) or doubles (2 active).
// A battle receives only the fighters each player brought (3 in singles, 4 in doubles), in lead order.
const MOVES = require('../../shared/moves.js');
const FIGHTERS = require('../../shared/fighters.json');
const { effectiveness, calcStat, EVIOLITE_USERS } = require('../../shared/dex.js');
const ABIL = require('./abilities.js');
const GENDER = require('../../shared/genders.js');
const { FINAL_SMASHES } = require('../../shared/megas.js');

const FIGHTER_BY_ID = Object.fromEntries(FIGHTERS.map(f => [f.id, f]));
const LEVEL = 50;
const BOOST_STATS = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'];
const STAT_LABEL = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed', accuracy: 'accuracy', evasion: 'evasiveness' };
const STATUS_LABEL = { brn: 'burned', par: 'paralyzed', psn: 'poisoned', tox: 'badly poisoned', slp: 'asleep', frz: 'frozen' };
const NO_METRONOME = new Set(['Metronome', 'Copycat', 'Protect', 'Detect', "King's Shield", 'Counter', 'Mirror Coat', 'Focus Punch', 'Magic Coat', 'Thief', 'Trick', 'Fling']);
const BERRIES = new Set(['Sitrus Berry', 'Lum Berry']);
const STRUGGLE = { name: 'Struggle', type: 'Normal', cat: 'Physical', power: 50, acc: true, pp: 1, prio: 0, contact: true, target: 'randomFoe' };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const boostMult = s => s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
const accMult = s => s >= 0 ? (3 + s) / 3 : 3 / (3 - s);
const getMove = n => n === 'Struggle' ? STRUGGLE : MOVES[n];

class Mon {
  constructor(set, side, teamIndex) {
    const f = FIGHTER_BY_ID[set.species];
    this.side = side; this.teamIndex = teamIndex; this.species = f; this.baseSpecies = f; this.uid = set.uid; this.mega = false;
    this.baseAbility = set.ability; this.ability = set.ability;
    this.gender = GENDER.normalize(f.id, set.gender);
    this.item = set.item || ''; this.nature = set.nature || 'Hardy';
    this.evs = Object.assign({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, set.evs || {});
    this.ivs = Object.assign({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, set.ivs || {});
    this.stats = {};
    for (const s of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) this.stats[s] = calcStat(s, f.stats[s], this.ivs[s], this.evs[s], LEVEL, this.nature);
    this.maxhp = this.stats.hp; this.hp = this.maxhp;
    this.moves = set.moves.map(n => ({ name: n, pp: Math.floor(MOVES[n].pp * 8 / 5), maxpp: Math.floor(MOVES[n].pp * 8 / 5) }));
    this.status = ''; this.statusTurns = 0; this.toxCount = 0;
    this.fainted = false; this.once = {}; this.berryUses = 0; this.consumedItem = '';
    this.pos = -1; this.revealed = false;
    this.resetVolatiles();
  }
  get spec() { return ABIL[this.ability] || {}; }
  resetVolatiles() {
    this.types = this.species.types.slice();
    this.boosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
    this.v = {}; this.turnsActive = 0; this.movedSinceSwitch = false; this.lastMove = null;
    this.hitsTaken = 0; this.switchFlags = {}; this.protectCount = 0; this.toxCount = 0;
    this.ability = this.baseAbility; this.displaySpecies = this.species; this.unburdened = false;
  }
  get label() { return `${this.side.name}'s ${this.displaySpecies.name}`; }
  hpFrac() { return this.hp / this.maxhp; }
}

class Battle {
  constructor(opts) {
    this.id = opts.id || Math.random().toString(36).slice(2, 10);
    this.rng = opts.rng || Math.random;
    this.format = opts.format === 'doubles' ? 'doubles' : 'singles';
    this.activeCount = this.format === 'doubles' ? 2 : 1;
    this.sides = [0, 1].map(i => {
      const p = opts.players[i];
      const side = { n: i, name: p.name, conditions: {}, wishes: {}, choices: null, needSwitch: [], megaUsed: false };
      side.team = p.team.map((set, k) => new Mon(set, side, k));
      side.active = new Array(this.activeCount).fill(null);
      return side;
    });
    this.field = { weather: '', weatherTurns: 0, trickroom: 0, gravity: 0 };
    this.turn = 0; this.phase = 'move'; this.log = []; this.winner = null; this.ended = false;
    this.queue = []; this.pendingSwitches = []; this.lastMoveUsed = null; this.futures = [];
    this.moldBreaker = null; this.inResiduals = false;
    this.onUpdate = opts.onUpdate || (() => {});
    this.start();
  }

  // ---------------- utilities ----------------
  add(cls, text, a) {
    const e = a ? { cls, text, a } : { cls, text }; this.log.push(e);
    // what the opponent has learned: an ability or item named next to its fighter in a message
    if (text && (cls === 'ability' || cls === 'effect' || cls === 'heal' || cls === 'damage' || cls === 'item' || cls === 'info')) {
      for (const side of this.sides || []) for (const m of side.team) {
        if (!m.revealed || !m.label || !text.includes(m.label)) continue;
        if (m.ability && text.includes(m.ability)) m.shownAbility = m.ability;
        if (m.item && text.includes(m.item)) m.shownItem = m.item;
      }
    }
    return e;
  }
  // the battle clock ran out: most fighters left wins, then most HP left
  endByTimer() {
    if (this.ended) return;
    const score = s => [s.team.filter(m => !m.fainted).length, s.team.reduce((a, m) => a + (m.fainted ? 0 : m.hp / m.maxhp), 0)];
    const [a, b] = this.sides.map(score);
    this.add('info', "Time's up! The battle is decided by fighters left, then HP left.");
    const w = a[0] !== b[0] ? (a[0] > b[0] ? 0 : 1) : Math.abs(a[1] - b[1]) > 1e-9 ? (a[1] > b[1] ? 0 : 1) : null;
    if (w === null) { this.add('win', 'The battle ended in a tie!'); this.end(null); } else this.win(w);
  }
  timeoutLoss(n) {
    if (this.ended) return;
    this.add('info', `${this.sides[n].name} ran out of time.`);
    this.win(1 - n);
  }
  P(mon) { return [mon.side.n, mon.pos]; }
  pct(mon) { return Math.ceil(mon.hp / mon.maxhp * 100); }
  inMeta(mon) { return { k: 'in', m: this.P(mon), gender: mon.v.illusion ? GENDER.defaultGender(mon.displaySpecies.id) : mon.gender, id: mon.displaySpecies.id, name: mon.displaySpecies.name, types: mon.v.illusion ? mon.displaySpecies.types : mon.types, hp: this.pct(mon), status: mon.status }; }
  random(n) { return Math.floor(this.rng() * n); }
  chance(pct) { return this.rng() * 100 < pct; }
  foeSide(side) { return this.sides[1 - side.n]; }
  actives(side) { return side.active.filter(m => m && !m.fainted); }
  allActive() { return this.sides.flatMap(s => this.actives(s)); }
  foesOf(mon) { return this.actives(this.foeSide(mon.side)); }
  allyOf(mon) { return this.actives(mon.side).find(m => m !== mon) || null; }
  isActive(mon) { return !!mon && !mon.fainted && mon.pos >= 0 && mon.side.active[mon.pos] === mon; }
  bench(side) { return side.team.filter(m => !m.fainted && m.pos < 0); }
  hasItem(mon, item) { return mon.item === item; }
  abilityActive(mon, attacker) { return (attacker && attacker !== mon && this.moldBreaker === attacker) ? {} : mon.spec; }
  emit() { this.onUpdate(); }

  // ---------------- requests & choices ----------------
  getRequest(n) {
    const side = this.sides[n];
    const team = side.team.map(m => this.monInfo(m, true));
    if (this.ended) return { kind: 'ended', team };
    if (this.pendingSwitches.length) {
      const ps = this.pendingSwitches[0];
      return ps.side === n ? { kind: 'switch', slots: [ps.pos], reason: ps.reason, team } : { kind: 'wait', team };
    }
    if (this.phase === 'switch') return side.needSwitch.length && !side.switchChoice ? { kind: 'switch', slots: side.needSwitch.slice(), reason: 'faint', team } : { kind: 'wait', team };
    if (side.choices) return { kind: 'wait', team, canUndo: !this.foeSide(side).choices };
    const actives = side.active.map((mon, pos) => {
      if (!mon || mon.fainted) return null;
      const locked = this.lockedMove(mon);
      const moves = mon.moves.map((mv, i) => {
        const md = MOVES[mv.name];
        return { name: mv.name, index: i, pp: mv.pp, maxpp: mv.maxpp, type: md.type, cat: md.cat, power: md.power, acc: md.acc, target: md.target, disabled: !this.canUseMove(mon, i) };
      });
      const fs = !locked && this.canFinalSmash(mon) ? FINAL_SMASHES[mon.item] : null;
      return { pos, teamIndex: mon.teamIndex, name: mon.species.name, moves, locked, struggle: !locked && !moves.some(m => !m.disabled), canSwitch: !this.isTrapped(mon) && this.bench(side).length > 0, finalSmash: fs ? { name: fs.name, id: fs.id } : null };
    });
    return { kind: 'move', format: this.format, actives, team };
  }
  canFinalSmash(mon) {
    const fs = FINAL_SMASHES[mon.item];
    return !!fs && !mon.mega && !mon.side.megaUsed && fs.bases.includes(mon.baseSpecies.id);
  }
  // a Final Smash stone can't be knocked off, stolen, swapped or flung
  canLoseItem(mon) { return !FINAL_SMASHES[mon.item]; }
  finalSmash(mon) {
    const fs = FINAL_SMASHES[mon.item];
    const oldName = mon.displaySpecies.name;
    const base = mon.baseSpecies;
    const ab = { name: fs.ability.name, desc: fs.ability.desc };
    mon.species = Object.assign({}, base, { id: fs.id, name: fs.name, types: fs.types.slice(), stats: fs.stats, abilities: [ab], hidden: ab, image: fs.image });
    for (const s of ['atk', 'def', 'spa', 'spd', 'spe']) mon.stats[s] = calcStat(s, fs.stats[s], mon.ivs[s], mon.evs[s], LEVEL, mon.nature);
    mon.types = fs.types.slice();
    mon.ability = mon.baseAbility = fs.ability.name;
    mon.displaySpecies = mon.species; mon.v.illusion = false;
    mon.mega = true; mon.side.megaUsed = true; mon.switchFlags.protean = false; mon.shownItem = mon.item; mon.shownAbility = mon.ability;
    this.add('mega', `${mon.side.name}'s ${oldName} is using its Final Smash!`, { k: 'mega', m: this.P(mon), id: fs.id, name: fs.name, types: mon.types, from: base.id });
    this.add('mega', `${oldName} became ${fs.name}!`, { k: 'types', m: this.P(mon), types: mon.types });
    this.abilityOnStart(mon);
  }
  lockedMove(mon) {
    if (mon.v.charging) return mon.v.charging.move;
    if (mon.v.outrage) return 'Outrage';
    return null;
  }
  canUseMove(mon, i) {
    const mv = mon.moves[i]; const md = MOVES[mv.name];
    if (mv.pp <= 0) return false;
    if (mon.v.disable && mon.v.disable.move === mv.name) return false;
    if (mon.v.taunt && md.cat === 'Status') return false;
    if (mon.v.encore && mon.v.encore.move !== mv.name) return false;
    if (mon.v.choiceLock && mon.v.choiceLock !== mv.name && mon.moves.some(x => x.name === mon.v.choiceLock)) return false;
    if (this.hasItem(mon, 'Assault Vest') && md.cat === 'Status') return false;
    if (this.field.gravity && (md.semi === 'fly' || mv.name === 'High Jump Kick')) return false;
    return true;
  }
  isTrapped(mon) {
    if (mon.v.ingrain) return true;
    if (mon.types.includes('Ghost')) return false;
    return !!(mon.v.trapped && this.isActive(mon.v.trapped));
  }

  choose(n, choice) {
    if (this.ended) return 'The battle is over.';
    const side = this.sides[n];
    const req = this.getRequest(n);
    choice = choice || {};
    if (req.kind === 'wait' || req.kind === 'ended') return 'Not your turn to choose.';
    if (req.kind === 'switch') {
      const sw = choice.switches || [];
      if (sw.length !== req.slots.length) return `Choose ${req.slots.length} fighter(s) to send in.`;
      const used = new Set(); const slots = new Set();
      for (const s of sw) {
        const m = side.team[s.index | 0];
        if (!req.slots.includes(s.pos) || slots.has(s.pos) || !m || m.fainted || m.pos >= 0 || used.has(s.index)) return 'Invalid switch.';
        used.add(s.index); slots.add(s.pos);
      }
      if (this.pendingSwitches.length) {
        this.pendingSwitches.shift();
        this.doSwitch(side, sw[0].pos, sw[0].index | 0);
        if (this.pendingSwitches.length) { this.emit(); return null; }
        this.continueTurn();
        return null;
      }
      side.switchChoice = sw;
      if (this.sides.every(s => !s.needSwitch.length || s.switchChoice)) this.resolveFaintSwitches(); else this.emit();
      return null;
    }
    // move phase
    const acts = choice.actions || [];
    const out = []; const switching = new Set();
    for (const a of req.actives) {
      if (!a) continue;
      const mon = side.active[a.pos];
      const c = acts.find(x => x.pos === a.pos) || {};
      if (c.type === 'switch') {
        const m = side.team[c.index | 0];
        if (!a.canSwitch) return `${mon.species.name} can't switch out.`;
        if (!m || m.fainted || m.pos >= 0 || switching.has(c.index)) return 'Invalid switch.';
        switching.add(c.index);
        out.push({ kind: 'switch', mon, pos: a.pos, index: c.index | 0 });
      } else if (a.locked) out.push({ kind: 'move', mon, pos: a.pos, move: a.locked, locked: true, target: mon.v.lockTarget });
      else if (a.struggle) out.push({ kind: 'move', mon, pos: a.pos, move: 'Struggle' });
      else {
        const i = c.index | 0;
        if (!mon.moves[i] || !this.canUseMove(mon, i)) return `${mon.species.name} can't use that move.`;
        if (c.mega) {
          if (!a.finalSmash) return `${mon.species.name} can't use its Final Smash.`;
          if (out.some(o => o.mega)) return 'Only one fighter can use its Final Smash.';
        }
        out.push({ kind: 'move', mon, pos: a.pos, move: mon.moves[i].name, target: c.target, mega: !!c.mega });
      }
    }
    side.choices = out;
    if (this.sides.every(s => s.choices || !this.actives(s).length)) this.runTurn(); else this.emit();
    return null;
  }
  undo(n) {
    const side = this.sides[n];
    if (this.phase === 'move' && side.choices && !this.foeSide(side).choices) { side.choices = null; this.emit(); }
  }
  forfeit(n) {
    if (this.ended) return;
    this.add('info', `${this.sides[n].name} forfeited.`);
    this.win(1 - n);
  }

  // ---------------- flow ----------------
  start() {
    this.add('info', `${this.format === 'doubles' ? 'Double' : 'Single'} Battle: ${this.sides[0].name} vs ${this.sides[1].name}!`);
    for (const s of this.sides) for (let p = 0; p < this.activeCount; p++) if (s.team[p]) this.placeMon(s, p, s.team[p]);
    const order = this.speedOrder(this.allActive());
    for (const m of order) { const n = this.illusionName(m); this.add('switch', `${m.side.name} sent out ${n}!`, this.inMeta(m)); }
    for (const m of order) this.onSwitchIn(m);
    this.turn = 1; this.add('turn', 'Turn 1');
  }
  placeMon(side, pos, mon) { side.active[pos] = mon; mon.pos = pos; mon.revealed = true; }
  illusionName(mon) {
    if (mon.spec.illusion && !mon.once.illusionBroken) {
      const others = mon.side.team.filter(x => !x.fainted && x !== mon);
      if (others.length) { mon.displaySpecies = others[others.length - 1].species; mon.v.illusion = true; }
    }
    return mon.displaySpecies.name;
  }
  runTurn() {
    // Final Smashes happen before anything else this turn, fastest first; new stats apply to turn order
    const megas = this.sides.flatMap(s => (s.choices || []).filter(a => a.kind === 'move' && a.mega && this.canFinalSmash(a.mon)));
    for (const a of this.speedOrder(megas.map(x => x.mon))) this.finalSmash(a);
    const actions = [];
    for (const s of this.sides) {
      for (const a of (s.choices || [])) {
        if (a.kind === 'switch') actions.push(Object.assign(a, { side: s, prio: 7, spe: this.getSpeed(a.mon) }));
        else actions.push(Object.assign(a, { side: s, prio: this.getPriority(a.mon, getMove(a.move)), spe: this.getSpeed(a.mon) }));
      }
      s.choices = null;
    }
    for (const a of actions) if (a.kind === 'move' && a.move === 'Focus Punch' && !a.mon.fainted) this.add('effect', `${a.mon.label} is tightening its focus!`);
    this.queue = this.sortActions(actions);
    for (const a of this.queue) if (a.kind === 'move') a.mon.v.plannedMove = a.move;
    this.continueTurn();
  }
  sortActions(actions) {
    const tr = this.field.trickroom > 0;
    return actions.sort((a, b) => {
      if (b.prio !== a.prio) return b.prio - a.prio;
      if (a.spe !== b.spe) return tr && a.kind === 'move' ? a.spe - b.spe : b.spe - a.spe;
      return this.rng() < 0.5 ? -1 : 1;
    });
  }
  continueTurn() {
    while (this.queue.length && !this.ended) {
      const a = this.queue.shift();
      if (a.kind === 'switch') { if (this.isActive(a.mon)) this.doSwitch(a.side, a.mon.pos, a.index); }
      else if (this.isActive(a.mon)) this.useMove(a.mon, a.move, a);
      if (this.checkWin()) return;
      if (this.pendingSwitches.length) { this.emit(); return; }
    }
    if (this.ended) return;
    this.endOfTurn();
  }
  endOfTurn() {
    this.residuals();
    if (this.checkWin()) return;
    if (this.computeNeedSwitch()) { this.phase = 'switch'; this.emit(); return; }
    this.nextTurn();
  }
  computeNeedSwitch() {
    let any = false;
    for (const s of this.sides) {
      s.switchChoice = null;
      const empty = s.active.map((m, p) => (!m || m.fainted) ? p : -1).filter(p => p >= 0);
      s.needSwitch = empty.slice(0, this.bench(s).length);
      if (s.needSwitch.length) any = true;
    }
    return any;
  }
  nextTurn() {
    this.phase = 'move'; this.turn++;
    this.add('turn', `Turn ${this.turn}`);
    this.emit();
  }
  resolveFaintSwitches() {
    const mons = [];
    for (const s of this.sides) if (s.needSwitch.length && s.switchChoice) {
      for (const sw of s.switchChoice) {
        const old = s.active[sw.pos]; if (old) old.pos = -1;
        const m = s.team[sw.index]; m.resetVolatiles(); this.placeMon(s, sw.pos, m); mons.push(m);
      }
      s.switchChoice = null; s.needSwitch = [];
    }
    const order = this.speedOrder(mons);
    for (const m of order) { const n = this.illusionName(m); this.add('switch', `${m.side.name} sent out ${n}!`, this.inMeta(m)); }
    for (const m of order) if (!m.fainted) this.onSwitchIn(m);
    if (this.checkWin()) return;
    if (this.computeNeedSwitch()) { this.emit(); return; }
    this.nextTurn();
  }
  checkWin() {
    const alive = this.sides.map(s => s.team.some(m => !m.fainted));
    if (!alive[0] && !alive[1]) { this.add('win', 'The battle ended in a tie!'); this.end(null); return true; }
    for (let i = 0; i < 2; i++) if (!alive[i]) { this.win(1 - i); return true; }
    return false;
  }
  win(n) { this.add('win', `${this.sides[n].name} won the battle!`); this.end(n); }
  end(n) { this.ended = true; this.winner = n; this.phase = 'ended'; this.queue = []; this.pendingSwitches = []; this.emit(); }
  speedOrder(mons) {
    const tr = this.field.trickroom > 0;
    return mons.filter(Boolean).sort((a, b) => { const d = this.getSpeed(b) - this.getSpeed(a); return d ? (tr ? -d : d) : (this.rng() < 0.5 ? -1 : 1); });
  }

  // ---------------- switching ----------------
  doSwitch(side, pos, index) {
    const out = side.active[pos];
    if (out && !out.fainted) this.onSwitchOut(out);
    if (out) out.pos = -1;
    const inc = side.team[index];
    inc.resetVolatiles();
    this.placeMon(side, pos, inc);
    { const n = this.illusionName(inc); this.add('switch', `${side.name} sent out ${n}!`, this.inMeta(inc)); }
    this.onSwitchIn(inc);
  }
  onSwitchOut(mon) {
    const s = mon.spec;
    if (s.regenerator && !mon.fainted) mon.hp = Math.min(mon.maxhp, mon.hp + Math.floor(mon.maxhp / 3));
    if (s.naturalCure && mon.status) mon.status = '';
    for (const o of this.allActive()) if (o.v.trapped === mon) delete o.v.trapped;
    this.add('switch', `${mon.side.name} withdrew ${mon.displaySpecies.name}.`, { k: 'out', m: this.P(mon) });
    mon.resetVolatiles();
  }
  onSwitchIn(mon) {
    const cond = mon.side.conditions;
    const hz = mon.spec.hazardImmune || [];
    if (!this.hasItem(mon, 'Heavy-Duty Boots')) {
      if (cond.stealthrock) this.damage(mon, Math.floor(mon.maxhp * effectiveness('Rock', mon.types) / 8), `${mon.label} was hurt by the pointed stones!`);
      if (mon.fainted) return;
      if (this.isGrounded(mon)) {
        if (cond.spikes && !hz.includes('spikes')) this.damage(mon, Math.floor(mon.maxhp * [0, 1 / 8, 1 / 6, 1 / 4][cond.spikes]), `${mon.label} was hurt by the spikes!`);
        if (mon.fainted) return;
        if (cond.toxicspikes && !hz.includes('toxicspikes')) {
          if (mon.types.includes('Poison')) { delete cond.toxicspikes; this.add('effect', `${mon.label} absorbed the poison spikes!`); }
          else this.trySetStatus(mon, cond.toxicspikes >= 2 ? 'tox' : 'psn', null, true);
        }
        if (cond.stickyweb && !hz.includes('stickyweb')) { this.add('effect', `${mon.label} was caught in a sticky web!`); this.boost(mon, { spe: -1 }, null); }
      }
    }
    if (mon.fainted) return;
    this.abilityOnStart(mon);
    this.checkThresholds(mon);
  }
  abilityOnStart(mon) {
    const s = mon.spec; const foes = this.foesOf(mon);
    if (s.intimidate && foes.length) {
      this.add('ability', `${mon.label}'s ${mon.ability} intimidates the opposing team!`);
      for (const foe of foes) {
        if (foe.spec.noIntimidate) this.add('effect', `${foe.label} isn't affected!`);
        else if (foe.v.substitute) this.add('effect', `${foe.label}'s substitute blocked it!`);
        else { this.boost(foe, { atk: -1 }, mon); if (foe.spec.rattled) this.boost(foe, { spe: 1 }, foe); }
      }
    }
    if (s.trace) {
      const opts = foes.filter(f => !f.spec.trace && !f.spec.illusion);
      if (opts.length) {
        const foe = opts[this.random(opts.length)];
        mon.ability = foe.ability;
        this.add('ability', `${mon.label} copied ${foe.label}'s ${foe.ability}!`);
        if (mon.ability !== mon.baseAbility) this.abilityOnStart(mon);
        return;
      }
    }
    if (s.frisk) for (const foe of foes) if (foe.item) this.add('ability', `${mon.label} frisked ${foe.label} and found its ${foe.item}!`);
    if (s.anticipation && foes.some(f => f.moves.some(mv => { const md = MOVES[mv.name]; return md.cat !== 'Status' && effectiveness(md.type, mon.types) > 1; })))
      this.add('ability', `${mon.label} shuddered! It senses danger.`);
    if (s.copyBoosts) {
      let any = false;
      for (const foe of foes) for (const k of BOOST_STATS) if (foe.boosts[k] > mon.boosts[k] && foe.boosts[k] > 0) { mon.boosts[k] = foe.boosts[k]; any = true; }
      if (any) this.add('ability', `${mon.label} copied the opposing stat boosts!`);
    }
    if (s.clearFoeBoosts && foes.some(f => BOOST_STATS.some(k => f.boosts[k]))) {
      for (const foe of foes) for (const k of BOOST_STATS) foe.boosts[k] = 0;
      this.add('ability', `${mon.label}'s Ball of Light erased the opposing stat changes!`);
    }
    if (s.startSide) {
      const { cond, turns } = s.startSide;
      if (!mon.side.conditions[cond]) { mon.side.conditions[cond] = turns; this.add('ability', `${mon.label}'s ${mon.ability} set up ${cond === 'tailwind' ? 'a tailwind' : 'Reflect'}!`); }
    }
    if (s.startField && !this.field[s.startField.cond]) { this.field[s.startField.cond] = s.startField.turns; this.add('ability', `${mon.label}'s ${mon.ability} intensified gravity!`, this.fieldA()); }
    if (s.startWeather) this.setWeather(s.startWeather, mon, 5);
    if (s.download && foes.length) {
      const def = foes.reduce((a, f) => a + this.getStat(f, 'def'), 0), spd = foes.reduce((a, f) => a + this.getStat(f, 'spd'), 0);
      this.add('ability', `${mon.label}'s ${mon.ability} analyzed the foe!`); this.boost(mon, { [def < spd ? 'atk' : 'spa']: 1 }, mon);
    }
    if (s.announcement && !mon.once.announced) {
      mon.once.announced = true;
      if (mon.side.team.some(m => m.status)) { for (const m of mon.side.team) m.status = ''; this.add('ability', `${mon.label}'s Morning Announcement cured the team's status conditions!`); }
    }
    if (s.startBoost) { this.add('ability', `${mon.label}'s ${mon.ability} activated!`); this.boost(mon, s.startBoost, mon); }
    if (s.pressure) this.add('ability', `${mon.label} is exerting its pressure!`);
    if (s.unnerve) this.add('ability', `The opposing team is too nervous to eat Berries!`);
  }

  // ---------------- stats ----------------
  getStat(mon, stat, opts = {}) {
    let stage = mon.boosts[stat];
    if (opts.ignorePositive && stage > 0) stage = 0;
    if (opts.ignoreNegative && stage < 0) stage = 0;
    let v = Math.floor(mon.stats[stat] * boostMult(stage));
    const s = mon.spec; const item = mon.item;
    const evio = item === 'Eviolite' && EVIOLITE_USERS.includes(mon.species.id);
    if (stat === 'atk') {
      if (item === 'Choice Band') v *= 1.5;
      if (s.guts && mon.status) v *= 1.5;
      const l = s.lowHpStat;
      if (l && l.stat === 'atk' && (l.strict ? mon.hpFrac() < l.below : mon.hpFrac() <= l.below)) v *= l.mult;
    }
    if (stat === 'spa') { if (item === 'Choice Specs') v *= 1.5; if (s.solarPower && this.field.weather === 'sun') v *= 1.5; }
    if (stat === 'spd') { if (item === 'Assault Vest') v *= 1.5; if (evio) v *= 1.5; }
    if (stat === 'def') { if (evio) v *= 1.5; if (this.field.weather === 'snow' && mon.types.includes('Ice')) v *= 1.5; }
    return Math.floor(v);
  }
  getSpeed(mon) {
    if (!mon) return 0;
    let v = this.getStat(mon, 'spe');
    if (mon.item === 'Choice Scarf') v *= 1.5;
    if (mon.status === 'par') v *= 0.5;
    if (mon.side.conditions.tailwind) v *= 2;
    const s = mon.spec;
    if (s.weatherSpeed && this.field.weather === s.weatherSpeed) v *= 2;
    if (s.unburden && mon.unburdened) v *= 2;
    return Math.floor(v);
  }
  getPriority(mon, md) {
    let p = md.prio || 0; const s = mon.spec;
    if (s.prankster && md.cat === 'Status') p += 1;
    if (s.galeWings && md.type === 'Flying' && mon.hp === mon.maxhp) p += 1;
    if (s.firstMovePrio && !mon.movedSinceSwitch) p += 1;
    return p;
  }
  isGrounded(mon, attacker) {
    if (this.field.gravity || mon.v.ingrain) return true;
    if (mon.types.includes('Flying') || mon.item === 'Air Balloon') return false;
    return !this.abilityActive(mon, attacker).levitate;
  }

  // ---------------- HP / status ----------------
  damage(mon, amt, msg) {
    if (mon.fainted || amt <= 0) return 0;
    amt = Math.min(Math.max(1, Math.floor(amt)), mon.hp);
    mon.hp -= amt;
    this.add(msg ? 'dmg' : 'hp', msg || '', { k: 'hp', m: this.P(mon), hp: this.pct(mon), dmg: true });
    if (mon.hp <= 0) this.faint(mon); else this.checkThresholds(mon);
    return amt;
  }
  heal(mon, amt, msg) {
    if (mon.fainted || mon.hp >= mon.maxhp) return 0;
    const h = Math.min(Math.max(1, Math.floor(amt)), mon.maxhp - mon.hp);
    mon.hp += h; this.add(msg ? 'heal' : 'hp', msg || '', { k: 'hp', m: this.P(mon), hp: this.pct(mon), heal: true });
    return h;
  }
  faint(mon) {
    mon.hp = 0; mon.fainted = true; mon.status = '';
    this.add('faint', `${mon.label} fainted!`, { k: 'faint', m: this.P(mon) });
    this.queue = this.queue.filter(a => a.mon !== mon);
    for (const o of this.allActive()) if (o.v.trapped === mon) delete o.v.trapped;
  }
  checkThresholds(mon) {
    if (mon.fainted) return;
    const t = mon.spec.threshold;
    if (t && !mon.once.threshold && mon.hpFrac() <= t.below) {
      mon.once.threshold = true;
      this.add('ability', `${mon.label}'s ${mon.ability} activated!`);
      if (t.heal) this.heal(mon, mon.maxhp * t.heal, `${mon.label} restored HP!`);
      if (t.boosts) this.boost(mon, t.boosts, mon);
    }
    if (mon.item === 'Sitrus Berry' && mon.hpFrac() <= 0.5) this.eatBerry(mon, () => this.heal(mon, mon.maxhp / 4 * (mon.spec.ripen ? 2 : 1), `${mon.label} restored HP with its Sitrus Berry!`));
  }
  eatBerry(mon, effect) {
    if (this.foesOf(mon).some(f => f.spec.unnerve)) return;
    const item = mon.item; const s = mon.spec;
    effect();
    if (s.berryBonusHeal) this.heal(mon, mon.maxhp * s.berryBonusHeal, `${mon.label}'s ${mon.ability} restored extra HP!`);
    if (s.berryRandomBoost) this.boost(mon, { [['atk', 'def', 'spa', 'spd', 'spe'][this.random(5)]]: 1 }, mon);
    mon.berryUses++;
    if (s.berryTwice && mon.berryUses < 2) { this.add('ability', `${mon.label} saved half of its ${item} for later!`); return; }
    this.loseItem(mon, true);
  }
  loseItem(mon, consumed) {
    if (!mon.item) return;
    if (consumed) { mon.consumedItem = mon.item; mon.v.consumedThisTurn = true; }
    mon.item = '';
    delete mon.v.choiceLock;
    if (mon.spec.unburden) mon.unburdened = true;
  }
  canStatus(mon, status, source) {
    if (mon.fainted || mon.status) return false;
    const s = (source && source !== mon) ? this.abilityActive(mon, source) : mon.spec;
    if (s.statusImmune && s.statusImmune.includes(status)) return false;
    if (s.statusImmuneTurns && mon.turnsActive < s.statusImmuneTurns) return false;
    const t = mon.types;
    if (status === 'brn' && t.includes('Fire')) return false;
    if (status === 'par' && t.includes('Electric')) return false;
    if ((status === 'psn' || status === 'tox') && (t.includes('Poison') || t.includes('Steel'))) return false;
    if (status === 'frz' && (t.includes('Ice') || this.field.weather === 'sun')) return false;
    return true;
  }
  trySetStatus(mon, status, source, fromHazard, quiet) {
    if (status === 'tri') status = ['brn', 'par', 'frz'][this.random(3)];
    if (!this.canStatus(mon, status, source)) { if (!quiet) this.add('effect', `It doesn't affect ${mon.label}...`); return false; }
    mon.status = status; mon.statusTurns = status === 'slp' ? 2 + this.random(3) : 0; mon.toxCount = 0;
    this.add('status', `${mon.label} was ${STATUS_LABEL[status]}!`, { k: 'status', m: this.P(mon), status });
    if (this.hasItem(mon, 'Lum Berry')) this.eatBerry(mon, () => { mon.status = ''; this.add('heal', `${mon.label}'s Lum Berry cured it!`); });
    return true;
  }
  tryConfuse(mon, source) {
    if (mon.fainted || mon.v.confusion) return;
    const s = source && source !== mon ? this.abilityActive(mon, source) : mon.spec;
    if (s.noConfusion) return;
    mon.v.confusion = 2 + this.random(4);
    this.add('status', `${mon.label} became confused!`);
    if (this.hasItem(mon, 'Lum Berry')) this.eatBerry(mon, () => { delete mon.v.confusion; this.add('heal', `${mon.label}'s Lum Berry snapped it out of confusion!`); });
  }
  boost(mon, boosts, source) {
    if (mon.fainted) return;
    const fromFoe = source && source.side !== mon.side;
    const s = fromFoe ? this.abilityActive(mon, source) : mon.spec;
    let dropped = false;
    for (const [k, raw] of Object.entries(boosts)) {
      if (!raw) continue;
      if (raw < 0 && fromFoe && s.clearBody) { this.add('ability', `${mon.label}'s ${mon.ability} prevents its stats from being lowered!`); continue; }
      const before = mon.boosts[k];
      mon.boosts[k] = clamp(before + raw, -6, 6);
      const diff = mon.boosts[k] - before;
      if (!diff) { this.add('effect', `${mon.label}'s ${STAT_LABEL[k]} won't go any ${raw > 0 ? 'higher' : 'lower'}!`); continue; }
      const word = Math.abs(diff) >= 3 ? ' drastically' : Math.abs(diff) === 2 ? ' sharply' : '';
      this.add('boost', `${mon.label}'s ${STAT_LABEL[k]} ${diff > 0 ? 'rose' : 'fell'}${word}!`, { k: 'boost', m: this.P(mon), up: diff > 0, stat: k, n: diff });
      if (diff < 0 && fromFoe) dropped = true;
    }
    if (dropped && s.onStatDrop) { this.add('ability', `${mon.label}'s ${mon.ability} activated!`); this.boost(mon, s.onStatDrop, mon); }
  }
  setWeather(w, source, turns) {
    if (this.field.weather === w) return false;
    this.field.weather = w; this.field.weatherTurns = turns;
    this.add('weather', { rain: 'It started to rain!', sun: 'The sunlight turned harsh!', snow: 'It started to snow!' }[w], this.fieldA());
    return true;
  }
  // log metadata: the field right after a change (the client draws weather / Trick Room / Gravity from it)
  fieldA() { const f = this.field; return { k: 'field', f: { weather: f.weather, weatherTurns: f.weatherTurns, trickroom: f.trickroom, gravity: f.gravity } }; }

  // ---------------- targeting ----------------
  resolveTargets(mon, md, chosen) {
    const foes = this.foesOf(mon);
    const t = md.target || 'normal';
    if (t === 'allFoes') return foes;
    if (t === 'all') return this.allActive().filter(m => m !== mon);
    if (t === 'randomFoe') return foes.length ? [foes[this.random(foes.length)]] : [];
    if (t === 'self' || t === 'foeSide' || t === 'scripted') return [];
    if (chosen && this.sides[chosen.side]) {
      const m = this.sides[chosen.side].active[chosen.pos];
      if (m && !m.fainted && m !== mon) return [m];
      if (chosen.side === mon.side.n) return []; // the chosen ally is gone
    }
    // default / retarget: a foe (the other one if the chosen foe fainted)
    if (!foes.length) return [];
    return [foes[this.random(foes.length)]];
  }

  setMoveTargets(targets) { if (this.curMove && this.curMove.a) this.curMove.a.t = targets.filter(Boolean).map(t => this.P(t)); }

  // ---------------- moves ----------------
  useMove(mon, moveName, action) {
    if (moveName && MOVES[moveName]) { mon.shownMoves = mon.shownMoves || []; if (!mon.shownMoves.includes(moveName)) mon.shownMoves.push(moveName); }
    if (mon.v.flinch) { this.add('effect', `${mon.label} flinched and couldn't move!`, { k: 'flinch', m: this.P(mon) }); if (mon.spec.steadfast) this.boost(mon, { spe: 1 }, mon); return this.afterFail(mon); }
    if (mon.status === 'slp') {
      mon.statusTurns--;
      if (mon.statusTurns > 0) { this.add('effect', `${mon.label} is fast asleep.`); return this.afterFail(mon); }
      mon.status = ''; this.add('effect', `${mon.label} woke up!`);
    }
    if (mon.status === 'frz') {
      if ((MOVES[moveName] && MOVES[moveName].thaws) || this.chance(20)) { mon.status = ''; this.add('effect', `${mon.label} thawed out!`); }
      else { this.add('effect', `${mon.label} is frozen solid!`); return this.afterFail(mon); }
    }
    if (mon.v.confusion) {
      mon.v.confusion--;
      if (mon.v.confusion <= 0) { delete mon.v.confusion; this.add('effect', `${mon.label} snapped out of its confusion!`); }
      else {
        this.add('effect', `${mon.label} is confused!`);
        if (this.chance(33)) { this.damage(mon, this.confusionDamage(mon), 'It hurt itself in its confusion!'); return this.afterFail(mon); }
      }
    }
    if (mon.v.attract && this.isActive(mon.v.attract) && this.chance(50)) { this.add('effect', `${mon.label} is immobilized by love!`); return this.afterFail(mon); }
    if (mon.status === 'par' && this.chance(25)) { this.add('effect', `${mon.label} is paralyzed! It can't move!`); return this.afterFail(mon); }

    let md = getMove(moveName);
    const slotObj = mon.moves.find(x => x.name === moveName);
    let chosen = action && action.target;
    if (!action || !action.locked) {
      if (slotObj) {
        if (mon.v.taunt && md.cat === 'Status') { this.add('effect', `${mon.label} can't use ${moveName} after the taunt!`); return; }
        const pre = md.target === 'normal' || md.target === 'allFoes' || md.target === 'all' ? this.foesOf(mon) : [];
        slotObj.pp = Math.max(0, slotObj.pp - (pre.some(t => t.spec.pressure) ? 2 : 1));
      }
    }
    mon.movedSinceSwitch = true;
    if (slotObj && ['Choice Band', 'Choice Specs', 'Choice Scarf'].includes(mon.item)) mon.v.choiceLock = moveName;
    if (moveName === 'Metronome' || moveName === 'Copycat') {
      this.add('move', `${mon.label} used ${moveName}!`, { k: 'move', u: this.P(mon), name: moveName, type: 'Normal', cat: 'Status', t: [] });
      let called;
      if (moveName === 'Metronome') { const pool = Object.keys(MOVES).filter(n => !NO_METRONOME.has(n)); called = pool[this.random(pool.length)]; }
      else called = this.lastMoveUsed && !NO_METRONOME.has(this.lastMoveUsed) ? this.lastMoveUsed : null;
      if (!called) { this.add('effect', 'But it failed!'); return; }
      this.add('effect', `${moveName} called ${called}!`);
      moveName = called; md = MOVES[called]; chosen = null;
    }
    if (md.charge && !mon.v.charging && !(md.sunSkip && this.field.weather === 'sun')) {
      this.add('move', `${mon.label} used ${moveName}!`, { k: 'move', u: this.P(mon), name: moveName, type: md.type, cat: md.cat, t: [], charge: md.semi || true });
      mon.v.charging = { move: moveName, semi: md.semi }; mon.v.lockTarget = chosen;
      this.add('effect', `${mon.label} ${{ fly: 'flew up high!', dig: 'burrowed underground!', dive: 'hid underwater!', phantom: 'vanished instantly!' }[md.semi] || 'is charging up!'}`);
      if (md.chargeBoost) this.boost(mon, md.chargeBoost, mon);
      return;
    }
    delete mon.v.charging;
    this.curMove = this.add('move', `${mon.label} used ${moveName}!`, { k: 'move', u: this.P(mon), name: moveName, type: md.type, cat: md.cat, t: [] });
    if (moveName !== 'Struggle') this.lastMoveUsed = moveName;
    mon.lastMove = moveName;
    if (md.special === 'focuspunch' && mon.v.tookDamage) { this.add('effect', `${mon.label} lost its focus and couldn't move!`); return; }
    if (mon.spec.protean && !mon.switchFlags.protean && moveName !== 'Struggle' && !(mon.types.length === 1 && mon.types[0] === md.type)) {
      mon.types = [md.type]; mon.switchFlags.protean = true;
      this.add('ability', `${mon.label}'s ${mon.ability} made it the ${md.type} type!`, { k: 'types', m: this.P(mon), types: mon.types });
    }
    this.moldBreaker = (mon.spec.moldBreaker || (mon.spec.fireBreaker && md.type === 'Fire')) ? mon : null;
    try {
      if (md.cat === 'Status') this.runStatusMove(mon, md, chosen);
      else this.runAttack(mon, md, chosen);
    } finally { this.moldBreaker = null; }
    if (md.special === 'outrage' && !mon.fainted) {
      if (!mon.v.outrage) mon.v.outrage = 1 + this.random(2);
      else if (--mon.v.outrage <= 0) { delete mon.v.outrage; this.add('effect', `${mon.label} became confused due to fatigue!`); this.tryConfuse(mon, mon); }
    }
    if (md.special === 'steelbeam' && !mon.fainted) this.damage(mon, Math.ceil(mon.maxhp / 2), `${mon.label} lost half its HP to power the beam!`);
  }
  afterFail(mon) { delete mon.v.charging; delete mon.v.outrage; mon.v.rollout = 0; mon.movedSinceSwitch = true; }
  confusionDamage(mon) { return Math.floor(Math.floor(Math.floor(2 * LEVEL / 5 + 2) * 40 * this.getStat(mon, 'atk') / this.getStat(mon, 'def')) / 50) + 2; }

  accuracyCheck(mon, target, md, moveName) {
    if (target.v.charging && target.v.charging.semi && !(md.hitsSemi && md.hitsSemi.includes(target.v.charging.semi))) { this.add('effect', `${target.label} avoided the attack!`, { k: 'pop', m: this.P(target), text: 'Missed!', tone: 'miss' }); return false; }
    if (md.acc === true) return true;
    if (md.poisonNeverMiss && mon.types.includes('Poison')) return true;
    if (moveName === 'Bounce' && mon.spec.bounceBoost) return true;
    const w = this.field.weather;
    if ((md.rainAcc && w === 'rain') || (md.snowAcc && w === 'snow')) return true;
    let acc = md.rainAcc && w === 'sun' ? 50 : md.acc;
    acc *= accMult(clamp(mon.boosts.accuracy - (md.ignoreDefBoosts ? 0 : target.boosts.evasion), -6, 6));
    if (mon.spec.accMult) acc *= mon.spec.accMult;
    if (this.field.gravity) acc *= 5 / 3;
    if (this.rng() * 100 < acc) return true;
    this.add('effect', `${target.label} avoided the attack!`, { k: 'pop', m: this.P(target), text: 'Missed!', tone: 'miss' });
    if (target.spec.foeMissBoost && !target.fainted) { this.add('ability', `${target.label}'s ${target.ability} activated!`); this.boost(target, target.spec.foeMissBoost, target); }
    return false;
  }
  checkProtect(mon, target, md) {
    if (!target.v.protect) return false;
    if (md.breaksProtect) { delete target.v.protect; this.add('effect', `${mon.label} broke through the protection!`); return false; }
    this.add('effect', `${target.label} protected itself!`, { k: 'protect', m: this.P(target), blocked: true });
    if (target.v.protect === 'kings' && this.makesContact(mon, md)) this.boost(mon, { atk: -1 }, target);
    const ts = target.spec;
    if (ts.protectFoeBoost) { this.add('ability', `${target.label}'s ${target.ability} activated!`); this.boost(mon, ts.protectFoeBoost, target); }
    if (ts.protectSelfBoost) { this.add('ability', `${target.label}'s ${target.ability} activated!`); this.boost(target, ts.protectSelfBoost, target); }
    return true;
  }
  makesContact(mon, md) { return !!md.contact && !mon.spec.longReach; }
  isReflectable(md) {
    if (md.cat !== 'Status') return false;
    if (md.status || md.hazard || (md.boosts && md.boosts.target === 'foe')) return true;
    return ['taunt', 'encore', 'disable', 'leechseed', 'forceswitch', 'partingshot'].includes(md.special);
  }

  runStatusMove(mon, md, chosen) {
    const name = md.name;
    let user = mon, target = null;
    if (md.target === 'normal') {
      target = this.resolveTargets(mon, md, chosen)[0];
      if (!target) { this.add('effect', 'But there was no target...'); return; }
      const vsFoe = target.side !== mon.side;
      if (vsFoe && mon.spec.prankster && target.types.includes('Dark')) { this.add('effect', `It doesn't affect ${target.label}...`); return; }
      this.setMoveTargets([target]);
      if (this.checkProtect(mon, target, md)) return;
      if (vsFoe && this.isReflectable(md) && (target.v.magiccoat || this.abilityActive(target, mon).magicBounce)) {
        this.add('effect', `${target.label} bounced the ${name} back!`);
        user = target; target = mon;
      }
      this.setMoveTargets([target]);
      if (md.acc !== true && !this.accuracyCheck(user, target, md, name)) return;
      if (target.v.substitute && !md.sound && !user.spec.infiltrator && md.special !== 'painsplit') { this.add('effect', 'But it failed!'); return; }
      if (md.powder && target.types.includes('Grass')) { this.add('effect', `It doesn't affect ${target.label}...`); return; }
    }
    if (mon.spec.statusMoveHeal) this.heal(mon, mon.maxhp * mon.spec.statusMoveHeal, `${mon.label} restored a little HP with ${mon.ability}!`);
    if (md.status) { this.trySetStatus(target, md.status, user); return; }
    if (md.boosts) { const { target: who, ...b } = md.boosts; this.boost(who === 'self' ? user : target, b, user); return; }
    if (md.heal) {
      if (user.hp >= user.maxhp) { this.add('effect', `${user.label}'s HP is full!`); return; }
      let f = md.heal;
      if (md.sunHeal) { const w = this.field.weather; f = w === 'sun' ? 2 / 3 : (w === 'rain' || w === 'snow') ? 0.25 : 0.5; }
      if (user.spec.healBoost) f *= user.spec.healBoost;
      this.heal(user, user.maxhp * f, `${user.label} restored HP!`); return;
    }
    if (md.weather) { if (!this.setWeather(md.weather, user, 5)) this.add('effect', 'But it failed!'); return; }
    if (md.field === 'trickroom') {
      if (this.field.trickroom) { this.field.trickroom = 0; this.add('field', 'The twisted dimensions returned to normal!', this.fieldA()); }
      else { this.field.trickroom = 5; this.add('field', `${user.label} twisted the dimensions!`, this.fieldA()); }
      return;
    }
    if (md.field === 'gravity') {
      if (this.field.gravity) { this.add('effect', 'But it failed!'); return; }
      this.field.gravity = 5; this.add('field', 'Gravity intensified!', this.fieldA());
      for (const a of this.allActive()) if (a.v.charging && a.v.charging.semi === 'fly') delete a.v.charging;
      return;
    }
    if (md.side) {
      const c = user.side.conditions;
      if (c[md.side]) { this.add('effect', 'But it failed!'); return; }
      c[md.side] = md.side === 'tailwind' ? 4 : (this.hasItem(user, 'Light Clay') ? 8 : 5);
      this.add('field', { reflect: `Reflect made ${user.side.name}'s team stronger against physical moves!`, lightscreen: `Light Screen made ${user.side.name}'s team stronger against special moves!`, tailwind: `The tailwind blew from behind ${user.side.name}'s team!` }[md.side]);
      return;
    }
    if (md.hazard) {
      const fs = this.foeSide(user.side);
      if (this.actives(fs).some(f => f.spec.magicBounce)) { this.add('effect', `The ${name} was bounced back!`); return; }
      const c = fs.conditions; const h = md.hazard;
      if ((c[h] || 0) >= { spikes: 3, toxicspikes: 2, stealthrock: 1, stickyweb: 1 }[h]) { this.add('effect', 'But it failed!'); return; }
      c[h] = (c[h] || 0) + 1;
      this.add('field', { spikes: 'Spikes were scattered around the opposing team!', toxicspikes: 'Poison spikes were scattered around the opposing team!', stealthrock: 'Pointed stones float in the air around the opposing team!', stickyweb: 'A sticky web spread out around the opposing team!' }[h]);
      return;
    }
    switch (md.special) {
      case 'protect': {
        const ok = this.queue.length > 0 && this.chance(100 / Math.pow(3, user.protectCount));
        if (!ok) { this.add('effect', 'But it failed!'); user.protectCount = 0; return; }
        user.v.protect = md.kingsShield ? 'kings' : true; user.protectCount++; user.v.protectedThisTurn = true;
        this.add('effect', `${user.label} protected itself!`, { k: 'protect', m: this.P(user) }); return;
      }
      case 'substitute': {
        if (user.v.substitute) { this.add('effect', `${user.label} already has a substitute!`); return; }
        const cost = Math.floor(user.maxhp / (user.spec.cheapSub ? 8 : 4));
        if (user.hp <= cost) { this.add('effect', 'But it does not have enough HP left to make a substitute!'); return; }
        this.damage(user, cost); user.v.substitute = cost; this.add('effect', `${user.label} put in a substitute!`, { k: 'subon', m: this.P(user) }); return;
      }
      case 'bellydrum':
        if (user.hp <= user.maxhp / 2 || user.boosts.atk >= 6) { this.add('effect', 'But it failed!'); return; }
        this.damage(user, user.maxhp / 2); user.boosts.atk = 6; this.add('boost', `${user.label} cut its own HP and maximized its Attack!`, { k: 'boost', m: this.P(user), up: true, stat: 'atk', n: 6 }); return;
      case 'wish':
        if (user.side.wishes[user.pos]) { this.add('effect', 'But it failed!'); return; }
        user.side.wishes[user.pos] = { turns: 2, hp: Math.floor(user.maxhp / 2), from: user.displaySpecies.name };
        this.add('effect', `${user.label} made a wish!`); return;
      case 'rest':
        if (user.hp >= user.maxhp || user.status === 'slp' || (user.spec.statusImmune && user.spec.statusImmune.includes('slp'))) { this.add('effect', 'But it failed!'); return; }
        user.status = 'slp'; user.statusTurns = 3; user.hp = user.maxhp; this.add('heal', `${user.label} slept and became healthy!`, { k: 'hp', m: this.P(user), hp: 100, heal: true }); this.add('hp', '', { k: 'status', m: this.P(user), status: 'slp' }); return;
      case 'focusenergy': user.v.focusEnergy = true; this.add('effect', `${user.label} is getting pumped!`); return;
      case 'healbell': for (const m of user.side.team) m.status = ''; this.add('heal', `A soothing aroma wafted through ${user.side.name}'s team!`); return;
      case 'painsplit': {
        const avg = Math.floor((user.hp + target.hp) / 2);
        user.hp = Math.min(user.maxhp, avg); target.hp = Math.min(target.maxhp, avg);
        this.add('effect', 'The battlers shared their pain!');
        for (const x of [user, target]) this.add('hp', '', { k: 'hp', m: this.P(x), hp: this.pct(x) });
        this.checkThresholds(target); return;
      }
      case 'leechseed':
        if (target.types.includes('Grass') || target.v.leechSeed) { this.add('effect', `It doesn't affect ${target.label}...`); return; }
        target.v.leechSeed = { side: user.side.n, pos: user.pos }; this.add('effect', `${target.label} was seeded!`); return;
      case 'ingrain':
        if (user.v.ingrain) { this.add('effect', 'But it failed!'); return; }
        user.v.ingrain = true; this.add('effect', `${user.label} planted its roots!`); return;
      case 'taunt':
        if (target.v.taunt || this.abilityActive(target, user).noTaunt) { this.add('effect', 'But it failed!'); return; }
        target.v.taunt = 3; this.add('effect', `${target.label} fell for the taunt!`); return;
      case 'encore': {
        const last = target.lastMove;
        if (!last || target.v.encore || !target.moves.some(x => x.name === last)) { this.add('effect', 'But it failed!'); return; }
        target.v.encore = { move: last, turns: 3 }; this.add('effect', `${target.label} must do an encore!`); return;
      }
      case 'disable': {
        const last = target.lastMove;
        if (!last || target.v.disable || !target.moves.some(x => x.name === last)) { this.add('effect', 'But it failed!'); return; }
        target.v.disable = { move: last, turns: 4 }; this.add('effect', `${target.label}'s ${last} was disabled!`); return;
      }
      case 'trick': {
        if ((!user.item && !target.item) || !this.canLoseItem(user) || !this.canLoseItem(target)) { this.add('effect', 'But it failed!'); return; }
        const a = user.item, b = target.item;
        user.item = b; target.item = a;
        if (!user.item && user.spec.unburden) user.unburdened = true;
        if (!target.item && target.spec.unburden) target.unburdened = true;
        delete user.v.choiceLock; delete target.v.choiceLock;
        this.add('effect', `${user.label} switched items with ${target.label}!`); return;
      }
      case 'magiccoat': user.v.magiccoat = true; this.add('effect', `${user.label} shrouded itself with Magic Coat!`); return;
      case 'defog': {
        for (const s of this.sides) for (const h of ['spikes', 'toxicspikes', 'stealthrock', 'stickyweb']) delete s.conditions[h];
        const fc = this.foeSide(user.side).conditions; delete fc.reflect; delete fc.lightscreen;
        this.add('field', `${user.label} blew away the hazards and screens!`);
        if (target) this.boost(target, { evasion: -1 }, user); return;
      }
      case 'forceswitch':
        if (target.v.ingrain || this.abilityActive(target, user).suctionCups) { this.add('effect', `${target.label} anchored itself!`); return; }
        this.dragOut(target); return;
      case 'partingshot':
        this.boost(target, { atk: -1, spa: -1 }, user);
        this.requestPivot(user, 'pivot'); return;
      case 'pivot':
        if (this.bench(user.side).length) this.requestPivot(user, 'pivot'); else this.add('effect', 'But it failed!');
        return;
    }
    this.add('effect', 'But nothing happened.');
  }
  dragOut(target) {
    const b = this.bench(target.side);
    if (!b.length) return;
    this.add('effect', `${target.label} was dragged out!`);
    this.doSwitch(target.side, target.pos, b[this.random(b.length)].teamIndex);
  }
  requestPivot(mon, reason) {
    if (!this.bench(mon.side).length || this.ended || this.inResiduals || mon.fainted || mon.pos < 0) return;
    if (this.pendingSwitches.some(p => p.side === mon.side.n && p.pos === mon.pos)) return;
    const promised = this.pendingSwitches.filter(p => p.side === mon.side.n).length;
    if (promised >= this.bench(mon.side).length) return;
    this.pendingSwitches.push({ side: mon.side.n, pos: mon.pos, reason });
  }

  typeEff(mon, target, md) {
    let types = target.types;
    if (md.special === 'thousandarrows' && types.includes('Flying')) types = types.filter(t => t !== 'Flying');
    let eff = effectiveness(md.type, types);
    if (md.special === 'freezedry' && target.types.includes('Water')) eff = eff / effectiveness('Ice', ['Water']) * 2;
    if (eff === 0 && md.type === 'Normal' && target.types.includes('Ghost') && mon.spec.scrappy) eff = effectiveness('Normal', target.types.filter(t => t !== 'Ghost'));
    if (md.type === 'Normal' && mon.spec.normalVsGhost && target.types.includes('Ghost')) eff *= mon.spec.normalVsGhost;
    if (md.name === 'Struggle') eff = 1;
    return eff;
  }

  runAttack(mon, md, chosen) {
    if (md.special === 'futuresight') {
      const t = this.resolveTargets(mon, md, chosen)[0];
      if (!t) { this.add('effect', 'But there was no target...'); return; }
      this.setMoveTargets([t]);
      const key = { side: t.side.n, pos: t.pos };
      if (this.futures.some(f => f.side === key.side && f.pos === key.pos)) { this.add('effect', 'But it failed!'); return; }
      this.futures.push({ ...key, turns: 3, user: mon }); this.add('effect', `${mon.label} foresaw an attack!`); return;
    }
    if (md.special === 'counter' || md.special === 'mirrorcoat') {
      const want = md.special === 'counter' ? 'Physical' : 'Special';
      const h = mon.v.lastHit;
      if (!h || h.cat !== want || !this.isActive(h.by) || h.by.side === mon.side) { this.add('effect', 'But it failed!'); return; }
      const t = h.by;
      this.setMoveTargets([t]);
      if (this.checkProtect(mon, t, md)) return;
      const d = this.applyDamage(mon, t, md, h.amount * 2, { eff: 1 });
      this.afterAttack(mon, [t], md, d, new Map([[t, d]]));
      return;
    }
    if (md.special === 'fakeout' && mon.turnsActive > 0) { this.add('effect', 'But it failed!'); return; }
    if (md.special === 'fling' && (!mon.item || !this.canLoseItem(mon))) { this.add('effect', 'But it failed!'); return; }
    const targets = this.resolveTargets(mon, md, chosen);
    this.setMoveTargets(targets);
    if (!targets.length) { this.add('effect', 'But there was no target...'); mon.v.rollout = 0; return; }
    const spread = targets.length > 1;
    let total = 0; const dealtMap = new Map(); let anyHit = false;
    for (const target of targets) {
      if (target.fainted) continue;
      const d = this.attackOne(mon, target, md, spread);
      if (d >= 0) { anyHit = true; total += d; dealtMap.set(target, d); }
      if (mon.fainted) break;
    }
    if (!anyHit) { mon.v.rollout = 0; if (md.special === 'crash' && !mon.fainted) this.damage(mon, mon.maxhp / 2, `${mon.label} kept going and crashed!`); }
    if (md.special === 'rollout' && anyHit) mon.v.rollout = (mon.v.rollout || 0) + 1;
    this.afterAttack(mon, [...dealtMap.keys()], md, total, dealtMap);
  }

  // damage dealt to one target, or -1 if the move didn't connect
  attackOne(mon, target, md, spread) {
    if (md.special === 'sucker') {
      const planned = target.v.plannedMove ? getMove(target.v.plannedMove) : null;
      if (!planned || planned.cat === 'Status' || !this.queue.some(a => a.mon === target && a.kind === 'move')) { this.add('effect', 'But it failed!'); return -1; }
    }
    if (md.special === 'poltergeist' && !target.item) { this.add('effect', 'But it failed!'); return -1; }
    if (this.checkProtect(mon, target, md)) return -1;
    if (!this.accuracyCheck(mon, target, md, md.name)) return -1;
    const ts = this.abilityActive(target, mon);
    const eff = this.typeEff(mon, target, md);
    const groundImmune = md.type === 'Ground' && md.special !== 'thousandarrows' && !this.isGrounded(target, mon);
    if (md.special !== 'level' && (eff === 0 || groundImmune)) { this.add('effect', `It doesn't affect ${target.label}...`); return -1; }
    if (md.special === 'level' && target.types.includes('Normal')) { this.add('effect', `It doesn't affect ${target.label}...`); return -1; }
    if (ts.absorb && ts.absorb.type === md.type) {
      this.add('ability', `${target.label}'s ${target.ability} absorbed the attack!`);
      if (ts.absorb.heal) this.heal(target, target.maxhp * ts.absorb.heal, `${target.label} restored HP!`);
      if (ts.absorb.boosts) this.boost(target, ts.absorb.boosts, target);
      return -1;
    }
    if (ts.immuneFlag && md[ts.immuneFlag]) { this.add('ability', `${target.label}'s ${target.ability} blocked the attack!`); return -1; }
    if (ts.pocket && md.bullet && !target.switchFlags.pocketUsed) { target.switchFlags.pocketUsed = true; this.add('ability', `${target.label} pocketed the attack!`); return -1; }
    if (md.special === 'brickbreak') {
      const c = target.side.conditions;
      if (c.reflect || c.lightscreen) { delete c.reflect; delete c.lightscreen; this.add('field', `${mon.label} shattered the screens!`); }
    }
    let hits = 1;
    if (md.multihit) {
      if (Array.isArray(md.multihit)) { if (mon.spec.skillLink) hits = md.multihit[1]; else { const r = this.random(100); hits = r < 35 ? 2 : r < 70 ? 3 : r < 85 ? 4 : 5; } }
      else hits = md.multihit;
    }
    const pBond = mon.spec.parentalBond && hits === 1 && !spread && md.special !== 'explosion';
    if (pBond) hits = 2;
    let dealt = 0, count = 0;
    for (let h = 0; h < hits; h++) {
      if (target.fainted || mon.fainted) break;
      let power = this.basePower(mon, target, md, h);
      if (pBond && h === 1) power = Math.floor(power / 4);
      const { dmg, crit } = this.calcDamage(mon, target, md, power, eff, false, spread);
      if (crit) this.add('effect', `A critical hit on ${target.label}!`, { k: 'pop', m: this.P(target), text: 'Crit!', tone: 'crit' });
      if (h === 0 && !target.v.substitute) { if (eff > 1) this.add('eff', "It's super effective!", { k: 'pop', m: this.P(target), text: 'Super effective!', tone: 'se' }); else if (eff < 1) this.add('eff', "It's not very effective...", { k: 'pop', m: this.P(target), text: 'Not very effective', tone: 'nve' }); }
      dealt += this.applyDamage(mon, target, md, dmg, { eff, crit }); count++;
    }
    if (hits > 1 && count) this.add('effect', `Hit ${count} time${count > 1 ? 's' : ''}!`);
    return dealt;
  }

  basePower(mon, target, md, hitIndex) {
    let p = md.power;
    switch (md.special) {
      case 'gyroball': p = Math.min(150, Math.floor(25 * this.getSpeed(target) / Math.max(1, this.getSpeed(mon))) + 1); break;
      case 'acrobatics': if (!mon.item) p *= 2; break;
      case 'facade': if (mon.status) p *= 2; break;
      case 'hex': if (target.status) p *= 2; break;
      case 'revenge': if (mon.v.lastHit && mon.v.lastHit.by === target) p *= 2; break;
      case 'knockoff': if (target.item && this.canLoseItem(target)) p = Math.floor(p * 1.5); break;
      case 'rollout': p = 30 * Math.pow(2, Math.min(4, mon.v.rollout || 0)); break;
      case 'triplekick': p = 20 * (hitIndex + 1); break;
    }
    return p;
  }

  calcDamage(mon, target, md, power, eff, noRandom, spread) {
    const s = mon.spec; const ts = this.abilityActive(target, mon);
    const critStage = (md.crit || 0) + (s.critBonus || 0) + (mon.v.focusEnergy ? 2 : 0) + (s.flagCrit && md[s.flagCrit] ? 1 : 0);
    let crit = false;
    if (s.hitCounterCrit && mon.v.chargedCrit && (!s.hitCounterCrit.flag || md[s.hitCounterCrit.flag])) { crit = true; if (!noRandom) mon.v.chargedCrit = false; }
    else if (!noRandom) crit = this.rng() < [1 / 24, 1 / 8, 1 / 2, 1, 1][Math.min(critStage, 4)];
    if (ts.battleArmor) crit = false;
    const physical = md.cat === 'Physical';
    const atkStat = md.special === 'bodypress' ? this.getStat(mon, 'def', crit ? { ignoreNegative: true } : {}) : this.getStat(mon, physical ? 'atk' : 'spa', crit ? { ignoreNegative: true } : {});
    const defStat = this.getStat(target, (physical || md.useDef) ? 'def' : 'spd', (crit || md.ignoreDefBoosts) ? { ignorePositive: true } : {});
    let bp = power;
    if (s.flagBoost && (md[s.flagBoost.flag] || (s.flagBoost.flag === 'contact' && this.makesContact(mon, md)))) bp *= s.flagBoost.mult;
    if (s.typeBoost && s.typeBoost[md.type]) bp *= s.typeBoost[md.type];
    if (s.vsType && target.types.some(t => s.vsType[t])) bp *= Math.max(...target.types.map(t => s.vsType[t] || 1));
    if (s.pinch && s.pinch.type === md.type && mon.hpFrac() <= 1 / 3) bp *= 1.5;
    if (s.sheerForce && md.sec) bp *= 1.3;
    if (s.analytic && !this.queue.some(a => a.kind === 'move')) bp *= 1.3;
    if (s.weightBoost && md.weightMove) bp *= s.weightBoost;
    if (s.bounceBoost && md.name === 'Bounce') bp *= 1.5;
    if (md.hitsSemi && target.v.charging && ['dig', 'dive'].includes(target.v.charging.semi) && md.hitsSemi.includes(target.v.charging.semi)) bp *= 2;
    bp = Math.max(1, Math.floor(bp));
    let dmg = Math.floor(Math.floor(Math.floor(2 * LEVEL / 5 + 2) * bp * atkStat / defStat) / 50) + 2;
    if (spread) dmg *= 0.75;
    const w = this.field.weather;
    if (w === 'rain') { if (md.type === 'Water') dmg *= 1.5; if (md.type === 'Fire') dmg *= 0.5; }
    if (w === 'sun') { if (md.type === 'Fire') dmg *= 1.5; if (md.type === 'Water') dmg *= 0.5; }
    if (crit) dmg *= s.sniper ? 2.25 : 1.5;
    dmg = Math.floor(dmg * (noRandom ? 0.925 : (85 + this.random(16)) / 100));
    if (mon.types.includes(md.type) && md.name !== 'Struggle') dmg *= s.adaptability ? 2 : 1.5;
    dmg *= eff;
    if (physical && mon.status === 'brn' && !s.guts && md.special !== 'facade') dmg *= 0.5;
    const c = target.side.conditions;
    const ignoreScreens = crit || s.infiltrator || (s.fireBreaker && md.type === 'Fire');
    if (!ignoreScreens && ((physical && c.reflect) || (!physical && c.lightscreen))) dmg *= this.activeCount > 1 ? 2 / 3 : 0.5;
    if (ts.filter && eff > 1) dmg *= ts.filter;
    if (ts.typeTaken && ts.typeTaken[md.type]) dmg *= ts.typeTaken[md.type];
    if (ts.flagTaken && md[ts.flagTaken.flag]) dmg *= ts.flagTaken.mult;
    if (ts.fullHpTaken && target.hp === target.maxhp) dmg *= ts.fullHpTaken;
    if (ts.gutCheck && this.makesContact(mon, md) && !target.switchFlags.gutCheck) { dmg *= 0.5; if (!noRandom) target.switchFlags.gutCheck = true; }
    if (ts.luma && (target.once.lumaHits || 0) < 2) { dmg *= 0.75; if (!noRandom) target.once.lumaHits = (target.once.lumaHits || 0) + 1; }
    if (mon.item === 'Life Orb') dmg *= 1.3;
    if (mon.item === 'Expert Belt' && eff > 1) dmg *= 1.2;
    dmg = Math.floor(dmg);
    if (eff > 0 && dmg < 1) dmg = 1;
    return { dmg, crit };
  }

  applyDamage(mon, target, md, dmg, info) {
    const ts = this.abilityActive(target, mon);
    if (md.special === 'level') dmg = LEVEL;
    if (target.v.substitute && !md.sound && !mon.spec.infiltrator) {
      const d = Math.min(dmg, target.v.substitute);
      target.v.substitute -= d;
      this.add('dmg', `The substitute took damage for ${target.label}!`, { k: 'sub', m: this.P(target) });
      if (target.v.substitute <= 0) { delete target.v.substitute; this.add('effect', `${target.label}'s substitute faded!`); }
      return d;
    }
    if (ts.disguise && !target.once.disguise) { target.once.disguise = true; this.add('ability', `${target.label}'s ${target.ability} took the hit! Its mask fell off.`); return 0; }
    if (target.v.illusion) { target.v.illusion = false; target.once.illusionBroken = true; target.displaySpecies = target.species; this.add('ability', `${target.side.name}'s ${target.species.name}'s illusion wore off!`, this.inMeta(target)); }
    if (dmg >= target.hp) {
      if (target.hp === target.maxhp && ts.sturdy) { dmg = target.hp - 1; this.add('ability', `${target.label} endured the hit with ${target.ability}!`); }
      else if (target.hp === target.maxhp && this.hasItem(target, 'Focus Sash')) { dmg = target.hp - 1; this.add('effect', `${target.label} hung on using its Focus Sash!`); this.loseItem(target, true); }
      else if (ts.surviveOnce && !target.once.survived) { target.once.survived = true; dmg = target.hp - 1; this.add('ability', `${target.label} hung on with ${target.ability}!`); }
    }
    dmg = Math.min(dmg, target.hp);
    const hpBefore = target.hp;
    target.hp -= dmg;
    this.add('dmg', `${target.label} lost ${Math.round(dmg / target.maxhp * 1000) / 10}% of its HP!`, { k: 'hp', m: this.P(target), hp: this.pct(target), dmg: true, hit: true });
    target.v.tookDamage = true;
    target.v.lastHit = { amount: dmg, cat: md.cat, by: mon };
    target.hitsTaken++;
    if (target.item === 'Air Balloon') { this.add('effect', `${target.label}'s Air Balloon popped!`); this.loseItem(target, false); }
    if (target.spec.hitCounterCrit && target.hitsTaken % target.spec.hitCounterCrit.hits === 0) { target.v.chargedCrit = true; this.add('ability', `${target.label}'s ${target.ability} is charged!`); }
    if (target.hp <= 0) { this.faint(target); this.onKO(mon, target); }
    else { this.onDamagedBy(target, mon, md, info, hpBefore); this.checkThresholds(target); }
    if (dmg > 0 && md.drain && !mon.fainted) this.heal(mon, Math.max(1, Math.floor(dmg * md.drain)), `${target.label} had its energy drained!`);
    if (dmg > 0 && mon.spec.drainAll && !mon.fainted) this.heal(mon, Math.floor(dmg * mon.spec.drainAll), `${mon.label}'s ${mon.ability} restored its HP!`);
    if (dmg > 0 && this.makesContact(mon, md) && !mon.fainted) this.contactReactions(mon, target, md);
    return dmg;
  }
  onDamagedBy(target, mon, md, info, hpBefore) {
    const s = target.spec;
    const act = () => this.add('ability', `${target.label}'s ${target.ability} activated!`);
    if (s.hitByType && s.hitByType.type === md.type) { act(); this.boost(target, s.hitByType.boosts, target); }
    if (s.rattled && ['Bug', 'Ghost', 'Dark'].includes(md.type)) { act(); this.boost(target, { spe: 1 }, target); }
    if (s.hitBoost) { act(); this.boost(target, s.hitBoost, target); }
    if (s.angerPoint && info.crit && target.boosts.atk < 6) { target.boosts.atk = 6; this.add('ability', `${target.label}'s ${target.ability} maxed its Attack!`); }
    if (s.colorChange && !target.types.includes(md.type) && md.name !== 'Struggle') { target.types = [md.type]; this.add('ability', `${target.label}'s ${target.ability} made it the ${md.type} type!`, { k: 'types', m: this.P(target), types: target.types }); }
    if (s.emergencyExit && hpBefore > target.maxhp / 2 && target.hp <= target.maxhp / 2 && this.bench(target.side).length) { act(); this.requestPivot(target, 'emergency'); }
  }
  contactReactions(mon, target, md) {
    const ts = target.spec;
    if (ts.roughSkin) this.damage(mon, mon.maxhp * ts.roughSkin, `${mon.label} was hurt by ${target.label}'s ${target.ability}!`);
    if (mon.fainted) return;
    if (this.hasItem(target, 'Rocky Helmet')) this.damage(mon, mon.maxhp / 6, `${mon.label} was hurt by the Rocky Helmet!`);
    if (mon.fainted) return;
    if (ts.contactStatus && this.chance(ts.contactStatus.chance)) this.trySetStatus(mon, ts.contactStatus.status, target, false, true);
    if (ts.contactAttract && !mon.v.attract && GENDER.opposite(mon.gender, target.gender) && this.chance(ts.contactAttract)) { mon.v.attract = target; this.add('status', `${mon.label} fell in love!`); }
    if (ts.contactFoeBoost) this.boost(mon, ts.contactFoeBoost, target);
    if (ts.mummy && mon.ability !== target.ability && !mon.spec.mummy) { mon.ability = target.ability; this.add('ability', `${mon.label}'s ability became ${target.ability}!`); }
    if (ts.pickpocket && !target.fainted && !target.item && mon.item && this.canLoseItem(mon)) { target.item = mon.item; this.loseItem(mon, false); this.add('ability', `${target.label} stole ${mon.label}'s ${target.item}!`); }
  }
  onKO(attacker, target) {
    if (attacker.fainted || attacker === target || attacker.side === target.side) return;
    if (attacker.spec.onKO) { this.add('ability', `${attacker.label}'s ${attacker.ability} activated!`); this.boost(attacker, attacker.spec.onKO, attacker); }
  }
  afterAttack(mon, targets, md, total, dealtMap) {
    const s = mon.spec; const sheer = s.sheerForce && md.sec;
    if (total > 0 && md.recoil && !s.rockHead && !mon.fainted) this.damage(mon, Math.max(1, Math.floor(total * md.recoil)), `${mon.label} was damaged by the recoil!`);
    if (md.name === 'Struggle' && !mon.fainted) this.damage(mon, mon.maxhp / 4, `${mon.label} was damaged by the recoil!`);
    if (md.special === 'explosion' && !mon.fainted) this.faint(mon);
    if (total > 0 && mon.item === 'Life Orb' && !sheer && !mon.fainted) this.damage(mon, mon.maxhp / 10, `${mon.label} lost some of its HP!`);
    for (const target of targets) {
      const dealt = dealtMap.get(target) || 0;
      const hitSub = !!target.v.substitute;
      if (dealt > 0 && md.sec && !sheer) for (const e of md.sec) {
        if (!this.chance(e.chance)) continue;
        if (e.self) { if (!mon.fainted) this.boost(mon, e.self, mon); continue; }
        if (target.fainted || hitSub) continue;
        if (e.status) this.trySetStatus(target, e.status, mon, false, true);
        if (e.volatile === 'flinch' && !this.abilityActive(target, mon).noFlinch && this.queue.some(a => a.mon === target)) target.v.flinch = true;
        if (e.volatile === 'confusion') this.tryConfuse(target, mon);
        if (e.boosts) this.boost(target, e.boosts, mon);
      }
      if (dealt > 0 && s.attackStatus && !target.fainted && !hitSub) {
        const a = s.attackStatus;
        if ((!a.contactOnly || this.makesContact(mon, md)) && (!a.flag || md[a.flag]) && this.chance(a.chance)) this.trySetStatus(target, a.status, mon, false, true);
      }
      if (dealt > 0 && md.special === 'knockoff' && target.item && !target.fainted && this.canLoseItem(target)) { this.add('effect', `${mon.label} knocked off ${target.label}'s ${target.item}!`); this.loseItem(target, false); }
      if (dealt > 0 && (md.special === 'thief' || s.magician) && !mon.item && target.item && !mon.fainted && this.canLoseItem(target)) { mon.item = target.item; this.loseItem(target, false); this.add('effect', `${mon.label} stole ${target.label}'s ${mon.item}!`); }
      if (md.special === 'trap' && dealt > 0 && !target.fainted && !target.types.includes('Ghost')) { target.v.trapped = mon; this.add('effect', `${target.label} can no longer escape!`); }
      if (md.special === 'dragout' && dealt > 0 && !target.fainted && !mon.fainted && !(target.v.ingrain || this.abilityActive(target, mon).suctionCups)) this.dragOut(target);
    }
    if (md.selfBoost && !mon.fainted && targets.length) this.boost(mon, md.selfBoost, mon);
    if (md.special === 'fling' && mon.item) { this.add('effect', `${mon.label} flung its ${mon.item}!`); this.loseItem(mon, false); }
    if (md.special === 'rapidspin' && total > 0 && !mon.fainted) {
      const c = mon.side.conditions; let any = false;
      for (const h of ['spikes', 'toxicspikes', 'stealthrock', 'stickyweb']) if (c[h]) { delete c[h]; any = true; }
      if (mon.v.leechSeed) { delete mon.v.leechSeed; any = true; }
      if (mon.v.trapped) { delete mon.v.trapped; any = true; }
      if (any) this.add('effect', `${mon.label} blew away the hazards!`);
    }
    if (md.special === 'pivot' && total > 0) this.requestPivot(mon, 'pivot');
  }

  // ---------------- end of turn ----------------
  residuals() { this.inResiduals = true; try { this._residuals(); } finally { this.inResiduals = false; } }
  _residuals() {
    if (this.field.weather && --this.field.weatherTurns <= 0) {
      const text = { rain: 'The rain stopped.', sun: 'The harsh sunlight faded.', snow: 'The snow stopped.' }[this.field.weather];
      this.field.weather = '';
      this.add('weather', text, this.fieldA());
    }
    for (const f of this.futures.slice()) {
      if (--f.turns > 0) continue;
      this.futures.splice(this.futures.indexOf(f), 1);
      const t = this.sides[f.side].active[f.pos];
      if (!t || t.fainted) continue;
      this.add('move', `${t.label} took the Future Sight attack!`, { k: 'move', u: null, name: 'Future Sight', type: 'Psychic', cat: 'Special', t: [this.P(t)] });
      const md = MOVES['Future Sight']; const eff = effectiveness('Psychic', t.types);
      if (!eff) this.add('effect', `It doesn't affect ${t.label}...`);
      else this.applyDamage(f.user, t, md, this.calcDamage(f.user, t, md, 120, eff).dmg, { eff });
    }
    for (const s of this.sides) for (const pos of Object.keys(s.wishes)) {
      const w = s.wishes[pos];
      if (--w.turns > 0) continue;
      const a = s.active[pos]; if (a && !a.fainted) this.heal(a, w.hp, `${w.from}'s wish came true!`);
      delete s.wishes[pos];
    }
    for (const mon of this.speedOrder(this.allActive())) {
      if (mon.fainted) continue;
      const s = mon.spec; const w = this.field.weather;
      if (mon.item === 'Leftovers') this.heal(mon, mon.maxhp / 16, `${mon.label} restored a little HP using its Leftovers!`);
      if (mon.item === 'Black Sludge') { if (mon.types.includes('Poison')) this.heal(mon, mon.maxhp / 16, `${mon.label} restored a little HP using its Black Sludge!`); else this.damage(mon, mon.maxhp / 8, `${mon.label} was hurt by its Black Sludge!`); }
      if (mon.fainted) continue;
      if (s.iceBody && w === 'snow') this.heal(mon, mon.maxhp / 16, `${mon.label}'s ${mon.ability} restored HP!`);
      if (s.rainDish && w === 'rain') this.heal(mon, mon.maxhp / 16, `${mon.label}'s ${mon.ability} restored HP!`);
      if (s.natRegen && mon.hpFrac() > 0.5) this.heal(mon, mon.maxhp / 16, `${mon.label} regenerated a little HP!`);
      if (s.solarPower && w === 'sun') this.damage(mon, mon.maxhp / 8, `${mon.label} was hurt by the harsh sunlight!`);
      if (mon.fainted) continue;
      if (mon.v.ingrain) this.heal(mon, mon.maxhp / 16, `${mon.label} absorbed nutrients with its roots!`);
      if (mon.v.leechSeed) {
        const d = this.damage(mon, mon.maxhp / 8, `${mon.label}'s health is sapped by Leech Seed!`);
        const seeder = this.sides[mon.v.leechSeed.side].active[mon.v.leechSeed.pos];
        if (seeder && !seeder.fainted && d) this.heal(seeder, d);
      }
      if (mon.fainted) continue;
      if (s.shedSkin && mon.status && this.chance(30)) { mon.status = ''; this.add('ability', `${mon.label}'s ${mon.ability} cured its status!`); }
      if (mon.status === 'brn') this.damage(mon, mon.maxhp / 16, `${mon.label} was hurt by its burn!`);
      if (mon.status === 'psn' || mon.status === 'tox') {
        if (s.poisonHeal) this.heal(mon, mon.maxhp / 8, `${mon.label} restored HP with ${mon.ability}!`);
        else if (mon.status === 'psn') this.damage(mon, mon.maxhp / 8, `${mon.label} was hurt by poison!`);
        else { mon.toxCount = Math.min(15, mon.toxCount + 1); this.damage(mon, mon.maxhp * mon.toxCount / 16, `${mon.label} was hurt by poison!`); }
      }
      if (mon.fainted) continue;
      if (mon.v.taunt && --mon.v.taunt <= 0) { delete mon.v.taunt; this.add('effect', `${mon.label} shook off the taunt!`); }
      for (const k of ['encore', 'disable']) if (mon.v[k] && --mon.v[k].turns <= 0) { delete mon.v[k]; this.add('effect', `${mon.label}'s ${k} ended.`); }
      if (s.speedBoost && mon.turnsActive > 0) { this.add('ability', `${mon.label}'s ${mon.ability} activated!`); this.boost(mon, { spe: 1 }, mon); }
      if (s.moody) {
        const up = ['atk', 'def', 'spa', 'spd', 'spe'].filter(k => mon.boosts[k] < 6);
        const u = up.length ? up[this.random(up.length)] : null;
        const down = ['atk', 'def', 'spa', 'spd', 'spe'].filter(k => k !== u && mon.boosts[k] > -6);
        const d = down.length ? down[this.random(down.length)] : null;
        this.add('ability', `${mon.label}'s ${mon.ability} made its call!`);
        const b = {}; if (u) b[u] = 2; if (d) b[d] = -1; this.boost(mon, b, mon);
      }
      if (s.crafting && (mon.turnsActive + 1) % 2 === 0) { this.add('ability', `${mon.label} crafted a better tool!`); this.boost(mon, { atk: 1 }, mon); }
      if (s.monado) {
        const arts = ['spe', 'def', 'atk', 'spa'];
        if (mon.v.monadoArt) mon.boosts[mon.v.monadoArt] = clamp(mon.boosts[mon.v.monadoArt] - 1, -6, 6);
        const next = arts[((mon.v.monadoIdx ?? -1) + 1) % arts.length];
        mon.v.monadoIdx = arts.indexOf(next); mon.v.monadoArt = next;
        mon.boosts[next] = clamp(mon.boosts[next] + 1, -6, 6);
        this.add('ability', `${mon.label} activated Monado ${{ spe: 'Speed', def: 'Shield', atk: 'Buster', spa: 'Smash' }[next]}! (+1 ${STAT_LABEL[next]})`);
      }
      if (s.harvest && !mon.item && BERRIES.has(mon.consumedItem) && (w === 'sun' || this.chance(50))) { mon.item = mon.consumedItem; mon.berryUses = 0; this.add('ability', `${mon.label} harvested a ${mon.item}!`); }
      if (s.pickup && !mon.item) {
        const src = this.allActive().find(o => o !== mon && o.consumedItem && o.v.consumedThisTurn);
        if (src) { mon.item = src.consumedItem; this.add('ability', `${mon.label} picked up a ${mon.item}!`); }
        else if (mon.consumedItem && this.chance(30)) { mon.item = mon.consumedItem; mon.berryUses = 0; this.add('ability', `${mon.label} found a ${mon.item}!`); }
      }
    }
    for (const s of this.sides) for (const k of ['reflect', 'lightscreen', 'tailwind']) {
      if (s.conditions[k] && --s.conditions[k] <= 0) { delete s.conditions[k]; this.add('field', `${s.name}'s ${{ reflect: 'Reflect', lightscreen: 'Light Screen', tailwind: 'tailwind' }[k]} wore off.`); }
    }
    if (this.field.trickroom && --this.field.trickroom === 0) this.add('field', 'The twisted dimensions returned to normal!', this.fieldA());
    if (this.field.gravity && --this.field.gravity === 0) this.add('field', 'Gravity returned to normal!', this.fieldA());
    for (const s of this.sides) for (const m of s.team) {
      for (const k of ['flinch', 'protect', 'magiccoat', 'tookDamage', 'lastHit', 'plannedMove', 'consumedThisTurn']) delete m.v[k];
      if (!m.v.protectedThisTurn) m.protectCount = 0;
      delete m.v.protectedThisTurn;
      if (this.isActive(m)) m.turnsActive++;
      if (m.v.rollout && m.lastMove !== 'Rollout') m.v.rollout = 0;
    }
  }

  // ---------------- views ----------------
  monInfo(m, own) {
    const sp = own ? m.species : m.displaySpecies;
    const base = { index: m.teamIndex, id: sp.id, name: sp.name, gender: !own && m.v.illusion ? GENDER.defaultGender(sp.id) : m.gender, types: own || !m.v.illusion ? m.types : m.displaySpecies.types, hpPct: Math.ceil(m.hp / m.maxhp * 100), status: m.status, fainted: m.fainted, pos: m.pos };
    if (own) Object.assign(base, { hp: m.hp, maxhp: m.maxhp, ability: m.ability, item: m.item, stats: m.stats, moves: m.moves.map(x => ({ name: x.name, pp: x.pp, maxpp: x.maxpp, type: MOVES[x.name].type })) });
    else base.seen = { moves: (m.shownMoves || []).slice(), ability: m.shownAbility || null, item: m.shownItem || null, itemNow: m.shownItem ? m.item === m.shownItem : null, mega: !!m.mega };
    return base;
  }
  publicState(perspective) {
    return {
      id: this.id, format: this.format, turn: this.turn, phase: this.phase, ended: this.ended, winner: this.winner,
      field: { weather: this.field.weather, weatherTurns: this.field.weatherTurns, trickroom: this.field.trickroom, gravity: this.field.gravity },
      sides: this.sides.map(s => {
        const own = s.n === perspective;
        return {
          name: s.name, n: s.n,
          conditions: Object.fromEntries(Object.entries(s.conditions)),
          active: s.active.map(a => a ? Object.assign(this.monInfo(a, own), {
            boosts: Object.fromEntries(Object.entries(a.boosts).filter(([, v]) => v)),
            volatiles: Object.keys(a.v).filter(k => ['substitute', 'confusion', 'leechSeed', 'taunt', 'encore', 'trapped', 'ingrain', 'charging', 'attract'].includes(k)),
          }) : null),
          // opponents only learn which fighters were brought once they are sent out
          team: s.team.filter(m => own || m.revealed).map(m => this.monInfo(m, own)),
          brought: s.team.length, remaining: s.team.filter(m => !m.fainted).length,
        };
      }),
    };
  }

  // rough expected damage, for the CPU
  estimate(mon, target, moveName) {
    const md = MOVES[moveName];
    if (!md || md.cat === 'Status' || !target || target.fainted) return 0;
    const eff = this.typeEff(mon, target, md);
    if (!eff) return 0;
    if (md.type === 'Ground' && md.special !== 'thousandarrows' && !this.isGrounded(target, mon)) return 0;
    const ts = target.spec;
    if ((ts.absorb && ts.absorb.type === md.type) || (ts.immuneFlag && md[ts.immuneFlag])) return 0;
    if (['counter', 'mirrorcoat', 'explosion', 'futuresight'].includes(md.special)) return 0;
    if (md.special === 'level') return LEVEL;
    if (md.special === 'fakeout' && mon.turnsActive > 0) return 0;
    let p = md.power;
    if (md.special === 'gyroball') p = Math.min(150, Math.floor(25 * this.getSpeed(target) / Math.max(1, this.getSpeed(mon))) + 1);
    if (md.multihit) p *= Array.isArray(md.multihit) ? 3 : md.multihit;
    const saved = JSON.stringify([target.switchFlags, target.once]);
    const { dmg } = this.calcDamage(mon, target, md, p, eff, true, md.target === 'allFoes' || md.target === 'all');
    [target.switchFlags, target.once] = JSON.parse(saved);
    return dmg * (md.acc === true ? 1 : md.acc / 100) * (md.charge && !(md.sunSkip && this.field.weather === 'sun') ? 0.5 : 1);
  }
}

module.exports = { Battle, FIGHTERS, FIGHTER_BY_ID, MOVES, LEVEL };

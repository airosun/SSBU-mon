// SSBU-mon battle engine: 6v6 singles, level 100, Gen 9-style mechanics.
const MOVES = require('../../shared/moves.js');
const FIGHTERS = require('../../shared/fighters.json');
const { effectiveness, calcStat, EVIOLITE_USERS } = require('../../shared/dex.js');
const ABIL = require('./abilities.js');

const FIGHTER_BY_ID = Object.fromEntries(FIGHTERS.map(f => [f.id, f]));
const BOOST_STATS = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'];
const STAT_LABEL = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed', accuracy: 'accuracy', evasion: 'evasiveness' };
const STATUS_LABEL = { brn: 'burned', par: 'paralyzed', psn: 'poisoned', tox: 'badly poisoned', slp: 'asleep', frz: 'frozen' };
const NO_METRONOME = new Set(['Metronome', 'Copycat', 'Protect', 'Detect', "King's Shield", 'Counter', 'Mirror Coat', 'Focus Punch', 'Magic Coat', 'Thief', 'Trick', 'Fling']);
const BERRIES = new Set(['Sitrus Berry', 'Lum Berry']);
const LEVEL = 100;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function boostMult(stage) { return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage); }
function accMult(stage) { return stage >= 0 ? (3 + stage) / 3 : 3 / (3 - stage); }

class Mon {
  constructor(set, side, slot) {
    const f = FIGHTER_BY_ID[set.species];
    this.side = side; this.slot = slot; this.species = f;
    this.name = f.name; this.nickname = set.nickname || f.name;
    this.baseAbility = set.ability; this.ability = set.ability;
    this.item = set.item || ''; this.nature = set.nature || 'Hardy';
    this.evs = Object.assign({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, set.evs || {});
    this.ivs = Object.assign({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, set.ivs || {});
    this.stats = {};
    for (const s of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) this.stats[s] = calcStat(s, f.stats[s], this.ivs[s], this.evs[s], LEVEL, this.nature);
    this.maxhp = this.stats.hp; this.hp = this.maxhp;
    this.moves = set.moves.map(n => ({ name: n, pp: Math.floor(MOVES[n].pp * 8 / 5), maxpp: Math.floor(MOVES[n].pp * 8 / 5) }));
    this.status = ''; this.statusTurns = 0; this.toxCount = 0;
    this.fainted = false; this.once = {}; this.berryUses = 0; this.consumedItem = '';
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
    this.sides = [0, 1].map(i => {
      const p = opts.players[i];
      const side = { n: i, name: p.name, conditions: {}, choice: null, activeIdx: -1, needSwitch: false };
      side.team = p.team.map((set, k) => new Mon(set, side, k));
      return side;
    });
    this.field = { weather: '', weatherTurns: 0, trickroom: 0, gravity: 0 };
    this.turn = 0; this.phase = 'preview'; this.log = []; this.winner = null; this.ended = false;
    this.queue = []; this.pendingSwitches = []; this.lastMoveUsed = null; this.futures = []; this.moldBreaker = null; this.inResiduals = false;
    this.onUpdate = opts.onUpdate || (() => {});
    this.add('info', `Battle between ${this.sides[0].name} and ${this.sides[1].name} started! Choose your lead.`);
  }

  // ---------------- utilities ----------------
  add(cls, text) { this.log.push({ cls, text }); }
  random(n) { return Math.floor(this.rng() * n); }
  chance(pct) { return this.rng() * 100 < pct; }
  foe(side) { return this.sides[1 - side.n]; }
  active(side) { return side.activeIdx >= 0 ? side.team[side.activeIdx] : null; }
  foeOf(mon) { return this.active(this.foe(mon.side)); }
  isActive(mon) { return mon && !mon.fainted && this.active(mon.side) === mon; }
  bench(side) { return side.team.filter(m => !m.fainted && m !== this.active(side)); }
  hasItem(mon, item) { return mon.item === item && !(this.field.magicroom); }
  abilityActive(mon, attacker) {
    // mold breaker style attackers suppress the target's defensive abilities during their move
    if (attacker && attacker !== mon && this.moldBreaker === attacker) return {};
    return mon.spec;
  }

  // ---------------- choices ----------------
  getRequest(sideN) {
    const side = this.sides[sideN];
    if (this.ended) return { kind: 'ended' };
    const team = side.team.map((m, i) => this.monInfo(m, true, i));
    if (this.phase === 'preview') return side.choice ? { kind: 'wait', team } : { kind: 'preview', team };
    if (this.pendingSwitches.length) {
      const ps = this.pendingSwitches[0];
      if (ps.side === sideN) return { kind: 'switch', reason: ps.reason, team };
      return { kind: 'wait', team };
    }
    if (this.phase === 'switch') return side.needSwitch && !side.choice ? { kind: 'switch', reason: 'faint', team } : { kind: 'wait', team };
    if (side.choice) return { kind: 'wait', team };
    const mon = this.active(side);
    const locked = this.lockedMove(mon);
    const moves = mon.moves.map((mv, i) => {
      const md = MOVES[mv.name];
      return { name: mv.name, pp: mv.pp, maxpp: mv.maxpp, type: md.type, cat: md.cat, power: md.power, acc: md.acc, disabled: !this.canUseMove(mon, i), index: i };
    });
    const anyUsable = moves.some(m => !m.disabled);
    return {
      kind: 'move', team, active: side.activeIdx, moves, locked, struggle: !anyUsable && !locked,
      canSwitch: !this.isTrapped(mon) && this.bench(side).length > 0,
    };
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
    if (this.hasItem(mon, 'Shed Shell')) return false;
    if (mon.types.includes('Ghost')) return !!mon.v.ingrain;
    return !!(mon.v.trapped && this.isActive(mon.v.trapped)) || !!mon.v.ingrain;
  }

  choose(sideN, choice) {
    if (this.ended) return 'Battle is over.';
    const side = this.sides[sideN];
    const req = this.getRequest(sideN);
    if (req.kind === 'wait') return 'Not your turn to choose.';
    if (req.kind === 'preview') {
      const i = choice.lead | 0;
      if (!side.team[i]) return 'Invalid lead.';
      side.choice = { type: 'lead', index: i };
      if (this.sides.every(s => s.choice)) this.startBattle(); else this.onUpdate();
      return null;
    }
    if (req.kind === 'switch') {
      const i = choice.index | 0; const m = side.team[i];
      if (!m || m.fainted || m === this.active(side)) return 'Invalid switch.';
      if (this.pendingSwitches.length) {
        this.pendingSwitches.shift();
        this.doSwitch(side, i, true);
        if (this.pendingSwitches.length) { this.onUpdate(); return null; }
        this.continueTurn();
        return null;
      }
      side.choice = { type: 'switch', index: i };
      if (this.sides.every(s => !s.needSwitch || s.choice)) this.resolveFaintSwitches(); else this.onUpdate();
      return null;
    }
    // move phase
    const mon = this.active(side);
    if (choice.type === 'switch') {
      const i = choice.index | 0; const m = side.team[i];
      if (!req.canSwitch) return 'You are trapped.';
      if (!m || m.fainted || m === mon) return 'Invalid switch.';
      side.choice = { type: 'switch', index: i, mon };
    } else {
      const locked = this.lockedMove(mon);
      if (locked) side.choice = { type: 'move', move: locked, mon, locked: true };
      else if (req.struggle) side.choice = { type: 'move', move: 'Struggle', mon };
      else {
        const i = choice.index | 0;
        if (!mon.moves[i] || !this.canUseMove(mon, i)) return 'That move can\'t be used.';
        side.choice = { type: 'move', move: mon.moves[i].name, mon, slot: i };
      }
    }
    if (this.sides.every(s => s.choice)) this.runTurn(); else this.onUpdate();
    return null;
  }
  forfeit(sideN) {
    if (this.ended) return;
    this.add('info', `${this.sides[sideN].name} forfeited.`);
    this.win(1 - sideN);
  }

  // ---------------- flow ----------------
  startBattle() {
    this.phase = 'move'; this.turn = 1;
    for (const s of this.sides) { s.activeIdx = s.choice.index; s.choice = null; }
    const order = this.speedOrder(this.sides.map(s => this.active(s)));
    for (const m of order) this.add('switch', `${m.side.name} sent out ${this.illusionName(m)}!`);
    for (const m of order) this.onSwitchIn(m);
    this.add('turn', `Turn ${this.turn}`);
    this.onUpdate();
  }
  illusionName(mon) {
    if (mon.spec.illusion && !mon.once.illusionBroken) {
      const others = mon.side.team.filter(x => !x.fainted && x !== mon);
      if (others.length) { mon.displaySpecies = others[others.length - 1].species; mon.v.illusion = true; }
    }
    return mon.displaySpecies.name;
  }

  runTurn() {
    const actions = [];
    for (const s of this.sides) {
      const c = s.choice; s.choice = null;
      if (c.type === 'switch') actions.push({ kind: 'switch', side: s, index: c.index, mon: c.mon, prio: 7, spe: this.getSpeed(c.mon) });
      else {
        const md = MOVES[c.move] || STRUGGLE;
        actions.push({ kind: 'move', side: s, mon: c.mon, move: c.move, slot: c.slot, locked: c.locked, prio: this.getPriority(c.mon, md), spe: this.getSpeed(c.mon) });
      }
    }
    // Focus Punch charge message
    for (const a of actions) if (a.kind === 'move' && a.move === 'Focus Punch' && !a.mon.fainted) { this.add('effect', `${a.mon.label} is tightening its focus!`); a.mon.v.focusing = true; }
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
      if (a.kind === 'switch') { if (this.isActive(a.mon)) this.doSwitch(a.side, a.index, false); }
      else if (this.isActive(a.mon)) this.useMove(a.mon, a.move, a);
      if (this.checkWin()) return;
      if (this.pendingSwitches.length) { this.onUpdate(); return; }
    }
    if (this.ended) return;
    this.endOfTurn();
  }
  endOfTurn() {
    this.residuals();
    if (this.checkWin()) return;
    let need = false;
    for (const s of this.sides) {
      const a = this.active(s);
      s.needSwitch = (!a || a.fainted) && this.bench(s).length > 0;
      if (s.needSwitch) need = true;
    }
    if (need) { this.phase = 'switch'; this.onUpdate(); return; }
    this.nextTurn();
  }
  nextTurn() {
    this.phase = 'move'; this.turn++;
    this.add('turn', `Turn ${this.turn}`);
    this.onUpdate();
  }
  resolveFaintSwitches() {
    const mons = [];
    for (const s of this.sides) if (s.needSwitch && s.choice) { s.activeIdx = s.choice.index; s.choice = null; s.needSwitch = false; mons.push(this.active(s)); }
    for (const m of this.speedOrder(mons)) { m.resetVolatiles(); this.add('switch', `${m.side.name} sent out ${this.illusionName(m)}!`); }
    for (const m of this.speedOrder(mons)) { if (!m.fainted) this.onSwitchIn(m); }
    if (this.checkWin()) return;
    // hazards may have KO'd the incoming fighter
    let need = false;
    for (const s of this.sides) { const a = this.active(s); s.needSwitch = a.fainted && this.bench(s).length > 0; if (s.needSwitch) need = true; }
    if (need) { this.onUpdate(); return; }
    this.nextTurn();
  }
  checkWin() {
    const alive = this.sides.map(s => s.team.some(m => !m.fainted));
    if (!alive[0] && !alive[1]) { this.add('win', 'The battle ended in a tie!'); this.end(null); return true; }
    for (let i = 0; i < 2; i++) if (!alive[i]) { this.win(1 - i); return true; }
    return false;
  }
  win(n) { this.add('win', `${this.sides[n].name} won the battle!`); this.end(n); }
  end(n) { this.ended = true; this.winner = n; this.phase = 'ended'; this.queue = []; this.pendingSwitches = []; this.onUpdate(); }

  speedOrder(mons) {
    const tr = this.field.trickroom > 0;
    return mons.filter(Boolean).sort((a, b) => {
      const d = this.getSpeed(b) - this.getSpeed(a);
      return d !== 0 ? (tr ? -d : d) : (this.rng() < 0.5 ? -1 : 1);
    });
  }

  // ---------------- switching ----------------
  doSwitch(side, index, forced) {
    const out = this.active(side);
    if (out && !out.fainted) this.onSwitchOut(out);
    side.activeIdx = index;
    const inc = this.active(side);
    inc.resetVolatiles();
    this.add('switch', `${side.name} sent out ${this.illusionName(inc)}!`);
    this.onSwitchIn(inc);
  }
  onSwitchOut(mon) {
    const s = mon.spec;
    if (s.regenerator && !mon.fainted) mon.hp = Math.min(mon.maxhp, mon.hp + Math.floor(mon.maxhp / 3));
    if (s.naturalCure && mon.status) mon.status = '';
    // Trapping by this mon ends
    const foe = this.foeOf(mon); if (foe && foe.v.trapped === mon) delete foe.v.trapped;
    if (foe && foe.v.leechSeedBy === mon) { /* seed persists on foe */ }
    this.add('switch', `${mon.side.name} withdrew ${mon.displaySpecies.name}.`);
    mon.resetVolatiles();
  }
  onSwitchIn(mon) {
    const side = mon.side; const cond = side.conditions;
    // hazards
    const boots = this.hasItem(mon, 'Heavy-Duty Boots');
    const hz = mon.spec.hazardImmune || [];
    if (!boots) {
      if (cond.stealthrock) {
        const eff = effectiveness('Rock', mon.types);
        this.damage(mon, Math.floor(mon.maxhp * eff / 8), `${mon.label} was hurt by the pointed stones!`);
      }
      if (mon.fainted) return;
      if (this.isGrounded(mon)) {
        if (cond.spikes && !hz.includes('spikes')) {
          const f = [0, 1 / 8, 1 / 6, 1 / 4][cond.spikes];
          this.damage(mon, Math.floor(mon.maxhp * f), `${mon.label} was hurt by the spikes!`);
        }
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
    const s = mon.spec; const foe = this.foeOf(mon);
    if (s.intimidate && foe && !foe.fainted) {
      this.add('ability', `${mon.label}'s ${mon.ability} intimidates the foe!`);
      const fs = foe.spec;
      if (fs.noIntimidate) this.add('effect', `${foe.label} isn't affected!`);
      else if (foe.v.substitute) this.add('effect', `${foe.label}'s substitute blocked it!`);
      else { this.boost(foe, { atk: -1 }, mon); if (fs.rattled) this.boost(foe, { spe: 1 }, foe); }
    }
    if (s.trace && foe && !foe.fainted && !foe.spec.trace && !foe.spec.illusion) {
      mon.ability = foe.ability;
      this.add('ability', `${mon.label} copied ${foe.label}'s ${foe.ability}!`);
      if (mon.ability !== mon.baseAbility) this.abilityOnStart(mon);
      return;
    }
    if (s.frisk && foe && foe.item) this.add('ability', `${mon.label} frisked ${foe.label} and found its ${foe.item}!`);
    if (s.anticipation && foe && foe.moves.some(mv => { const md = MOVES[mv.name]; return md.cat !== 'Status' && effectiveness(md.type, mon.types) > 1; }))
      this.add('ability', `${mon.label} shuddered! It senses danger.`);
    if (s.copyBoosts && foe) {
      let any = false;
      for (const k of BOOST_STATS) if (foe.boosts[k] > 0) { mon.boosts[k] = foe.boosts[k]; any = true; }
      if (any) this.add('ability', `${mon.label} copied ${foe.label}'s stat boosts!`);
    }
    if (s.clearFoeBoosts && foe && BOOST_STATS.some(k => foe.boosts[k])) {
      for (const k of BOOST_STATS) foe.boosts[k] = 0;
      this.add('ability', `${mon.label}'s Ball of Light erased ${foe.label}'s stat changes!`);
    }
    if (s.startSide) {
      const { cond, turns } = s.startSide;
      if (!mon.side.conditions[cond]) { mon.side.conditions[cond] = turns; this.add('ability', `${mon.label}'s ${mon.ability} set up ${cond === 'tailwind' ? 'a tailwind' : 'Reflect'}!`); }
    }
    if (s.startField && !this.field[s.startField.cond]) { this.field[s.startField.cond] = s.startField.turns; this.add('ability', `${mon.label}'s ${mon.ability} intensified gravity!`); }
    if (s.startWeather) this.setWeather(s.startWeather, mon, 5);
    if (s.download && foe) {
      const stat = this.getStat(foe, 'def') < this.getStat(foe, 'spd') ? 'atk' : 'spa';
      this.add('ability', `${mon.label}'s ${mon.ability} analyzed the foe!`); this.boost(mon, { [stat]: 1 }, mon);
    }
    if (s.announcement && !mon.once.announced) {
      mon.once.announced = true;
      if (mon.side.team.some(m => m.status)) { for (const m of mon.side.team) m.status = ''; this.add('ability', `${mon.label}'s Morning Announcement cured the team's status conditions!`); }
    }
    if (s.startBoost) { this.add('ability', `${mon.label}'s ${mon.ability} activated!`); this.boost(mon, s.startBoost, mon); }
    if (s.pressure) this.add('ability', `${mon.label} is exerting its pressure!`);
    if (s.unnerve) this.add('ability', `The opposing team is too nervous to eat Berries!`);
    if (s.illusion && mon.v.illusion) { /* hidden */ }
  }

  // ---------------- stats ----------------
  getStat(mon, stat, opts = {}) {
    let v = mon.stats[stat];
    let stage = mon.boosts[stat];
    if (opts.ignorePositive && stage > 0) stage = 0;
    if (opts.ignoreNegative && stage < 0) stage = 0;
    if (opts.ignoreBoosts) stage = 0;
    v = Math.floor(v * boostMult(stage));
    const s = mon.spec; const item = mon.item;
    if (stat === 'atk') {
      if (item === 'Choice Band') v *= 1.5;
      if (s.guts && mon.status) v *= 1.5;
      if (s.lowHpStat && s.lowHpStat.stat === 'atk' && mon.hpFrac() <= s.lowHpStat.below && (!s.lowHpStat.strict || mon.hpFrac() < s.lowHpStat.below)) v *= s.lowHpStat.mult;
    }
    if (stat === 'spa') {
      if (item === 'Choice Specs') v *= 1.5;
      if (s.solarPower && this.weather() === 'sun') v *= 1.5;
    }
    if (stat === 'spd') {
      if (item === 'Assault Vest') v *= 1.5;
      if (item === 'Eviolite' && EVIOLITE_USERS.includes(mon.species.id)) v *= 1.5;
    }
    if (stat === 'def') {
      if (item === 'Eviolite' && EVIOLITE_USERS.includes(mon.species.id)) v *= 1.5;
      if (this.weather() === 'snow' && mon.types.includes('Ice')) v *= 1.5;
    }
    return Math.floor(v);
  }
  getSpeed(mon) {
    if (!mon) return 0;
    let v = this.getStat(mon, 'spe');
    if (mon.item === 'Choice Scarf') v *= 1.5;
    if (mon.status === 'par') v *= 0.5;
    if (mon.side.conditions.tailwind) v *= 2;
    const s = mon.spec;
    if (s.weatherSpeed && this.weather() === s.weatherSpeed) v *= 2;
    if (s.unburden && mon.unburdened) v *= 2;
    return Math.floor(v);
  }
  getPriority(mon, md) {
    let p = md.prio || 0;
    const s = mon.spec;
    if (s.prankster && md.cat === 'Status') p += 1;
    if (s.galeWings && md.type === 'Flying' && mon.hp === mon.maxhp) p += 1;
    if (s.firstMovePrio && !mon.movedSinceSwitch) p += 1;
    return p;
  }
  weather() { return this.field.weather; }
  isGrounded(mon, attacker) {
    if (this.field.gravity) return true;
    if (mon.v.ingrain) return true;
    if (mon.types.includes('Flying')) return false;
    if (mon.item === 'Air Balloon') return false;
    if (this.abilityActive(mon, attacker).levitate) return false;
    return true;
  }

  // ---------------- HP / status helpers ----------------
  damage(mon, amt, msg) {
    if (mon.fainted || amt <= 0) return 0;
    amt = Math.max(1, Math.floor(amt));
    amt = Math.min(amt, mon.hp);
    mon.hp -= amt;
    if (msg) this.add('dmg', msg);
    if (mon.hp <= 0) this.faint(mon); else this.checkThresholds(mon);
    return amt;
  }
  heal(mon, amt, msg) {
    if (mon.fainted || mon.hp >= mon.maxhp) return 0;
    amt = Math.max(1, Math.floor(amt));
    const h = Math.min(amt, mon.maxhp - mon.hp);
    mon.hp += h;
    if (msg) this.add('heal', msg);
    return h;
  }
  faint(mon) {
    mon.hp = 0; mon.fainted = true; mon.status = '';
    this.add('faint', `${mon.label} fainted!`);
    this.queue = this.queue.filter(a => a.mon !== mon);
    const foe = this.foeOf(mon); if (foe && foe.v.trapped === mon) delete foe.v.trapped;
  }
  checkThresholds(mon) {
    if (mon.fainted) return;
    const t = mon.spec.threshold;
    if (t && !mon.once.threshold && mon.hpFrac() < t.below + 1e-9 && mon.hpFrac() <= t.below) {
      mon.once.threshold = true;
      this.add('ability', `${mon.label}'s ${mon.ability} activated!`);
      if (t.heal) this.heal(mon, mon.maxhp * t.heal, `${mon.label} restored HP!`);
      if (t.boosts) this.boost(mon, t.boosts, mon);
    }
    if (mon.item === 'Sitrus Berry' && mon.hpFrac() <= 0.5) this.eatBerry(mon, () => this.heal(mon, mon.maxhp / 4 * (mon.spec.ripen ? 2 : 1), `${mon.label} restored HP with its Sitrus Berry!`));
  }
  eatBerry(mon, effect) {
    const foe = this.foeOf(mon);
    if (foe && !foe.fainted && foe.spec.unnerve) return;
    const item = mon.item;
    effect();
    const s = mon.spec;
    if (s.berryBonusHeal) this.heal(mon, mon.maxhp * s.berryBonusHeal, `${mon.label}'s ${mon.ability} restored extra HP!`);
    if (s.berryRandomBoost) { const st = ['atk', 'def', 'spa', 'spd', 'spe'][this.random(5)]; this.boost(mon, { [st]: 1 }, mon); }
    mon.berryUses++;
    if (s.berryTwice && mon.berryUses < 2) { this.add('ability', `${mon.label} saved half of its ${item} for later!`); return; }
    this.loseItem(mon, true);
  }
  loseItem(mon, consumed) {
    if (!mon.item) return;
    if (consumed) mon.consumedItem = mon.item;
    mon.item = '';
    if (mon.v.choiceLock) delete mon.v.choiceLock;
    if (mon.spec.unburden) mon.unburdened = true;
  }
  canStatus(mon, status, source, fromHazard) {
    if (mon.fainted) return false;
    if (mon.status) return false;
    const s = (source && source !== mon) ? this.abilityActive(mon, source) : mon.spec;
    if (s.statusImmune && s.statusImmune.includes(status)) return false;
    if (s.statusImmuneTurns && mon.turnsActive < s.statusImmuneTurns) return false;
    const t = mon.types;
    if (status === 'brn' && t.includes('Fire')) return false;
    if (status === 'par' && t.includes('Electric')) return false;
    if ((status === 'psn' || status === 'tox') && (t.includes('Poison') || t.includes('Steel'))) return false;
    if (status === 'frz' && (t.includes('Ice') || this.weather() === 'sun')) return false;
    if (source && source !== mon && mon.side.conditions.safeguard) return false;
    return true;
  }
  trySetStatus(mon, status, source, fromHazard, quiet) {
    if (status === 'tri') status = ['brn', 'par', 'frz'][this.random(3)];
    if (!this.canStatus(mon, status, source, fromHazard)) { if (!quiet) this.add('effect', `It doesn't affect ${mon.label}...`); return false; }
    mon.status = status; mon.statusTurns = status === 'slp' ? 2 + this.random(3) : 0; mon.toxCount = 0;
    this.add('status', `${mon.label} was ${STATUS_LABEL[status]}!`);
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
      if (diff === 0) { this.add('effect', `${mon.label}'s ${STAT_LABEL[k]} won't go any ${raw > 0 ? 'higher' : 'lower'}!`); continue; }
      const word = Math.abs(diff) >= 3 ? 'drastically' : Math.abs(diff) === 2 ? 'sharply' : '';
      this.add('boost', `${mon.label}'s ${STAT_LABEL[k]} ${diff > 0 ? 'rose' : 'fell'}${word ? ' ' + word : ''}!`);
      if (diff < 0 && fromFoe) dropped = true;
    }
    if (dropped && s.onStatDrop) { this.add('ability', `${mon.label}'s ${mon.ability} activated!`); this.boost(mon, s.onStatDrop, mon); }
  }
  setWeather(w, source, turns) {
    if (this.field.weather === w) return false;
    this.field.weather = w; this.field.weatherTurns = turns;
    this.add('weather', { rain: 'It started to rain!', sun: 'The sunlight turned harsh!', snow: 'It started to snow!' }[w]);
    return true;
  }

  // ---------------- moves ----------------
  useMove(mon, moveName, action) {
    const foe = this.foeOf(mon);
    // pre-move checks
    if (mon.v.flinch) { this.add('effect', `${mon.label} flinched and couldn't move!`); if (mon.spec.steadfast) this.boost(mon, { spe: 1 }, mon); this.afterFail(mon); return; }
    if (mon.status === 'slp') {
      mon.statusTurns--;
      if (mon.statusTurns > 0) { this.add('effect', `${mon.label} is fast asleep.`); this.afterFail(mon); return; }
      mon.status = ''; this.add('effect', `${mon.label} woke up!`);
    }
    if (mon.status === 'frz') {
      if (MOVES[moveName] && MOVES[moveName].thaws || this.chance(20)) { mon.status = ''; this.add('effect', `${mon.label} thawed out!`); }
      else { this.add('effect', `${mon.label} is frozen solid!`); this.afterFail(mon); return; }
    }
    if (mon.v.confusion) {
      mon.v.confusion--;
      if (mon.v.confusion <= 0) { delete mon.v.confusion; this.add('effect', `${mon.label} snapped out of its confusion!`); }
      else {
        this.add('effect', `${mon.label} is confused!`);
        if (this.chance(33)) {
          const d = this.calcConfusionDamage(mon);
          this.damage(mon, d, `It hurt itself in its confusion!`); this.afterFail(mon); return;
        }
      }
    }
    if (mon.v.attract && this.isActive(mon.v.attract)) {
      if (this.chance(50)) { this.add('effect', `${mon.label} is immobilized by love!`); this.afterFail(mon); return; }
    }
    if (mon.status === 'par' && this.chance(25)) { this.add('effect', `${mon.label} is paralyzed! It can't move!`); this.afterFail(mon); return; }

    // resolve calling moves
    let md = moveName === 'Struggle' ? STRUGGLE : MOVES[moveName];
    const slotObj = mon.moves.find(x => x.name === moveName);
    if (!action || !action.locked) {
      if (slotObj) {
        if (mon.v.taunt && md.cat === 'Status') { this.add('effect', `${mon.label} can't use ${moveName} after the taunt!`); return; }
        let cost = 1;
        if (foe && !foe.fainted && foe.spec.pressure && md.cat !== 'Status') cost = 2;
        slotObj.pp = Math.max(0, slotObj.pp - cost);
      }
    }
    mon.movedSinceSwitch = true;
    if (this.hasItem(mon, 'Choice Band') || this.hasItem(mon, 'Choice Specs') || this.hasItem(mon, 'Choice Scarf')) if (slotObj) mon.v.choiceLock = moveName;
    if (moveName === 'Metronome' || moveName === 'Copycat') {
      this.add('move', `${mon.label} used ${moveName}!`);
      let called;
      if (moveName === 'Metronome') { const pool = Object.keys(MOVES).filter(n => !NO_METRONOME.has(n)); called = pool[this.random(pool.length)]; }
      else called = this.lastMoveUsed && !NO_METRONOME.has(this.lastMoveUsed) ? this.lastMoveUsed : null;
      if (!called) { this.add('effect', 'But it failed!'); return; }
      this.add('effect', `${moveName} called ${called}!`);
      moveName = called; md = MOVES[called];
    }
    // charging moves
    if (md.charge && !mon.v.charging) {
      const sunSkip = md.sunSkip && this.weather() === 'sun';
      if (!sunSkip) {
        this.add('move', `${mon.label} used ${moveName}!`);
        mon.v.charging = { move: moveName, semi: md.semi };
        const msg = { fly: 'flew up high!', dig: 'burrowed underground!', dive: 'hid underwater!', phantom: 'vanished instantly!' }[md.semi] || 'is charging up!';
        this.add('effect', `${mon.label} ${msg}`);
        if (md.chargeBoost) this.boost(mon, md.chargeBoost, mon);
        return;
      }
    }
    const wasCharging = !!mon.v.charging;
    delete mon.v.charging;
    if (!wasCharging || !md.charge) this.add('move', `${mon.label} used ${moveName}!`);
    else this.add('move', `${mon.label} used ${moveName}!`);
    if (moveName !== 'Struggle') this.lastMoveUsed = moveName;
    mon.lastMove = moveName;

    if (md.special === 'focuspunch' && mon.v.tookDamage) { this.add('effect', `${mon.label} lost its focus and couldn't move!`); return; }
    if (mon.spec.protean && !mon.switchFlags.protean && !(mon.types.length === 1 && mon.types[0] === md.type) && moveName !== 'Struggle') {
      mon.types = [md.type]; mon.switchFlags.protean = true;
      this.add('ability', `${mon.label}'s ${mon.ability} made it the ${md.type} type!`);
    }
    // mold breaker
    this.moldBreaker = (mon.spec.moldBreaker || (mon.spec.fireBreaker && md.type === 'Fire')) ? mon : null;
    try {
      if (md.cat === 'Status') this.runStatusMove(mon, foe, md);
      else this.runAttack(mon, foe, md, moveName);
    } finally { this.moldBreaker = null; }
    if (md.special === 'outrage' && !mon.fainted) {
      if (!mon.v.outrage) mon.v.outrage = 1 + this.random(2);
      else { mon.v.outrage--; if (mon.v.outrage <= 0) { delete mon.v.outrage; this.add('effect', `${mon.label} became confused due to fatigue!`); this.tryConfuse(mon, mon); } }
    }
    if (md.special === 'steelbeam' && !mon.fainted) this.damage(mon, Math.ceil(mon.maxhp / 2), `${mon.label} lost half its HP to power the beam!`);
  }
  afterFail(mon) { delete mon.v.charging; delete mon.v.outrage; mon.v.rollout = 0; mon.movedSinceSwitch = true; }

  calcConfusionDamage(mon) {
    const a = this.getStat(mon, 'atk'), d = this.getStat(mon, 'def');
    return Math.floor(Math.floor(Math.floor(2 * LEVEL / 5 + 2) * 40 * a / d) / 50) + 2;
  }

  accuracyCheck(mon, target, md, moveName) {
    if (target.v.charging && target.v.charging.semi) {
      const semi = target.v.charging.semi;
      if (!(md.hitsSemi && md.hitsSemi.includes(semi))) { this.add('effect', `${target.label} avoided the attack!`); return false; }
    }
    if (md.acc === true) return true;
    if (md.poisonNeverMiss && mon.types.includes('Poison')) return true;
    if (moveName === 'Bounce' && mon.spec.bounceBoost) return true;
    let acc = md.acc;
    const w = this.weather();
    if (md.rainAcc && w === 'rain') return true;
    if (md.rainAcc && w === 'sun') acc = 50;
    if (md.snowAcc && w === 'snow') return true;
    let stage = mon.boosts.accuracy - (md.ignoreDefBoosts ? 0 : target.boosts.evasion);
    stage = clamp(stage, -6, 6);
    acc *= accMult(stage);
    if (mon.spec.accMult) acc *= mon.spec.accMult;
    if (this.field.gravity) acc *= 5 / 3;
    if (this.rng() * 100 < acc) return true;
    this.add('effect', `${mon.label}'s attack missed!`);
    if (target.spec.foeMissBoost && !target.fainted) { this.add('ability', `${target.label}'s ${target.ability} activated!`); this.boost(target, target.spec.foeMissBoost, target); }
    return false;
  }

  checkProtect(mon, target, md) {
    if (!target.v.protect) return false;
    if (md.breaksProtect) { delete target.v.protect; this.add('effect', `${mon.label} broke through the protection!`); return false; }
    this.add('effect', `${target.label} protected itself!`);
    if (target.v.protect === 'kings' && this.makesContact(mon, md)) this.boost(mon, { atk: -1 }, target);
    const ts = target.spec;
    if (ts.protectFoeBoost) { this.add('ability', `${target.label}'s ${target.ability} activated!`); this.boost(mon, ts.protectFoeBoost, target); }
    if (ts.protectSelfBoost) { this.add('ability', `${target.label}'s ${target.ability} activated!`); this.boost(target, ts.protectSelfBoost, target); }
    if (md.special === 'crash') this.damage(mon, mon.maxhp / 2, `${mon.label} kept going and crashed!`);
    return true;
  }
  makesContact(mon, md) { return !!md.contact && !mon.spec.longReach; }

  isReflectable(md) {
    if (md.cat !== 'Status') return false;
    if (md.status || md.hazard || (md.boosts && md.boosts.target === 'foe')) return true;
    return ['taunt', 'encore', 'disable', 'leechseed', 'forceswitch', 'partingshot'].includes(md.special);
  }

  runStatusMove(mon, foe, md) {
    const name = md.name;
    const targetsFoe = !!(md.status || (md.boosts && md.boosts.target === 'foe') || ['taunt', 'encore', 'disable', 'leechseed', 'forceswitch', 'partingshot', 'trick', 'painsplit'].includes(md.special));
    let target = foe; let user = mon;
    if (targetsFoe) {
      if (!foe || foe.fainted) { this.add('effect', 'But there was no target...'); return; }
      if (mon.spec.prankster && foe.types.includes('Dark')) { this.add('effect', `It doesn't affect ${foe.label}...`); return; }
      if (this.checkProtect(mon, foe, md)) return;
      // Magic Coat / Magic Bounce
      if (this.isReflectable(md) && (foe.v.magiccoat || this.abilityActive(foe, mon).magicBounce)) {
        this.add('effect', `${foe.label} bounced the ${name} back!`);
        target = mon; user = foe;
      }
      if (md.acc !== true && target !== user && !this.accuracyCheck(user, target, md, name)) return;
      if (target.v.substitute && !md.sound && !user.spec.infiltrator && target !== user && md.special !== 'painsplit') { this.add('effect', 'But it failed!'); return; }
      if (md.powder && target.types.includes('Grass')) { this.add('effect', `It doesn't affect ${target.label}...`); return; }
    }
    if (mon.spec.statusMoveHeal) this.heal(mon, mon.maxhp * mon.spec.statusMoveHeal, `${mon.label} restored a little HP with ${mon.ability}!`);

    if (md.status) { if (!this.trySetStatus(target, md.status, user)) return; return; }
    if (md.boosts) {
      const { target: who, ...b } = md.boosts;
      this.boost(who === 'self' ? user : target, b, user);
      return;
    }
    if (md.heal) {
      if (user.hp >= user.maxhp) { this.add('effect', `${user.label}'s HP is full!`); return; }
      let f = md.heal;
      if (md.sunHeal) { const w = this.weather(); f = w === 'sun' ? 2 / 3 : (w === 'rain' || w === 'snow') ? 0.25 : 0.5; }
      if (user.spec.healBoost) f *= user.spec.healBoost;
      this.heal(user, user.maxhp * f, `${user.label} restored HP!`);
      return;
    }
    if (md.weather) { if (!this.setWeather(md.weather, user, 5)) this.add('effect', 'But it failed!'); return; }
    if (md.field) {
      const f = md.field;
      if (f === 'trickroom') {
        if (this.field.trickroom) { this.field.trickroom = 0; this.add('field', 'The twisted dimensions returned to normal!'); }
        else { this.field.trickroom = 5; this.add('field', `${user.label} twisted the dimensions!`); }
      } else if (f === 'gravity') {
        if (this.field.gravity) { this.add('effect', 'But it failed!'); return; }
        this.field.gravity = 5; this.add('field', 'Gravity intensified!');
        for (const s of this.sides) { const a = this.active(s); if (a && a.v.charging && a.v.charging.semi === 'fly') delete a.v.charging; }
      }
      return;
    }
    if (md.side) {
      const c = user.side.conditions;
      if (c[md.side]) { this.add('effect', 'But it failed!'); return; }
      const turns = md.side === 'tailwind' ? 4 : (this.hasItem(user, 'Light Clay') ? 8 : 5);
      c[md.side] = turns;
      this.add('field', { reflect: `Reflect made ${user.side.name}'s team stronger against physical moves!`, lightscreen: `Light Screen made ${user.side.name}'s team stronger against special moves!`, tailwind: `The tailwind blew from behind ${user.side.name}'s team!` }[md.side]);
      return;
    }
    if (md.hazard) {
      const c = this.foe(user.side).conditions; const h = md.hazard;
      const max = { spikes: 3, toxicspikes: 2, stealthrock: 1, stickyweb: 1 }[h];
      if ((c[h] || 0) >= max) { this.add('effect', 'But it failed!'); return; }
      c[h] = (c[h] || 0) + 1;
      this.add('field', { spikes: 'Spikes were scattered around the opposing team!', toxicspikes: 'Poison spikes were scattered around the opposing team!', stealthrock: 'Pointed stones float in the air around the opposing team!', stickyweb: 'A sticky web spread out around the opposing team!' }[h]);
      return;
    }
    const sp = md.special;
    switch (sp) {
      case 'protect': {
        const ok = this.queue.length > 0 && this.chance(100 / Math.pow(3, user.protectCount));
        if (!ok) { this.add('effect', 'But it failed!'); user.protectCount = 0; return; }
        user.v.protect = md.kingsShield ? 'kings' : true; user.protectCount++; user.v.protectedThisTurn = true;
        this.add('effect', `${user.label} protected itself!`);
        return;
      }
      case 'substitute': {
        if (user.v.substitute) { this.add('effect', `${user.label} already has a substitute!`); return; }
        const cost = Math.floor(user.maxhp / (user.spec.cheapSub ? 8 : 4));
        if (user.hp <= cost) { this.add('effect', 'But it does not have enough HP left to make a substitute!'); return; }
        this.damage(user, cost);
        user.v.substitute = cost; this.add('effect', `${user.label} put in a substitute!`);
        return;
      }
      case 'bellydrum': {
        if (user.hp <= user.maxhp / 2 || user.boosts.atk >= 6) { this.add('effect', 'But it failed!'); return; }
        this.damage(user, user.maxhp / 2);
        user.boosts.atk = 6; this.add('boost', `${user.label} cut its own HP and maximized its Attack!`);
        return;
      }
      case 'wish': {
        if (user.side.conditions.wish) { this.add('effect', 'But it failed!'); return; }
        user.side.conditions.wish = { turns: 2, hp: Math.floor(user.maxhp / 2), from: user.displaySpecies.name };
        this.add('effect', `${user.label} made a wish!`);
        return;
      }
      case 'rest': {
        if (user.hp >= user.maxhp || user.status === 'slp') { this.add('effect', 'But it failed!'); return; }
        if (user.spec.statusImmune && user.spec.statusImmune.includes('slp')) { this.add('effect', 'But it failed!'); return; }
        user.status = 'slp'; user.statusTurns = 3; user.hp = user.maxhp;
        this.add('heal', `${user.label} slept and became healthy!`);
        return;
      }
      case 'focusenergy': user.v.focusEnergy = true; this.add('effect', `${user.label} is getting pumped!`); return;
      case 'healbell': {
        for (const m of user.side.team) m.status = '';
        this.add('heal', `A soothing aroma wafted through ${user.side.name}'s team!`);
        return;
      }
      case 'painsplit': {
        const avg = Math.floor((user.hp + target.hp) / 2);
        user.hp = Math.min(user.maxhp, avg); target.hp = Math.min(target.maxhp, avg);
        this.add('effect', 'The battlers shared their pain!');
        this.checkThresholds(target);
        return;
      }
      case 'leechseed': {
        if (target.types.includes('Grass') || target.v.leechSeed) { this.add('effect', `It doesn't affect ${target.label}...`); return; }
        target.v.leechSeed = true; this.add('effect', `${target.label} was seeded!`);
        return;
      }
      case 'ingrain': {
        if (user.v.ingrain) { this.add('effect', 'But it failed!'); return; }
        user.v.ingrain = true; this.add('effect', `${user.label} planted its roots!`);
        return;
      }
      case 'taunt': {
        if (target.v.taunt || this.abilityActive(target, user).noTaunt) { this.add('effect', 'But it failed!'); return; }
        target.v.taunt = 3; this.add('effect', `${target.label} fell for the taunt!`);
        return;
      }
      case 'encore': {
        const last = target.lastMove;
        if (!last || target.v.encore || !target.moves.some(x => x.name === last)) { this.add('effect', 'But it failed!'); return; }
        target.v.encore = { move: last, turns: 3 }; this.add('effect', `${target.label} must do an encore!`);
        return;
      }
      case 'disable': {
        const last = target.lastMove;
        if (!last || target.v.disable || !target.moves.some(x => x.name === last)) { this.add('effect', 'But it failed!'); return; }
        target.v.disable = { move: last, turns: 4 }; this.add('effect', `${target.label}'s ${last} was disabled!`);
        return;
      }
      case 'trick': {
        if ((!user.item && !target.item) || this.abilityActive(target, user).stickyHold) { this.add('effect', 'But it failed!'); return; }
        const a = user.item, b = target.item;
        user.item = b; target.item = a;
        if (!user.item && user.spec.unburden) user.unburdened = true;
        if (!target.item && target.spec.unburden) target.unburdened = true;
        delete user.v.choiceLock; delete target.v.choiceLock;
        this.add('effect', `${user.label} switched items with its target!`);
        if (b) this.add('effect', `${user.label} obtained ${b}.`);
        if (a) this.add('effect', `${target.label} obtained ${a}.`);
        return;
      }
      case 'magiccoat': user.v.magiccoat = true; this.add('effect', `${user.label} shrouded itself with Magic Coat!`); return;
      case 'defog': {
        for (const s of this.sides) for (const h of ['spikes', 'toxicspikes', 'stealthrock', 'stickyweb']) delete s.conditions[h];
        const fc = this.foe(user.side).conditions; delete fc.reflect; delete fc.lightscreen;
        this.add('field', `${user.label} blew away the hazards and screens!`);
        if (foe && !foe.fainted) this.boost(foe, { evasion: -1 }, user);
        return;
      }
      case 'forceswitch': {
        if (target.v.ingrain || this.abilityActive(target, user).suctionCups) { this.add('effect', `${target.label} anchored itself!`); return; }
        this.dragOut(target);
        return;
      }
      case 'partingshot': {
        this.boost(target, { atk: -1, spa: -1 }, user);
        if (this.bench(user.side).length) this.requestPivot(user, 'pivot');
        return;
      }
      case 'pivot': // Teleport
        if (this.bench(user.side).length) this.requestPivot(user, 'pivot'); else this.add('effect', 'But it failed!');
        return;
    }
    this.add('effect', 'But nothing happened.');
  }

  dragOut(target) {
    const b = this.bench(target.side);
    if (!b.length) return;
    const pick = b[this.random(b.length)];
    this.add('effect', `${target.label} was dragged out!`);
    this.doSwitch(target.side, target.side.team.indexOf(pick), true);
  }
  requestPivot(mon, reason) {
    if (!this.bench(mon.side).length || this.ended || this.inResiduals) return;
    if (this.pendingSwitches.some(p => p.side === mon.side.n)) return;
    this.pendingSwitches.push({ side: mon.side.n, reason });
  }

  // effectiveness with move-specific tweaks
  typeEff(mon, target, md) {
    let types = target.types;
    if (md.special === 'thousandarrows' && types.includes('Flying')) types = types.filter(t => t !== 'Flying');
    let eff = effectiveness(md.type, types);
    if (md.special === 'freezedry' && target.types.includes('Water')) eff = eff / (effectiveness('Ice', ['Water'])) * 2;
    if (eff === 0 && target.types.includes('Ghost') && md.type === 'Normal' && mon.spec.scrappy) {
      eff = effectiveness('Normal', target.types.filter(t => t !== 'Ghost'));
    }
    if (md.type === 'Normal' && mon.spec.normalVsGhost && target.types.includes('Ghost')) eff *= mon.spec.normalVsGhost;
    if (md.name === 'Struggle') eff = 1;
    return eff;
  }

  runAttack(mon, foe, md, moveName) {
    const target = foe;
    if (!target || target.fainted) { this.add('effect', 'But there was no target...'); mon.v.rollout = 0; return; }
    if (md.special === 'fakeout' && mon.turnsActive > 0) { this.add('effect', 'But it failed!'); return; }
    if (md.special === 'sucker') {
      const planned = target.v.plannedMove ? MOVES[target.v.plannedMove] : null;
      const targetMoved = !this.queue.some(a => a.mon === target && a.kind === 'move');
      if (!planned || planned.cat === 'Status' || targetMoved) { this.add('effect', 'But it failed!'); return; }
    }
    if (md.special === 'poltergeist' && !target.item) { this.add('effect', 'But it failed!'); return; }
    if (md.special === 'fling' && !mon.item) { this.add('effect', 'But it failed!'); return; }
    if (this.checkProtect(mon, target, md)) { mon.v.rollout = 0; return; }
    if (!this.accuracyCheck(mon, target, md, moveName)) {
      if (md.special === 'crash') this.damage(mon, mon.maxhp / 2, `${mon.label} kept going and crashed!`);
      mon.v.rollout = 0;
      return;
    }
    const ts = this.abilityActive(target, mon);
    // Immunities
    const eff = this.typeEff(mon, target, md);
    const groundImmune = md.type === 'Ground' && md.special !== 'thousandarrows' && !this.isGrounded(target, mon);
    if (md.special !== 'counter' && md.special !== 'mirrorcoat' && md.special !== 'level' && (eff === 0 || groundImmune)) {
      this.add('effect', `It doesn't affect ${target.label}...`); mon.v.rollout = 0;
      if (md.special === 'crash') this.damage(mon, mon.maxhp / 2, `${mon.label} kept going and crashed!`);
      return;
    }
    if (md.special === 'level' && target.types.includes('Normal')) { this.add('effect', `It doesn't affect ${target.label}...`); return; }
    if (ts.absorb && ts.absorb.type === md.type) {
      this.add('ability', `${target.label}'s ${target.ability} absorbed the attack!`);
      if (ts.absorb.heal) this.heal(target, target.maxhp * ts.absorb.heal, `${target.label} restored HP!`);
      if (ts.absorb.boosts) this.boost(target, ts.absorb.boosts, target);
      return;
    }
    if (ts.immuneFlag && md[ts.immuneFlag]) { this.add('ability', `${target.label}'s ${target.ability} blocked the attack!`); return; }
    if (ts.pocket && md.bullet && !target.switchFlags.pocketUsed) { target.switchFlags.pocketUsed = true; this.add('ability', `${target.label} pocketed the attack!`); return; }

    // break screens
    if (md.special === 'brickbreak') {
      const c = target.side.conditions;
      if (c.reflect || c.lightscreen) { delete c.reflect; delete c.lightscreen; this.add('field', `${mon.label} shattered the screens!`); }
    }

    // Counter / Mirror Coat
    if (md.special === 'counter' || md.special === 'mirrorcoat') {
      const want = md.special === 'counter' ? 'Physical' : 'Special';
      const h = mon.v.lastHit;
      if (!h || h.cat !== want || h.by !== target) { this.add('effect', 'But it failed!'); return; }
      this.applyDamage(mon, target, md, h.amount * 2, { eff: 1 });
      return;
    }

    // number of hits
    let hits = 1;
    if (md.multihit) {
      if (Array.isArray(md.multihit)) {
        if (mon.spec.skillLink) hits = md.multihit[1];
        else { const r = this.random(100); hits = r < 35 ? 2 : r < 70 ? 3 : r < 85 ? 4 : 5; }
      } else hits = md.multihit;
    }
    const pBond = mon.spec.parentalBond && hits === 1 && !md.charge && md.special !== 'explosion';
    if (pBond) hits = 2;

    let totalDealt = 0; let hitCount = 0; let lastCrit = false;
    for (let h = 0; h < hits; h++) {
      if (target.fainted || mon.fainted) break;
      let power = this.basePower(mon, target, md, h);
      if (pBond && h === 1) power = Math.floor(power / 4);
      const { dmg, crit } = this.calcDamage(mon, target, md, power, eff);
      lastCrit = crit;
      if (crit) this.add('effect', 'A critical hit!');
      if (h === 0 && !target.v.substitute) { if (eff > 1) this.add('eff', "It's super effective!"); else if (eff < 1) this.add('eff', "It's not very effective..."); }
      const dealt = this.applyDamage(mon, target, md, dmg, { eff, crit, hitIndex: h });
      totalDealt += dealt; hitCount++;
      if (dealt < 0) break;
    }
    if (hits > 1 && hitCount) this.add('effect', `Hit ${hitCount} time${hitCount > 1 ? 's' : ''}!`);
    if (md.special === 'rollout') mon.v.rollout = (mon.v.rollout || 0) + 1;
    this.afterAttack(mon, target, md, totalDealt, lastCrit);
  }

  basePower(mon, target, md, hitIndex) {
    let p = md.power;
    switch (md.special) {
      case 'gyroball': p = Math.min(150, Math.floor(25 * this.getSpeed(target) / Math.max(1, this.getSpeed(mon))) + 1); break;
      case 'acrobatics': if (!mon.item) p *= 2; break;
      case 'facade': if (mon.status) p *= 2; break;
      case 'hex': if (target.status) p *= 2; break;
      case 'revenge': if (mon.v.lastHit && mon.v.lastHit.by === target) p *= 2; break;
      case 'knockoff': if (target.item) p = Math.floor(p * 1.5); break;
      case 'rollout': p = 30 * Math.pow(2, Math.min(4, mon.v.rollout || 0)); break;
      case 'triplekick': p = 20 * (hitIndex + 1); break;
    }
    return p;
  }

  calcDamage(mon, target, md, power, eff, noRandom) {
    const s = mon.spec; const ts = this.abilityActive(target, mon);
    // crit
    let critStage = (md.crit || 0) + (s.critBonus || 0) + (mon.v.focusEnergy ? 2 : 0);
    if (s.flagCrit && md[s.flagCrit]) critStage += 1;
    let crit = false;
    if (s.hitCounterCrit && mon.v.chargedCrit && (!s.hitCounterCrit.flag || md[s.hitCounterCrit.flag])) { crit = true; if (!noRandom) mon.v.chargedCrit = false; }
    else if (!noRandom) crit = this.rng() < [1 / 24, 1 / 8, 1 / 2, 1, 1][Math.min(critStage, 4)];
    if (ts.battleArmor) crit = false;

    const physical = md.cat === 'Physical';
    let atkStat, defStat;
    const atkOpts = crit ? { ignoreNegative: true } : {};
    const defOpts = crit || md.ignoreDefBoosts ? { ignorePositive: true } : {};
    if (md.special === 'bodypress') atkStat = this.getStat(mon, 'def', atkOpts);
    else atkStat = this.getStat(mon, physical ? 'atk' : 'spa', atkOpts);
    defStat = this.getStat(target, (physical || md.useDef) ? 'def' : 'spd', defOpts);

    // base power modifiers
    let bp = power;
    if (s.flagBoost && (md[s.flagBoost.flag] || (s.flagBoost.flag === 'contact' && this.makesContact(mon, md)))) bp *= s.flagBoost.mult;
    if (s.typeBoost && s.typeBoost[md.type]) bp *= s.typeBoost[md.type];
    if (s.vsType && target.types.some(t => s.vsType[t])) bp *= Math.max(...target.types.map(t => s.vsType[t] || 1));
    if (s.pinch && s.pinch.type === md.type && mon.hpFrac() <= 1 / 3) bp *= 1.5;
    if (s.sheerForce && md.sec) bp *= 1.3;
    if (s.analytic && !this.queue.some(a => a.mon === target)) bp *= 1.3;
    if (s.weightBoost && md.weightMove) bp *= s.weightBoost;
    if (s.bounceBoost && md.name === 'Bounce') bp *= 1.5;
    if (md.hitsSemi && target.v.charging && md.hitsSemi.includes(target.v.charging.semi) && ['dig', 'dive'].includes(target.v.charging.semi)) bp *= 2;
    bp = Math.max(1, Math.floor(bp));

    let dmg = Math.floor(Math.floor(Math.floor(2 * LEVEL / 5 + 2) * bp * atkStat / defStat) / 50) + 2;
    // weather
    const w = this.weather();
    if (w === 'rain') { if (md.type === 'Water') dmg *= 1.5; if (md.type === 'Fire') dmg *= 0.5; }
    if (w === 'sun') { if (md.type === 'Fire') dmg *= 1.5; if (md.type === 'Water') dmg *= 0.5; }
    if (crit) dmg *= s.sniper ? 2.25 : 1.5;
    if (!noRandom) dmg = Math.floor(dmg * (85 + this.random(16)) / 100);
    else dmg = Math.floor(dmg * 0.925);
    if (mon.types.includes(md.type) && md.name !== 'Struggle') dmg *= 1.5;
    dmg *= eff;
    if (physical && mon.status === 'brn' && !s.guts && md.special !== 'facade') dmg *= 0.5;
    // screens
    const c = target.side.conditions;
    const ignoreScreens = crit || s.infiltrator || (s.fireBreaker && md.type === 'Fire');
    if (!ignoreScreens && ((physical && c.reflect) || (!physical && c.lightscreen))) dmg *= 0.5;
    // defender abilities
    if (ts.filter && eff > 1) dmg *= ts.filter;
    if (ts.typeTaken && ts.typeTaken[md.type]) dmg *= ts.typeTaken[md.type];
    if (ts.flagTaken && md[ts.flagTaken.flag]) dmg *= ts.flagTaken.mult;
    if (ts.fullHpTaken && target.hp === target.maxhp) dmg *= ts.fullHpTaken;
    if (ts.gutCheck && this.makesContact(mon, md) && !target.switchFlags.gutCheck) { dmg *= 0.5; if (!noRandom) target.switchFlags.gutCheck = true; }
    if (ts.luma && (target.once.lumaHits || 0) < 2) { dmg *= 0.75; if (!noRandom) target.once.lumaHits = (target.once.lumaHits || 0) + 1; }
    // items
    if (mon.item === 'Life Orb') dmg *= 1.3;
    if (mon.item === 'Expert Belt' && eff > 1) dmg *= 1.2;
    dmg = Math.floor(dmg);
    if (eff > 0 && dmg < 1) dmg = 1;
    return { dmg, crit };
  }

  // returns damage dealt, or -1 if the hit chain should stop
  applyDamage(mon, target, md, dmg, info) {
    const ts = this.abilityActive(target, mon);
    if (md.special === 'level') dmg = LEVEL;
    // substitute
    if (target.v.substitute && !md.sound && !mon.spec.infiltrator) {
      const d = Math.min(dmg, target.v.substitute);
      target.v.substitute -= d;
      this.add('dmg', `The substitute took damage for ${target.label}!`);
      if (target.v.substitute <= 0) { delete target.v.substitute; this.add('effect', `${target.label}'s substitute faded!`); }
      return d;
    }
    if (ts.disguise && !target.once.disguise) {
      target.once.disguise = true;
      this.add('ability', `${target.label}'s ${target.ability} took the hit! Its mask fell off.`);
      return 0;
    }
    if (target.v.illusion) { target.v.illusion = false; target.once.illusionBroken = true; target.displaySpecies = target.species; this.add('ability', `${target.side.name}'s ${target.species.name}'s illusion wore off!`); }
    // survival effects
    if (dmg >= target.hp) {
      if (target.hp === target.maxhp && ts.sturdy) { dmg = target.hp - 1; this.add('ability', `${target.label} endured the hit with ${target.ability}!`); }
      else if (target.hp === target.maxhp && this.hasItem(target, 'Focus Sash')) { dmg = target.hp - 1; this.add('effect', `${target.label} hung on using its Focus Sash!`); this.loseItem(target, true); }
      else if (ts.surviveOnce && !target.once.survived) { target.once.survived = true; dmg = target.hp - 1; this.add('ability', `${target.label} hung on with ${target.ability}!`); }
    }
    dmg = Math.min(dmg, target.hp);
    const pctBefore = target.hp;
    target.hp -= dmg;
    this.add('dmg', `${target.label} lost ${Math.round(dmg / target.maxhp * 1000) / 10}% of its HP!`);
    target.v.tookDamage = true;
    target.v.lastHit = { amount: dmg, cat: md.cat, by: mon };
    target.hitsTaken++;
    if (target.item === 'Air Balloon') { this.add('effect', `${target.label}'s Air Balloon popped!`); this.loseItem(target, false); }
    if (target.spec.hitCounterCrit && target.hitsTaken % target.spec.hitCounterCrit.hits === 0) { target.v.chargedCrit = true; this.add('ability', `${target.label}'s ${target.ability} is charged!`); }
    if (target.hp <= 0) { this.faint(target); this.onKO(mon, target); }
    else {
      this.onDamagedBy(target, mon, md, info, pctBefore);
      this.checkThresholds(target);
    }
    if (dmg > 0 && md.drain) this.heal(mon, Math.max(1, Math.floor(dmg * md.drain)), `${target.label} had its energy drained!`);
    if (dmg > 0 && mon.spec.drainAll) this.heal(mon, Math.floor(dmg * mon.spec.drainAll), `${mon.label}'s ${mon.ability} restored its HP!`);
    // contact reactions
    if (dmg > 0 && this.makesContact(mon, md) && !mon.fainted) this.contactReactions(mon, target, md);
    return dmg;
  }

  onDamagedBy(target, mon, md, info, hpBefore) {
    const s = target.spec;
    if (s.hitByType && s.hitByType.type === md.type) { this.add('ability', `${target.label}'s ${target.ability} activated!`); this.boost(target, s.hitByType.boosts, target); }
    if (s.rattled && ['Bug', 'Ghost', 'Dark'].includes(md.type)) { this.add('ability', `${target.label}'s ${target.ability} activated!`); this.boost(target, { spe: 1 }, target); }
    if (s.hitBoost) { this.add('ability', `${target.label}'s ${target.ability} activated!`); this.boost(target, s.hitBoost, target); }
    if (s.angerPoint && info.crit && target.boosts.atk < 6) { target.boosts.atk = 6; this.add('ability', `${target.label}'s ${target.ability} maxed its Attack!`); }
    if (s.colorChange && !target.types.includes(md.type) && md.name !== 'Struggle') { target.types = [md.type]; this.add('ability', `${target.label}'s ${target.ability} made it the ${md.type} type!`); }
    if (s.emergencyExit && hpBefore > target.maxhp / 2 && target.hp <= target.maxhp / 2 && this.bench(target.side).length) {
      this.add('ability', `${target.label}'s ${target.ability} activated!`);
      this.requestPivot(target, 'emergency');
    }
  }

  contactReactions(mon, target, md) {
    const ts = target.spec;
    if (ts.roughSkin) this.damage(mon, mon.maxhp * ts.roughSkin, `${mon.label} was hurt by ${target.label}'s ${target.ability}!`);
    if (mon.fainted) return;
    if (this.hasItem(target, 'Rocky Helmet')) this.damage(mon, mon.maxhp / 6, `${mon.label} was hurt by the Rocky Helmet!`);
    if (mon.fainted) return;
    if (ts.contactStatus && this.chance(ts.contactStatus.chance)) this.trySetStatus(mon, ts.contactStatus.status, target, false, true);
    if (ts.contactAttract && !mon.v.attract && this.chance(ts.contactAttract)) { mon.v.attract = target; this.add('status', `${mon.label} fell in love!`); }
    if (ts.contactFoeBoost) this.boost(mon, ts.contactFoeBoost, target);
    if (ts.mummy && mon.ability !== target.ability && !mon.spec.mummy) { mon.ability = target.ability; this.add('ability', `${mon.label}'s ability became ${target.ability}!`); }
    if (ts.pickpocket && !target.fainted && !target.item && mon.item) {
      target.item = mon.item; this.loseItem(mon, false);
      this.add('ability', `${target.label} stole ${mon.label}'s ${target.item}!`);
    }
  }

  onKO(attacker, target) {
    if (attacker.fainted || attacker === target) return;
    const s = attacker.spec;
    if (s.onKO) { this.add('ability', `${attacker.label}'s ${attacker.ability} activated!`); this.boost(attacker, s.onKO, attacker); }
  }

  afterAttack(mon, target, md, dealt, crit) {
    const s = mon.spec;
    const sheer = s.sheerForce && md.sec;
    // recoil
    if (dealt > 0 && md.recoil && !s.rockHead && !mon.fainted) this.damage(mon, Math.max(1, Math.floor(dealt * md.recoil)), `${mon.label} was damaged by the recoil!`);
    if (md.name === 'Struggle' && !mon.fainted) this.damage(mon, mon.maxhp / 4, `${mon.label} was damaged by the recoil!`);
    if (md.special === 'explosion' && !mon.fainted) this.faint(mon);
    if (dealt > 0 && mon.item === 'Life Orb' && !sheer && !mon.fainted) this.damage(mon, mon.maxhp / 10, `${mon.label} lost some of its HP!`);
    // secondaries
    const hitSub = target.v && target.v.substitute;
    if (dealt > 0 && md.sec && !sheer) {
      for (const e of md.sec) {
        if (!this.chance(e.chance)) continue;
        if (e.self) { if (!mon.fainted) this.boost(mon, e.self, mon); continue; }
        if (target.fainted || hitSub) continue;
        if (e.status) this.trySetStatus(target, e.status, mon, false, true);
        if (e.volatile === 'flinch') { const ts = this.abilityActive(target, mon); if (!ts.noFlinch && this.queue.some(a => a.mon === target)) target.v.flinch = true; }
        if (e.volatile === 'confusion') this.tryConfuse(target, mon);
        if (e.boosts) this.boost(target, e.boosts, mon);
      }
    }
    if (dealt > 0 && s.attackStatus && !target.fainted && !hitSub) {
      const a = s.attackStatus;
      if ((!a.contactOnly || this.makesContact(mon, md)) && (!a.flag || md[a.flag]) && this.chance(a.chance)) this.trySetStatus(target, a.status, mon, false, true);
    }
    if (md.selfBoost && !mon.fainted && dealt >= 0) this.boost(mon, md.selfBoost, mon);
    // item interactions
    if (dealt > 0 && md.special === 'knockoff' && target.item && !target.fainted) { this.add('effect', `${mon.label} knocked off ${target.label}'s ${target.item}!`); this.loseItem(target, false); }
    if (dealt > 0 && (md.special === 'thief' || s.magician) && !mon.item && target.item && !mon.fainted) {
      mon.item = target.item; this.loseItem(target, false); this.add('effect', `${mon.label} stole ${target.label}'s ${mon.item}!`);
    }
    if (md.special === 'fling' && mon.item) { this.add('effect', `${mon.label} flung its ${mon.item}!`); this.loseItem(mon, false); }
    if (md.special === 'rapidspin' && dealt > 0 && !mon.fainted) {
      const c = mon.side.conditions; let any = false;
      for (const h of ['spikes', 'toxicspikes', 'stealthrock', 'stickyweb']) if (c[h]) { delete c[h]; any = true; }
      if (mon.v.leechSeed) { delete mon.v.leechSeed; any = true; }
      if (mon.v.trapped) { delete mon.v.trapped; any = true; }
      if (any) this.add('effect', `${mon.label} blew away the hazards!`);
    }
    if (md.special === 'trap' && dealt > 0 && !target.fainted && !target.types.includes('Ghost')) { target.v.trapped = mon; this.add('effect', `${target.label} can no longer escape!`); }
    if (md.special === 'dragout' && dealt > 0 && !target.fainted && !mon.fainted) {
      if (!(target.v.ingrain || this.abilityActive(target, mon).suctionCups)) this.dragOut(target);
    }
    if (md.special === 'futuresight') { /* handled before damage: not used */ }
    if (md.special === 'pivot' && dealt > 0 && !mon.fainted && this.bench(mon.side).length && !this.ended) this.requestPivot(mon, 'pivot');
  }

  // Future Sight is queued rather than dealt immediately
  // (overrides runAttack path)
  // ---------------- end of turn ----------------
  residuals() {
    this.inResiduals = true;
    try { this._residuals(); } finally { this.inResiduals = false; }
  }
  _residuals() {
    const order = this.speedOrder(this.sides.map(s => this.active(s)).filter(m => m && !m.fainted));
    // weather
    if (this.field.weather) {
      this.field.weatherTurns--;
      if (this.field.weatherTurns <= 0) { this.add('weather', { rain: 'The rain stopped.', sun: 'The harsh sunlight faded.', snow: 'The snow stopped.' }[this.field.weather]); this.field.weather = ''; }
    }
    // future sight
    for (const f of this.futures.slice()) {
      f.turns--;
      if (f.turns <= 0) {
        this.futures.splice(this.futures.indexOf(f), 1);
        const t = this.active(this.sides[f.side]);
        if (t && !t.fainted) {
          this.add('move', `${t.label} took the Future Sight attack!`);
          const md = MOVES['Future Sight'];
          const eff = effectiveness('Psychic', t.types);
          if (eff === 0) this.add('effect', `It doesn't affect ${t.label}...`);
          else { const { dmg } = this.calcDamage(f.user, t, md, 120, eff); this.applyDamage(f.user, t, md, dmg, { eff }); }
        }
      }
    }
    // wish
    for (const s of this.sides) {
      const w = s.conditions.wish;
      if (w) { w.turns--; if (w.turns <= 0) { const a = this.active(s); if (a && !a.fainted) this.heal(a, w.hp, `${w.from}'s wish came true!`); delete s.conditions.wish; } }
    }
    for (const mon of order) {
      if (mon.fainted) continue;
      const s = mon.spec; const w = this.weather();
      if (mon.item === 'Leftovers') this.heal(mon, mon.maxhp / 16, `${mon.label} restored a little HP using its Leftovers!`);
      if (mon.item === 'Black Sludge') {
        if (mon.types.includes('Poison')) this.heal(mon, mon.maxhp / 16, `${mon.label} restored a little HP using its Black Sludge!`);
        else this.damage(mon, mon.maxhp / 8, `${mon.label} was hurt by its Black Sludge!`);
      }
      if (mon.fainted) continue;
      if (s.iceBody && w === 'snow') this.heal(mon, mon.maxhp / 16, `${mon.label}'s ${mon.ability} restored HP!`);
      if (s.rainDish && w === 'rain') this.heal(mon, mon.maxhp / 16, `${mon.label}'s ${mon.ability} restored HP!`);
      if (s.natRegen && mon.hpFrac() > 0.5) this.heal(mon, mon.maxhp / 16, `${mon.label} regenerated a little HP!`);
      if (s.solarPower && w === 'sun') this.damage(mon, mon.maxhp / 8, `${mon.label} was hurt by the harsh sunlight!`);
      if (mon.fainted) continue;
      if (mon.v.ingrain) this.heal(mon, mon.maxhp / 16, `${mon.label} absorbed nutrients with its roots!`);
      if (mon.v.leechSeed) {
        const foe = this.foeOf(mon);
        const d = this.damage(mon, mon.maxhp / 8, `${mon.label}'s health is sapped by Leech Seed!`);
        if (foe && !foe.fainted && d) this.heal(foe, d);
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
      // counters
      for (const k of ['taunt']) if (mon.v[k]) { mon.v[k]--; if (mon.v[k] <= 0) { delete mon.v[k]; this.add('effect', `${mon.label} shook off the taunt!`); } }
      for (const k of ['encore', 'disable']) if (mon.v[k]) { mon.v[k].turns--; if (mon.v[k].turns <= 0) { delete mon.v[k]; this.add('effect', `${mon.label}'s ${k} ended.`); } }
      // ability residuals
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
      if (s.harvest && !mon.item && mon.consumedItem && BERRIES.has(mon.consumedItem) && (this.weather() === 'sun' || this.chance(50))) {
        mon.item = mon.consumedItem; mon.berryUses = 0; this.add('ability', `${mon.label} harvested a ${mon.item}!`);
      }
      if (s.pickup && !mon.item) {
        const foe = this.foeOf(mon);
        if (foe && foe.consumedItem && foe.v.consumedThisTurn) { mon.item = foe.consumedItem; this.add('ability', `${mon.label} picked up a ${mon.item}!`); }
        else if (mon.consumedItem && this.chance(30)) { mon.item = mon.consumedItem; mon.berryUses = 0; this.add('ability', `${mon.label} found a ${mon.item}!`); }
      }
      mon.checkedLum = false;
    }
    // side conditions
    for (const s of this.sides) {
      for (const k of ['reflect', 'lightscreen', 'tailwind']) {
        if (s.conditions[k]) { s.conditions[k]--; if (s.conditions[k] <= 0) { delete s.conditions[k]; this.add('field', `${s.name}'s ${{ reflect: 'Reflect', lightscreen: 'Light Screen', tailwind: 'tailwind' }[k]} wore off.`); } }
      }
    }
    if (this.field.trickroom) { this.field.trickroom--; if (!this.field.trickroom) this.add('field', 'The twisted dimensions returned to normal!'); }
    if (this.field.gravity) { this.field.gravity--; if (!this.field.gravity) this.add('field', 'Gravity returned to normal!'); }
    // clear per-turn volatiles
    for (const s of this.sides) for (const m of s.team) {
      delete m.v.flinch; delete m.v.protect; delete m.v.magiccoat; delete m.v.tookDamage; delete m.v.lastHit; delete m.v.focusing; delete m.v.plannedMove;
      if (!m.v.protectedThisTurn) m.protectCount = 0;
      delete m.v.protectedThisTurn;
      if (this.isActive(m)) m.turnsActive++;
      if (m.v.rollout && m.lastMove !== 'Rollout') m.v.rollout = 0;
    }
  }

  // ---------------- views ----------------
  monInfo(m, own, i) {
    const base = {
      index: i, id: (own ? m.species : m.displaySpecies).id, name: (own ? m.species : m.displaySpecies).name,
      types: own ? m.types : (m.v.illusion ? m.displaySpecies.types : m.types),
      hpPct: Math.ceil(m.hp / m.maxhp * 100), status: m.status, fainted: m.fainted, active: this.active(m.side) === m,
    };
    if (own) Object.assign(base, {
      hp: m.hp, maxhp: m.maxhp, ability: m.ability, item: m.item, stats: m.stats,
      moves: m.moves.map(x => ({ name: x.name, pp: x.pp, maxpp: x.maxpp, type: MOVES[x.name].type })),
    });
    return base;
  }
  publicState(perspective) {
    return {
      id: this.id, turn: this.turn, phase: this.phase, ended: this.ended, winner: this.winner,
      field: { weather: this.field.weather, trickroom: this.field.trickroom, gravity: this.field.gravity },
      sides: this.sides.map(s => {
        const own = s.n === perspective;
        const a = this.active(s);
        return {
          name: s.name, n: s.n,
          conditions: Object.fromEntries(Object.entries(s.conditions).map(([k, v]) => [k, typeof v === 'object' ? true : v])),
          active: a ? Object.assign(this.monInfo(a, own, s.activeIdx), {
            boosts: Object.fromEntries(Object.entries(a.boosts).filter(([, v]) => v)),
            volatiles: Object.keys(a.v).filter(k => ['substitute', 'confusion', 'leechSeed', 'taunt', 'encore', 'trapped', 'ingrain', 'charging', 'attract'].includes(k)),
          }) : null,
          team: s.team.map((m, i) => {
            const info = this.monInfo(m, own, i);
            if (!own && a && a.v.illusion) info.active = m.species === a.displaySpecies;
            return info;
          }),
        };
      }),
    };
  }

  // rough damage estimate for AI (no randomness, no side effects)
  estimate(mon, target, moveName) {
    const md = MOVES[moveName];
    if (!md || md.cat === 'Status' || !target) return 0;
    const eff = this.typeEff(mon, target, md);
    if (eff === 0) return 0;
    if (md.type === 'Ground' && !this.isGrounded(target, mon) && md.special !== 'thousandarrows') return 0;
    const ts = target.spec;
    if (ts.absorb && ts.absorb.type === md.type) return 0;
    if (ts.immuneFlag && md[ts.immuneFlag]) return 0;
    let p = md.power;
    if (md.special === 'gyroball') p = Math.min(150, Math.floor(25 * this.getSpeed(target) / Math.max(1, this.getSpeed(mon))) + 1);
    if (md.special === 'counter' || md.special === 'mirrorcoat') return 0;
    if (md.special === 'level') return LEVEL;
    if (md.special === 'fakeout' && mon.turnsActive > 0) return 0;
    if (md.special === 'explosion') return 0;
    const saved = JSON.stringify([target.switchFlags, target.once]);
    const { dmg } = this.calcDamage(mon, target, md, p * (md.multihit ? (Array.isArray(md.multihit) ? 3 : md.multihit) : 1), eff, true);
    const [sf, on] = JSON.parse(saved); target.switchFlags = sf; target.once = on;
    let acc = md.acc === true ? 1 : md.acc / 100;
    return dmg * acc * (md.charge && !(md.sunSkip && this.weather() === 'sun') ? 0.5 : 1);
  }
}

const STRUGGLE = { name: 'Struggle', type: 'Normal', cat: 'Physical', power: 50, acc: true, pp: 1, prio: 0, contact: true };

// Future Sight: schedule instead of hitting now
const _runAttack = Battle.prototype.runAttack;
Battle.prototype.runAttack = function (mon, foe, md, moveName) {
  if (md.special === 'futuresight') {
    const sideN = 1 - mon.side.n;
    if (this.futures.some(f => f.side === sideN)) { this.add('effect', 'But it failed!'); return; }
    this.futures.push({ side: sideN, turns: 3, user: mon });
    this.add('effect', `${mon.label} foresaw an attack!`);
    return;
  }
  return _runAttack.call(this, mon, foe, md, moveName);
};

module.exports = { Battle, FIGHTERS, FIGHTER_BY_ID, MOVES };

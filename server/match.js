// A match runs every phase of a game between two players (or a player and the CPU):
//   Standard:  draft (pick 6 of 20) -> build (moves + items) -> preview (both 6 revealed, pick lineup) -> battle
//   Elite:     preview (pre-built teams revealed, pick lineup) -> battle
// Singles bring 3 of 6, doubles bring 4 of 6.
const { Battle } = require('./engine/battle.js');
const { rollPool } = require('./engine/roster.js');
const { validateStandardBuild } = require('./engine/validate.js');
const AI = require('./engine/ai.js');
const FIGHTERS = require('../shared/fighters.json');
const BY_ID = Object.fromEntries(FIGHTERS.map(f => [f.id, f]));

const BRING = { singles: 3, doubles: 4 };

class Match {
  constructor({ id, mode, format, players, onUpdate }) {
    this.id = id; this.mode = mode === 'elite' ? 'elite' : 'standard';
    this.format = format === 'doubles' ? 'doubles' : 'singles';
    this.bring = BRING[this.format];
    this.onUpdate = onUpdate || (() => {});
    this.players = players.map(p => ({ id: p.id, name: p.name, cpu: !!p.cpu, team: p.team || null, pool: null, picks: null, lineup: null, ready: false }));
    this.battle = null; this.result = null; this.created = Date.now(); this.log = [];
    if (this.mode === 'standard') {
      this.phase = 'draft';
      for (const p of this.players) p.pool = rollPool(20);
    } else this.phase = 'preview';
    this.cpuAct();
  }

  get ended() { return this.phase === 'ended'; }

  act(n, a) {
    const p = this.players[n];
    if (!p) return 'Not a player.';
    if (a.type === 'forfeit') return this.forfeit(n);
    if (this.phase === 'battle') {
      if (a.type === 'undo') { this.battle.undo(n); return null; }
      if (a.type !== 'choose') return 'Unknown action.';
      return this.battle.choose(n, a.choice);
    }
    if (p.ready) return 'Waiting for your opponent.';
    if (this.phase === 'draft' && a.type === 'draft') {
      const picks = [...new Set((a.picks || []).map(Number))].filter(i => p.pool[i]);
      if (picks.length !== 6) return 'Pick exactly 6 fighters.';
      p.picks = picks; p.ready = true;
    } else if (this.phase === 'build' && a.type === 'build') {
      const bases = p.picks.map(i => p.pool[i]);
      const v = validateStandardBuild(bases, a.builds);
      if (!v.ok) return v.errors.join('\n');
      p.team = v.team; p.ready = true;
    } else if (this.phase === 'preview' && a.type === 'lineup') {
      const order = (a.order || []).map(Number);
      if (order.length !== this.bring || new Set(order).size !== order.length || order.some(i => !p.team[i])) return `Choose ${this.bring} fighters in order.`;
      p.lineup = order; p.ready = true;
    } else return 'That action is not available right now.';
    this.advance();
    return null;
  }

  advance() {
    if (!this.players.every(p => p.ready)) { this.emit(); return; }
    for (const p of this.players) p.ready = false;
    if (this.phase === 'draft') this.phase = 'build';
    else if (this.phase === 'build') this.phase = 'preview';
    else if (this.phase === 'preview') { this.startBattle(); return; }
    this.cpuAct();
    this.emit();
  }

  startBattle() {
    this.phase = 'battle';
    this.battle = new Battle({
      id: this.id, format: this.format,
      players: this.players.map(p => ({ name: p.name, team: p.lineup.map(i => p.team[i]) })),
      onUpdate: () => { if (this.battle && this.battle.ended && this.phase !== 'ended') { this.phase = 'ended'; this.result = this.battle.winner; } this.cpuAct(); this.emit(); },
    });
    this.cpuAct();
    this.emit();
  }

  forfeit(n) {
    if (this.ended) return null;
    if (this.battle) this.battle.forfeit(n);
    else { this.phase = 'ended'; this.result = 1 - n; this.log.push({ cls: 'info', text: `${this.players[n].name} forfeited.` }); this.emit(); }
    return null;
  }

  // CPU decisions (delayed slightly so the human sees things happen)
  cpuAct() {
    this.players.forEach((p, n) => {
      if (!p.cpu || this.ended || p.pending) return;
      const doubles = this.format === 'doubles';
      let fn = null;
      if (this.phase === 'draft' && !p.ready) fn = () => this.act(n, { type: 'draft', picks: AI.draftSix(p.pool) });
      else if (this.phase === 'build' && !p.ready) fn = () => this.act(n, { type: 'build', builds: AI.buildTeam(p.picks.map(i => p.pool[i]), doubles) });
      else if (this.phase === 'preview' && !p.ready) fn = () => this.act(n, { type: 'lineup', order: AI.chooseLineup(p.team, this.players[1 - n].team, this.bring) });
      else if (this.phase === 'battle' && this.battle && !this.battle.ended) {
        const req = this.battle.getRequest(n);
        if (req.kind === 'move' || req.kind === 'switch') fn = () => { const c = AI.chooseAction(this.battle, n); if (c) this.battle.choose(n, c); };
      }
      if (!fn) return;
      p.pending = true;
      setTimeout(() => { p.pending = false; if (!this.ended) fn(); }, this.cpuDelay ?? 400);
    });
  }

  emit() { this.onUpdate(this); }

  // what player n (or a spectator, n = null) gets to see
  view(n) {
    const me = n === null ? null : this.players[n];
    const foe = n === null ? null : this.players[1 - n];
    const out = {
      id: this.id, mode: this.mode, format: this.format, bring: this.bring, phase: this.phase, you: n,
      players: this.players.map(p => ({ name: p.name, cpu: p.cpu, ready: p.ready })), result: this.result,
    };
    if (me) {
      if (this.phase === 'draft') out.pool = me.pool;
      if (this.phase === 'build') out.picks = me.picks.map(i => me.pool[i]);
      if (this.phase === 'preview' || this.phase === 'battle' || this.phase === 'ended') {
        if (me.team) out.myTeam = me.team;
        if (foe.team) out.foeTeam = foe.team.map(s => ({ species: s.species, name: BY_ID[s.species].name, types: BY_ID[s.species].types }));
        out.lineup = me.lineup;
      }
    }
    if (this.battle) {
      const persp = n === null ? 0 : n;
      out.battle = { state: this.battle.publicState(persp), log: this.battle.log, request: n === null ? null : this.battle.getRequest(n) };
    } else out.log = this.log;
    return out;
  }
}

module.exports = { Match, BRING };

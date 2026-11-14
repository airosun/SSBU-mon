// Runs many CPU vs CPU battles to catch engine crashes and infinite loops.
// Usage: node test/simulate.js [battles]
const { Battle } = require('../server/engine/battle.js');
const { chooseAction, randomTeam } = require('../server/engine/ai.js');
const { validateTeam } = require('../server/engine/validate.js');

const N = +process.argv[2] || 500;
let turns = 0, wins = [0, 0, 0], maxTurns = 0;
for (let n = 0; n < N; n++) {
  const teams = [randomTeam(), randomTeam()].map(t => { const v = validateTeam(t); if (!v.ok) throw new Error(v.errors.join('; ')); return v.team; });
  const b = new Battle({ players: [{ name: 'P1', team: teams[0] }, { name: 'P2', team: teams[1] }] });
  let steps = 0;
  try {
    while (!b.ended) {
      if (++steps > 3000) throw new Error('stuck: too many steps');
      if (b.turn > 400) { b.forfeit(0); break; }
      let acted = false;
      for (const s of [0, 1]) {
        const req = b.getRequest(s);
        if (['preview', 'move', 'switch'].includes(req.kind)) {
          const c = chooseAction(b, s);
          const err = b.choose(s, c);
          if (err) throw new Error(`choice rejected (${req.kind}): ${err} ${JSON.stringify(c)}`);
          acted = true;
          break;
        }
      }
      if (!acted && !b.ended) throw new Error('deadlock: nobody can act, phase=' + b.phase);
    }
  } catch (e) {
    console.error(`Battle ${n} failed at turn ${b.turn}:`, e.stack);
    console.error(b.log.slice(-25).map(l => l.text).join('\n'));
    process.exit(1);
  }
  turns += b.turn; maxTurns = Math.max(maxTurns, b.turn);
  wins[b.winner === null ? 2 : b.winner]++;
}
console.log(`${N} battles OK. avg turns ${(turns / N).toFixed(1)}, max ${maxTurns}, wins P1/P2/tie ${wins.join('/')}`);

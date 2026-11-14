# SSBU-mon

A Pokémon Showdown-style battle site where every Super Smash Bros. Ultimate fighter is a "mon" with types, base stats, a move pool of real Pokémon moves, and lore-based abilities.

## What's in it

- **100 fighters.** Multi-character fighters are split into separate entries: each Hero, Bowser Jr. and each Koopaling, Olimar/Alph, Squirtle/Ivysaur/Charizard, Pyra/Mythra, and Steve/Alex/Zombie/Enderman. Echo fighters get their own entries. Mii Fighters are not included.
- **Move pools.** Each fighter has its 4 Smash-based signature moves (marked ★ in the teambuilder, with the Smash attack they represent) plus extra moves, about 15 per fighter.
- **Teambuilder.** Up to 6 fighters per team, with ability (regular or hidden), item, nature, EVs and 4 moves. Teams are saved in your browser and can be imported or exported in a Showdown-like text format.
- **Battles.** Singles, 6v6, level 100, with team preview. You can challenge an online player, find a random opponent, battle the CPU, or watch live battles. There's lobby chat and battle chat.
- **Engine.** Gen 9-style damage formula, STAB, crits, the type chart, weather (rain, sun, snow), screens, hazards, status conditions, stat stages, priority, Trick Room, Gravity, Substitute, Protect, pivot moves (U-turn, Volt Switch, Teleport, Parting Shot), two-turn moves, and Future Sight/Wish. **Every fighter's ability is implemented.**

## Run it locally

```bash
npm install
npm start          # http://localhost:3000
npm test           # mechanics tests + 300 simulated CPU-vs-CPU battles
```

## Deploy on Render

Create a new **Web Service** from this repo (or use `render.yaml`):

- Build command: `npm install`
- Start command: `npm start`

## Project layout

| Path | What it is |
| --- | --- |
| `shared/fighters.json` | Generated fighter data: types, stats, abilities, signature moves, move pools |
| `shared/moves.js` | Move database (type, power, accuracy, PP, effects) |
| `shared/dex.js` | Type chart, natures, items, stat formula (used by server and browser) |
| `tools/build_fighters.py` | Builds `fighters.json` from the roster plus the `EXTRA` move pools; checks every move exists |
| `server/engine/battle.js` | Battle engine |
| `server/engine/abilities.js` | Maps each lore ability to the mechanic it uses |
| `server/engine/ai.js` | CPU opponent and random teams |
| `server/engine/validate.js` | Team legality checks |
| `server/index.js` | Express + Socket.IO server (lobby, challenges, matchmaking, spectating) |
| `public/` | Browser client |

## Editing fighters

1. Change stats, abilities or signature moves in `tools/roster_base.py`. Change final types in the `TYPES` table and extra move pools in the `EXTRA` table in `tools/build_fighters.py`.
2. Add any new move to `shared/moves.js`.
3. Run `npm run build:fighters`, then `npm test`.

A new ability also needs an entry in `server/engine/abilities.js`. Most abilities reuse an existing mechanic key (for example `{ levitate: true }` or `{ threshold: { below: 0.5, heal: 0.25 } }`).

## Notes and simplifications

- Weight isn't modelled. Heavy Slam is a flat 100 BP and Gigaton Hammer a flat 160, and the *Heavyweight* ability boosts those moves instead of doubling weight.
- Steel Roller is a flat 130 BP move, because there are no terrains.
- Friend Guard (Jigglypuff) uses a singles-friendly version: 25% less damage taken at full HP.
- Fighters are shown as type-colored initial badges rather than character art.

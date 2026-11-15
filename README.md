# SSBU-mon

A Pokémon VGC-style battle site where every Super Smash Bros. Ultimate fighter is a "mon" with types, base stats, a move pool of real Pokémon moves, and lore-based abilities.

## How it plays

**Formats (VGC rules, level 50):**
- **Singles:** bring 6, pick 3.
- **Doubles:** bring 6, pick 4. Two fighters are out per side, you choose targets, and spread moves (Earthquake, Rock Slide, Hyper Voice…) hit several fighters for 75% damage.
- **Clauses:** one of each fighter per team, and one of each item per team (item clause). Any fighter can hold any item. Eviolite (1.5× Defense and Sp. Def) only works on fighters that can still evolve: Pichu, Pikachu, Squirtle and Ivysaur.

**Final Smashes (Megas):** a fighter holding its Final Smash stone can use its Final Smash once per battle. Turn on the **Final Smash** toggle above the moves, and the fighter transforms before anyone moves that turn. It keeps its HP but gets new stats, types and ability. Only one fighter per team can use its Final Smash in a battle. You can bring several stone holders, but once one transforms the rest can't. Stones can't be knocked off, stolen, traded or flung.

| Fighter | Stone | Final Smash form | Types |
|---|---|---|---|
| Bowser | Bowserite | Giga Bowser | Fire/Dragon |
| Ganondorf | Ganonite | Beast Ganon | Dark/Fighting |
| Sonic | Chaos Emerald | Super Sonic | Electric/Fighting |
| Greninja | Greninjite | Mega Greninja | Water/Dark |
| Charizard | Charizardite X / Y | Mega Charizard X / Y | Fire/Dragon · Fire/Flying |
| Lucario | Lucarionite / Lucarionite Z | Mega Lucario / Mega Lucario Z | Fighting/Steel |
| Mewtwo | Mewtwonite X / Y | Mega Mewtwo X / Y | Psychic/Fighting · Psychic |
| Piranha Plant | Plantite | Petey Piranha | Grass/Poison |
| Sephiroth | Sephirite | Safer Sephiroth | Dark/Flying |
| Kazuya | Devil Gene | Devil Kazuya | Fighting/Dark |
| Corrin | Corrinite | Corrin (Dragon Form) | Dragon/Water |
| Bayonetta | Bayonettite | Gomorrah | Dark/Dragon |

Real Mega Pokémon use their official Mega stats. The other forms keep the base fighter's HP and add 100 to its base stat total. All forms are defined in `shared/megas.js`, and each form's image is `public/images/<form id>.png`.

**Standard Battle**
1. Each player gets 20 random fighters with random natures, random IVs (0–31) and either their standard or hidden ability. Pick 6.
2. Choose moves (up to 4 from each fighter's move pool) and an item for each of your 6.
3. Both teams of 6 are revealed.
4. Each player secretly picks their lineup in order (3 for singles, 4 for doubles). The first one (singles) or two (doubles) lead.
5. Battle.

**Elite Smash Battle**
1. Bring a pre-built team of 6 from your roster (built in the **Elite Teams** tab).
2. Both teams of 6 are revealed.
3. Pick your lineup in secret, then battle.

**Fighter Pass:** 3 rolls per day (the day resets at midnight US Eastern). Each roll shows 20 random fighters, randomized the same way as Standard, and you keep up to 5 for your roster.

**Saving:** there are no accounts yet. Your roster, Elite teams and name are saved in your browser, so the same browser picks up where it left off. Each roster fighter carries a server signature, so its nature, IVs and ability can't be edited in the browser before an Elite battle.

**Battle screen:** animated turn playback (attacks, hits, faints, switches, stat changes) with a speed setting (normal, fast or off). Hover a move to see what it does. Tap a fighter's image to target it, and every fighter a move will hit flashes before you confirm. A **Type chart** button highlights the opposing fighters' types.

You can battle the CPU, find a random opponent (queues are separate for each mode and format), challenge an online player, or watch live matches. There's lobby chat and battle chat.

## Run it locally

```bash
npm install
npm start          # http://localhost:3000
npm test           # mechanics tests + 200 simulated singles and doubles matches
```

## Deploy on Render

Use `render.yaml` (Blueprint), or create a Web Service by hand:

- Build command: `npm install`
- Start command: `npm start`
- Environment variable: set **`SSBU_SECRET`** to a long random value. It signs roster fighters. If it changes, rosters saved in browsers stop being valid. `render.yaml` generates one for you.

**Limitation until accounts exist:** Fighter Pass roll counts are kept in server memory, with a best-effort file copy. Render's free tier restarts the server after it's been idle, which resets that day's counts. Adding accounts and a database will fix this.

## Project layout

| Path | What it is |
| --- | --- |
| `shared/fighters.json` | Generated fighter data: types, stats, abilities, signature moves, move pools |
| `shared/moves.js` | Move database (type, power, accuracy, PP, effects, doubles targeting) |
| `shared/dex.js` | Type chart, natures, items, stat formula (used by server and browser) |
| `tools/build_fighters.py` | Builds `fighters.json` from the roster plus the `EXTRA` move pools |
| `server/engine/battle.js` | Battle engine (singles and doubles) |
| `server/engine/abilities.js` | Maps each lore ability to the mechanic it uses |
| `server/engine/roster.js` | Random fighter generation and roster signing |
| `server/engine/validate.js` | Team legality (moves, items, clauses, signatures) |
| `server/engine/ai.js` | CPU: drafting, sets, lineups, battling |
| `server/match.js` | Match flow: draft → build → preview/lineup → battle |
| `server/pass.js` | Fighter Pass daily rolls |
| `server/index.js` | Express + Socket.IO server (lobby, queues, challenges, spectating) |
| `public/` | Browser client |

## Editing fighters

1. Change stats, abilities or signature moves in `tools/roster_base.py`. Change types in the `TYPES` table and move pools in the `EXTRA` table in `tools/build_fighters.py`.
2. Add any new move to `shared/moves.js`. If it hits more than one fighter in doubles, add it to `SPREAD_FOES` or `SPREAD_ALL`.
3. Run `npm run build:fighters`, then `npm test`.

## Notes and simplifications

- There are no EVs: fighters are defined by nature, IVs, ability, moves and item.
- Weight isn't modelled: Heavy Slam is a flat 100 BP and Gigaton Hammer a flat 160. *Heavyweight* boosts those moves instead.
- Redirection (Follow Me, Lightning Rod pulling attacks to itself) isn't implemented. Lightning Rod still absorbs Electric moves aimed at its user.
- Fighter images live in `public/images` (`<fighter name lowercased>.png`; exceptions are mapped in `IMAGE_OVERRIDE` in `tools/build_fighters.py`). Your own fighters are shown mirrored, like a back sprite. A fighter without an image (currently Sora) falls back to a type-colored badge.

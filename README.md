# SSBU-mon

A Pokémon VGC-style battle site where every Super Smash Bros. Ultimate fighter is a "mon" with types, base stats, a move pool of real Pokémon moves, and lore-based abilities.

## How it plays

**Formats (VGC rules, level 50):**
- **Singles:** bring 6, pick 3.
- **Doubles:** bring 6, pick 4. Two fighters are out per side, you choose targets, and spread moves (Earthquake, Rock Slide, Hyper Voice…) hit several fighters for 75% damage.
- **Clauses:** one of each fighter per team, and one of each item per team (item clause). Any fighter can hold any item. Eviolite (1.5× Defense and Sp. Def) only works on fighters that can still evolve: Pichu, Pikachu, Squirtle, Ivysaur and Jigglypuff.

**Genders:** each fighter is male, female, genderless, "both" (two people, one of each, like the Ice Climbers) or either. Fighters that can be either get a random gender in Standard Battle, using the male/female ratio from the gender sheet. In Elite Smash you choose it in the team editor. Some fighters (and Robin's and Byleth's Final Smash forms) have an alternate sprite for the other gender. Gender matters for infatuation (Cute Charm-style abilities): only opposite genders can be infatuated, and genderless and "both" fighters never are. Genders are shown with ♂/♀ in battle and team preview, and exported as `(M)`/`(F)`. The data lives in `shared/genders.js`.

**Final Smashes (Megas):** a fighter holding its Final Smash stone can use its Final Smash once per battle. Turn on the **Final Smash** toggle above the moves, and the fighter transforms before anyone moves that turn. It keeps its HP but gets new stats, types and ability. Only one fighter per team can use its Final Smash in a battle. You can bring several stone holders, but once one transforms the rest can't. Stones can't be knocked off, stolen, traded or flung.

| Fighter | Stone | Final Smash form | Types |
|---|---|---|---|
| Bowser | Giga Mushroom | Giga Bowser | Fire/Dragon |
| Ganondorf | Triforce of Power | Beast Ganon | Dark/Fighting |
| Sonic | Chaos Emerald | Super Sonic | Electric/Fighting |
| Greninja | Greninjite | Mega Greninja | Water/Dark |
| Charizard | Charizardite X / Charizardite Y | Mega Charizard X / Mega Charizard Y | Fire/Dragon · Fire/Flying |
| Lucario | Lucarionite / Lucarionite Z | Mega Lucario / Mega Lucario Z | Fighting/Steel · Fighting/Steel |
| Mewtwo | Mewtwonite X / Mewtwonite Y | Mega Mewtwo X / Mega Mewtwo Y | Psychic/Fighting · Psychic |
| Piranha Plant | Super Fertilizer | Petey Piranha | Grass/Poison |
| Sephiroth | Black Materia | Safer Sephiroth | Dark/Flying |
| Kazuya | Devil Gene | Devil Kazuya | Fighting/Dark |
| Corrin | Dragonstone | Corrin (Dragon Form) | Dragon/Water |
| Bayonetta | Infernal Contract | Gomorrah | Dark/Dragon |
| Mario | Mega Mushroom | Mega Mario | Normal/Ground |
| Donkey Kong | Banandium Gem | Kong Bananza | Fighting/Ground |
| Young Link | Fierce Deity's Mask | Fierce Deity Link | Fighting/Psychic |
| Zelda | Secret Stone | Light Dragon | Dragon/Fairy |
| King Dedede | Dedede Mask | Masked Dedede | Normal/Steel |
| Kirby | Miracle Fruit | Hypernova Kirby | Normal/Psychic |
| Pit | Three Sacred Treasures | Sacred Treasures Pit | Flying/Steel |
| Samus | Metroid DNA | Metroid Samus | Electric/Dark |
| Ridley | Phazon Core | Meta Ridley | Dragon/Steel |
| Wario | Garlic | Wario-Man | Poison/Fighting |
| Little Mac | Giga Charge | Giga Mac | Fighting/Dark |
| Ryu | Satsui no Hado | Evil Ryu | Fighting/Dark |
| Ken | Psycho Power | Violent Ken | Fighting/Psychic |
| Joker | Satanael's Mask | Satanael | Dark/Psychic |
| Robin | Fell Dragon's Blood | Grima | Dark/Dragon |
| Pyra / Mythra | Aegis Core Crystal | Pneuma | Fire/Fairy |
| Sora | Drive Orb | Sora - Ultimate Form | Fairy/Flying |
| Byleth | Crest of Flames | Enlightened One | Dragon/Fairy |
| Mega Man | Rush Adapter | Super Mega Man | Steel/Flying |
| Steve | Netherite Ingot | Netherite Steve | Steel/Ground |

Real Mega Pokémon use their official Mega stats. The other forms keep the base fighter's HP and add 100 to its base stat total. Pyra and Mythra share the Aegis Core Crystal and both become the same Pneuma, so they have the same HP and base stat total (550). No fighter ability shares a name with a Final Smash or its stone. Fighters saved before an ability was renamed keep working and show the new name. All forms are defined in `shared/megas.js`, and each form's image is `public/images/<form id>.png`.

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

**Accounts:** sign in with a username and password (the **Sign in** button, top right) to save your roster, Elite teams and daily Fighter Pass rolls to your account, so they follow you to any device. You can still play as a guest: a guest's roster and teams are saved in that browser. When you sign in or create an account, that browser's roster, teams and today's Fighter Pass rolls move into the account. Rolls already used that day still count, so switching accounts doesn't give extra rolls. Edits from another tab or device are picked up automatically. Each roster fighter carries a server signature, so its nature, IVs and ability can't be edited before an Elite battle. Accounts have no email, so a forgotten password can't be reset from the site.

**Battle screen:** animated turn playback (attacks, hits, faints, switches, stat changes) with a speed setting (normal, fast or off). Hover a move to see what it does. Tap a fighter's image to target it, and every fighter a move will hit flashes before you confirm. A **Type chart** button highlights the opposing fighters' types.

**Battle clock (player vs player):** each decision has a 45-second turn limit. When it runs out, a move is picked for you. That time comes out of a 7-minute **Your Time** bank, and running the bank out loses the battle. The whole battle has a 20-minute game clock. When it ends, the side with more fighters left wins (then more HP left). Before the battle, drafting, building and picking your lineup each have a time limit (90s / 4 min / 90s), with automatic picks when time runs out. Battles against the CPU are not timed.

**Scouting:** in team preview and in battle, hover (or tap) an opposing fighter to see its base stats, its level 50 Speed range, its possible abilities and its Final Smash. In battle you also see the moves it has used and any ability or item it has revealed.

**After a battle:** **Rematch** (vs the CPU it starts right away; vs a player both have to accept, with the same Elite teams), a **replay link**, and quick-chat buttons (GG, Good luck!, …).

**Replays:** every finished battle is saved, and `/replay/<id>` plays it back with the animations. The newest 5,000 battles keep their replays.

**Stats tab:** your win/loss record by mode and opponent, your most-used fighters, your recent battles with replays, site-wide **fighter usage** (how often each fighter is brought and its win rate, by format, over the last 7/30/90 days), and recent player battles.

**Battler Cards:** signed-in players get a card with a fighter avatar (any fighter or Final Smash form, including the alternate-gender sprites), a title, a short bio, a showcase Elite team, their record and their favorite fighters. Edit yours from the account menu (click your name at the top) or the Stats tab. Titles, bios and showcase team names can't contain curse words or slurs. Disguised spellings are caught too (see `server/moderation.js`). Tap a signed-in player's name in the Online list to see theirs. Their avatar also shows next to their name.

**Calc tab:** a damage calculator that uses the battle engine. Set the attacker and defender (fighter, ability, nature, IVs, item, Final Smash, boosts, status, HP) and the field (weather, screens, crit, doubles spread), and it shows the damage range and how many hits it takes to KO. You can load a fighter straight from your roster.

**Import / export:** in Elite Teams, **Export** gives a Showdown-style text version of a team. **Import** takes one and matches each fighter to the closest one in your roster (nature, ability, IVs). It skips moves the fighter can't learn and items it can't hold, and tells you what it changed.

You can battle the CPU, find a random opponent (queues are separate for each mode and format), challenge an online player, or watch live matches. The home page shows the **most used fighters** today and all time. Each battle has its own chat.

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
- Environment variables:
  - **`SSBU_SECRET`**: a long random value. It signs roster fighters. If it changes, every saved roster fighter stops being valid. `render.yaml` generates one for you.
  - **`DATABASE_URL`**: a Postgres connection string. Accounts, saved teams and Fighter Pass rolls are stored there. Without it the server keeps them in memory, and Render's free tier loses them on every restart.

### Setting up the database (Neon, free)

1. Sign up at [neon.com](https://neon.com) (free plan, no card) and create a project. Any region close to your Render region works.
2. On the project dashboard, click **Connect** and copy the connection string. It looks like `postgresql://user:password@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`.
3. In Render, open the ssbu-mon service → **Environment** → add `DATABASE_URL` with that value, then save. Render redeploys.
4. The server creates its tables on startup. The log line `SSBU-mon running … (storage: postgres)` means it's connected.

Locally, run with `DATABASE_URL=postgres://… npm start`, or with no `DATABASE_URL` to use in-memory storage (saved to `data/db.json`).

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
| `server/auth.js` | Accounts: sign up, sign in, sessions, password changes |
| `server/db.js` | Storage: Postgres when `DATABASE_URL` is set, otherwise memory |
| `server/userdata.js` | Saved rosters and Elite teams (signature checks, guest import) |
| `server/stats.js` | Win/loss records, most-used fighters, usage stats |
| `server/calc.js` | Damage calculator (runs the battle engine) |
| `server/profile.js` | Battler Cards |
| `server/moderation.js` | Curse word and slur filter |
| `public/anim.js` | Move animations |
| `public/extras.js` | Stats, replays, calculator, team import/export, opponent info |
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

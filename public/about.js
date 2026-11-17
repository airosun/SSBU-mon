/* "What is SSBU-mon?" tab: a guide to the site, each tab, and how battles work.
   Counts (fighters, moves, items, Final Smashes) come from the live game data. */
(() => {
  const U = window.SSBU;
  const { $, $$, esc, S, sprite, typeChip } = U;

  const goto = (tab, text) => `<a href="#" class="goto" data-goto-tab="${tab}">${text} →</a>`;
  const SECTIONS = [
    ['overview', 'What is SSBU-mon?'],
    ['start', 'Getting started'],
    ['modes', 'Battle modes'],
    ['battle', 'How battles work'],
    ['finalsmash', 'Final Smashes'],
    ['fighters', 'Fighters: stats, natures, IVs, genders'],
    ['tabs', 'The tabs'],
    ['accounts', 'Accounts & Battler Cards'],
    ['pvp', 'Playing other people'],
    ['rooms', 'Private rooms'],
    ['tips', 'Tips'],
  ];

  function render() {
    const d = S.dex;
    const nFighters = d.fighters.length;
    const nMoves = Object.keys(d.moves).length;
    const fs = Object.values(d.finalSmashes || {});
    const nFsFighters = new Set(fs.flatMap(x => x.bases)).size;
    const nItems = Object.keys(d.items).filter(i => !(d.finalSmashes || {})[i]).length;
    const showcase = ['mario', 'pikachu', 'link', 'kirby', 'sonic', 'joker', 'sephiroth', 'sora'].filter(id => S.byId[id]);
    const fsExamples = fs.filter(x => ['giga-bowser', 'mega-charizard-x', 'super-sonic', 'devil-kazuya', 'pneuma', 'grima'].includes(x.id));
    const types = Object.keys(d.chart || {}).length ? Object.keys(d.chart) : ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];

    $('#view').innerHTML = `<div class="about">
      <nav class="about-nav card"><div class="muted small" style="text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">On this page</div>${SECTIONS.map(([id, t]) => `<a href="#" data-jump="${id}">${esc(t)}</a>`).join('')}</nav>
      <div class="about-body">

      <section class="card about-hero" id="ab-overview">
        <div class="about-sprites">${showcase.map(id => sprite(S.byId[id], 'sm')).join('')}</div>
        <h1>What is SSBU-mon?</h1>
        <p class="lead">SSBU-mon is a Pokémon-style battle game starring the fighters of <b>Super Smash Bros. Ultimate</b>. Every fighter is a "mon" with one or two types, base stats, a move pool of real Pokémon moves based on its Smash moveset, and abilities drawn from its own game's lore.</p>
        <p>Battles follow the <b>Pokémon VGC</b> format used in official tournaments and in Pokémon Champions: everyone is level 50, you bring a team of 6 and secretly pick 3 (Singles) or 4 (Doubles) to battle with. The site works like Pokémon Showdown. You can battle the CPU or other people live, build teams, check damage with a calculator, and watch replays.</p>
        <div class="about-facts"><div><b>${nFighters}</b><span>fighters</span></div><div><b>${nMoves}</b><span>moves</span></div><div><b>18</b><span>types</span></div><div><b>${fs.length}</b><span>Final Smash forms</span></div><div><b>${nItems}</b><span>items</span></div></div>
      </section>

      <section class="card" id="ab-start"><h2>Getting started</h2>
        <ol class="about-steps">
          <li><b>Battle the CPU right away.</b> On ${goto('home', 'Home')}, leave <i>Standard Battle</i> and <i>Singles</i> selected and press <b>Battle the CPU</b>. You'll draft a random team. No setup needed.</li>
          <li><b>Make an account</b> (the <b>Sign in</b> button at the top) so your fighters, teams and daily rolls follow you to any device. Playing as a guest works too. Your stuff is just saved in that browser.</li>
          <li><b>Roll the ${goto('pass', 'Fighter Pass')}</b> every day to collect fighters for your roster.</li>
          <li><b>Build an ${goto('elite', 'Elite team')}</b> from your roster and take it into Elite Smash battles.</li>
          <li><b>Find an opponent</b> on Home, or challenge someone in the Online list.</li>
        </ol>
      </section>

      <section class="card" id="ab-modes"><h2>Battle modes</h2>
        <div class="about-two">
          <div><h3>Standard Battle</h3><p>Everyone starts on equal footing with a random draft:</p>
            <ol><li>You get <b>20 random fighters</b>, each with a random nature, random IVs and either its standard or hidden ability. <b>Pick 6.</b></li>
              <li>Choose up to <b>4 moves</b> and an <b>item</b> for each of your 6.</li>
              <li>Both teams of 6 are <b>revealed</b> to each other (team preview).</li>
              <li>Secretly choose your <b>lineup and order</b>: 3 in Singles, 4 in Doubles. Your first one (or two) lead.</li>
              <li>Battle!</li></ol></div>
          <div><h3>Elite Smash Battle</h3><p>Bring a team you built ahead of time:</p>
            <ol><li>Choose one of your saved <b>Elite teams</b> (6 fighters from your roster with moves, items and genders set).</li>
              <li>Both teams are revealed, you pick your lineup in secret, and you battle.</li></ol>
            <p>Your roster fighters come from the Fighter Pass, so building a great Elite team takes some collecting.</p></div>
        </div>
        <div class="about-two">
          <div><h3>Singles</h3><p>Bring 6, pick 3. One fighter out per side.</p></div>
          <div><h3>Doubles</h3><p>Bring 6, pick 4. Two fighters out per side. You choose who each move targets, and <b>spread moves</b> (Earthquake, Rock Slide, Hyper Voice…) hit several fighters at <b>75% damage</b>.</p></div>
        </div>
        <p class="muted small"><b>Team rules:</b> one of each fighter per team (species clause) and one of each item per team (item clause).</p>
      </section>

      <section class="card" id="ab-battle"><h2>How battles work</h2>
        <p>If you've played Pokémon, you already know how this works. Each turn, both players secretly choose an action for each of their fighters, and then the turn plays out:</p>
        <ul class="about-list">
          <li><b>Moves</b> have a type, category (Physical, Special or Status), power, accuracy and sometimes priority. <b>Hover</b> a move to see exactly what it does.</li>
          <li><b>Targeting:</b> in Doubles, tap a fighter's picture to target it. Every fighter a move will hit <b>flashes</b> before you confirm, including both foes for spread moves.</li>
          <li><b>Switching</b> takes your turn. Some moves (like U-turn and Volt Switch) attack and then switch out.</li>
          <li><b>Type matchups</b> work like Pokémon's 18 types. Super effective hits do 2× (or 4×), resisted hits do ½×, and immunities do nothing. Press <b>Types</b> at the top of any screen to see the full chart and check how a type combo takes damage. In battle, the opponents' types are highlighted (the battle's <b>Type chart</b> button opens the same chart).</li>
          <li><b>Same-type bonus (STAB):</b> a move matching its user's type does 1.5× damage.</li>
          <li><b>Status, weather, terrain and field effects</b> (burn, paralysis, sleep, Sun, Rain, Trick Room, Tailwind, screens…) all work as they do in Pokémon. Hover a field tag to see how many turns are left.</li>
          <li><b>Abilities</b> are custom and lore-based. Hover your own fighter to see its stats, ability and item.</li>
          <li><b>Items:</b> any fighter can hold any item, for example Leftovers, Life Orb, Choice Band, Focus Sash or Assault Vest. <b>Eviolite</b> (1.5× Defense and Sp. Def) only works on fighters that can still evolve: Pichu, Pikachu, Squirtle, Ivysaur and Jigglypuff.</li>
          <li><b>Animations:</b> every move has its own animation, and you'll see popups for <i>Missed!</i>, <i>Crit!</i>, <i>Blocked!</i> and <i>Flinched!</i>. Use the <b>Anim</b> setting (normal, fast or off) or <b>Skip</b> to speed things up.</li>
          <li><b>Scouting:</b> hover an opposing fighter to see its base stats, its level 50 Speed range, its possible abilities and its Final Smash, plus any moves, ability or item it has already shown this battle.</li>
          <li><b>Winning:</b> knock out all of the opponent's fighters. You can also <b>Forfeit</b> at any time.</li>
        </ul>
      </section>

      <section class="card" id="ab-finalsmash"><h2>Final Smashes</h2>
        <p>Final Smashes are SSBU-mon's version of <b>Mega Evolution</b>. ${nFsFighters} fighters have a Final Smash form, unlocked by holding the matching <b>stone</b> item:</p>
        <div class="about-fs">${fsExamples.map(x => `<div class="list-item">${sprite(S.byId[x.id], 'sm')}<div class="grow"><b>${esc(x.name)}</b> <span class="muted small">from ${esc(x.bases.map(b => S.byId[b].name).join(' / '))} · ${esc(x.stone)}</span><div>${x.types.map(typeChip).join(' ')}</div></div></div>`).join('')}</div>
        <ul class="about-list">
          <li>Turn on the <b>Final Smash</b> toggle above your moves. The fighter transforms <b>before anyone moves</b> that turn, then uses the move you picked.</li>
          <li>It keeps its HP but gets <b>new stats, types and ability</b>. Real Mega Pokémon use their official Mega stats.</li>
          <li><b>Only one Final Smash per team per battle.</b> You can bring several stone holders, but once one transforms the others can't.</li>
          <li>Stones can't be knocked off, stolen, swapped or flung.</li>
        </ul>
        <p>See every form and its stats in the ${goto('dex', 'Fighterdex')}.</p>
      </section>

      <section class="card" id="ab-fighters"><h2>Fighters: stats, natures, IVs, genders</h2>
        <ul class="about-list">
          <li><b>Base stats</b> (HP, Attack, Defense, Sp. Atk, Sp. Def, Speed) are based on each fighter's Smash attributes. Fighters that are real Pokémon use their real stats.</li>
          <li><b>Natures</b> raise one stat by 10% and lower another by 10% (some are neutral).</li>
          <li><b>IVs</b> (0–31 per stat) are random and fixed for each fighter you get. Higher is better. There are no EVs.</li>
          <li><b>Abilities:</b> every fighter has a standard ability and a hidden ability, and each fighter you get has one of them at random.</li>
          <li><b>Genders:</b> fighters are male, female, genderless, "both" (two people, like the Ice Climbers) or either. In Standard Battle, a fighter that can be either gets a random gender. In Elite Smash you choose it. Gender affects infatuation (Cute Charm-style abilities), and some fighters have a different sprite for each gender.</li>
        </ul>
      </section>

      <section class="card" id="ab-tabs"><h2>The tabs</h2>
        <div class="about-tabs">
          <div><h3>${goto('home', 'Home')}</h3><p>Pick a mode (Standard or Elite Smash) and format (Singles or Doubles), then <b>Find opponent</b> or <b>Battle the CPU</b>. The <b>Online</b> list shows who's here: challenge them, or tap a signed-in player's name to see their Battler Card. You can also watch live matches, or create or join a <b>private room</b>. The <b>Most used fighters</b> panel shows what players are bringing today and of all time.</p></div>
          <div><h3>${goto('pass', 'Fighter Pass')}</h3><p><b>3 rolls per day</b> (resets at midnight US Eastern). Each roll shows 20 random fighters with random natures, IVs, abilities and genders, and you <b>keep up to 5</b> for your roster. Your roster is listed below, sorted by fighter. You can release fighters you don't want.</p></div>
          <div><h3>${goto('elite', 'Elite Teams')}</h3><p>Build teams of 6 from your roster. For each fighter, pick up to 4 moves, an item and (if it can be either) its gender. Hover moves to see what they do. Teams must follow the species and item clauses. <b>Export</b> gives a team as Showdown-style text, and <b>Import</b> pastes one in, matching each fighter to the closest one in your roster.</p></div>
          <div><h3>${goto('dex', 'Fighterdex')}</h3><p>All ${nFighters} fighters with their types, base stats, abilities, move pools, gender ratio and Final Smash forms. Search by name, series, type or move. Filter by a type or a type combination (Final Smash forms included, or pick "None" for single-type fighters), and sort by Fighterdex number, BST or any single stat. Tap a fighter for the full entry.</p></div>
          <div><h3>${goto('calc', 'Calc')}</h3><p>A <b>damage calculator</b> that runs the real battle engine, so its numbers match battles. Set the attacker and defender (nature, IVs, ability, item, Final Smash, stat boosts, status, HP) and the field (weather, screens, critical hit, Doubles spread). It shows the damage range and how many hits it takes to KO. You can load fighters straight from your roster.</p></div>
          <div><h3>${goto('stats', 'Stats')}</h3><p>Your <b>Battler Card</b>, your <b>win/loss record</b> (by mode, against players and the CPU), your most-used fighters and recent battles. It also has site-wide <b>fighter usage</b> (how often each fighter is brought and its win rate, by format, for today, 7/30/90 days or all time) and recent player battles. Every battle has a <b>▶ Watch</b> replay.</p></div>
        </div>
        <p class="muted small">The <b>🔊</b> button at the top sets the sound effects volume or mutes them, and your <b>name</b> opens your account menu.</p>
      </section>

      <section class="card" id="ab-accounts"><h2>Accounts & Battler Cards</h2>
        <ul class="about-list">
          <li><b>Accounts</b> use a username and password. Your roster, Elite teams and daily Fighter Pass rolls are saved to your account and sync across devices. If you played as a guest first, signing in moves that browser's fighters and teams into your account.</li>
          <li>There's no email on accounts, so <b>keep your password somewhere safe</b>. You can change it from the account menu.</li>
          <li><b>Battler Card:</b> your public profile. Pick a card color, an avatar (any fighter or Final Smash form, including alternate-gender sprites), a title, a short "about you" and a showcase team. It shows your record and favorite fighters. Edit it from the account menu (tap your name at the top) or the Stats tab. Curse words and slurs aren't allowed.</li>
          <li>Roster fighters are <b>signed by the server</b>, so nobody can edit their nature, IVs or ability.</li>
        </ul>
      </section>

      <section class="card" id="ab-pvp"><h2>Playing other people</h2>
        <ul class="about-list">
          <li><b>Find opponent</b> puts you in a queue for the mode and format you picked. You'll be matched with the next person who searches for the same thing. You can also challenge someone directly from the Online list.</li>
          <li><b>Battle clock</b> (player matches only): each turn has a <b>45-second</b> limit, taken from your <b>7-minute</b> time bank. If the turn timer runs out a move is picked for you, and if your bank runs out you lose. The whole battle has a <b>20-minute</b> game clock. When it ends, whoever has more fighters left wins (then more HP left). Drafting, building and picking your lineup also have time limits (90 seconds, 4 minutes, 90 seconds). Battles against the CPU aren't timed.</li>
          <li><b>Chat:</b> each battle has its own chat, with quick buttons (Good luck!, GG, Well played!, Nice!, Oops).</li>
          <li><b>After a battle:</b> <b>Rematch</b> (both players have to accept, and Elite teams are reused), copy a <b>replay link</b> to share, or go back to the lobby.</li>
          <li><b>Spectating:</b> live matches appear on Home, and anyone can watch.</li>
        </ul>
      </section>

      <section class="card" id="ab-rooms"><h2>Private rooms</h2>
        <ul class="about-list">
          <li><b>Create a room</b> on Home to play with a group of friends. You get a 5-letter <b>room code</b> and an <b>invite link</b>; friends join by typing the code on Home or opening the link. Up to 16 people can be in a room.</li>
          <li><b>The line:</b> everyone who wants to battle is in line. The first two people in line battle, and <b>everyone else in the room watches</b> the battle live. Tap <b>Sit out</b> to only watch, and <b>Get in line</b> to play again.</li>
          <li><b>Taking turns:</b> the host picks a rotation. <b>Winner stays on</b>: the winner keeps battling and the loser goes to the back of the line. <b>Everyone rotates</b>: both players go to the back. The next battle starts automatically 10 seconds after each one ends.</li>
          <li><b>Host controls:</b> the host (👑) picks the mode, format and rotation (between battles), starts or pauses battles, reorders the line, makes someone else host, or removes people. If the host leaves, someone else becomes host.</li>
          <li><b>Elite Smash rooms:</b> each person picks one of their Elite teams for the room before getting matched. Standard rooms use the usual draft.</li>
          <li>The room has its own <b>chat</b> and keeps everyone's wins and losses and the results of each battle. Room battles aren't listed on Home, and they still count toward your Stats.</li>
        </ul>
      </section>

      <section class="card" id="ab-tips"><h2>Tips</h2>
        <ul class="about-list">
          <li>Use <b>team preview</b> to plan: hover the opponent's fighters to check their Speed range and possible abilities before you pick your lineup.</li>
          <li>Run tricky matchups through the ${goto('calc', 'Calc')} before a big battle.</li>
          <li>In Doubles, <b>Protect</b>, <b>Fake Out</b> and spread moves are as strong as they are in real VGC.</li>
          <li>A Final Smash is a once-per-battle trump card. Think about who should use it before you transform.</li>
          <li>Check <b>Stats → Fighter usage</b> to see what's popular, then build a team that counters it.</li>
          <li>Roll your Fighter Pass every day. Rolls don't carry over.</li>
        </ul>
        <div class="row" style="margin-top:10px"><button class="primary" data-goto-tab="home">Start battling</button><button data-goto-tab="pass">Roll the Fighter Pass</button></div>
      </section>
      </div></div>`;

    $$('[data-goto-tab]').forEach(a => a.onclick = e => { e.preventDefault(); S.tab = a.dataset.gotoTab; U.render(); window.scrollTo(0, 0); });
    $$('[data-jump]').forEach(a => a.onclick = e => { e.preventDefault(); const el = document.getElementById('ab-' + a.dataset.jump); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }
  U.renderAbout = render;
})();

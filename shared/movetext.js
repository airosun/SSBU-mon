// Plain-English description of what a move does, built from its data. Used for battle tooltips.
(function () {
  const STATUS = { brn: 'burn', par: 'paralyze', psn: 'poison', tox: 'badly poison', slp: 'put to sleep', frz: 'freeze', tri: 'burn, paralyze or freeze' };
  const STAT = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed', accuracy: 'accuracy', evasion: 'evasion' };
  const TARGET = { allFoes: 'Hits both opposing fighters (75% damage each in doubles).', all: 'Hits everyone else on the field — including your partner (75% damage each in doubles).', randomFoe: 'Hits a random opposing fighter.' };
  const SPECIAL = {
    fakeout: 'Only works on the first turn after the user comes in. Makes the target flinch.',
    rapidspin: "Removes hazards, Leech Seed and trapping from the user's side and raises its Speed.",
    rollout: 'Doubles in power each turn it is used in a row (up to 5 times).',
    facade: 'Power doubles if the user is burned, poisoned or paralyzed (and burn does not halve it).',
    explosion: 'The user faints after using it.',
    fling: "Throws the user's held item (fails without one).",
    thief: "Steals the target's item if the user has none.",
    bellydrum: 'The user loses half its HP to maximize its Attack.',
    wish: 'At the end of next turn, the fighter in this slot recovers half of the user\'s max HP.',
    protect: 'Blocks almost every move this turn. Likely to fail if used repeatedly.',
    substitute: 'Uses 1/4 of max HP to make a decoy that takes hits and blocks status moves.',
    encore: 'Forces the target to repeat its last move for 3 turns.',
    disable: "Disables the target's last move for 4 turns.",
    metronome: 'Uses a completely random move.',
    copycat: 'Copies the last move used in the battle.',
    painsplit: 'The user and target share their combined HP evenly.',
    focusenergy: 'Greatly raises the critical-hit ratio.',
    rest: 'Fully heals the user and cures status, then it sleeps for 2 turns.',
    healbell: "Cures the status conditions of the user's whole team.",
    forceswitch: 'Forces the target out and drags in a random fighter from its team.',
    focuspunch: 'Moves last, and fails if the user is hit before it attacks.',
    crash: 'If it misses, the user loses half its max HP.',
    triplekick: 'Hits 3 times, getting stronger each hit (20, 40, 60).',
    brickbreak: "Shatters the target side's Reflect and Light Screen.",
    revenge: 'Moves last; power doubles if the user was hit by the target this turn.',
    dragout: 'Moves last and forces the target out for a random replacement.',
    bodypress: "Uses the user's Defense instead of Attack.",
    counter: 'Moves last; hits back the last fighter that used a physical move on the user for double the damage.',
    mirrorcoat: 'Moves last; hits back the last fighter that used a special move on the user for double the damage.',
    thousandarrows: 'Hits Flying types and fighters that are floating.',
    pivot: 'The user switches out after using it.',
    futuresight: 'Two turns later, the target slot is hit by a psychic attack.',
    trick: 'Swaps held items with the target.',
    magiccoat: 'Bounces status moves aimed at the user back at their user this turn.',
    hex: 'Power doubles if the target has a status condition.',
    level: "Deals damage equal to the user's level (50).",
    trap: 'The target can\'t switch out while the user is in battle.',
    poltergeist: 'Fails if the target has no held item.',
    outrage: 'The user rampages for 2–3 turns, then becomes confused.',
    knockoff: 'Knocks off the target\'s item; 1.5× power if it has one.',
    sucker: 'Goes first, but fails unless the target is about to use an attacking move.',
    acrobatics: 'Power doubles if the user has no held item.',
    gyroball: 'Stronger the slower the user is compared to the target (up to 150).',
    gigaton: 'A massive hammer blow.',
    steelbeam: 'The user loses half its max HP.',
    freezedry: 'Super effective against Water types.',
    leechseed: 'Each turn, drains 1/8 of the target\'s HP to the user\'s slot. Grass types are immune.',
    ingrain: 'Restores 1/16 HP each turn, but the user can\'t switch out.',
    taunt: 'The target can only use attacking moves for 3 turns.',
    defog: 'Clears hazards on both sides and the target side\'s screens; lowers the target\'s evasion.',
    partingshot: "Lowers the target's Attack and Sp. Atk, then the user switches out.",
  };
  const HAZ = { spikes: 'Sets Spikes on the opposing side: grounded fighters switching in take damage (stacks 3 times).', toxicspikes: 'Sets Toxic Spikes: grounded fighters switching in are poisoned (2 layers = badly poisoned).', stealthrock: 'Sets Stealth Rock: fighters switching in take Rock-type damage.', stickyweb: 'Sets Sticky Web: grounded fighters switching in lose Speed.' };
  const SIDE = { reflect: 'Halves physical damage to your side for 5 turns (2/3 in doubles).', lightscreen: 'Halves special damage to your side for 5 turns (2/3 in doubles).', tailwind: "Doubles your side's Speed for 4 turns." };
  const WEATHER = { sun: 'Sets harsh sunlight for 5 turns: Fire moves 1.5×, Water moves 0.5×.', rain: 'Sets rain for 5 turns: Water moves 1.5×, Fire moves 0.5×.', snow: 'Sets snow for 5 turns: Ice types get 1.5× Defense.' };
  const boostText = (b, who, bare) => {
    const list = Object.entries(b).filter(([k]) => k !== 'target');
    const same = list.every(([, v]) => v === list[0][1]);
    const verb = v => (v > 0 ? (bare ? 'raise' : 'Raises') : (bare ? 'lower' : 'Lowers'));
    if (same) return `${verb(list[0][1])} ${who} ${list.map(([k]) => STAT[k]).join(' and ')} by ${Math.abs(list[0][1])}`;
    return list.map(([k, v], i) => `${i ? verb(v).toLowerCase() : verb(v)} ${who} ${STAT[k]} by ${Math.abs(v)}`).join(', ');
  };

  function describe(m) {
    if (!m) return '';
    const parts = [];
    if (m.cat === 'Status') {
      if (m.status) parts.push(`${STATUS[m.status][0].toUpperCase() + STATUS[m.status].slice(1)}s the target.`);
      if (m.boosts) parts.push(boostText(m.boosts, m.boosts.target === 'self' ? "the user's" : "the target's") + '.');
      if (m.heal) parts.push(`Restores ${Math.round(m.heal * 100)}% of max HP${m.sunHeal ? ' (more in sun, less in rain/snow)' : ''}.`);
      if (m.hazard) parts.push(HAZ[m.hazard]);
      if (m.side) parts.push(SIDE[m.side]);
      if (m.weather) parts.push(WEATHER[m.weather]);
      if (m.field === 'trickroom') parts.push('For 5 turns, slower fighters move first.');
      if (m.field === 'gravity') parts.push('For 5 turns, everyone is grounded and moves are more accurate.');
    } else {
      if (m.multihit) parts.push(Array.isArray(m.multihit) ? `Hits ${m.multihit[0]}–${m.multihit[1]} times.` : `Hits ${m.multihit} times.`);
      if (m.crit) parts.push('High critical-hit ratio.');
      if (m.recoil) parts.push(`The user takes ${Math.round(m.recoil * 100)}% of the damage dealt as recoil.`);
      if (m.drain) parts.push(`The user recovers ${Math.round(m.drain * 100)}% of the damage dealt.`);
      if (m.charge) parts.push(m.semi ? `Turn 1: the user ${{ fly: 'flies up', dig: 'digs underground', dive: 'dives underwater', phantom: 'vanishes' }[m.semi]} and avoids most attacks. Turn 2: it attacks.` : `Charges on turn 1, attacks on turn 2${m.sunSkip ? ' (no charge in sun)' : ''}.`);
      if (m.chargeBoost) parts.push(boostText(m.chargeBoost, "the user's") + ' while charging.');
      for (const e of m.sec || []) {
        const c = e.chance >= 100 ? '' : `${e.chance}% chance to `;
        if (e.status) parts.push(`${c ? c : 'Always '}${STATUS[e.status]}${c ? '' : 's'} the target.`);
        if (e.volatile === 'flinch') parts.push(`${c || ''}${c ? 'make' : 'Makes'} the target flinch.`);
        if (e.volatile === 'confusion') parts.push(`${c || ''}${c ? 'confuse' : 'Confuses'} the target.`);
        if (e.boosts) parts.push(`${c ? c + boostText(e.boosts, "the target's", true) : boostText(e.boosts, "the target's")}.`);
        if (e.self) parts.push(`${c ? c + boostText(e.self, "the user's", true) : boostText(e.self, "the user's")}.`);
      }
      if (m.selfBoost) parts.push(boostText(m.selfBoost, "the user's") + '.');
      if (m.ignoreDefBoosts) parts.push("Ignores the target's stat changes.");
      if (m.useDef) parts.push("Damage is calculated against the target's Defense.");
      if (m.breaksProtect) parts.push('Breaks through Protect.');
      if (m.hitsSemi) parts.push(`Can hit fighters that are ${m.hitsSemi.map(x => ({ fly: 'in the air', dig: 'underground', dive: 'underwater' }[x])).join(' or ')}.`);
    }
    if (m.special && SPECIAL[m.special]) parts.push(SPECIAL[m.special]);
    if (TARGET[m.target]) parts.push(TARGET[m.target]);
    if (m.prio > 0) parts.push(`Priority +${m.prio}: usually moves first.`);
    if (m.prio < 0 && !['focuspunch', 'revenge', 'dragout', 'counter', 'mirrorcoat'].includes(m.special)) parts.push(`Priority ${m.prio}: moves after most others.`);
    const flags = [];
    if (m.contact) flags.push('contact');
    for (const f of ['punch', 'bite', 'sound', 'pulse', 'bullet', 'slicing', 'kick', 'wind']) if (m[f]) flags.push({ bullet: 'ball/bomb' }[f] || f);
    if (!parts.length) parts.push(m.cat === 'Status' ? 'A status move.' : 'A plain attack with no extra effect.');
    return { text: parts.join(' ').replace(/\s+/g, ' ').trim(), flags };
  }
  const api = { describe };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.MOVETEXT = api;
})();

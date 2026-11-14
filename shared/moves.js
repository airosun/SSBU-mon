// SSBU-mon move database. Real Pokémon moves (Gen 9 numbers where they exist).
// m(name, type, category, power, accuracy (true = never misses), pp, options)
// Option keys:
//   prio, crit (crit stage bonus), contact, punch, bite, sound, pulse, bullet, slicing, kick, wind,
//   sec: [{chance, status, volatile, boosts (on target), self (boosts on user)}]
//   selfBoost: boosts applied to user after a successful hit (not a secondary; Sheer Force ignores)
//   recoil: fraction of damage dealt, drain: fraction, multihit: n | [min,max]
//   charge: true (two-turn), semi: 'fly'|'dig'|'dive'|'phantom' (semi-invulnerable on charge turn)
//   status (status move inflicts), boosts (status move: {target:'self'|'foe', ...})
//   heal: fraction (self heal), side/field/weather effects, special: string handled in engine
const MOVES = {};
function m(name, type, cat, power, acc, pp, o = {}) {
  MOVES[name] = Object.assign({ name, type, cat, power, acc, pp, prio: 0 }, o);
}
const C = { contact: true };

// ---------- Normal ----------
m('Pound', 'Normal', 'Physical', 40, 100, 35, { ...C });
m('Quick Attack', 'Normal', 'Physical', 40, 100, 30, { ...C, prio: 1 });
m('Extreme Speed', 'Normal', 'Physical', 80, 100, 5, { ...C, prio: 2 });
m('Fake Out', 'Normal', 'Physical', 40, 100, 10, { ...C, prio: 3, special: 'fakeout', sec: [{ chance: 100, volatile: 'flinch' }] });
m('Body Slam', 'Normal', 'Physical', 85, 100, 15, { ...C, sec: [{ chance: 30, status: 'par' }] });
m('Double-Edge', 'Normal', 'Physical', 120, 100, 15, { ...C, recoil: 1 / 3 });
m('Headbutt', 'Normal', 'Physical', 70, 100, 15, { ...C, sec: [{ chance: 30, volatile: 'flinch' }] });
m('Hyper Fang', 'Normal', 'Physical', 80, 90, 15, { ...C, bite: true, sec: [{ chance: 10, volatile: 'flinch' }] });
m('Rapid Spin', 'Normal', 'Physical', 50, 100, 40, { ...C, special: 'rapidspin', selfBoost: { spe: 1 } });
m('Rollout', 'Normal', 'Physical', 30, 90, 20, { ...C, special: 'rollout' });
m('Skull Bash', 'Normal', 'Physical', 130, 100, 10, { ...C, charge: true, chargeBoost: { def: 1 } });
m('Facade', 'Normal', 'Physical', 70, 100, 20, { ...C, special: 'facade' });
m('Tri Attack', 'Normal', 'Special', 80, 100, 10, { sec: [{ chance: 20, status: 'tri' }] });
m('Hyper Voice', 'Normal', 'Special', 90, 100, 10, { sound: true });
m('Boomburst', 'Normal', 'Special', 140, 100, 10, { sound: true });
m('Swift', 'Normal', 'Special', 60, true, 20, {});
m('Explosion', 'Normal', 'Physical', 250, 100, 5, { special: 'explosion' });
m('Fling', 'Dark', 'Physical', 70, 100, 10, { special: 'fling' });
m('Thief', 'Dark', 'Physical', 60, 100, 25, { ...C, special: 'thief' });
m('Swords Dance', 'Normal', 'Status', 0, true, 20, { boosts: { target: 'self', atk: 2 } });
m('Shell Smash', 'Normal', 'Status', 0, true, 15, { boosts: { target: 'self', atk: 2, spa: 2, spe: 2, def: -1, spd: -1 } });
m('Belly Drum', 'Normal', 'Status', 0, true, 10, { special: 'bellydrum' });
m('Recover', 'Normal', 'Status', 0, true, 5, { heal: 0.5 });
m('Slack Off', 'Normal', 'Status', 0, true, 5, { heal: 0.5 });
m('Soft-Boiled', 'Normal', 'Status', 0, true, 5, { heal: 0.5 });
m('Wish', 'Normal', 'Status', 0, true, 10, { special: 'wish' });
m('Protect', 'Normal', 'Status', 0, true, 10, { prio: 4, special: 'protect' });
m('Substitute', 'Normal', 'Status', 0, true, 10, { special: 'substitute' });
m('Sing', 'Normal', 'Status', 0, 55, 15, { sound: true, status: 'slp' });
m('Encore', 'Normal', 'Status', 0, 100, 5, { special: 'encore' });
m('Disable', 'Normal', 'Status', 0, 100, 20, { special: 'disable' });
m('Metronome', 'Normal', 'Status', 0, true, 10, { special: 'metronome' });
m('Copycat', 'Normal', 'Status', 0, true, 20, { special: 'copycat' });
m('Pain Split', 'Normal', 'Status', 0, true, 20, { special: 'painsplit' });
m('Agility', 'Psychic', 'Status', 0, true, 30, { boosts: { target: 'self', spe: 2 } });
m('Focus Energy', 'Normal', 'Status', 0, true, 30, { special: 'focusenergy' });
m('Rest', 'Psychic', 'Status', 0, true, 5, { special: 'rest' });
m('Gravity', 'Psychic', 'Status', 0, true, 5, { field: 'gravity' });
m('Hypnosis', 'Psychic', 'Status', 0, 60, 20, { status: 'slp' });
m('Aromatherapy', 'Grass', 'Status', 0, true, 5, { special: 'healbell' });
m('Roar', 'Normal', 'Status', 0, true, 20, { prio: -6, sound: true, special: 'forceswitch' });

// ---------- Fire ----------
m('Ember', 'Fire', 'Special', 40, 100, 25, { sec: [{ chance: 10, status: 'brn' }] });
m('Flamethrower', 'Fire', 'Special', 90, 100, 15, { sec: [{ chance: 10, status: 'brn' }] });
m('Fire Blast', 'Fire', 'Special', 110, 85, 5, { sec: [{ chance: 10, status: 'brn' }] });
m('Overheat', 'Fire', 'Special', 130, 90, 5, { selfBoost: { spa: -2 } });
m('Mystical Fire', 'Fire', 'Special', 75, 100, 10, { sec: [{ chance: 100, boosts: { spa: -1 } }] });
m('Fire Punch', 'Fire', 'Physical', 75, 100, 15, { ...C, punch: true, sec: [{ chance: 10, status: 'brn' }] });
m('Fire Fang', 'Fire', 'Physical', 65, 95, 15, { ...C, bite: true, sec: [{ chance: 10, status: 'brn' }, { chance: 10, volatile: 'flinch' }] });
m('Flame Charge', 'Fire', 'Physical', 50, 100, 20, { ...C, sec: [{ chance: 100, self: { spe: 1 } }] });
m('Flare Blitz', 'Fire', 'Physical', 120, 100, 15, { ...C, recoil: 1 / 3, thaws: true, sec: [{ chance: 10, status: 'brn' }] });
m('Blaze Kick', 'Fire', 'Physical', 85, 90, 10, { ...C, kick: true, crit: 1, sec: [{ chance: 10, status: 'brn' }] });
m('Sacred Fire', 'Fire', 'Physical', 100, 95, 5, { thaws: true, sec: [{ chance: 50, status: 'brn' }] });
m('Will-O-Wisp', 'Fire', 'Status', 0, 85, 15, { status: 'brn' });
m('Sunny Day', 'Fire', 'Status', 0, true, 5, { weather: 'sun' });

// ---------- Water ----------
m('Water Gun', 'Water', 'Special', 40, 100, 25, {});
m('Water Pulse', 'Water', 'Special', 60, 100, 20, { pulse: true, sec: [{ chance: 20, volatile: 'confusion' }] });
m('Scald', 'Water', 'Special', 80, 100, 15, { thaws: true, sec: [{ chance: 30, status: 'brn' }] });
m('Surf', 'Water', 'Special', 90, 100, 15, { hitsSemi: ['dive'] });
m('Hydro Pump', 'Water', 'Special', 110, 80, 5, {});
m('Octazooka', 'Water', 'Special', 65, 85, 10, { bullet: true, sec: [{ chance: 50, boosts: { accuracy: -1 } }] });
m('Water Shuriken', 'Water', 'Special', 15, 100, 20, { prio: 1, multihit: [2, 5] });
m('Waterfall', 'Water', 'Physical', 80, 100, 15, { ...C, sec: [{ chance: 20, volatile: 'flinch' }] });
m('Aqua Jet', 'Water', 'Physical', 40, 100, 20, { ...C, prio: 1 });
m('Aqua Tail', 'Water', 'Physical', 90, 90, 10, { ...C });
m('Liquidation', 'Water', 'Physical', 85, 100, 10, { ...C, sec: [{ chance: 20, boosts: { def: -1 } }] });
m('Dive', 'Water', 'Physical', 80, 100, 10, { ...C, charge: true, semi: 'dive' });
m('Withdraw', 'Water', 'Status', 0, true, 40, { boosts: { target: 'self', def: 1 } });
m('Rain Dance', 'Water', 'Status', 0, true, 5, { weather: 'rain' });

// ---------- Grass ----------
m('Vine Whip', 'Grass', 'Physical', 45, 100, 25, { ...C });
m('Razor Leaf', 'Grass', 'Physical', 55, 95, 25, { crit: 1, slicing: true });
m('Bullet Seed', 'Grass', 'Physical', 25, 100, 30, { bullet: true, multihit: [2, 5] });
m('Seed Bomb', 'Grass', 'Physical', 80, 100, 15, { bullet: true });
m('Leaf Blade', 'Grass', 'Physical', 90, 100, 15, { ...C, crit: 1, slicing: true });
m('Power Whip', 'Grass', 'Physical', 120, 85, 10, { ...C });
m('Wood Hammer', 'Grass', 'Physical', 120, 100, 15, { ...C, recoil: 1 / 3 });
m('Petal Blizzard', 'Grass', 'Physical', 90, 100, 15, { wind: true });
m('Giga Drain', 'Grass', 'Special', 75, 100, 10, { drain: 0.5 });
m('Energy Ball', 'Grass', 'Special', 90, 100, 10, { bullet: true, sec: [{ chance: 10, boosts: { spd: -1 } }] });
m('Leaf Storm', 'Grass', 'Special', 130, 90, 5, { selfBoost: { spa: -2 } });
m('Solar Beam', 'Grass', 'Special', 120, 100, 10, { charge: true, sunSkip: true });
m('Leech Seed', 'Grass', 'Status', 0, 90, 10, { special: 'leechseed' });
m('Sleep Powder', 'Grass', 'Status', 0, 75, 15, { status: 'slp', powder: true });
m('Synthesis', 'Grass', 'Status', 0, true, 5, { heal: 0.5, sunHeal: true });
m('Ingrain', 'Grass', 'Status', 0, true, 20, { special: 'ingrain' });

// ---------- Electric ----------
m('Thunder Shock', 'Electric', 'Special', 40, 100, 30, { sec: [{ chance: 10, status: 'par' }] });
m('Thunderbolt', 'Electric', 'Special', 90, 100, 15, { sec: [{ chance: 10, status: 'par' }] });
m('Thunder', 'Electric', 'Special', 110, 70, 10, { hitsSemi: ['fly'], rainAcc: true, sec: [{ chance: 30, status: 'par' }] });
m('Discharge', 'Electric', 'Special', 80, 100, 15, { sec: [{ chance: 30, status: 'par' }] });
m('Charge Beam', 'Electric', 'Special', 50, 90, 10, { sec: [{ chance: 70, self: { spa: 1 } }] });
m('Zap Cannon', 'Electric', 'Special', 120, 50, 5, { bullet: true, sec: [{ chance: 100, status: 'par' }] });
m('Volt Switch', 'Electric', 'Special', 70, 100, 20, { special: 'pivot' });
m('Thunder Punch', 'Electric', 'Physical', 75, 100, 15, { ...C, punch: true, sec: [{ chance: 10, status: 'par' }] });
m('Thunder Fang', 'Electric', 'Physical', 65, 95, 15, { ...C, bite: true, sec: [{ chance: 10, status: 'par' }, { chance: 10, volatile: 'flinch' }] });
m('Wild Charge', 'Electric', 'Physical', 90, 100, 15, { ...C, recoil: 1 / 4 });
m('Volt Tackle', 'Electric', 'Physical', 120, 100, 15, { ...C, recoil: 1 / 3, sec: [{ chance: 10, status: 'par' }] });
m('Nuzzle', 'Electric', 'Physical', 20, 100, 20, { ...C, sec: [{ chance: 100, status: 'par' }] });
m('Zing Zap', 'Electric', 'Physical', 80, 100, 10, { ...C, sec: [{ chance: 30, volatile: 'flinch' }] });
m('Thunder Wave', 'Electric', 'Status', 0, 90, 20, { status: 'par' });

// ---------- Ice ----------
m('Ice Beam', 'Ice', 'Special', 90, 100, 10, { sec: [{ chance: 10, status: 'frz' }] });
m('Blizzard', 'Ice', 'Special', 110, 70, 5, { wind: true, snowAcc: true, sec: [{ chance: 10, status: 'frz' }] });
m('Freeze-Dry', 'Ice', 'Special', 70, 100, 20, { special: 'freezedry', sec: [{ chance: 10, status: 'frz' }] });
m('Icy Wind', 'Ice', 'Special', 55, 95, 15, { wind: true, sec: [{ chance: 100, boosts: { spe: -1 } }] });
m('Ice Shard', 'Ice', 'Physical', 40, 100, 30, { prio: 1 });
m('Ice Punch', 'Ice', 'Physical', 75, 100, 15, { ...C, punch: true, sec: [{ chance: 10, status: 'frz' }] });
m('Ice Fang', 'Ice', 'Physical', 65, 95, 15, { ...C, bite: true, sec: [{ chance: 10, status: 'frz' }, { chance: 10, volatile: 'flinch' }] });
m('Ice Hammer', 'Ice', 'Physical', 100, 90, 10, { ...C, punch: true, selfBoost: { spe: -1 } });
m('Icicle Crash', 'Ice', 'Physical', 85, 90, 10, { sec: [{ chance: 30, volatile: 'flinch' }] });
m('Ice Spinner', 'Ice', 'Physical', 80, 100, 15, { ...C });
m('Snowscape', 'Ice', 'Status', 0, true, 10, { weather: 'snow' });

// ---------- Fighting ----------
m('Hammer Arm', 'Fighting', 'Physical', 100, 90, 10, { ...C, punch: true, selfBoost: { spe: -1 } });
m('Mach Punch','Fighting', 'Physical', 40, 100, 30, { ...C, punch: true, prio: 1 });
m('Vacuum Wave', 'Fighting', 'Special', 40, 100, 30, { prio: 1 });
m('Drain Punch', 'Fighting', 'Physical', 75, 100, 10, { ...C, punch: true, drain: 0.5 });
m('Power-Up Punch', 'Fighting', 'Physical', 40, 100, 20, { ...C, punch: true, sec: [{ chance: 100, self: { atk: 1 } }] });
m('Focus Punch', 'Fighting', 'Physical', 150, 100, 20, { ...C, punch: true, prio: -3, special: 'focuspunch' });
m('Close Combat', 'Fighting', 'Physical', 120, 100, 5, { ...C, selfBoost: { def: -1, spd: -1 } });
m('High Jump Kick', 'Fighting', 'Physical', 130, 90, 10, { ...C, kick: true, special: 'crash' });
m('Triple Kick', 'Fighting', 'Physical', 20, 90, 10, { ...C, kick: true, special: 'triplekick', multihit: 3 });
m('Sky Uppercut', 'Fighting', 'Physical', 85, 90, 15, { ...C, punch: true, hitsSemi: ['fly'] });
m('Cross Chop', 'Fighting', 'Physical', 100, 80, 5, { ...C, crit: 1 });
m('Force Palm', 'Fighting', 'Physical', 60, 100, 10, { ...C, sec: [{ chance: 30, status: 'par' }] });
m('Brick Break', 'Fighting', 'Physical', 75, 100, 15, { ...C, special: 'brickbreak' });
m('Rock Smash', 'Fighting', 'Physical', 40, 100, 15, { ...C, sec: [{ chance: 50, boosts: { def: -1 } }] });
m('Revenge', 'Fighting', 'Physical', 60, 100, 10, { ...C, prio: -4, special: 'revenge' });
m('Circle Throw', 'Fighting', 'Physical', 60, 90, 10, { ...C, prio: -6, special: 'dragout' });
m('Sacred Sword', 'Fighting', 'Physical', 90, 100, 15, { ...C, slicing: true, ignoreDefBoosts: true });
m('Dynamic Punch', 'Fighting', 'Physical', 100, 50, 5, { ...C, punch: true, sec: [{ chance: 100, volatile: 'confusion' }] });
m('Body Press', 'Fighting', 'Physical', 80, 100, 10, { ...C, special: 'bodypress' });
m('Aura Sphere', 'Fighting', 'Special', 80, true, 20, { pulse: true, bullet: true });
m('Focus Blast', 'Fighting', 'Special', 120, 70, 5, { bullet: true, sec: [{ chance: 10, boosts: { spd: -1 } }] });
m('Counter', 'Fighting', 'Physical', 0, 100, 20, { ...C, prio: -5, special: 'counter' });
m('Detect', 'Fighting', 'Status', 0, true, 5, { prio: 4, special: 'protect' });
m('Bulk Up', 'Fighting', 'Status', 0, true, 20, { boosts: { target: 'self', atk: 1, def: 1 } });

// ---------- Poison ----------
m('Poison Jab', 'Poison', 'Physical', 80, 100, 20, { ...C, sec: [{ chance: 30, status: 'psn' }] });
m('Poison Fang', 'Poison', 'Physical', 50, 100, 15, { ...C, bite: true, sec: [{ chance: 50, status: 'tox' }] });
m('Poison Tail', 'Poison', 'Physical', 50, 100, 25, { ...C, crit: 1, sec: [{ chance: 10, status: 'psn' }] });
m('Gunk Shot', 'Poison', 'Physical', 120, 80, 5, { sec: [{ chance: 30, status: 'psn' }] });
m('Sludge Bomb', 'Poison', 'Special', 90, 100, 10, { bullet: true, sec: [{ chance: 30, status: 'psn' }] });
m('Sludge Wave', 'Poison', 'Special', 95, 100, 10, { sec: [{ chance: 10, status: 'psn' }] });
m('Toxic', 'Poison', 'Status', 0, 90, 10, { status: 'tox', poisonNeverMiss: true });
m('Toxic Spikes', 'Poison', 'Status', 0, true, 20, { hazard: 'toxicspikes' });

// ---------- Ground ----------
m('Earthquake', 'Ground', 'Physical', 100, 100, 10, { hitsSemi: ['dig'] });
m('High Horsepower', 'Ground', 'Physical', 95, 95, 10, { ...C });
m('Stomping Tantrum', 'Ground', 'Physical', 75, 100, 10, { ...C });
m('Bulldoze', 'Ground', 'Physical', 60, 100, 20, { sec: [{ chance: 100, boosts: { spe: -1 } }] });
m('Drill Run', 'Ground', 'Physical', 80, 95, 10, { ...C, crit: 1 });
m('Headlong Rush', 'Ground', 'Physical', 120, 100, 5, { ...C, punch: true, selfBoost: { def: -1, spd: -1 } });
m('Dig', 'Ground', 'Physical', 80, 100, 10, { ...C, charge: true, semi: 'dig' });
m('Thousand Arrows', 'Ground', 'Physical', 90, 100, 10, { special: 'thousandarrows' });
m('Earth Power', 'Ground', 'Special', 90, 100, 10, { sec: [{ chance: 10, boosts: { spd: -1 } }] });
m('Spikes', 'Ground', 'Status', 0, true, 20, { hazard: 'spikes' });

// ---------- Flying ----------
m('Aerial Ace', 'Flying', 'Physical', 60, true, 20, { ...C, slicing: true });
m('Drill Peck', 'Flying', 'Physical', 80, 100, 20, { ...C });
m('Dual Wingbeat', 'Flying', 'Physical', 40, 90, 10, { ...C, multihit: 2 });
m('Brave Bird', 'Flying', 'Physical', 120, 100, 15, { ...C, recoil: 1 / 3 });
m('Acrobatics', 'Flying', 'Physical', 55, 100, 15, { ...C, special: 'acrobatics' });
m('Fly', 'Flying', 'Physical', 90, 95, 15, { ...C, charge: true, semi: 'fly' });
m('Bounce', 'Flying', 'Physical', 85, 85, 5, { ...C, charge: true, semi: 'fly', sec: [{ chance: 30, status: 'par' }] });
m('Air Slash', 'Flying', 'Special', 75, 95, 15, { slicing: true, sec: [{ chance: 30, volatile: 'flinch' }] });
m('Hurricane', 'Flying', 'Special', 110, 70, 10, { wind: true, hitsSemi: ['fly'], rainAcc: true, sec: [{ chance: 30, volatile: 'confusion' }] });
m('Roost', 'Flying', 'Status', 0, true, 5, { heal: 0.5 });
m('Tailwind', 'Flying', 'Status', 0, true, 15, { wind: true, side: 'tailwind' });
m('Defog', 'Flying', 'Status', 0, true, 15, { special: 'defog' });

// ---------- Psychic ----------
m('Psybeam', 'Psychic', 'Special', 65, 100, 20, { sec: [{ chance: 10, volatile: 'confusion' }] });
m('Psychic', 'Psychic', 'Special', 90, 100, 10, { sec: [{ chance: 10, boosts: { spd: -1 } }] });
m('Psyshock', 'Psychic', 'Special', 80, 100, 10, { useDef: true });
m('Psystrike', 'Psychic', 'Special', 100, 100, 10, { useDef: true });
m('Extrasensory', 'Psychic', 'Special', 80, 100, 20, { sec: [{ chance: 10, volatile: 'flinch' }] });
m('Future Sight', 'Psychic', 'Special', 120, 100, 10, { special: 'futuresight' });
m('Psycho Cut', 'Psychic', 'Physical', 70, 100, 20, { crit: 1, slicing: true });
m('Zen Headbutt', 'Psychic', 'Physical', 80, 90, 15, { ...C, sec: [{ chance: 20, volatile: 'flinch' }] });
m('Psychic Fangs', 'Psychic', 'Physical', 85, 100, 10, { ...C, bite: true, special: 'brickbreak' });
m('Calm Mind', 'Psychic', 'Status', 0, true, 20, { boosts: { target: 'self', spa: 1, spd: 1 } });
m('Reflect', 'Psychic', 'Status', 0, true, 20, { side: 'reflect' });
m('Light Screen', 'Psychic', 'Status', 0, true, 30, { side: 'lightscreen' });
m('Trick Room', 'Psychic', 'Status', 0, true, 5, { prio: -7, field: 'trickroom' });
m('Teleport', 'Psychic', 'Status', 0, true, 20, { prio: -6, special: 'pivot' });
m('Trick', 'Psychic', 'Status', 0, 100, 10, { special: 'trick' });
m('Magic Coat', 'Psychic', 'Status', 0, true, 15, { prio: 4, special: 'magiccoat' });
m('Mirror Coat', 'Psychic', 'Special', 0, 100, 20, { prio: -5, special: 'mirrorcoat' });
m('Moonlight', 'Fairy', 'Status', 0, true, 5, { heal: 0.5, sunHeal: true });

// ---------- Bug ----------
m('U-turn', 'Bug', 'Physical', 70, 100, 20, { ...C, special: 'pivot' });
m('X-Scissor', 'Bug', 'Physical', 80, 100, 15, { ...C, slicing: true });
m('Pin Missile', 'Bug', 'Physical', 25, 95, 20, { multihit: [2, 5] });
m('Leech Life', 'Bug', 'Physical', 80, 100, 10, { ...C, drain: 0.5 });
m('Bug Buzz', 'Bug', 'Special', 90, 100, 10, { sound: true, sec: [{ chance: 10, boosts: { spd: -1 } }] });
m('Sticky Web', 'Bug', 'Status', 0, true, 20, { hazard: 'stickyweb' });

// ---------- Rock ----------
m('Rock Throw', 'Rock', 'Physical', 50, 90, 15, {});
m('Rock Slide', 'Rock', 'Physical', 75, 90, 10, { sec: [{ chance: 30, volatile: 'flinch' }] });
m('Rock Tomb', 'Rock', 'Physical', 60, 95, 15, { sec: [{ chance: 100, boosts: { spe: -1 } }] });
m('Stone Edge', 'Rock', 'Physical', 100, 80, 5, { crit: 1 });
m('Rock Blast', 'Rock', 'Physical', 25, 90, 10, { bullet: true, multihit: [2, 5] });
m('Head Smash', 'Rock', 'Physical', 150, 80, 5, { ...C, recoil: 1 / 2 });
m('Power Gem', 'Rock', 'Special', 80, 100, 20, {});
m('Meteor Beam', 'Rock', 'Special', 120, 90, 10, { charge: true, chargeBoost: { spa: 1 } });
m('Stealth Rock', 'Rock', 'Status', 0, true, 20, { hazard: 'stealthrock' });
m('Rock Polish', 'Rock', 'Status', 0, true, 20, { boosts: { target: 'self', spe: 2 } });

// ---------- Ghost ----------
m('Shadow Ball', 'Ghost', 'Special', 80, 100, 15, { bullet: true, sec: [{ chance: 20, boosts: { spd: -1 } }] });
m('Hex', 'Ghost', 'Special', 65, 100, 10, { special: 'hex' });
m('Night Shade', 'Ghost', 'Special', 0, 100, 15, { special: 'level' });
m('Shadow Claw', 'Ghost', 'Physical', 70, 100, 15, { ...C, crit: 1 });
m('Shadow Sneak', 'Ghost', 'Physical', 40, 100, 30, { ...C, prio: 1 });
m('Shadow Punch', 'Ghost', 'Physical', 60, true, 20, { ...C, punch: true });
m('Phantom Force', 'Ghost', 'Physical', 90, 100, 10, { ...C, charge: true, semi: 'phantom', breaksProtect: true });
m('Spirit Shackle', 'Ghost', 'Physical', 80, 100, 10, { special: 'trap' });
m('Poltergeist', 'Ghost', 'Physical', 110, 90, 5, { special: 'poltergeist' });

// ---------- Dragon ----------
m('Dragon Claw', 'Dragon', 'Physical', 80, 100, 15, { ...C });
m('Dragon Rush', 'Dragon', 'Physical', 100, 75, 10, { ...C, sec: [{ chance: 20, volatile: 'flinch' }] });
m('Dragon Hammer', 'Dragon', 'Physical', 90, 100, 15, { ...C });
m('Outrage', 'Dragon', 'Physical', 120, 100, 10, { ...C, special: 'outrage' });
m('Dragon Tail', 'Dragon', 'Physical', 60, 90, 10, { ...C, prio: -6, special: 'dragout' });
m('Dragon Pulse', 'Dragon', 'Special', 85, 100, 10, { pulse: true });
m('Draco Meteor', 'Dragon', 'Special', 130, 90, 5, { selfBoost: { spa: -2 } });
m('Dragon Dance', 'Dragon', 'Status', 0, true, 20, { boosts: { target: 'self', atk: 1, spe: 1 } });

// ---------- Dark ----------
m('Bite', 'Dark', 'Physical', 60, 100, 25, { ...C, bite: true, sec: [{ chance: 30, volatile: 'flinch' }] });
m('Crunch', 'Dark', 'Physical', 80, 100, 15, { ...C, bite: true, sec: [{ chance: 20, boosts: { def: -1 } }] });
m('Night Slash', 'Dark', 'Physical', 70, 100, 15, { ...C, crit: 1, slicing: true });
m('Knock Off', 'Dark', 'Physical', 65, 100, 20, { ...C, special: 'knockoff' });
m('Sucker Punch', 'Dark', 'Physical', 70, 100, 5, { ...C, prio: 1, special: 'sucker' });
m('Throat Chop', 'Dark', 'Physical', 80, 100, 15, { ...C });
m('Darkest Lariat', 'Dark', 'Physical', 85, 100, 10, { ...C, ignoreDefBoosts: true });
m('Brutal Swing', 'Dark', 'Physical', 60, 100, 20, { ...C });
m('Dark Pulse', 'Dark', 'Special', 80, 100, 15, { pulse: true, sec: [{ chance: 20, volatile: 'flinch' }] });
m('Night Daze', 'Dark', 'Special', 85, 95, 10, { sec: [{ chance: 40, boosts: { accuracy: -1 } }] });
m('Nasty Plot', 'Dark', 'Status', 0, true, 20, { boosts: { target: 'self', spa: 2 } });
m('Taunt', 'Dark', 'Status', 0, 100, 20, { special: 'taunt' });
m('Parting Shot', 'Dark', 'Status', 0, 100, 20, { sound: true, special: 'partingshot' });

// ---------- Steel ----------
m('Iron Head', 'Steel', 'Physical', 80, 100, 15, { ...C, sec: [{ chance: 30, volatile: 'flinch' }] });
m('Iron Tail', 'Steel', 'Physical', 100, 75, 15, { ...C, sec: [{ chance: 30, boosts: { def: -1 } }] });
m('Smart Strike', 'Steel', 'Physical', 70, true, 10, { ...C });
m('Bullet Punch', 'Steel', 'Physical', 40, 100, 30, { ...C, punch: true, prio: 1 });
m('Meteor Mash', 'Steel', 'Physical', 90, 90, 10, { ...C, punch: true, sec: [{ chance: 20, self: { atk: 1 } }] });
m('Heavy Slam', 'Steel', 'Physical', 100, 100, 10, { ...C, weightMove: true });
m('Gyro Ball', 'Steel', 'Physical', 0, 100, 5, { ...C, bullet: true, special: 'gyroball' });
m('Steel Roller', 'Steel', 'Physical', 130, 100, 5, { ...C });
m('Gigaton Hammer', 'Steel', 'Physical', 160, 100, 5, { special: 'gigaton', weightMove: true });
m('Anchor Shot', 'Steel', 'Physical', 80, 100, 20, { ...C, special: 'trap' });
m('Magnet Bomb', 'Steel', 'Physical', 60, true, 20, { bullet: true });
m('Flash Cannon', 'Steel', 'Special', 80, 100, 10, { sec: [{ chance: 10, boosts: { spd: -1 } }] });
m('Steel Beam', 'Steel', 'Special', 140, 95, 5, { special: 'steelbeam' });
m('Iron Defense', 'Steel', 'Status', 0, true, 15, { boosts: { target: 'self', def: 2 } });
m('Shift Gear', 'Steel', 'Status', 0, true, 10, { boosts: { target: 'self', atk: 1, spe: 2 } });
m("King's Shield", 'Steel', 'Status', 0, true, 10, { prio: 4, special: 'protect', kingsShield: true });

// ---------- Fairy ----------
m('Moonblast', 'Fairy', 'Special', 95, 100, 15, { sec: [{ chance: 30, boosts: { spa: -1 } }] });
m('Dazzling Gleam', 'Fairy', 'Special', 80, 100, 10, {});
m('Draining Kiss', 'Fairy', 'Special', 50, 100, 10, { drain: 0.75 });
m('Disarming Voice', 'Fairy', 'Special', 40, true, 15, { sound: true });
m('Play Rough', 'Fairy', 'Physical', 90, 90, 10, { ...C, sec: [{ chance: 10, boosts: { atk: -1 } }] });
m('Spirit Break', 'Fairy', 'Physical', 75, 100, 15, { ...C, sec: [{ chance: 100, boosts: { spa: -1 } }] });
m('Charm', 'Fairy', 'Status', 0, 100, 20, { boosts: { target: 'foe', atk: -2 } });

// Egg Bomb is Normal in Pokémon
m('Egg Bomb', 'Normal', 'Physical', 100, 75, 10, { bullet: true });

module.exports = MOVES;

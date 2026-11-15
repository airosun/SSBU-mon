// Ability specs. Each fighter ability name maps to a set of effect keys that the engine reads.
// Many lore abilities share a mechanic with a real Pokémon ability; the engine implements the mechanic once.
const A = {};
const def = (names, spec) => { for (const n of [].concat(names)) A[n] = spec; };

// ---- Once-per-battle HP threshold triggers ----
def('Super Mushroom', { threshold: { below: 0.5, heal: 0.25 } });
def(["Mom's Cooking", 'Doc Louis', 'Munchie'], { threshold: { below: 0.5, heal: 1 / 3 } });
def('Power of Friends', { threshold: { below: 0.25, heal: 1 / 3 } });
def('Triforce of Courage', { threshold: { below: 1 / 3, boosts: { atk: 1 } } });
def('Giga Bowser', { threshold: { below: 0.5, boosts: { atk: 1, def: 1 } } });
def('Fierce Deity', { threshold: { below: 1 / 3, boosts: { atk: 1, spe: 1 } } });
def('Three Sacred Treasures', { threshold: { below: 1 / 3, boosts: { atk: 1, def: 1, spd: 1 } } });
def('Awakening', { threshold: { below: 0.5, boosts: { spe: 1 } } });
def('Dragonstone', { threshold: { below: 0.5, boosts: { atk: 1, def: 1 } } });
def(['Rebellion', 'Pep Up'], { threshold: { below: 0.5, boosts: { atk: 1, spa: 1 } } });
def('Go!', { threshold: { below: 0.35, boosts: { atk: 1, spe: 1 } } });
def('One-Winged Angel', { threshold: { below: 0.5, boosts: { atk: 1, spe: 1 } } });
def('Devil Gene', { threshold: { below: 1 / 3, boosts: { atk: 2 } } });

// ---- Damage dealt modifiers ----
def('Giant Punch', { flagBoost: { flag: 'punch', mult: 1.2 } });
def('Galaxia', { flagBoost: { flag: 'slicing', mult: 1.5 } });
def('Ring Toss', { flagBoost: { flag: 'pulse', mult: 1.5 } });
def(['Chomp Wrangler', 'Petey Piranha', 'Krocodile Jaw'], { flagBoost: { flag: 'bite', mult: 1.5 } });
def(['Triforce of Power', 'Wicked Weave'], { flagBoost: { flag: 'contact', mult: 1.3 } });
def('Symphony', { flagBoost: { flag: 'sound', mult: 1.3 }, flagTaken: { flag: 'sound', mult: 0.5 } });
def(['Ace Pilot', 'Blessing of Palutena'], { typeBoost: { Flying: 1.2 } });
def('Goddess of Light', { typeBoost: { Fairy: 1.3 } });
def('Mark of the Luminary', { typeBoost: { Electric: 1.3 } });
def('Light of the Aegis', { typeBoost: { Electric: 1.2, Fairy: 1.2 } });
def('Falchion', { vsType: { Dragon: 1.5 } });
def('Vampire Killer', { vsType: { Dark: 1.5, Ghost: 1.5 } });
def('Torrent', { pinch: { type: 'Water' } });
def('Blaze', { pinch: { type: 'Fire' } });
def('Overgrow', { pinch: { type: 'Grass' } });
def("Grima's Vessel", { pinch: { type: 'Dark' } });
def('Satsui no Hado', { pinch: { type: 'Fighting' } });
def('Calamity', { lowHpStat: { below: 0.5, stat: 'atk', mult: 2, strict: true } });
def('Fight for My Friends', { lowHpStat: { below: 1 / 3, stat: 'atk', mult: 1.5 } });
def('Tough Guy', { guts: true });
def('Solar Power', { solarPower: true });
def('Tactician', { analytic: true });
def('Big Brute', { sheerForce: true });
def('Heavyweight', { weightBoost: 1.5 });
def('Big Top', { bounceBoost: true });
def('Power Pellet', { scrappy: true, normalVsGhost: 2 });
def('Sword of Seals', { fireBreaker: true });
def(['Eldest Koopaling', 'Legend of Erdrick'], { moldBreaker: true });
def('Great Aether', { drainAll: 0.25 });
def('Long ARMS', { longReach: true });
def('Popo & Nana', { parentalBond: true });
def('Pikmin Squad', { skillLink: true });
def('Zapper Aim', { accMult: 1.3 });
def('Sneaking Mission', { infiltrator: true });

// ---- Damage taken modifiers ----
def(['Triforce of Wisdom', 'Zenithian Armor'], { filter: 0.75 });
def('Varia Suit', { typeTaken: { Fire: 0.5 }, statusImmune: ['brn'] });
def('Aegis Driver', { typeTaken: { Fire: 0.5 } });
def('Bottomless Belly', { typeTaken: { Fire: 0.5, Ice: 0.5 } });
def('Heart of Light', { typeTaken: { Dark: 0.5 } });
def('Ink Armor', { fullHpTaken: 0.5 });
def('Friend Guard', { fullHpTaken: 0.75 });
def('Gut Check', { gutCheck: true });
def('Luma', { luma: true });
def('Mask of Mystery', { disguise: true });
def('Flat Form', { sturdy: true });
def(['Defy Fate', 'Rings', 'Divine Pulse'], { surviveOnce: true });
def('Exalted Blood', { battleArmor: true });

// ---- Immunities / absorbs ----
def(['Warp Star', 'Parasol Float', 'Robo Burner', 'Deku Leaf', 'Junior Clown Car'], { levitate: true });
def(['Hylian Shield', 'Ender Teleport'], { immuneFlag: 'bullet' });
def('Pocket', { pocket: true });
def('Lightning Rod', { absorb: { type: 'Electric', boosts: { spa: 1 } } });
def('Franklin Badge', { absorb: { type: 'Electric' } });
def('Poltergust', { absorb: { type: 'Ghost', boosts: { spa: 1 } } });
def('PSI Magnet', { absorb: { type: 'Psychic', heal: 0.25 } });
def('Lost in Thoughts', { absorb: { type: 'Water', heal: 0.25 } });
def(['Reflector', 'Mirror Shield', 'Kick Reflect'], { magicBounce: true });
def('Flutter Jump', { hazardImmune: ['spikes', 'toxicspikes', 'stickyweb'] });
def('Super Star', { statusImmuneTurns: 3 });
def('Curseproof', { statusImmune: ['brn', 'par', 'psn', 'tox', 'slp', 'frz'] });
def('Balance Board', { noFlinch: true, noConfusion: true });
def('Inner Focus', { noFlinch: true, noIntimidate: true });
def('Discipline', { steadfast: true, noIntimidate: true });
def('Balancing Act', { noConfusion: true, noIntimidate: true });
def(['Pittoo Attitude', 'Ashen Demon'], { noIntimidate: true, noTaunt: true });
def(['Sarasaland Pride', 'Operating Buddy', 'Blue Bomber', 'Belmont Bloodline'], { clearBody: true });
def('Piranha Pot', { suctionCups: true });
def('Undead', { poisonHeal: true });

// ---- Reactions to being hit ----
def(['Spiked Shell', 'Thorns Enchantment'], { roughSkin: 1 / 8 });
def(['Static', 'Paralyzer'], { contactStatus: { chance: 30, status: 'par' } });
def('Phazon Corruption', { contactStatus: { chance: 30, status: 'tox' } });
def(['Cute Charm', 'Cheerful Secretary'], { contactAttract: 30 });
def('Magic Paintbrush', { contactFoeBoost: { spe: -1 } });
def('Infection', { mummy: true });
def('Treasure Greed', { pickpocket: true });
def('Justified', { hitByType: { type: 'Dark', boosts: { atk: 1 } } });
def('Scaredy Cat', { rattled: true });
def("Don't Stare", { hitBoost: { atk: 1 } });
def('Mishima Style', { angerPoint: true });
def("Mumbo's Magic", { colorChange: true });
def(['Super Princess Vibe', 'Spoiled Princess'], { onStatDrop: { spa: 2 } });
def('Tomboy Princess', { onStatDrop: { atk: 2 } });
def('Laughing Dog', { foeMissBoost: { spe: 1 } });
def('Sneaky Shell', { emergencyExit: true });
def(['KO Meter'], { hitCounterCrit: { hits: 3, flag: 'punch' } });
def(['Limit Break'], { hitCounterCrit: { hits: 3 } });

// ---- Reactions when attacking ----
def('Phazon Overload', { attackStatus: { chance: 30, status: 'psn', contactOnly: true } });
def('Blazing Fist', { attackStatus: { chance: 20, status: 'brn', flag: 'punch' } });
def('Phantom Thief', { magician: true });
def('Chozo Upgrade', { onKO: { spa: 1 } });
def(['Young Lion', 'Lone Wolf', 'Showboat', 'Hungry Wolf'], { onKO: { atk: 1 } });
def('Rocketbarrel Boost', { onKO: { spe: 1 } });
def('Protean', { protean: true });
def('Variable Weapons System', { protean: true });

// ---- Crits / priority ----
def(['Tipper', 'Chosen One'], { critBonus: 1 });
def('Knee of Justice', { flagCrit: 'kick' });
def('Mako Infusion', { sniper: true });
def('Arwing Pilot', { galeWings: true });
def(['Monkey Business', 'Wand Trickster'], { prankster: true });
def('Sheikah Stealth', { firstMovePrio: true });

// ---- Recoil / switching ----
def(['Hotshot', 'Meta Ridley', 'Gold Feathers'], { rockHead: true });
def(['Undying Pirate', 'Jenova Cells'], { regenerator: true });
def('Harp of the Sheikah', { naturalCure: true });
def('Cardboard Box', { cheapSub: true });

// ---- Switch-in effects ----
def(['Self-Proclaimed King', 'Star Wolf Leader', 'Bully', 'Intimidate'], { intimidate: true });
def('Blue Falcon', { startBoost: { spe: 1 } });
def('Copy Ability', { trace: true });
def('Masked Marth', { illusion: true });
def(['Navi', "Boney's Nose"], { frisk: true });
def('Visions', { anticipation: true });
def('Mirror of Truth', { copyBoosts: true });
def('Ball of Light', { clearFoeBoosts: true });
def('Phantom Guardian', { startSide: { cond: 'reflect', turns: 3 } });
def('Wind Waker', { startSide: { cond: 'tailwind', turns: 2 } });
def('Comet Observatory', { startField: { cond: 'gravity', turns: 5 } });
def('Hydro Storm', { startWeather: 'rain' });
def('Burning Sword', { startWeather: 'sun' });
def('Mad Genius', { download: true });
def('Morning Announcement', { announcement: true });
def('Pressure', { pressure: true });
def('Unnerve', { unnerve: true });

// ---- End-of-turn ----
def('Gotta Go Fast', { speedBoost: true });
def('Judge', { moody: true });
def('Crafting', { crafting: true });
def('Monado Arts', { monado: true });
def('Natural Regeneration', { natRegen: true });
def('Eggplant Harvest', { iceBody: true });
def('Rain Dish', { rainDish: true });
def('Bedside Manner', { shedSkin: true });

// ---- Speed ----
def('Chlorophyll', { weatherSpeed: 'sun' });
def('Squid Form', { weatherSpeed: 'rain' });
def('Suitless', { unburden: true });

// ---- Status-move / heal / berry interactions ----
def('Prescription', { healBoost: 1.5 });
def('Deep Breathing', { statusMoveHeal: 1 / 8 });
def('Witch Time', { protectFoeBoost: { spe: -2 } });
def('Foresight', { protectSelfBoost: { spe: 2 } });
def('Banana Hoard', { berryTwice: true });
def(['Gobble', 'Garlic Gobbler'], { berryBonusHeal: 1 / 8 });
def('Juice Maker', { ripen: true });
def('Bonus Fruit', { berryRandomBoost: true });
def('Orchard', { harvest: true });
def('Treasure Hunter', { pickup: true });

// ---- Final Smash (Mega) abilities ----
def('Giga Might', { flagBoost: { flag: 'contact', mult: 1.3 }, noFlinch: true });
def('Calamity Roar', { intimidate: true, flagBoost: { flag: 'contact', mult: 1.2 } });
def('Chaos Power', { statusImmune: ['brn', 'par', 'psn', 'tox', 'slp', 'frz'], speedBoost: true });
def('Tough Claws', { flagBoost: { flag: 'contact', mult: 1.3 } });
def('Drought', { startWeather: 'sun' });
def('Adaptability', { adaptability: true });
def('Steadfast', { steadfast: true });
def('Insomnia', { statusImmune: ['slp'] });
def('Monster Maw', { flagBoost: { flag: 'bite', mult: 1.5 }, typeTaken: { Fire: 0.5, Ice: 0.5 } });
def('Heartless Angel', { typeBoost: { Dark: 1.3, Flying: 1.3 } });
def('Devil Within', { flagBoost: { flag: 'contact', mult: 1.3 }, clearBody: true });

module.exports = A;

// Type chart, natures and items shared by server and client.
const TYPES = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground',
  'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];

// CHART[attacking][defending] = multiplier (omitted = 1)
const CHART = {
  Normal: { Rock: 0.5, Ghost: 0, Steel: 0.5 },
  Fire: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
  Water: { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
  Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
  Grass: { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
  Ice: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
  Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5 },
  Poison: { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
  Ground: { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
  Flying: { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
  Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
  Bug: { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
  Rock: { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
  Ghost: { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
  Dragon: { Dragon: 2, Steel: 0.5, Fairy: 0 },
  Dark: { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
  Steel: { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
  Fairy: { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 },
};
function effectiveness(atk, defTypes) {
  let m = 1;
  for (const t of defTypes) { const v = CHART[atk][t]; if (v !== undefined) m *= v; }
  return m;
}

const NATURES = {
  Hardy: {}, Docile: {}, Serious: {}, Bashful: {}, Quirky: {},
  Lonely: { plus: 'atk', minus: 'def' }, Brave: { plus: 'atk', minus: 'spe' }, Adamant: { plus: 'atk', minus: 'spa' }, Naughty: { plus: 'atk', minus: 'spd' },
  Bold: { plus: 'def', minus: 'atk' }, Relaxed: { plus: 'def', minus: 'spe' }, Impish: { plus: 'def', minus: 'spa' }, Lax: { plus: 'def', minus: 'spd' },
  Timid: { plus: 'spe', minus: 'atk' }, Hasty: { plus: 'spe', minus: 'def' }, Jolly: { plus: 'spe', minus: 'spa' }, Naive: { plus: 'spe', minus: 'spd' },
  Modest: { plus: 'spa', minus: 'atk' }, Mild: { plus: 'spa', minus: 'def' }, Quiet: { plus: 'spa', minus: 'spe' }, Rash: { plus: 'spa', minus: 'spd' },
  Calm: { plus: 'spd', minus: 'atk' }, Gentle: { plus: 'spd', minus: 'def' }, Sassy: { plus: 'spd', minus: 'spe' }, Careful: { plus: 'spd', minus: 'spa' },
};

const ITEMS = {
  'Leftovers': 'Restores 1/16 max HP at the end of each turn.',
  'Black Sludge': 'Poison types restore 1/16 HP each turn; others lose 1/8.',
  'Life Orb': 'Attacks deal 1.3x damage; user loses 1/10 max HP after attacking.',
  'Choice Band': 'Attack 1.5x, but locked into the first move chosen.',
  'Choice Specs': 'Sp. Atk 1.5x, but locked into the first move chosen.',
  'Choice Scarf': 'Speed 1.5x, but locked into the first move chosen.',
  'Focus Sash': 'At full HP, survives a hit that would KO with 1 HP. Single use.',
  'Sitrus Berry': 'Restores 1/4 max HP when HP falls to 1/2 or less.',
  'Lum Berry': 'Cures any status condition or confusion once.',
  'Assault Vest': 'Sp. Def 1.5x, but can only use damaging moves.',
  'Rocky Helmet': 'Attackers making contact lose 1/6 of their max HP.',
  'Heavy-Duty Boots': 'Immune to entry hazards.',
  'Expert Belt': 'Super-effective attacks deal 1.2x damage.',
  'Light Clay': 'Reflect and Light Screen last 8 turns.',
  'Eviolite': 'Defense and Sp. Def 1.5x.',
  'Air Balloon': 'Immune to Ground moves until hit by any attack.',
};
// fighters the CPU likes to give Eviolite to (any fighter can hold it)
const EVIOLITE_USERS = ['pichu', 'squirtle', 'ivysaur'];

const STAT_NAMES = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };

function calcStat(stat, base, iv, ev, level, nature) {
  if (stat === 'hp') return Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + level + 10;
  let v = Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + 5;
  const n = NATURES[nature] || {};
  if (n.plus === stat) v = Math.floor(v * 1.1);
  if (n.minus === stat) v = Math.floor(v * 0.9);
  return v;
}

const exported = { TYPES, CHART, effectiveness, NATURES, ITEMS, EVIOLITE_USERS, STAT_NAMES, calcStat };
if (typeof module !== 'undefined') module.exports = exported;
if (typeof window !== 'undefined') window.DEX = exported;

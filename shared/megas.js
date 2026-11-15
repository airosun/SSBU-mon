// Final Smashes (Mega Evolutions). Each stone lets one fighter transform once per battle,
// and only one fighter per team can use its Final Smash in a battle.
// Real Mega Pokémon use their official Mega stats and abilities; HP never changes when transforming.
(function () {
  const FINAL_SMASHES = {
    // stone: { base fighter id, form }
    'Bowserite':      { base: 'bowser', id: 'giga-bowser', name: 'Giga Bowser', types: ['Fire', 'Dragon'], stats: { hp: 120, atk: 155, def: 145, spa: 95, spd: 100, spe: 60 }, ability: { name: 'Giga Might', desc: 'Contact moves deal 1.3x damage, and it can\'t flinch.' } },
    'Ganonite':       { base: 'ganondorf', id: 'beast-ganon', name: 'Beast Ganon', types: ['Dark', 'Fighting'], stats: { hp: 115, atk: 165, def: 115, spa: 100, spd: 100, spe: 65 }, ability: { name: 'Calamity Roar', desc: 'Lowers the foes\' Attack on transforming or switching in (Intimidate); contact moves deal 1.2x damage.' } },
    'Chaos Emerald':  { base: 'sonic', id: 'super-sonic', name: 'Super Sonic', types: ['Electric', 'Fighting'], stats: { hp: 70, atk: 130, def: 90, spa: 85, spd: 85, spe: 170 }, ability: { name: 'Chaos Power', desc: 'Can\'t be afflicted with status conditions, and Speed rises 1 stage at the end of each turn.' } },
    'Greninjite':     { base: 'greninja', id: 'mega-greninja', name: 'Mega Greninja', types: ['Water', 'Dark'], stats: { hp: 72, atk: 125, def: 77, spa: 133, spd: 81, spe: 142 }, ability: { name: 'Protean', desc: 'Changes to the type of the move it\'s about to use (once per switch-in).' } },
    'Charizardite X': { base: 'charizard', id: 'mega-charizard-x', name: 'Mega Charizard X', types: ['Fire', 'Dragon'], stats: { hp: 78, atk: 130, def: 111, spa: 130, spd: 85, spe: 100 }, ability: { name: 'Tough Claws', desc: 'Contact moves deal 1.3x damage.' } },
    'Charizardite Y': { base: 'charizard', id: 'mega-charizard-y', name: 'Mega Charizard Y', types: ['Fire', 'Flying'], stats: { hp: 78, atk: 104, def: 78, spa: 159, spd: 115, spe: 100 }, ability: { name: 'Drought', desc: 'Summons harsh sunlight when it transforms or switches in.' } },
    'Lucarionite':    { base: 'lucario', id: 'mega-lucario', name: 'Mega Lucario', types: ['Fighting', 'Steel'], stats: { hp: 70, atk: 145, def: 88, spa: 140, spd: 70, spe: 112 }, ability: { name: 'Adaptability', desc: 'Same-type attack bonus is 2x instead of 1.5x.' } },
    'Lucarionite Z':  { base: 'lucario', id: 'mega-lucario-z', name: 'Mega Lucario Z', types: ['Fighting', 'Steel'], stats: { hp: 70, atk: 100, def: 70, spa: 164, spd: 70, spe: 151 }, ability: { name: 'Adaptability', desc: 'Same-type attack bonus is 2x instead of 1.5x.' } },
    'Mewtwonite X':   { base: 'mewtwo', id: 'mega-mewtwo-x', name: 'Mega Mewtwo X', types: ['Psychic', 'Fighting'], stats: { hp: 106, atk: 190, def: 100, spa: 154, spd: 100, spe: 130 }, ability: { name: 'Steadfast', desc: 'Speed rises 1 stage each time it flinches.' } },
    'Mewtwonite Y':   { base: 'mewtwo', id: 'mega-mewtwo-y', name: 'Mega Mewtwo Y', types: ['Psychic'], stats: { hp: 106, atk: 150, def: 70, spa: 194, spd: 120, spe: 140 }, ability: { name: 'Insomnia', desc: 'Can\'t fall asleep.' } },
    'Plantite':       { base: 'piranha-plant', id: 'petey-piranha', name: 'Petey Piranha', types: ['Grass', 'Poison'], stats: { hp: 100, atk: 135, def: 120, spa: 90, spd: 110, spe: 70 }, ability: { name: 'Monster Maw', desc: 'Biting moves deal 1.5x damage; takes half damage from Fire and Ice moves.' } },
    'Sephirite':      { base: 'sephiroth', id: 'safer-sephiroth', name: 'Safer Sephiroth', types: ['Dark', 'Flying'], stats: { hp: 90, atk: 140, def: 85, spa: 135, spd: 95, spe: 130 }, ability: { name: 'Heartless Angel', desc: 'Dark and Flying moves deal 1.3x damage.' } },
    'Devil Gene':     { base: 'kazuya', id: 'devil-kazuya', name: 'Devil Kazuya', types: ['Fighting', 'Dark'], stats: { hp: 105, atk: 150, def: 105, spa: 115, spd: 90, spe: 95 }, ability: { name: 'Devil Within', desc: 'Contact moves deal 1.3x damage, and its stats can\'t be lowered by foes.' } },
    'Corrinite':      { base: 'corrin', id: 'corrin-dragon-form', name: 'Corrin (Dragon Form)', types: ['Dragon', 'Water'], stats: { hp: 95, atk: 135, def: 110, spa: 110, spd: 100, spe: 90 }, ability: { name: 'Dragon Blood', desc: 'Dragon and Water moves deal 1.3x damage, and it takes half damage from Fire moves.' } },
    'Bayonettite':    { base: 'bayonetta', id: 'gomorrah', name: 'Gomorrah', types: ['Dark', 'Dragon'], stats: { hp: 80, atk: 145, def: 95, spa: 120, spd: 90, spe: 115 }, ability: { name: 'Infernal Demon', desc: 'Lowers the foes\' Attack on transforming or switching in (Intimidate); biting moves deal 1.5x damage.' } },
  };
  for (const [stone, f] of Object.entries(FINAL_SMASHES)) { f.stone = stone; f.image = f.id + '.png'; }
  const byBase = {};
  for (const f of Object.values(FINAL_SMASHES)) (byBase[f.base] = byBase[f.base] || []).push(f);
  const api = { FINAL_SMASHES, FINAL_SMASH_BY_BASE: byBase, isStone: item => !!FINAL_SMASHES[item] };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.MEGAS = api;
})();

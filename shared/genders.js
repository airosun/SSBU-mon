// Gender for each fighter, from the designer's gender sheet.
// type: M (always male), F (always female), N (genderless), B (both: two people, acts genderless),
// X (either: Standard Battle rolls it using the male percentage, Elite Smash lets you choose).
// images: alternate sprite for the non-default gender (also for some Final Smash forms).
(function () {
  const GENDERS = {
   "mario": {
    "type": "M"
   },
   "donkey-kong": {
    "type": "M"
   },
   "link": {
    "type": "M"
   },
   "samus": {
    "type": "F"
   },
   "dark-samus": {
    "type": "F"
   },
   "yoshi": {
    "type": "N"
   },
   "kirby": {
    "type": "N"
   },
   "fox": {
    "type": "M"
   },
   "pikachu": {
    "type": "X",
    "male": 50.0,
    "default": "M"
   },
   "luigi": {
    "type": "M"
   },
   "ness": {
    "type": "M"
   },
   "captain-falcon": {
    "type": "M"
   },
   "jigglypuff": {
    "type": "X",
    "male": 25.0,
    "default": "F"
   },
   "peach": {
    "type": "F"
   },
   "daisy": {
    "type": "F"
   },
   "bowser": {
    "type": "M"
   },
   "ice-climbers": {
    "type": "B"
   },
   "sheik": {
    "type": "F"
   },
   "zelda": {
    "type": "F"
   },
   "dr-mario": {
    "type": "M"
   },
   "pichu": {
    "type": "X",
    "male": 50.0,
    "default": "M",
    "images": {
     "F": "pichu_female.png"
    }
   },
   "falco": {
    "type": "M"
   },
   "marth": {
    "type": "M"
   },
   "lucina": {
    "type": "F"
   },
   "young-link": {
    "type": "M"
   },
   "ganondorf": {
    "type": "M"
   },
   "mewtwo": {
    "type": "N"
   },
   "roy": {
    "type": "M"
   },
   "chrom": {
    "type": "M"
   },
   "mr-game-and-watch": {
    "type": "M"
   },
   "meta-knight": {
    "type": "M"
   },
   "pit": {
    "type": "M"
   },
   "dark-pit": {
    "type": "M"
   },
   "zero-suit-samus": {
    "type": "F"
   },
   "wario": {
    "type": "M"
   },
   "snake": {
    "type": "M"
   },
   "ike": {
    "type": "M"
   },
   "squirtle": {
    "type": "X",
    "male": 87.5,
    "default": "M"
   },
   "ivysaur": {
    "type": "X",
    "male": 87.5,
    "default": "M"
   },
   "charizard": {
    "type": "X",
    "male": 87.5,
    "default": "M"
   },
   "diddy-kong": {
    "type": "M"
   },
   "lucas": {
    "type": "M"
   },
   "sonic": {
    "type": "M"
   },
   "king-dedede": {
    "type": "M"
   },
   "olimar": {
    "type": "M"
   },
   "alph": {
    "type": "M"
   },
   "lucario": {
    "type": "X",
    "male": 87.5,
    "default": "M"
   },
   "r-o-b": {
    "type": "N"
   },
   "toon-link": {
    "type": "M"
   },
   "wolf": {
    "type": "M"
   },
   "villager": {
    "type": "X",
    "male": 50.0,
    "default": "M",
    "images": {
     "F": "villager_female.png"
    }
   },
   "mega-man": {
    "type": "M"
   },
   "wii-fit-trainer": {
    "type": "X",
    "male": 50.0,
    "default": "F",
    "images": {
     "M": "wii fit trainer_male.png"
    }
   },
   "rosalina-and-luma": {
    "type": "F"
   },
   "little-mac": {
    "type": "M"
   },
   "greninja": {
    "type": "X",
    "male": 87.5,
    "default": "M"
   },
   "palutena": {
    "type": "F"
   },
   "pac-man": {
    "type": "M"
   },
   "robin": {
    "type": "X",
    "male": 50.0,
    "default": "M",
    "images": {
     "F": "robin_female.png"
    }
   },
   "shulk": {
    "type": "M"
   },
   "bowser-jr": {
    "type": "M"
   },
   "larry-koopa": {
    "type": "M"
   },
   "roy-koopa": {
    "type": "M"
   },
   "wendy-o-koopa": {
    "type": "F"
   },
   "iggy-koopa": {
    "type": "M"
   },
   "morton-koopa-jr": {
    "type": "M"
   },
   "lemmy-koopa": {
    "type": "M"
   },
   "ludwig-von-koopa": {
    "type": "M"
   },
   "duck-hunt": {
    "type": "M"
   },
   "ryu": {
    "type": "M"
   },
   "ken": {
    "type": "M"
   },
   "cloud": {
    "type": "M"
   },
   "corrin": {
    "type": "X",
    "male": 50.0,
    "default": "M",
    "images": {
     "F": "corrin_female.png"
    }
   },
   "bayonetta": {
    "type": "F"
   },
   "inkling": {
    "type": "X",
    "male": 50.0,
    "default": "F",
    "images": {
     "M": "inkling_male.png"
    }
   },
   "ridley": {
    "type": "M"
   },
   "simon": {
    "type": "M"
   },
   "richter": {
    "type": "M"
   },
   "king-k-rool": {
    "type": "M"
   },
   "isabelle": {
    "type": "F"
   },
   "incineroar": {
    "type": "M"
   },
   "piranha-plant": {
    "type": "N"
   },
   "joker": {
    "type": "M"
   },
   "hero-luminary": {
    "type": "M"
   },
   "hero-erdrick": {
    "type": "M"
   },
   "hero-solo": {
    "type": "M"
   },
   "hero-eight": {
    "type": "M"
   },
   "banjo-and-kazooie": {
    "type": "B"
   },
   "terry": {
    "type": "M"
   },
   "byleth": {
    "type": "X",
    "male": 50.0,
    "default": "M",
    "images": {
     "F": "byleth_female.png"
    }
   },
   "min-min": {
    "type": "F"
   },
   "steve": {
    "type": "M"
   },
   "alex": {
    "type": "F"
   },
   "zombie": {
    "type": "N"
   },
   "enderman": {
    "type": "N"
   },
   "sephiroth": {
    "type": "M"
   },
   "pyra": {
    "type": "F"
   },
   "mythra": {
    "type": "F"
   },
   "kazuya": {
    "type": "M"
   },
   "sora": {
    "type": "M"
   }
  };
  const FORM_IMAGES = {"grima": {"F": "grima_female.png"}, "enlightened-one": {"F": "enlightened-one_female.png"}};
  const SYMBOL = { M: '♂', F: '♀' };
  function info(id) { return GENDERS[id] || { type: 'N' }; }
  // the gender a fighter has when nothing is chosen (old saved fighters, fixed genders)
  function defaultGender(id) { const g = info(id); return g.type === 'X' ? g.default : g.type; }
  function choices(id) { return info(id).type === 'X' ? ['M', 'F'] : [defaultGender(id)]; }
  function roll(id, rng = Math.random) { const g = info(id); return g.type === 'X' ? (rng() * 100 < g.male ? 'M' : 'F') : g.type; }
  function normalize(id, gender) { return choices(id).includes(gender) ? gender : defaultGender(id); }
  // M and F can be infatuated by the opposite gender; genderless and "both" never are
  function opposite(a, b) { return (a === 'M' && b === 'F') || (a === 'F' && b === 'M'); }
  function image(id, gender, fallback) { const g = GENDERS[id]; const alt = (g && g.images && g.images[gender]) || (FORM_IMAGES[id] && FORM_IMAGES[id][gender]); return alt || fallback; }
  function label(id) { const g = info(id); return g.type === 'X' ? g.male + '% male / ' + (100 - g.male) + '% female' : { M: 'Male', F: 'Female', N: 'Genderless', B: 'Both (one of each)' }[g.type]; }
  const api = { GENDERS, FORM_IMAGES, SYMBOL, info, defaultGender, choices, roll, normalize, opposite, image, label };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.GENDER = api;
})();

"""Builds shared/fighters.json from the roster sheet data + expanded move pools.
Run: python3 tools/build_fighters.py   (validates every move against shared/moves.js)
"""
import json, re, subprocess, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from roster_base import R

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Final types chosen by the designer (sheet Type 1 / Type 2)
TYPES = {
 "Fox": ["Normal", "Steel"], "Ice Climbers": ["Ice", "Rock"], "Dr. Mario": ["Normal", "Poison"],
 "Mr. Game & Watch": ["Normal"], "Lucas": ["Psychic"], "Sonic": ["Electric", "Fighting"],
 "King Dedede": ["Normal", "Fairy"], "Olimar": ["Grass", "Bug"], "Alph": ["Water", "Bug"],
 "R.O.B.": ["Steel"], "Toon Link": ["Water", "Steel"], "Wolf": ["Dark", "Steel"],
 "Wii Fit Trainer": ["Normal", "Fighting"], "Pac-Man": ["Normal", "Ghost"], "Robin": ["Psychic", "Dark"],
 "Inkling": ["Poison"], "Ridley": ["Dragon", "Dark"], "Isabelle": ["Normal", "Grass"],
 "Banjo & Kazooie": ["Ground", "Flying"], "Byleth": ["Dragon", "Rock"], "Min Min": ["Fighting"],
 "Steve": ["Normal", "Ground"], "Alex": ["Normal", "Rock"],
}

# Extra moves each fighter can learn on top of its 4 signature (Smash-based) moves
EXTRA = {
 "Mario": "Flamethrower, Fire Blast, Overheat, Hydro Pump, Body Slam, Double-Edge, Drain Punch, Mach Punch, Brick Break, Bulk Up, Will-O-Wisp, Protect, Substitute",
 "Donkey Kong": "Hammer Arm, Close Combat, Drain Punch, Mach Punch, Body Slam, Double-Edge, Bulk Up, Wood Hammer, Seed Bomb, Stone Edge, Body Press, Slack Off, Protect",
 "Link": "Iron Head, Close Combat, Swords Dance, Aerial Ace, Leaf Blade, Magnet Bomb, Rock Slide, Flame Charge, Ice Spinner, Protect",
 "Samus": "Zap Cannon, Charge Beam, Thunder, Volt Switch, Blizzard, Flamethrower, Steel Beam, Iron Defense, Rapid Spin, Magnet Bomb, Protect, Substitute",
 "Dark Samus": "Sludge Bomb, Toxic, Toxic Spikes, Shadow Ball, Thunderbolt, Nasty Plot, Hex, Flash Cannon, Night Daze, Pain Split, Protect",
 "Yoshi": "Dragon Claw, Outrage, Dragon Dance, Seed Bomb, Leaf Blade, Earthquake, Stomping Tantrum, Bounce, Soft-Boiled, Headbutt, Protect",
 "Kirby": "Flamethrower, Ice Beam, Thunderbolt, Aura Sphere, Air Slash, Play Rough, Body Slam, Swords Dance, Rest, Recover, Protect",
 "Fox": "Flash Cannon, Iron Head, Bullet Punch, Aerial Ace, U-turn, Fake Out, Agility, Double-Edge, Reflect, Light Screen, Protect",
 "Pikachu": "Volt Tackle, Iron Tail, Thunder Punch, Volt Switch, Nuzzle, Thunder Wave, Surf, Agility, Fake Out, Extreme Speed, Play Rough, Nasty Plot, Protect",
 "Luigi": "Shadow Punch, Shadow Claw, Shadow Sneak, Hex, Will-O-Wisp, Poltergeist, Fire Punch, Thunder Punch, Drain Punch, Mach Punch, Pain Split, Substitute, Protect",
 "Ness": "Psyshock, Psybeam, Extrasensory, Fire Blast, Thunder, Meteor Beam, Calm Mind, Light Screen, Reflect, Hypnosis, Teleport, Protect",
 "Captain Falcon": "Fire Punch, Thunder Punch, Close Combat, Mach Punch, Drain Punch, Flare Blitz, Brick Break, Quick Attack, Double-Edge, Bulk Up, Protect",
 "Jigglypuff": "Body Slam, Double-Edge, Hyper Voice, Disarming Voice, Moonblast, Dazzling Gleam, Play Rough, Fire Blast, Ice Beam, Thunderbolt, Wish, Charm, Encore, Thunder Wave, Pain Split, Protect",
 "Peach": "Moonblast, Dazzling Gleam, Draining Kiss, Giga Drain, Energy Ball, Psychic, Leech Seed, Sleep Powder, Aromatherapy, Synthesis, Calm Mind, Charm, Light Screen, Protect",
 "Daisy": "Petal Blizzard, Leaf Blade, Power Whip, Spirit Break, Drain Punch, Mach Punch, Fake Out, Swords Dance, Leech Seed, Synthesis, Aromatherapy, Protect",
 "Bowser": "Fire Blast, Flare Blitz, Fire Fang, Fire Punch, Outrage, Draco Meteor, Dragon Dance, Dragon Tail, Earthquake, Crunch, Body Slam, Shell Smash, Iron Defense, Will-O-Wisp, Roar, Protect",
 "Ice Climbers": "Icicle Crash, Ice Punch, Freeze-Dry, Icy Wind, Hammer Arm, Rock Slide, Stone Edge, Rock Tomb, Stealth Rock, Snowscape, Swords Dance, Protect",
 "Sheik": "Night Slash, Sucker Punch, Shadow Sneak, High Jump Kick, Triple Kick, Bounce, Spikes, Taunt, Swords Dance, Teleport, Protect",
 "Zelda": "Psyshock, Future Sight, Dazzling Gleam, Shadow Ball, Fire Blast, Calm Mind, Light Screen, Moonlight, Magic Coat, Trick Room, Teleport, Protect",
 "Dr. Mario": "Sludge Bomb, Poison Jab, Toxic, Body Slam, Fire Punch, Drain Punch, Mach Punch, Hypnosis, Aromatherapy, Wish, Pain Split, Rapid Spin, Protect",
 "Pichu": "Volt Tackle, Thunder Punch, Nuzzle, Volt Switch, Thunder Wave, Iron Tail, Fake Out, Agility, Charm, Nasty Plot, Protect",
 "Falco": "Drill Peck, Dual Wingbeat, Double-Edge, U-turn, Quick Attack, Roost, Tailwind, Defog, Reflect, Protect",
 "Marth": "Swords Dance, Iron Head, Play Rough, Aqua Jet, Aerial Ace, Brick Break, Quick Attack, Protect",
 "Lucina": "Swords Dance, Iron Head, Smart Strike, Play Rough, Aqua Jet, Psycho Cut, Aerial Ace, Quick Attack, Protect",
 "Young Link": "Sacred Sword, Close Combat, Swords Dance, Seed Bomb, Bullet Seed, Aerial Ace, Magnet Bomb, Shadow Sneak, Sing, Protect",
 "Ganondorf": "Close Combat, Drain Punch, Knock Off, Sucker Punch, Night Slash, Dark Pulse, Fire Punch, Thunder Punch, Sacred Sword, Earthquake, Swords Dance, Nasty Plot, Taunt, Protect",
 "Mewtwo": "Psychic, Psyshock, Aura Sphere, Focus Blast, Ice Beam, Thunderbolt, Fire Blast, Calm Mind, Nasty Plot, Recover, Future Sight, Will-O-Wisp, Taunt, Protect",
 "Roy": "Sacred Sword, Smart Strike, Close Combat, Fire Fang, Swords Dance, Quick Attack, Will-O-Wisp, Protect",
 "Chrom": "Smart Strike, Swords Dance, Close Combat, Aerial Ace, Fire Punch, Bulk Up, Quick Attack, Protect",
 "Mr. Game & Watch": "Body Slam, Double-Edge, Hammer Arm, Fling, Quick Attack, Night Shade, Explosion, Encore, Substitute, Protect",
 "Meta Knight": "Swords Dance, Aerial Ace, Dual Wingbeat, Night Slash, Iron Head, Sacred Sword, X-Scissor, Shadow Sneak, Quick Attack, U-turn, Roost, Tailwind, Protect",
 "Pit": "Brave Bird, Dual Wingbeat, Aerial Ace, Air Slash, Spirit Break, Dazzling Gleam, Sacred Sword, Swords Dance, U-turn, Roost, Tailwind, Protect",
 "Dark Pit": "Dual Wingbeat, Aerial Ace, Fly, Air Slash, Knock Off, Sucker Punch, Dark Pulse, Swords Dance, U-turn, Roost, Protect",
 "Zero Suit Samus": "Thunder Punch, Zing Zap, Triple Kick, Close Combat, Thunderbolt, Volt Switch, Thunder Wave, U-turn, Agility, Protect",
 "Wario": "Poison Jab, Poison Fang, Sludge Bomb, Toxic, Knock Off, Sucker Punch, Body Slam, Double-Edge, Earthquake, Fake Out, Slack Off, Protect",
 "Snake": "Close Combat, Drain Punch, Mach Punch, Bullet Punch, Iron Head, Rock Blast, Spikes, Bulk Up, Taunt, U-turn, Protect",
 "Ike": "Close Combat, Fire Punch, Brick Break, Iron Head, Earthquake, Double-Edge, Swords Dance, Bulk Up, Protect",
 "Squirtle": "Water Pulse, Scald, Surf, Ice Beam, Aqua Jet, Aqua Tail, Bite, Rapid Spin, Shell Smash, Rain Dance, Protect",
 "Ivysaur": "Giga Drain, Energy Ball, Sludge Bomb, Power Whip, Seed Bomb, Earthquake, Leech Seed, Sleep Powder, Synthesis, Toxic, Sunny Day, Protect",
 "Charizard": "Fire Blast, Overheat, Air Slash, Hurricane, Dragon Pulse, Dragon Claw, Earthquake, Focus Blast, Solar Beam, Dragon Dance, Roost, Will-O-Wisp, Sunny Day, Protect",
 "Diddy Kong": "Seed Bomb, Wood Hammer, Drain Punch, Mach Punch, Knock Off, Bounce, Flame Charge, Spikes, Taunt, Protect",
 "Lucas": "Psyshock, Psybeam, Freeze-Dry, Fire Blast, Thunder, Meteor Beam, Dazzling Gleam, Light Screen, Reflect, Teleport, Protect",
 "Sonic": "Wild Charge, Thunder Punch, Volt Switch, Close Combat, Triple Kick, Rollout, Double-Edge, Bounce, U-turn, Quick Attack, Agility, Protect",
 "King Dedede": "Gigaton Hammer, Heavy Slam, Body Press, Play Rough, Spirit Break, Ice Hammer, Double-Edge, Earthquake, Spikes, Belly Drum, Protect",
 "Olimar": "Pin Missile, Seed Bomb, Leech Life, Poison Fang, Ice Fang, Body Slam, U-turn, Swords Dance, Synthesis, Sticky Web, Protect",
 "Alph": "Pin Missile, Leech Life, Aqua Jet, Waterfall, Fire Fang, Thunder Fang, Ice Fang, Poison Fang, Rock Slide, U-turn, Sticky Web, Rain Dance, Protect",
 "Lucario": "Close Combat, Meteor Mash, Bullet Punch, Drain Punch, Ice Punch, Crunch, Earthquake, Vacuum Wave, Focus Blast, Flash Cannon, Dark Pulse, Dragon Pulse, Swords Dance, Nasty Plot, Protect",
 "R.O.B.": "Iron Head, Body Press, Steel Beam, Zap Cannon, Charge Beam, Thunderbolt, Volt Switch, Iron Defense, Shift Gear, Light Screen, Reflect, Protect",
 "Toon Link": "Smart Strike, Iron Head, Brutal Swing, Aqua Jet, Waterfall, Flame Charge, Magnet Bomb, Swords Dance, Defog, Protect",
 "Wolf": "Crunch, Knock Off, Iron Head, Shadow Claw, Flash Cannon, Dark Pulse, Quick Attack, U-turn, Swords Dance, Taunt, Protect",
 "Villager": "Body Slam, Double-Edge, Bullet Seed, Energy Ball, Dig, Fling, Leech Seed, Synthesis, Protect",
 "Mega Man": "Charge Beam, Zap Cannon, Volt Switch, Ice Beam, Air Slash, Water Pulse, Steel Beam, Magnet Bomb, Rapid Spin, Bounce, Iron Defense, Protect",
 "Wii Fit Trainer": "Drain Punch, High Jump Kick, Body Slam, Facade, Vacuum Wave, Focus Blast, Bulk Up, Agility, Protect",
 "Rosalina & Luma": "Dazzling Gleam, Draining Kiss, Psyshock, Power Gem, Swift, Ice Beam, Future Sight, Calm Mind, Moonlight, Trick Room, Light Screen, Reflect, Protect",
 "Little Mac": "Close Combat, Drain Punch, Bullet Punch, Thunder Punch, Ice Punch, Fire Punch, Power-Up Punch, Brick Break, Fake Out, Counter, Agility, Detect",
 "Greninja": "Dark Pulse, Ice Beam, Surf, Extrasensory, Gunk Shot, Night Slash, U-turn, Spikes, Toxic Spikes, Taunt, Protect",
 "Palutena": "Moonblast, Draining Kiss, Hurricane, Psyshock, Calm Mind, Roost, Light Screen, Tailwind, Defog, Teleport, Magic Coat, Protect",
 "Pac-Man": "Body Slam, Double-Edge, Crunch, Shadow Claw, Shadow Sneak, Poltergeist, Rollout, Quick Attack, Fake Out, Hydro Pump, Protect",
 "Robin": "Psychic, Psyshock, Dark Pulse, Night Daze, Thunder, Fire Blast, Hurricane, Future Sight, Calm Mind, Nasty Plot, Protect",
 "Shulk": "Iron Head, Smart Strike, Night Slash, Zen Headbutt, Close Combat, Psychic, Swords Dance, Agility, Iron Defense, Counter, Protect",
 "Bowser Jr.": "Flamethrower, Fire Blast, Iron Head, Heavy Slam, Gyro Ball, Body Press, Explosion, Rapid Spin, Iron Defense, Will-O-Wisp, Protect",
 "Larry Koopa": "Fire Blast, Dark Pulse, Knock Off, Flame Charge, Nasty Plot, Will-O-Wisp, Thunder Wave, Taunt, Parting Shot, Protect",
 "Roy Koopa": "Close Combat, Drain Punch, Hammer Arm, Mach Punch, Knock Off, Iron Head, Body Press, Body Slam, Stone Edge, Bulk Up, Protect",
 "Wendy O. Koopa": "Scald, Surf, Hydro Pump, Moonblast, Draining Kiss, Aura Sphere, Dark Pulse, Dragon Pulse, Calm Mind, Charm, Taunt, Protect",
 "Iggy Koopa": "Psychic, Zen Headbutt, Fire Fang, Thunder Fang, Ice Fang, Gyro Ball, Thunder Wave, Agility, Trick Room, Protect",
 "Morton Koopa Jr.": "Rock Slide, Head Smash, High Horsepower, Stomping Tantrum, Hammer Arm, Body Press, Boomburst, Stealth Rock, Iron Defense, Rock Polish, Protect",
 "Lemmy Koopa": "Moonblast, Dazzling Gleam, Draining Kiss, Hyper Voice, Body Slam, Rollout, Gyro Ball, Fake Out, Encore, Charm, Protect",
 "Ludwig von Koopa": "Psyshock, Hyper Voice, Fire Blast, Overheat, Mystical Fire, Shadow Ball, Future Sight, Calm Mind, Nasty Plot, Trick Room, Protect",
 "Duck Hunt": "Hurricane, Brave Bird, Bite, Fake Out, Quick Attack, U-turn, Roost, Tailwind, Defog, Protect",
 "Ryu": "Close Combat, Drain Punch, Mach Punch, Vacuum Wave, Focus Blast, High Jump Kick, Fire Punch, Dynamic Punch, Bulk Up, Counter, Detect",
 "Ken": "Close Combat, Flare Blitz, Drain Punch, Mach Punch, High Jump Kick, Triple Kick, Vacuum Wave, Bulk Up, Detect",
 "Cloud": "Iron Head, Sacred Sword, Close Combat, Stone Edge, Double-Edge, Quick Attack, Bulk Up, Protect",
 "Corrin": "Dragon Dance, Outrage, Dragon Pulse, Draco Meteor, Dragon Tail, Surf, Hydro Pump, Liquidation, Aqua Jet, Iron Head, Rain Dance, Protect",
 "Bayonetta": "Knock Off, Dark Pulse, Moonblast, Play Rough, Triple Kick, High Jump Kick, Swords Dance, Nasty Plot, Taunt, Trick Room",
 "Inkling": "Sludge Wave, Poison Jab, Gunk Shot, Water Pulse, Toxic, Toxic Spikes, U-turn, Quick Attack, Rain Dance, Protect",
 "Ridley": "Crunch, Knock Off, Night Slash, Sucker Punch, Dragon Claw, Outrage, Dragon Tail, Dual Wingbeat, Fire Blast, Dark Pulse, Dragon Dance, Roost, Protect",
 "Simon": "Play Rough, Close Combat, Drain Punch, Brick Break, Brutal Swing, Aerial Ace, Will-O-Wisp, Bulk Up, Protect",
 "Richter": "Play Rough, Close Combat, Drain Punch, Aqua Tail, Brick Break, Aerial Ace, Will-O-Wisp, Bulk Up, Protect",
 "King K. Rool": "Waterfall, Aqua Tail, Knock Off, Sucker Punch, Anchor Shot, Earthquake, Body Slam, Body Press, Iron Head, Gyro Ball, Slack Off, Protect",
 "Isabelle": "Seed Bomb, Giga Drain, Energy Ball, Body Slam, Fling, Fake Out, Leech Seed, Synthesis, Aromatherapy, Wish, Charm, Protect",
 "Incineroar": "Flare Blitz, Fire Fang, Overheat, Knock Off, Fake Out, U-turn, Close Combat, Earthquake, Will-O-Wisp, Bulk Up, Parting Shot, Taunt, Protect",
 "Piranha Plant": "Giga Drain, Leaf Storm, Sludge Bomb, Gunk Shot, Poison Fang, Sucker Punch, Leech Seed, Sleep Powder, Toxic Spikes, Synthesis, Swords Dance, Protect",
 "Joker": "Night Slash, Sucker Punch, Shadow Claw, Shadow Sneak, Hex, Psychic, Ice Beam, Fire Blast, Thunderbolt, U-turn, Will-O-Wisp, Nasty Plot, Swords Dance, Taunt, Protect",
 "Hero (Luminary)": "Thunder, Flamethrower, Air Slash, Play Rough, Smart Strike, Hypnosis, Agility, Swords Dance, Iron Defense, Protect",
 "Hero (Erdrick)": "Thunderbolt, Flamethrower, Overheat, Flare Blitz, Air Slash, Hypnosis, Agility, Swords Dance, Recover, Protect",
 "Hero (Solo)": "Thunder, Flamethrower, Air Slash, Brave Bird, Hypnosis, Agility, Swords Dance, Recover, Tailwind, Protect",
 "Hero (Eight)": "Thunder, Draco Meteor, Dragon Claw, Flamethrower, Air Slash, Hypnosis, Agility, Dragon Dance, Recover, Iron Defense, Protect",
 "Banjo & Kazooie": "Earthquake, Dig, Stomping Tantrum, Dual Wingbeat, Fly, Body Slam, Quick Attack, Roost, Protect",
 "Terry": "Drain Punch, Power-Up Punch, Bulldoze, Stomping Tantrum, Rock Slide, Fake Out, Bulk Up, Counter, Detect",
 "Byleth": "Stone Edge, Rock Slide, Rock Tomb, Dragon Claw, Outrage, Iron Head, Swords Dance, Dragon Dance, Protect",
 "Min Min": "Close Combat, Drain Punch, Mach Punch, Ice Punch, Thunder Punch, Fire Punch, Triple Kick, Bulk Up, Protect",
 "Steve": "Earthquake, Rock Slide, Iron Head, Smart Strike, Double-Edge, Body Slam, Stealth Rock, Swords Dance, Protect",
 "Alex": "Stone Edge, Rock Tomb, Earthquake, Iron Head, Steel Roller, Double-Edge, Explosion, Stealth Rock, Swords Dance, Protect",
 "Zombie": "Shadow Sneak, Shadow Punch, Poltergeist, Gunk Shot, Poison Fang, Body Slam, Toxic, Pain Split, Protect",
 "Enderman": "Psycho Cut, Psychic Fangs, Night Slash, Sucker Punch, Dark Pulse, Trick, Taunt, Swords Dance, Protect",
 "Sephiroth": "Smart Strike, Iron Head, Sacred Sword, Sucker Punch, Knock Off, Dark Pulse, Flash Cannon, Shadow Sneak, Swords Dance, Nasty Plot, Protect",
 "Pyra": "Fire Blast, Flamethrower, Overheat, Iron Head, Sacred Sword, Will-O-Wisp, Sunny Day, Protect",
 "Mythra": "Thunder, Volt Switch, Moonblast, Play Rough, Psychic, Agility, Calm Mind, Nasty Plot, Light Screen, Reflect, Protect",
 "Kazuya": "Drain Punch, Mach Punch, High Jump Kick, Ice Punch, Knock Off, Sucker Punch, Fly, Taunt, Protect",
 "Sora": "Play Rough, Iron Head, Smart Strike, Dazzling Gleam, Flash Cannon, Aerial Ace, Swords Dance, Calm Mind, Recover, Reflect, Protect",
}

# Designer-text tweaks where the original wording referenced a mechanic this game doesn't model
ABILITY_TEXT_FIX = {
 "Heavyweight: Doubles its weight (Heavy Metal).": "Heavyweight: Heavy Slam, Body Press and Gigaton Hammer deal 1.5x damage (Heavy Metal).",
 "Friend Guard": "Friend Guard: Takes 25% less damage while at full HP (singles version of Friend Guard).",
}

STD_ABILITY_DESC = {
 "Static": "Contact may paralyze the attacker (30%).",
 "Lightning Rod": "Draws in Electric moves: immune to them and Sp. Atk rises 1 stage.",
 "Cute Charm": "Contact may infatuate the attacker (30%).",
 "Pressure": "Foes use 2 PP per move against it.",
 "Unnerve": "Foes can't eat Berries.",
 "Torrent": "Water moves deal 1.5x damage at 1/3 HP or less.",
 "Rain Dish": "Restores 1/16 HP each turn in rain.",
 "Overgrow": "Grass moves deal 1.5x damage at 1/3 HP or less.",
 "Chlorophyll": "Speed doubles in harsh sunlight.",
 "Blaze": "Fire moves deal 1.5x damage at 1/3 HP or less.",
 "Solar Power": "Sp. Atk 1.5x in sun, but loses 1/8 HP each turn.",
 "Inner Focus": "Can't flinch and ignores Intimidate.",
 "Justified": "Attack rises 1 stage when hit by a Dark move.",
 "Protean": "Changes to the type of the move it's about to use (once per switch-in).",
 "Intimidate": "Lowers the foe's Attack 1 stage on switch-in.",
}

IMAGE_OVERRIDE = {
 "Larry Koopa": "larry.png", "Roy Koopa": "roy_koopa.png", "Wendy O. Koopa": "wendy.png", "Iggy Koopa": "iggy.png",
 "Morton Koopa Jr.": "morton.png", "Lemmy Koopa": "lemmy.png", "Ludwig von Koopa": "ludwig.png",
 "Hero (Luminary)": "hero-eleven.png", "Hero (Erdrick)": "hero-erdrick.png", "Hero (Solo)": "hero-solo.png", "Hero (Eight)": "hero-eight.png",
}
IMG_DIR = os.path.join(ROOT, 'public', 'images')

def image_for(name):
    fn = IMAGE_OVERRIDE.get(name, name.lower() + '.png')
    return fn if os.path.exists(os.path.join(IMG_DIR, fn)) else None

def slug(n):
    return re.sub(r'[^a-z0-9]+', '-', n.lower().replace('&', 'and')).strip('-')

def split_ab(s):
    s = ABILITY_TEXT_FIX.get(s, s)
    if ':' in s:
        n, d = s.split(':', 1)
        return {"name": n.strip(), "desc": d.strip()}
    return {"name": s, "desc": STD_ABILITY_DESC.get(s, "")}

move_names = set(json.loads(subprocess.check_output(
    ['node', '-e', "console.log(JSON.stringify(Object.keys(require('./shared/moves.js'))))"], cwd=ROOT)))

out, errors = [], []
for i, r in enumerate(R, 1):
    name, series, t1, t2, alt, hp, atk, df, spa, spd, spe, moves, ab, ha, note = r
    types = TYPES.get(name, [t for t in (t1, t2) if t])
    sig = []
    for mv in moves:
        mn = mv.split(' (')[0]
        flav = mv[len(mn) + 2:-1] if '(' in mv else ''
        sig.append({"move": mn, "smash": flav})
    pool = [s["move"] for s in sig] + [x.strip() for x in EXTRA[name].split(',')]
    seen, learn = set(), []
    for mv in pool:
        if mv not in move_names:
            errors.append(f"{name}: unknown move {mv}")
        if mv not in seen:
            seen.add(mv); learn.append(mv)
    out.append({
        "num": i, "id": slug(name), "name": name, "series": series, "types": types,
        "stats": {"hp": hp, "atk": atk, "def": df, "spa": spa, "spd": spd, "spe": spe},
        "abilities": [split_ab(ab)], "hidden": split_ab(ha),
        "signature": sig, "learnset": learn, "notes": note, "image": image_for(name),
    })

if errors:
    print("\n".join(errors)); sys.exit(1)
json.dump(out, open(os.path.join(ROOT, 'shared', 'fighters.json'), 'w'), indent=1, ensure_ascii=False)
print(f"wrote {len(out)} fighters; avg pool {sum(len(f['learnset']) for f in out)/len(out):.1f} moves")

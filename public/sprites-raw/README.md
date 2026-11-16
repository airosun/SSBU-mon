# Hand-drawn sprites (raw)

Put your drawings here, then run `npm run sprites` (or ask Claude). Drawings that are **already transparent** are used exactly as drawn; drawings on a white background get the white removed. Either way the script crops each sprite and lines it up on the battlefield's ground line. The results go to `public/sprites/`, and the game uses them automatically for fighters on the battlefield. Everywhere else (Fighterdex, Battler Cards, menus) keeps the official art. Fighters without a drawing keep the official art in battle too.

**File names:** the fighter's ID plus `_front` or `_back`:

- `mario_front.png`, `mario_back.png`
- Alternate gender art: `robin_female_front.png`, `inkling_male_back.png`
- Final Smash forms use the form's ID: `giga-bowser_front.png`, `grima_female_back.png`

**Drawing tips**

- Save as **PNG**, either with a **transparent background** (preferred: nothing is removed, so white details anywhere stay) or a **pure white background**. JPG adds speckles around the edges.
- **Use the same canvas size for every drawing** (for example 512×512), and draw each fighter at the size it should be compared with the others. Big fighters like Bowser can fill the canvas, small ones like Pichu should be smaller. Sizes stay in proportion in the game.
- Leave a little margin. Nothing should touch the edge of the image.
- White backgrounds only: use a **closed outline**. White inside the fighter (eyes, teeth, a white body) stays white only if the outline seals it off from the background.
- The bottom of the drawing is treated as the fighter's feet.
- Front = facing the viewer (the opponent's side). Back = seen from behind (your side). If only a front drawing exists, it's mirrored for your side.

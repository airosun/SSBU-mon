# Hand-drawn sprites (raw)

Put your drawings here, then run `npm run sprites` (or ask Claude). Drawings that are **already transparent** are used exactly as drawn; drawings on a white background get the white removed. Either way the script crops each sprite and lines it up on the battlefield's ground line. The results go to `public/sprites/`, and the game uses them automatically for fighters on the battlefield. Everywhere else (Fighterdex, Battler Cards, menus) keeps the official art. Fighters without a drawing keep the official art in battle too.

**File names:** the fighter's ID plus `_front`:

- `mario_front.png`
- Alternate gender art: `robin_female_front.png`, `inkling_male_front.png`
- Final Smash forms use the form's ID: `giga-bowser_front.png`, `grima_female_front.png`

**Back views:** for now, your side of the battlefield always shows the front drawing mirrored, so only front drawings are needed. `_back` files are ignored in game (set `USE_DRAWN_BACKS` in `public/app.js` to use them again).

**Drawing tips**

- Save as **PNG**, either with a **transparent background** (preferred: nothing is removed, so white details anywhere stay) or a **pure white background**. JPG adds speckles around the edges.
- **Any image size works.** Each fighter is cropped to its outline and scaled to the same standard size in game, so the canvas size doesn't matter.
- Leave a little margin. Nothing should touch the edge of the image.
- White backgrounds only: use a **closed outline**. White inside the fighter (eyes, teeth, a white body) stays white only if the outline seals it off from the background.
- The bottom of the drawing is treated as the fighter's feet.
- Front = facing the viewer. It's shown as drawn on the opponent's side and mirrored on your side.

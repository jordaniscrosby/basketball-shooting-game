# public/art/ — authored texture overrides

Drop a PNG named after a slot here and the game uses it instead of the
procedural painting (loader: `src/scene/artAssets.ts`). Missing files fall
back silently — you can migrate one asset at a time. Overridden textures do
NOT line-boil (the ink outline hulls around the object still do).

**Ownership rule: files in this folder are hand-authored. Tooling and agents
never generate or overwrite them.**

| File | Replaces | Size (px) | Notes |
|---|---|---|---|
| `ball.png` | ball skin | 1024×512 | Equirect sphere wrap. Horizontal mid-line = equator; bold seams are what make backspin readable in flight. |
| `court-floor.png` | court floor + markings | 1067×2006 | 70 px/m, court is 15.24×28.65 m. **Top edge of the image = our hoop's end** (−z). Includes all court markings. |
| `backboard.png` | backboard face | 732×427 | 400 px/m, board is 1.829×1.067 m. Shooter's square bottom edge sits at rim height (≈0.148 m above board bottom). |
| `grass.png` | park lawn + trails | 1600×1600 | 20 px/m, 80×80 m plane centred on the court. Top edge = hoop end. The court floor is drawn on top of the centre. |
| `backdrop.png` | countryside backdrop | 4096×640 | Wraps 360° on an inward cylinder; the left/right edges meet BEHIND the player (u=0 at +z), image centre (u=0.5) is the view past the hoop. Horizontal px/m is ~0.65× vertical — circles must be drawn ~65% wide to look round in-game. Bottom should meet the lawn green, top should meet the sky color (`artTheme.palette.sky`). |

Sizes are the native procedural canvas sizes — other sizes work (any
power-of-two-ish PNG is fine), these just match 1:1.

Style reference: the vault's "Basketball Shooting Game/Art Direction" note —
flat cel fills, warm near-black ink `#2b1d16` (never true black), wobbly
hand-drawn lines. Preview any slot with the review presets:
`http://localhost:5173/?art=ball|hoop|wide|court|backdrop`.

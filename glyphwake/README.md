# Glyphwake

An original action RPG vertical slice rendered entirely in glyphs. The 3D world is drawn with Three.js and then turned into characters by a full-screen shader. Desktop and mobile both work.

```bash
# from the repo root
python3 -m http.server 8080
# open http://localhost:8080/glyphwake/
```

## What's in the slice (about 20–30 minutes)
- **The Vale of Ninefold**: a night meadow with wind-blown grass, a flowing river with a bridge, fireflies, campfires and torches, the village of Emberhold, the Hollow Ruins, Wispwood, and the Warden Circle.
- **Combat**: a 3-hit sword combo (the third hit breaks guards), a dodge roll with invulnerability frames, stamina and focus, hit-stop, screen shake, knockback, stagger and damage numbers.
- **Skills**: ◎ Whirl, » Lunge (invulnerable dash), ✶ Glyphburst (exploding rune-fire). There's also a healing flask that refills at campfires.
- **Enemies**: Straw Husks (tutorial), Thornwolves (packs that circle you, then lunge), Hollows (shield blocks and 2-hit combos), Lantern Wisps (ranged homing bolts that blink away).
- **Boss**: the Mire Warden. It telegraphs a ground slam, a cone sweep and thrown boulders, then adds a charge in phase 2, summons wisps, and enrages below 25% health.
- **The anvil**: a 3D ASCII blade preview you can turn and zoom. It has 7 metals (stat profiles, colors) and 9 runes (burn, chill, chain lightning, poison, crit, speed, ward, vigor, life steal) in 3 slots. Socketed rune glyphs orbit the blade, and the sword trail takes their color.
- **Progression**: XP and levels, loot drops (runes and ingots), a 9-step quest line, campfire rests (heal, refill the flask, respawn enemies), autosave.
- **Feel**: procedural WebAudio (wind, river, crickets, fire, combat drums, an ambient pad), bloom, a vignette, a low-health pulse, an ASCII minimap, an objective marker, and zone banners.

## Characters and animation
The knight, the Hollows and the Thornwolves are rigged, skinned models with hand-keyed animation clips (idle, walk, run, sword slash, roll, hit, death). They cross-fade by state, and hit frames line up with the clip's fastest swing.
- Models: **Quaternius** (CC0, public domain), via the `@netforge/asset-library-files` npm package. The knight and Hollows use the "Monarch" rig, and the wolves use the "Wolf" rig.
- `assets/models/*.glb` were decompressed (meshopt) and trimmed to the clips the game uses with glTF-Transform, so no WebAssembly decoder is needed.
- Armor is bolted to bones in code: helms on `Head`, cloaks on `Chest`, sword and shield in the fists. The helm, cloak and sword are built from lathed geometry in `js/knight.js`.
- Loader: Three.js r158 `GLTFLoader` and `SkeletonUtils` (MIT), converted to plain scripts in `js/vendor/`.

## Controls
| | Desktop | Touch |
|---|---|---|
| Move | WASD / arrows | left thumb (floating stick) |
| Attack / combo | left click (hold to chain), aim with the mouse | ⚔ (hold to chain, auto-aims) |
| Roll | Space / right click | ⟲ |
| Skills | 2 · 3 · 4 | ◎ » ✶ |
| Flask | Q | ♥ |
| Talk / rest / anvil | E | E |
| Menu | Esc / Tab | ≡ |

## How the glyph rendering works (`js/engine.js`)
1. Every material is a small custom shader. It writes its lit color to RGB and a **glyph-set id** to alpha (stone, water, fire, cloth, ruin letters …).
2. The ASCII pass splits the screen into character cells. For each cell it reads the id and the cell's average color, then picks a glyph from that set's brightness ramp in a generated font atlas. It draws outline glyphs (`| / - \`) where a set borders another, and tints the glyph with the scene color.
3. Grass blades are passed through as raw strokes, which gives the hand-drawn meadow look. Settings → *Pure ASCII grass* turns them into glyphs too.
4. A bright-pass, a blur and a composite add bloom, the vignette, grain and the damage flash.

Settings: glyph size (5–14 px), quality (resolution and grass density), volume, music, screen shake.

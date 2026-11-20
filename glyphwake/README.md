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

## World art
- Night sky dome with stars, drifting moon-lit clouds, a large cratered glyph moon, and a ring of distant mountains that the haze turns into silhouettes.
- The river is a dark mirror: when water is in view, the scene (characters, trees, sky, moon, clouds) is re-rendered from a mirrored camera at half resolution and sampled with ripple distortion, so reflections come out as glyphs too. Medium and High quality only.
- Earth between the grass: soil, moss, leaf litter and pebbles. Faint glyphs are thinned at random so dark ground doesn't read as a dot grid. Characters get a soft self-fill, dense glyph fills and bright silhouettes. Hunting enemies get a red ground ring, and names float above the hero and nearby enemies.
- Kenney Nature Kit models (CC0, via the same asset pack): tall pines, dark firs, oaks, autumn birches, logs, stumps, boulders, bushes and glowing Wispwood mushrooms. They're instanced per material and mixed with the procedural trees.
- Beyond the live grass patch the ground renders as a meadow-colored field, so low camera angles show grass out to the treeline. Embers rise from every campfire.

## Style notes from the reference clips
- **Grass, measured from the reference.** Straight dashes of flat color, about 1 px wide and 6–15 px long, the same size on screen near or far. Mostly upright, leaning up to about ±30°, with neighbors leaning together. Clumpy: about a third of the ground is covered, with small dark gaps. Sea green (`#2a7a5e`) on blue-black (`#0f191c`), with clusters of small grey-white specks. Drawn as screen-space line quads anchored to world roots; shadows only dim them slightly.
- **Characters and objects are glyphs.** Glyph cells scale with the camera: far out they're a dense texture that reads as shape, and close up they grow (up to 3.2×) until the letters (`@ # H o = /`) are readable.
- **Bright silver figures** against dark green, with soft shadows and little bloom.
- **Water is a still black mirror.** Characters, moon and clouds reflect in it, and empty water stays nearly black.
- **Sharp glyphs need pixels**, so PC renders supersampled (see Render resolution).

### Matching the reference (pass 2)
- **Flat lens** (Settings → Lens, default): a 17° telephoto camera that backs off to keep the same framing, so characters and straws are the same size across the screen. "Normal perspective" is still available.
- Grass straws point every way (mostly a bit upright), are brighter, and are drawn under every object, so characters stand on them. Pale specks are small rings.
- Light comes from the upper left, so moon shadows and each character's soft dithered contact shadow fall down-right.
- The moon only appears in the water through the real reflection, when the camera's angle and position line up with it.
- Silver plate with strong highlights over dark under-clothes. The riverbank is crisp. **Minimal HUD** (default) shows the bars, hotbar, minimap and quest only while fighting, hurt, after a quest update, or while Alt is held.

### Characters: shading over borders
Like the reference, characters aren't outlined in bright glyphs. A thin **black outline** (measured in pixels, so it stays thin at any zoom) separates them from the grass. Inside, they're shaded by the light: bright highlights on plate, darker cloth and the side away from the light. Rim light and self-fill are low, and dark areas keep a dim glyph so they never vanish.

## Environment kit (Blender)
`tools/blender/build_kit.py` models the props procedurally with Blender's Python API (`pip install bpy`, Blender 5.x), then exports `assets/models/kit.glb`: a gothic arch, broken pillars, four gravestone types, a crypt, a ringed stone cross, three gnarled dead trees (skin modifier), mossy rocks, a thatched hut, a well, a lantern post, a cart, barrels, crates and a fence, about 16k faces in total. Material names (`stone`, `wood`, `bark`, `thatch`, `iron`, `lantern`…) map to glyph sets in `js/world.js` (`KIT_MAT`). Rebuild with:
```
python tools/blender/build_kit.py glyphwake/assets/models/kit.glb
```
They're placed in the Hollow Ruins, a new graveyard (the Quiet Graves) between Emberhold and the ruins, Emberhold itself (huts, a well, lanterns with real lights, a cart, barrels, crates), Wispwood and across the vale.

## Knight armor (Blender)
`tools/blender/build_armor.py` models a full plate harness fitted to the Monarch rig's rest pose, using bone positions measured in-game. Pieces: a great helm with a cut visor slit, breathing holes, a brass cross-brace and rivets; a ridged breastplate; a gorget; a belt with a buckle; three-lame faulds; a tabard with a cross; layered three-lame pauldrons; rerebraces, couters with wings, flared vambraces and gauntlets; tassets, ridged cuisses, poleyns, greaves and segmented sabatons; and a folded cloak. That's 30 pieces and about 6.8k faces. Each object is named `arm__<Bone>__<piece>`, and `js/knight.js` attaches it to that bone so it follows every animation. It's worn with the Knight's Great Helm, Knight's Plate and any cloak; the other gear keeps the earlier pieces.
```
python tools/blender/build_armor.py glyphwake/assets/models/armor.glb
```

## Greymoss Keep (Blender)
`tools/blender/build_castle.py` models a ruined castle in mossy cobblestone: crenellated curtain walls with a gate and a collapsed breach, four round towers (one fallen), a two-story keep with a collapsed corner, a timber upper floor with a hole, an outside stair, rubble and a well. It's placed at `L.castle` with its own zone and a road from the meadow. `CASTLE_LAYOUT` in `js/world.js` (`buildCastle`, `W.levelAt`) mirrors the model's dimensions for colliders and walkable floors. Colliders carry a level (0 ground, 1 upper floor), and the player switches level on the stair and falls through the hole or off edges. Three Hollows guard the courtyard, and loot (Wyrmscale Coat, a gold ingot, a Thirst rune) waits upstairs; it's saved once taken.

## Zoom-aware shading
- `uDetail` (from the camera distance) fades fine surface texture and grime when zoomed out, so glyphs form clean shapes instead of dots.
- Structures use soft four-step lighting bands and a contact shadow where they meet the ground (sampled from the terrain height map), so each face keeps a consistent glyph family.

## Controls
| | Desktop | Touch |
|---|---|---|
| Move | WASD / arrows | left thumb (floating stick) |
| Attack / combo | left click (tap to chain), aim with the mouse | ⚔ (auto-aims) |
| Charged heavy | hold left click, release (or hold J) | hold ⚔ |
| Block / parry | hold right click (or V); tap it as the blow lands to parry | hold ⛉ |
| Swap weapon | X | ⇄ |
| Roll | Space | ⟲ |
| Abilities | 1 · 2 · 3 · 4 (B opens the Book of Glyphs) | four slot buttons · ✎ |
| Flask | Q | ♥ |
| Talk / rest / anvil | E | E |
| Camera zoom | mouse wheel | ≡ → Settings → Camera distance |
| Camera angle | hold middle mouse + drag (double-click middle to reset) | ≡ → Settings → Camera tilt |
| Control style | ≡ → Settings → Control style: **Free aim** (default: WASD/stick moves and the knight faces where he walks, the camera stays put, attacks go toward the crosshair cursor) or **Follow camera** | same |
| Menu | Esc / Tab | ≡ |

## Combat
- **Light combo**: tap attack for a 3-hit chain.
- **Charged heavy**: hold attack. While charging you can't be knocked out of it. A full charge flashes gold. Heavies deal more damage and fill the break bar faster.
- **Block**: hold right click. A block soaks 80% of the damage and costs stamina. If stamina runs out, your guard breaks.
- **Parry**: start the block within 0.2 s of the hit landing. The blow is negated, time slows, the attacker reels, and the next swing is a **riposte** (×3.5).
- **Perfect dodge**: roll through a blow at the last instant. Time slows, you get +30 stamina, and your next hit crits.
- **Break bar** `[####----]`: hits fill it. When it is full the enemy is **BROKEN** for about 3 s. Attack it then for a **finisher**: 50% of its life (8% on bosses), and you heal 12%.
- **Enemies take turns**: only 2 melee enemies commit to an attack at once (3 from level 10). The rest circle just out of reach, waiting.
- **Hollows** (and the Rime Knight and Crag Warlord, who fight like them) attack in strings: a single cut, a quick pair, a delayed pair, or a 3-cut combo with a late beat. Elites and bosses also have a fast flurry. Some windups are **feints** (`?`): the blade stops, they hop back, then cut fast. If you hold block too long, they **shield-bash** (`!`, unblockable, drains stamina).
- **Wolves** try to get behind you before lunging when they hunt as a pack, and sometimes fake a lunge and bound sideways instead.
- **Wisps** sometimes fire a fan of 3 bolts, more often when you are blocking.
- **Reading attacks**: Hollows (and the knight bosses) rise into a wind-up and **hold it still**, then the cut snaps through and the follow-through holds. A white **✦ glint** flashes on the blade 0.2 s before the hit: that is the parry window, so parry on the glint. Feints never glint. A red **! glint** means unblockable (shield bash), so dodge it. Wolves crouch and draw back before a lunge, and their eyes and a glint flare just before the bite. Every boss and caster follows the same rule: the Colossus and Mire Warden slam, sweep and charge (red), the Dusk Widow stabs and pounces (red) and spits webs (white), the Mire Hag and wisp casters cast (white), and the Rime Knight's ice slam and the Crag Warlord's leap are red. Each type lists its glints in `TYPES.<type>.glints` (state → hit time).
- **Hero movesets**: each weapon has its own key poses (`js/moves.js`, two-bone IK on the rig): sword forehand / backhand / overhead chop, greatsword sweeps and a jumping slam, spear thrusts (mid, low, high) and a spinning sweep, dagger jabs from alternating hands and an X-cut, and a bow draw and loose. Snappy timing: hold the anticipation, snap in about 5 frames, hold the follow-through. Swings leave glyph arcs (`/ | \ -`) in the blade's colour that flicker and shed characters.
- **Warnings** above enemies: yellow `◇` means you can block or parry it; red `!` means it's unblockable, so dodge.

## World map (M)
A live glyph chart drawn on top of a coloured relief. The relief gives each region its own ground tint, then lightens with elevation through rock to snow, with hillshading and contour lines.
- **V** cycles four styles: *Touring map*, *ASCII relief* (the whole map in the game's brightness ramp), *Explorer's ink* (parchment and sepia) and *Glyph mosaic* (colour tiles with shade blocks).
- Hover for names, types and distances. Click to drop your ✚ mark, which also shows on the compass and minimap. Wheel or + / − zooms around the cursor, and Space recentres on you.
- *Settings → Reveal the whole map* is on for now (testing). Turn it off for fog of war.

## World layout rules (from the placement audit)
- Points of interest sit at least 18 m from rivers, 16 m from roads and 140 m from boss arenas, and are kept apart from each other. On ground steeper than 2.4 m across their 10 m footprint, they slide up to 40 m to flatter ground (never crowding a neighbour). If no flatter ground is found, they become vistas.
- Boss arenas are flattened and kept clear of trees within 34 m. The Rime Knight fights on the frozen mere, and the Colossus is out in the open Barrens.
- Twin sites (Rimehold and the Abbey, Emberfall and Cinder Watch) share one ground height.

## Elemental reactions
Statuses come from runes (Ember burn, Frost chill, Venom poison, Storm shock), abilities (Rime Nova, Rime Lance, Chain Spark, Blight Cloud, Skyfall) and the river (standing in water makes a foe wet). Two of them together react. Each foe can react once per second, and the reaction's name floats up in its colour.

| Reaction | Recipe | Effect |
|---|---|---|
| **SHATTER** | heavy blow or finisher on a chilled foe | burst of 80% bonus damage, +40% break bar, the chill is spent |
| **BLIGHT** | fire meets poison (either order) | burst damage, and the poison spreads to every foe within 5 m |
| **CONDUCT** | shock on a chilled or wet foe | lightning leaps to up to 5 chilled or wet foes within 7 m |

Chain lightning (the Storm rune's arcs and Chain Spark) now leaves foes **shocked** for 3 s (violet sparks). Chilled foes shed pale-blue flakes.

## Weapons (two carried, X swaps)
Your forged metal and runes stay the same whichever weapon you hold. The weapon decides the moveset. You choose which two to carry at the top of the Book (B).

| Weapon | Light chain | Charged heavy | Block / parry window | Roll cost | Where |
|---|---|---|---|---|---|
| † Sword & Shield | 3 cuts | standard | 85% / 0.22 s | 24 | start |
| ‡ Greatsword | 3 huge arcs, big break | ×1.45 damage, longer reach | 60% / 0.16 s | 30 | Highlands trader |
| ↑ Spear | 4 long, narrow thrusts | long lunge | 70% / 0.20 s | 22 | Frostmere trader |
| ✕ Twin Daggers | 5-cut flurry, +15% crit | quick dash cut | 50% / 0.30 s | 15 | Duskwood trader |
| ) Glyph Bow | arrows at range | drawn piercing shot | 40% / 0.18 s | 20 | Salt Wastes trader |

Elite chests and dungeon top floors can also hold a weapon you don't have yet (30%).

## Abilities (Book of Glyphs, B)
There are 17 abilities. You slot any 4 of them on keys 1–4. In the Book, pick a slot, then click an ability; right-click a slot to empty it. Every ability costs focus and has a cooldown.

How you get them:

| Source | Abilities |
|---|---|
| Known from the start | Whirl ◎, Lunge », Glyphburst ✶ |
| Crafted at a fire or an anvil (runes + ingots + shards) | Ward Sigil ⛨ (2 Ward, Steel), Rime Nova ❄ (2 Frost, Silver), Chain Spark ϟ (2 Storm, Duskglass), Bloodglyph ♁ (2 Thirst, Gold) |
| Found (chests 18%, elite chests and dungeon top floors 50%, elite kills 25%) | Earthsplitter ▼, Inkstep ◌, Ink Chain ⌐ |
| Sold by traders | Rune Volley ⁂ (Hearthwick), War Cry ‼ (Highlands). Every trader also sells an "old glyph scroll" with a random unfound ability. |
| Boss drops | Colossus Quake ≋, Rime Lance ⇶, Blight Cloud ☁, Skyfall ⇓, Web Snare ⌗ (Dusk Widow) |

Ability definitions live in `js/abilities.js`. Each one has `start`, `tick` and `anim` hooks, so a new ability is one entry there.

## How the glyph rendering works (`js/engine.js`)
1. Every material is a small custom shader. It writes its lit color to RGB and a **glyph-set id** to alpha (stone, water, fire, cloth, ruin letters …).
2. The ASCII pass splits the screen into character cells. For each cell it reads the id and the cell's average color, then picks a glyph from that set's brightness ramp in a generated font atlas. It draws outline glyphs (`| / - \`) where a set borders another, and tints the glyph with the scene color.
3. Grass blades are passed through as raw strokes, which gives the hand-drawn meadow look. Settings → *Pure ASCII grass* turns them into glyphs too.
4. A bright-pass, a blur and a composite add bloom, the vignette, grain, a filmic tone curve with a cool-shadow/warm-highlight grade, and the damage flash.
5. Lighting: a moon shadow map (3×3 PCF, rendered around the player each frame: off on Low quality, 1024² on Medium, 2048² on High), Blinn-Phong highlights on metal, mail, bone and water, softer inverse-square falloff on torches and campfires, and a blue night haze for distance fog.
6. Grass: low-frequency color fields (lush, dry, blue-green), height variation, and wind gusts that roll across the meadow and catch the light.

Settings: separate glyph density for **characters**, **environment** and **water & sky** (3–14 px; the shader keeps three character grids and picks one per pixel), quality (resolution, grass density, shadows, reflections), camera distance and tilt, control style, volume, music, screen shake.

## Source look preset (PC, 1080p+)

Settings → Look → **Apply "Source look"** matches the reference clips: flat near-orthographic lens at about 55° tilt,
knight about 8% of screen height (zoom 110%), tiny glyphs (characters 4.5 px, environment 6.5 px, water/sky 5 px),
swirling stroke grass with a light ASCII layer, dim blue-grey `o 0 8` earth patches, darker nights, and a cool
silver key on characters ("Hero light") so they read first. Every value stays adjustable afterwards
(Hero light, Darkness, Grass swirl, ASCII on grass, Dark earth patches).

## The Pale Chapel

`tools/blender/build_chapel.py` → `assets/models/chapel.glb`: a gothic facade with a pointed-arch doorway,
lancet and rose windows, buttresses, a half-collapsed roofed nave and a wall torch, just north-east of the
Waking Stone (`L.chapel` in `js/world.js`). Walls, roofs and tree tops between the camera and the knight
dissolve (dithered) so he stays visible inside.

## Structures, trees and fire (source pass 2)

- **Letter walls**: stone, masonry, ruin and rock surfaces print dense mixed characters (`$Q&8wdbpq(/…`, three
  alphabets mixed per cell) on their own, larger glyph grid (Settings → Glyph density → Structures; 12 px in the
  Source look). Brightness drives colour more than the letter, like the reference.
- **Trees / ivy / moss**: drawn as combed fur strokes (same language as the grass) instead of glyphs, with dark
  gaps and the black edge kept. Animal fur (tex 9, set 9) uses the same idea with finer grizzled strokes.
- **Your own fires**: `F` (or ♨ on touch) spends 1 kindling to build a fire in front of you. It scorches the grass
  to ash dirt (`W.burn`), is a rest/save point while lit, keeps night hunters out of its light, and burns out
  after 8 minutes (max 3 at once; saved). Enemies drop kindling.

## Spawning

- *Enemies respawn when you rest* (souls-like) is now a setting, **off** by default.
- **Camps**: enemies are grouped by home; a fully cleared camp refills after 5 minutes, only while you are 60 m+ away.
- **Night hunts** (setting, on): after dark, packs of wolves or hollows spawn out of sight 34–44 m away and hunt
  you. They won't step into firelight, never spawn near fires or in Emberhold, and burn away at dawn.

## Vertical ruins: the Ivy Watch

`tools/blender/build_tower.py` → `assets/models/tower.glb`: an overgrown 13 m round watchtower near Thornwolf
Meadow. Walk into the door and you come out on the roof (floor 2 in `W.levelAt`); a chest waits there, the hatch
takes you back down, and the broken west parapet lets you drop off. Floors use `player.floor` (0 ground, 1 castle
upper floor, 2 tower roof); this is the pattern for the larger ruined castle later.

## Boss: the Dusk Widow

A giant furry spider in the Widow's Hollow (south-west), ringed by dead trees strung with glowing dotted webs.
Procedural body, 8 legs with 2-bone IK and a tetrapod gait. Three phases (segmented boss bar): leg stab and web
throw (slows you), then pounce, then web rain. Leave the hollow and she goes home and heals.

## Palette (current + idea for later)

- **Towers, ruins, castle, chapel, graves**: neutral greys (`0x88898c` / dark `0x5e5f62`), letters lift to a little
  white on lit faces (`white` 0.35 in the masonry set). Mortar and deep shade print blank, so stones read as clusters
  of letters (cobble cells 0.62 × 0.42 m with rain streaks).
- **Moss / ivy on stone**: green curly letters (`;~(){}?&%$S@`) on the structure grid.
- **Fire**: drawn as pure fire-coloured characters on an overlay (`drawFireGlyphs` in `js/game.js`), no cell
  backgrounds; flame cones are hidden.
- *Idea for later*: give every category its own small palette (stone greys, wood browns, foliage greens, water
  blues, enemies desaturated, heroes silver-white, loot gold) so things separate at a glance.

## The 8 km world (phase 1–3)

- **Streaming terrain**: height, grass, river/road distance and 6 region weights are computed per 128 m chunk on demand
  (`computeChunk` in `js/world.js`) and cached; the GPU gets a 1 km window (`W.dataWindow`). Chunks ahead of you are
  prefetched one per frame. River water follows the land (`RIVER_Y`).
- **Regions**: the Vale (centre) ringed by Frostmere (N), Highlands (NE), Ashen Barrens (SE), Salt Wastes (S),
  the Mire (SW) and Duskwood (NW), each with palette, ground, grass, terrain shape and scatter.
- **Villages**: Hearthwick, Rimehold, Cragmoor, Emberfall, Saltreach, Bogwater, Dimmering. Each has a fire, an anvil,
  a trader (shop for ◈ shards) and a bounty-giver (clear N camps in the region).
- **Points of interest**: one per 150 m cell (~1,950 in all), seeded and typed per region: camps, ruins with chests,
  chests, shrines (5-minute buffs), waystones (fast travel), vistas (reveal the map around), wandering traders,
  ambushes and elites. Enemies appear when you approach, vanish when you leave, and stay dead once cleared.
  Enemy level rises with distance from the Vale.
- **Settings**: render distance (Near / Normal / Far / Very far).

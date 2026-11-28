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

## Ore, mining and smelting
- **Veins** (a boulder studded with glowing crystals in the ore's colour) appear across the world, about one every 100 m. Press **E** to swing three times and take 1–3 ore. Veins grow back after 20 minutes.
- **Each region is where you go for something:**

| Region | Ores |
|---|---|
| Vale | iron, copper, coal |
| Highlands | iron, copper, silver, coal |
| Frostmere | rimesteel, silver |
| Ashen Barrens | coal, emberite |
| Salt Wastes | salt crystal, gold |
| Mire | bog-iron |
| Duskwood | duskglass shards |

  Rare **starfall** veins appear beyond 2.4 km.
- **Smelt at any anvil** (the Forge's new section): 2 ore + coal → 1 ingot. Steel needs 2 iron ore + 2 coal, rimesteel adds an iron ore, and saltglass and duskglass need no fuel. Traders sell coal (3 for 10 shards).
- **New metals with built-in traits:** **Emberite** (hits burn), **Rimesteel** (hits chill), **Saltglass** (+12% crit, +4% speed), **Bog-iron** (hits poison).

## Forging each weapon
Every weapon you own keeps its **own** metal, runes and upgrade level. The forge works on the weapon in your hand. Switch between your two carried weapons under *On the anvil*.

**Upgrades** (+8% damage each):

| Upgrade | Cost | Also |
|---|---|---|
| → +1 | 1 iron ingot + 40 ◈ | |
| → +2 | 2 iron + 80 ◈ | |
| → +3 | 3 iron + 140 ◈ | opens a **4th rune socket** |
| → +4 | 4 iron + 220 ◈ + 1 steel | |
| → +5 | 5 iron + 320 ◈ + 1 steel | |

Names show the level, for example *Searing Steel Blade +3*.

## Skill tree (Book → Skills)
One point per level; reset is free while testing. Deeper rows need 2, 4 or 6 points already spent in that branch.
- **Blade:** Honed Edge (+6% damage per rank), Flow (cheaper light attacks), Quick Draw (faster charge), Momentum (deeper combo hits hit harder), Sunder (+break), Keen Eye (+crit), Executioner (finishers +50% and heal more), Shatterpoint (reactions +40%).
- **Guard:** Steady Hand (+0.04 s parry window per rank), Vigor (+15 health), Iron Wall (cheaper blocks), Light Feet (cheaper rolls), Riposte Master (×4.5 riposte and +20 stamina), Afterimage (wider perfect-dodge window), Deep Flask (+1 flask), Second Wind (survive a killing blow at 30% health, every 2 minutes).
- **Glyph:** Wellspring (+focus regeneration), Thrift (cheaper abilities), Quickened Ink (shorter cooldowns), Ink Thirst (+focus per hit), Attunement (longer rune effects), Potency (+ability damage), Echo (15% instant cooldown refresh), Fusion (see below).

**Fusion:** a parry, a perfect dodge or a finisher charges a fusion for 1.8 s (`⊕ FUSE`, and the ability slots glow). The next ability you cast costs no focus, hits 50% harder and carries an element: **parry → fire** (burn), **perfect dodge → frost** (chill), **finisher → storm** (shock). These feed the reactions. For example, a perfect dodge into Whirl chills the foe, and Whirl's own heavy second spin then Shatters it.

## The starting Vale
The hand-made Vale is laid out at `VS` = 2.2× its original spacing (`js/world.js`). Structures keep their size; the land between them grows, so the tutorial has room to breathe. From Emberhold:

| Site | Distance |
|---|---|
| Waking Stone | ~106 m |
| Hollow Ruins | ~161 m |
| Wispwood | ~168 m |
| Thornwolf Meadow (across the river) | ~195 m |
| Greymoss Keep | ~241 m |
| Warden Circle | ~304 m |

Change `VS` to stretch or shrink it: sites, river, paths, zones, the forest rise and all scatter follow.

## World scale and buildings
- The **world** is 24 km across (`WS` = 3 in `js/world.js`). The six region hubs ring the Vale at about 7.8 km, and enemy levels rise one per 840 m, so each region keeps its difficulty.
- **Wilderness sites** sit on a 225 m grid (`POI_CELL` = 75·`WS`), so there are as many as before over 2.25× the land: roughly one find every 45–60 s on foot. Sites on slopes slide up to 55 m to flatter ground and keep 120 m from their neighbours.
- **Travel:** the horse runs at 18 m/s off road and 24 m/s on roads (1.4× faster); on foot, roads give a 12% brisker step.
- **The Vale as a tutorial:** one of each thing the world holds is placed along its roads and river, the easy ones near Emberhold and the harder ones (ambush, elite, cave) toward the edges. That's a shrine, a waystone, a chest, an ore vein, a camp, a vista with a buried cache, a trader, an ambush, an elite and a cave, plus one of each puzzle: rune vault, lantern shrine, pressure crypt and echo bells. Each is nudged to flat, dry ground at least 85 m from the others (`VALE_PLAN` in `js/world.js`).
- **One look everywhere:** the Vale's rocks, dead trees, ruin pillars, standing stones (the Waking Stone and Warden Circle), campfire stones and torch footings are built from the kit. Every village anvil matches Emberhold's, and the Pale Chapel has a churchyard with lanterns and graves.
- **Enterable buildings** (Greymoss Keep, the Pale Chapel, the Ivy Watch, Rimeglass Abbey, Cinder Watch and Castle Dunmaer's gate) are drawn at `BS` = 1.6× with their colliders, doors, roofs and upper floors. Interiors come later.
- **Hollow Ruins** is 1.7× wider, with five walls, 20 pillars, six arches and 12 Hollows. **Points of interest** are bigger too: camps have 4 huts and a cart with 4–6 enemies, ruins have wider rings, and caves sit in a big rock mound with a 1.45× arch.
- **Three tombs** surround Hollow Ruins: *the Nameless*, *the Scribe's* (2 floors) and *the Sexton's*. Walk to the lanterns and press **E** to go underground. A new quest step, **Beneath the Scriptorium**, sends you to find **the Scribe's Seal** on the Scribe's Tomb's second floor, which introduces dungeons early.

## Weapons in depth: metal traits, mastery, legendaries
- **Metal traits:** every metal behaves differently in each weapon form. Examples: emberite in a greatsword sets nearby foes burning on heavy hits; rimesteel in daggers makes crits chill; saltglass in a bow adds +25% damage on shots past 12 m; bog-iron in a greatsword leaves a poison cloud. The forge panel and the metal tooltips show the trait for the weapon on the anvil.
- **Mastery:** each weapon form levels I–V from the foes it kills (+3% damage per level), with a perk at III and a stronger one at V. The Book shows each form's mastery.

  | Form | III | V |
  |---|---|---|
  | Sword | cheaper blocks | ripostes +30% |
  | Greatsword | no stagger mid-heavy | heavy hits throw foes back |
  | Spear | +0.4 m reach | closing thrust +20% |
  | Daggers | +10% speed | crits poison |
  | Bow | charged shots +25% | +8% crit |
- **Legendary metals:** each guardian drops one, forgeable into any weapon. **Cinderheart** (Ash Colossus): kills burst into flame. **Rimefang** (Rime Knight): a perfect dodge freezes foes around you. **Mirethorn** (Mire Hag): poisoned foes heal you as they die. **Cragcrown** (Crag Warlord): finishers send out a shockwave.

## Dungeons

Every cave, tomb and castle floor is built from one of seven layouts, with a new seed per floor so rooms, corridors and dressing change each time:

- **Crypt Halls**: burial niches with sarcophagi; some of the dead sleep until you walk close.
- **The Flooded Cistern**: a teal water channel down the middle, crossed by bridges between heavy pillars.
- **Pillared halls**: wide rooms on a column grid.
- **The Sunken Chapel**: pews, an altar and pillar rows.
- **The Warren**: rounded cave chambers with stalagmites and pools.
- **The Old Mine**: timber frames, carts and ore veins you can mine.
- **The Descent**: stairs that drop floor by floor between rooms lit by braziers.

The structure follows the classic delve: the way to the reward room is barred by a portcullis whose lever sits in a side room, there are pressure plates in the corridors, and from the reward room a lane loops back to a barred gate by the entrance: from the lane side you lift the bar yourself, from the entrance side it stays shut. The exit is a lit stairway in the entry room; underground the compass shows the exit (⇧) and the next floor's stairs (⇡) instead of the world's markers, and once the last chest is taken the arrow points the way out. Each layout is checked when built so the gates can't be walked around. Each layout also has its own cold light (crypt blue, cistern teal, mine amber) under warm torches.

## Settings worth knowing
- **Alt** holds the HUD and minimap up for 8 s after you let go.
- **Minimap turns with your heading** and **Minimap always visible** are in Settings.

## Villages, interiors and discovery
- **Villages are paved:** Emberhold and every hub village have a cobbled square instead of grass.
- **Interiors, each with a small story:**
  - **The Pale Chapel:** pews, a lectern, lamp stands and an altar. Light the four altar candles and the reliquary behind it opens.
  - **Greymoss Keep:** a hall with a long table, a hearth, barrels, a weapon rack and the steward's strongbox; the steward's room upstairs with his bed, a banner and his ledger; practice posts and a firewood cart in the yard. A **Hollow Captain** among the guards carries the strongbox key.
  - **Rimeglass Abbey:** a frozen nave with an ice altar that only answers at night.
  - **The Ivy Watch roof:** a lookout's camp and a spyglass that reveals the land around and names the three nearest unfound places.
- **Discovery XP:** a little XP the first time you come upon any place.
- **Landmarks:** seven one-of-a-kind places, each with a banner and a big XP reward:
  - the Fallen Giant (Highlands);
  - the Sunken Belltower (Mire), whose drowned bell you can ring;
  - the Hermit's Hut (Duskwood), a trader;
  - the Elder Tree, whose blessing gives +15 maximum health for good;
  - the Broken Colossus (Barrens);
  - the Stranded Ship (Salt Wastes);
  - the Frozen Gate (Frostmere).
- **Moonwells:** three of them, which only wake at night. Drink once a night to heal fully and refill your flasks; the first drink also gives a rune.
- **The Journal (Book → Journal):** places found per region, every landmark found or still missing, and the state of each interior story. The world map shows **found x / y** under each region's name.

## Roads, rivers and lakes
- **Three kinds of road.** The **King's roads** run from the Vale and Hearthwick to every region hub: wide grey cobbles, with stone bridges. The **roads** are packed dirt with timber bridges; they include the ring road between the hubs and the castle road up to Dunmaer. **Paths** are the Vale's footpaths, the trails from each hub to its guardian's grounds and to the water, and worn trails from the roads out to nearby camps, ruins, caves, shrines and puzzles. Roads are drawn as glyph-textured strips on the ground, grass wears away on them, and long roads bend around steep ground and lakes.
- **Rivers run downhill.** The Glass River crosses the world west to east. Four tributaries feed it from the high ground: **the Rimerun** (from the northern mountains, past Frostmere), **Cragwater** (out of the Highlands), **the Dimwater** (through Duskwood) and **Cinderbrook** (across the Ashen Barrens). **The Sallow** runs down from the southern rim into **Bogwater Mere** in the Mire. Water levels only ever fall downstream, and tributaries meet the Glass River at its level.
- **Twelve lakes and ponds**, from Bogwater Mere and the High Tarn to small springs and oases in the Salt Wastes and a millpond by Hearthwick.
- **Bridges** stand wherever a road or trail crosses a river; you walk over them instead of wading.
- **Every road ends somewhere:** road and trail ends snap to a village square, a guardian's grounds, a lake shore or a gate, and roads run into the cobbled squares through openings in the village fences. Halfway along each long King's road stands a **ruined waystation**: a cobbled plaza, broken pillars and arches, and a waystone.
- **The world map** draws the road kinds differently, every river at its width, the lakes and bridges, and names the waters as you zoom in.

## Puzzles that hide loot
About one wilderness site in ten is a puzzle (a purple **?** on the map). Each guards an elite-quality cache, gives XP when solved, and stays solved in your save.
- **Rune vault:** read the tablet (it shows four runes, e.g. `◇ ✕ △ ○`), then touch the rune stones in that order. A wrong stone resets the sequence.
- **Lantern shrine:** three lanterns cast glyph beams. Press **E** to turn one 90°. When all three beams turn gold and meet on the shrine, the chest unseals.
- **Pressure crypt:** the worn mosaic shows four safe slabs on a 3×3 grid, with the crypt side at the top. Step only on those. A wrong slab fires spikes (12 damage) and resets the grid.
- **Echo bells:** the humming stone sings a four-note melody. Strike the bells in the same order. A sour note resets.
- **Buried caches:** some vistas hide one. After **Look out**, a ✕ waypoint marks three stones over loose earth. Press **E** three times to dig it up.

## The main quest
- **Act I, the Vale:** the Waking Stone, Mara, Hesk's anvil, the Thornwolves, the Hollow Ruins, the Scribe's Tomb, Wispwood, then the Mire Warden in the stone circle.
- **Act II, the unwritten lands:**
  1. **The Starfall Blade:** smelt the Warden's starfall and forge it into any weapon.
  2. **The Crossroads:** walk to Hearthwick, where Oswin the Waywarden tells you about the four guardians.
  3. **Four Seals of the Unwritten:** defeat the Ash Colossus, the Rime Knight, the Mire Hag and the Crag Warlord. The marker points to the nearest one still standing.
  4. **The Crown of Dunmaer:** climb Castle Dunmaer. The Crowned Guardian waits in the last hall of the Crown Tower.
  5. **The Ninefold, Rewritten:** free roam.

## Region levels and danger
- Each region's map label shows its level band (the 5th–95th percentile of its land): the Vale is lv 2–6, the outer regions about lv 6–18, rising toward the world's edge. Crossing into a region shows its band in the banner.
- The ring around every place on the map, and its level, are coloured against your level: **green** easy, **gold** fair (+1–2), **orange** hard (+3–4), **red** deadly (+5). A key sits under the map's compass rose.

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

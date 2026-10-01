# GameHub: the games from the ads

A mobile-first game built around the "fake ad" game formats people keep seeing in ads, made actually playable.
The hub is a **3D town** you build up. Every mini-game feeds it with resources, and the town powers up the mini-games in return.

## How it fits together

```
 Kingdom Def. ► 🪙, 🪖, 🥩 loot + 📦 ─┐  (and your town powers its defenses)
 Merge Army ──► 🪙, 🪖 + 📦 chests ───┤
 Hero Tower ──► 🪙 Gold + 📦 chests ─┤
 Pin Rescue ──► 🪙 Gold + 📦 chests ─┤
 Gate Rush ───► 🪖 Troops, 🪙, 📦 boss chests ┼──► TOWN: upgrade buildings ──► bonuses in the mini-games
 Frost Survival ► 🥩 Food, 📦 on expand ┘       Kitchen/Vault produce 🥩/🪙 over time
                                             chests drop power-up cards: 💡 🛡️ 🔥
```

| Mode | Inspired by | How it plays |
|---|---|---|
| 👑 **Kingdom Defense** (3D, endless) | Kingshot hero-defense ads | Played on **your own town**: its buildings stand around the Town Hall at their current levels. Walk your knight with the joystick; he slashes nearby enemies and body-blocks the red horde marching down the road. A red edge marker points to the horde while it's off-screen. Enemies drop coins: pick them up and spend them on dashed build pads along the road (archer towers, cannons, mage towers, soldiers, hero upgrades, hall repair). Endless waves get tougher, with a Warlord boss every 5 waves. Your town decides the defenses: Walls add Town Hall HP, the Forge unlocks cannons and adds damage, the Mage Tower unlocks mage towers, the Barracks unlocks soldiers, the Hunter's Lodge speeds up archers, the Kitchen heals the hero, the Vault gives starting coins, and the Town Hall caps tower level. Rewards: gold, troops, food loot and chests. |
| 🏕️ **Frost Survival** (3D, continuous) | Whiteout Survival / Frozen City idle-camp ads | Move with the joystick (or WASD). Outside the fence your axes spin and cut down wolves and polar bears, and their meat stacks on your back. Drop it at the grill; customers buy the steaks at the counter. Every steak sold also ships 🥩 1 food to the town. Spend camp cash on build pads: cashier, **hunters** (they hunt and deliver meat for you), crossbow towers, axes, backpack, faster grill. **Expand camp** grows the fence (up to tier 5), unlocks more pads, brings stronger beasts and higher prices, and sends a chest to town. With hunters hired the camp keeps earning **offline** (2h cap, +1h per Hunter's Lodge level). |
| ⚔️ **Merge Army** (3D, 2048) | Top War merge ads + 2048 | Your army stands on a 4×4 board. **Swipe** and every soldier slides that way; two equal soldiers merge into one of double value (2 → 4 → … → 2048), and a new recruit appears after every swipe. Classes alternate as they grow (Recruit, Archer, Knight, Ranger…), and each merge makes a unit 2.4× stronger, so big tiles beat piles of small ones. Each level gives a set number of swipes; then press **FIGHT** for an automatic 3D battle. **Regroup** (3 swipes) lines the army up biggest-to-smallest when the board jams. The army carries over; a lost battle gives bonus swipes, and an ad gives +5 swipes. Town: Barracks +HP, Forge +damage, Vault +swipes per level. |
| 🗼 **Hero Tower** (3D) | Hero Wars / Evony "power number" tower ads | Your hero has a power number. Tap a room to fight what's inside: weaker monsters are absorbed, stronger ones kill you. Potions add power, and from level 3 a **×2 potion** has to be saved for the right moment, because the boss on top only falls to a well-ordered climb. Levels are generated from a solution, so every level is solvable; "always take the smallest" fails from level 3. Town: each Town Hall level adds starting power. Hints and level skips via cards or ads. |
| 🪖 **Gate Rush** (3D, endless) | Last War / Kingshot "math gate" ads | Drag to steer your commander at the front of the army; the soldiers follow him and **his lane alone decides the gate** (the chosen gate lights up, the count rides above his head). The army fires automatically. Enemy waves charge down the road: grunts, fast runners, armored elites and brutes, plus an **Ice Giant boss every ~600 m** (the first at 450 m) that crushes your squad until you kill it. Pick the right gates, or **shoot red gates to turn them blue**. Shoot barrels open for soldiers, fire rate or damage. There are no levels: enemy toughness, wave size and speed rise the further you run. Rewards scale with distance, kills and bosses (a boss run earns a chest), and your best distance is saved. |
| 📌 **Pin Rescue** (3D) | Hero Wars / Evony "pull the pin" ads | Tap the pins in the right order: lava kills, water turns lava to stone, orcs must die, and the gold must reach the knight. It's rendered in 3D on top of the same 2D particle physics, so every level stays verified solvable. |

### Town buildings
| Building | Effect |
|---|---|
| 🏰 Town Hall | Level cap for every other building |
| ⚔️ Barracks | Gate Rush: +3 starting soldiers per level · Kingdom Defense: unlocks soldiers |
| 🔨 Forge | +20% damage per level in Frost Survival and Kingdom Defense · unlocks cannons |
| 🏹 Hunter's Lodge | Frost Survival: hunters +25% faster, +1h offline time per level |
| 🍲 Kitchen | Produces food per hour; camp steaks sell for +10% per level |
| 💰 Vault | Produces gold per hour; +10% gold from mini-games per level |
| 🔮 Mage Tower | Chests unlock 15% faster per level · Kingdom Defense: unlocks mage towers |
| 🧱 Walls | Frost Survival: +25 max health · Kingdom Defense: +40 Town Hall HP per level |

### Chests and power-ups
Winning a Pin Rescue, Hero Tower or Merge Army level, beating a boss in Gate Rush, holding 3+ waves in Kingdom Defense, or expanding the camp drops a chest into one of 4 slots, Clash Royale style. One chest unlocks at a time (Wooden 30s, Silver 2m, Golden 5m in this test build; tune `CHESTS` in `js/town.js` to hours for release). Chests give gold, food, troops, sometimes gems, and power-up cards:
💡 **Hint** (Pin Rescue), 🛡️ **Reinforcements** +10 soldiers (Gate Rush), 🔥 **Hot Grill** ×2 cash for 90s (Frost Survival).

## Test it

The game is plain HTML/CSS/JS with no build step. Frost Survival uses Three.js (WebGL), which is included in `js/vendor/`.

```bash
# from the repo root
python3 -m http.server 8080
# desktop: http://localhost:8080
# phone (same Wi-Fi): http://<your-computer-ip>:8080
```

Opening `index.html` directly also works. On a phone, use **Add to Home Screen** to get fullscreen play (there's a web manifest).
In desktop Chrome, open DevTools → device toolbar (Ctrl+Shift+M) to emulate a phone.

Debug helpers in the console: `GH.launch('pin', 5)` jumps to any level. `window.__game` is the running game.

## Project layout

```
index.html              hub + game screen markup, banner ad slot
css/style.css           all UI styling (safe-area aware, portrait)
js/core.js              save data (localStorage), sfx synth, canvas Stage (360x640 letterboxed), modal/toast UI
js/monetization.js      ads + IAP + analytics interface (mocked in the browser)
js/town.js              town buildings, bonuses, production, chests, 3D town view
js/kit3d.js             shared Three.js helpers (layer, renderer, fit, primitives)
js/main.js              hub (town, chests, modes, shop), game launcher/loop, win/lose flows, daily reward
js/games/pinrescue.js   particle-physics pin puzzle, 3D view
js/games/gaterush.js    endless 3D runner: shooting squad, gates, waves, bosses
js/games/kingdefense.js Kingshot-style hero defense on your own town
js/games/mergearmy.js   2048-style merge board + auto battle
js/games/herotower.js   power-number tower puzzle (level generator + 3D view)
js/games/frostsurvival.js 3D idle-arcade camp (Three.js)
js/vendor/three.min.js  Three.js r158 (MIT), vendored so it works offline and inside Capacitor
```

### Adding a new game mode
Create `js/games/<name>.js` that registers `GH.Games.<id> = { id, name, tagline, icon, colors, create(opts) }`.
`create` returns an object with `update(dt)`, `draw(ctx)`, and optionally `onDown/onMove/onUp(point)`, `revive()`, `destroy()`.
When a level ends, call `opts.api.win({coins, troops, text})` or `opts.api.lose({reason, canRevive})`. Endless modes call `opts.api.runOver({title, stats, rewards, chest, canRevive})`. The shell handles rewards, chests, ads and progression. 3D modes can build on `GH.K3` (`js/kit3d.js`).
Then add the id to `ORDER` in `main.js`, add a `levels.<id>` default in `core.js`, and include the script in `index.html`.

## Monetization hooks (already placed)

Every game only calls `Monetization.*`, never an ad SDK directly. Swapping the mock for real SDKs is a one-file change.

| Placement | Type | Where |
|---|---|---|
| Banner 320×50 | Banner | Bottom of every screen. Hidden with *Remove Ads*. |
| Every 3rd finished level | Interstitial | After win/lose. Frequency-capped, skipped after a rewarded ad and with *Remove Ads*. |
| Gold ×3 | Rewarded | Victory screen |
| Open chest now / halve timer | Rewarded or gems | Chest slots |
| Offline earnings ×2 | Rewarded | Frost Survival welcome-back screen |
| Revive / Rewards ×2 | Rewarded, or 10 💎 | Gate Rush run-over screen |
| Hint / Skip level | Rewarded (or a Hint card) | Pin Rescue |
| 2× cash for 90s | Rewarded (or a Hot Grill card) | Frost Survival HUD button |
| Daily ×2, Free supplies | Rewarded | Hub / Shop |
| Remove Ads, Starter Pack, gem packs | IAP | Shop |

Tuning lives in `Monetization.config` (interstitial frequency, cooldowns) and in the `products` list.

## Turning it into a real phone game

### Recommended: Capacitor (one codebase → iOS + Android)
[Capacitor](https://capacitorjs.com) wraps this exact web folder in a native app and gives you native plugins for ads and purchases.

```bash
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init GameHub com.yourstudio.gamehub --web-dir .
# (better: move the game into a www/ folder and use --web-dir www)
npx cap add android
npx cap add ios          # needs a Mac + Xcode
npx cap sync
npx cap open android     # build / run from Android Studio
```

Useful plugins:
- **Ads:** `@capacitor-community/admob` (AdMob). For higher fill and mediation, use AppLovin MAX or ironSource LevelPlay.
  Put the real calls inside `Monetization.showRewarded / maybeInterstitial / refreshBanner`. The test ad unit IDs are already in `config.admob`.
- **Purchases:** RevenueCat (`@revenuecat/purchases-capacitor`) handles App Store and Play Billing, receipts and restore. Map the `products` ids to store product ids.
- **Analytics:** Firebase (`@capacitor-firebase/analytics`). Plug it into `Monetization.track`, which already fires `level_start`, `level_complete`, `level_fail`, `rewarded_*`, `iap_*`.
- **Also useful:** `@capacitor/haptics` (replace `navigator.vibrate`), `@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/preferences` (sturdier save than localStorage).

Before launch:
1. Lock orientation to portrait (Android manifest / Xcode target).
2. Replace the SVG icon with a 1024×1024 PNG and run `npx @capacitor/assets generate`.
3. Add a privacy policy, the Google UMP consent form (GDPR) and the iOS ATT prompt (required for personalized ads).
4. Move the save to cloud storage (Play Games / Game Center, or Firebase) so progress survives reinstalls.
5. Ship with Play Console **internal testing** or **TestFlight** first.

### Alternatives
- **PWA / TWA:** add a service worker, then use [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) to publish on Google Play as a Trusted Web Activity. Cheapest option, but native ad SDKs are harder to use.
- **Web portals:** Poki, CrazyGames and GameDistribution host HTML5 games and pay ad revenue share through their own SDKs. Good for validating the game before going native.
- **Port to an engine:** if a mode takes off and needs heavier graphics (3D crowds, big particle counts), rebuild that mode in Unity or Godot. The design and tuning here carry over directly.

## Suggested next steps
- Real art and audio (sprite sheets, particle effects, music).
- More Pin Rescue levels in a JSON level editor (the level format is already data-only).
- An energy/lives system and a battle pass: common in these genres, but tune carefully.
- Remote config (Firebase) to adjust ad frequency and difficulty without shipping an update.

# GameHub: the games from the ads

A mobile-first hub of the "fake ad" games people keep seeing in ads, built so they're actually playable.
All three modes run from one app, share one currency, and use one monetization layer.

| Mode | Inspired by | How it plays |
|---|---|---|
| 📌 **Pin Rescue** | Hero Wars / Evony "pull the pin" ads | Tap pins in the right order. Gold must reach the knight, lava kills, and water turns lava to stone. Defeat every orc. 6 hand-made puzzles, then mirrored variants. |
| 🪖 **Gate Rush** | Last War / Whiteout / Kingshot "math gate" ads | Drag to steer your squad through `+`/`×` gates and away from `-`/`÷` gates. Dodge saws, beat enemy squads, then take down the Ice Giant. Levels are generated from a seed, so each level number always plays the same. |
| 🏕️ **Frost Survival** (3D) | Whiteout Survival / Frozen City idle-camp ads | Move with the joystick (or WASD on desktop). Outside the fence your axes spin and cut down wolves and polar bears. The meat stacks on your back. Drop it at the grill, sell steaks to the customers queuing at the counter, pick up the cash, and spend it on build pads: cashier, crossbow towers, more axes, a bigger backpack, a faster grill. Buy **Next camp** to clear the level. Camp progress is saved mid-level. |

The hub also has persistent coins and gems, a **daily reward**, **Barracks** (permanent upgrades that act as a coin sink), a **Shop**, settings, and two "Coming soon" slots for new modes.

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
js/main.js              hub tabs, game launcher/loop, win/lose flows, daily reward, barracks, shop
js/games/pinrescue.js   particle-physics pin puzzle
js/games/gaterush.js    runner with gates/squads/boss
js/games/frostsurvival.js 3D idle-arcade camp (Three.js)
js/vendor/three.min.js  Three.js r158 (MIT), vendored so it works offline and inside Capacitor
```

### Adding a new game mode
Create `js/games/<name>.js` that registers `GH.Games.<id> = { id, name, tagline, icon, colors, create(opts) }`.
`create` returns an object with `update(dt)`, `draw(ctx)`, and optionally `onDown/onMove/onUp(point)`, `revive()`, `destroy()`.
When the level ends, call `opts.api.win({coins, text})` or `opts.api.lose({reason, canRevive})`. The shell handles rewards, ads and progression.
Then add the id to `ORDER` in `main.js`, add a `levels.<id>` default in `core.js`, and include the script in `index.html`.

## Monetization hooks (already placed)

Every game only calls `Monetization.*`, never an ad SDK directly. Swapping the mock for real SDKs is a one-file change.

| Placement | Type | Where |
|---|---|---|
| Banner 320×50 | Banner | Bottom of every screen. Hidden with *Remove Ads*. |
| Every 3rd finished level | Interstitial | After win/lose. Frequency-capped, skipped after a rewarded ad and with *Remove Ads*. |
| Claim ×3 coins | Rewarded | Victory screen |
| Revive | Rewarded, or 10 💎 | Gate Rush, Frost Defense |
| Hint / Skip level | Rewarded | Pin Rescue |
| Reroll upgrades | Rewarded | Frost Defense level-up |
| Daily ×2, Free coins | Rewarded | Hub / Shop |
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

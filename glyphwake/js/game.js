// Glyphwake: game loop, combat resolution, quests, saving, camera.
(function () {
  'use strict';
  const GW = window.GW, UI = GW.UI, I = GW.Input, ID = GW.ID;
  const $ = id => document.getElementById(id);
  const V3 = THREE.Vector3;
  const SAVE_KEY = 'glyphwake.save.v1';

  const G = GW.G = {
    state: 'title', t: 0, enemies: [], npcs: [], projectiles: [], pickups: [], telegraphs: [], boulders: [],
    stage: 0, counters: {}, hitstop: 0, shakeAmt: 0, hurtFx: 0, flashWhite: 0, bossActive: false, arenaLock: false,
    respawn: null, zone: null, zoneSeen: {}, ui: UI, hintsShown: {}, saveT: 0,
  };

  // ---------------- quests ----------------
  const L = () => GW.World.L;
  const QUESTS = [
    { id: 'wake', title: 'THE WAKING', text: c => `Strike down the straw husks (${c.husk || 0}/3)`, target: () => ({ x: 0, z: 60 }), need: { husk: 3 } },
    { id: 'meet', title: 'A LIGHT IN THE VALE', text: () => 'Find Mara the Lamplighter at Emberhold', target: () => L().elder },
    { id: 'smith', title: 'GLYPH AND STEEL', text: () => 'Socket a rune into your blade at Hesk\'s anvil', target: () => L().anvil },
    { id: 'wolves', title: 'THORNS ACROSS THE WATER', text: c => `Cull the Thornwolves north of the river (${c.wolf || 0}/6)`, target: () => L().meadow, need: { wolf: 6 } },
    { id: 'hollows', title: 'THE OLD SCRIPTORIUM', text: c => `Break the Hollows in the western ruins (${c.hollow || 0}/4)`, target: () => L().ruins, need: { hollow: 4 } },
    { id: 'wisps', title: 'LANTERNS THAT BITE', text: c => `Snuff the Lantern Wisps in Wispwood (${c.wisp || 0}/3)`, target: () => L().grove, need: { wisp: 3 } },
    { id: 'return', title: 'WHAT THE STONES SAID', text: () => 'Return to Mara at Emberhold', target: () => L().elder },
    { id: 'boss', title: 'THE WARDEN CIRCLE', text: () => 'Face the Mire Warden in the stone circle, far north', target: () => L().arena },
    { id: 'free', title: 'THE VALE IS QUIET', text: () => 'Forge the Starfall blade at Hesk\'s anvil.\nThe vale is yours to roam.', target: () => L().anvil },
  ];
  G.quest = () => QUESTS[G.stage];
  G.objective = function () { const q = QUESTS[G.stage]; return q && q.target ? q.target() : null; };
  function refreshQuest() { const q = QUESTS[G.stage]; UI.quest(q.title, q.text(G.counters)); G.questShownT = G.t; }
  function advance() {
    const prev = QUESTS[G.stage];
    G.stage = Math.min(QUESTS.length - 1, G.stage + 1); G.counters = {};
    GWAudio.sfx('quest');
    UI.banner('QUEST COMPLETE', prev.title, 3);
    refreshQuest(); save();
    onStage();
  }
  function onStage() {
    const id = QUESTS[G.stage].id;
    if (id === 'wolves') setTimeout(() => UI.hint('<b>1 · 2 · 3 · 4</b> are your ability slots (they spend focus).<br><b>B</b> opens the Book of Glyphs: swap abilities, craft new ones at a fire or anvil.', 8), 2500);
  }
  function give(kind, key, n) {
    const P = G.player; n = n || 1;
    if (kind === 'rune') { P.inv.runes[key] = (P.inv.runes[key] || 0) + n; const R = GW.Forge.RUNES[key]; UI.toast(`<span style="color:#${R.color.toString(16).padStart(6, '0')}">${R.g}</span> ${R.name} rune${n > 1 ? ' ×' + n : ''}`, 3); }
    else if (kind === 'armor') {
      const slot = GW.Knight.SLOTS.find(sl => GW.Knight.GEAR[sl][key]), it = GW.Knight.GEAR[slot][key];
      const isNew = !P.inv.armor[key]; P.inv.armor[key] = 1;
      UI.toast(`<span style="color:#${it.color.toString(16).padStart(6, '0')}">${GW.Knight.pattern(it.set)}</span> ${it.name}${isNew ? ' · <span style="color:#ffcf6a">open Gear to wear it</span>' : ''}`, 4);
    }
    else if (kind === 'shards') { const amt = key; P.inv.shards = (P.inv.shards || 0) + amt; UI.float('+' + amt + ' ◈', P.pos, { color: '#9fd8ff', size: 11, y: 2.9, life: 1.1 }); if (arguments[2] !== true) UI.toast(`<span style="color:#9fd8ff">◈</span> ${amt} shards`, 2); return; }
    else if (kind === 'abil') {
      const A = GW.Abil, a = A.LIST[key], isNew = A.learn(P, key);
      if (!isNew) { give('shards', 60); return; }
      UI.toast(`<span style="color:${a.col}">${a.g}</span> New ability: <b>${a.name}</b> · <span style="color:#ffcf6a">B to slot it</span>`, 5);
      UI.float(a.g + ' ' + a.name, P.pos, { color: a.col, size: 14, y: 3, life: 1.6 }); GWAudio.sfx('quest'); UI.refreshAbil && UI.refreshAbil(); save(); return;
    }
    else if (kind === 'kindling') { P.inv.kindling = (P.inv.kindling || 0) + n; UI.toast(`<span style="color:#e09040">♨</span> Kindling${n > 1 ? ' ×' + n : ''} · <span style="color:#ffcf6a">F to make a fire</span>`, 3); }
    else { P.inv.ingots[key] = (P.inv.ingots[key] || 0) + n; const M = GW.Forge.METALS[key]; UI.toast(`<span style="color:#${M.color.toString(16).padStart(6, '0')}">${M.glyph}</span> ${M.name} ingot${n > 1 ? ' ×' + n : ''}`, 3); }
    GWAudio.sfx('pickup');
  }
  G.unknownAbil = function (pool) { const b = GW.Abil.ensure(G.player); const left = (pool || GW.Abil.FIND).filter(k => !b.known[k]); return left.length ? left[Math.floor(Math.random() * left.length)] : null; };
  function count(key) {
    const q = QUESTS[G.stage];
    if (!q.need || !q.need[key]) return;
    G.counters[key] = (G.counters[key] || 0) + 1;
    refreshQuest();
    if (G.counters[key] >= q.need[key]) {
      if (q.id === 'wake') { advance(); setTimeout(() => UI.hint('Follow the <span style="color:#ffcf6a">▲ marker</span> north to Emberhold.', 5), 1500); }
      else if (q.id === 'wolves') { give('rune', 'frost'); give('rune', 'swift'); give('armor', 'hood'); gainXP(120); advance(); whisper('The wolves are thinned. West, the ruins still mutter. Break what walks there.'); }
      else if (q.id === 'hollows') { give('ingot', 'silver'); give('armor', 'sallet'); give('rune', 'keen'); give('rune', 'ward'); gainXP(200); advance(); whisper('East, in Wispwood, lanterns drift that no hand carries. Snuff three.'); }
      else if (q.id === 'wisps') { give('ingot', 'duskglass'); give('armor', 'night'); give('rune', 'storm'); give('rune', 'vigor'); gainXP(240); advance(); whisper('Come back to the fire, wanderer. The stones have spoken.'); }
    }
  }
  function whisper(text) { setTimeout(() => UI.toast('<span style="color:#ffcf6a">Mara (whisper):</span> ' + text, 6), 2200); }

  // ---------------- dialogue ----------------
  const MARA = 'MARA · LAMPLIGHTER', HESK = 'HESK · GLYPHSMITH';
  function talk(npc) {
    if (npc.kind === 'villager') { if (npc.role === 'trader') return UI.dialog([{ who: npc.name, text: ['Shards for goods, goods for shards. The world is simple here.', 'Kindling, flasks, a rune or two. Have a look.', 'Mind the roads after dark.'][Math.floor(Math.random() * 3)] }], () => openShop(npc.region, npc.name)); return bountyTalk(npc); }
    const id = QUESTS[G.stage].id;
    if (npc.kind === 'elder') {
      if (id === 'meet') return UI.dialog([
        { who: MARA, text: 'So the Waking Stone gave up another one. Sit, if your legs remember how.' },
        { who: MARA, text: 'This vale was written, wanderer. Every blade of grass, every stone, set down in glyphs. Now the writing is coming loose.' },
        { who: MARA, text: 'Thornwolves across the river. Hollows in the old scriptorium. Lanterns that bite. And under it all, the Warden, stirring in its circle.' },
        { who: MARA, text: 'Take this. An Ember rune, warm still. Hesk will set it in your blade: he is the one hammering by the brazier.' },
        { who: MARA, text: 'Rest at any fire to mend and refill your flask. The things you killed will walk again when you do. That is the price of rest.' },
      ], () => { give('rune', 'ember'); advance(); });
      if (id === 'return') return UI.dialog([
        { who: MARA, text: 'You came back smelling of ash and lantern-oil. Good.' },
        { who: MARA, text: 'The stones of the Warden Circle have woken. North, past the meadow, where the river cannot reach.' },
        { who: MARA, text: 'The Warden was set there to keep the vale\'s writing still. Now it only keeps it broken. It slams the ground: when the circle reddens, be elsewhere.' },
        { who: MARA, text: 'Temper your blade. Fill your flask. Then go.' },
      ], () => advance());
      if (id === 'free') return UI.dialog([{ who: MARA, text: 'Listen. The grass is only grass again. Rest a while, wanderer. Or walk. The vale is yours.' }]);
      if (id === 'boss') return UI.dialog([{ who: MARA, text: 'North. Past the meadow, to the circle of stones. Watch the ground, not its face.' }]);
      return UI.dialog([{ who: MARA, text: ['The fire holds. Go do what you must.', 'When in doubt, roll. The glyphs cannot hold what moves.', 'Hesk has opinions about runes. Let him have them.'][Math.floor(Math.random() * 3)] }]);
    }
    if (npc.kind === 'smith') {
      if (id === 'smith') return UI.dialog([
        { who: HESK, text: 'Mara\'s ember, is it? Hand me the blade.' },
        { who: HESK, text: 'Three slots on that sword. Runes sit in them and sing. Metals change the bones of the thing. Iron is free; the rest costs ingots.' },
        { who: HESK, text: 'Use the anvil. Drop the rune into a slot. Watch the glyphs circle the steel: that is how you know it took.' },
      ], () => openForge());
      return UI.dialog([{ who: HESK, text: ['Bring me ingots and I\'ll make that sword sing louder.', 'Bronze for speed. Steel for the clean cut. Silver for things that should be dead.', 'Starfall? If you ever find any, I\'ll weep.'][Math.floor(Math.random() * 3)] }], () => {});
    }
  }

  // ---------------- setup ----------------
  function init() {
    $('t-menu').style.visibility = 'hidden';
    $('t-foot').textContent = 'loading models…';
    GW.Assets.load(['monarch', 'wolf', 'nat_tree_pine_tall', 'nat_tree_oak', 'nat_tree_dark', 'nat_tree_autumn', 'nat_tree_fat', 'nat_stump', 'nat_log', 'nat_bush_large', 'nat_rock_large', 'nat_rock_tall', 'nat_mushroom_red', 'kit', 'armor', 'castle', 'chapel', 'tower'], f => { $('t-foot').textContent = 'loading models… ' + Math.round(f * 100) + '%'; })
      .then(build).catch(err => { $('t-foot').textContent = 'Could not load the 3D models: ' + err.message; console.error(err); });
  }
  function build() {
    $('t-menu').style.visibility = '';
    $('t-foot').textContent = 'WASD move · mouse aim · LMB attack (hold: heavy) · RMB block (tap on impact: parry) · Space roll · 1-4 abilities · B book · Q flask · E interact · C gear · wheel zoom · hold middle mouse to turn the camera';
    const R = G.R = new GW.Renderer($('gl'));
    const scene = G.scene = new THREE.Scene();
    G.camera = new THREE.PerspectiveCamera(42, R.aspect, 0.5, 400);
    applySettings();
    const q = UI.settings.quality;
    GW.World.build(scene, { grassCount: [40000, 80000, 150000][q] });
    G.parts = { spark: new GW.Particles(scene, 500, ID.FIRE), dust: new GW.Particles(scene, 300, ID.STONE), blood: new GW.Particles(scene, 200, ID.BODY) };
    G.player = new GW.Player(scene);
    const Lw = GW.World.L;
    G.npcs.push(new GW.NPC(scene, 'elder', Lw.elder.x, Lw.elder.z), new GW.NPC(scene, 'smith', Lw.smith.x, Lw.smith.z));
    // a trader and a quest-giver in every region village
    const VNAMES = { vale: ['Odo', 'Wenna'], frost: ['Halvard', 'Sigrun'], high: ['Brannoc', 'Ilsa'], ash: ['Cindra', 'Garrow'], salt: ['Tamsin', 'Oren'], mire: ['Mother Reed', 'Fenwick'], dusk: ['Lumen', 'Sorrel'] };
    const VCOL = { vale: 0x5a6a4a, frost: 0x6a7a90, high: 0x6a6a52, ash: 0x7a4a34, salt: 0x9a8a6a, mire: 0x4a5034, dusk: 0x34485a };
    for (const h of GW.World.HUBS) {
      const c = Lw[h.at], nm = VNAMES[h.id];
      G.npcs.push(new GW.NPC(scene, 'villager', c.x + 5, c.z - 4, { role: 'trader', region: h.id, name: nm[0] + ', the trader', col: VCOL[h.id] }));
      G.npcs.push(new GW.NPC(scene, 'villager', c.x - 5, c.z - 3, { role: 'quest', region: h.id, name: nm[1] + ', who keeps the bounties', col: VCOL[h.id] }));
    }
    spawnAll();
    G.player.place(Lw.start.x, Lw.start.z + 5);
    UI.initInput(G); UI.buildHotbar(); UI.initMinimap();
    GW.Forge.UI.init(); GW.Knight.UI.init(G);
    $('p-map').onclick = () => { togglePause(false); UI.toggleMap(G, true); };
    $('minimap-wrap').onclick = () => { if (G.state === 'play') UI.toggleMap(G, true); };
    $('p-gear').onclick = () => openGear(); $('gear-btn').onclick = () => openGear();
    UI.initSettings(applySettings);
    $('logo').textContent = UI.makeLogo('GLYPHWAKE');
    // menus
    const has = !!loadData();
    $('t-continue').style.display = has ? '' : 'none';
    $('t-continue').onclick = () => startGame(true);
    let armed = false;
    $('t-new').onclick = () => {
      if (has && !armed) { armed = true; $('t-new').textContent = 'Tap again: erase save'; setTimeout(() => { armed = false; $('t-new').textContent = 'New journey'; }, 3000); return; }
      startGame(false);
    };
    $('t-settings').onclick = () => openSettings('title');
    $('p-resume').onclick = () => togglePause(false);
    $('p-settings').onclick = () => openSettings('pause');
    $('p-quit').onclick = () => { save(); location.reload(); };
    $('s-back').onclick = () => { $('settings').classList.add('hidden'); if (G.settingsFrom === 'pause') $('pause').classList.remove('hidden'); else $('title').classList.remove('hidden'); };
    $('death-btn').onclick = () => respawnPlayer();
    $('menu-btn').onclick = () => togglePause(true);
    if (I.touch) $('t-foot').textContent = 'left thumb: move · ⚔ attack (hold to combo) · ⟲ roll · ◎ » ✶ skills';
    window.addEventListener('resize', () => { R.resize(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') { save(); togglePause(true); } });
    G.last = performance.now();
    requestAnimationFrame(loop);
  }
  function applySettings() {
    const S = UI.settings, R = G.R;
    R.glyphPx = S.glyph; R.glyphA = S.glyphA; R.glyphS = S.glyphS; R.glyphT = S.glyphT || 10; R.quality = S.quality; R.renderScale = S.res || 'auto'; R.resize(); R.setPureGrass(S.pure);
    const sm = S.shadows || 'soft';
    R.setShadows(sm === 'off' ? 0 : [0, 1024, 2048][S.quality]); R.reflOn = S.quality > 0;
    GW.LU.uShadowSoft.value = sm === 'soft' ? 2.6 : 1.25; GW.LU.uShadowStr.value = sm === 'soft' ? 0.55 : 1.0;
    GWAudio.setVolume(S.vol, S.mus);
  }
  function openSettings(from) { if (UI.resNote) UI.resNote(); G.settingsFrom = from; $('settings').classList.remove('hidden'); $('pause').classList.add('hidden'); $('title').classList.add('hidden'); }

  function spawnAll() {
    const Lw = GW.World.L;
    [[-3, 62], [3, 61], [0, 56]].forEach(([x, z]) => G.spawnEnemy('husk', x, z));
    const packs = [[4, -48], [22, -60], [-2, -70], [28, -44], [14, -78]];
    packs.forEach(([px, pz]) => { for (let k = 0; k < 3; k++) { const a = k * 2.1; G.spawnEnemy('wolf', px + Math.cos(a) * 2.5, pz + Math.sin(a) * 2.5, { x: px, z: pz }); } });
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, r = 4 + (k % 3) * 2.5; G.spawnEnemy('hollow', Lw.ruins.x + Math.cos(a) * r, Lw.ruins.z + Math.sin(a) * r); }
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2, r = 6 + (k % 2) * 6; G.spawnEnemy('wisp', Lw.grove.x + Math.cos(a) * r, Lw.grove.z + Math.sin(a) * r); }
    G.boss = G.spawnEnemy('warden', Lw.arena.x, Lw.arena.z - 4);
    G.widow = G.spawnEnemy('widow', Lw.lair.x, Lw.lair.z);
    // the region bosses, each in its own lair
    G.regionBosses = [
      { key: 'colossus', type: 'colossus', x: 2250, z: 1220, title: 'THE ASH COLOSSUS', sub: 'the ground cracks open' },
      { key: 'rimeknight', type: 'rimeknight', x: -150, z: -2650, title: 'THE RIME KNIGHT', sub: 'frost climbs your armour' },
      { key: 'mirehag', type: 'mirehag', x: -2050, z: 1560, title: 'THE MIRE HAG', sub: 'the water starts to boil' },
      { key: 'cragwarlord', type: 'cragwarlord', x: 2470, z: -1520, title: 'THE CRAG WARLORD', sub: 'kneel, or be broken' },
    ];
    G.regionBosses.forEach(b => { b.e = G.spawnEnemy(b.type, b.x, b.z, { x: b.x, z: b.z }, false, 1 + Math.floor(Math.hypot(b.x, b.z) / 280)); b.e.bossKey = b.key; });
    // Greymoss Keep: hollows guard the courtyard, loot waits on the broken upper floor
    [[-4, -5], [4, -4], [0, -8]].forEach(([lx, ly]) => G.spawnEnemy('hollow', Lw.castle.x + lx, Lw.castle.z - ly, { x: Lw.castle.x, z: Lw.castle.z + 3 }));
    // camps beyond the Vale: wolves in the outer Vale and Frostmere, hollows in the Ashen Barrens
    const pack = (type, x, z, n) => { for (let k = 0; k < n; k++) { const a = k * 2.1; G.spawnEnemy(type, x + Math.cos(a) * 2.5, z + Math.sin(a) * 2.5, { x, z }); } };
    [[-400, 150], [300, 200], [-250, -300], [520, -560], [-620, -180], [180, 420], [-380, 520]].forEach(([x, z]) => pack('wolf', x, z, 3));
    [[-300, -800], [100, -1060], [-520, -950], [320, -720], [-800, -700], [900, 600], [-900, 700], [600, 1100], [-1000, -200]].forEach(([x, z]) => pack('wolf', x, z, 3));
    [[-20, -20], [20, 15]].forEach(([dx, dz]) => G.spawnEnemy('hollow', Lw.cinder.x + dx, Lw.cinder.z + dz, { x: Lw.cinder.x, z: Lw.cinder.z }));
    [[-10, 20], [10, -20]].forEach(([dx, dz]) => G.spawnEnemy('hollow', Lw.abbey.x + dx, Lw.abbey.z + dz, { x: Lw.abbey.x, z: Lw.abbey.z }));
    // group everything into camps (enemies whose homes lie within 20 m share one)
    G.camps = [];
    for (const e of G.enemies) {
      if (e.T.boss || e.type === 'husk' || e.temp) continue;
      let c = G.camps.find(c => Math.hypot(c.x - e.home.x, c.z - e.home.z) < 20);
      if (!c) { c = { x: e.home.x, z: e.home.z, members: [], clearedAt: -1 }; G.camps.push(c); }
      c.members.push(e); e.camp = c;
    }
  }
  // ---- spawning: camps refill only while you're far away; at night hunting packs come out of the dark ----
  const CAMP_REFILL = 300, CAMP_FAR = 60;
  function updateSpawns(dt) {
    const P = G.player, S = UI.settings;
    if (G.dungeon) return;
    for (const c of G.camps || []) {
      const cleared = c.members.every(e => !e.alive);
      if (!cleared) { c.clearedAt = -1; continue; }
      if (c.clearedAt < 0) c.clearedAt = G.t;
      if (G.t - c.clearedAt > CAMP_REFILL && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) > CAMP_FAR) { c.members.forEach(revive); c.clearedAt = -1; }
    }
    // night hunts
    const night = GW.LU.uDayLight.value < 0.8 && (S.time || 'cycle') !== 'day';
    const hunters = G.enemies.filter(e => e.hunter && e.alive);
    if (!night || S.nightHunts === false) {
      for (const e of hunters) { e.hp = 1; G.hitEnemy(e, 99, { dot: 'burn' }); }      // dawn burns them away
      G.huntT = 40 + Math.random() * 40; return;
    }
    const safe = G.nearFire(P.pos.x, P.pos.z, 9) || GW.World.ZONES.some(z => (z.name === 'EMBERHOLD' || z.name === 'THE WAKING STONE' || z.name === 'HEARTHWICK') && Math.hypot(P.pos.x - z.x, P.pos.z - z.z) < z.r);
    for (const e of hunters) {
      // they hunt you, but won't step into firelight
      const f = G.nearFire(e.pos.x, e.pos.z, 8);
      if (f) { const a = Math.atan2(e.pos.z - f.z, e.pos.x - f.x); e.home = { x: f.x + Math.cos(a) * 11, z: f.z + Math.sin(a) * 11 }; e.aggro = false; e.setState && e.state !== 'return' && e.setState('return'); }
      else { e.home = { x: P.pos.x, z: P.pos.z }; if (!safe) e.aggro = true; }
      if (e.distTo(P.pos) > 90) { e.alive = false; e.model.visible = false; e.shadow.visible = false; }
    }
    G.huntT = (G.huntT === undefined ? 30 : G.huntT) - dt;
    if (G.huntT > 0 || hunters.length >= 4 || safe || G.bossActive || G.state !== 'play') return;
    G.huntT = 70 + Math.random() * 70;
    // spawn behind the edge of the view, in the dark
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * Math.PI * 2, r = 34 + Math.random() * 10, x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
      if (Math.abs(x) > 3800 || Math.abs(z) > 3800 || GW.World.blocked(x, z, 1.2) || GW.World.riverAt(x, z) < 6 || G.nearFire(x, z, 14)) continue;
      const type = Math.random() < 0.65 ? 'wolf' : 'hollow', n = type === 'wolf' ? 3 : 2;
      for (let k = 0; k < n; k++) { const e = G.spawnEnemy(type, x + Math.cos(k * 2.1) * 1.8, z + Math.sin(k * 2.1) * 1.8, { x: P.pos.x, z: P.pos.z }, true); e.hunter = true; e.aggro = false; }
      if (type === 'wolf') GWAudio.sfx('howl');
      UI.toast('Something hunts in the dark…', 2.5);
      break;
    }
  }
  // ---- your own fires: F + kindling builds one on open ground; it scorches the grass and burns out ----
  const FIRE_LIFE = 480;
  G.ownFires = [];
  // ---------------- break bar & finishers ----------------
  G.brkMax = e => e.T.boss ? e.maxHp * 0.1 : Math.max(30, e.maxHp * 0.55);
  G.breakEnemy = function (e) {
    e.brk = 0; e.brokenT = e.T.boss ? 2.6 : 3.4; e.setState && !e.T.boss && e.setState('stagger');
    UI.float('BROKEN', e.pos, { color: '#ffb040', size: 15, y: e.T.radius * 2 + 1.4, life: 1.2 }); GWAudio.sfx('slam'); G.shake(0.35);
    G.addHitGlyphs(e.pos.x, e.pos.y + 1.2, e.pos.z, 18, '#ffb040');
    if (!G.hintsShown.finisher) { G.hintsShown.finisher = true; UI.hint('<b>BROKEN</b>: strike it now for a finisher.', 3.5); }
  };
  G.finisherTarget = function (P) {
    let best = null, bd = 3.4;
    for (const e of G.enemies) if (e.alive && e.brokenT > 0.2) { const d = e.distTo(P.pos); if (d < bd + e.radius) { bd = d; best = e; } }
    return best;
  };
  G.finisher = function (e) {
    const P = G.player, dmg = e.T.boss ? e.maxHp * 0.08 + P.ws.dmg * 4 : e.maxHp * 0.5 + P.ws.dmg * 4;
    e.brokenT = 0; e.model.rotation.z = 0;
    G.hitEnemy(e, dmg, { heavy: true, from: P.pos, melee: true, finisher: true });
    P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.12); G.hitstop = 0.16; G.shake(0.7); GWAudio.sfx('crit'); GWAudio.sfx('slam');
    UI.float('FINISHER', e.pos, { color: '#ffd860', size: 17, y: e.T.radius * 2 + 1.6, life: 1.2 }); G.addHitGlyphs(e.pos.x, e.pos.y + 1.2, e.pos.z, 26, '#ffd860');
  };
  G.slowmo = function (scale, dur) { G.ts = scale; G.tsT = dur; };
  // ---------------- burning / poison on the hero (from region enemies) ----------------
  G.pdot = { burn: 0, poison: 0, t: 0 };
  function tickPlayerDots(dt) {
    const P = G.player, D = G.pdot; if (P.state === 'dead') { D.burn = D.poison = 0; return; }
    D.burn = Math.max(0, D.burn - dt); D.poison = Math.max(0, D.poison - dt); D.t -= dt;
    if (D.t > 0 || (!D.burn && !D.poison)) return;
    D.t = 0.5;
    const dmg = (D.burn ? P.maxHp * 0.012 : 0) + (D.poison ? P.maxHp * 0.008 : 0);
    P.hp -= dmg; UI.float(String(Math.ceil(dmg)), P.pos, { color: D.burn ? '#ff9a40' : '#8aff6a', size: 10, y: 2.2, life: 0.7 });
    G.parts.spark.burst(P.pos.x, P.pos.y + 1, P.pos.z, 4, 1.5, D.burn ? 0xff7a2a : 0x7aff5a, 0.5, 0.9, 2, 1);
    if (P.hp <= 0) { P.hp = 1; G.hurtPlayer(9999, P.pos, { heavy: true }); }
  }
  // glyph sparks thrown off by hits, drawn on the overlay
  G.hitGlyphs = [];
  G.addHitGlyphs = function (x, y, z, n, col) { const CH = '*+x#%&/\\|-'; for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4;
    G.hitGlyphs.push({ x, y, z, vx: Math.cos(a) * s, vy: 2 + Math.random() * 4, vz: Math.sin(a) * s, t: 0, life: 0.35 + Math.random() * 0.3, ch: CH[Math.floor(Math.random() * CH.length)], col }); } if (G.hitGlyphs.length > 160) G.hitGlyphs.splice(0, G.hitGlyphs.length - 160); };
  const _hg = new THREE.Vector3();
  function drawHitGlyphs(dt) {
    if (!fxCx || !G.hitGlyphs.length) return;
    const cx = fxCx, W = fxCv.width, H = fxCv.height, dpr = W / innerWidth;
    cx.save(); cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.font = `bold ${Math.round(13 * dpr)}px ui-monospace, Menlo, monospace`; cx.globalCompositeOperation = 'lighter';
    G.hitGlyphs = G.hitGlyphs.filter(g => {
      g.t += dt; if (g.t > g.life) return false;
      g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt; g.vy -= 12 * dt;
      _hg.set(g.x, g.y, g.z).project(G.camera); if (_hg.z > 1) return true;
      cx.globalAlpha = 1 - g.t / g.life; cx.fillStyle = g.col; cx.fillText(g.ch, (_hg.x * 0.5 + 0.5) * W, (-_hg.y * 0.5 + 0.5) * H); return true;
    });
    cx.restore();
  }
  // ---------------- the horse: H to whistle for it / mount / dismount ----------------
  function toggleHorse() {
    const P = G.player;
    if (P.state === 'dead') return;
    if (P.horse && P.horse.ridden) { dismount(false); return; }
    if (P.floor || G.heroInside || G.dungeon) { UI.toast("There's no room for a horse here.", 2); return; }
    if (G.enemies.some(e => e.alive && e.aggro && e.distTo(P.pos) < 18)) { UI.toast('Not while you are being hunted.', 2); return; }
    if (!P.horse) P.horse = new GW.Horse(G.scene);
    const H = P.horse;
    if (H.pos.distanceTo(P.pos) > 8) {   // it comes running
      GWAudio.sfx('howl');
      H.yaw = P.yaw; H.speed = 0; H.place(new V3(P.pos.x + Math.cos(P.yaw) * 2.2, P.pos.y, P.pos.z - Math.sin(P.yaw) * 2.2), P.yaw, 0.016);
      G.parts.dust.burst(H.pos.x, H.pos.y + 0.3, H.pos.z, 26, 4, 0x8a8070, 0.8, 1.3, -3, 1.5);
    }
    H.ridden = true; H.yaw = P.yaw; H.speed = 0; P.pos.set(H.pos.x, H.pos.y, H.pos.z);
    GWAudio.sfx('step', 3); if (!G.hintsShown.horse) { G.hintsShown.horse = true; UI.hint('Riding. Move to steer, faster on roads. <b>H</b> to dismount. A hit throws you off.', 5); }
  }
  function dismount(thrown) {
    const P = G.player, H = P.horse; if (!H || !H.ridden) return;
    H.ridden = false; H.speed = thrown ? H.speed * 0.4 : 0;
    const sx = Math.cos(H.yaw) * 1.6, sz = -Math.sin(H.yaw) * 1.6;
    P.pos.x += sx; P.pos.z += sz; if (thrown) { P.state = 'hurt'; P.t = 0; P.vel.set(sx * 3, 0, sz * 3); }
  }
  G.dismount = dismount;
  G.updateHorse = function (dt) {   // a horse you left behind idles and grazes where it stands
    const H = G.player.horse; if (!H || H.ridden) return;
    H.speed = Math.max(0, H.speed - dt * 8);
    if (H.speed > 0) { H.pos.x += Math.sin(H.yaw) * H.speed * dt; H.pos.z += Math.cos(H.yaw) * H.speed * dt; }
    H.pos.y = GW.World.groundY(H.pos.x, H.pos.z); H.place(H.pos, H.yaw, dt);
  };
  G.buildFire = buildFire;
  function buildFire() {
    const P = G.player, W = GW.World;
    if (P.state === 'dead' || P.floor) return;
    if (!(P.inv.kindling > 0)) { UI.toast('No kindling. Enemies sometimes drop it.', 2.5); return; }
    const x = P.pos.x + Math.sin(P.yaw) * 1.8, z = P.pos.z + Math.cos(P.yaw) * 1.8;
    if (W.blocked(x, z, 1.1) || W.riverAt(x, z) < 6 || G.nearFire(x, z, 4) || Math.abs(W.heightAt(x, z) - P.pos.y) > 0.8) { UI.toast("Can't build a fire here.", 2); return; }
    P.inv.kindling--;
    makeFire(x, z, FIRE_LIFE);
    UI.toast('<span style="color:#ffb050">♨</span> You kindle a fire. Rest here while it burns.', 3); GWAudio.sfx('quest');
    save();
  }
  function makeFire(x, z, left, quiet) {
    const W = GW.World;
    if (G.ownFires.length >= 3) douse(G.ownFires[0]);
    const f = W.campfire(G.scene, x, z, 'your fire', true);
    if (!quiet) for (let k = 0; k < 30; k++) G.parts.spark.emit(x, W.heightAt(x, z) + 0.4, z, (Math.random() - 0.5) * 2, 2 + Math.random() * 4, (Math.random() - 0.5) * 2, 1.5, 1.2, 0xffa040, -1);
    W.burn(x, z, 2.3);
    f.left = left; G.ownFires.push(f);
  }
  function douse(f) {
    const W = GW.World;
    f.out = true; f.flames.forEach(fl => { fl.m.visible = false; fl.base = 0; });
    W.lights.remove(f.light); W.interact = W.interact.filter(i => i !== f.rest);
    G.ownFires = G.ownFires.filter(o => o !== f);
  }
  G.updateOwnFires = function (dt) {
    for (const f of G.ownFires.slice()) { f.left -= dt; if (f.left <= 0) { douse(f); UI.toast('Your fire has burned out.', 2.5); } }
  };
  // nearest lit fire (campfires, your own fires) within r
  G.craftStation = function () { const P = G.player; return !!G.nearFire(P.pos.x, P.pos.z, 6) || GW.World.interact.some(it => it.type === 'forge' && Math.hypot(it.x - P.pos.x, it.z - P.pos.z) < 5); };
  G.nearFire = function (x, z, r) {
    let best = null, bd = r;
    for (const f of GW.World.fires || []) { if (f.out) continue; const d = Math.hypot(x - f.x, z - f.z); if (d < bd) { bd = d; best = f; } }
    return best;
  };
  G.spawnEnemy = function (type, x, z, home, temp, lvl, elite) {
    const e = new GW.Enemy(G.scene, type, x, z, home);
    e.temp = !!temp; if (temp) { e.aggro = true; }
    // level rings: farther from the Vale = tougher; elites are much tougher
    e.lvl = lvl || 1; const hk = (1 + 0.22 * (e.lvl - 1)) * (elite ? 3 : 1);
    e.maxHp = e.hp = Math.round(e.T.hp * hk); e.dmgMul = (1 + 0.12 * (e.lvl - 1)) * (elite ? 1.4 : 1) * (e.dmgK || 1); e.elite = !!elite;
    if (elite) e.model.scale.setScalar(1.25);
    G.enemies.push(e); return e;
  };

  // ---------------- game flow ----------------
  function startGame(cont) {
    GWAudio.init();
    const P = G.player, Lw = GW.World.L;
    fade(() => {
      $('title').classList.add('hidden');
      if (cont) {
        const d = loadData();
        if (d) {
          Object.assign(P, { level: d.level, xp: d.xp, flasks: d.flasks }); if (!(P.level >= 1)) P.level = 1;   // older saves stored the castle floor here
          G.opened = d.opened || {}; G.discovered = d.discovered || {}; G.cleared = d.cleared || {}; G.poiSeen = d.poiSeen || {}; G.waystones = d.waystones || {}; G.bounty = d.bounty || {};
          if (d.extraFlasks) { P.extraFlasks = d.extraFlasks; P.maxFlasks = 3 + d.extraFlasks; } if (d.fog) fogUnpack(d.fog);
          P.weapon = d.weapon; P.inv = d.inv; if (P.inv.kindling === undefined) P.inv.kindling = 3;
          (d.fires || []).forEach(f => makeFire(f.x, f.z, f.left, true));
          P.inv.armor = P.inv.armor || { greathelm: 1, knightplate: 1, crimson: 1 }; P.cd = {};
          P.gear = Object.assign({}, GW.Knight.DEFAULT, d.gear || {}); GW.Knight.dress(P);
          if (d.tod !== undefined) G.tod = d.tod;
          G.castleLooted = !!d.castleLooted;
          G.stage = d.stage; G.counters = d.counters || {}; G.respawn = d.respawn; G.bossDead = d.bossDead;
          if (G.bossDead) killSilently(G.boss);
          G.widowDead = !!d.widowDead; if (G.widowDead) killSilently(G.widow);
          G.bossesDead = d.bossesDead || {}; G.regionBosses.forEach(b => { if (G.bossesDead[b.key]) killSilently(b.e); });
        }
      } else { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }
      G.castleLoot();
      GW.Abil.ensure(P); UI.refreshAbil && UI.refreshAbil();
      P.recalc(); P.hp = P.maxHp;
      const sp = G.respawn || { x: Lw.start.x, z: Lw.start.z + 5 };
      P.place(sp.x, sp.z + (G.respawn ? 2.2 : 0)); P.yaw = Math.PI; P.visYaw = Math.PI;
      G.state = 'play'; $('hud').classList.remove('hidden'); UI.showTouch(true); UI.applyControl();
      refreshQuest();
      if (!cont) {
        UI.dialog([
          { who: 'THE WAKING STONE', text: 'You were written here once. The ink is still wet.' },
          { who: 'THE WAKING STONE', text: 'Rise. The vale is coming apart one glyph at a time, and the fire in Emberhold is the last thing still burning true.' },
        ], () => { UI.hint(I.touch ? 'Left thumb to move. Tap <b>⚔</b> to strike the husks (hold to chain a combo).' : '<b>WASD</b> to move · <b>Left click</b> to strike · aim with the mouse', 8); UI.banner('the vale of ninefold', 'THE WAKING STONE', 3.5); G.zone = 'THE WAKING STONE'; });
      }
    });
  }
  function killSilently(e) { e.alive = false; e.deadT = 99; e.model.visible = false; e.shadow.visible = false; if (e.T.onDeath) e.T.onDeath(e); }
  function fade(mid) { $('fade').classList.add('on'); setTimeout(() => { mid(); setTimeout(() => $('fade').classList.remove('on'), 80); }, 620); }
  function togglePause(on) {
    if (G.state !== 'play' && G.state !== 'paused') return;
    if (on && G.state === 'play') {
      G.state = 'paused'; $('pause').classList.remove('hidden'); renderSheet();
    } else if (!on && G.state === 'paused') { G.state = 'play'; $('pause').classList.add('hidden'); $('settings').classList.add('hidden'); }
  }
  function renderSheet() {
    const P = G.player, s = P.ws, F = GW.Forge;
    const runes = Object.entries(P.inv.runes).filter(([, n]) => n > 0).map(([k, n]) => F.RUNES[k].g + '×' + n).join(' ') || '·';
    const ingots = Object.entries(P.inv.ingots).filter(([, n]) => n > 0).map(([k, n]) => F.METALS[k].name + '×' + n).join(', ') || '·';
    $('char-sheet').textContent = `Level ${P.level}   HP ${Math.ceil(P.hp)}/${P.maxHp}\nBlade: ${F.weaponName(P.weapon)}\nDamage ${s.dmg.toFixed(1)} · Crit ${Math.round(s.crit * 100)}% · Speed ${Math.round(s.speed * 100)}%\nRunes in pack: ${runes}\nIngots: ${ingots}\nFlasks: ${P.flasks}/${P.maxFlasks}`;
  }
  function openGear() { if (G.state !== 'play' && G.state !== 'paused') return; $('pause').classList.add('hidden'); G.state = 'gear'; $('hud').classList.add('hidden'); GW.Knight.UI.toggle(G, true); }
  G.closeGear = function () { GW.Knight.UI.toggle(G, false); G.state = 'play'; $('hud').classList.remove('hidden'); G.camera.clearViewOffset(); G.snapCam = true; save(); };
  G.openGear = openGear;
  function openForge() { if (G.state !== 'play') return; G.state = 'forge'; $('hud').classList.add('hidden'); GW.Forge.UI.open(G); }
  G.closeForge = function () { G.state = 'play'; $('hud').classList.remove('hidden'); save(); };
  G.onSocket = function () { if (QUESTS[G.stage].id === 'smith') { give('ingot', 'bronze'); give('ingot', 'steel'); setTimeout(() => { advance(); UI.toast('Hesk: "Take these ingots, too. Try a new metal."', 4); }, 400); } };
  G.onTemper = function () { UI.toast('The blade is reforged: ' + GW.Forge.weaponName(G.player.weapon), 2.5); };

  function rest(it) {
    const P = G.player;
    if (!it.own) G.discovered[it.name] = true;
    fade(() => {
      P.hp = P.maxHp; P.flasks = P.maxFlasks; P.fo = 100; P.st = 100;
      G.respawn = { x: it.x, z: it.z };
      resetEnemies();
      P.place(it.x, it.z + 2.2);
      UI.banner('rested at', it.name.toUpperCase(), 2.4);
      save();
      // fast travel between fires you have found
      const list = travelList(it.x, it.z, it);
      if (list.length) { G.state = 'travel'; UI.showTravel(list, f => { G.state = 'play'; if (f) travelTo(f); }); }
    });
  }
  function travelTo(f) {
    fade(() => {
      const P = G.player; P.place(f.x, f.z + 2.4); P.yaw = Math.PI; G.snapCam = true;
      G.respawn = { x: f.x, z: f.z }; GW.World._streamBudget = 99; GW.World.terrainRefresh(false, f.x, f.z);
      UI.banner('you travel to', f.name.replace(/^[▲◊] /, '').toUpperCase(), 2.6); save();
    });
  }
  // ---- exploration: fog of war, discovered fires, compass, regions ----
  G.FOG_CELL = 20; G.FOG_N = Math.ceil(GW.World.SIZE / 20); G.fog = new Uint8Array(G.FOG_N * G.FOG_N); G.discovered = {};
  function explore() {
    if (G.dungeon) return;
    const P = G.player, S = GW.World.SIZE, FC = G.FOG_CELL, FN = G.FOG_N, R = 70;
    const i0 = Math.floor((P.pos.x - R + S / 2) / FC), i1 = Math.floor((P.pos.x + R + S / 2) / FC), j0 = Math.floor((P.pos.z - R + S / 2) / FC), j1 = Math.floor((P.pos.z + R + S / 2) / FC);
    for (let j = Math.max(0, j0); j <= Math.min(FN - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(FN - 1, i1); i++)
      if (Math.hypot((i + 0.5) * FC - S / 2 - P.pos.x, (j + 0.5) * FC - S / 2 - P.pos.z) < R) G.fog[j * FN + i] = 1;
    for (const f of GW.World.fires) if (!f.rest.own && !G.discovered[f.rest.name] && Math.hypot(f.x - P.pos.x, f.z - P.pos.z) < 16) { G.discovered[f.rest.name] = true; UI.toast(`<span style="color:#ff9a40">▲</span> Found a fire: ${f.rest.name}`, 3); }
    const r = GW.World.regionAt(P.pos.x, P.pos.z);
    if (r !== G.region) { const R0 = GW.World.REGIONS[r]; if (G.region) UI.banner(R0.sub, R0.name, 3.6, R0.col); G.region = r; }
  }
  G.compassPOIs = function () {
    const W = GW.World, out = [];
    for (const z of W.ZONES) out.push({ x: z.x, z: z.z, g: '◇', col: '#c8ccd8', range: 520 });
    for (const f of W.fires) if (!f.out && (f.rest.own || G.discovered[f.rest.name])) out.push({ x: f.x, z: f.z, g: '▲', col: '#ff9a40', range: 700 });
    const o = G.objective(); if (o) out.push({ x: o.x, z: o.z, g: '◆', col: '#ffd860', range: 99999 });
    for (const e of G.enemies) if (e.alive && e.T.boss) out.push({ x: e.pos.x, z: e.pos.z, g: 'Ω', col: '#ff5040', range: 260 });
    return out;
  };
  const fogPack = () => { let s = ''; for (let k = 0; k < G.fog.length; k += 8) { let b = 0; for (let t = 0; t < 8; t++) if (G.fog[k + t]) b |= 1 << t; s += String.fromCharCode(b); } return btoa(s); };
  const fogUnpack = str => { try { const s = atob(str); for (let k = 0; k < s.length; k++) { const b = s.charCodeAt(k); for (let t = 0; t < 8; t++) G.fog[k * 8 + t] = (b >> t) & 1; } } catch (e) { /* ignore */ } };
  function resetEnemies() {
    if (!UI.settings.respawn) {
      // default: the dead stay dead (camps refill on their own); the living calm down and go home; bosses heal
      G.enemies = G.enemies.filter(e => { if (e.temp && !e.hunter) { e.alive = false; G.scene.remove(e.model); G.scene.remove(e.shadow); if (e.T.onDeath && e.light) e.T.onDeath(e); return false; } return true; });
      for (const e of G.enemies) {
        if (e.T.boss) { if (e.alive) { e.hp = e.maxHp; e.phase = 1; e.pos.set(e.spawn.x, e.pos.y, e.spawn.z); e.setState('idle'); e.aggro = false; } continue; }
        if (e.alive && !e.hunter) { e.aggro = false; e.hp = e.maxHp; e.pos.set(e.spawn.x, GW.World.heightAt(e.spawn.x, e.spawn.z), e.spawn.z); e.setState('idle'); }
      }
      G.bossActive = false; G.curBoss = null; G.arenaLock = false; UI.boss(false);
      return;
    }
    G.enemies = G.enemies.filter(e => { if (e.temp) { e.alive = false; G.scene.remove(e.model); G.scene.remove(e.shadow); if (e.T.onDeath && e.light) e.T.onDeath(e); return false; } return true; });
    for (const e of G.enemies) {
      if (e.T.boss) { if (e.alive) { e.hp = e.maxHp; e.phase = 1; e.pos.set(e.spawn.x, e.pos.y, e.spawn.z); e.setState('idle'); e.aggro = false; } continue; }
      revive(e);
    }
    G.bossActive = false; G.curBoss = null; G.arenaLock = false; UI.boss(false);
  }
  function revive(e) {
    const wasDead = !e.alive;
    e.alive = true; e.hp = e.maxHp; e.model.visible = true; e.shadow.visible = true; e.model.rotation.z = 0;
    e.pos.set(e.spawn.x, GW.World.heightAt(e.spawn.x, e.spawn.z), e.spawn.z); e.setState('idle'); e.aggro = false;
    e.status = { burn: 0, burnD: 0, poison: 0, poisonD: 0, slow: 0 }; e.kb.set(0, 0, 0); e.cool = 1;
    if (wasDead && e.T.onRespawn) e.T.onRespawn(e);
    if (e.rig) { e._deathPlayed = false; e._ast = null; e.model.position.y = e.pos.y; e.rig.play(e.base === 'wolf' ? 'Idle' : 'Idle_Sword', { restart: true, fade: 0 }); }
  }
  function respawnPlayer() {
    $('death').classList.add('hidden');
    fade(() => {
      if (G.dungeon) leaveLevel(true);
      const P = G.player, sp = G.respawn || { x: GW.World.L.start.x, z: GW.World.L.start.z + 5 };
      P.state = 'move'; P.hp = P.maxHp; P.flasks = P.maxFlasks; P.st = 100; P.fo = 60;
      resetEnemies(); P.place(sp.x, sp.z + 2.2);
      G.state = 'play'; $('hud').classList.remove('hidden');
    });
  }

  // ---------------- combat ----------------
  G.onAggro = function (e) {
    if (e.T.boss) return;
    UI.float('!', e.pos, { cls: 'alert', life: 0.8, rise: 0.6, y: e.T.radius * 2 + 1.6 });
    if (e.base === 'wolf' && Math.random() < 0.5) GWAudio.sfx('howl');
    if (e.type === 'wolf' && !G.hintsShown.roll) { G.hintsShown.roll = true; UI.hint(I.touch ? 'Wolves lunge. Tap <b>⟲</b> to roll through them: you can\'t be hit mid-roll.' : 'Wolves lunge. Press <b>Space</b> to roll through them: you can\'t be hit mid-roll.', 6); }
    if (e.type === 'hollow' && !G.hintsShown.block) { G.hintsShown.block = true; UI.hint('Hollows raise their shields. Your <b>third combo hit</b> and skills break the guard.', 6); }
  };
  G.hitEnemy = function (e, dmg, o) {
    o = o || {};
    if (!e.alive) return;
    const P = G.player, ws = P.ws;
    if (e.T.boss && (!G.bossActive || (G.curBoss && G.curBoss !== e && e.type !== 'warden'))) return;
    if (e.type === 'husk' && QUESTS[G.stage].id !== 'wake' && e.hp <= dmg) { /* husks keep standing after the tutorial */ }
    let crit = false;
    if (!o.dot && !o.chain) {
      if (Math.random() < ws.crit) { crit = true; dmg *= 1.8; }
      if (e.T.kind === 'undead') dmg *= 1 + ws.undead;
      // hollow guard
      if (o.melee && e.base === 'hollow' && !e.T.boss && !o.heavy && (e.state === 'chase' || e.state === 'recover' || e.state === 'block') && Math.random() < 0.38) {
        const a = Math.atan2(P.pos.x - e.pos.x, P.pos.z - e.pos.z);
        if (Math.abs(GW.angDiff(e.yaw, a)) < 1.0) {
          e.setState('block'); e.aggro = true; GWAudio.sfx('block');
          UI.float('BLOCK', e.pos, { color: '#9ab', size: 11 });
          G.parts.spark.burst(e.pos.x + Math.sin(e.yaw) * 0.6, e.pos.y + 1.4, e.pos.z + Math.cos(e.yaw) * 0.6, 8, 4, 0xffe0a0, 0.3, 0.7, -5);
          G.hitstop = 0.04; P.st -= 6; return;
        }
      }
    }
    if (G.buff && G.buff.kind === 'might' && G.t < G.buff.until) dmg *= 1.25;
    if (P.mightT > 0) dmg *= 1.25;
    if (!o.dot && !o.chain && P.critNext) { P.critNext = false; if (!crit) { crit = true; dmg *= 1.8; } }
    if (e.brokenT > 0 && !o.finisher) dmg *= 1.3;   // broken enemies take more from every hit
    dmg = Math.max(1, Math.round(dmg));
    if (!o.dot && !(e.brokenT > 0)) { e.brk = (e.brk || 0) + dmg * (o.brk || 0.6) * (o.riposte ? 2 : 1); if (e.brk >= G.brkMax(e)) G.breakEnemy(e); }
    e.hp -= dmg; e.flash = 1; e.aggro = true; e.lastHit = G.t;
    const col = o.dot === 'burn' ? '#ff9a40' : o.dot === 'poison' ? '#8aff6a' : o.chain ? '#c8a0ff' : crit ? '#ffd040' : '#ffffff';
    UI.float(String(dmg) + (crit ? '!' : ''), e.pos, { color: col, size: crit ? 18 : o.dot ? 11 : 14, y: e.T.radius * 2 + 0.8, life: crit ? 1.1 : 0.85 });
    if (!o.dot) {
      GWAudio.sfx(crit ? 'crit' : 'hit', o.heavy ? 1.3 : 1);
      const hx = e.pos.x, hy = e.pos.y + Math.min(1.2, e.T.radius * 1.6), hz = e.pos.z;
      G.parts.spark.burst(hx, hy, hz, crit ? 16 : 9, crit ? 7 : 5, P.ws.trail, 0.35, 0.8, -8);
      G.addHitGlyphs(hx, hy, hz, crit ? 10 : 5, crit ? '#ffd860' : '#f0f0ff');
      if (e.T.kind === 'beast') G.parts.blood.burst(hx, hy, hz, 6, 3, 0x8a1010, 0.6, 1, -10);
      if (e.T.kind === 'construct' || e.T.kind === 'undead') G.parts.dust.burst(hx, hy, hz, 5, 3, 0xb8b0a0, 0.5, 1, -9);
      if (o.from && !e.T.boss) {
        const dx = e.pos.x - o.from.x, dz = e.pos.z - o.from.z, d = Math.hypot(dx, dz) || 1, k = (o.heavy ? 9 : 4.5) / (e.T.radius * 1.5);
        e.kb.set(dx / d * k, 0, dz / d * k);
      }
      if (o.melee || o.proj) {
        G.hitstop = Math.max(G.hitstop, o.heavy ? 0.085 : crit ? 0.07 : 0.045);
        G.shake(o.heavy ? 0.25 : 0.12);
        P.fo = Math.min(100, P.fo + 3);
        // rune effects
        if (ws.burn) { e.status.burn = 3; e.status.burnD = Math.max(1, dmg * ws.burn / 6); }
        if (ws.slow) e.status.slow = 2;
        if (ws.poison) { e.status.poison = 4; e.status.poisonD = Math.min(dmg, e.status.poisonD * 0.6 + dmg * ws.poison); }
        if (ws.steal) P.hp = Math.min(P.maxHp, P.hp + dmg * ws.steal);
        if (ws.chain && Math.random() < ws.chain) chain(e, dmg * 0.5);
      }
      // poise / stagger
      if (!e.T.boss) {
        e.poiseDmg = (e.poiseDmg || 0) + dmg * (o.heavy ? 2 : 1);
        if (e.poiseDmg >= e.T.poise && e.state !== 'lunge') { e.poiseDmg = 0; e.setState('stagger'); e.combo2 = false; }
      }
    }
    if (e.hp <= 0) kill(e);
  };
  function chain(src, dmg) {
    const near = G.enemies.filter(o => o !== src && o.alive && o.distTo(src.pos) < 7).sort((a, b) => a.distTo(src.pos) - b.distTo(src.pos)).slice(0, 2);
    GWAudio.sfx('zap');
    for (const o of near) {
      for (let k = 0; k <= 10; k++) { const t = k / 10; G.parts.spark.emit(GW.lerp(src.pos.x, o.pos.x, t) + (Math.random() - 0.5) * 0.5, GW.lerp(src.pos.y, o.pos.y, t) + 1.2 + (Math.random() - 0.5) * 0.6, GW.lerp(src.pos.z, o.pos.z, t) + (Math.random() - 0.5) * 0.5, 0, 0, 0, 0.25, 1.1, 0xc8a0ff, 0); }
      G.hitEnemy(o, dmg, { chain: true });
    }
  }
  function kill(e) {
    const P = G.player;
    e.alive = false; e.deadT = 0; e.dieSide = Math.random() < 0.5 ? -1 : 1; e.diedAt = G.t;
    GWAudio.sfx('die');
    G.parts.spark.burst(e.pos.x, e.pos.y + 1, e.pos.z, 18, 5, e.T.kind === 'undead' ? 0x80c0ff : 0xffb060, 0.8, 1, -4, 2);
    if (e.T.onDeath) e.T.onDeath(e);
    if (e.type === 'husk') { count('husk'); if (QUESTS[G.stage].id !== 'wake') gainXP(1); else gainXP(e.T.xp); return; }
    gainXP(e.T.xp * (1 + P.ws.xp) * (1 + 0.15 * ((e.lvl || 1) - 1)) * (e.elite ? 3 : 1));
    count(e.type);
    give('shards', Math.round((2 + (e.lvl || 1)) * (e.elite ? 5 : 1)), true);
    // drops
    const luck = 1 + P.ws.xp;
    const drops = { wolf: [['rune', ['ember', 'frost', 'venom', 'swift'], 0.12], ['ingot', ['bronze'], 0.12]],
      hollow: [['rune', ['keen', 'ward', 'storm', 'vigor'], 0.16], ['ingot', ['steel', 'silver'], 0.2]],
      wisp: [['rune', ['storm', 'frost', 'thirst'], 0.16], ['ingot', ['duskglass', 'gold'], 0.14]] }[e.base] || [];
    const armorDrops = { wolf: [['armor', ['leather', 'coif'], 0.05]], hollow: [['armor', ['hauberk', 'coif', 'sallet'], 0.08]], wisp: [['armor', ['scale', 'night'], 0.07]] }[e.base] || [];
    drops.push(...armorDrops.filter(([, pool]) => pool.some(k => !P.inv.armor[k])).map(([k, pool, ch]) => [k, pool.filter(x => !P.inv.armor[x]), ch]));
    for (const [kind, pool, ch] of drops) if (Math.random() < ch * luck) spawnPickup(kind, pool[Math.floor(Math.random() * pool.length)], e.pos);
    if (!e.T.boss && Math.random() < (e.hunter ? 0.5 : 0.3)) spawnPickup('kindling', 'kindling', e.pos);
    if (e.elite && Math.random() < 0.25) { const k = G.unknownAbil(); if (k) spawnPickup('abil', k, e.pos); }
    if (e.bossKey) regionBossDefeated(e);
    else if (e.type === 'widow') widowDefeated(e);
    else if (e.T.boss) bossDefeated(e);
  }
  function gainXP(n) {
    const P = G.player; n = Math.round(n);
    P.xp += n;
    UI.float('+' + n + ' xp', P.pos, { color: '#d8b25a', size: 10, y: 2.6, life: 1.1 });
    while (P.xp >= P.need()) {
      P.xp -= P.need(); P.level++; P.recalc(); P.hp = P.maxHp;
      GWAudio.sfx('level'); UI.banner('you feel the ink settle', 'LEVEL ' + P.level, 2.6);
      for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2; G.parts.spark.emit(P.pos.x + Math.cos(a), P.pos.y + 0.3, P.pos.z + Math.sin(a), Math.cos(a) * 2, 4, Math.sin(a) * 2, 1, 1, 0xffd060, -2); }
    }
  }
  G.castleLoot = function () {
    if (G.castleLooted) return;
    const Lw = GW.World.L, y = GW.World.levelAt(Lw.castle.x - 3, Lw.castle.z - 7, 1).y;
    [['armor', 'scale'], ['ingot', 'gold'], ['rune', 'thirst']].forEach(([k, key], i) => {
      spawnPickup(k, key, new V3(Lw.castle.x - 3 + i * 0.9, y, Lw.castle.z - 7.5), y, 'castle');
    });
  };
  function spawnPickup(kind, key, at, fixedY, tag) {
    const col = kind === 'abil' ? new THREE.Color(GW.Abil.LIST[key].col).getHex() : kind === 'kindling' ? 0xd08040 : kind === 'rune' ? GW.Forge.RUNES[key].color : kind === 'armor' ? (GW.Knight.GEAR[GW.Knight.SLOTS.find(sl => GW.Knight.GEAR[sl][key])][key].color) : GW.Forge.METALS[key].color;
    const m = new THREE.Mesh(kind === 'abil' ? new THREE.TorusGeometry(0.26, 0.07, 6, 12) : kind === 'rune' ? new THREE.OctahedronGeometry(0.28, 0) : new THREE.BoxGeometry(0.5, 0.2, 0.3), GW.mat({ id: ID.RUNE, color: 0, emissive: col, unlit: true }));
    const p = at.clone(); p.x += (Math.random() - 0.5) * 1.2; p.z += (Math.random() - 0.5) * 1.2;
    m.position.copy(p); G.scene.add(m);
    const light = GW.World.lights.add(p.x, p.y + 1, p.z, new THREE.Color(col).multiplyScalar(0.6), 4, 0.3);
    G.pickups.push({ kind, key, m, p, t: 0, light, fixedY, tag });
  }
  G.hurtPlayer = function (dmg, from, o) {
    o = o || {};
    if (G.player.horse && G.player.horse.ridden && G.player.iframe <= 0) { dismount(true); UI.toast('Thrown from the saddle!', 1.5); }
    if (G.buff && G.buff.kind === 'ward' && G.t < G.buff.until) dmg *= 0.75;
    const P = G.player;
    if (P.wardT > 0) { dmg *= 0.4; o = Object.assign({}, o, { noStagger: true }); }
    if (P.state === 'dead') return;
    if (P.iframe > 0) {
      // perfect dodge: rolled at the last instant -> glyph-time
      if (P.state === 'roll' && P.t < 0.22 && !o.dot && (!G.pdCd || G.t > G.pdCd)) {
        G.pdCd = G.t + 1.4; G.slowmo(0.3, 0.9); P.critNext = true; P.st = Math.min(100, P.st + 30);
        UI.float('PERFECT', P.pos, { color: '#ffd860', size: 15, y: 2.6, life: 1 }); GWAudio.sfx('socket'); G.addHitGlyphs(P.pos.x, P.pos.y + 1, P.pos.z, 14, '#9fd8ff');
      } else if (!G.dodgeT || G.t - G.dodgeT > 0.6) { G.dodgeT = G.t; UI.float('dodge', P.pos, { color: '#9ad', size: 10, y: 2.4 }); }
      return;
    }
    if (P.state === 'block' && !o.dot && !o.heavy) {
      const ang = from ? Math.atan2(from.x - P.pos.x, from.z - P.pos.z) : P.yaw;
      if (Math.abs(GW.angDiff(P.yaw, ang)) < 1.9) {
        if (G.t - P.blockStart < 0.2) {   // PARRY: the blow is turned aside, the attacker reels, time slows, riposte ready
          G.slowmo(0.25, 0.45); P.riposteT = 1.5; P.st = Math.min(100, P.st + 15);
          GWAudio.sfx('block'); GWAudio.sfx('crit'); G.shake(0.3); G.hitstop = 0.08;
          UI.float('PARRY', P.pos, { color: '#ffd860', size: 16, y: 2.6, life: 1 }); G.addHitGlyphs(P.pos.x + Math.sin(P.yaw) * 0.8, P.pos.y + 1.3, P.pos.z + Math.cos(P.yaw) * 0.8, 16, '#ffe8a0');
          const s = o.src; if (s && s.alive) { s.brk = (s.brk || 0) + G.brkMax(s) * 0.5; s.lastHit = G.t; if (s.brk >= G.brkMax(s)) G.breakEnemy(s); else if (!s.T.boss && s.setState) s.setState('stagger'); }
          return 'parry';
        }
        // blocked: most damage soaked, paid in stamina
        const soak = dmg * 0.8; P.st -= soak * 1.6 + 6; P.stDelay = 0.8; GWAudio.sfx('block');
        G.parts.spark.burst(P.pos.x + Math.sin(P.yaw) * 0.7, P.pos.y + 1.2, P.pos.z + Math.cos(P.yaw) * 0.7, 8, 3, 0xffe0a0, 0.3, 0.7, -5);
        if (P.st <= 0) { P.st = 0; P.state = 'hurt'; P.t = 0; UI.float('GUARD BROKEN', P.pos, { color: '#ff8a60', size: 12, y: 2.5 }); dmg *= 0.5; }
        else { P.hp -= dmg - soak; P.hurtT = 0.1; if (P.hp <= 0) { P.hp = 1; } return 'block'; }
      }
    }
    dmg = Math.round(dmg * (1 - P.ws.ward) * (1 - (P.gs ? P.gs.reduce : 0)));
    P.hp -= dmg; P.hurtT = 0.35; G.hurtFx = Math.min(1, G.hurtFx + 0.6);
    UI.float(String(dmg), P.pos, { color: '#ff5050', size: 15, y: 2.4 });
    GWAudio.sfx('hurt'); G.shake(o.heavy ? 0.6 : 0.3); G.hitstop = 0.06;
    G.parts.blood.burst(P.pos.x, P.pos.y + 1.2, P.pos.z, 8, 3, 0xa01010, 0.6, 1, -10);
    navigator.vibrate && navigator.vibrate(o.heavy ? 60 : 25);
    const dx = P.pos.x - from.x, dz = P.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
    if (!o.noStagger && (P.state !== 'skill' && P.state !== 'charge' && P.state !== 'finisher') || (o.heavy && P.state !== 'finisher')) { P.state = 'hurt'; P.t = 0; P.vel.set(dx / d * (o.heavy ? 11 : 6), 0, dz / d * (o.heavy ? 11 : 6)); }
    if (P.hp <= 0) {
      P.hp = 0; P.state = 'dead'; P.t = 0; G.state = 'dying';
      GWAudio.sfx('die'); UI.boss(false);
      setTimeout(() => { G.state = 'dead'; $('death').classList.remove('hidden'); $('hud').classList.add('hidden'); }, 1600);
    }
  };
  G.telegraph = function (o) { const t = new GW.Telegraph(G.scene, o); G.telegraphs.push(t); return t; };
  G.spawnProjectile = function (o) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(o.r * 0.7, 1), GW.mat({ id: ID.FIRE, color: 0, emissive: o.color, unlit: true }));
    m.position.set(o.x, o.y, o.z); m.layers.set(1); G.scene.add(m);
    const light = GW.World.lights.add(o.x, o.y, o.z, new THREE.Color(o.color).multiplyScalar(0.9), 6, 0.3);
    G.projectiles.push(Object.assign({ pos: new V3(o.x, o.y, o.z), vel: new V3(o.vx, 0, o.vz), m, light, age: 0 }, o));
  };
  G.spawnBoulder = function (sx, sy, sz, tx, tz, flight, dmg) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), GW.mat({ id: ID.STONE, color: 0x8a90a0, rim: 0.4 }));
    G.scene.add(m);
    const ty = GW.World.groundY(tx, tz);
    G.telegraph({ shape: 'circle', x: tx, z: tz, r: 2.2, dur: flight });
    G.boulders.push({ m, s: new V3(sx, sy, sz), e: new V3(tx, ty, tz), t: 0, flight, dmg });
  };
  G.shake = function (a) { if (UI.settings.shake) G.shakeAmt = Math.min(1.2, G.shakeAmt + a); };
  G.pushGrass = function (i, x, z, r) {
    const P = G.player; if (i > 0 && Math.hypot(x - P.pos.x, z - P.pos.z) > 30) return;
    const u = GW.World.grass.push[i % 6]; if (i > 0 && u.z > 0 && Math.hypot(u.x - P.pos.x, u.y - P.pos.z) < Math.hypot(x - P.pos.x, z - P.pos.z)) return;
    u.set(x, z, r);
  };
  function bossDefeated(e) {
    G.bossActive = false; G.arenaLock = false; G.bossDead = true;
    UI.boss(false);
    for (const o of G.enemies) if (o.temp && o.alive) { o.hp = 1; G.hitEnemy(o, 99, { dot: 'burn' }); }
    G.flashWhite = 1; G.shake(1.2); GWAudio.sfx('boom'); GWAudio.sfx('quest');
    for (let k = 0; k < 80; k++) { const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 9; G.parts.spark.emit(e.pos.x, e.pos.y + 3, e.pos.z, Math.cos(a) * s, 3 + Math.random() * 8, Math.sin(a) * s, 2, 1.4, Math.random() < 0.5 ? 0x60d0ff : 0xffd060, -6); }
    GW.World.arenaStones.forEach(s => { s.band.material.uniforms.uEmissive.value.setRGB(0.3, 0.8, 1.0); });
    spawnPickup('ingot', 'starfall', e.pos); spawnPickup('armor', 'horned', e.pos); spawnPickup('armor', 'ember', e.pos); spawnPickup('rune', 'thirst', e.pos); spawnPickup('rune', 'venom', e.pos);
    setTimeout(() => { UI.banner('VERTICAL SLICE COMPLETE', 'THE WARDEN FALLS', 6); }, 1200);
    setTimeout(() => { if (QUESTS[G.stage].id === 'boss') advance(); }, 7000);
    save();
  }

  G.bossesDead = {};
  function regionBossDefeated(e) {
    G.bossActive = false; G.curBoss = null; G.bossesDead[e.bossKey] = true; UI.boss(false);
    G.shake(1.0); GWAudio.sfx('boom'); GWAudio.sfx('quest');
    for (let k = 0; k < 60; k++) { const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 8; G.parts.spark.emit(e.pos.x, e.pos.y + 2, e.pos.z, Math.cos(a) * s, 2 + Math.random() * 6, Math.sin(a) * s, 2, 1.3, 0xffd070, -6); }
    const P = G.player, left = GW.Knight.SLOTS.flatMap(sl => Object.keys(GW.Knight.GEAR[sl])).filter(k => !P.inv.armor[k] && !/^none/.test(k));
    give('shards', 300 + 20 * (e.lvl || 1));
    if (left.length) spawnPickup('armor', left[Math.floor(Math.random() * left.length)], e.pos);
    spawnPickup('rune', 'thirst', e.pos); spawnPickup('ingot', 'starfall', e.pos);
    if (GW.Abil.BOSS[e.bossKey]) spawnPickup('abil', GW.Abil.BOSS[e.bossKey], e.pos);
    for (const en of G.enemies) if (en.temp && en.alive) { en.hp = 1; G.hitEnemy(en, 99, { dot: 'burn' }); }
    UI.banner('the region breathes again', e.T.name + ' FALLS', 4);
    save();
  }
  function widowDefeated(e) {
    G.bossActive = false; G.curBoss = null; G.widowDead = true; UI.boss(false);
    G.shake(1.0); GWAudio.sfx('boom'); GWAudio.sfx('quest');
    for (let k = 0; k < 60; k++) { const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 8; G.parts.spark.emit(e.pos.x, e.pos.y + 2, e.pos.z, Math.cos(a) * s, 2 + Math.random() * 6, Math.sin(a) * s, 2, 1.3, 0xd8e4ff, -6); }
    spawnPickup('abil', 'snare', e.pos); spawnPickup('armor', 'night', e.pos); spawnPickup('ingot', 'duskglass', e.pos); spawnPickup('rune', 'venom', e.pos); spawnPickup('kindling', 'kindling', e.pos); spawnPickup('kindling', 'kindling', e.pos);
    UI.banner('the hollow falls silent', 'DUSK WIDOW FELLED', 4);
    save();
  }
  G.webBurst = function (x, z) {
    const y = GW.World.heightAt(x, z);
    G.parts.spark.burst(x, y + 0.4, z, 28, 5, 0xe0e8ff, 0.8, 1.2, -3, 1.5);
    G.parts.spark.burst(x, y + 0.2, z, 12, 2, 0xa0b8ff, 1.2, 1.4, -1, 0.5);
  };

  // ---------------- interaction ----------------
  function nearestInteract() {
    const P = G.player; let best = null, bd = 1e9;
    for (const it of GW.World.interact) { if ((it.floor || 0) !== (P.floor || 0) || (it.type === 'chest' && G.opened[it.id])) continue; const d = Math.hypot(P.pos.x - it.x, P.pos.z - it.z); if (d < it.r && d < bd) { bd = d; best = it; } }
    return best;
  }
  function doInteract(it) {
    if (it.type === 'rest') rest(it);
    else if (it.type === 'forge') openForge();
    else if (it.type === 'npc') talk(it.npc);
    else if (it.type === 'hatch') { const T = GW.World.tower; fade(() => { G.player.place(T.door.x, T.door.z + 0.8); G.player.yaw = 0; G.snapCam = true; }); }
    else if (it.type === 'chest') openChest(it);
    else if (it.type === 'shrine') { const kinds = [['might', 'Shrine of Might: +25% damage'], ['ward', 'Shrine of Warding: -25% damage taken'], ['swift', 'Shrine of the Wind: +15% speed']], k = kinds[it.poi.seed % 3];
      G.buff = { kind: k[0], until: G.t + 300 }; GWAudio.sfx('socket'); UI.banner('for five minutes', k[1].toUpperCase(), 2.6); G.parts.spark.burst(it.x, G.player.pos.y + 1, it.z, 30, 4, 0x9fd8ff, 0.8, 1.2, -2, 2); }
    else if (it.type === 'waystone') { const p = it.poi, nm = GW.World.REGIONS[p.region].name.replace('THE ', '').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()) + ' waystone ' + p.id;
      if (!G.waystones[p.id]) { G.waystones[p.id] = { x: p.x, z: p.z + 2.6, name: nm }; UI.toast('<span style="color:#9fd8ff">◊</span> Waystone attuned', 2.5); save(); }
      const list = travelList(p.x, p.z, null); if (list.length) { G.state = 'travel'; UI.showTravel(list, f => { G.state = 'play'; if (f) travelTo(f); }); } }
    else if (it.type === 'vista') { revealFog(it.x, it.z, 650); UI.banner('the land opens before you', 'VISTA', 2.4); GWAudio.sfx('quest'); }
    else if (it.type === 'shop') openShop(it.poi.region, 'A wandering trader');
    else if (it.type === 'cave') enterLevel({ kind: 'cave', id: 'cave:' + it.poi.id, seed: it.poi.seed, region: it.poi.region, lvl: it.poi.lvl + 2, floors: 1, names: ['THE CAVE'], back: { x: it.x, z: it.z + 2 } });
    else if (it.type === 'castle') { const L = GW.World.L; enterLevel({ kind: 'castle', id: 'dunmaer', seed: 9137, region: 'high', lvl: 1 + Math.floor(Math.hypot(L.dunmaer.x, L.dunmaer.z) / 280) + 3, floors: 3,
      names: ['THE GATEHALL', 'THE GREAT HALL', 'THE CROWN TOWER'], back: { x: it.x, z: it.z + 2.5 } }); }
    else if (it.type === 'dexit') fade(() => leaveLevel(false));
    else if (it.type === 'dstairs') fade(() => buildFloor(G.dungeon.floor + 1));
  }
  // ---------------- dungeons: caves and Castle Dunmaer are separate levels ----------------
  G.dungeon = null;
  const DPOOL = { vale: ['wolf', 'hollow', 'wisp'], frost: ['frostwolf', 'rimeshade'], high: ['highguard', 'cragwolf'], ash: ['ashhound', 'cinderling', 'hollow'], salt: ['dunehollow', 'saltwraith'], mire: ['mirehollow', 'bogwisp'], dusk: ['duskwolf', 'wisp'] };
  function enterLevel(def) {
    const P = G.player; if (P.horse && P.horse.ridden) dismount(false);
    fade(() => {
      // hide the overworld (its own enemies hide themselves by distance)
      const keep = [P.model, P.shadow, P.trail && P.trail.mesh];
      G.hiddenWorld = []; for (const o of G.scene.children) if (o.visible && !keep.includes(o)) { o.visible = false; G.hiddenWorld.push(o); }
      G.dungeon = Object.assign({ floor: -1, enemies: [], lv: null }, def);
      buildFloor(0);
    });
  }
  function clearFloor() {
    const d = G.dungeon; if (!d || !d.lv) return;
    GW.Dungeon.destroy(G.scene, d.lv);
    d.enemies.forEach(e => { e.alive = false; G.scene.remove(e.model); G.scene.remove(e.shadow); if (e.ring) G.scene.remove(e.ring); if (e.T.onDeath && e.light) e.T.onDeath(e); });
    G.enemies = G.enemies.filter(e => !d.enemies.includes(e)); d.enemies = []; d.lv = null;
  }
  function buildFloor(f) {
    const d = G.dungeon, P = G.player, W = GW.World; clearFloor();
    d.floor = f;
    const lv = d.lv = GW.Dungeon.build(G.scene, d.seed + f * 977, d.kind, 0), last = lv.rooms.length - 1, pool = DPOOL[d.region] || DPOOL.vale, R = GW.rand(d.seed + f * 31);
    // enemies in every room but the first; the last room is guarded harder
    lv.rooms.forEach((r, i) => { if (i === 0) return;
      const n = i === last ? 2 : 2 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) { const tx = r.x0 + 1 + Math.floor(R() * (r.x1 - r.x0 - 1)), tz = r.z0 + 1 + Math.floor(R() * (r.z1 - r.z0 - 1)), [x, z] = lv.at(tx, tz);
        const e = G.spawnEnemy(pool[Math.floor(R() * pool.length)], x, z, { x, z }, false, d.lvl + f, i === last && k === 0); e.dungeon = true; d.enemies.push(e); } });
    const top = f >= d.floors - 1, [ex, ez] = lv.end, [sx, sz] = lv.start;
    const glow = (x, z, col) => { const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.3, 24).rotateX(-Math.PI / 2), GW.mat({ id: ID.RUNE, color: 0, emissive: col, unlit: true, side: THREE.DoubleSide })); m.position.set(x, 0.05, z); G.scene.add(m); lv.meshes.push(m); lv.lights.push(W.lights.add(x, 1.5, z, new THREE.Color(col).multiplyScalar(0.8), 6, 0.3)); };
    const add = it => { W.interact.push(it); lv.inter.push(it); };
    glow(sx, sz, 0x6ab8ff); add({ type: 'dexit', x: sx, z: sz, r: 2.2, label: f === 0 ? 'Leave' : 'Leave the castle' });
    if (top) { const id = d.id + ':chest'; if (!G.opened[id]) { add({ type: 'chest', x: ex, z: ez, r: 1.8, label: 'Open the chest', id, poi: { seed: d.seed + 5, lvl: d.lvl + f, type: 'elite' } });
        const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.65), GW.mat({ id: ID.PLANKS, tex: 2, color: 0x9a7040 })); box.position.set(ex, 0.3, ez); G.scene.add(box); lv.meshes.push(box); } }
    else { glow(ex, ez, 0xffd070); add({ type: 'dstairs', x: ex, z: ez, r: 2.2, label: 'Climb to ' + (d.names[f + 1] || 'the next floor').toLowerCase() }); }
    P.place(sx + 2.5, sz); P.floor = 0; G.snapCam = true;
    UI.banner(d.kind === 'castle' ? 'floor ' + (f + 1) + ' of ' + d.floors : 'level ' + d.lvl, d.names[f] || 'THE DEPTHS', 2.8);
  }
  function leaveLevel(silent) {
    const d = G.dungeon; if (!d) return;
    clearFloor(); (G.hiddenWorld || []).forEach(o => { o.visible = true; }); G.hiddenWorld = null;
    G.dungeon = null;
    if (!silent) { const P = G.player; P.place(d.back.x, d.back.z); G.snapCam = true; GW.World._streamBudget = 99; GW.World.dataWindow(d.back.x, d.back.z, true); GW.World.terrainRefresh(true, d.back.x, d.back.z); }
  }
  // ---------------- travel targets: found fires and attuned waystones ----------------
  function travelList(x, z, exclude) {
    const out = GW.World.fires.filter(f => !f.out && !f.rest.own && G.discovered[f.rest.name] && f.rest !== exclude).map(f => ({ name: '▲ ' + f.rest.name, x: f.x, z: f.z }));
    for (const id in G.waystones) { const w = G.waystones[id]; if (Math.hypot(w.x - x, w.z - z) > 6) out.push({ name: '◊ ' + w.name, x: w.x, z: w.z }); }
    return out.map(f => Object.assign(f, { dist: Math.round(Math.hypot(f.x - x, f.z - z)) })).sort((a, b) => a.dist - b.dist);
  }
  function revealFog(x, z, R) {
    const S = GW.World.SIZE, FC = G.FOG_CELL, FN = G.FOG_N;
    for (let j = Math.max(0, Math.floor((z - R + S / 2) / FC)); j <= Math.min(FN - 1, Math.floor((z + R + S / 2) / FC)); j++)
      for (let i = Math.max(0, Math.floor((x - R + S / 2) / FC)); i <= Math.min(FN - 1, Math.floor((x + R + S / 2) / FC)); i++)
        if (Math.hypot((i + 0.5) * FC - S / 2 - x, (j + 0.5) * FC - S / 2 - z) < R) G.fog[j * FN + i] = 1;
    // places inside become known
    for (const p of GW.World.poisNear(x, z, R)) if (p.type !== 'ambush') G.poiSeen[p.id] = p.type;
  }
  // ---------------- shards: the trader's shop ----------------
  function openShop(region, who) {
    const P = G.player, F = GW.Forge;
    const runeKeys = Object.keys(F.RUNES), metalKeys = Object.keys(F.METALS).filter(k => k !== 'iron');
    const armorLeft = GW.Knight.SLOTS.flatMap(sl => Object.keys(GW.Knight.GEAR[sl])).filter(k => !P.inv.armor[k] && !/^none/.test(k));
    const items = [
      { label: '♨ Kindling', cost: 8, buy: () => give('kindling', 'kindling') },
      { label: '♥ Refill flasks', cost: 12, ok: () => P.flasks < P.maxFlasks, buy: () => { P.flasks = P.maxFlasks; } },
      { label: '♥ Extra flask (+1 max)', cost: 60 + 40 * (P.extraFlasks || 0), ok: () => (P.extraFlasks || 0) < 3, buy: () => { P.extraFlasks = (P.extraFlasks || 0) + 1; P.maxFlasks++; P.flasks++; } },
      { label: '✶ A rune (random)', cost: 45, buy: () => give('rune', runeKeys[Math.floor(Math.random() * runeKeys.length)]) },
      { label: '▬ An ingot (random)', cost: 35, buy: () => give('ingot', metalKeys[Math.floor(Math.random() * metalKeys.length)]) },
      { label: '⛨ Armour piece (random)', cost: 140, ok: () => armorLeft.length > 0, buy: () => give('armor', armorLeft[Math.floor(Math.random() * armorLeft.length)]) },
    ];
    // abilities: this region's own art, and an old scroll of something wilder
    const A = GW.Abil, book = A.ensure(P);
    for (const k in A.LIST) { const a = A.LIST[k]; if (a.src === 'shop' && a.region === region) {
      items.push({ label: `<span style="color:${a.col}">${a.g}</span> Ability: ${a.name}`, cost: 180, ok: () => !book.known[k], buy: () => give('abil', k) }); } }
    const scroll = G.unknownAbil(); if (scroll) items.push({ label: '✎ Old glyph scroll (unknown ability)', cost: 320, ok: () => !!G.unknownAbil(), buy: () => { const k = G.unknownAbil(); if (k) give('abil', k); } });
    G.state = 'shop';
    UI.showShop(who, P.inv.shards || 0, items, it => {
      if ((P.inv.shards || 0) < it.cost || (it.ok && !it.ok())) { GWAudio.sfx('ui'); return false; }
      P.inv.shards -= it.cost; it.buy(); GWAudio.sfx('pickup'); save(); return P.inv.shards;
    }, () => { G.state = 'play'; });
  }
  // ---------------- bounties: clear camps in the region ----------------
  function bountyTalk(npc) {
    const r = npc.region, R = GW.World.REGIONS[r], b = G.bounty[r] || (G.bounty[r] = { tier: 0, need: 0, done: 0 });
    if (!b.need) {
      b.need = 3 + b.tier; b.done = 0;
      return UI.dialog([{ who: npc.name, text: `Camps are spreading through ${R.name.toLowerCase()}. Break ${b.need} of them and come back. I pay in shards and in things worth more.` }], () => { UI.toast(`Bounty: clear ${b.need} camps in ${R.name}`, 3); save(); });
    }
    if (b.done < b.need) return UI.dialog([{ who: npc.name, text: `${b.done} of ${b.need} camps broken. The rest are still out there. Your map marks them once you have seen them.` }]);
    const reward = 80 + b.tier * 50;
    return UI.dialog([{ who: npc.name, text: 'Good work. The roads breathe easier. Take this.' }], () => {
      give('shards', reward); const P = G.player, armorLeft = GW.Knight.SLOTS.flatMap(sl => Object.keys(GW.Knight.GEAR[sl])).filter(k => !P.inv.armor[k] && !/^none/.test(k));
      if (armorLeft.length) give('armor', armorLeft[Math.floor(Math.random() * armorLeft.length)]); else give('rune', 'thirst');
      gainXP(150 + b.tier * 100); b.tier++; b.need = 0; b.done = 0; save();
    });
  }
  // ---------------- points of interest: enemies appear as you approach, vanish when you leave ----------------
  G.cleared = {}; G.poiSeen = {}; G.poiLive = {}; G.waystones = {}; G.bounty = {};
  const POI_ENEMY = { vale: ['wolf', 'hollow', 'wisp'], frost: ['frostwolf', 'rimeshade'], high: ['cragwolf', 'highguard'], ash: ['ashhound', 'cinderling', 'hollow'], salt: ['dunehollow', 'saltwraith'], mire: ['mirehollow', 'bogwisp'], dusk: ['duskwolf', 'wisp'] };
  function poiTick() {
    const P = G.player, W = GW.World;
    if (G.dungeon) return;
    for (const p of W.poisNear(P.pos.x, P.pos.z, 115)) {
      const d = Math.hypot(p.x - P.pos.x, p.z - P.pos.z);
      if (d < 60 && p.type !== 'ambush' && !G.poiSeen[p.id]) G.poiSeen[p.id] = p.type;
      if (!['camp', 'elite', 'ambush'].includes(p.type) || G.cleared[p.id] || G.poiLive[p.id]) continue;
      if (p.type === 'ambush' && d > 26) continue;
      const pool = POI_ENEMY[p.region] || POI_ENEMY.vale, R = GW.rand(p.seed + 7), list = [];
      const n = p.type === 'elite' ? 1 : p.type === 'ambush' ? 3 : 3 + Math.floor(R() * 2);
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2 + R(), r = p.type === 'ambush' ? 9 : 3;
        const ex = (p.type === 'ambush' ? P.pos.x : p.x) + Math.cos(a) * r, ez = (p.type === 'ambush' ? P.pos.z : p.z) + Math.sin(a) * r;
        const e = G.spawnEnemy(pool[Math.floor(R() * pool.length)], ex, ez, { x: p.x, z: p.z }, false, p.lvl, p.type === 'elite');
        e.poi = p.id; if (p.type === 'ambush') e.aggro = true; list.push(e);
      }
      if (p.type === 'ambush') UI.toast('Ambush!', 1.5);
      G.poiLive[p.id] = { p, list };
    }
    for (const id in G.poiLive) {
      const L = G.poiLive[id], d = Math.hypot(L.p.x - P.pos.x, L.p.z - P.pos.z);
      if (L.list.every(e => !e.alive)) {
        G.cleared[id] = true; delete G.poiLive[id];
        if (L.p.type !== 'ambush') { UI.toast(L.p.type === 'elite' ? 'Elite slain' : 'Camp broken', 2); const b = G.bounty[L.p.region]; if (b && b.need && b.done < b.need) { b.done++; if (b.done >= b.need) UI.toast('Bounty complete: return to the village', 3); } }
        save(); continue;
      }
      if (d > 240) { L.list.forEach(e => { if (e.alive) { e.alive = false; G.scene.remove(e.model); G.scene.remove(e.shadow); if (e.ring) G.scene.remove(e.ring); if (e.T.onDeath) e.T.onDeath(e); } }); G.enemies = G.enemies.filter(e => !L.list.includes(e)); delete G.poiLive[id]; }
    }
    // shrine of the wind
    P.buffMove = G.buff && G.buff.kind === 'swift' && G.t < G.buff.until ? 1.15 : 1;
  }
  // ---- vertical ruins: walking into the tower door takes you to the roof ----
  G.opened = {};
  function towerDoor() {
    const T = GW.World.tower, P = G.player; if (!T || !T.door || (P.floor || 0) !== 0 || G._tpT > G.t) return;
    if (Math.hypot(P.pos.x - T.door.x, P.pos.z - T.door.z) < 1.1 && P.mvel && (P.mvel.z || 0) < -0.5) {
      G._tpT = G.t + 2;
      fade(() => { P.place(T.x - 0.4, T.z + 1.6); P.floor = 2; P.pos.y = T.topY; P.yaw = Math.PI; G.snapCam = true; UI.banner('', 'THE IVY WATCH · ROOF', 2.2); });
    }
  }
  function openChest(it) {
    G.opened[it.id] = true; save();
    const P = G.player, y = P.pos.y, at = new V3(it.x, y, it.z);
    GWAudio.sfx('quest'); G.parts.spark.burst(it.x, y + 0.6, it.z, 30, 4, 0xffd070, 0.8, 1, -3, 2);
    if (it.poi) {   // wilderness chests: shards and a random find
      const p = it.poi, R = GW.rand(p.seed + 3), F = GW.Forge, rk = Object.keys(F.RUNES), mk = Object.keys(F.METALS).filter(k => k !== 'iron');
      give('shards', 14 + p.lvl * 5 + Math.floor(R() * 10));
      const loot = [['kindling', 'kindling'], R() < 0.5 ? ['rune', rk[Math.floor(R() * rk.length)]] : ['ingot', mk[Math.floor(R() * mk.length)]]];
      const left = GW.Knight.SLOTS.flatMap(sl => Object.keys(GW.Knight.GEAR[sl])).filter(k => !P.inv.armor[k] && !/^none/.test(k));
      if (left.length && R() < (p.type === 'elite' ? 0.6 : 0.15)) loot.push(['armor', left[Math.floor(R() * left.length)]]);
      if (R() < (p.type === 'elite' ? 0.5 : 0.18)) { const k = G.unknownAbil(); if (k) loot.push(['abil', k]); }
      loot.forEach(([k, key]) => spawnPickup(k, key, at, y)); return;
    }
    const armor = ['night', 'scale', 'sallet', 'hauberk'].find(k => !P.inv.armor[k]);
    const loot = [['kindling', 'kindling'], ['kindling', 'kindling'], ['rune', 'storm'], ['ingot', 'duskglass']];
    if (armor) loot.push(['armor', armor]);
    loot.forEach(([k, key]) => spawnPickup(k, key, at, y));
  }

  // ---------------- save ----------------
  function save() {
    if (G.state === 'title') return;
    const P = G.player;
    const d = { v: 1, tod: G.tod, gear: P.gear, level: P.level, xp: P.xp, flasks: P.flasks, weapon: P.weapon, inv: P.inv, stage: G.stage, counters: G.counters, respawn: G.respawn, bossDead: !!G.bossDead, castleLooted: !!G.castleLooted, opened: G.opened, widowDead: !!G.widowDead, bossesDead: G.bossesDead, cleared: G.cleared, poiSeen: G.poiSeen, waystones: G.waystones, bounty: G.bounty, extraFlasks: G.player.extraFlasks || 0, discovered: G.discovered, fog: fogPack(),
      fires: G.ownFires.map(f => ({ x: f.x, z: f.z, left: f.left })) };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch (e) { /* storage blocked */ }
  }
  function loadData() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; } }
  G.save = save;

  // ---------------- camera ----------------
  const camT = new V3(), camLook = new V3(), _snapA = new V3(), _snapR = new V3(), _snapU = new V3(), _snapP = new V3();
  G.gridOff = new THREE.Vector2(0, 0);
  // ---- hero behind a wall or tree: a dotted silver silhouette drawn through it (x-ray is optional now) ----
  const _hp = new THREE.Vector3(), _dir = new THREE.Vector3();
  let hiddenK = 0, hiddenTest = 0, hidden = false, hiddenHold = 0;
  function drawHiddenHero(dt) {
    const P = G.player, C = G.camera, W = GW.World;
    if (G.state !== 'play') { hiddenK = 0; return; }
    if (--hiddenTest <= 0) {
      hiddenTest = 3; let any = false;
      // only things within ~30 m of the hero can hide him (the camera is near-orthographic)
      if (!G._occT || G.t - G._occT > 0.5) {
        G._occT = G.t; G._occ = (W.occluders || []).filter(o => { const bs = o.geometry.boundingSphere || (o.computeBoundingSphere && o.computeBoundingSphere(), o.boundingSphere); const sp = o.boundingSphere || bs; if (!sp) return false;
          const cx = sp.center.x + (o.isInstancedMesh ? 0 : o.position.x), cz = sp.center.z + (o.isInstancedMesh ? 0 : o.position.z); return Math.hypot(cx - P.pos.x, cz - P.pos.z) < sp.radius + 30; });
      }
      for (const hgt of [0.4, 0.9, 1.4, 1.85]) {
        _hp.set(P.pos.x, P.pos.y + hgt, P.pos.z); _dir.subVectors(C.position, _hp).normalize();
        const from = _hp.clone().addScaledVector(_dir, 28);                     // start 28 m toward the camera, cast back at the hero
        const rc = new THREE.Raycaster(from, _dir.clone().negate(), 0, 27.4);
        const hits = rc.intersectObjects(G._occ, false); if (hits.length) { any = true; break; }
      }
      if (any) hiddenHold = 1.0;   // stay shown a moment, so edges of roofs don't make it flicker
      // inside: something solid overhead (a roof) -> cut-away view instead of the outline
      { _hp.set(P.pos.x, P.pos.y + 2.0, P.pos.z); const up = new THREE.Raycaster(_hp.clone(), new THREE.Vector3(0, 1, 0), 0, 25);
        const inside = up.intersectObjects(G._occ || [], false).some(h => !(h.object.isInstancedMesh && /kit_(pine|oak|dead)|nat_|^cone|^trunk/.test(h.object.name || '')));
        G._insideHold = inside ? 0.5 : (G._insideHold || 0) - 0.05; G.heroInside = G._insideHold > 0; }
    }
    hiddenHold -= Math.min(0.1, dt || 0.016); hidden = hiddenHold > 0;
    hiddenK += ((hidden ? 1 : 0) - hiddenK) * Math.min(1, (dt || 0.016) * 10);
    G.heroHidden = hiddenK > 0.3;
  }
  // second pass over the hero's meshes: drawn only where something is in front of him (depth test 'greater')
  const silMats = new WeakMap();
  function silhouettePass(r, camera) {
    const md = UI.settings.seeMode !== undefined ? UI.settings.seeMode : 2;
    if (!G.heroHidden) return;
    if ([3, 4, 6].includes(md)) return;                 // the wall itself opens up around him
    if (md !== 0 && G.heroInside) return;               // roof modes: he is visible from above
    const scene = G.scene, hide = [];
    // render just the hero: temporarily hide every other top-level object
    scene.children.forEach(o => { if (o !== G.player.model && o.visible) { o.visible = false; hide.push(o); } });
    const swaps = [];
    G.player.model.traverse(m => {
      if (!m.isMesh || !m.material || !m.material.uniforms) return;
      let s = silMats.get(m.material);
      if (!s) {
        s = new THREE.ShaderMaterial({ uniforms: Object.assign({}, m.material.uniforms, { uSil: { value: 1 } }), vertexShader: m.material.vertexShader, fragmentShader: m.material.fragmentShader,
          side: m.material.side, vertexColors: m.material.vertexColors, depthFunc: THREE.GreaterDepth, depthWrite: false });
        silMats.set(m.material, s);
      }
      swaps.push([m, m.material]); m.material = s;
    });
    const bg = scene.background; scene.background = null;
    r.render(scene, camera);
    scene.background = bg;
    swaps.forEach(([m, mat]) => { m.material = mat; });
    hide.forEach(o => { o.visible = true; });
  }
  // ---- 'dark outside' mode: inside a building, everything beyond the room fades to black ----
  let darkK = 0;
  function drawDarkOutside() {
    const md = UI.settings.seeMode !== undefined ? UI.settings.seeMode : 2;
    darkK += (((md === 5 && G.heroInside && G.state === 'play') ? 1 : 0) - darkK) * 0.08;
    if (darkK < 0.02 || !fxCx) return;
    const P = G.player, C = G.camera, v = new THREE.Vector3(P.pos.x, P.pos.y + 1, P.pos.z).project(C), v2 = new THREE.Vector3(P.pos.x + 9, P.pos.y + 1, P.pos.z).project(C);
    const x = (v.x * 0.5 + 0.5) * fxCv.width, y = (-v.y * 0.5 + 0.5) * fxCv.height, r = Math.max(60, Math.abs(v2.x - v.x) * 0.5 * fxCv.width);
    const g = fxCx.createRadialGradient(x, y, r * 0.55, x, y, r * 1.25);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(1,2,4,${0.88 * darkK})`);
    fxCx.fillStyle = g; fxCx.fillRect(0, 0, fxCv.width, fxCv.height);
  }
  // ---- weather: glyph rain in the Vale (comes and goes), snow in Frostmere, drifting ash in the Barrens ----
  const WX = { parts: [], rain: 0, snow: 0, ash: 0 };
  function drawWeather(dt) {
    if (!fxCx || !(dt > 0)) return;
    const S = UI.settings, on = S.weather !== false && (G.state === 'play' || G.state === 'paused');
    const b = GW.World.biomeAt(G.player.pos.x, G.player.pos.z), under = !!G.dungeon;
    const rainy = Math.max(0, Math.sin(G.t / 190) * 0.6 + Math.sin(G.t / 73 + 1.7) * 0.5);   // showers come and go
    const tgt = { rain: on && !under ? GW.clamp(rainy, 0, 1) * (1 - b.frost) * (1 - b.ash) : 0, snow: on && !under ? b.frost : 0, ash: on && !under ? b.ash * 0.7 : 0 };
    for (const k of ['rain', 'snow', 'ash']) WX[k] += (tgt[k] - WX[k]) * Math.min(1, dt * 0.6);
    const W = fxCv.width, H = fxCv.height, dpr = W / innerWidth, want = Math.round(WX.rain * 260 + WX.snow * 170 + WX.ash * 90);
    while (WX.parts.length < want) WX.parts.push({ x: Math.random() * W, y: Math.random() * H, k: Math.random(), s: 0.6 + Math.random() * 0.8 });
    if (WX.parts.length > want) WX.parts.length = want;
    if (!want) return;
    const cx = fxCx, tot = WX.rain + WX.snow + WX.ash + 1e-6;
    cx.save(); cx.textAlign = 'center'; cx.textBaseline = 'middle';
    for (const p of WX.parts) {
      const kind = p.k * tot < WX.rain ? 0 : p.k * tot < WX.rain + WX.snow ? 1 : 2;
      if (kind === 0) { p.x += -90 * dt * dpr; p.y += 620 * p.s * dt * dpr; }
      else if (kind === 1) { p.x += Math.sin(G.t * 1.3 + p.k * 40) * 22 * dt * dpr; p.y += 55 * p.s * dt * dpr; }
      else { p.x += (30 + Math.sin(G.t + p.k * 30) * 25) * dt * dpr; p.y += 18 * p.s * dt * dpr - Math.sin(G.t * 0.7 + p.k * 9) * 6 * dt * dpr; }
      if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; } if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
      if (kind === 0) { cx.font = `${Math.round(13 * dpr)}px ui-monospace, Menlo, monospace`; cx.fillStyle = 'rgba(190,205,230,.45)'; cx.fillText('/', p.x, p.y); }
      else if (kind === 1) { cx.font = `${Math.round((8 + p.s * 5) * dpr)}px ui-monospace, Menlo, monospace`; cx.fillStyle = 'rgba(235,242,255,.8)'; cx.fillText(p.k < 0.5 ? '*' : '.', p.x, p.y); }
      else { cx.font = `${Math.round(9 * dpr)}px ui-monospace, Menlo, monospace`; cx.fillStyle = p.k > 0.85 ? 'rgba(255,140,60,.8)' : 'rgba(150,140,130,.6)'; cx.fillText(p.k > 0.85 ? "'" : '.', p.x, p.y); }
    }
    cx.restore();
  }
  // ---- frame-rate readout + automatic render resolution (Auto: drop supersampling when frames get slow) ----
  const PF = { ema: 1 / 60, slowT: 0, fastT: 0, cool: 0, shown: 0, acc: 0, n: 0 };
  function perfGovernor(dt) {
    const R = G.R, S = UI.settings; if (!(dt > 0) || dt > 0.5) return;
    PF.ema += (dt - PF.ema) * 0.05; PF.acc += dt; PF.n++;
    if (PF.acc > 0.5) {
      const el = $('fps'), fps = PF.n / PF.acc;
      if (el) el.textContent = S.showFps === false ? '' : `${Math.round(fps)} fps · ${Math.round(PF.acc / PF.n * 1000)} ms · ${R.W}×${R.H} (${R.ss}×)`;
      PF.acc = 0; PF.n = 0;
    }
    if ((S.res || 'auto') !== 'auto' || G.state !== 'play') { R.ssLimit = 0; return; }
    PF.cool -= dt;
    if (PF.ema > 1 / 45) { PF.slowT += dt; PF.fastT = 0; } else if (PF.ema < 1 / 57) { PF.fastT += dt; PF.slowT = 0; } else { PF.slowT = PF.fastT = 0; }
    if (PF.slowT > 1.5 && R.ss > 1) { R.ssLimit = R.ss - 1; R.resize(); PF.slowT = 0; PF.cool = 30; PF.ema = 1 / 50; if (UI.resNote) UI.resNote(); }
    else if (PF.fastT > 6 && PF.cool <= 0 && R.ss < R.ssCap) { R.ssLimit = R.ss + 1; R.resize(); PF.fastT = 0; PF.cool = 10; PF.ema = 1 / 50; if (UI.resNote) UI.resNote(); }
  }
  // ---- fire: pure fire-coloured ASCII drawn over the frame (no glyph cell backgrounds, no dark lines) ----
  const FIRE_CH = '@%&$#*8%&@^*', EMBER_CH = "*'.^`+";
  let fxCv = null, fxCx = null;
  const _fv = new THREE.Vector3();
  function drawFireGlyphs() {
    if (!fxCv) {
      fxCv = document.createElement('canvas'); fxCv.id = 'fx';
      fxCv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;';
      const gl = document.getElementById('gl'); gl.parentNode.insertBefore(fxCv, gl.nextSibling); fxCx = fxCv.getContext('2d');
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1), Wd = Math.round(innerWidth * dpr), Hd = Math.round(innerHeight * dpr);
    if (fxCv.width !== Wd || fxCv.height !== Hd) { fxCv.width = Wd; fxCv.height = Hd; }
    const cx = fxCx; cx.clearRect(0, 0, Wd, Hd);
    if (G.state !== 'play' && G.state !== 'title' && G.state !== 'paused') return;
    // cluster live flame meshes into fire spots (campfire = several cones)
    const spots = [];
    for (const f of GW.World.flames) {
      if (f.flat || !f.base) continue;
      if (!f.wp) { f.wp = new THREE.Vector3(); f.m.getWorldPosition(f.wp); f.m.visible = false; }
      if (f.m.parent && !f.m.parent.visible) continue;
      const s = spots.find(o => Math.abs(o.x - f.wp.x) < 0.9 && Math.abs(o.z - f.wp.z) < 0.9);
      if (s) { s.n++; s.y = Math.min(s.y, f.wp.y); } else spots.push({ x: f.wp.x, y: f.wp.y, z: f.wp.z, n: 1 });
    }
    const C = G.camera, t = G.t;
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    for (let si = 0; si < spots.length; si++) {
      const sp = spots[si];
      const big = sp.n > 2, base = sp.y - (big ? 0.35 : 0.1);
      _fv.set(sp.x, base, sp.z).project(C); if (_fv.z > 1 || Math.abs(_fv.x) > 1.2 || Math.abs(_fv.y) > 1.2) continue;
      const bx = (_fv.x * 0.5 + 0.5) * Wd, by = (-_fv.y * 0.5 + 0.5) * Hd;
      _fv.set(sp.x, base + 1, sp.z).project(C); const ppm = Math.max(4, Math.hypot((_fv.x * 0.5 + 0.5) * Wd - bx, (-_fv.y * 0.5 + 0.5) * Hd - by));
      const fs = GW.clamp(ppm * (big ? 0.38 : 0.26), 8 * dpr, 36 * dpr), cw = fs * 0.62;
      // glow
      cx.globalCompositeOperation = 'lighter';
      const gr = cx.createRadialGradient(bx, by - fs, 0, bx, by - fs, fs * (big ? 6 : 3.5));
      const fl = 0.85 + 0.15 * Math.sin(t * 9 + si);
      gr.addColorStop(0, `rgba(255,150,60,${0.34 * fl})`); gr.addColorStop(0.4, `rgba(255,90,20,${0.12 * fl})`); gr.addColorStop(1, 'rgba(255,60,10,0)');
      cx.fillStyle = gr; cx.fillRect(bx - fs * 7, by - fs * 8, fs * 14, fs * 14);
      cx.font = `bold ${Math.round(fs)}px ui-monospace, Menlo, Consolas, monospace`;
      // flame body: rows narrowing upward, letters re-rolled ~12 times a second
      const rows = big ? 5 : 3, cols = big ? 4 : 2, slot = Math.floor(t * 12);
      for (let r = 0; r < rows; r++) {
        const k = r / rows, w = Math.max(1, Math.round(cols * Math.pow(1 - k, 0.8) + 0.4 * Math.sin(t * 7 + r + si)));
        for (let c = 0; c < w; c++) {
          const h = Math.abs(Math.sin((slot * 13.1 + r * 7.7 + c * 3.3 + si * 17.9))) * 1000 % 1;
          if (r > 1 && h < 0.15) continue;
          const x = bx + (c - (w - 1) / 2) * cw + (h - 0.5) * cw * 0.5 + Math.sin(t * 5 + r * 1.3 + si) * cw * 0.25 * k;
          const y = by - r * fs * 0.8 - fs * 0.3;
          const hot = 1 - k;
          cx.fillStyle = `rgba(255,${Math.round(120 + 120 * hot * hot)},${Math.round(40 + 120 * hot * hot * hot)},${0.55 + 0.45 * hot})`;
          cx.fillText(FIRE_CH[Math.floor(h * FIRE_CH.length)], x, y);
        }
      }
      // embers drifting up
      for (let e = 0; e < (big ? 6 : 2); e++) {
        const life = (t * 0.6 + e * 0.37 + si * 0.13) % 1, eh = Math.abs(Math.sin(e * 91.7 + si * 13.3 + Math.floor(t * 0.6 + e * 0.37 + si * 0.13) * 7.1)) * 1000 % 1;
        const x = bx + (eh - 0.5) * cw * 3 + Math.sin(t * 2 + e) * cw * 0.6, y = by - fs * (rows * 0.8 + life * rows * 1.4);
        cx.fillStyle = `rgba(255,${Math.round(150 + 80 * (1 - life))},70,${0.8 * (1 - life)})`;
        cx.fillText(EMBER_CH[Math.floor(eh * EMBER_CH.length)], x, y);
      }
      cx.globalCompositeOperation = 'source-over';
    }
  }
  function updateCamera(dt, title) {
    const C = G.camera, P = G.player;
    const fovN = G.R.aspect < 0.8 ? 50 : 42, flatLens = UI.settings.lens !== 'normal' || title;
    const fovF = G.R.aspect < 0.8 ? 2.4 : 2;   // near-orthographic: no parallax, so pixel snapping holds for every depth
    C.aspect = G.R.aspect; C.fov = flatLens ? fovF : fovN; C.updateProjectionMatrix();
    const lensK = flatLens ? Math.tan(fovN * Math.PI / 360) / Math.tan(fovF * Math.PI / 360) : 1;
    const VD = UI.settings.viewDist || 1;
    C.far = 400 * lensK * Math.max(1, VD); C.near = 0.5 * Math.max(1, lensK * 0.5);
    if (title) {
      // a still, high view of Emberhold through the same flat lens as play: no rotation shimmer, no horizon
      const c = GW.World.L.village, D = 26, pitch = 0.9, Dc = D * lensK;
      C.position.set(c.x, 1 + Math.sin(pitch) * Dc, c.z + 4 + Math.cos(pitch) * Dc);
      C.lookAt(c.x, 1, c.z + 4);
      GW.LU.uFogStart.value = Dc + 60;
      const gu = GW.World.grass.mat.uniforms; gu.uSize.value = 80; gu.uWidth.value = 1.4;
      if (Math.abs((G.R.glyphZoom || 1) - 1) > 0.03) { G.R.glyphZoom = 1; G.R.updateCells(); }
      return;
    }
    const portrait = G.R.aspect < 0.8;
    let D = (portrait ? 16.5 : 16) * (UI.settings.zoom || 1.3);
    if (G.bossActive) D *= 1.2;
    GW.LU.uFogStart.value = D * lensK + (D * 2.5 + 10) * VD;
    if (G._vd !== VD) { G._vd = VD; GW.World.setViewDistance(VD); }
    // close up the glyphs grow so the letters read; far out they shrink into a dense texture
    const gz = GW.clamp(Math.pow(16 / D, 1.4), 1, 3.2);
    if (Math.abs(gz - (G.R.glyphZoom || 1)) > 0.03) { G.R.glyphZoom = gz; G.R.updateCells(); }
    // grass turns into ASCII as you zoom in (normal straws when zoomed out)
    GW.World.grass.mat.uniforms.uFlowers.value = UI.settings.flowers !== undefined ? UI.settings.flowers : 0.5;
    { const z = UI.settings.zoom || 1.3, t = GW.clamp((1.15 - z) / 0.7, 0, 1);
      GW.LU.uDetail.value = GW.clamp((1.7 - (UI.settings.zoom || 1.3)) / 1.1, 0, 1);
    { const zb = UI.settings.zoom || 1.3, fbs = UI.settings.farBlend !== undefined ? UI.settings.farBlend : 0.7;
      G.R.asciiMat.uniforms.uFarBlend.value = fbs * GW.clamp((zb - 0.75) / 0.9, 0, 1); }
    GW.LU.uPlayerW.value.copy(P.pos);
    G.R.asciiMat.uniforms.uGrassMix.value = UI.settings.grassBlend === false ? 0 : Math.max(t * t * (3 - 2 * t), UI.settings.grassAscii || 0); }
    { const S0 = UI.settings, v = (k, d) => S0[k] !== undefined ? S0[k] : d;
      G.R.asciiMat.uniforms.uActorPop.value = v('heroPop', 0.3);
      GW.LU.uGroundO.value = v('groundO', 0.4);
      const md = S0.seeMode !== undefined ? S0.seeMode : 2; GW.LU.uSeeMode.value = md;
      // roof modes act when you're inside; the circle modes (thin, ghost, lantern) whenever something hides you
      GW.LU.uXray.value = md === 0 ? 0 : ([1, 2, 5].includes(md) ? (G.heroInside ? 1 : 0) : (G.heroInside || G.heroHidden ? 1 : 0)); }
    { const S0 = UI.settings, md = S0.seeMode !== undefined ? S0.seeMode : 2;
      // lantern mode: the hero carries a small warm light
      const W = GW.World; if (md === 6 && !G._heroLamp && W.lights) G._heroLamp = W.lights.add(0, -999, 0, new THREE.Color(1.0, 0.62, 0.3), 6, 0.6);
      if (G._heroLamp) { if (md === 6) G._heroLamp.p.set(G.player.pos.x, G.player.pos.y + 2.2, G.player.pos.z); else { W.lights.remove(G._heroLamp); G._heroLamp = null; } } GW.LU.uSwirl.value = S0.swirl !== undefined ? S0.swirl : 0.25; }
    const gu0 = GW.World.grass.mat.uniforms;
    const gs = UI.settings.grassSize || 1;   // match the title-screen look: ~26 px straws, ~2.5 px wide (CSS px)
    gu0.uPx.value.set(2 / G.R.W, 2 / G.R.H); gu0.uLineW.value = 0.8 * gs * G.R.dpr * Math.min(1.5, Math.sqrt(gz)); gu0.uLen.value = 20 * gs * G.R.dpr * Math.min(1.6, Math.sqrt(gz));
    const gu = GW.World.grass.mat.uniforms;
    gu.uSize.value = 50 * Math.max(1, D / 22) * ((UI.settings.camPitch || 0.98) < 0.75 ? 1.35 : 1);
    gu.uWidth.value = Math.max(1, D / 18) * (G.R.H > 1400 ? 1.15 : 1);
    const S = UI.settings;
    // follow mode: swing gently behind the hero while he runs forward-ish (strafing/backpedal don't spin it)
    if (S.follow && P._mv && G.state === 'play' && !UI.orbiting) {
      const h = P.yaw, camFwd = (S.camYaw || 0) + Math.PI;
      const a = GW.angDiff(camFwd, h), w = Math.pow(Math.max(0, Math.cos(a)), 1.5);
      S.camYaw = (S.camYaw || 0) + a * w * Math.min(1, dt * 1.7);
    }
    const pitch = S.camPitch || 0.98, yaw = S.camYaw || 0;
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const mvv = P.mvel || { x: 0, z: 0 };
    const po = portrait ? 2.6 : 0;
    camT.set(P.pos.x + mvv.x * 0.16 + sy * po, P.pos.y, P.pos.z + mvv.z * 0.16 + cy * po);
    camLook.lerp(camT, Math.min(1, dt * (S.follow ? 7 : 11)));
    if (camLook.lengthSq() === 0 || G.snapCam) { camLook.copy(camT); G.snapCam = false; G._camJump = true; }
    const Dc = D * lensK;
    C.position.set(camLook.x + sy * Math.cos(pitch) * Dc, camLook.y + Math.sin(pitch) * Dc, camLook.z + cy * Math.cos(pitch) * Dc);
    const s = G.shakeAmt * G.shakeAmt * 0.6;
    C.position.x += (Math.random() - 0.5) * s; C.position.y += (Math.random() - 0.5) * s; C.position.z += (Math.random() - 0.5) * s;
    C.lookAt(camLook.x, camLook.y + 0.8, camLook.z);
    // pixel-snap: translate the camera so the world anchor lands on a whole render pixel; the glyph grid
    // then moves in whole pixels with the world and still objects keep identical glyphs while you walk
    {
      // Track how far a ground point near the view centre moved on screen since last frame (using last frame's
      // view), round that to whole SCREEN pixels, nudge the camera by the remainder, and accumulate the grid
      // offset. Everything near the view then shifts by exactly the same whole-pixel step as the glyph grid.
      const R = G.R, unit = R.ss || 1;
      C.updateMatrixWorld();
      const A = _snapA.set(Math.round(camLook.x / 4) * 4, camLook.y, Math.round(camLook.z / 4) * 4);
      _snapR.setFromMatrixColumn(C.matrixWorld, 0); _snapU.setFromMatrixColumn(C.matrixWorld, 1);
      const wpp = 2 * C.position.distanceTo(camLook) * Math.tan(C.fov * Math.PI / 360) / R.H;
      if (G._prevVP && !G._camJump) {
        const p0 = _snapP.copy(A).applyMatrix4(G._prevVP), p1 = A.clone().project(C);
        const dx = (p1.x - p0.x) * 0.5 * R.W, dy = (p1.y - p0.y) * 0.5 * R.H;
        const sx = Math.round(dx / unit) * unit, sy = Math.round(dy / unit) * unit;
        C.position.addScaledVector(_snapR, (dx - sx) * wpp).addScaledVector(_snapU, (dy - sy) * wpp);
        G.gridOff.x += sx; G.gridOff.y += sy;
      }
      G._camJump = false;
      C.updateMatrixWorld();
      G._prevVP = (G._prevVP || new THREE.Matrix4()).multiplyMatrices(C.projectionMatrix, C.matrixWorldInverse);
    }
    // keep the grass patch centred a little ahead of the view, not on the hero
    const ahead2 = gu.uSize.value * (pitch < 0.75 ? 0.28 : 0.12);
    GW.World.terrainMat.uniforms.uFarGrass.value = gu.uSize.value * 0.4;
    G.grassCenter = { x: camLook.x - sy * ahead2, z: camLook.z - cy * ahead2 };
    GW.World.updateSky(C);
  }
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new V3(0, 1, 0), 0), ndc = new THREE.Vector2(), hit = new V3();
  function aimPoint() {
    if (I.touch || !I.mouse.used) return null;
    ndc.set(I.mouse.x / window.innerWidth * 2 - 1, -(I.mouse.y / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, G.camera);
    plane.constant = -(G.player.pos.y + 0.9);
    return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null;
  }

  // ---------------- main loop ----------------
  let frame = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = Math.max(0, Math.min(0.05, (now - G.last) / 1000)); G.last = now;   // never negative (rAF stamps can trail performance.now())
    G.t += dt; frame++;
    GW.LU.uTime.value = G.t;
    const pressed = I.consume();
    if (pressed.menu) {
      if (UI.mapOpen()) UI.toggleMap(G, false);
      else if (UI.invOpen()) UI.toggleInv(G, false);
      else if (UI.bookOpen()) UI.toggleBook(G, false);
      else if (G.state === 'forge') GW.Forge.UI.close();
      else if (G.state === 'gear') G.closeGear();
      else if (G.state === 'play' && !UI.inDialog()) togglePause(true);
      else if (G.state === 'paused') togglePause(false);
    }
    UI.tick(dt);
    if (pressed.map && (G.state === 'play' || UI.mapOpen()) && !UI.inDialog()) UI.toggleMap(G);
    if (pressed.inv && (G.state === 'play' || UI.invOpen()) && !UI.inDialog()) UI.toggleInv(G);
    if (pressed.book && (G.state === 'play' || UI.bookOpen()) && !UI.inDialog()) UI.toggleBook(G);
    if (UI.bookOpen()) for (let i = 0; i < 4; i++) if (pressed['a' + (i + 1)]) { UI.bookPick(G, i); pressed['a' + (i + 1)] = false; }
    if (UI.mapOpen() && frame % 10 === 0) UI.drawWorldMap(G);
    if (pressed.gear) { if (G.state === 'gear') G.closeGear(); else if (G.state === 'play' && !UI.inDialog()) openGear(); }
    if (G.state === 'gear') {
      const U = GW.Knight.UI, C = G.camera;
      if (!U.drag) U.ang += dt * 0.25;
      G.player.animate(0.016);
      const p = G.player.pos, r = window.innerWidth < 640 ? 6.4 : 3.8;
      C.aspect = G.R.aspect; C.fov = 40; C.near = 0.1; C.far = 300; C.updateProjectionMatrix();
      C.position.set(p.x + Math.sin(U.ang) * r, p.y + 1.6, p.z + Math.cos(U.ang) * r);
      C.lookAt(p.x, p.y + 1.0, p.z);
      const fr = U.freeRect(); C.setViewOffset(window.innerWidth, window.innerHeight, window.innerWidth / 2 - fr.cx, window.innerHeight / 2 - fr.cy, window.innerWidth, window.innerHeight);
      for (const u of GW.World.grass.push) u.z = 0; GW.World.grass.push[0].set(p.x, p.z, 3.2);
      GW.World.update(0, G.t, p.x, p.z); GW.World.lights.update(p.x, p.z, G.t);
      G.R.render(G.scene, C, { hurt: 0, white: 0, shadowFocus: p, shadowHalf: 8 });
      return;
    }
    if (G.state === 'forge') {
      if (pressed.interact) GW.Forge.UI.close();
      const v = GW.Forge.UI.view();
      v.update(dt, window.innerWidth, window.innerHeight, GW.Forge.freeRect());
      GW.LU.uFog.value = 0;
      GW.LU.uAmb.value.setRGB(0.07, 0.07, 0.09);
      G.R.render(v.scene, v.cam, { hurt: 0, white: G.flashWhite });
      G.flashWhite = Math.max(0, G.flashWhite - dt * 2);
      GW.LU.uFog.value = 0.012; GW.LU.uAmb.value.setRGB(0.17, 0.2, 0.26);
      return;
    }
    const P = G.player;
    const playing = G.state === 'play' || G.state === 'dying';
    // hitstop: freeze simulation briefly, keep rendering
    let sdt = dt;
    if (G.hitstop > 0) { G.hitstop -= dt; sdt = dt * 0.05; }
    if (G.tsT > 0) { G.tsT -= dt; sdt *= G.ts; }
    if (G.state === 'paused' || G.state === 'dead' || G.state === 'travel' || G.state === 'shop' || UI.mapOpen() || UI.invOpen() || UI.bookOpen()) sdt = 0;

    if (playing) {
      let input = { mx: 0, mz: 0 };
      if (UI.inDialog()) {
        if (pressed.interact || pressed.click || pressed.attack) UI.dialogAdvance();
      } else if (G.state === 'play') {
        const mv0 = I.move(), cyaw = UI.settings.camYaw || 0, cs = Math.cos(cyaw), sn = Math.sin(cyaw);
        const mv = { x: mv0.x * cs + mv0.z * sn, z: -mv0.x * sn + mv0.z * cs };
        const aim = aimPoint();
        input = { mx: mv.x, mz: mv.z, aim, aimHeld: I.mouse.down,
          attack: pressed.attack || pressed.click, attackHeld: I.mouse.down || I.holdAttack || !!I.keys.KeyJ, block: I.mouse.right || I.holdBlock || !!I.keys.KeyV, roll: pressed.roll,
          a1: pressed.a1, a2: pressed.a2, a3: pressed.a3, a4: pressed.a4, potion: pressed.potion, sprint: !!(I.keys.ShiftLeft || I.keys.ShiftRight) };
        if (P.horse && P.horse.ridden) { input.attackHeld = input.block = false; input.attack = input.roll = input.a1 = input.a2 = input.a3 = input.a4 = input.potion = false; }
        const it = nearestInteract();
        UI.interact(it ? it.label : null);
        if (pressed.interact && it) doInteract(it);
        if (pressed.fire) buildFire();
        if (pressed.horse) toggleHorse();
      }
      if (sdt > 0) {
        GW.Abil.update(G, sdt);
        for (const u of GW.World.grass.push) u.z = 0;
        P.update(sdt, input, G);
        for (const e of G.enemies) e.update(sdt, G);
        for (const n of G.npcs) n.update(sdt, G);
        updateProjectiles(sdt); updateBoulders(sdt); updatePickups(sdt);
        G.telegraphs = G.telegraphs.filter(t => { t.update(sdt); return !t.done; });
        // tutorial hints + boss trigger + zones
        world(sdt);
        // respawn timers
        updateSpawns(sdt); G.updateOwnFires(sdt); towerDoor(); G.updateHorse(sdt); tickPlayerDots(sdt);
        if (frame % 15 === 0) explore();
        if (frame % 20 === 7) poiTick();
        if (G.t % 10 < sdt) G.enemies = G.enemies.filter(e => e.alive || !e.temp || G.t - (e.diedAt || 0) < 8 || (G.scene.remove(e.model), G.scene.remove(e.shadow), false));
        for (const e of G.enemies) if (!e.alive && e.type === 'husk' && G.t - e.diedAt > 5) revive(e);
      }
      UI.updateHUD(P);
      // minimal HUD: show while fighting, hurt, low on stamina/focus, just after a quest update, or while Alt is held
      if (frame % 6 === 0) {
        const fighting = G.enemies.some(e => e.alive && e.aggro && e.type !== 'husk') || G.bossActive;
        const show = fighting || P.hp < P.maxHp * 0.98 || P.st < 99 || G.t - (G.questShownT || -99) < 6 || I.keys.AltLeft;
        document.body.classList.toggle('minhud', UI.settings.hud !== 'full');
        document.body.classList.toggle('hudshow', !!show);
      }
      if (frame % 3 === 0) UI.drawMinimap(G);
      objectiveArrow();
      // labels
      for (const e of G.enemies) {
        if (!e.alive || e.T.boss) continue;
        if ((e.aggro || G.t - e.lastHit < 3) && e.distTo(P.pos) < 22) {
          const n = 10, f = Math.ceil(e.hp / e.maxHp * n);
          const lp = e.pos.clone(); lp.y += e.T.radius * 2 + (e.T.flying ? 1.6 : 1.1);
          UI.label(e, '▬'.repeat(f) + '▭'.repeat(n - f), lp, 'ehp');
        }
      }
      if (G.state === 'play') { const lp = P.pos.clone(); lp.y += 2.35; UI.label('hero', P.riposteT > 0 ? 'RIPOSTE' : 'Wanderer', lp, 'name', P.riposteT > 0 ? '#ffd860' : '#e8e4d8'); }
      // break bars and attack warnings: yellow ◇ = parry it, red ! = dodge it
      const TELE = { windup: '◇', windup2: '◇', web: '◇', cast: '◇', throw: '◇', sweep: '!', stab: '!', charge: '!', slam: '!', 'pounce-wind': '!', 'charge-wind': '!', rain: '!' };
      for (const e of G.enemies) {
        if (!e.alive || e.type === 'husk' || e.distTo(P.pos) > 22 || !(e.aggro || e.brk > 0)) continue;
        const idx = G.enemies.indexOf(e), top = e.pos.clone(); top.y += e.T.radius * 2 + (e.T.flying ? 2.6 : 1.95) + (e.T.boss ? 2.5 : 0);
        if (e.brokenT > 0) UI.label('b' + idx, 'BROKEN', top, 'name', '#ffb040');
        else if (e.brk > 0) { const n = 8, f = Math.round(GW.clamp(e.brk / G.brkMax(e), 0, 1) * n); UI.label('b' + idx, '[' + '#'.repeat(f) + '-'.repeat(n - f) + ']', top, 'ehp', '#ffc860'); }
        const tg = TELE[e.state];
        if (tg) { const tp = top.clone(); tp.y += 0.6; UI.label('w' + idx, tg, tp, 'name', tg === '!' ? '#ff4030' : '#ffd040'); }
      }
      for (const e of G.enemies) if (e.alive && !e.T.boss && e.type !== 'husk' && (e.aggro || e.distTo(P.pos) < 14)) { const lp = e.pos.clone(); lp.y += e.T.radius * 2 + (e.T.flying ? 2.2 : 1.55); UI.label('n' + G.enemies.indexOf(e), (e.elite ? 'Elite ' : '') + e.T.name + ((e.lvl || 1) > 1 ? ' · lv ' + e.lvl : ''), lp, 'name', e.elite ? '#ffb040' : e.aggro ? '#ff9a8a' : '#c8ccd8'); }
      for (const n of G.npcs) if (n.pos.distanceTo(P.pos) < 12) { const lp = n.pos.clone(); lp.y += 2.6; UI.label(n, n.name, lp, 'name', '#ffcf6a'); }
      { const B = G.curBoss || G.boss; if (G.bossActive && B.alive) UI.boss(true, B.T.name, B.hp, B.maxHp); }
      G.saveT += dt; if (G.saveT > 20) { G.saveT = 0; save(); UI.saveSettings(); }
    } else if (G.state === 'title') {
      for (const n of G.npcs) n.update(dt, G);
    }
    G.parts.spark.update(sdt); G.parts.dust.update(sdt); G.parts.blood.update(sdt);
    const focus = G.state === 'title' ? GW.World.L.village : P.pos;
    GW.World.update(sdt || 0, G.t, focus.x, focus.z);
    if (G.grassCenter && G.state !== 'title') { GW.World.grass.mat.uniforms.uCenter.value.set(G.grassCenter.x, G.grassCenter.z); GW.World.terrainMat.uniforms.uGrassC.value.set(G.grassCenter.x, G.grassCenter.z); }
    if (G.state === 'title') { GW.World.updateSky(G.camera); const gt = GW.World.grass.mat.uniforms, gs = UI.settings.grassSize || 1; gt.uPx.value.set(2 / G.R.W, 2 / G.R.H); gt.uLineW.value = 0.95 * gs * G.R.dpr; gt.uLen.value = 20 * gs * G.R.dpr; }
    // embers rising from campfires near the view
    if (sdt > 0 && frame % 2 === 0) for (const it of GW.World.interact) {
      if (it.type !== 'rest' || Math.hypot(it.x - focus.x, it.z - focus.z) > 40) continue;
      const y = GW.World.heightAt(it.x, it.z);
      G.parts.spark.emit(it.x + (Math.random() - 0.5) * 0.6, y + 0.7, it.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 1.4 + Math.random() * 1.6, (Math.random() - 0.5) * 0.6, 1.4 + Math.random(), 0.45, Math.random() < 0.5 ? 0xffa040 : 0xff6a20, 0.5, 0.6);
    }
    updateDayNight(dt);
    GW.World.lights.update(focus.x, focus.z, G.t);
    updateCamera(dt, G.state === 'title');
    UI.updateFloaters(dt, G.camera);
    G.shakeAmt = Math.max(0, G.shakeAmt - dt * 3);
    G.hurtFx = Math.max(0, G.hurtFx - dt * 1.5);
    const low = P.hp / P.maxHp < 0.3 && G.state === 'play' ? 0.35 + 0.15 * Math.sin(G.t * 5) : 0;
    const camD = G.camera.position.distanceTo(focus.isVector3 ? focus : new THREE.Vector3(focus.x, 0, focus.z));
    G.R.render(G.scene, G.camera, { silhouette: G.state === 'play' ? silhouettePass : null, gridOff: G.state === 'title' ? null : G.gridOff, hurt: Math.max(G.hurtFx, low), white: G.flashWhite, shadowFocus: G.state === 'title' ? new THREE.Vector3(focus.x, 0, focus.z) : P.pos, shadowHalf: Math.round(GW.clamp(16 * (UI.settings.zoom || 1.3) * 1.25, 16, 70) / 6) * 6,
      reflY: (frame % 30 === 0 ? (G.nearWater = GW.World.riverDist(focus.x, focus.z) < 45) : G.nearWater) ? GW.World.waterYAt(focus.x, focus.z) : undefined });
    G.flashWhite = GW.clamp(G.flashWhite - dt * 1.2, 0, 1);
    drawFireGlyphs();
    document.body.classList.toggle('playing', G.state === 'play'); if (G.state === 'play' && frame % 2 === 0) UI.drawCompass(G);
    drawHiddenHero(dt);
    drawHitGlyphs(dt);
    drawWeather(dt);
    drawDarkOutside();
    perfGovernor(dt);
    // audio
    if (GWAudio.ctx) {
      let fd = 99; for (const it of GW.World.interact) if (it.type === 'rest') fd = Math.min(fd, Math.hypot(it.x - focus.x, it.z - focus.z));
      const combat = G.enemies.some(e => e.alive && e.aggro && !e.T.boss && e.type !== 'husk') || G.bossActive;
      GWAudio.update(dt, { riverDist: GW.World.riverDist(focus.x, focus.z), fireDist: fd, combat, boss: G.bossActive });
    }
  }

  // ---------------- day / night ----------------
  // G.tod: 0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = dusk
  G.tod = 0.62;
  const C3 = (r, g, b) => new THREE.Color(r, g, b);
  const NIGHT = { amb: C3(0.13, 0.15, 0.21), key: C3(0.36, 0.42, 0.58), fog: C3(0.022, 0.032, 0.058), light: 0.72 };
  const DAY = { amb: C3(0.24, 0.27, 0.33), key: C3(0.72, 0.64, 0.52), fog: C3(0.2, 0.25, 0.32), light: 0.88 };
  const DUSK = C3(0.9, 0.5, 0.3);
  let lastPhase = null;
  function updateDayNight(dt) {
    const S = UI.settings, mode = S.time || 'cycle';
    if (G.dungeon) {   // underground: only torchlight
      const LU = GW.LU; LU.uAmb.value.setRGB(0.1, 0.105, 0.125); LU.uMoonCol.value.setRGB(0.16, 0.17, 0.22); LU.uFogCol.value.setRGB(0, 0, 0); LU.uDayLight.value = 0.6;
      if (GW.World.skyDome) GW.World.skyDome.visible = false; return;
    }
    if (GW.World.skyDome) GW.World.skyDome.visible = true;
    if (mode === 'cycle' && G.state === 'play') G.tod = (G.tod + dt / ((S.dayLen || 16) * 60)) % 1;
    const tod = mode === 'day' ? 0.5 : mode === 'night' ? 0.0 : G.tod;
    const sunH = -Math.cos(tod * Math.PI * 2);                    // -1 midnight .. 1 noon
    const day = GW.clamp((sunH + 0.15) / 0.4, 0, 1), k = day * day * (3 - 2 * day);
    const dusk = Math.max(0, 1 - Math.abs(sunH) / 0.28) * 0.9;
    const LU = GW.LU;
    LU.uAmb.value.copy(NIGHT.amb).lerp(DAY.amb, k);
    LU.uMoonCol.value.copy(NIGHT.key).lerp(DAY.key, k).lerp(DUSK, dusk * 0.5);
    LU.uFogCol.value.copy(NIGHT.fog).lerp(DAY.fog, k).lerp(C3(0.3, 0.17, 0.12), dusk * 0.4);
    LU.uDayLight.value = GW.lerp(NIGHT.light, DAY.light, k);
    // "darkness" setting: moodier days, much darker nights; torches and the hero carry the scene
    const dk = S.dark || 0, df = 1 - dk * GW.lerp(0.55, 0.28, k);
    LU.uAmb.value.multiplyScalar(df); LU.uMoonCol.value.multiplyScalar(GW.lerp(df, 1, 0.25)); LU.uDayLight.value *= GW.lerp(1, df, 0.6);
    const W = GW.World;
    if (W.skyDome) { W.skyDome.material.uniforms.uDay.value = k; W.skyDome.material.uniforms.uDusk.value = dusk; }
    if (W.stars) W.stars.visible = k < 0.6;
    if (W.moonMesh) W.moonMesh.visible = k < 0.75;
    // fires and torches matter more at night
    for (const l of W.lights.list) { if (!l.base0) l.base0 = l.c.clone(); l.c.copy(l.base0).multiplyScalar(GW.lerp(1.25, 0.55, k)); }
    const phase = k > 0.5 ? 'day' : 'night';
    if (lastPhase && phase !== lastPhase && G.state === 'play') UI.banner('', phase === 'day' ? 'DAWN BREAKS' : 'NIGHT FALLS', 2.5);
    lastPhase = phase;
  }

  function world(dt) {
    const P = G.player, W = GW.World;
    // zone banners
    let zn = null;
    for (const z of W.ZONES) if (Math.hypot(P.pos.x - z.x, P.pos.z - z.z) < z.r) { zn = z; break; }
    if (zn && G.zone !== zn.name) { G.zone = zn.name; if (!G.zoneSeen[zn.name] || G.t - G.zoneSeen[zn.name] > 40) UI.banner(zn.sub, zn.name, 3.2); G.zoneSeen[zn.name] = G.t; }
    if (!zn) G.zone = null;
    // tutorial
    if (QUESTS[G.stage].id === 'wake' && !G.hintsShown.rollTut && (G.counters.husk || 0) >= 1) { G.hintsShown.rollTut = true; UI.hint(I.touch ? 'Tap <b>⟲</b> to roll. Rolling costs stamina (green bar).' : '<b>Space</b> or right-click to roll. Rolling costs stamina (green bar).', 6); }
    if (QUESTS[G.stage].id === 'meet' && Math.hypot(P.pos.x - W.L.elder.x, P.pos.z - W.L.elder.z) < 9 && !G.hintsShown.talk) { G.hintsShown.talk = true; UI.hint(I.touch ? 'Tap <b>E</b> to talk.' : 'Press <b>E</b> to talk.', 4); }
    if (P.hp / P.maxHp < 0.4 && P.flasks > 0 && !G.hintsShown.flask) { G.hintsShown.flask = true; UI.hint(I.touch ? 'Tap <b>♥</b> to drink from your flask.' : 'Press <b>Q</b> to drink from your flask.', 5); }
    // boss
    const A = W.L.arena;
    if (!G.bossActive && G.boss.alive && G.stage >= 7 && Math.hypot(P.pos.x - A.x, P.pos.z - A.z) < 14) {
      G.bossActive = true; G.curBoss = G.boss; G.arenaLock = true; G.boss.aggro = true; G.boss.setState('roar');
      GWAudio.sfx('roar'); G.shake(0.8);
      UI.banner('the circle closes', 'THE MIRE WARDEN', 3.5);
      W.arenaStones.forEach(s => s.band.material.uniforms.uEmissive.value.setRGB(1.0, 0.25, 0.1));
    } else if (!G.boss.alive || G.stage < 7) {
      if (G.boss.alive && G.stage < 7 && Math.hypot(P.pos.x - A.x, P.pos.z - A.z) < 16 && !G.hintsShown.early) { G.hintsShown.early = true; UI.hint('The stones are asleep. The Warden does not notice you yet.', 4); }
    }
    // the Dusk Widow wakes when you step into her hollow
    const LR = W.L.lair;
    if (!G.bossActive && G.widow && G.widow.alive && Math.hypot(P.pos.x - LR.x, P.pos.z - LR.z) < 13) {
      G.bossActive = true; G.curBoss = G.widow; G.widow.aggro = true; G.widow.setState('roar');
      GWAudio.sfx('roar'); G.shake(0.8); UI.banner('something vast uncurls', 'DUSK WIDOW', 3.5);
    }
    // region bosses wake when you step into their lair, and give up if you run far away
    for (const b of G.regionBosses || []) {
      const d = Math.hypot(P.pos.x - b.x, P.pos.z - b.z);
      if (!G.bossActive && b.e.alive && d < 16) {
        G.bossActive = true; G.curBoss = b.e; b.e.aggro = true; b.e.setState(b.type === 'colossus' ? 'roar' : 'chase');
        GWAudio.sfx('roar'); G.shake(0.8); UI.banner(b.sub, b.title, 3.5);
      }
      if (G.bossActive && G.curBoss === b.e && d > 55) {
        G.bossActive = false; G.curBoss = null; UI.boss(false);
        b.e.hp = b.e.maxHp; b.e.phase = 1; b.e.aggro = false; b.e.pos.set(b.x, GW.World.heightAt(b.x, b.z), b.z); b.e.setState('idle');
        G.enemies = G.enemies.filter(en => { if (en.temp && en.alive && !en.hunter) { en.alive = false; G.scene.remove(en.model); G.scene.remove(en.shadow); if (en.T.onDeath && en.light) en.T.onDeath(en); return false; } return true; });
      }
    }
    if (G.bossActive && G.curBoss === G.boss) W.arenaStones.forEach((s, i) => { const k = 0.7 + 0.3 * Math.sin(G.t * 4 + i); s.band.material.uniforms.uEmissive.value.setRGB(1.0 * k, 0.25 * k, 0.1 * k); });
  }

  function updateProjectiles(dt) {
    const P = G.player, W = GW.World;
    G.projectiles = G.projectiles.filter(p => {
      p.age += dt;
      if (p.homing && p.from === 'enemy') {
        const dx = P.pos.x - p.pos.x, dz = P.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1, sp = p.vel.length();
        p.vel.x += dx / d * p.homing * dt * sp * 0.35; p.vel.z += dz / d * p.homing * dt * sp * 0.35; p.vel.setLength(sp);
      }
      p.pos.addScaledVector(p.vel, dt);
      p.m.position.copy(p.pos); p.m.rotation.y += dt * 6; p.light.p.copy(p.pos);
      if (Math.random() < 0.8) G.parts.spark.emit(p.pos.x, p.pos.y, p.pos.z, (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5), 0.35, 1, p.color, 0);
      let boom = p.age > p.life || W.blocked(p.pos.x, p.pos.z, 0.2);
      if (p.from === 'enemy') {
        if (Math.hypot(P.pos.x - p.pos.x, P.pos.z - p.pos.z) < p.r + 0.45) { G.hurtPlayer(p.dmg, p.pos, {}); boom = true; if (p.web) { P.webbed = 2.4; UI.toast('Webbed!', 1.2); } if (p.src && p.src.T.onHit && P.iframe <= 0) p.src.T.onHit(G, p.src); }
        if (boom && p.web) G.webBurst(p.pos.x, p.pos.z);
      } else {
        for (const e of G.enemies) if (e.alive && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < p.r + e.radius) {
          if (p.pierce) { p.hitSet = p.hitSet || new Set(); if (!p.hitSet.has(e)) { p.hitSet.add(e); G.hitEnemy(e, p.dmg, { proj: true, from: p.pos, brk: 1.4 }); if (p.chill && e.alive) e.status.slow = p.chill; } continue; }
          if (!p.aoe) G.hitEnemy(e, p.dmg, { proj: true, from: p.pos }); boom = true; break; }
      }
      if (boom) {
        G.parts.spark.burst(p.pos.x, p.pos.y, p.pos.z, p.aoe ? 26 : 10, p.aoe ? 7 : 3, p.color, 0.5, 1.1, -3);
        if (p.aoe) {
          GWAudio.sfx('boom'); G.shake(0.35);
          for (const e of G.enemies) if (e.alive && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < p.aoe + e.radius) G.hitEnemy(e, p.dmg, { proj: true, heavy: true, from: p.pos });
        }
        G.scene.remove(p.m); W.lights.remove(p.light);
        return false;
      }
      return true;
    });
  }
  function updateBoulders(dt) {
    const P = G.player;
    G.boulders = G.boulders.filter(b => {
      b.t += dt; const k = Math.min(1, b.t / b.flight);
      b.m.position.lerpVectors(b.s, b.e, k); b.m.position.y += Math.sin(k * Math.PI) * 7; b.m.rotation.x += dt * 5;
      if (k >= 1) {
        GWAudio.sfx('slam', 0.6); G.shake(0.3);
        G.parts.dust.burst(b.e.x, b.e.y + 0.3, b.e.z, 18, 6, 0x8890a0, 0.7, 1.3, -6, 1);
        if (Math.hypot(P.pos.x - b.e.x, P.pos.z - b.e.z) < 2.2 + 0.45) G.hurtPlayer(b.dmg, b.e, {});
        G.scene.remove(b.m); return false;
      }
      return true;
    });
  }
  function updatePickups(dt) {
    const P = G.player;
    G.pickups = G.pickups.filter(p => {
      p.t += dt;
      const d = Math.hypot(P.pos.x - p.p.x, P.pos.z - p.p.z);
      if (d < 4 && p.t > 0.6 && (p.fixedY === undefined || Math.abs(P.pos.y - p.fixedY) < 1.2)) { p.p.x += (P.pos.x - p.p.x) * dt * 6; p.p.z += (P.pos.z - p.p.z) * dt * 6; }
      p.m.position.set(p.p.x, (p.fixedY !== undefined ? p.fixedY : GW.World.groundY(p.p.x, p.p.z)) + 0.7 + Math.sin(p.t * 3) * 0.15, p.p.z); p.m.rotation.y += dt * 2;
      p.light.p.copy(p.m.position);
      if (d < 1.3 && p.t > 0.6 && (p.fixedY === undefined || Math.abs(P.pos.y - p.fixedY) < 1.2)) { if (p.tag === 'castle') G.castleLooted = true; give(p.kind, p.key); G.scene.remove(p.m); GW.World.lights.remove(p.light); return false; }
      return true;
    });
  }
  const _o = {};
  function objectiveArrow() {
    const obj = G.objective(), P = G.player;
    if (!obj || UI.inDialog()) { UI.arrow(false); return; }
    const d = Math.hypot(obj.x - P.pos.x, obj.z - P.pos.z);
    if (d < 10) { UI.arrow(false); return; }
    const ps = UI.project(G.camera, P.pos, {}), os = UI.project(G.camera, new V3(obj.x, P.pos.y, obj.z), _o);
    let dx = os.x - ps.x, dy = os.y - ps.y; if (os.z > 1) { dx = -dx; dy = -dy; }
    const ang = Math.atan2(dx, -dy), r = Math.min(window.innerWidth, window.innerHeight) * 0.3;
    UI.arrow(true, ps.x + Math.sin(ang) * r, ps.y - 30 - Math.cos(ang) * r, ang, d);
  }

  window.addEventListener('load', init);
})();

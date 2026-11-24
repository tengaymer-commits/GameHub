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
    respawn: null, zone: null, zoneSeen: {}, ui: UI, hintsShown: {}, saveT: 0, mined: {},
  };

  // ---------------- quests ----------------
  const L = () => GW.World.L;
  const QUESTS = [
    { id: 'wake', title: 'THE WAKING', text: c => `Strike down the straw husks (${c.husk || 0}/3)`, target: () => ({ x: 0, z: 60 * GW.World.VS }), need: { husk: 3 } },
    { id: 'meet', title: 'A LIGHT IN THE VALE', text: () => 'Find Mara the Lamplighter at Emberhold', target: () => L().elder },
    { id: 'smith', title: 'GLYPH AND STEEL', text: () => 'Socket a rune into your blade at Hesk\'s anvil', target: () => L().anvil },
    { id: 'wolves', title: 'THORNS ACROSS THE WATER', text: c => `Cull the Thornwolves north of the river (${c.wolf || 0}/6)`, target: () => L().meadow, need: { wolf: 6 } },
    { id: 'hollows', title: 'THE OLD SCRIPTORIUM', text: c => `Break the Hollows in the western ruins (${c.hollow || 0}/4)`, target: () => L().ruins, need: { hollow: 4 } },
    { id: 'tomb', title: 'BENEATH THE SCRIPTORIUM', text: () => "Find the Scribe's Seal in the tombs below the Hollow Ruins", target: () => L().tombQ || L().ruins },
    { id: 'wisps', title: 'LANTERNS THAT BITE', text: c => `Snuff the Lantern Wisps in Wispwood (${c.wisp || 0}/3)`, target: () => L().grove, need: { wisp: 3 } },
    { id: 'return', title: 'WHAT THE STONES SAID', text: () => 'Return to Mara at Emberhold', target: () => L().elder },
    { id: 'boss', title: 'THE WARDEN CIRCLE', text: () => 'Face the Mire Warden in the stone circle, far north', target: () => L().arena },
    // ---- act II: the unwritten lands ----
    { id: 'free', title: 'THE STARFALL BLADE', text: () => 'Smelt the Warden\'s starfall and forge it into a blade at any anvil', target: () => L().anvil },
    { id: 'hearth', title: 'THE CROSSROADS', text: () => 'Follow the road north-east to Hearthwick', target: () => L().hearth },
    { id: 'seals', title: 'FOUR SEALS OF THE UNWRITTEN', text: () => `Break the four guardians of the outer lands (${G.sealsBroken()}/4)`, target: () => G.nextSeal() },
    { id: 'dunmaer', title: 'THE CROWN OF DUNMAER', text: () => 'Climb Castle Dunmaer to the Crown Tower and face what wears the crown', target: () => L().dunmaer },
    { id: 'end', title: 'THE NINEFOLD, REWRITTEN', text: () => 'The land is yours to roam.\nFind every vault, cave and crypt.', target: () => null },
  ];
  // the four region guardians: progress and the nearest one still standing
  const SEAL_KEYS = ['colossus', 'rimeknight', 'mirehag', 'cragwarlord'];
  G.sealsBroken = () => SEAL_KEYS.filter(k => G.bossesDead && G.bossesDead[k]).length;
  G.nextSeal = function () { const P = G.player; let best = null, bd = 1e9;
    for (const a of GW.World.ARENAS) if (SEAL_KEYS.includes(a.key) && !(G.bossesDead && G.bossesDead[a.key])) { const d = Math.hypot(a.x - P.pos.x, a.z - P.pos.z); if (d < bd) { bd = d; best = { x: a.x, z: a.z }; } }
    return best; };
  // checks that don't come from kills: arriving somewhere, forging something, a guardian falling
  G.questTick = function () {
    const id = QUESTS[G.stage].id, P = G.player;
    if (id === 'free') { const fg = (P.inv.arms && P.inv.arms.forge) || {}; if (Object.values(fg).some(w => w && w.metal === 'starfall') || (P.weapon && P.weapon.metal === 'starfall')) {
        gainXP(300); advance(); whisper('Starfall sings in your hand. Hearthwick waits at the crossroads, north-east along the road. Ask after the old wardens.'); } }
    else if (id === 'hearth' && !G.dungeon && Math.hypot(P.pos.x - L().hearth.x, P.pos.z - L().hearth.z) < 40) {
      gainXP(200); advance(); UI.dialog([
        { who: 'OSWIN · WAYWARDEN', text: 'Another one from the Waking Stone. You have the Warden\'s light on you: so it really fell.' },
        { who: 'OSWIN · WAYWARDEN', text: 'The vale was only the first page. Four guardians hold the outer lands: the Ash Colossus, the Rime Knight, the Mire Hag and the Crag Warlord.' },
        { who: 'OSWIN · WAYWARDEN', text: 'Each keeps a seal on the old writing. Break all four, and the crown in Castle Dunmaer will have nothing left to hide behind.' },
        { who: 'OSWIN · WAYWARDEN', text: 'Mind the map: the further out, the older the glyphs, and the harder they bite. Touch every waystone you pass.' }]); }
    else if (id === 'seals') { if (G.sealsBroken() >= 4) { gainXP(800); advance(); whisper('All four seals are broken. In the far north-east, Castle Dunmaer has started to burn. Climb it.'); }
      else if (G._sealN !== G.sealsBroken()) { G._sealN = G.sealsBroken(); refreshQuest(); } }
  };
  function crownFallen(e) {
    G.items = G.items || {}; G.items.crown = true;
    G.flashWhite = 1; G.shake(1.2); GWAudio.sfx('boom'); GWAudio.sfx('quest');
    give('shards', 1200); spawnPickup('ingot', 'starfall', e.pos); spawnPickup('rune', 'thirst', e.pos);
    setTimeout(() => UI.banner('the ninefold is rewritten', 'THE CROWN FALLS', 6), 800);
    if (QUESTS[G.stage].id === 'dunmaer') { gainXP(1500); setTimeout(() => advance(), 6500); }
    save();
  }
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
    if (id === 'tomb') setTimeout(() => UI.hint('Tombs and caves lead <b>underground</b>: walk to the entrance and press <b>E</b>.<br>The deepest rooms keep the best loot.', 7), 2500);
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
    else if (kind === 'arms') {
      const c = GW.Arms.CLS[key]; if (!GW.Arms.learn(P, key)) { give('shards', 80); return; }
      UI.toast(`<span style="color:${c.col}">${c.g}</span> New weapon: <b>${c.name}</b> · <span style="color:#ffcf6a">B to carry it · X swaps</span>`, 5);
      GWAudio.sfx('quest'); UI.refreshArms && UI.refreshArms(); save(); return;
    }
    else if (kind === 'ore') {
      const O = GW.Forge.ORES[key]; P.inv.ores = P.inv.ores || {}; P.inv.ores[key] = (P.inv.ores[key] || 0) + n;
      UI.toast(`<span style="color:#${O.color.toString(16).padStart(6, '0')}">${O.g}</span> ${O.name}${n > 1 ? ' ×' + n : ''}`, 2.2);
      if (!G.hintsShown.smelt) { G.hintsShown.smelt = true; setTimeout(() => UI.hint('Smelt ore into ingots at any <b>anvil</b> (π on the map).', 4), 1500); }
      GWAudio.sfx('pickup'); return;
    }
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
      if (id === 'free') return UI.dialog([{ who: MARA, text: 'Listen. The grass is only grass again.' }, { who: MARA, text: 'The Warden left you starfall. Smelt it at an anvil and forge it into your blade: you will need its edge out there.' }, { who: MARA, text: 'Then take the road north-east to Hearthwick. The vale was only the first page.' }]);
      if (id === 'hearth') return UI.dialog([{ who: MARA, text: 'Hearthwick. North-east, where the roads cross. Oswin keeps the waystones there; he will know what comes next.' }]);
      if (id === 'seals') return UI.dialog([{ who: MARA, text: `Four guardians, four seals. ${G.sealsBroken()} broken. Each land has its own bite: read the map before you walk into it.` }]);
      if (id === 'dunmaer') return UI.dialog([{ who: MARA, text: 'The castle in the north-east is burning from the inside. Whatever wears that crown wrote the Warden, and the wolves, and the grass. Unwrite it.' }]);
      if (id === 'end') return UI.dialog([{ who: MARA, text: 'Listen. The grass is only grass again, all the way to the mountains. Rest a while, wanderer. Or walk. It is yours.' }]);
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
    $('t-foot').textContent = 'WASD move · mouse aim · LMB attack (hold: heavy) · RMB block (tap on impact: parry) · Space roll · X swap weapon · 1-4 abilities · B book · Q flask · E interact · C gear · wheel zoom · hold middle mouse to turn the camera';
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
    const VS = GW.World.VS;
    [[-3, 62], [3, 61], [0, 56]].forEach(([x, z]) => G.spawnEnemy('husk', x, (z - 60) + 60 * VS));
    const packs = [[4, -48], [22, -60], [-2, -70], [28, -44], [14, -78]].map(([x, z]) => [Lw.meadow.x + (x - 12) * 1.5, Lw.meadow.z + (z + 58) * 1.5]);
    packs.forEach(([px, pz]) => { for (let k = 0; k < 3; k++) { const a = k * 2.1; G.spawnEnemy('wolf', px + Math.cos(a) * 2.5, pz + Math.sin(a) * 2.5, { x: px, z: pz }); } });
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, r = 6 + (k % 4) * 4.5; G.spawnEnemy('hollow', Lw.ruins.x + Math.cos(a) * r, Lw.ruins.z + Math.sin(a) * r); }
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2, r = 6 + (k % 2) * 6; G.spawnEnemy('wisp', Lw.grove.x + Math.cos(a) * r, Lw.grove.z + Math.sin(a) * r); }
    G.boss = G.spawnEnemy('warden', Lw.arena.x, Lw.arena.z - 4);
    G.widow = G.spawnEnemy('widow', Lw.lair.x, Lw.lair.z);
    // the region bosses, each in its own lair
    G.regionBosses = [
      { key: 'colossus', type: 'colossus', x: 2600, z: 1500, title: 'THE ASH COLOSSUS', sub: 'the ground cracks open' },
      { key: 'rimeknight', type: 'rimeknight', x: 120, z: -2470, title: 'THE RIME KNIGHT', sub: 'frost climbs your armour' },
      { key: 'mirehag', type: 'mirehag', x: -2050, z: 1560, title: 'THE MIRE HAG', sub: 'the water starts to boil' },
      { key: 'cragwarlord', type: 'cragwarlord', x: 2470, z: -1520, title: 'THE CRAG WARLORD', sub: 'kneel, or be broken' },
    ];
    G.regionBosses.forEach(b => { const A = GW.World.ARENAS.find(a => a.key === b.key); if (A) { b.x = A.x; b.z = A.z; }   // world.js owns the arena spots
      b.e = G.spawnEnemy(b.type, b.x, b.z, { x: b.x, z: b.z }, false, 1 + Math.floor(Math.hypot(b.x, b.z) / GW.World.LVLD)); b.e.bossKey = b.key; });
    // Greymoss Keep: hollows guard the courtyard, loot waits on the broken upper floor
    { const BS = GW.World.BS; [[-4, -5], [4, -4], [0, -8], [-7, -2], [7, -7]].forEach(([lx, ly]) => G.spawnEnemy('hollow', Lw.castle.x + lx * BS, Lw.castle.z - ly * BS, { x: Lw.castle.x, z: Lw.castle.z + 3 * BS })); }
    // camps beyond the Vale: wolves in the outer Vale and Frostmere, hollows in the Ashen Barrens
    const pack = (type, x, z, n) => { for (let k = 0; k < n; k++) { const a = k * 2.1; G.spawnEnemy(type, x + Math.cos(a) * 2.5, z + Math.sin(a) * 2.5, { x, z }); } };
    [[-400, 150], [300, 200], [-250, -300], [520, -560], [-620, -180], [180, 420], [-380, 520]].forEach(([x, z]) => pack('wolf', x, z, 3));
    [[-300, -800], [100, -1060], [-520, -950], [320, -720], [-800, -700], [900, 600], [-900, 700], [600, 1100], [-1000, -200]].map(([x, z]) => [x * GW.World.WS, z * GW.World.WS]).forEach(([x, z]) => pack('wolf', x, z, 3));
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
      if (Math.abs(x) > GW.World.HALF - 200 || Math.abs(z) > GW.World.HALF - 200 || GW.World.blocked(x, z, 1.2) || GW.World.riverAt(x, z) < 6 || G.nearFire(x, z, 14)) continue;
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
    const P = G.player, ex = GW.Skills.r(P, 'b_exec'), dmg = (e.T.boss ? e.maxHp * 0.08 + P.ws.dmg * 4 : e.maxHp * 0.5 + P.ws.dmg * 4) * (1 + 0.5 * ex);
    e.brokenT = 0; e.model.rotation.z = 0;
    G.hitEnemy(e, dmg, { heavy: true, from: P.pos, melee: true, finisher: true });
    P.hp = Math.min(P.maxHp, P.hp + P.maxHp * (0.12 + 0.08 * ex)); G.hitstop = 0.16; G.shake(0.7); GWAudio.sfx('crit'); GWAudio.sfx('slam');
    G.fuseReady('finisher');
    UI.float('FINISHER', e.pos, { color: '#ffd860', size: 17, y: e.T.radius * 2 + 1.6, life: 1.2 }); G.addHitGlyphs(e.pos.x, e.pos.y + 1.2, e.pos.z, 26, '#ffd860');
  };
  // attack tokens: only a few melee enemies may commit to an attack on the hero at once; the rest circle and wait
  const ATK = { windup: 1, windup2: 1, slash: 1, lunge: 1, bash: 1, feint: 1, dart: 1 };
  G.canAttack = function (e) {
    const P = G.player, max = 2 + (P.level >= 10 ? 1 : 0);
    if (ATK[e.state]) return true;
    let n = 0;
    for (const o of G.enemies) if (o !== e && o.alive && !o.T.boss && ATK[o.state] && o.distTo(P.pos) < 14) n++;
    return n < max;
  };
  G.packNear = function (e) { let n = 0; for (const o of G.enemies) if (o.alive && o.aggro && o.base === e.base && o.distTo(e.pos) < 14) n++; return n; };
  // ---------------- fusion: a parry, perfect dodge or finisher charges the next ability with an element ----------------
  G.FUSE = { fire: { name: 'FIRE', col: '#ff8a40', hex: 0xff7a30, src: 'parry' }, frost: { name: 'FROST', col: '#9fe0ff', hex: 0x9fe0ff, src: 'perfect dodge' }, storm: { name: 'STORM', col: '#c8a0ff', hex: 0xc8a0ff, src: 'finisher' } };
  G.fuseReady = function (src) {
    const P = G.player; if (!GW.Skills.r(P, 'y_fuse')) return;
    const el = { parry: 'fire', dodge: 'frost', finisher: 'storm' }[src], F = G.FUSE[el];
    P.fuseT = G.t + 1.8; P.fuseEl = el;
    UI.float('⊕ FUSE · ' + F.name, P.pos, { color: F.col, size: 14, y: 3.1, life: 1.2 });
    for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; G.hitGlyphs.push({ x: P.pos.x + Math.cos(a) * 1.3, y: P.pos.y + 1, z: P.pos.z + Math.sin(a) * 1.3, vx: Math.cos(a) * 2, vy: 2, vz: Math.sin(a) * 2, t: 0, life: 0.6, ch: '⊕', col: F.col }); }
    if (!G.hintsShown.fuse) { G.hintsShown.fuse = true; UI.hint('<b>⊕ FUSE</b>: cast an ability on 1–4 now. It costs no focus, hits 50% harder and carries ' + F.name.toLowerCase() + '.', 4.5); }
  };
  G.fuseCast = function (P, sk) {
    const F = G.FUSE[P.fuseEl];
    UI.float('FUSED ' + sk.name.toUpperCase(), P.pos, { color: F.col, size: 16, y: 3.1, life: 1.2 }); GWAudio.sfx('crit'); GWAudio.sfx('cast'); G.shake(0.25);
    G.parts.spark.burst(P.pos.x, P.pos.y + 1, P.pos.z, 30, 5, F.hex, 0.6, 1.2, -2, 1.5);
  };
  // ---------------- mining: three strikes and the vein gives up its ore; it grows back after 20 minutes ----------------
  GW.World.isMined = id => !!(G.mined[id] && Date.now() - G.mined[id] < 20 * 60 * 1000);
  G.mineHit = function (it) {
    if (it.type === 'pz') return G.pzDig(it);
    const P = G.player, O = GW.Forge.ORES[it.ore], col = '#' + O.color.toString(16).padStart(6, '0');
    it.hits = (it.hits || 0) + 1; GWAudio.sfx('anvil'); G.shake(0.12); G.hitstop = 0.04;
    G.parts.spark.burst(it.x, P.pos.y + 0.9, it.z, 12, 4, O.color, 0.4, 1, -6);
    G.addHitGlyphs(it.x, P.pos.y + 1, it.z, 6, col);
    if (it.hits < 3) { UI.float(it.hits + '/3', new V3(it.x, P.pos.y, it.z), { color: col, size: 12, y: 2.2, life: 0.6 }); return; }
    const n = 1 + (Math.random() < 0.5 ? 1 : 0) + ((it.lvl || 1) >= 6 ? 1 : 0) + (Math.random() < (P.ws.xp || 0) ? 1 : 0);
    give('ore', it.ore, n); it.hits = 0; G.mined[it.id] = Date.now(); if (it.crystals) it.crystals.visible = false;
    G.glyphRing(it.x, P.pos.y + 1, it.z, 0.6, 14, O.g + '*·', col, 5, 0.6, 15); save();
  };

  // ---------------- puzzles: each one guards an elite-quality cache; solved state is saved ----------------
  // runes: touch four stones in the order the tablet gives · lanterns: turn three beams onto the shrine
  // plates: step only on the slabs the mosaic marks · bells: strike the melody the humming stone sings · dig: a vista's hidden cache
  G.solved = {}; G.pzS = {}; G.pzSeq = [];
  const RUNE_G = ['◇', '✕', '△', '○'], BELL_F = [392, 440, 523.25, 587.33], BELL_G = ['♩', '♪', '♫', '♬'];
  const PZ_NAME = { runes: 'RUNE VAULT', lanterns: 'LANTERN SHRINE', plates: 'PRESSURE CRYPT', bells: 'ECHO BELLS', dig: 'BURIED CACHE' };
  G.pzState = function (p) {
    let s = G.pzS[p.id]; if (s) return s;
    const R = GW.rand(p.seed + 401), Z = GW.World.puzzleLayout(p), perm = [0, 1, 2, 3]; for (let i = 3; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    s = G.pzS[p.id] = { p, Z, prog: 0, order: perm };
    if (p.pz === 'lanterns') { s.dirs = [0, 1, 2].map(() => 1 + Math.floor(R() * 3)); }
    if (p.pz === 'plates') { const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8]; for (let i = 8; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; } s.safe = cells.slice(0, 4); s.down = {}; s.on = -1; }
    if (p.pz === 'bells') s.order = [0, 1, 2, 3].map(() => Math.floor(R() * 4));
    if (p.cache) s.hits = 0;
    return s;
  };
  const gy = (x, z, h) => new V3(x, GW.World.heightAt(x, z) + h, z);
  const PZ_TILE_G = new THREE.BoxGeometry(2.0, 0.16, 2.0), PZ_TILE_M = GW.mat({ id: ID.MASONRY, tex: 1, color: 0xa8aab4, fill: 0.1 }), PZ_TILE_ON = GW.mat({ id: ID.MASONRY, tex: 1, color: 0xe8c070, emissive: 0x5a3a08, fill: 0.1 });
  function pzDropTiles() { for (const id in G.pzS) { const s = G.pzS[id]; if (s.tiles && Math.hypot(G.player.pos.x - s.p.x, G.player.pos.z - s.p.z) > 120) { s.tiles.forEach(m => G.scene.remove(m)); s.tiles = null; } } }
  function pzFail(s, why) {
    s.prog = 0; if (s.down) s.down = {};
    GWAudio.sfx('ui'); G.shake(0.15); UI.toast('<span style="color:#ff8a7a">✕</span> ' + why, 1.8);
    const v = s.Z.vault; G.glyphRing(v.x, GW.World.heightAt(v.x, v.z) + 1, v.z, 1.2, 12, '×·', '#ff7060', 3, 0.5, 14);
  }
  function pzSolve(s) {
    const p = s.p; if (G.solved[p.id]) return; G.solved[p.id] = Date.now();
    const v = s.Z.vault || s.Z.dig, y = GW.World.heightAt(v.x, v.z);
    GWAudio.sfx('level'); G.shake(0.25); UI.banner('the seal gives way', (PZ_NAME[p.pz || 'dig']) + ' SOLVED', 2.6);
    G.glyphRing(v.x, y + 1, v.z, 0.8, 22, '✦◇*·', '#ffd860', 6, 0.9, 18); G.parts.spark.burst(v.x, y + 1, v.z, 40, 5, 0xffd870, 0.8, 1.2, -3, 2);
    gainXP(40 + p.lvl * 12);
    if (p.cache) openChest({ id: 'puz:' + p.id, x: v.x, z: v.z, poi: Object.assign({}, p, { type: 'elite', seed: p.seed + 91 }) });
    else { UI.hint('The ' + (p.pz === 'plates' ? 'crypt' : 'vault') + ' is open. Press <b>E</b> at it to claim what it kept.', 4); save(); }
  }
  G.pzUse = function (it) {
    const p = it.poi, s = G.pzState(p), P = G.player;
    if (it.role === 'vault') {
      if (G.solved[p.id]) { if (!G.opened['puz:' + p.id]) openChest({ id: 'puz:' + p.id, x: it.x, z: it.z, poi: Object.assign({}, p, { type: 'elite', seed: p.seed + 91 }) }); return; }
      UI.toast({ runes: 'Sealed. Four rune stones stand around it.', lanterns: 'Sealed. Its lock waits for light.', plates: 'Sealed. The slabs before it are worn by old footsteps.', bells: 'Sealed. Four bells hang silent around it.' }[p.pz], 2.4); GWAudio.sfx('ui'); return;
    }
    if (it.role === 'dig') { if (P.state === 'move') { P.state = 'mine'; P.t = 0; P.fired = false; P.mineIt = it; P.yaw = Math.atan2(it.x - P.pos.x, it.z - P.pos.z); } return; }
    if (p.pz === 'runes' && it.role === 'tablet') { UI.banner('the tablet reads', s.order.map(k => RUNE_G[k]).join('  '), 3.6); GWAudio.sfx('socket'); return; }
    if (p.pz === 'runes' && it.role === 'stone') {
      if (s.order[s.prog] !== it.idx) return pzFail(s, 'The stones go dark. Start again.');
      s.prog++; GWAudio.tone(BELL_F[Math.min(3, s.prog - 1)] * 0.75, 0.7); G.glyphRing(it.x, GW.World.heightAt(it.x, it.z) + 1.3, it.z, 0.5, 10, RUNE_G[it.idx] + '·', '#9fd8ff', 3, 0.5, 14);
      if (s.prog >= 4) pzSolve(s); return;
    }
    if (p.pz === 'lanterns' && it.role === 'lantern') {
      s.dirs[it.idx] = (s.dirs[it.idx] + 1) % 4; GWAudio.sfx('anvil'); G.shake(0.06);
      if (s.dirs.every(d => d === 0)) pzSolve(s); else if (s.dirs[it.idx] === 0) { GWAudio.tone(523.25, 0.6); UI.toast('<span style="color:#ffd860">✦</span> The beam finds the shrine', 1.4); }
      return;
    }
    if (p.pz === 'plates' && it.role === 'tablet') {
      const rows = [0, 1, 2].map(r => [0, 1, 2].map(c => s.safe.includes(r * 3 + c) ? '■' : '□').join(' ')).join('<br>');
      UI.toast('<div style="text-align:center;line-height:1.25">the crypt side is at the top<br><span style="font-size:22px;letter-spacing:4px;color:#ffd860">' + rows + '</span></div>', 5); GWAudio.sfx('socket'); return;
    }
    if (p.pz === 'bells' && it.role === 'tablet') {
      if (G.pzSeq.length) return; UI.toast('The stone hums...', 1.6);
      s.order.forEach((b, k) => G.pzSeq.push({ t: G.t + 0.6 + k * 0.8, s, b, ghost: true })); s.prog = 0; return;
    }
    if (p.pz === 'bells' && it.role === 'bell') {
      ringBell(s, it.idx, false);
      if (s.order[s.prog] !== it.idx) return pzFail(s, 'A sour note. The bells fall still.');
      s.prog++; if (s.prog >= 4) setTimeout(() => pzSolve(s), 500);
    }
  };
  function ringBell(s, b, ghost) {
    const bl = s.Z.bells[b], y = GW.World.heightAt(bl.x, bl.z);
    GWAudio.tone(BELL_F[b], ghost ? 1.1 : 1.3);
    G.hitGlyphs.push({ x: bl.x, y: y + 2.6, z: bl.z, still: true, pop: true, size: ghost ? 22 : 30, t: 0, life: 0.7, ch: BELL_G[b], col: ghost ? '#a8b8ff' : '#ffe9a0' });
    if (ghost) { const t = s.Z.tablet; G.hitGlyphs.push({ x: t.x, y: GW.World.heightAt(t.x, t.z) + 2.4, z: t.z, vy: 1.2, ng: true, t: 0, life: 0.9, ch: BELL_G[b], col: '#a8b8ff', size: 20 }); }
  }
  G.pzDig = function (it) {
    const P = G.player, s = G.pzState(it.poi);
    s.hits = (s.hits || 0) + 1; GWAudio.sfx('hit'); G.shake(0.1);
    G.parts.spark.burst(it.x, P.pos.y + 0.3, it.z, 14, 3, 0x8a7050, 0.5, 1, -8);
    if (s.hits < 3) { UI.float(s.hits + '/3', new V3(it.x, P.pos.y, it.z), { color: '#d8c090', size: 12, y: 1.8, life: 0.6 }); return; }
    pzSolve(s);
  };
  // per frame: bell playback, plate stepping, lantern beams and state glyphs over every puzzle within reach
  G.pzUpdate = function () {
    while (G.pzSeq.length && G.t >= G.pzSeq[0].t) { const q = G.pzSeq.shift(); ringBell(q.s, q.b, true); }
    const P = G.player; if ((P.floor || 0) !== 0 || G.dungeon) return;
    if ((G.frameN = (G.frameN || 0) + 1) % 60 === 0) pzDropTiles();
    for (const it of GW.World.interact) {
      if (it.type !== 'pz') continue;
      const p = it.poi, d = Math.hypot(P.pos.x - it.x, P.pos.z - it.z); if (d > 28) continue;
      const s = G.pzState(p), done = !!G.solved[p.id], key = 'pz' + p.id + it.role + (it.idx || 0);
      if (it.role === 'vault') {
        const open = G.opened['puz:' + p.id];
        it.label = done ? (p.pz === 'plates' ? 'Open the crypt' : 'Open the vault') : (p.pz === 'plates' ? 'A sealed crypt' : p.pz === 'runes' ? 'A sealed vault' : 'A sealed chest');
        if (d < 18) UI.label(key, done ? (open ? '·' : '⌂ open') : '⌂ sealed', gy(it.x, it.z, 2.6), 'name', done ? '#ffd860' : '#8a90a0');
        if (p.pz === 'plates') {   // the slabs: flat carved stones, gold once pressed
          if (!s.tiles) { s.tiles = s.Z.plates.map(pl => { const m = new THREE.Mesh(PZ_TILE_G, PZ_TILE_M); m.position.set(pl.x, GW.World.heightAt(pl.x, pl.z) + 0.12, pl.z); G.scene.add(m); return m; }); }
          s.tiles.forEach((m, k) => { m.material = (done || s.down[k]) ? PZ_TILE_ON : PZ_TILE_M; });
        }
        if (p.pz === 'plates' && !done) {   // stepping: the player's feet press whichever slab they stand on
          let on = -1; s.Z.plates.forEach((pl, k) => { if (Math.abs(P.pos.x - pl.x) < 1.05 && Math.abs(P.pos.z - pl.z) < 1.05) on = k; });
          if (on !== s.on && on >= 0 && !s.down[on]) {
            if (s.safe.includes(on)) { s.down[on] = 1; GWAudio.sfx('anvil'); GWAudio.tone(392 + Object.keys(s.down).length * 60, 0.5); if (s.safe.every(k => s.down[k])) pzSolve(s); }
            else { const pl = s.Z.plates[on], y = GW.World.heightAt(pl.x, pl.z); G.glyphRing(pl.x, y + 0.2, pl.z, 0.3, 10, '^Λ', '#ff6050', 4, 0.4, 16); G.hurtPlayer(12, new V3(pl.x, y, pl.z), { dot: true }); pzFail(s, 'Spikes! The plates reset.'); }
          }
          s.on = on;
          if (d < 16) s.Z.plates.forEach((pl, k) => UI.label(key + 'p' + k, s.down[k] ? '◆' : '□', gy(pl.x, pl.z, 0.35), 'name', s.down[k] ? '#ffd860' : '#8a94a8'));
        }
        if (p.pz === 'lanterns') {   // the beams: glyph lines from each lantern, gold when they meet the shrine
          s.Z.lanterns.forEach((l, k) => {
            const base = Math.atan2(p.x - l.x, p.z - l.z), a = base + (done ? 0 : s.dirs[k]) * Math.PI / 2, ok = done || s.dirs[k] === 0, L = ok ? Math.hypot(p.x - l.x, p.z - l.z) - 0.8 : 6;
            const y0 = GW.World.heightAt(l.x, l.z) + 1.5;
            G.glyphChain({ x: l.x, y: y0, z: l.z }, { x: l.x + Math.sin(a) * L, y: ok ? GW.World.heightAt(p.x, p.z) + 1.2 : y0, z: l.z + Math.cos(a) * L }, ok ? '#ffd860' : '#9fc8ff', ok ? '#fff0b0' : '#6a88c0');
          });
        }
      }
      if (done) continue;
      if (it.role === 'stone') UI.label(key, RUNE_G[it.idx], gy(it.x, it.z, 2.0), 'name', s.order.slice(0, s.prog).includes(it.idx) ? '#ffd860' : '#9fd8ff');
      if (it.role === 'bell' && d < 18) UI.label(key, BELL_G[it.idx], gy(it.x, it.z, 2.2), 'name', s.order.slice(0, s.prog).length && s.order[s.prog - 1] === it.idx ? '#ffd860' : '#c8c0ff');
      if (it.role === 'tablet' && d < 12) UI.label(key, '?', gy(it.x, it.z, 2.2), 'name', '#c8a0ff');
      if (it.role === 'dig' && (d < 8 || (G.pzKnown && G.pzKnown[p.id]))) UI.label(key, '✕', gy(it.x, it.z, 0.9), 'name', '#ffc870');
    }
  };
  // a free spot about `dist` from `from`, roughly along angle `a`, with a clear line to it (no collider on the way)
  G.clearSpot = function (from, a, dist) {
    const W = GW.World, fl = G.player.floor || 0;
    for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) for (const d of [dist, dist * 0.65, dist * 0.4]) {
      const b = a + off, x = from.x + Math.sin(b) * d, z = from.z + Math.cos(b) * d; let ok = true;
      for (let t = 0.15; t <= 1.001 && ok; t += 0.6 / d) if (W.blocked(from.x + (x - from.x) * t, from.z + (z - from.z) * t, 0.45, fl)) ok = false;
      if (ok) return { x, z };
    }
    return null;
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
  // a ring of characters flying outward (or inward with a negative speed), no gravity
  G.glyphRing = function (x, y, z, r, n, chars, col, speed, life, size) {
    for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 + Math.random() * 0.2, sp = speed === undefined ? 6 : speed;
      G.hitGlyphs.push({ x: x + Math.cos(a) * r, y: y + (Math.random() - 0.5) * 0.3, z: z + Math.sin(a) * r, vx: Math.cos(a) * sp, vy: 0.4, vz: Math.sin(a) * sp, ng: true, t: 0, life: (life || 0.45) * (0.8 + Math.random() * 0.4),
        ch: chars[Math.floor(Math.random() * chars.length)], col, size }); }
    if (G.hitGlyphs.length > 320) G.hitGlyphs.splice(0, G.hitGlyphs.length - 320);
  };
  // a chain of links between two points this frame: 'o' rings with a stroke between, the stroke angled to the screen
  const _la = new V3(), _lb = new V3();
  G.glyphChain = function (a, b, col, linkCol) {
    _la.set(a.x, a.y, a.z).project(G.camera); _lb.set(b.x, b.y, b.z).project(G.camera);
    const ang = Math.atan2(-(_lb.y - _la.y) * innerHeight, (_lb.x - _la.x) * innerWidth), st = slashCh(ang);
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), n = Math.max(2, Math.round(L / 0.42));
    for (let k = 0; k <= n; k++) { const t = k / n;
      G.hitGlyphs.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, still: true, t: 0, life: 0.05, ch: k % 2 ? st : 'o', col: k % 2 ? (linkCol || col) : col, size: k % 2 ? 15 : 17 }); }
  };
  // glyph lightning: a jagged run of bright characters between two points, flickering for a moment, with a light flash
  G.bolt = function (a, b, col, o) {
    o = o || {}; col = col || '#d8c0ff';
    const ay = (a.y || 0) + (o.ay !== undefined ? o.ay : 1.2), by = (b.y || 0) + (o.by !== undefined ? o.by : 1.1);
    const dx = b.x - a.x, dy = by - ay, dz = b.z - a.z, L = Math.hypot(dx, dy, dz) || 1, n = Math.max(4, Math.round(L / 0.45));
    const px = -dz / L, pz = dx / L, CH = 'ϟ/\\|';
    for (let pass = 0; pass < 2; pass++) {   // two strands, the second fainter and later, so the bolt flickers
      let jx = 0, jy = 0;
      for (let k = 0; k <= n; k++) {
        const t = k / n, edge = k === 0 || k === n; jx = edge ? 0 : GW.clamp(jx + (Math.random() - 0.5) * 0.5, -0.45, 0.45); jy = edge ? 0 : GW.clamp(jy + (Math.random() - 0.5) * 0.4, -0.35, 0.35);
        G.hitGlyphs.push({ x: a.x + dx * t + px * jx, y: ay + dy * t + jy, z: a.z + dz * t + pz * jx, still: true, size: pass ? 18 : 26, t: -pass * 0.07, life: 0.32 + Math.random() * 0.14,
          ch: CH[Math.floor(Math.random() * CH.length)], col: pass ? col : (k % 3 ? '#ffffff' : col) });
      }
    }
    G.parts.spark.burst(b.x, by, b.z, 10, 4, 0xd8c0ff, 0.3, 1.2, -4);
    const lt = GW.World.lights.add(b.x, by, b.z, new THREE.Color(0.75, 0.6, 1.0).multiplyScalar(2.2), 9, 0.6);
    setTimeout(() => GW.World.lights.remove(lt), 160);
    if (G.hitGlyphs.length > 260) G.hitGlyphs.splice(0, G.hitGlyphs.length - 260);
  };
  // the glint: a star flashes on the enemy's weapon as the parry window opens (red = unblockable, dodge it)
  G.glint = function (e, red, sp) {
    let p;
    if (sp && sp.y !== undefined) { const f = (sp.f || 0) * (e.model.scale.x || 1); p = new V3(e.pos.x + Math.sin(e.yaw) * f, e.pos.y + sp.y * (e.model.scale.y || 1), e.pos.z + Math.cos(e.yaw) * f); }
    else if (e.sword) { p = e.sword.localToWorld(new V3(0, 0, 0.9)); } else { p = new V3(e.pos.x + Math.sin(e.yaw) * 0.9, e.pos.y + 0.8, e.pos.z + Math.cos(e.yaw) * 0.9); }
    const col = red ? '#ff4030' : '#fffbe8';
    G.hitGlyphs.push({ x: p.x, y: p.y, z: p.z, still: true, size: 46, pop: true, t: 0, life: 0.34, ch: red ? '!' : '✦', col });
    G.hitGlyphs.push({ x: p.x, y: p.y, z: p.z, still: true, size: 70, pop: true, t: 0, life: 0.2, ch: '+', col: red ? '#ff8060' : '#ffe9a0' });
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; G.hitGlyphs.push({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5 + 6, vz: Math.sin(a) * 2, t: 0, life: 0.22, ch: '·', col }); }
    if (e.distTo(G.player.pos) < 16) GWAudio.sfx(red ? 'zap' : 'socket');
  };
  // ---------------- slash arcs: each swing leaves a crescent of bright characters that flicker and scatter ----------------
  const _sa = new V3(), _sb = new V3(), SLASH_LIFE = 0.26;
  const slashCh = ang => { const a = ((ang % Math.PI) + Math.PI) % Math.PI; return a < 0.39 || a > 2.75 ? '-' : a < 1.18 ? '\\' : a < 1.96 ? '|' : '/'; };
  function drawSlashGlyphs(dt) {
    const P = G.player, tr = P && P.trail; if (!fxCx || !tr) return;
    const pts = tr.pts.filter(p => p.on && p.age < SLASH_LIFE); const step0 = 7; if (pts.length < 2) return;
    const cx = fxCx, W = fxCv.width, H = fxCv.height, dpr = W / innerWidth, step = 7 * dpr;
    const col = '#' + tr.color.getHexString();
    cx.save(); cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.globalCompositeOperation = 'lighter';
    const rows = [[1.04, 1, 19, 'bold '], [0.92, 0.85, 17, 'bold '], [0.8, 0.6, 15, ''], [0.66, 0.35, 13, '']];
    for (const [r, alpha, size, wt] of rows) {
      cx.font = `${wt}${Math.round(size * dpr)}px ui-monospace, Menlo, monospace`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1];
        _sa.copy(p.a).lerp(p.b, r).project(G.camera); _sb.copy(q.a).lerp(q.b, r).project(G.camera);
        if (_sa.z > 1 || _sb.z > 1) continue;
        const x0 = (_sa.x * 0.5 + 0.5) * W, y0 = (-_sa.y * 0.5 + 0.5) * H, x1 = (_sb.x * 0.5 + 0.5) * W, y1 = (-_sb.y * 0.5 + 0.5) * H;
        const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(len / step)), ch = slashCh(Math.atan2(y1 - y0, x1 - x0));
        const fade = 1 - p.age / SLASH_LIFE;
        for (let k = 0; k < n; k++) {
          const t = k / n, flick = Math.random();
          cx.globalAlpha = alpha * fade * (0.75 + 0.25 * flick);
          cx.fillStyle = r > 1 && p.age < 0.07 ? '#ffffff' : col;
          cx.fillText(flick < 0.07 ? '*' : flick < 0.12 ? '~' : ch, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
        }
        // the edge sheds a few characters that drift off and fade (hit-glyph pool)
        if (r > 1 && p.age > 0.08 && Math.random() < 4 * dt) {
          const w = new V3().copy(p.a).lerp(p.b, 0.95);
          G.hitGlyphs.push({ x: w.x, y: w.y, z: w.z, vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 2, t: 0, life: 0.35 + Math.random() * 0.3, ch: '.,\'`:'[Math.floor(Math.random() * 5)], col });
        }
      }
    }
    cx.restore();
  }
  function drawHitGlyphs(dt) {
    if (!fxCx || !G.hitGlyphs.length) return;
    const cx = fxCx, W = fxCv.width, H = fxCv.height, dpr = W / innerWidth;
    cx.save(); cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.font = `bold ${Math.round(13 * dpr)}px ui-monospace, Menlo, monospace`; cx.globalCompositeOperation = 'lighter';
    G.hitGlyphs = G.hitGlyphs.filter(g => {
      g.t += dt; if (g.t > g.life) return false;
      if (g.follow) { g.x = g.follow.x; g.y = g.follow.y; g.z = g.follow.z; }
      else if (!g.still) { g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt; if (!g.ng) g.vy -= 12 * dt; else { g.vx *= 1 - 2.5 * dt; g.vz *= 1 - 2.5 * dt; g.vy *= 1 - 2.5 * dt; } }
      _hg.set(g.x, g.y, g.z).project(G.camera); if (_hg.z > 1) return true;
      if (g.t < 0) return true;
      const k = g.t / g.life;
      if (g.size) cx.font = `bold ${Math.round(g.size * (g.pop ? 1 + 0.6 * Math.sin(Math.min(1, k * 2) * Math.PI) : 1) * dpr)}px ui-monospace, Menlo, monospace`;
      cx.globalAlpha = 1 - k; cx.fillStyle = g.col; cx.fillText(g.ch, (_hg.x * 0.5 + 0.5) * W, (-_hg.y * 0.5 + 0.5) * H);
      if (g.size) cx.font = `bold ${Math.round(13 * dpr)}px ui-monospace, Menlo, monospace`;
      return true;
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
          G.opened = d.opened || {}; G.mined = d.mined || {}; G.solved = d.solved || {}; G.pzKnown = d.pzKnown || {}; for (const it of GW.World.interact) if (it.type === 'vein' && it.crystals) it.crystals.visible = !GW.World.isMined(it.id); G.discovered = d.discovered || {}; G.cleared = d.cleared || {}; G.poiSeen = d.poiSeen || {}; G.waystones = d.waystones || {}; G.bounty = d.bounty || {}; G.waypoint = d.waypoint || null;
          if (d.extraFlasks) { P.extraFlasks = d.extraFlasks; P.maxFlasks = 3 + d.extraFlasks; } if (d.fog) fogUnpack(d.fog);
          P.weapon = d.weapon; P.inv = d.inv; if (P.inv.kindling === undefined) P.inv.kindling = 3;
          (d.fires || []).forEach(f => makeFire(f.x, f.z, f.left, true));
          P.inv.armor = P.inv.armor || { greathelm: 1, knightplate: 1, crimson: 1 }; P.cd = {};
          P.gear = Object.assign({}, GW.Knight.DEFAULT, d.gear || {}); GW.Knight.dress(P);
          if (d.tod !== undefined) G.tod = d.tod;
          G.castleLooted = !!d.castleLooted; G.items = d.items || {};
          G.stage = Math.max(0, Math.min(QUESTS.length - 1, d.stage | 0)); G.counters = d.counters || {}; G.respawn = d.respawn; G.bossDead = d.bossDead;
          // a respawn point that's underground (dungeons live far outside the map), off the map, or broken falls back to the Waking Stone
          { const r = G.respawn, H = GW.World.HALF - 150; if (!r || !isFinite(r.x) || !isFinite(r.z) || Math.abs(r.x) > H || Math.abs(r.z) > H) G.respawn = null; }
          if (G.waypoint && (!isFinite(G.waypoint.x) || Math.abs(G.waypoint.x) > GW.World.HALF)) G.waypoint = null;
          if (G.bossDead) killSilently(G.boss);
          G.widowDead = !!d.widowDead; if (G.widowDead) killSilently(G.widow);
          G.bossesDead = d.bossesDead || {}; G.regionBosses.forEach(b => { if (G.bossesDead[b.key]) killSilently(b.e); });
        }
      } else { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }
      G.castleLoot();
      GW.Abil.ensure(P); GW.Arms.ensure(P); GW.Knight.dress(P); UI.refreshAbil && UI.refreshAbil(); UI.refreshArms && UI.refreshArms();
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
  G.FOG_CELL = 20 * GW.World.WS; G.FOG_N = Math.ceil(GW.World.SIZE / G.FOG_CELL); G.fog = new Uint8Array(G.FOG_N * G.FOG_N); G.discovered = {};
  function explore() {
    if (G.dungeon) return;
    const P = G.player, S = GW.World.SIZE, FC = G.FOG_CELL, FN = G.FOG_N, R = 70;
    const i0 = Math.floor((P.pos.x - R + S / 2) / FC), i1 = Math.floor((P.pos.x + R + S / 2) / FC), j0 = Math.floor((P.pos.z - R + S / 2) / FC), j1 = Math.floor((P.pos.z + R + S / 2) / FC);
    for (let j = Math.max(0, j0); j <= Math.min(FN - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(FN - 1, i1); i++)
      if (Math.hypot((i + 0.5) * FC - S / 2 - P.pos.x, (j + 0.5) * FC - S / 2 - P.pos.z) < R) { if (!G.fog[j * FN + i]) G.fogVer = (G.fogVer || 0) + 1; G.fog[j * FN + i] = 1; }
    for (const f of GW.World.fires) if (!f.rest.own && !G.discovered[f.rest.name] && Math.hypot(f.x - P.pos.x, f.z - P.pos.z) < 16) { G.discovered[f.rest.name] = true; UI.toast(`<span style="color:#ff9a40">▲</span> Found a fire: ${f.rest.name}`, 3); }
    const r = GW.World.regionAt(P.pos.x, P.pos.z);
    if (r !== G.region) { const R0 = GW.World.REGIONS[r], lv = GW.World.regionLevels(r); if (G.region) UI.banner(R0.sub + '  ·  lv ' + lv[0] + '–' + lv[1], R0.name, 3.6, R0.col); G.region = r; }
  }
  G.compassPOIs = function () {
    const W = GW.World, out = [];
    for (const z of W.ZONES) out.push({ x: z.x, z: z.z, g: '◇', col: '#c8ccd8', range: 520 });
    for (const f of W.fires) if (!f.out && (f.rest.own || G.discovered[f.rest.name])) out.push({ x: f.x, z: f.z, g: '▲', col: '#ff9a40', range: 700 });
    const o = G.objective(); if (o) out.push({ x: o.x, z: o.z, g: '◆', col: '#ffd860', range: 99999 });
    for (const e of G.enemies) if (e.alive && e.T.boss) out.push({ x: e.pos.x, z: e.pos.z, g: 'Ω', col: '#ff5040', range: 260 });
    if (G.waypoint && Math.hypot(G.player.pos.x - G.waypoint.x, G.player.pos.z - G.waypoint.z) < 8) { G.waypoint = null; UI.toast('<span style="color:#6ae8ff">✚</span> You reached your mark', 2); }
    if (G.waypoint) out.push({ x: G.waypoint.x, z: G.waypoint.z, g: '✚', col: '#6ae8ff', range: 99999 });
    // landmarks you'd notice from a distance (smoke over a camp, a waystone's glow...) pull you toward places you haven't found
    const P = G.player;
    if (!G.dungeon) for (const p of W.poisNear(P.pos.x, P.pos.z, 560)) {
      const S = LM_SIGN[p.type]; if (!S || G.cleared[p.id] || G.opened['poi:' + p.id] || G.solved[p.id]) continue;
      out.push({ x: p.x, z: p.z, g: S[0], col: G.poiSeen[p.id] ? S[1] : S[1] + '99', range: G.poiSeen[p.id] ? 220 : S[2] });
    }
    return out;
  };
  // [compass glyph, colour, how far away you'd notice it]
  const LM_SIGN = { camp: ['≈', '#c8b8a0', 520], ruin: ['∩', '#a8b0c8', 360], cave: ['◘', '#c8b08a', 260], elite: ['☠', '#ff7060', 320], puzzle: ['?', '#c8a0ff', 300],
    waystone: ['◊', '#8ad0ff', 480], shrine: ['✧', '#9fd8ff', 420], vista: ['△', '#d8d0b0', 380], wanderer: ['♦', '#ffcf6a', 280] };
  // world-side signs: smoke rising from unbroken camps, a slow glow over waystones and shrines
  G.landmarkFx = function (dt) {
    const P = G.player; if (G.dungeon) return;
    G._lmT = (G._lmT || 0) - dt; if (G._lmT > 0) return; G._lmT = 0.12;
    for (const p of GW.World.poisNear(P.pos.x, P.pos.z, 150)) {
      const y = GW.World.heightAt(p.x, p.z);
      if (p.type === 'camp' && !G.cleared[p.id] && Math.random() < 0.8)
        G.hitGlyphs.push({ x: p.x + (Math.random() - 0.5) * 1.2, y: y + 2.2, z: p.z + (Math.random() - 0.5) * 1.2, vx: 0.5 + Math.random() * 0.4, vy: 2.2 + Math.random(), vz: -0.2, ng: true, t: 0, life: 3.2, ch: '~≈°∘'[Math.floor(Math.random() * 4)], col: '#9a948c', size: 15 + Math.random() * 8 });
      if ((p.type === 'waystone' || p.type === 'shrine') && Math.random() < 0.5)
        G.hitGlyphs.push({ x: p.x + (Math.random() - 0.5) * 0.8, y: y + 1.5, z: p.z + (Math.random() - 0.5) * 0.8, vy: 1.6, ng: true, t: 0, life: 1.8, ch: '·✧'[Math.floor(Math.random() * 2)], col: '#8ad0ff', size: 12 });
    }
    if (G.hitGlyphs.length > 240) G.hitGlyphs.splice(0, G.hitGlyphs.length - 240);
  };
  // a vista names the three closest places you haven't found yet, and marks them on the map
  const LM_NAME = { camp: 'a camp', ruin: 'old ruins', cave: 'a cave mouth', elite: 'something strong', shrine: 'a shrine', waystone: 'a waystone', vista: 'another lookout', wanderer: "a trader's lantern", chest: 'a stash',
    runes: 'a rune vault', lanterns: 'a lantern shrine', plates: 'a pressure crypt', bells: 'a ring of bells' };
  const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  G.vistaReport = function (it) {
    const W = GW.World, list = W.poisNear(it.x, it.z, 1100).filter(p => p !== it.poi && p.type !== 'ambush' && !G.poiSeen[p.id])
      .sort((a, b) => Math.hypot(a.x - it.x, a.z - it.z) - Math.hypot(b.x - it.x, b.z - it.z)).slice(0, 3);
    if (!list.length) return;
    const lines = list.map(p => { G.poiSeen[p.id] = p.type; const d = Math.hypot(p.x - it.x, p.z - it.z), a = Math.atan2(p.x - it.x, -(p.z - it.z)), k = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
      const S = LM_SIGN[p.type] || ['·', '#c8ccd8'];
      return `<span style="color:${S[1]}">${S[0]}</span> ${LM_NAME[p.pz || p.type] || p.type}, ${Math.round(d / 10) * 10} m ${DIRS[k]}`; });
    setTimeout(() => UI.toast('From up here you can see:<br>' + lines.join('<br>') + '<br><span style="color:#8a90a0">marked on your map</span>', 6), 900);
    save();
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
    if (!o.dot && !o.chain && !o.react) {
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
    if (!o.dot && !o.chain && !o.react && P.critNext) { P.critNext = false; if (!crit) { crit = true; dmg *= 1.8; } }
    if (e.brokenT > 0 && !o.finisher) dmg *= 1.3;   // broken enemies take more from every hit
    if (P.state === 'skill' && !o.dot && !o.react) dmg *= 1 + 0.12 * GW.Skills.r(P, 'y_potent');
    const fz = P.fuseActive && G.t < P.fuseActive.until && (P.state === 'skill' || o.proj) && !o.dot && !o.react ? P.fuseActive.el : null;
    if (fz) dmg *= 1.5;
    dmg = Math.max(1, Math.round(dmg));
    if (!o.dot && !(e.brokenT > 0)) { e.brk = (e.brk || 0) + dmg * (o.brk || 0.6) * (o.riposte ? 2 : 1) * (1 + 0.2 * GW.Skills.r(P, 'b_sunder')); if (e.brk >= G.brkMax(e)) G.breakEnemy(e); }
    if (o.chain) e.status.shock = 3;
    if (fz === 'fire') { e.status.burn = Math.max(e.status.burn, 3); e.status.burnD = Math.max(e.status.burnD || 0, dmg * 0.15); }
    if (fz === 'frost') e.status.slow = Math.max(e.status.slow, 4);
    if (fz === 'storm') e.status.shock = Math.max(e.status.shock || 0, 3);
    if (fz) G.addHitGlyphs(e.pos.x, e.pos.y + 1.1, e.pos.z, 6, G.FUSE[fz].col);
    if ((o.heavy || o.finisher) && !o.dot && !o.react && e.status.slow > 0 && !((e.reactCd || 0) > 0)) G.react(e, 'shatter', dmg);
    e.hp -= dmg; e.flash = 1; e.aggro = true; e.lastHit = G.t;
    const col = o.react ? o.reactCol : o.dot === 'burn' ? '#ff9a40' : o.dot === 'poison' ? '#8aff6a' : o.chain ? '#c8a0ff' : crit ? '#ffd040' : '#ffffff';
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
        P.fo = Math.min(100, P.fo + (GW.Skills.r(P, 'y_thirst') ? 5 : 3));
        const att = 1 + 0.25 * GW.Skills.r(P, 'y_attune');
        // rune effects
        if (ws.burn) { e.status.burn = 3 * att; e.status.burnD = Math.max(1, dmg * ws.burn / 6); }
        if (ws.slow) e.status.slow = 2 * att;
        if (ws.poison) { e.status.poison = 4 * att; e.status.poisonD = Math.min(dmg, e.status.poisonD * 0.6 + dmg * ws.poison); }
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
  // ---------------- elemental reactions ----------------
  //   SHATTER  heavy blow / finisher on a chilled foe: burst damage, a big bite of break, the chill is spent
  //   BLIGHT   fire meets poison (either order): a burst, and the poison spreads to everything within 5 m
  //   CONDUCT  shock on a chilled or wet foe (in the river): lightning leaps to every chilled / wet foe within 7 m
  const REACT = { shatter: { name: 'SHATTER', col: '#9fe0ff', hex: 0x9fe0ff, ch: '*/\\◇<>' }, blight: { name: 'BLIGHT', col: '#c8ff50', hex: 0xa8ff40, ch: '~%&@:;' },
    conduct: { name: 'CONDUCT', col: '#c8a0ff', hex: 0xc8a0ff, ch: 'ϟ/\\|!' } };
  G.REACT = REACT;
  const reactGlyphs = (x, y, z, n, R) => { for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 5;
    G.hitGlyphs.push({ x, y, z, vx: Math.cos(a) * s, vy: 2 + Math.random() * 5, vz: Math.sin(a) * s, t: 0, life: 0.45 + Math.random() * 0.35, ch: R.ch[Math.floor(Math.random() * R.ch.length)], col: R.col }); } };
  G.react = function (e, kind, dmg) {
    const P = G.player, R = REACT[kind], s = e.status; if (!e.alive || !R) return;
    const RK = 1 + 0.4 * GW.Skills.r(P, 'b_shatter');
    e.reactCd = 1.0;
    UI.float(R.name, e.pos, { color: R.col, size: 16, y: e.T.radius * 2 + 1.9, life: 1.1 });
    reactGlyphs(e.pos.x, e.pos.y + 1.1, e.pos.z, 18, R);
    G.parts.spark.burst(e.pos.x, e.pos.y + 1, e.pos.z, 24, 6, R.hex, 0.6, 1.1, -3, 1.5);
    G.counters.reactions = (G.counters.reactions || 0) + 1;
    if (!G.hintsShown['react_' + kind]) { G.hintsShown['react_' + kind] = true;
      UI.hint({ shatter: '<b>SHATTER</b>: heavy blows break chilled foes.', blight: '<b>BLIGHT</b>: fire and poison together spread the sickness.', conduct: '<b>CONDUCT</b>: shock leaps between chilled or wet foes.' }[kind], 4); }
    if (kind === 'shatter') {
      GWAudio.sfx('zap'); GWAudio.sfx('crit'); G.shake(0.35); G.hitstop = Math.max(G.hitstop, 0.07);
      s.slow = 0;
      e.brk = (e.brk || 0) + G.brkMax(e) * 0.4; if (!(e.brokenT > 0) && e.brk >= G.brkMax(e)) G.breakEnemy(e);
      G.hitEnemy(e, Math.max(10, (dmg || P.ws.dmg) * 0.8) * RK, { react: true, reactCol: R.col });
    } else if (kind === 'blight') {
      GWAudio.sfx('fire'); GWAudio.sfx('cast');
      const pd = Math.max(s.poisonD || 0, P.ws.dmg * 0.25);
      G.hitEnemy(e, Math.max(8, pd * 4 + (s.burnD || 0) * 2) * RK, { react: true, reactCol: R.col });
      for (const o of G.enemies) if (o !== e && o.alive && o.distTo(e.pos) < 5) {
        o.status.poison = Math.max(o.status.poison, 4); o.status.poisonD = Math.max(o.status.poisonD || 0, pd); o.aggro = true; o.reactCd = 0.6;
        for (let k = 0; k <= 8; k++) { const t = k / 8; G.parts.spark.emit(GW.lerp(e.pos.x, o.pos.x, t), GW.lerp(e.pos.y, o.pos.y, t) + 1 + Math.sin(t * Math.PI), GW.lerp(e.pos.z, o.pos.z, t), 0, 0.5, 0, 0.6, 1.1, R.hex, 0); }
      }
    } else if (kind === 'conduct') {
      GWAudio.sfx('zap'); G.shake(0.25);
      const W = GW.World, wetOrCold = o => o.status.slow > 0 || W.inWater(o.pos.x, o.pos.z);
      const base = Math.max(10, P.ws.dmg * 1.1) * RK;
      G.hitEnemy(e, base, { react: true, reactCol: R.col });
      const near = G.enemies.filter(o => o !== e && o.alive && o.distTo(e.pos) < 7 && wetOrCold(o)).slice(0, 5);
      for (const o of near) {
        G.bolt(e.pos, o.pos, R.col);
        o.reactCd = 1.0; G.hitEnemy(o, base * 0.8, { react: true, reactCol: R.col }); reactGlyphs(o.pos.x, o.pos.y + 1.1, o.pos.z, 8, R);
      }
    }
  };
  function chain(src, dmg) {
    const near = G.enemies.filter(o => o !== src && o.alive && o.distTo(src.pos) < 7).sort((a, b) => a.distTo(src.pos) - b.distTo(src.pos)).slice(0, 2);
    GWAudio.sfx('zap');
    for (const o of near) {
      G.bolt(src.pos, o.pos, '#c8a0ff');
      G.hitEnemy(o, dmg, { chain: true });
    }
  }
  function kill(e) {
    const P = G.player;
    e.alive = false; e.deadT = 0; e.dieSide = Math.random() < 0.5 ? -1 : 1; e.diedAt = G.t;
    GWAudio.sfx('die');
    G.parts.spark.burst(e.pos.x, e.pos.y + 1, e.pos.z, 18, 5, e.T.kind === 'undead' ? 0x80c0ff : 0xffb060, 0.8, 1, -4, 2);
    if (e.T.onDeath) e.T.onDeath(e);
    if (e.crown) crownFallen(e);
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
      setTimeout(() => UI.toast('<span style="color:#ffd860">+1 skill point</span> · <b>B</b> → Skills', 4), 1200);
      for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2; G.parts.spark.emit(P.pos.x + Math.cos(a), P.pos.y + 0.3, P.pos.z + Math.sin(a), Math.cos(a) * 2, 4, Math.sin(a) * 2, 1, 1, 0xffd060, -2); }
    }
  }
  G.castleLoot = function () {
    if (G.castleLooted) return;
    const Lw = GW.World.L, BS = GW.World.BS, y = GW.World.levelAt(Lw.castle.x - 3 * BS, Lw.castle.z - 7 * BS, 1).y;
    [['armor', 'scale'], ['ingot', 'gold'], ['rune', 'thirst']].forEach(([k, key], i) => {
      spawnPickup(k, key, new V3(Lw.castle.x - 3 * BS + i * 0.9, y, Lw.castle.z - 7.5 * BS), y, 'castle');
    });
  };
  function spawnPickup(kind, key, at, fixedY, tag) {
    const col = kind === 'arms' ? new THREE.Color(GW.Arms.CLS[key].col).getHex() : kind === 'abil' ? new THREE.Color(GW.Abil.LIST[key].col).getHex() : kind === 'kindling' ? 0xd08040 : kind === 'rune' ? GW.Forge.RUNES[key].color : kind === 'armor' ? (GW.Knight.GEAR[GW.Knight.SLOTS.find(sl => GW.Knight.GEAR[sl][key])][key].color) : GW.Forge.METALS[key].color;
    const m = new THREE.Mesh(kind === 'arms' ? new THREE.BoxGeometry(0.12, 0.08, 0.9) : kind === 'abil' ? new THREE.TorusGeometry(0.26, 0.07, 6, 12) : kind === 'rune' ? new THREE.OctahedronGeometry(0.28, 0) : new THREE.BoxGeometry(0.5, 0.2, 0.3), GW.mat({ id: ID.RUNE, color: 0, emissive: col, unlit: true }));
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
      const aft = GW.Skills.r(P, 'g_after');
      if (P.state === 'roll' && P.t < (aft ? 0.32 : 0.22) && !o.dot && (!G.pdCd || G.t > G.pdCd)) {
        G.pdCd = G.t + 1.4; G.slowmo(0.3, aft ? 1.3 : 0.9); P.critNext = true; P.st = Math.min(100, P.st + 30);
        G.fuseReady('dodge');
        UI.float('PERFECT', P.pos, { color: '#ffd860', size: 15, y: 2.6, life: 1 }); GWAudio.sfx('socket'); G.addHitGlyphs(P.pos.x, P.pos.y + 1, P.pos.z, 14, '#9fd8ff');
      } else if (!G.dodgeT || G.t - G.dodgeT > 0.6) { G.dodgeT = G.t; UI.float('dodge', P.pos, { color: '#9ad', size: 10, y: 2.4 }); }
      return;
    }
    if (P.state === 'block' && !o.dot && !o.heavy) {
      const ang = from ? Math.atan2(from.x - P.pos.x, from.z - P.pos.z) : P.yaw;
      if (Math.abs(GW.angDiff(P.yaw, ang)) < 1.9) {
        const BK = GW.Arms.cur(P).block;
        if (G.t - P.blockStart < BK.parry + 0.04 * GW.Skills.r(P, 'g_parry')) {   // PARRY: the blow is turned aside, the attacker reels, time slows, riposte ready
          G.slowmo(0.25, 0.45); P.riposteT = 1.5; P.st = Math.min(100, P.st + 15);
          GWAudio.sfx('block'); GWAudio.sfx('crit'); G.shake(0.3); G.hitstop = 0.08;
          G.fuseReady('parry');
          UI.float('PARRY', P.pos, { color: '#ffd860', size: 16, y: 2.6, life: 1 }); G.addHitGlyphs(P.pos.x + Math.sin(P.yaw) * 0.8, P.pos.y + 1.3, P.pos.z + Math.cos(P.yaw) * 0.8, 16, '#ffe8a0');
          const s = o.src; if (s && s.alive) { s.brk = (s.brk || 0) + G.brkMax(s) * 0.5; s.lastHit = G.t; if (s.brk >= G.brkMax(s)) G.breakEnemy(s); else if (!s.T.boss && s.setState) s.setState('stagger'); }
          return 'parry';
        }
        // blocked: most damage soaked, paid in stamina
        const soak = dmg * BK.soak; P.st -= (soak * 1.6 + 6) * BK.st * (1 - 0.2 * GW.Skills.r(P, 'g_wall')); P.stDelay = 0.8; GWAudio.sfx('block');
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
    if (P.hp <= 0 && GW.Skills.r(P, 'g_wind') && !(P.swT > G.t)) {   // Second Wind
      P.hp = P.maxHp * 0.3; P.swT = G.t + 120; P.iframe = 1; G.slowmo(0.3, 0.8);
      UI.float('SECOND WIND', P.pos, { color: '#8ac8ff', size: 16, y: 2.8, life: 1.4 }); GWAudio.sfx('level');
    }
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
    setTimeout(() => { UI.banner('the vale is free · smelt the starfall it left you', 'THE WARDEN FALLS', 6); }, 1200);
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
    for (const it of GW.World.interact) { if ((it.floor || 0) !== (P.floor || 0) || (it.type === 'chest' && G.opened[it.id]) || (it.type === 'vein' && GW.World.isMined(it.id)) || (it.type === 'pz' && G.solved[it.poi.id] && (it.role !== 'vault' || G.opened['puz:' + it.poi.id]))) continue; if (it.type === 'vein' && it.crystals && !it.crystals.visible) it.crystals.visible = true; const d = Math.hypot(P.pos.x - it.x, P.pos.z - it.z); if (d < it.r && d < bd) { bd = d; best = it; } }
    return best;
  }
  function doInteract(it) {
    const P = G.player;
    if (it.type === 'rest') rest(it);
    else if (it.type === 'forge') openForge();
    else if (it.type === 'npc') talk(it.npc);
    else if (it.type === 'hatch') { const T = GW.World.tower; fade(() => { G.player.place(T.door.x, T.door.z + 0.8); G.player.yaw = 0; G.snapCam = true; }); }
    else if (it.type === 'chest') openChest(it);
    else if (it.type === 'vein') { if (P.state === 'move') { P.state = 'mine'; P.t = 0; P.fired = false; P.mineIt = it; P.yaw = Math.atan2(it.x - P.pos.x, it.z - P.pos.z); } }
    else if (it.type === 'shrine') { const kinds = [['might', 'Shrine of Might: +25% damage'], ['ward', 'Shrine of Warding: -25% damage taken'], ['swift', 'Shrine of the Wind: +15% speed']], k = kinds[it.poi.seed % 3];
      G.buff = { kind: k[0], until: G.t + 300 }; GWAudio.sfx('socket'); UI.banner('for five minutes', k[1].toUpperCase(), 2.6); G.parts.spark.burst(it.x, G.player.pos.y + 1, it.z, 30, 4, 0x9fd8ff, 0.8, 1.2, -2, 2); }
    else if (it.type === 'waystone') { const p = it.poi, nm = GW.World.REGIONS[p.region].name.replace('THE ', '').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()) + ' waystone ' + p.id;
      if (!G.waystones[p.id]) { G.waystones[p.id] = { x: p.x, z: p.z + 2.6, name: nm }; UI.toast('<span style="color:#9fd8ff">◊</span> Waystone attuned', 2.5); save(); }
      const list = travelList(p.x, p.z, null); if (list.length) { G.state = 'travel'; UI.showTravel(list, f => { G.state = 'play'; if (f) travelTo(f); }); } }
    else if (it.type === 'vista') { G.vistaReport(it); revealFog(it.x, it.z, 650); UI.banner('the land opens before you', 'VISTA', 2.4); GWAudio.sfx('quest');
      if (it.poi.cache && !G.solved[it.poi.id]) { const D = GW.World.puzzleLayout(it.poi).dig; G.pzKnown = G.pzKnown || {}; G.pzKnown[it.poi.id] = 1; G.waypoint = { x: D.x, z: D.z };
        setTimeout(() => UI.toast('<span style="color:#ffc870">✕</span> Something glints below: three stones over loose earth. Marked on your map.', 3.5), 1600); save(); } }
    else if (it.type === 'pz') G.pzUse(it);
    else if (it.type === 'shop') openShop(it.poi.region, 'A wandering trader');
    else if (it.type === 'tomb') enterLevel({ kind: 'tomb', id: it.id, seed: 7100 + it.id.length * 31 + (it.quest ? 5 : 0) + it.name.length, region: 'tomb', lvl: 2, floors: it.floors, quest: it.quest,
      names: it.floors > 1 ? [it.name, 'THE SCRIBE\'S REST'] : [it.name], back: { x: it.x, z: it.z } });
    else if (it.type === 'relic') takeRelic(it);
    else if (it.type === 'cave') enterLevel({ kind: 'cave', id: 'cave:' + it.poi.id, seed: it.poi.seed, region: it.poi.region, lvl: it.poi.lvl + 2, floors: 1, names: ['THE CAVE'], back: { x: it.x, z: it.z + 2 } });
    else if (it.type === 'castle') { const L = GW.World.L; enterLevel({ kind: 'castle', id: 'dunmaer', seed: 9137, region: 'high', lvl: 1 + Math.floor(Math.hypot(L.dunmaer.x, L.dunmaer.z) / GW.World.LVLD) + 3, floors: 3,
      names: ['THE GATEHALL', 'THE GREAT HALL', 'THE CROWN TOWER'], back: { x: it.x, z: it.z + 2.5 } }); }
    else if (it.type === 'dexit') fade(() => leaveLevel(false));
    else if (it.type === 'dstairs') fade(() => buildFloor(G.dungeon.floor + 1));
  }
  // ---------------- dungeons: caves and Castle Dunmaer are separate levels ----------------
  G.dungeon = null;
  function takeRelic(it) {
    G.items = G.items || {}; G.items.seal = true; it.r = 0; if (it.mesh) it.mesh.visible = false;
    GWAudio.sfx('quest'); G.flashWhite = 0.4; give('shards', 60, true);
    UI.banner('a seal of black ink, still warm', "THE SCRIBE'S SEAL", 3.2);
    if (QUESTS[G.stage].id === 'tomb') setTimeout(advance, 1200); save();
  }
  const DPOOL = { tomb: ['hollow', 'hollow', 'wisp'], vale: ['wolf', 'hollow', 'wisp'], frost: ['frostwolf', 'rimeshade'], high: ['highguard', 'cragwolf'], ash: ['ashhound', 'cinderling', 'hollow'], salt: ['dunehollow', 'saltwraith'], mire: ['mirehollow', 'bogwisp'], dusk: ['duskwolf', 'wisp'] };
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
    if (top && d.quest && !(G.items && G.items.seal)) {   // the quest's relic waits on the last floor
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), GW.mat({ id: ID.RUNE, color: 0, emissive: 0x9a7aff, unlit: true })); m.position.set(ex - 2, 1.3, ez); G.scene.add(m); lv.meshes.push(m);
      W.flames.push({ m, s: 2, base: 1 }); add({ type: 'relic', x: ex - 2, z: ez, r: 2.0, label: "Take the Scribe's Seal", mesh: m });
    }
    if (top && d.kind === 'castle' && !(G.items && G.items.crown)) {   // the crown's keeper waits in the last hall
      const [cx, cz] = lv.end, e = G.spawnEnemy('highguard', cx - 3, cz, { x: cx - 3, z: cz }, false, d.lvl + f + 1, true);
      e.maxHp = e.hp = Math.round(e.maxHp * 2.5); e.crown = true; e.title = 'THE CROWNED GUARDIAN'; e.model.scale.setScalar(1.7); e.dungeon = true; d.enemies.push(e);
      UI.hint('Something heavy stirs in the last hall.', 3);
    }
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
        if (Math.hypot((i + 0.5) * FC - S / 2 - x, (j + 0.5) * FC - S / 2 - z) < R) { if (!G.fog[j * FN + i]) G.fogVer = (G.fogVer || 0) + 1; G.fog[j * FN + i] = 1; }
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
      { label: '● Coal ×3 (smelting fuel)', cost: 10, buy: () => give('ore', 'coal', 3) },
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
    const arms = GW.Arms.ensure(P);
    for (const k in GW.Arms.CLS) { const c = GW.Arms.CLS[k]; if (c.region === region) items.push({ label: `<span style="color:${c.col}">${c.g}</span> Weapon: ${c.name}`, cost: 240, ok: () => !arms.owned[k], buy: () => give('arms', k) }); }
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
      const n = p.type === 'elite' ? 1 : p.type === 'ambush' ? 3 : 4 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2 + R(), r = p.type === 'ambush' ? 9 : 4.5;
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
      fade(() => { P.place(T.x - 0.4 * GW.World.BS, T.z + 1.6 * GW.World.BS); P.floor = 2; P.pos.y = T.topY; P.yaw = Math.PI; G.snapCam = true; UI.banner('', 'THE IVY WATCH · ROOF', 2.2); });
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
      if (p.type === 'elite' && R() < 0.3) { const ow = GW.Arms.ensure(P).owned, left = Object.keys(GW.Arms.CLS).filter(k => !ow[k]); if (left.length) loot.push(['arms', left[Math.floor(R() * left.length)]]); }
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
    const d = { v: 1, tod: G.tod, gear: P.gear, level: P.level, xp: P.xp, flasks: P.flasks, weapon: P.weapon, inv: P.inv, stage: G.stage, counters: G.counters, respawn: G.respawn, bossDead: !!G.bossDead, castleLooted: !!G.castleLooted, items: G.items || {}, opened: G.opened, mined: G.mined, solved: G.solved, pzKnown: G.pzKnown || {}, widowDead: !!G.widowDead, bossesDead: G.bossesDead, cleared: G.cleared, poiSeen: G.poiSeen, waystones: G.waystones, bounty: G.bounty, waypoint: G.waypoint || null, extraFlasks: G.player.extraFlasks || 0, discovered: G.discovered, fog: fogPack(),
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
      if (!isFinite(bx + by + fs)) continue;   // a flame with no valid position yet: skip it rather than break the frame
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
    if (!isFinite(camLook.x + camLook.y + camLook.z) && isFinite(camT.x + camT.y + camT.z)) G.snapCam = true;   // never let one bad frame strand the camera
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
          swap: pressed.swap, a1: pressed.a1, a2: pressed.a2, a3: pressed.a3, a4: pressed.a4, potion: pressed.potion, sprint: !!(I.keys.ShiftLeft || I.keys.ShiftRight) };
        if (P.horse && P.horse.ridden) { input.attackHeld = input.block = false; input.swap = input.attack = input.roll = input.a1 = input.a2 = input.a3 = input.a4 = input.potion = false; }
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
        if (!isFinite(P.pos.x + P.pos.y + P.pos.z)) {   // safety net: a bad position puts the hero back where they last stood
          console.warn('hero position went invalid', JSON.stringify(G._lastGood), P.state);
          const g = G._lastGood || G.respawn || GW.World.L.start; P.pos.set(g.x, GW.World.heightAt(g.x, g.z), g.z); if (P.vel) P.vel.set(0, 0, 0); if (P.mvel) { P.mvel.x = 0; P.mvel.z = 0; } P.state = 'move'; G.snapCam = true;
        } else G._lastGood = { x: P.pos.x, z: P.pos.z };
        for (const e of G.enemies) e.update(sdt, G);
        for (const n of G.npcs) n.update(sdt, G);
        updateProjectiles(sdt); updateBoulders(sdt); updatePickups(sdt);
        G.telegraphs = G.telegraphs.filter(t => { t.update(sdt); return !t.done; });
        // tutorial hints + boss trigger + zones
        world(sdt);
        // respawn timers
        updateSpawns(sdt); G.updateOwnFires(sdt); towerDoor(); G.updateHorse(sdt); tickPlayerDots(sdt); G.questTick(); G.pzUpdate(); G.landmarkFx(sdt);
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
      const TELE = { windup: '◇', windup2: '◇', feint: '?', web: '◇', cast: '◇', throw: '◇', bash: '!', sweep: '!', stab: '!', charge: '!', slam: '!', 'pounce-wind': '!', 'charge-wind': '!', rain: '!' };
      for (const e of G.enemies) {
        if (!e.alive || e.type === 'husk' || e.distTo(P.pos) > 22 || !(e.aggro || e.brk > 0)) continue;
        const idx = G.enemies.indexOf(e), top = e.pos.clone(); top.y += e.T.radius * 2 + (e.T.flying ? 2.6 : 1.95) + (e.T.boss ? 2.5 : 0);
        if (e.brokenT > 0) UI.label('b' + idx, 'BROKEN', top, 'name', '#ffb040');
        else if (e.brk > 0) { const n = 8, f = Math.round(GW.clamp(e.brk / G.brkMax(e), 0, 1) * n); UI.label('b' + idx, '[' + '#'.repeat(f) + '-'.repeat(n - f) + ']', top, 'ehp', '#ffc860'); }
        const tg = TELE[e.state];
        if (tg) { const tp = top.clone(); tp.y += 0.6; UI.label('w' + idx, tg, tp, 'name', tg === '!' ? '#ff4030' : '#ffd040'); }
      }
      for (const e of G.enemies) if (e.alive && !e.T.boss && e.type !== 'husk' && (e.aggro || e.distTo(P.pos) < 14)) { const lp = e.pos.clone(); lp.y += e.T.radius * 2 + (e.T.flying ? 2.2 : 1.55); UI.label('n' + G.enemies.indexOf(e), e.title || (e.elite ? 'Elite ' : '') + e.T.name + ((e.lvl || 1) > 1 ? ' · lv ' + e.lvl : ''), lp, 'name', e.elite ? '#ffb040' : e.aggro ? '#ff9a8a' : '#c8ccd8'); }
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
    drawSlashGlyphs(dt); drawHitGlyphs(dt);
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
          if (!p.aoe) G.hitEnemy(e, p.dmg, { proj: true, from: p.pos, brk: p.brk }); boom = true; break; }
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

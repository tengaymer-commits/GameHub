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
  function refreshQuest() { const q = QUESTS[G.stage]; UI.quest(q.title, q.text(G.counters)); }
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
    if (id === 'wolves') setTimeout(() => UI.hint('<b>2 · 3 · 4</b> spend focus: Whirl, Lunge, Glyphburst.<br>Focus refills over time and with every hit.', 7), 2500);
  }
  function give(kind, key, n) {
    const P = G.player; n = n || 1;
    if (kind === 'rune') { P.inv.runes[key] = (P.inv.runes[key] || 0) + n; const R = GW.Forge.RUNES[key]; UI.toast(`<span style="color:#${R.color.toString(16).padStart(6, '0')}">${R.g}</span> ${R.name} rune${n > 1 ? ' ×' + n : ''}`, 3); }
    else if (kind === 'armor') {
      const slot = GW.Knight.SLOTS.find(sl => GW.Knight.GEAR[sl][key]), it = GW.Knight.GEAR[slot][key];
      const isNew = !P.inv.armor[key]; P.inv.armor[key] = 1;
      UI.toast(`<span style="color:#${it.color.toString(16).padStart(6, '0')}">${GW.Knight.pattern(it.set)}</span> ${it.name}${isNew ? ' · <span style="color:#ffcf6a">open Gear to wear it</span>' : ''}`, 4);
    }
    else { P.inv.ingots[key] = (P.inv.ingots[key] || 0) + n; const M = GW.Forge.METALS[key]; UI.toast(`<span style="color:#${M.color.toString(16).padStart(6, '0')}">${M.glyph}</span> ${M.name} ingot${n > 1 ? ' ×' + n : ''}`, 3); }
    GWAudio.sfx('pickup');
  }
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
    GW.Assets.load(['monarch', 'wolf'], f => { $('t-foot').textContent = 'loading models… ' + Math.round(f * 100) + '%'; })
      .then(build).catch(err => { $('t-foot').textContent = 'Could not load the 3D models: ' + err.message; console.error(err); });
  }
  function build() {
    $('t-menu').style.visibility = '';
    $('t-foot').textContent = 'WASD move · mouse aim · LMB attack · Space roll · 2 3 4 skills · Q flask · E interact · C gear · wheel zoom';
    const R = G.R = new GW.Renderer($('gl'));
    const scene = G.scene = new THREE.Scene();
    G.camera = new THREE.PerspectiveCamera(42, R.aspect, 0.5, 400);
    applySettings();
    const q = UI.settings.quality;
    GW.World.build(scene, { grassCount: [18000, 36000, 56000][q] });
    G.parts = { spark: new GW.Particles(scene, 500, ID.FIRE), dust: new GW.Particles(scene, 300, ID.STONE), blood: new GW.Particles(scene, 200, ID.BODY) };
    G.player = new GW.Player(scene);
    const Lw = GW.World.L;
    G.npcs.push(new GW.NPC(scene, 'elder', Lw.elder.x, Lw.elder.z), new GW.NPC(scene, 'smith', Lw.smith.x, Lw.smith.z));
    spawnAll();
    G.player.place(Lw.start.x, Lw.start.z + 5);
    UI.initInput(G); UI.buildHotbar(); UI.initMinimap();
    GW.Forge.UI.init(); GW.Knight.UI.init(G);
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
    R.glyphPx = S.glyph; R.quality = S.quality; R.resize(); R.setPureGrass(S.pure);
    GWAudio.setVolume(S.vol, S.mus);
  }
  function openSettings(from) { G.settingsFrom = from; $('settings').classList.remove('hidden'); $('pause').classList.add('hidden'); $('title').classList.add('hidden'); }

  function spawnAll() {
    const Lw = GW.World.L;
    [[-3, 62], [3, 61], [0, 56]].forEach(([x, z]) => G.spawnEnemy('husk', x, z));
    const packs = [[4, -48], [22, -60], [-2, -70], [28, -44], [14, -78]];
    packs.forEach(([px, pz]) => { for (let k = 0; k < 3; k++) { const a = k * 2.1; G.spawnEnemy('wolf', px + Math.cos(a) * 2.5, pz + Math.sin(a) * 2.5, { x: px, z: pz }); } });
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, r = 4 + (k % 3) * 2.5; G.spawnEnemy('hollow', Lw.ruins.x + Math.cos(a) * r, Lw.ruins.z + Math.sin(a) * r); }
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2, r = 6 + (k % 2) * 6; G.spawnEnemy('wisp', Lw.grove.x + Math.cos(a) * r, Lw.grove.z + Math.sin(a) * r); }
    G.boss = G.spawnEnemy('warden', Lw.arena.x, Lw.arena.z - 4);
  }
  G.spawnEnemy = function (type, x, z, home, temp) {
    const e = new GW.Enemy(G.scene, type, x, z, home);
    e.temp = !!temp; if (temp) { e.aggro = true; }
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
          Object.assign(P, { level: d.level, xp: d.xp, flasks: d.flasks });
          P.weapon = d.weapon; P.inv = d.inv;
          P.inv.armor = P.inv.armor || { greathelm: 1, knightplate: 1, crimson: 1 };
          P.gear = Object.assign({}, GW.Knight.DEFAULT, d.gear || {}); GW.Knight.dress(P);
          G.stage = d.stage; G.counters = d.counters || {}; G.respawn = d.respawn; G.bossDead = d.bossDead;
          if (G.bossDead) killSilently(G.boss);
        }
      } else { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }
      P.recalc(); P.hp = P.maxHp;
      const sp = G.respawn || { x: Lw.start.x, z: Lw.start.z + 5 };
      P.place(sp.x, sp.z + (G.respawn ? 2.2 : 0)); P.yaw = Math.PI; P.visYaw = Math.PI;
      G.state = 'play'; $('hud').classList.remove('hidden'); UI.showTouch(true);
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
    fade(() => {
      P.hp = P.maxHp; P.flasks = P.maxFlasks; P.fo = 100; P.st = 100;
      G.respawn = { x: it.x, z: it.z };
      resetEnemies();
      P.place(it.x, it.z + 2.2);
      UI.banner('rested at', it.name.toUpperCase(), 2.4);
      save();
    });
  }
  function resetEnemies() {
    G.enemies = G.enemies.filter(e => { if (e.temp) { e.alive = false; G.scene.remove(e.model); G.scene.remove(e.shadow); if (e.T.onDeath && e.light) e.T.onDeath(e); return false; } return true; });
    for (const e of G.enemies) {
      if (e.T.boss) { if (e.alive) { e.hp = e.maxHp; e.phase = 1; e.pos.set(e.spawn.x, e.pos.y, e.spawn.z); e.setState('idle'); e.aggro = false; } continue; }
      revive(e);
    }
    G.bossActive = false; G.arenaLock = false; UI.boss(false);
  }
  function revive(e) {
    const wasDead = !e.alive;
    e.alive = true; e.hp = e.maxHp; e.model.visible = true; e.shadow.visible = true; e.model.rotation.z = 0;
    e.pos.set(e.spawn.x, GW.World.heightAt(e.spawn.x, e.spawn.z), e.spawn.z); e.setState('idle'); e.aggro = false;
    e.status = { burn: 0, burnD: 0, poison: 0, poisonD: 0, slow: 0 }; e.kb.set(0, 0, 0); e.cool = 1;
    if (wasDead && e.T.onRespawn) e.T.onRespawn(e);
    if (e.rig) { e._deathPlayed = false; e._ast = null; e.model.position.y = e.pos.y; e.rig.play(e.type === 'wolf' ? 'Idle' : 'Idle_Sword', { restart: true, fade: 0 }); }
  }
  function respawnPlayer() {
    $('death').classList.add('hidden');
    fade(() => {
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
    if (e.type === 'wolf' && Math.random() < 0.5) GWAudio.sfx('howl');
    if (e.type === 'wolf' && !G.hintsShown.roll) { G.hintsShown.roll = true; UI.hint(I.touch ? 'Wolves lunge. Tap <b>⟲</b> to roll through them: you can\'t be hit mid-roll.' : 'Wolves lunge. Press <b>Space</b> to roll through them: you can\'t be hit mid-roll.', 6); }
    if (e.type === 'hollow' && !G.hintsShown.block) { G.hintsShown.block = true; UI.hint('Hollows raise their shields. Your <b>third combo hit</b> and skills break the guard.', 6); }
  };
  G.hitEnemy = function (e, dmg, o) {
    o = o || {};
    if (!e.alive) return;
    const P = G.player, ws = P.ws;
    if (e.T.boss && !G.bossActive) return;
    if (e.type === 'husk' && QUESTS[G.stage].id !== 'wake' && e.hp <= dmg) { /* husks keep standing after the tutorial */ }
    let crit = false;
    if (!o.dot && !o.chain) {
      if (Math.random() < ws.crit) { crit = true; dmg *= 1.8; }
      if (e.T.kind === 'undead') dmg *= 1 + ws.undead;
      // hollow guard
      if (o.melee && e.type === 'hollow' && !o.heavy && (e.state === 'chase' || e.state === 'recover' || e.state === 'block') && Math.random() < 0.38) {
        const a = Math.atan2(P.pos.x - e.pos.x, P.pos.z - e.pos.z);
        if (Math.abs(GW.angDiff(e.yaw, a)) < 1.0) {
          e.setState('block'); e.aggro = true; GWAudio.sfx('block');
          UI.float('BLOCK', e.pos, { color: '#9ab', size: 11 });
          G.parts.spark.burst(e.pos.x + Math.sin(e.yaw) * 0.6, e.pos.y + 1.4, e.pos.z + Math.cos(e.yaw) * 0.6, 8, 4, 0xffe0a0, 0.3, 0.7, -5);
          G.hitstop = 0.04; P.st -= 6; return;
        }
      }
    }
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg; e.flash = 1; e.aggro = true; e.lastHit = G.t;
    const col = o.dot === 'burn' ? '#ff9a40' : o.dot === 'poison' ? '#8aff6a' : o.chain ? '#c8a0ff' : crit ? '#ffd040' : '#ffffff';
    UI.float(String(dmg) + (crit ? '!' : ''), e.pos, { color: col, size: crit ? 18 : o.dot ? 11 : 14, y: e.T.radius * 2 + 0.8, life: crit ? 1.1 : 0.85 });
    if (!o.dot) {
      GWAudio.sfx(crit ? 'crit' : 'hit', o.heavy ? 1.3 : 1);
      const hx = e.pos.x, hy = e.pos.y + Math.min(1.2, e.T.radius * 1.6), hz = e.pos.z;
      G.parts.spark.burst(hx, hy, hz, crit ? 16 : 9, crit ? 7 : 5, P.ws.trail, 0.35, 0.8, -8);
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
    gainXP(e.T.xp * (1 + P.ws.xp));
    count(e.type);
    // drops
    const luck = 1 + P.ws.xp;
    const drops = { wolf: [['rune', ['ember', 'frost', 'venom', 'swift'], 0.12], ['ingot', ['bronze'], 0.12]],
      hollow: [['rune', ['keen', 'ward', 'storm', 'vigor'], 0.16], ['ingot', ['steel', 'silver'], 0.2]],
      wisp: [['rune', ['storm', 'frost', 'thirst'], 0.16], ['ingot', ['duskglass', 'gold'], 0.14]] }[e.type] || [];
    const armorDrops = { wolf: [['armor', ['leather', 'coif'], 0.05]], hollow: [['armor', ['hauberk', 'coif', 'sallet'], 0.08]], wisp: [['armor', ['scale', 'night'], 0.07]] }[e.type] || [];
    drops.push(...armorDrops.filter(([, pool]) => pool.some(k => !P.inv.armor[k])).map(([k, pool, ch]) => [k, pool.filter(x => !P.inv.armor[x]), ch]));
    for (const [kind, pool, ch] of drops) if (Math.random() < ch * luck) spawnPickup(kind, pool[Math.floor(Math.random() * pool.length)], e.pos);
    if (e.T.boss) bossDefeated(e);
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
  function spawnPickup(kind, key, at) {
    const col = kind === 'rune' ? GW.Forge.RUNES[key].color : kind === 'armor' ? (GW.Knight.GEAR[GW.Knight.SLOTS.find(sl => GW.Knight.GEAR[sl][key])][key].color) : GW.Forge.METALS[key].color;
    const m = new THREE.Mesh(kind === 'rune' ? new THREE.OctahedronGeometry(0.28, 0) : new THREE.BoxGeometry(0.5, 0.2, 0.3), GW.mat({ id: ID.RUNE, color: 0, emissive: col, unlit: true }));
    const p = at.clone(); p.x += (Math.random() - 0.5) * 1.2; p.z += (Math.random() - 0.5) * 1.2;
    m.position.copy(p); G.scene.add(m);
    const light = GW.World.lights.add(p.x, p.y + 1, p.z, new THREE.Color(col).multiplyScalar(0.6), 4, 0.3);
    G.pickups.push({ kind, key, m, p, t: 0, light });
  }
  G.hurtPlayer = function (dmg, from, o) {
    o = o || {};
    const P = G.player;
    if (P.state === 'dead') return;
    if (P.iframe > 0) {
      if (!G.dodgeT || G.t - G.dodgeT > 0.6) { G.dodgeT = G.t; UI.float('dodge', P.pos, { color: '#9ad', size: 10, y: 2.4 }); }
      return;
    }
    dmg = Math.round(dmg * (1 - P.ws.ward) * (1 - (P.gs ? P.gs.reduce : 0)));
    P.hp -= dmg; P.hurtT = 0.35; G.hurtFx = Math.min(1, G.hurtFx + 0.6);
    UI.float(String(dmg), P.pos, { color: '#ff5050', size: 15, y: 2.4 });
    GWAudio.sfx('hurt'); G.shake(o.heavy ? 0.6 : 0.3); G.hitstop = 0.06;
    G.parts.blood.burst(P.pos.x, P.pos.y + 1.2, P.pos.z, 8, 3, 0xa01010, 0.6, 1, -10);
    navigator.vibrate && navigator.vibrate(o.heavy ? 60 : 25);
    const dx = P.pos.x - from.x, dz = P.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
    if (P.state !== 'skill' || o.heavy) { P.state = 'hurt'; P.t = 0; P.vel.set(dx / d * (o.heavy ? 11 : 6), 0, dz / d * (o.heavy ? 11 : 6)); }
    if (P.hp <= 0) {
      P.hp = 0; P.state = 'dead'; P.t = 0; G.state = 'dying';
      GWAudio.sfx('die'); UI.boss(false);
      setTimeout(() => { G.state = 'dead'; $('death').classList.remove('hidden'); $('hud').classList.add('hidden'); }, 1600);
    }
  };
  G.telegraph = function (o) { const t = new GW.Telegraph(G.scene, o); G.telegraphs.push(t); return t; };
  G.spawnProjectile = function (o) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(o.r * 0.7, 1), GW.mat({ id: ID.FIRE, color: 0, emissive: o.color, unlit: true }));
    m.position.set(o.x, o.y, o.z); G.scene.add(m);
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

  // ---------------- interaction ----------------
  function nearestInteract() {
    const P = G.player; let best = null, bd = 1e9;
    for (const it of GW.World.interact) { const d = Math.hypot(P.pos.x - it.x, P.pos.z - it.z); if (d < it.r && d < bd) { bd = d; best = it; } }
    return best;
  }
  function doInteract(it) {
    if (it.type === 'rest') rest(it);
    else if (it.type === 'forge') openForge();
    else if (it.type === 'npc') talk(it.npc);
  }

  // ---------------- save ----------------
  function save() {
    if (G.state === 'title') return;
    const P = G.player;
    const d = { v: 1, gear: P.gear, level: P.level, xp: P.xp, flasks: P.flasks, weapon: P.weapon, inv: P.inv, stage: G.stage, counters: G.counters, respawn: G.respawn, bossDead: !!G.bossDead };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch (e) { /* storage blocked */ }
  }
  function loadData() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; } }
  G.save = save;

  // ---------------- camera ----------------
  const camT = new V3(), camLook = new V3();
  function updateCamera(dt, title) {
    const C = G.camera, P = G.player;
    C.aspect = G.R.aspect; C.fov = G.R.aspect < 0.8 ? 50 : 42; C.updateProjectionMatrix();
    if (title) {
      const a = G.t * 0.05, c = GW.World.L.village;
      C.position.set(c.x + Math.sin(a) * 30, 16, c.z + Math.cos(a) * 30);
      C.lookAt(c.x, 1, c.z);
      return;
    }
    const portrait = G.R.aspect < 0.8;
    let D = (portrait ? 16.5 : 16) * (UI.settings.zoom || 1.3);
    if (G.bossActive) D *= 1.2;
    GW.LU.uFogStart.value = D + 10;
    GW.World.grass.mat.uniforms.uSize.value = 50 * Math.max(1, D / 20);
    const pitch = 0.98;
    const fwd = P.fwd();
    const ahead = P.state === 'move' ? 1.2 : 0.6;
    camT.set(P.pos.x + fwd.x * ahead, P.pos.y, P.pos.z + fwd.z * ahead + (portrait ? 2.6 : 0));
    camLook.lerp(camT, Math.min(1, dt * 6));
    if (camLook.lengthSq() === 0 || G.snapCam) { camLook.copy(camT); G.snapCam = false; }
    C.position.set(camLook.x, camLook.y + Math.sin(pitch) * D, camLook.z + Math.cos(pitch) * D);
    const s = G.shakeAmt * G.shakeAmt * 0.6;
    C.position.x += (Math.random() - 0.5) * s; C.position.y += (Math.random() - 0.5) * s; C.position.z += (Math.random() - 0.5) * s;
    C.lookAt(camLook.x, camLook.y + 0.8, camLook.z);
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
    let dt = Math.min(0.05, (now - G.last) / 1000); G.last = now;
    G.t += dt; frame++;
    GW.LU.uTime.value = G.t;
    const pressed = I.consume();
    if (pressed.menu) {
      if (G.state === 'forge') GW.Forge.UI.close();
      else if (G.state === 'gear') G.closeGear();
      else if (G.state === 'play' && !UI.inDialog()) togglePause(true);
      else if (G.state === 'paused') togglePause(false);
    }
    UI.tick(dt);
    if (pressed.gear) { if (G.state === 'gear') G.closeGear(); else if (G.state === 'play' && !UI.inDialog()) openGear(); }
    if (G.state === 'gear') {
      const U = GW.Knight.UI, C = G.camera;
      if (!U.drag) U.ang += dt * 0.25;
      G.player.animate(0.016);
      const p = G.player.pos, r = window.innerWidth < 640 ? 6.4 : 3.8;
      C.aspect = G.R.aspect; C.fov = 40; C.updateProjectionMatrix();
      C.position.set(p.x + Math.sin(U.ang) * r, p.y + 1.6, p.z + Math.cos(U.ang) * r);
      C.lookAt(p.x, p.y + 1.0, p.z);
      const fr = U.freeRect(); C.setViewOffset(window.innerWidth, window.innerHeight, window.innerWidth / 2 - fr.cx, window.innerHeight / 2 - fr.cy, window.innerWidth, window.innerHeight);
      for (const u of GW.World.grass.push) u.z = 0; GW.World.grass.push[0].set(p.x, p.z, 3.2);
      GW.World.update(0, G.t, p.x, p.z); GW.World.lights.update(p.x, p.z, G.t);
      G.R.render(G.scene, C, { hurt: 0, white: 0 });
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
      GW.LU.uFog.value = 0.012; GW.LU.uAmb.value.setRGB(0.1, 0.12, 0.17);
      return;
    }
    const P = G.player;
    const playing = G.state === 'play' || G.state === 'dying';
    // hitstop: freeze simulation briefly, keep rendering
    let sdt = dt;
    if (G.hitstop > 0) { G.hitstop -= dt; sdt = dt * 0.05; }
    if (G.state === 'paused' || G.state === 'dead') sdt = 0;

    if (playing) {
      let input = { mx: 0, mz: 0 };
      if (UI.inDialog()) {
        if (pressed.interact || pressed.click || pressed.attack) UI.dialogAdvance();
      } else if (G.state === 'play') {
        const mv = I.move();
        const aim = aimPoint();
        input = { mx: mv.x, mz: mv.z, aim, aimHeld: I.mouse.down,
          attack: pressed.attack || pressed.click || I.mouse.down || I.holdAttack, roll: pressed.roll,
          s2: pressed.s2, s3: pressed.s3, s4: pressed.s4, potion: pressed.potion };
        const it = nearestInteract();
        UI.interact(it ? it.label : null);
        if (pressed.interact && it) doInteract(it);
      }
      if (sdt > 0) {
        for (const u of GW.World.grass.push) u.z = 0;
        P.update(sdt, input, G);
        for (const e of G.enemies) e.update(sdt, G);
        for (const n of G.npcs) n.update(sdt, G);
        updateProjectiles(sdt); updateBoulders(sdt); updatePickups(sdt);
        G.telegraphs = G.telegraphs.filter(t => { t.update(sdt); return !t.done; });
        // tutorial hints + boss trigger + zones
        world(sdt);
        // respawn timers
        for (const e of G.enemies) if (!e.alive && !e.T.boss && !e.temp && e.type !== 'husk' && G.t - e.diedAt > 90 && e.distTo(P.pos) > 40) revive(e);
        for (const e of G.enemies) if (!e.alive && e.type === 'husk' && G.t - e.diedAt > 5) revive(e);
      }
      UI.updateHUD(P);
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
      for (const n of G.npcs) if (n.pos.distanceTo(P.pos) < 12) { const lp = n.pos.clone(); lp.y += 2.6; UI.label(n, n.name, lp, 'name', '#ffcf6a'); }
      if (G.bossActive && G.boss.alive) UI.boss(true, GW.ETYPES.warden.name, G.boss.hp, G.boss.maxHp);
      G.saveT += dt; if (G.saveT > 20) { G.saveT = 0; save(); }
    } else if (G.state === 'title') {
      for (const n of G.npcs) n.update(dt, G);
    }
    G.parts.spark.update(sdt); G.parts.dust.update(sdt); G.parts.blood.update(sdt);
    const focus = G.state === 'title' ? GW.World.L.village : P.pos;
    GW.World.update(sdt || 0, G.t, focus.x, focus.z);
    GW.World.lights.update(focus.x, focus.z, G.t);
    updateCamera(dt, G.state === 'title');
    UI.updateFloaters(dt, G.camera);
    G.shakeAmt = Math.max(0, G.shakeAmt - dt * 3);
    G.hurtFx = Math.max(0, G.hurtFx - dt * 1.5);
    const low = P.hp / P.maxHp < 0.3 && G.state === 'play' ? 0.35 + 0.15 * Math.sin(G.t * 5) : 0;
    G.R.render(G.scene, G.camera, { hurt: Math.max(G.hurtFx, low), white: G.flashWhite });
    G.flashWhite = Math.max(0, G.flashWhite - dt * 1.2);
    // audio
    if (GWAudio.ctx) {
      let fd = 99; for (const it of GW.World.interact) if (it.type === 'rest') fd = Math.min(fd, Math.hypot(it.x - focus.x, it.z - focus.z));
      const combat = G.enemies.some(e => e.alive && e.aggro && !e.T.boss && e.type !== 'husk') || G.bossActive;
      GWAudio.update(dt, { riverDist: GW.World.riverDist(focus.x, focus.z), fireDist: fd, combat, boss: G.bossActive });
    }
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
      G.bossActive = true; G.arenaLock = true; G.boss.aggro = true; G.boss.setState('roar');
      GWAudio.sfx('roar'); G.shake(0.8);
      UI.banner('the circle closes', 'THE MIRE WARDEN', 3.5);
      W.arenaStones.forEach(s => s.band.material.uniforms.uEmissive.value.setRGB(1.0, 0.25, 0.1));
    } else if (!G.boss.alive || G.stage < 7) {
      if (G.boss.alive && G.stage < 7 && Math.hypot(P.pos.x - A.x, P.pos.z - A.z) < 16 && !G.hintsShown.early) { G.hintsShown.early = true; UI.hint('The stones are asleep. The Warden does not notice you yet.', 4); }
    }
    if (G.bossActive) W.arenaStones.forEach((s, i) => { const k = 0.7 + 0.3 * Math.sin(G.t * 4 + i); s.band.material.uniforms.uEmissive.value.setRGB(1.0 * k, 0.25 * k, 0.1 * k); });
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
        if (Math.hypot(P.pos.x - p.pos.x, P.pos.z - p.pos.z) < p.r + 0.45) { G.hurtPlayer(p.dmg, p.pos, {}); boom = true; }
      } else {
        for (const e of G.enemies) if (e.alive && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < p.r + e.radius) { boom = true; break; }
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
      if (d < 4 && p.t > 0.6) { p.p.x += (P.pos.x - p.p.x) * dt * 6; p.p.z += (P.pos.z - p.p.z) * dt * 6; }
      p.m.position.set(p.p.x, GW.World.groundY(p.p.x, p.p.z) + 0.7 + Math.sin(p.t * 3) * 0.15, p.p.z); p.m.rotation.y += dt * 2;
      p.light.p.copy(p.m.position);
      if (d < 1.3 && p.t > 0.6) { give(p.kind, p.key); G.scene.remove(p.m); GW.World.lights.remove(p.light); return false; }
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

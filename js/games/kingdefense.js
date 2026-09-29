/*
 * KINGDOM DEFENSE – Kingshot-style hero defense, played on your own town.
 * Walk your knight with the joystick: he slashes nearby enemies and blocks the horde.
 * Enemies march along the road to your Town Hall. Pick up the coins they drop and
 * spend them on build pads along the road: archer towers, cannons, mage towers,
 * soldiers, hero upgrades. Your town's building levels decide which defenses and
 * bonuses you get. Waves never end; bosses show up every 5 waves.
 */
(function () {
  'use strict';
  const { Save, UI, sfx, vibrate, fmt, clamp } = GH;

  // road from the northern woods to the Town Hall gate (x, z)
  const PATH = [[-20, -56], [-20, -36], [4, -32], [9, -22], [-6, -16], [-5, -7], [0, -3], [0, 4.4]];
  const SEG = [];
  let PATH_LEN = 0;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [x0, z0] = PATH[i], [x1, z1] = PATH[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    SEG.push({ x0, z0, x1, z1, len, start: PATH_LEN, dx: (x1 - x0) / len, dz: (z1 - z0) / len });
    PATH_LEN += len;
  }
  function pathAt(s, off = 0) {
    s = clamp(s, 0, PATH_LEN);
    let g = SEG[SEG.length - 1];
    for (const sg of SEG) if (s <= sg.start + sg.len) { g = sg; break; }
    const t = s - g.start;
    return { x: g.x0 + g.dx * t - g.dz * off, z: g.z0 + g.dz * t + g.dx * off, dx: g.dx, dz: g.dz };
  }
  function distToPath(x, z) {
    let best = Infinity, bs = 0;
    for (const g of SEG) {
      const t = clamp((x - g.x0) * g.dx + (z - g.z0) * g.dz, 0, g.len);
      const px = g.x0 + g.dx * t, pz = g.z0 + g.dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best) { best = d; bs = g.start + t; }
    }
    return { d: best, s: bs };
  }

  const HALL = { x: 0, z: 7 };
  const TOWN_OFFSET = 7; // town plots are placed around (0, 7)

  const ENEMIES = {
    raider: { hp: 3, speed: 3.4, dps: 10, hall: 4, coins: 1, r: 0.45, scale: 1, color: '#d9443a', head: '#ffd2a6' },
    runner: { hp: 2, speed: 5.6, dps: 6, hall: 3, coins: 1, r: 0.4, scale: 0.85, color: '#e0772b', head: '#ffd2a6' },
    shield: { hp: 9, speed: 2.6, dps: 12, hall: 6, coins: 2, r: 0.5, scale: 1.1, color: '#7d8a99', head: '#c0392b' },
    brute: { hp: 30, speed: 2.2, dps: 24, hall: 15, coins: 6, r: 0.95, scale: 2, color: '#8e2a22', head: '#6b8e23', bar: true },
    boss: { hp: 130, speed: 1.6, dps: 50, hall: 50, coins: 30, r: 1.5, scale: 3.2, color: '#5b1a14', head: '#c9a227', bar: true },
  };

  // build pads: `town` = the town building (and level) that unlocks it
  const PADS = [
    { id: 'a1', type: 'archer', x: -15, z: -40 },
    { id: 'a2', type: 'archer', x: 1, z: -25 },
    { id: 'a3', type: 'archer', x: -10, z: -10 },
    { id: 'a4', type: 'archer', x: 13, z: -17 },
    { id: 'a5', type: 'archer', x: 4.5, z: -8 },
    { id: 'c1', type: 'cannon', x: -2, z: -22, town: 'forge' },
    { id: 'm1', type: 'mage', x: -14, z: -30, town: 'tower' },
    { id: 'b1', type: 'barracks', x: 3.5, z: -13, town: 'barracks' },
    { id: 'hero', type: 'hero', x: 4, z: 2.6 },
    { id: 'repair', type: 'repair', x: -4, z: 2.6 },
  ];
  const TYPES = {
    archer: { icon: '🏹', name: 'Archer', cost: (l) => [20, 45, 90, 160][l], range: 9, rate: 1.1, dmg: 2 },
    cannon: { icon: '💣', name: 'Cannon', cost: (l) => [50, 90, 160, 260][l], range: 8, rate: 0.45, dmg: 6, splash: 2.4 },
    mage: { icon: '🔮', name: 'Mage', cost: (l) => [60, 100, 170, 280][l], range: 8.5, rate: 0.8, dmg: 3.5, slow: 1.6 },
    barracks: { icon: '🛡️', name: 'Soldiers', cost: (l) => [40, 80, 140, 220][l] },
    hero: { icon: '⚔️', name: 'Hero', cost: (l) => 30 + l * 45 + l * l * 6 },
    repair: { icon: '🔧', name: 'Repair', cost: () => 40 },
  };
  const TOWN_NAMES = { forge: 'Forge', tower: 'Mage Tower', barracks: 'Barracks' };

  class KingdomDefense {
    constructor({ api }) {
      this.api = api;
      this.K = GH.K3;
      this.title = 'Kingdom Defense';
      const T = GH.Town, lv = T.lv;
      // ---- everything your town gives you
      this.bonus = {
        dmg: T.bonus.frostDmg(),                         // Forge: +20% damage per level
        hallHp: 120 + lv('walls') * 40 + lv('hall') * 20, // Walls + Town Hall
        maxTower: Math.min(4, 1 + lv('hall')),           // Town Hall caps tower level
        archerRate: 1 + 0.2 * lv('lodge'),               // Hunter's Lodge
        regen: 4 + lv('kitchen') * 3,                    // Kitchen feeds the hero
        startCoins: 20 + lv('vault') * 15,               // Vault
        soldiers: 2 + lv('barracks'),                    // Barracks
      };
      Save.data.best = Save.data.best || {};
      this.best = Save.data.best.kingdom || 0;
      this.buildScene();
      this.bindInput();
      this.reset();
      api.setLevelLabel(`Best: wave ${this.best}`);
      api.setHudButtons([]);
      this.render3D(0); // draw the HUD once before the intro dialog
      this.showBonuses();
    }

    // ---------------------------------------------------------------- scene
    buildScene() {
      const T = THREE, K = this.K;
      this.ly = K.layer(`
        <div class="kd-top">
          <div class="kd-wave"><b>Wave 1</b><small></small></div>
          <div class="fs-cash kd-coins"><span>🪙</span><b>0</b></div>
        </div>
        <div class="kd-hall"><span>🏰</span><div class="bar"><i></i></div></div>
        <button class="btn gold small kd-call" hidden>⚔️ Call wave now</button>
        <div class="kd-boss" hidden>👹 WARLORD INCOMING</div>
        <div class="kd-edge" hidden><i></i><b></b></div>
        <div class="fs-joy idle"><i></i></div>`);
      const el = this.ly.el;
      this.ui = {
        wave: el.querySelector('.kd-wave b'), sub: el.querySelector('.kd-wave small'), coins: el.querySelector('.kd-coins b'),
        hallBar: el.querySelector('.kd-hall i'), call: el.querySelector('.kd-call'), boss: el.querySelector('.kd-boss'),
        joy: el.querySelector('.fs-joy'), knob: el.querySelector('.fs-joy i'),
        edge: el.querySelector('.kd-edge'), edgeArrow: el.querySelector('.kd-edge i'), edgeText: el.querySelector('.kd-edge b'),
      };
      this.ui.call.addEventListener('click', () => this.callEarly());
      this.renderer = K.renderer(el);
      const scene = (this.scene = new T.Scene());
      scene.background = new T.Color('#9fd3f0');
      scene.fog = new T.Fog('#9fd3f0', 40, 85);
      this.camera = new T.PerspectiveCamera(50, 1, 0.5, 200);
      this.camOffset = new T.Vector3(0, 20, 14);
      scene.add(new T.HemisphereLight('#ffffff', '#6f8f5a', 1.9));
      const sun = (this.sun = new T.DirectionalLight('#fff3dd', 2.3));
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 70 });
      scene.add(sun, sun.target);

      // meadow, cliff edge and the road
      const ground = new T.Mesh(new T.PlaneGeometry(90, 110), K.lam('#7cc36a'));
      ground.rotation.x = -Math.PI / 2; ground.position.set(-4, 0, -22); ground.receiveShadow = true;
      scene.add(ground);
      const cliff = new T.Mesh(new T.BoxGeometry(92, 6, 112), K.lam('#9c8a74'));
      cliff.position.set(-4, -3.02, -22);
      scene.add(cliff);
      const water = new T.Mesh(new T.PlaneGeometry(400, 400), K.lam('#4aa3d8'));
      water.rotation.x = -Math.PI / 2; water.position.y = -2;
      scene.add(water);
      const roadMat = K.lam('#e3cf9a');
      for (const g of SEG) {
        const m = new T.Mesh(new T.BoxGeometry(2.8, 0.06, g.len + 2.8), roadMat);
        m.position.set((g.x0 + g.x1) / 2, 0.03, (g.z0 + g.z1) / 2);
        m.rotation.y = Math.atan2(g.dx, g.dz);
        m.receiveShadow = true;
        scene.add(m);
      }
      const plaza = new T.Mesh(new T.CylinderGeometry(9, 9, 0.05, 32), roadMat);
      plaza.position.set(HALL.x, 0.02, HALL.z + 1);
      plaza.receiveShadow = true;
      scene.add(plaza);

      this.buildTrees();
      this.buildTown();

      // hero
      const hero = (this.heroMesh = K.person('#2f6fe0', null));
      hero.add(K.mesh(K.geo.sphere, K.std('#e8c35a', { metalness: 0.7, roughness: 0.3 }), 0, 1.44, 0, 0.62, 0.48, 0.62));
      hero.add(K.box(0.9, 0.9, 0.08, K.lam('#c0392b'), 0, 0.85, -0.3));
      const sword = (this.sword = new T.Group());
      sword.add(K.box(0.1, 1.3, 0.05, K.std('#e8eef8', { metalness: 0.85, roughness: 0.2 }), 0, 0.65, 0));
      sword.add(K.box(0.4, 0.08, 0.08, K.lam('#8a6414'), 0, 0.02, 0));
      sword.position.set(0.45, 0.8, 0.1);
      hero.add(sword);
      hero.scale.setScalar(1.35);
      scene.add(hero);
      this.slash = new T.Mesh(new T.TorusGeometry(2, 0.12, 6, 28, Math.PI * 1.2), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0 }));
      this.slash.rotation.x = -Math.PI / 2;
      scene.add(this.slash);
      this.heroBar = this.bar('#4ade80');

      // instanced crowds: enemies, soldiers, projectiles, coins
      // frustumCulled off: three.js caches an instanced mesh's bounds from its first frame, so moving crowds would vanish
      const mk = (geo, mat, n, shadow = true) => { const m = new T.InstancedMesh(geo, mat, n); m.castShadow = shadow; m.count = 0; m.frustumCulled = false; scene.add(m); return m; };
      this.enBody = mk(new T.CapsuleGeometry(0.3, 0.35, 3, 8), new T.MeshLambertMaterial({ color: '#ffffff' }), 260);
      this.enHead = mk(new T.SphereGeometry(0.24, 10, 8), new T.MeshLambertMaterial({ color: '#ffffff' }), 260);
      this.enHelm = mk(new T.ConeGeometry(0.26, 0.3, 8), K.lam('#6b2a22'), 260);
      this.soBody = mk(new T.CapsuleGeometry(0.28, 0.35, 3, 8), K.lam('#3a7bd5'), 12);
      this.soHead = mk(new T.SphereGeometry(0.22, 10, 8), K.lam('#dfe6ef'), 12);
      this.shots = mk(new T.BoxGeometry(0.12, 0.12, 0.8), K.basic('#fff3b0'), 160, false);
      this.coinMesh = mk(new T.CylinderGeometry(0.28, 0.28, 0.1, 12), K.std('#ffc83a', { metalness: 0.8, roughness: 0.25, emissive: '#6b4a00', emissiveIntensity: 0.4 }), 300);
      this.fxMesh = mk(new T.BoxGeometry(0.2, 0.2, 0.2), new T.MeshBasicMaterial({ color: '#ffffff' }), 160, false);
      this.dummy = new T.Object3D();
      this.col = new T.Color();

      // arrow above the next thing to do
      this.arrow = new T.Mesh(new T.ConeGeometry(0.5, 1.1, 10), K.basic('#ffd23a'));
      this.arrow.rotation.x = Math.PI;
      scene.add(this.arrow);

      this.pads = PADS.map((def) => {
        const tx = K.canvasTex(256, 256);
        const tile = new T.Mesh(new T.PlaneGeometry(2.8, 2.8), new T.MeshBasicMaterial({ map: tx.tex, transparent: true, depthWrite: false }));
        tile.rotation.x = -Math.PI / 2;
        tile.position.set(def.x, 0.07, def.z);
        scene.add(tile);
        return { def, tile, tx, key: '', lvl: 0, paid: 0, tower: null };
      });

      this.onResize = () => { K.fit(this.renderer, this.camera, el, 8.5, this.camOffset.length(), 42, 78); this.placeIdleJoy(); };
      window.addEventListener('resize', this.onResize);
      this.onResize();
    }

    bar(color) {
      const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#222', depthTest: false }));
      const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color, depthTest: false }));
      bg.renderOrder = 8; fg.renderOrder = 9;
      fg.center.set(0, 0.5);
      bg.scale.set(1.5, 0.2, 1);
      this.scene.add(bg, fg);
      return { bg, fg, set: (x, y, z, k, w = 1.4) => {
        bg.position.set(x, y, z); bg.scale.set(w + 0.1, 0.2, 1);
        fg.position.set(x - w / 2, y, z); fg.scale.set(Math.max(0.01, w * k), 0.13, 1);
      }, show: (v) => { bg.visible = fg.visible = v; }, remove: () => { this.scene.remove(bg, fg); bg.material.dispose(); fg.material.dispose(); } };
    }

    buildTrees() {
      const T = THREE, K = this.K;
      const rnd = GH.rng(2024);
      const spots = [];
      for (let i = 0; i < 900 && spots.length < 150; i++) {
        const x = -48 + rnd() * 88, z = -76 + rnd() * 108;
        if (Math.abs(x + 4) > 44 || z > 31 || z < -76) continue;
        if (distToPath(x, z).d < 3.5) continue;
        if (Math.hypot(x - HALL.x, z - HALL.z) < 13) continue;
        if (PADS.some((p) => Math.hypot(p.x - x, p.z - z) < 3)) continue;
        if (z > -2 && Math.abs(x) < 16) continue; // keep the camera side of town open
        if (rnd() < 0.55 && Math.abs(x) < 16 && z > -44) continue; // lighter near the road
        spots.push([x, z, 0.8 + rnd() * 0.7]);
      }
      const trunk = new T.InstancedMesh(new T.CylinderGeometry(0.18, 0.25, 1.2, 6), K.lam('#7a5230'), spots.length);
      const crown = new T.InstancedMesh(new T.SphereGeometry(1, 9, 7), K.lam('#3f9a4a'), spots.length);
      const o = new T.Object3D();
      spots.forEach(([x, z, s], i) => {
        o.scale.setScalar(s); o.position.set(x, 0.6 * s, z); o.updateMatrix(); trunk.setMatrixAt(i, o.matrix);
        o.scale.set(s, s * 1.15, s); o.position.set(x, 1.8 * s, z); o.updateMatrix(); crown.setMatrixAt(i, o.matrix);
      });
      trunk.castShadow = crown.castShadow = true;
      this.scene.add(trunk, crown);
    }

    /** Your actual town, at its current building levels, is what you are defending. */
    buildTown() {
      const helper = Object.create(GH.Town.TownView.prototype);
      helper.lam = {};
      for (const [id, b] of Object.entries(GH.Town.BUILDINGS)) {
        const l = GH.Town.lv(id);
        if (id === 'walls') {
          for (const sx of [-1, 1]) {
            const w = helper.model(id, l);
            w.scale.set(0.62, 1, 1);
            w.position.set(sx * 5.4, 0, TOWN_OFFSET - 7.4);
            this.scene.add(w);
          }
          continue;
        }
        const g = helper.model(id, l);
        g.position.set(b.plot[0], 0, b.plot[1] + TOWN_OFFSET + (id === 'hall' ? 0.5 : 0));
        this.scene.add(g);
      }
    }

    // ---------------------------------------------------------------- state
    reset() {
      this.state = 'prep';
      this.wave = 0;
      this.prepT = 10;
      this.queue = [];
      this.spawnT = 0;
      this.enemies = []; this.soldiers = []; this.projectiles = []; this.coins = []; this.fx = [];
      this.coinsHave = this.bonus.startCoins;
      this.coinsShown = this.coinsHave;
      this.hall = { hp: this.bonus.hallHp, max: this.bonus.hallHp };
      this.hero = { x: -3, z: -9, hp: 120, max: 120, swingT: 0, deadT: 0, lvl: 0, hurtT: 0 };
      this.kills = 0;
      this.time = 0;
      this.revived = false;
      this.padT = 0;
    }

    showBonuses() {
      const T = GH.Town, lv = T.lv;
      const row = (icon, text, on) => `<div class="loot ${on ? '' : 'muted-loot'}"><span>${icon}</span><b>${text}</b></div>`;
      const b = this.bonus;
      this.paused = true;
      UI.modal({
        icon: '🏰', title: 'Defend your town!',
        sub: 'Your town\'s buildings power up this battle.',
        body: `<div class="loot-list kd-bonus">
          ${row('🧱', `Town Hall HP ${b.hallHp} (Walls Lv ${lv('walls')})`, true)}
          ${row('🔨', lv('forge') ? `Cannons unlocked · +${lv('forge') * 20}% damage` : 'Build a Forge to unlock cannons', lv('forge'))}
          ${row('🔮', lv('tower') ? 'Mage towers unlocked' : 'Build a Mage Tower to unlock mage towers', lv('tower'))}
          ${row('⚔️', lv('barracks') ? `Soldiers unlocked · ${b.soldiers} per barracks` : 'Build Barracks to unlock soldiers', lv('barracks'))}
          ${row('🏹', `Archer fire rate ×${b.archerRate.toFixed(1)} (Hunter's Lodge)`, lv('lodge'))}
          ${row('🏰', `Towers up to Lv ${b.maxTower} (Town Hall Lv ${lv('hall')})`, true)}
          ${row('💰', `Start with 🪙 ${b.startCoins} (Vault)`, lv('vault'))}
        </div>`,
        buttons: [{ label: 'To battle!', cls: 'green', onClick: () => { this.paused = false; } }],
      });
    }

    // ---------------------------------------------------------------- input
    bindInput() {
      const el = this.ly.el;
      const j = (this.joy = { active: false, id: null, sx: 0, sy: 0, x: 0, y: 0 });
      this.keys = new Set();
      const R = 52;
      this.h = {
        down: (e) => {
          if (this.blocked() || e.target.closest('button')) return;
          e.preventDefault();
          const r = el.getBoundingClientRect();
          Object.assign(j, { active: true, id: e.pointerId, sx: e.clientX - r.left, sy: e.clientY - r.top, x: 0, y: 0 });
          this.ui.joy.style.left = j.sx + 'px'; this.ui.joy.style.top = j.sy + 'px';
          this.ui.joy.classList.remove('idle');
          try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        },
        move: (e) => {
          if (!j.active || e.pointerId !== j.id) return;
          const r = el.getBoundingClientRect();
          let dx = e.clientX - r.left - j.sx, dy = e.clientY - r.top - j.sy;
          const d = Math.hypot(dx, dy);
          if (d > R) { dx *= R / d; dy *= R / d; }
          j.x = dx / R; j.y = dy / R;
          this.ui.knob.style.transform = `translate(${dx}px, ${dy}px)`;
        },
        up: (e) => {
          if (e.pointerId !== j.id) return;
          j.active = false; j.x = j.y = 0;
          this.ui.knob.style.transform = '';
          this.ui.joy.classList.add('idle');
          this.placeIdleJoy();
        },
        key: (e) => {
          const k = e.key.toLowerCase();
          if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) return;
          if (e.type === 'keydown') this.keys.add(k); else this.keys.delete(k);
        },
      };
      el.addEventListener('pointerdown', this.h.down);
      el.addEventListener('pointermove', this.h.move);
      el.addEventListener('pointerup', this.h.up);
      el.addEventListener('pointercancel', this.h.up);
      window.addEventListener('keydown', this.h.key);
      window.addEventListener('keyup', this.h.key);
      this.placeIdleJoy();
    }

    placeIdleJoy() {
      if (!this.ui || (this.joy && this.joy.active)) return;
      const r = this.ly.el.getBoundingClientRect();
      this.ui.joy.style.left = r.width / 2 + 'px';
      this.ui.joy.style.top = r.height - 110 + 'px';
    }

    blocked() { return this.paused || UI.modalCount > 0 || !!document.querySelector('.ad-player'); }

    inputVec() {
      let x = this.joy.x, z = this.joy.y;
      const k = this.keys;
      if (k.has('a') || k.has('arrowleft')) x -= 1;
      if (k.has('d') || k.has('arrowright')) x += 1;
      if (k.has('w') || k.has('arrowup')) z -= 1;
      if (k.has('s') || k.has('arrowdown')) z += 1;
      const m = Math.hypot(x, z);
      if (m < 0.12) return null;
      const s = Math.min(1, m) / m;
      return { x: x * s, z: z * s };
    }

    // ---------------------------------------------------------------- waves
    get hpScale() { const n = this.wave - 1; return 1 + 0.3 * n + Math.pow(n / 4.5, 2); }

    startWave() {
      this.wave++;
      this.state = 'wave';
      const n = this.wave;
      const q = [];
      const count = Math.min(80, 6 + n * 3 + Math.floor(n * n / 8));
      for (let i = 0; i < count; i++) {
        const r = Math.random();
        let kind = 'raider';
        if (n >= 3 && r < 0.25) kind = 'runner';
        else if (n >= 5 && r > 0.85) kind = 'shield';
        q.push(kind);
      }
      for (let i = 0; i < Math.floor(n / 4); i++) q.splice(Math.floor(q.length * (0.4 + i * 0.15)), 0, 'brute');
      if (n % 5 === 0) { q.splice(Math.floor(q.length / 2), 0, 'boss'); this.ui.boss.hidden = false; setTimeout(() => { if (this.ui) this.ui.boss.hidden = true; }, 2500); sfx('bad'); vibrate(80); }
      this.queue = q;
      this.spawnT = 0;
      this.ui.call.hidden = true;
      sfx('level');
    }

    callEarly() {
      if (this.state !== 'prep' || this.blocked()) return;
      const bonus = Math.max(3, Math.round(this.prepT * 2));
      this.coinsHave += bonus;
      UI.toast(`Early call: +${bonus} 🪙`);
      this.startWave();
    }

    spawn(kind) {
      const k = ENEMIES[kind];
      const hp = k.hp * this.hpScale * (kind === 'boss' ? 1 + this.wave / 10 : 1);
      const e = { kind, k, s: 0, off: (Math.random() - 0.5) * 1.8, hp, max: hp, slow: 0, phase: Math.random() * 6, hitT: 0 };
      if (k.bar) e.bar = this.bar('#ff3b3b');
      this.enemies.push(e);
    }

    // ---------------------------------------------------------------- update
    update(dt) {
      this.time += dt;
      const H = this.hero;
      const b = this.bonus;

      // hero movement / death
      if (H.deadT > 0) {
        H.deadT -= dt;
        if (H.deadT <= 0) { H.hp = H.max; H.x = 0; H.z = 1.5; }
      } else {
        const v = this.inputVec();
        this.heroMoving = !!v;
        if (v) {
          H.x = clamp(H.x + v.x * 6.5 * dt, -46, 38);
          H.z = clamp(H.z + v.z * 6.5 * dt, -74, 29);
          this.heroMesh.rotation.y = Math.atan2(v.x, v.z);
        }
        // don't walk through the Town Hall
        const hx = H.x - HALL.x, hz = H.z - (HALL.z + 0.5), hd = Math.hypot(hx, hz);
        if (hd < 2.6 && hd > 0.001) { H.x = HALL.x + (hx / hd) * 2.6; H.z = HALL.z + 0.5 + (hz / hd) * 2.6; }
        H.hurtT = Math.max(0, H.hurtT - dt);
        if (H.hurtT <= 0) H.hp = Math.min(H.max, H.hp + b.regen * dt);
      }

      // waves
      if (this.state === 'prep') {
        this.prepT -= dt;
        this.ui.call.hidden = this.wave === 0 && this.prepT > 8;
        if (this.prepT <= 0) this.startWave();
      } else if (this.state === 'wave') {
        if (this.queue.length) {
          this.spawnT -= dt;
          if (this.spawnT <= 0) {
            this.spawn(this.queue.shift());
            this.spawnT = Math.max(0.18, 0.6 - this.wave * 0.03);
          }
        } else if (!this.enemies.length) {
          this.state = 'prep';
          this.prepT = 5;
          const bonus = 5 + this.wave * 2;
          this.coinsHave += bonus;
          UI.toast(`Wave ${this.wave} cleared! +${bonus} 🪙`);
          sfx('win');
          this.ui.call.hidden = false;
        }
      }

      this.updateEnemies(dt);
      this.updateHeroAttack(dt);
      this.updateSoldiers(dt);
      this.updateTowers(dt);
      this.updateProjectiles(dt);
      this.updateCoins(dt);
      this.updatePads(dt);
      for (const f of this.fx) { f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; f.vy -= 16 * dt; }
      this.fx = this.fx.filter((f) => f.t < 0.6);

      if (this.hall.hp <= 0 && this.state !== 'over') this.over();
      this.render3D(dt);
    }

    updateEnemies(dt) {
      const H = this.hero;
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.hitT = Math.max(0, e.hitT - dt);
        e.slow = Math.max(0, e.slow - dt);
        const p = pathAt(e.s, e.off);
        e.x = p.x; e.z = p.z; e.dir = Math.atan2(p.dx, p.dz);
        // the hero and soldiers body-block the horde
        let blocker = null;
        if (H.deadT <= 0 && Math.hypot(H.x - e.x, H.z - e.z) < 0.9 + e.k.r) blocker = H;
        else for (const s of this.soldiers) if (s.hp > 0 && Math.hypot(s.x - e.x, s.z - e.z) < 0.75 + e.k.r) { blocker = s; break; }
        if (blocker) {
          blocker.hp -= e.k.dps * dt;
          if (blocker === H) { H.hurtT = 2; if (H.hp <= 0) this.heroDown(); }
          e.phase += dt * 16;
          e.attacking = true;
        } else {
          e.attacking = false;
          e.s += e.k.speed * (e.slow > 0 ? 0.5 : 1) * dt;
          e.phase += dt * 10;
        }
        if (e.s >= PATH_LEN) {
          e.dead = true;
          this.hall.hp -= e.k.hall;
          this.hall.hitT = 0.2;
          sfx('hit'); vibrate(30);
        }
      }
      this.enemies = this.enemies.filter((e) => { if (e.dead && e.bar) e.bar.remove(); return !e.dead; });
    }

    heroDown() {
      this.hero.hp = 0;
      this.hero.deadT = 5;
      sfx('bad'); vibrate([60, 40, 60]);
      UI.toast('Your hero fell! Back in 5s…');
    }

    damage(e, d) {
      if (e.dead) return;
      e.hp -= d * this.bonus.dmg;
      e.hitT = 0.08;
      if (e.hp <= 0) {
        e.dead = true;
        this.kills++;
        for (let i = 0; i < e.k.coins + (Math.random() < 0.5 ? 1 : 0); i++) {
          const a = Math.random() * 6.28, sp = 1 + Math.random() * 2.5;
          this.coins.push({ x: e.x, y: 0.6, z: e.z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 5, t: 0 });
        }
        for (let i = 0; i < 5; i++) this.fx.push({ x: e.x, y: 0.8, z: e.z, vx: (Math.random() - 0.5) * 5, vy: 2 + Math.random() * 4, vz: (Math.random() - 0.5) * 5, t: 0, c: e.k.color });
        if (e.kind === 'boss') { sfx('win'); vibrate([40, 30, 80]); UI.toast('Warlord defeated!'); } else if (Math.random() < 0.35) sfx('pop');
      }
    }

    updateHeroAttack(dt) {
      const H = this.hero;
      H.swingT -= dt;
      if (H.deadT > 0 || H.swingT > 0) return;
      const reach = 2.3;
      const near = this.enemies.filter((e) => !e.dead && Math.hypot(e.x - H.x, e.z - H.z) < reach + e.k.r);
      if (!near.length) return;
      H.swingT = 0.5;
      const dmg = 2.6 * (1 + 0.25 * H.lvl);
      for (const e of near) this.damage(e, dmg);
      this.slashT = 0.2;
      const t = near[0];
      this.heroMesh.rotation.y = Math.atan2(t.x - H.x, t.z - H.z);
      sfx('hit');
    }

    updateSoldiers(dt) {
      const pad = this.pads.find((p) => p.def.type === 'barracks' && p.lvl > 0);
      if (!pad) return;
      const want = this.bonus.soldiers + pad.lvl - 1;
      const rally = pad.rally || (pad.rally = (() => { const q = distToPath(pad.def.x, pad.def.z); return pathAt(q.s); })());
      pad.respawnT = (pad.respawnT || 0) - dt;
      if (this.soldiers.filter((s) => s.hp > 0).length < want && pad.respawnT <= 0) {
        pad.respawnT = 6;
        this.soldiers = this.soldiers.filter((s) => s.hp > 0);
        this.soldiers.push({ x: pad.def.x, z: pad.def.z, hp: 40 + pad.lvl * 25, max: 40 + pad.lvl * 25, slot: this.soldiers.length, atkT: 0, phase: 0 });
      }
      for (const s of this.soldiers) {
        if (s.hp <= 0) continue;
        const home = { x: rally.x + ((s.slot % 3) - 1) * 0.9, z: rally.z + (Math.floor(s.slot / 3) - 0.5) * 0.9 };
        let target = null, bd = 4.5;
        for (const e of this.enemies) {
          const d = Math.hypot(e.x - home.x, e.z - home.z);
          if (!e.dead && d < bd) { bd = d; target = e; }
        }
        const goal = target || home;
        const dx = goal.x - s.x, dz = goal.z - s.z, d = Math.hypot(dx, dz);
        s.moving = d > (target ? 0.8 + target.k.r : 0.2);
        if (s.moving) { const st = Math.min(d, 3.8 * dt); s.x += (dx / d) * st; s.z += (dz / d) * st; s.phase += dt * 12; }
        s.atkT -= dt;
        if (target && !s.moving && s.atkT <= 0) { s.atkT = 0.6; this.damage(target, 1.6 + pad.lvl * 0.8); }
      }
    }

    updateTowers(dt) {
      for (const pad of this.pads) {
        const t = pad.tower;
        if (!t) continue;
        const def = TYPES[pad.def.type];
        t.cd -= dt;
        // aim at the enemy closest to the Town Hall inside range
        let target = null, bs = -1;
        for (const e of this.enemies) {
          if (e.dead || e.s <= bs) continue;
          if (Math.hypot(e.x - pad.def.x, e.z - pad.def.z) <= def.range + pad.lvl * 0.5) { bs = e.s; target = e; }
        }
        if (!target) continue;
        if (t.head) t.head.rotation.y = Math.atan2(target.x - pad.def.x, target.z - pad.def.z);
        if (t.cd <= 0) {
          const rate = def.rate * (pad.def.type === 'archer' ? this.bonus.archerRate : 1);
          t.cd = 1 / rate;
          this.projectiles.push({ type: pad.def.type, x: pad.def.x, y: t.top, z: pad.def.z, target, dmg: def.dmg * (1 + (pad.lvl - 1) * 0.8), speed: pad.def.type === 'cannon' ? 14 : 22 });
          if (Math.random() < 0.4) sfx('tap');
        }
      }
    }

    updateProjectiles(dt) {
      for (const p of this.projectiles) {
        const t = p.target;
        const tx = t.x, tz = t.z, ty = 0.8 * t.k.scale;
        const dx = tx - p.x, dy = ty - p.y, dz = tz - p.z, d = Math.hypot(dx, dy, dz);
        if (d < 0.5 || t.dead) {
          p.done = true;
          if (!t.dead || p.type === 'cannon') {
            if (p.type === 'cannon') {
              for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - tx, e.z - tz) < TYPES.cannon.splash) this.damage(e, p.dmg);
              for (let i = 0; i < 6; i++) this.fx.push({ x: tx, y: 0.5, z: tz, vx: (Math.random() - 0.5) * 7, vy: 3 + Math.random() * 3, vz: (Math.random() - 0.5) * 7, t: 0, c: '#ffb03a' });
            } else {
              this.damage(t, p.dmg);
              if (p.type === 'mage') t.slow = TYPES.mage.slow;
            }
          }
          continue;
        }
        const st = Math.min(d, p.speed * dt);
        p.x += (dx / d) * st; p.y += (dy / d) * st; p.z += (dz / d) * st;
        p.ry = Math.atan2(dx, dz);
      }
      this.projectiles = this.projectiles.filter((p) => !p.done);
    }

    updateCoins(dt) {
      const H = this.hero;
      for (const c of this.coins) {
        c.t += dt;
        if (c.y > 0.12 || c.vy > 0) {
          c.vy -= 16 * dt; c.x += c.vx * dt; c.z += c.vz * dt; c.y += c.vy * dt;
          if (c.y < 0.12) { c.y = 0.12; c.vy = 0; c.vx = c.vz = 0; }
        }
        const d = Math.hypot(H.x - c.x, H.z - c.z);
        // magnet near the hero; stragglers fly home by themselves after a while
        if (H.deadT <= 0 && (d < 3.6 || c.t > 14) && c.t > 0.4) {
          const sp = (c.t > 14 ? 12 : 14) * dt;
          c.x += ((H.x - c.x) / (d || 1)) * Math.min(d, sp);
          c.z += ((H.z - c.z) / (d || 1)) * Math.min(d, sp);
          if (d < 0.7) { c.got = true; this.coinsHave++; if (Math.random() < 0.3) sfx('coin'); }
        }
      }
      this.coins = this.coins.filter((c) => !c.got);
    }

    // ---------------------------------------------------------------- pads
    padUnlocked(def) { return !def.town || GH.Town.lv(def.town) > 0; }
    padMax(def) {
      if (def.type === 'hero') return 10;
      if (def.type === 'repair') return Infinity;
      return this.bonus.maxTower;
    }
    padCost(pad) { return TYPES[pad.def.type].cost(pad.lvl); }

    updatePads(dt) {
      const H = this.hero;
      this.padT -= dt;
      for (const pad of this.pads) {
        const def = pad.def;
        const unlocked = this.padUnlocked(def);
        const maxed = pad.lvl >= this.padMax(def);
        const isRepair = def.type === 'repair';
        const show = !maxed && !(isRepair && this.hall.hp >= this.hall.max - 1);
        pad.tile.visible = show;
        if (!show) continue;
        const cost = this.padCost(pad);
        const on = H.deadT <= 0 && Math.hypot(H.x - def.x, H.z - def.z) < 1.4;
        if (on && unlocked && this.coinsHave > 0 && this.padT <= 0) {
          this.padT = 0.04;
          const chunk = Math.min(this.coinsHave, Math.max(1, Math.ceil(cost / 25)), cost - pad.paid);
          this.coinsHave -= chunk;
          pad.paid += chunk;
          if (pad.paid >= cost) this.complete(pad);
        }
        const left = cost - pad.paid;
        const T = TYPES[def.type];
        const label = !unlocked ? `Needs ${TOWN_NAMES[def.town]}`
          : def.type === 'hero' ? `Hero Lv ${pad.lvl + 1}`
            : isRepair ? 'Repair hall' : pad.lvl ? `${T.name} Lv ${pad.lvl + 1}` : T.name;
        const key = `${unlocked}|${left}|${label}`;
        if (key !== pad.key) { pad.key = key; this.drawPad(pad, T.icon, label, unlocked ? left : null, 1 - left / cost); }
      }
    }

    drawPad(pad, icon, label, price, prog) {
      const { ctx, tex } = pad.tx;
      ctx.clearRect(0, 0, 256, 256);
      const locked = price == null;
      ctx.fillStyle = locked ? 'rgba(40,40,50,.35)' : 'rgba(30,60,20,.25)';
      GH.roundRect(ctx, 14, 14, 228, 228, 30); ctx.fill();
      if (prog > 0 && !locked) {
        ctx.save(); GH.roundRect(ctx, 14, 14, 228, 228, 30); ctx.clip();
        ctx.fillStyle = 'rgba(255,215,80,.55)'; ctx.fillRect(14, 242 - 228 * prog, 228, 228 * prog); ctx.restore();
      }
      ctx.setLineDash([28, 16]); ctx.lineWidth = 10; ctx.strokeStyle = locked ? 'rgba(255,255,255,.5)' : '#fff';
      GH.roundRect(ctx, 14, 14, 228, 228, 30); ctx.stroke(); ctx.setLineDash([]);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '70px system-ui, sans-serif';
      ctx.globalAlpha = locked ? 0.5 : 1;
      ctx.fillText(locked ? '🔒' : icon, 128, 78);
      ctx.globalAlpha = 1;
      ctx.font = `900 ${locked ? 28 : 32}px system-ui, sans-serif`;
      ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.fillStyle = '#fff';
      ctx.strokeText(label, 128, 148, 216); ctx.fillText(label, 128, 148, 216);
      if (!locked) {
        ctx.font = '900 54px system-ui, sans-serif';
        ctx.lineWidth = 9;
        ctx.strokeText(`🪙${fmt(price)}`, 128, 204); ctx.fillText(`🪙${fmt(price)}`, 128, 204);
      }
      tex.needsUpdate = true;
    }

    complete(pad) {
      const def = pad.def;
      pad.paid = 0;
      this.padT = 0.4;
      sfx('level'); vibrate([20, 30, 20]);
      if (def.type === 'repair') { this.hall.hp = Math.min(this.hall.max, this.hall.hp + this.hall.max * 0.35); UI.toast('Town Hall repaired'); return; }
      pad.lvl++;
      if (def.type === 'hero') { this.hero.lvl = pad.lvl; this.hero.max = 120 + pad.lvl * 25; this.hero.hp = this.hero.max; UI.toast(`Hero Lv ${pad.lvl + 1}: stronger swings!`); return; }
      if (def.type === 'barracks') { UI.toast('Soldiers are guarding the road!'); }
      this.buildTower(pad);
    }

    buildTower(pad) {
      const K = this.K, T = THREE, type = pad.def.type, l = pad.lvl;
      if (pad.tower) this.scene.remove(pad.tower.grp);
      const g = new T.Group();
      g.position.set(pad.def.x, 0, pad.def.z);
      const stone = K.lam('#b9b2a6'), wood = K.lam('#8a5a32'), roofC = ['#3a7bd5', '#2f9e5a', '#d4a017', '#c0392b'][l - 1];
      let top = 3, head = null;
      if (type === 'archer') {
        const h = 2.2 + l * 0.5;
        g.add(K.mesh(K.geo.cyl, stone, 0, h / 2, 0, 1.3, h, 1.3));
        g.add(K.box(1.8, 0.3, 1.8, wood, 0, h + 0.15, 0));
        g.add(K.mesh(new T.ConeGeometry(1.3, 1.1, 4), K.lam(roofC), 0, h + 1.5, 0));
        head = new T.Group(); head.position.y = h + 0.55;
        head.add(K.box(0.2, 0.2, 0.9, wood, 0, 0, 0), K.box(1, 0.08, 0.1, K.lam('#dfe6ef'), 0, 0.05, 0.3));
        g.add(head); top = h + 0.6;
      } else if (type === 'cannon') {
        g.add(K.mesh(K.geo.cyl, stone, 0, 0.6, 0, 2, 1.2, 2));
        head = new T.Group(); head.position.y = 1.5;
        const barrel = K.mesh(K.geo.cyl, K.lam('#2c2f3a'), 0, 0, 0.4, 0.55 + l * 0.08, 1.4, 0.55 + l * 0.08);
        barrel.rotation.x = Math.PI / 2 - 0.3;
        head.add(barrel, K.mesh(K.geo.sphere, K.lam('#3a3d48'), 0, 0, 0, 0.9, 0.9, 0.9));
        g.add(head); top = 1.8;
      } else if (type === 'mage') {
        const h = 2.6 + l * 0.5;
        g.add(K.mesh(K.geo.cyl, K.lam('#d0c8e0'), 0, h / 2, 0, 1.1, h, 1.1));
        g.add(K.mesh(new T.ConeGeometry(0.9, 1.3, 8), K.lam('#8e44ad'), 0, h + 0.65, 0));
        const orb = K.mesh(K.geo.sphere, K.basic('#d7a8ff'), 0, h + 1.7, 0, 0.6, 0.6, 0.6);
        g.add(orb); top = h + 1.7;
      } else if (type === 'barracks') {
        g.add(K.mesh(new T.ConeGeometry(1.5, 2, 4), K.lam('#c9d6e8'), 0, 1, 0));
        g.add(K.box(0.06, 2.6, 0.06, K.lam('#555'), 1, 1.3, 1), K.box(0.7, 0.4, 0.04, K.lam(roofC), 1.35, 2.3, 1));
        top = 2;
      }
      g.traverse((o) => { o.castShadow = true; });
      g.scale.setScalar(0.4);
      this.scene.add(g);
      pad.tower = { grp: g, head, top, cd: 0.3, grow: 0.4 };
    }

    // ---------------------------------------------------------------- end of run
    over() {
      this.state = 'over';
      const cleared = Math.max(0, this.wave - 1);
      const newBest = cleared > this.best;
      if (newBest) { this.best = cleared; Save.data.best.kingdom = cleared; Save.save(); }
      const chest = cleared >= 10 ? 'gold' : cleared >= 6 ? 'silver' : cleared >= 3 ? 'wood' : null;
      this.api.runOver({
        title: newBest ? 'New record!' : 'The town fell',
        stats: [['Waves cleared', cleared], ['Best', this.best], ['Enemies', fmt(this.kills)], ['Hero level', this.hero.lvl + 1]],
        rewards: {
          coins: Math.round((cleared * 30 + this.kills * 1.2) * GH.Town.bonus.goldMult()),
          troops: Math.floor(this.kills / 4),
          food: cleared * 12, // loot carried off the battlefield
        },
        chest,
        canRevive: !this.revived,
      });
    }

    revive() {
      this.revived = true;
      this.hall.hp = this.hall.max * 0.6;
      for (const e of this.enemies) if (e.s > PATH_LEN - 20 && e.kind !== 'boss') { e.dead = true; if (e.bar) e.bar.remove(); }
      this.enemies = this.enemies.filter((e) => !e.dead);
      this.state = this.queue.length || this.enemies.length ? 'wave' : 'prep';
      this.prepT = 6;
      sfx('level');
    }

    // ---------------------------------------------------------------- render
    render3D(dt) {
      const d = this.dummy, H = this.hero;
      // hero
      this.heroMesh.visible = H.deadT <= 0;
      this.heroMesh.position.set(H.x, 0, H.z);
      this.K.animLegs(this.heroMesh, this.time * 14, this.heroMoving);
      this.slashT = Math.max(0, (this.slashT || 0) - dt);
      this.sword.rotation.x = this.slashT > 0 ? -1.6 + (0.2 - this.slashT) * 14 : -0.3;
      this.slash.position.set(H.x, 0.9, H.z);
      this.slash.rotation.z = this.time * 18;
      this.slash.material.opacity = this.slashT * 3;
      this.heroBar.show(H.deadT <= 0 && H.hp < H.max);
      this.heroBar.set(H.x, 2.9, H.z, H.hp / H.max);

      // enemies
      let n = 0;
      for (const e of this.enemies) {
        const s = e.k.scale;
        const bob = Math.abs(Math.sin(e.phase)) * 0.1 * s;
        d.rotation.set(e.attacking ? Math.sin(e.phase) * 0.25 : 0, e.dir || 0, 0);
        d.scale.setScalar(s * (e.hitT > 0 ? 1.12 : 1));
        d.position.set(e.x, 0.55 * s + bob, e.z); d.updateMatrix(); this.enBody.setMatrixAt(n, d.matrix);
        this.enBody.setColorAt(n, this.col.set(e.hitT > 0 ? '#ffffff' : e.slow > 0 ? '#b58fe0' : e.k.color));
        d.position.set(e.x, 1.08 * s + bob, e.z); d.updateMatrix(); this.enHead.setMatrixAt(n, d.matrix);
        this.enHead.setColorAt(n, this.col.set(e.k.head));
        d.position.set(e.x, 1.33 * s + bob, e.z); d.updateMatrix(); this.enHelm.setMatrixAt(n, d.matrix);
        if (e.bar) e.bar.set(e.x, 1.9 * s + 0.4, e.z, Math.max(0, e.hp / e.max), 0.7 * s + 0.6);
        n++;
      }
      for (const m of [this.enBody, this.enHead, this.enHelm]) { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }

      // soldiers
      let sn = 0;
      for (const s of this.soldiers) {
        if (s.hp <= 0) continue;
        const bob = s.moving ? Math.abs(Math.sin(s.phase)) * 0.1 : 0;
        d.rotation.set(0, 0, 0); d.scale.setScalar(1.1);
        d.position.set(s.x, 0.6 + bob, s.z); d.updateMatrix(); this.soBody.setMatrixAt(sn, d.matrix);
        d.position.set(s.x, 1.15 + bob, s.z); d.updateMatrix(); this.soHead.setMatrixAt(sn, d.matrix);
        sn++;
      }
      for (const m of [this.soBody, this.soHead]) { m.count = sn; m.instanceMatrix.needsUpdate = true; }

      // projectiles
      this.projectiles.forEach((p, i) => {
        d.rotation.set(0, p.ry || 0, 0);
        d.scale.set(p.type === 'arrow' || p.type === 'archer' ? 1 : 2.4, p.type === 'archer' ? 1 : 2.4, p.type === 'archer' ? 1 : 0.35);
        d.position.set(p.x, p.y, p.z); d.updateMatrix(); this.shots.setMatrixAt(i, d.matrix);
      });
      this.shots.count = Math.min(160, this.projectiles.length); this.shots.instanceMatrix.needsUpdate = true;

      // coins + debris
      this.coins.forEach((c, i) => {
        if (i >= 300) return;
        d.rotation.set(Math.PI / 2, 0, this.time * 4 + i); d.scale.setScalar(1);
        d.position.set(c.x, c.y + (c.vy === 0 ? 0.15 + Math.sin(this.time * 4 + i) * 0.08 : 0), c.z); d.updateMatrix(); this.coinMesh.setMatrixAt(i, d.matrix);
      });
      this.coinMesh.count = Math.min(300, this.coins.length); this.coinMesh.instanceMatrix.needsUpdate = true;
      this.fx.forEach((f, i) => {
        if (i >= 160) return;
        d.rotation.set(f.t * 8, f.t * 5, 0); d.scale.setScalar(1 - f.t);
        d.position.set(f.x, Math.max(0.1, f.y), f.z); d.updateMatrix(); this.fxMesh.setMatrixAt(i, d.matrix);
        this.fxMesh.setColorAt(i, this.col.set(f.c));
      });
      this.fxMesh.count = Math.min(160, this.fx.length); this.fxMesh.instanceMatrix.needsUpdate = true;
      if (this.fxMesh.instanceColor) this.fxMesh.instanceColor.needsUpdate = true;

      // towers pop up when built
      for (const pad of this.pads) if (pad.tower && pad.tower.grow < 1) { pad.tower.grow = Math.min(1, pad.tower.grow + dt * 3); pad.tower.grp.scale.setScalar(pad.tower.grow); }

      // guide arrow: cheapest affordable pad, else nothing
      const afford = this.pads.filter((p) => p.tile.visible && this.padUnlocked(p.def) && p.def.type !== 'repair' && this.coinsHave >= this.padCost(p) - p.paid)
        .sort((a, b) => this.padCost(a) - this.padCost(b))[0];
      const near = afford && Math.hypot(afford.def.x - H.x, afford.def.z - H.z) < 3;
      this.arrow.visible = !!afford && !near;
      if (afford) this.arrow.position.set(afford.def.x, 3.2 + Math.sin(this.time * 5) * 0.3, afford.def.z);
      this.arrow.rotation.y += dt * 3;

      // camera
      const want = new THREE.Vector3(H.x, 0, H.z + 1.5).add(this.camOffset);
      this.camera.position.lerp(want, Math.min(1, dt * 5));
      this.camera.lookAt(this.camera.position.clone().sub(this.camOffset));
      this.sun.position.set(H.x + 10, 26, H.z + 10);
      this.sun.target.position.set(H.x, 0, H.z);

      // HUD
      this.coinsShown += (this.coinsHave - this.coinsShown) * Math.min(1, dt * 10);
      const c = fmt(Math.round(this.coinsShown));
      if (c !== this.uiC) { this.uiC = c; this.ui.coins.textContent = c; }
      const w = this.wave ? `Wave ${this.wave}` : 'Get ready';
      if (w !== this.uiW) { this.uiW = w; this.ui.wave.textContent = w; }
      const sub = this.state === 'prep' ? `next wave in ${Math.ceil(this.prepT)}s` : `${this.enemies.length + this.queue.length} enemies left`;
      if (sub !== this.uiS) { this.uiS = sub; this.ui.sub.textContent = sub; }
      this.ui.hallBar.style.width = Math.max(0, (this.hall.hp / this.hall.max) * 100) + '%';
      this.updateEdgeMarker();
    }

    /** Arrow on the screen edge pointing at the enemy closest to the Town Hall when it is off-screen. */
    updateEdgeMarker() {
      let lead = null;
      for (const e of this.enemies) if (!lead || e.s > lead.s) lead = e;
      const ui = this.ui;
      if (!lead) { ui.edge.hidden = true; return; }
      const el = this.ly.el, r = el.getBoundingClientRect();
      const v = new THREE.Vector3(lead.x, 1, lead.z).project(this.camera);
      let x = ((v.x + 1) / 2) * r.width, y = ((1 - v.y) / 2) * r.height;
      if (v.z > 1) { x = r.width - x; y = r.height - y; } // behind the camera: mirror
      const m = 44, top = 100, bottom = r.height - 60;
      const onScreen = v.z <= 1 && x > m && x < r.width - m && y > top && y < bottom;
      ui.edge.hidden = onScreen;
      if (onScreen) return;
      const cx = r.width / 2, cy = r.height / 2;
      const ang = Math.atan2(y - cy, x - cx);
      const px = clamp(x, m, r.width - m), py = clamp(y, top, bottom);
      ui.edge.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%)`;
      ui.edgeArrow.style.transform = `rotate(${ang + Math.PI / 2}rad)`;
      const txt = `${this.enemies.length}`;
      if (ui.edgeText.textContent !== txt) ui.edgeText.textContent = txt;
    }

    draw() { this.renderer.render(this.scene, this.camera); }

    destroy() {
      window.removeEventListener('resize', this.onResize);
      window.removeEventListener('keydown', this.h.key);
      window.removeEventListener('keyup', this.h.key);
      this.scene.traverse((o) => { if (o.material && o.material.map) o.material.map.dispose(); });
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.ly.destroy();
      this.ui = null;
    }
  }

  GH.Games.kingdom = {
    id: 'kingdom',
    name: 'Kingdom Defense',
    tagline: 'Defend your own town from the horde.',
    icon: '👑',
    colors: ['#2f7d3a', '#8fd16a'],
    create: (opts) => new KingdomDefense(opts),
    levelLabel: () => `Best: wave ${(Save.data.best && Save.data.best.kingdom) || 0}`,
  };
})();

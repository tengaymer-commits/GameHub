/*
 * FROST SURVIVAL – 3D idle-arcade camp (Whiteout Survival / "Frozen City" style ads).
 * Walk with the joystick. Outside the fence your axes spin and cut down beasts,
 * meat stacks on your back. Drop it at the grill, sell steaks to the queue at the
 * counter, pick up the cash and spend it on build pads. Buy "Next camp" to clear the level.
 */
(function () {
  'use strict';
  const { Save, UI, sfx, vibrate, fmt, clamp, roundRect } = GH;

  const CAMP = { x0: -10, x1: 10, z0: -2, z1: 16 };
  const GATE = 2.6;
  const STACK_H = 0.15;
  const PLAYER_R = 0.4;
  const GRILL = { x: 0, z: 5.5 };
  const GRILL_IN = { x: 0, z: 2.2 };
  const CASHIER = { x: -8.4, z: 8 };
  const CASHPAD = { x: -7.2, z: 12 };
  const QUEUE = { x: -11.6, z: 8, gap: 1.25 };
  const WALLS = [
    { x0: -10.3, x1: -GATE, z0: -2.3, z1: -1.7 },
    { x0: GATE, x1: 10.3, z0: -2.3, z1: -1.7 },
    { x0: -10.3, x1: 10.3, z0: 15.7, z1: 16.3 },
    { x0: 9.7, x1: 10.3, z0: -2.3, z1: 16.3 },
    { x0: -10.3, x1: -9.7, z0: -2.3, z1: 16.3 },
    { x0: -10.7, x1: -9.3, z0: 6.3, z1: 9.7 }, // counter
  ];

  // Build pads. cost(k) gets multiplied by the level price factor.
  const PADS = [
    { id: 'cashier', icon: '🧑‍💼', label: 'Cashier', x: -7.2, z: 4.6, cost: () => 30 },
    { id: 'axe', icon: '🪓', label: '+1 Axe', x: 4.5, z: 4.5, cost: (k) => 25 + k * 30, max: 5 },
    { id: 'pack', icon: '🎒', label: '+5 Carry', x: 4.5, z: 8.2, cost: (k) => 20 + k * 25, max: 5 },
    { id: 'tower1', icon: '🏹', label: 'Crossbow', x: -5, z: 0.4, cost: () => 50, requires: 'cashier', tower: { x: -5, z: -3.4 } },
    { id: 'grill', icon: '🔥', label: 'Faster grill', x: 0, z: 9.6, cost: (k) => 40 + k * 40, max: 4, requires: 'cashier' },
    { id: 'tower2', icon: '🏹', label: 'Crossbow', x: 5, z: 0.4, cost: () => 110, requires: 'tower1', tower: { x: 5, z: -3.4 } },
    { id: 'next', icon: '🏕️', label: 'Next camp', x: 5, z: 12.6, cost: () => 200, requires: 'tower1' },
  ];

  const BEASTS = {
    wolf: { hp: 4, spd: 2.4, chase: 4.4, dps: 7, r: 0.55, reach: 1.3, meat: 2, scale: 0.85, color: '#b9c4d2' },
    bear: { hp: 14, spd: 1.6, chase: 3.3, dps: 14, r: 0.95, reach: 1.9, meat: 5, scale: 1.35, color: '#f3f6fa' },
  };

  // ------------------------------------------------------------------ shared assets
  let A = null;
  function assets() {
    if (A) return A;
    const T = THREE;
    const lam = (c) => new T.MeshLambertMaterial({ color: c });
    A = {
      m: {
        raw: lam('#e2483a'), cooked: lam('#d8702c'), cash: lam('#3cb94a'), cashDark: lam('#2a8a35'),
        wood: lam('#a86f3e'), woodDark: lam('#6e4424'), stone: lam('#8d909b'), dark: lam('#3a3d48'),
        snow: lam('#dfe8f2'), camp: lam('#d9a066'), pine: lam('#3f78a3'), pineDark: lam('#2f5f86'),
        white: lam('#ffffff'), skin: lam('#ffd2a6'), black: lam('#1a1a1a'), red: lam('#ff2a3a'),
        steel: lam('#d5dde6'), handle: lam('#7a4a22'), blue: lam('#3a7bd5'), blueDark: lam('#24549c'),
        orange: lam('#f07a2e'), orangeDark: lam('#c95a1a'), teal: lam('#2aa198'), cream: lam('#f1e6d2'),
        fire: new T.MeshBasicMaterial({ color: '#ffb02e' }), fireCore: new T.MeshBasicMaterial({ color: '#fff1a8' }),
        arrow: new T.MeshBasicMaterial({ color: '#ffd23a' }),
      },
      g: {
        meat: new T.BoxGeometry(0.56, 0.13, 0.4), cash: new T.BoxGeometry(0.56, 0.09, 0.3),
        body: new T.CapsuleGeometry(0.32, 0.45, 4, 10), head: new T.SphereGeometry(0.27, 14, 10),
        hood: new T.SphereGeometry(0.31, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
        leg: new T.BoxGeometry(0.16, 0.36, 0.18), eye: new T.BoxGeometry(0.06, 0.07, 0.03),
        box: new T.BoxGeometry(1, 1, 1), cyl: new T.CylinderGeometry(0.5, 0.5, 1, 10),
        bolt: new T.CylinderGeometry(0.04, 0.04, 0.7, 5),
      },
    };
    return A;
  }

  function mesh(geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    return m;
  }

  function person(bodyMat, hoodMat) {
    const { g, m } = assets();
    const grp = new THREE.Group();
    const legL = mesh(g.leg, m.dark, -0.14, 0.18, 0);
    const legR = mesh(g.leg, m.dark, 0.14, 0.18, 0);
    grp.add(legL, legR);
    grp.add(mesh(g.body, bodyMat, 0, 0.72, 0));
    grp.add(mesh(g.head, m.skin, 0, 1.33, 0));
    const hood = mesh(g.hood, hoodMat, 0, 1.36, -0.03);
    hood.rotation.x = -0.45;
    grp.add(hood);
    grp.add(mesh(g.eye, m.black, -0.09, 1.35, 0.25), mesh(g.eye, m.black, 0.09, 1.35, 0.25));
    grp.userData.legs = [legL, legR];
    return grp;
  }

  function animLegs(grp, phase, moving) {
    const [l, r] = grp.userData.legs;
    const a = moving ? Math.sin(phase) * 0.6 : 0;
    l.rotation.x = a; r.rotation.x = -a;
  }

  function beastMesh(kind) {
    const { g, m } = assets();
    const def = BEASTS[kind];
    const s = def.scale;
    const mat = new THREE.MeshLambertMaterial({ color: def.color });
    const grp = new THREE.Group();
    const body = new THREE.Group();
    body.add(mesh(g.box, mat, 0, 0.75 * s, 0, 0.95 * s, 0.75 * s, 1.5 * s));
    body.add(mesh(g.box, mat, 0, 0.95 * s, 0.9 * s, 0.7 * s, 0.6 * s, 0.6 * s));
    body.add(mesh(g.box, mat, 0, 0.85 * s, 1.27 * s, 0.35 * s, 0.28 * s, 0.3 * s));
    body.add(mesh(g.box, m.black, 0, 0.9 * s, 1.43 * s, 0.14 * s, 0.1 * s, 0.05 * s));
    body.add(mesh(g.box, m.red, -0.17 * s, 1.08 * s, 1.21 * s, 0.1 * s, 0.08 * s, 0.03 * s));
    body.add(mesh(g.box, m.red, 0.17 * s, 1.08 * s, 1.21 * s, 0.1 * s, 0.08 * s, 0.03 * s));
    const ear = kind === 'wolf' ? [0.12, 0.25] : [0.16, 0.14];
    body.add(mesh(g.box, mat, -0.24 * s, 1.3 * s, 0.85 * s, ear[0] * s, ear[1] * s, 0.08 * s));
    body.add(mesh(g.box, mat, 0.24 * s, 1.3 * s, 0.85 * s, ear[0] * s, ear[1] * s, 0.08 * s));
    const legs = [];
    for (const [lx, lz] of [[-0.3, 0.5], [0.3, 0.5], [-0.3, -0.5], [0.3, -0.5]]) {
      const leg = mesh(g.box, mat, lx * s, 0.2 * s, lz * s, 0.25 * s, 0.45 * s, 0.25 * s);
      legs.push(leg);
      body.add(leg);
    }
    grp.add(body);
    // HP bar (sprites always face the camera)
    const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#222', depthTest: false }));
    const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#ff3b3b', depthTest: false }));
    bg.scale.set(1.3, 0.16, 1); fg.scale.set(1.2, 0.1, 1);
    bg.center.set(0.5, 0.5); fg.center.set(0, 0.5);
    bg.position.set(0, 1.9 * s, 0); fg.position.set(-0.6, 1.9 * s, 0);
    bg.renderOrder = fg.renderOrder = 10;
    bg.visible = fg.visible = false;
    grp.add(bg, fg);
    grp.userData = { body, legs, bg, fg, mat };
    return grp;
  }

  function axeMesh() {
    const { g, m } = assets();
    const grp = new THREE.Group();
    grp.add(mesh(g.box, m.handle, 0, 0, 0, 0.09, 0.09, 0.9));
    grp.add(mesh(g.box, m.steel, 0.2, 0, 0.38, 0.4, 0.06, 0.3));
    return grp;
  }

  function textSprite(draw, w = 128, h = 64, sx = 1.2, sy = 0.6) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sp.scale.set(sx, sy, 1);
    sp.renderOrder = 12;
    sp.userData.redraw = (...args) => { const ctx = c.getContext('2d'); ctx.clearRect(0, 0, w, h); draw(ctx, w, h, ...args); tex.needsUpdate = true; };
    return sp;
  }

  function bubble(ctx, w, h, text) {
    ctx.fillStyle = '#fff';
    roundRect(ctx, 4, 4, w - 8, h - 14, 18); ctx.fill();
    ctx.beginPath(); ctx.moveTo(w / 2 - 8, h - 11); ctx.lineTo(w / 2, h - 2); ctx.lineTo(w / 2 + 8, h - 11); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.font = '900 30px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, (h - 10) / 2 + 2);
  }

  function floorTile(draw, size) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    p.rotation.x = -Math.PI / 2;
    p.position.y = 0.03;
    p.userData.redraw = (...args) => { const ctx = c.getContext('2d'); ctx.clearRect(0, 0, 256, 256); draw(ctx, ...args); tex.needsUpdate = true; };
    return p;
  }

  function drawPad(ctx, icon, label, price, progress) {
    ctx.fillStyle = 'rgba(60,40,20,.25)';
    roundRect(ctx, 14, 14, 228, 228, 30); ctx.fill();
    if (progress > 0) {
      ctx.save();
      roundRect(ctx, 14, 14, 228, 228, 30); ctx.clip();
      ctx.fillStyle = 'rgba(80,230,120,.55)';
      ctx.fillRect(14, 242 - 228 * progress, 228, 228 * progress);
      ctx.restore();
    }
    ctx.setLineDash([28, 16]);
    ctx.lineWidth = 10; ctx.strokeStyle = '#fff';
    roundRect(ctx, 14, 14, 228, 228, 30); ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '72px system-ui, sans-serif';
    ctx.fillText(icon, 128, 78);
    ctx.fillStyle = '#fff';
    ctx.font = '900 34px system-ui, sans-serif';
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(0,0,0,.4)';
    ctx.strokeText(label, 128, 146, 210);
    ctx.fillText(label, 128, 146, 210);
    if (price != null) {
      ctx.font = '900 56px system-ui, sans-serif';
      ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(0,0,0,.45)';
      ctx.strokeText(price, 128, 204); ctx.fillText(price, 128, 204);
    }
  }

  const dist2 = (a, x, z) => (a.x - x) ** 2 + (a.z - z) ** 2;
  const inCamp = (p) => p.x > CAMP.x0 && p.x < CAMP.x1 && p.z > CAMP.z0 && p.z < CAMP.z1;

  // ------------------------------------------------------------------ game
  class FrostSurvival {
    constructor({ api, level, save }) {
      this.api = api;
      this.level = level;
      this.title = 'Frost Survival';
      const L = level;
      this.hpScale = 1 + (L - 1) * 0.35;
      this.priceMult = 1 + (L - 1) * 0.5;
      this.steakPrice = 6 + (L - 1) * 2;
      this.maxBeasts = Math.min(10, 4 + L);
      this.dmgMult = 1 + (save.upgrades.frostDmg || 0) * 0.2;
      this.maxHp = 100 + (save.upgrades.frostWall || 0) * 25;

      this.load();
      this.buildScene();
      this.bindInput();
      api.setHudButtons([{ label: '💵×2', cls: 'gold ad', onClick: () => this.boost() }]);
      this.time = 0;
      this.saveT = 0;
    }

    // ---------------------------------------------------------------- state
    load() {
      const s = Save.data.frostCamp;
      const fresh = { level: this.level, cash: 0, built: {}, paid: {}, raw: 0, cooked: 0, pile: [] };
      this.st = s && s.level === this.level ? Object.assign(fresh, s) : fresh;
    }

    persist() {
      Save.data.frostCamp = this.st;
      try { localStorage.setItem('gamehub_save_v1', JSON.stringify(Save.data)); } catch (e) { /* ignore */ }
    }

    lvl(id) { return this.st.built[id] || 0; }
    padCost(p) { return Math.round((p.cost(this.lvl(p.id)) * this.priceMult) / 5) * 5; }
    padVisible(p) {
      if (p.requires && !this.lvl(p.requires)) return false;
      return this.lvl(p.id) < (p.max || 1);
    }
    get axes() { return 2 + this.lvl('axe'); }
    get cap() { return 8 + this.lvl('pack') * 5; }
    get cookTime() { return 1.1 / (1 + this.lvl('grill') * 0.4); }

    // ---------------------------------------------------------------- scene
    buildScene() {
      const T = THREE;
      const { g, m } = assets();
      this.layer = document.createElement('div');
      this.layer.className = 'fs-layer';
      this.layer.innerHTML = `
        <div class="fs-goal"></div>
        <div class="fs-cash"><span>💵</span><b>0</b></div>
        <div class="fs-boost" hidden></div>
        <div class="fs-joy idle"><i></i></div>`;
      const wrap = document.getElementById('canvas-wrap');
      wrap.appendChild(this.layer);
      this.hiddenCanvas = document.getElementById('game-canvas');
      this.hiddenCanvas.style.visibility = 'hidden';
      this.ui = {
        goal: this.layer.querySelector('.fs-goal'),
        cash: this.layer.querySelector('.fs-cash b'),
        boost: this.layer.querySelector('.fs-boost'),
        joy: this.layer.querySelector('.fs-joy'),
        knob: this.layer.querySelector('.fs-joy i'),
      };

      const r = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.shadowMap.enabled = true;
      r.shadowMap.type = T.PCFSoftShadowMap;
      this.layer.prepend(r.domElement);
      this.renderer = r;

      const scene = new T.Scene();
      scene.background = new T.Color('#d3dfec');
      scene.fog = new T.Fog('#d3dfec', 28, 60);
      this.scene = scene;
      this.camera = new T.PerspectiveCamera(50, 1, 0.5, 150);
      this.camOffset = new T.Vector3(0, 17, 12);

      scene.add(new T.HemisphereLight('#ffffff', '#9fb2c8', 1.7));
      const sun = new T.DirectionalLight('#fff4e6', 2.4);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 70 });
      sun.shadow.bias = -0.0008;
      scene.add(sun, sun.target);
      this.sun = sun;

      // ground
      const ground = new T.Mesh(new T.PlaneGeometry(240, 240), m.snow);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);
      const floor = new T.Mesh(new T.PlaneGeometry(CAMP.x1 - CAMP.x0, CAMP.z1 - CAMP.z0), m.camp);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set((CAMP.x0 + CAMP.x1) / 2, 0.01, (CAMP.z0 + CAMP.z1) / 2);
      floor.receiveShadow = true;
      scene.add(floor);

      this.buildTrees();
      this.buildFence();
      this.buildStations();

      // player
      this.player = person(m.blue, m.cream);
      this.player.position.set(0, 0, 10);
      this.backStack = new T.Group();
      this.player.add(this.backStack);
      this.backMeshes = [];
      scene.add(this.player);
      this.hp = this.maxHp;
      this.hurtT = 0;
      this.axeRing = new T.Group();
      this.axeMeshes = [];
      scene.add(this.axeRing);
      this.syncAxes();
      this.hpBar = new T.Group();
      const hbBg = new T.Sprite(new T.SpriteMaterial({ color: '#222', depthTest: false }));
      const hbFg = new T.Sprite(new T.SpriteMaterial({ color: '#4ade80', depthTest: false }));
      hbBg.scale.set(1.3, 0.16, 1); hbFg.scale.set(1.2, 0.1, 1); hbFg.center.set(0, 0.5);
      hbFg.position.x = -0.6; hbBg.renderOrder = hbFg.renderOrder = 10;
      this.hpBar.add(hbBg, hbFg);
      this.hpBar.userData.fg = hbFg;
      scene.add(this.hpBar);
      this.maxTag = textSprite((c, w, h) => bubble(c, w, h, 'MAX'), 128, 64, 1.1, 0.55);
      this.maxTag.userData.redraw();
      scene.add(this.maxTag);

      // guide arrow
      this.arrow = new T.Mesh(new T.ConeGeometry(0.45, 1, 10), m.arrow);
      this.arrow.rotation.x = Math.PI;
      scene.add(this.arrow);

      // snow
      const N = 500;
      const pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 40; pos[i * 3 + 1] = Math.random() * 20; pos[i * 3 + 2] = (Math.random() - 0.5) * 40; }
      const sg = new T.BufferGeometry();
      sg.setAttribute('position', new T.BufferAttribute(pos, 3));
      this.snow = new T.Points(sg, new T.PointsMaterial({ color: '#ffffff', size: 0.18, transparent: true, opacity: 0.9 }));
      scene.add(this.snow);

      this.beasts = [];
      this.drops = [];
      this.flyers = [];
      this.billQueue = [];
      this.bolts = [];
      this.customers = [];
      this.spawnT = 0.5;
      this.custT = 1;
      this.cookT = 0;
      this.dropT = this.sellT = this.cashT = this.padT = 0;
      this.carry = 0;
      this.cashShown = this.st.cash;
      this.boostT = 0;
      for (let i = 0; i < this.maxBeasts - 1; i++) this.spawnBeast(true);

      this.resize = this.resize.bind(this);
      window.addEventListener('resize', this.resize);
      this.resize();
      this.syncStations();
    }

    buildTrees() {
      const T = THREE;
      const { m } = assets();
      const spots = [];
      const rnd = GH.rng(4242);
      for (let i = 0; i < 900 && spots.length < 190; i++) {
        const x = (rnd() - 0.5) * 110, z = (rnd() - 0.5) * 110 - 8;
        const nearCamp = x > -16 && x < 16 && z > -6 && z < 34; // keep the camera's line of sight clear
        const hunting = x > -26 && x < 26 && z > -42 && z < -5;
        const street = x < -9 && x > -34 && z > 3 && z < 17;
        if (nearCamp || street) continue;
        if (hunting && rnd() > 0.06) continue;
        spots.push([x, z, 0.8 + rnd() * 0.6]);
      }
      const lower = new T.InstancedMesh(new T.ConeGeometry(1.4, 2.4, 7), m.pineDark, spots.length);
      const upper = new T.InstancedMesh(new T.ConeGeometry(1.0, 2.0, 7), m.pine, spots.length);
      const cap = new T.InstancedMesh(new T.ConeGeometry(0.55, 0.9, 7), m.white, spots.length);
      const o = new T.Object3D();
      spots.forEach(([x, z, s], i) => {
        o.scale.setScalar(s);
        o.position.set(x, 1.4 * s, z); o.updateMatrix(); lower.setMatrixAt(i, o.matrix);
        o.position.set(x, 2.8 * s, z); o.updateMatrix(); upper.setMatrixAt(i, o.matrix);
        o.position.set(x, 3.7 * s, z); o.updateMatrix(); cap.setMatrixAt(i, o.matrix);
      });
      for (const im of [lower, upper, cap]) { im.castShadow = true; this.scene.add(im); }
    }

    buildFence() {
      const T = THREE;
      const { m } = assets();
      const posts = [];
      const step = 0.55;
      for (let x = CAMP.x0; x <= CAMP.x1 + 0.01; x += step) {
        if (Math.abs(x) > GATE) posts.push([x, CAMP.z0]);
        posts.push([x, CAMP.z1]);
      }
      for (let z = CAMP.z0 + step; z < CAMP.z1; z += step) {
        if (z < 6.2 || z > 9.8) posts.push([CAMP.x0, z]);
        posts.push([CAMP.x1, z]);
      }
      const geo = new T.CylinderGeometry(0.2, 0.22, 1.5, 6);
      geo.translate(0, 0.75, 0);
      const tip = new T.ConeGeometry(0.2, 0.45, 6);
      tip.translate(0, 1.72, 0);
      const a = new T.InstancedMesh(geo, m.wood, posts.length);
      const b = new T.InstancedMesh(tip, m.cream, posts.length);
      const o = new T.Object3D();
      posts.forEach(([x, z], i) => {
        o.position.set(x, 0, z);
        o.scale.set(1, 0.85 + ((i * 37) % 10) / 40, 1);
        o.updateMatrix();
        a.setMatrixAt(i, o.matrix); b.setMatrixAt(i, o.matrix);
      });
      a.castShadow = b.castShadow = true;
      this.scene.add(a, b);
    }

    buildStations() {
      const T = THREE;
      const { g, m } = assets();
      const S = this.scene;
      // grill / furnace
      const grill = new T.Group();
      grill.position.set(GRILL.x, 0, GRILL.z);
      const ring = new T.Mesh(new T.TorusGeometry(1.05, 0.3, 6, 12), m.stone);
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.2; ring.castShadow = true;
      const pot = mesh(new T.CylinderGeometry(0.85, 0.65, 1.1, 12), m.dark, 0, 0.75, 0);
      const fire = mesh(new T.ConeGeometry(0.55, 1.1, 8), m.fire, 0, 1.6, 0);
      const core = mesh(new T.ConeGeometry(0.3, 0.7, 8), m.fireCore, 0, 1.5, 0);
      fire.castShadow = core.castShadow = false;
      grill.add(ring, pot, fire, core);
      S.add(grill);
      this.fire = fire; this.fireCore = core;
      this.fireLight = new T.PointLight('#ff9a3c', 6, 9);
      this.fireLight.position.set(GRILL.x, 2.2, GRILL.z);
      S.add(this.fireLight);
      this.rawGroup = new T.Group(); this.rawMeshes = [];
      this.rawGroup.position.set(GRILL.x + 1.7, 0, GRILL.z - 0.8);
      S.add(this.rawGroup);
      const dropPad = floorTile((c) => drawPad(c, '🥩', 'Drop meat', null, 0), 2);
      dropPad.position.set(GRILL_IN.x, 0.03, GRILL_IN.z);
      dropPad.userData.redraw();
      S.add(dropPad);

      // counter
      const counter = new T.Group();
      counter.position.set(-10, 0, 8);
      counter.add(mesh(g.box, m.wood, 0, 0.45, 0, 1.3, 0.9, 3.3));
      counter.add(mesh(g.box, m.woodDark, 0, 0.92, 0, 1.4, 0.06, 3.4));
      S.add(counter);
      this.cookedGroup = new T.Group(); this.cookedMeshes = [];
      this.cookedGroup.position.set(-10, 0.95, 8);
      S.add(this.cookedGroup);
      this.sellPad = floorTile((c) => drawPad(c, '💵', 'Sell here', null, 0), 1.7);
      this.sellPad.position.set(CASHIER.x, 0.03, CASHIER.z);
      this.sellPad.userData.redraw();
      S.add(this.sellPad);

      // cash pad
      const cp = new T.Mesh(new T.PlaneGeometry(2, 1.6), new T.MeshLambertMaterial({ color: '#b7e3b0' }));
      cp.rotation.x = -Math.PI / 2; cp.position.set(CASHPAD.x, 0.025, CASHPAD.z); cp.receiveShadow = true;
      S.add(cp);
      this.cashGroup = new T.Group(); this.cashMeshes = [];
      this.cashGroup.position.set(CASHPAD.x, 0.05, CASHPAD.z);
      S.add(this.cashGroup);

      // build pads
      this.pads = PADS.map((def) => {
        const tile = floorTile((c, ...a) => drawPad(c, ...a), 2.7);
        tile.position.set(def.x, 0.04, def.z);
        S.add(tile);
        return { def, tile, shownKey: '' };
      });

      this.worker = null;
      this.towers = [];
    }

    // Reflect saved/built state in the world.
    syncStations() {
      const T = THREE;
      const { m, g } = assets();
      if (this.lvl('cashier') && !this.worker) {
        this.worker = person(m.teal, m.cream);
        this.worker.position.set(CASHIER.x, 0, CASHIER.z);
        this.worker.rotation.y = -Math.PI / 2;
        this.scene.add(this.worker);
        this.sellPad.visible = false;
      }
      for (const def of PADS) {
        if (!def.tower || !this.lvl(def.id) || this.towers.some((t) => t.id === def.id)) continue;
        const grp = new T.Group();
        grp.position.set(def.tower.x, 0, def.tower.z);
        for (const [lx, lz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) grp.add(mesh(g.box, m.woodDark, lx, 1.3, lz, 0.2, 2.6, 0.2));
        grp.add(mesh(g.box, m.wood, 0, 2.65, 0, 1.7, 0.2, 1.7));
        const head = new T.Group();
        head.position.y = 3.05;
        head.add(mesh(g.box, m.woodDark, 0, 0, 0, 0.25, 0.25, 1.1));
        head.add(mesh(g.box, m.steel, 0, 0.05, 0.35, 1.3, 0.08, 0.12));
        grp.add(head);
        this.scene.add(grp);
        this.towers.push({ id: def.id, grp, head, x: def.tower.x, z: def.tower.z, cd: 0 });
      }
      this.syncAxes();
      this.syncStacks();
    }

    syncAxes() {
      while (this.axeMeshes.length < this.axes) {
        const a = axeMesh();
        this.axeRing.add(a);
        this.axeMeshes.push(a);
      }
      this.axeMeshes.forEach((a, i) => {
        const ang = (i / this.axeMeshes.length) * Math.PI * 2;
        a.position.set(Math.cos(ang) * 1.7, 0.9, Math.sin(ang) * 1.7);
        a.rotation.y = -ang;
      });
    }

    syncStack(arr, parent, count, mat, geo, place, maxVis = 60) {
      const n = Math.min(count, maxVis);
      while (arr.length < n) {
        const mm = new THREE.Mesh(geo, mat);
        mm.castShadow = true;
        place(arr.length, mm.position);
        parent.add(mm);
        arr.push(mm);
      }
      while (arr.length > n) parent.remove(arr.pop());
    }

    syncStacks() {
      const { m, g } = assets();
      this.syncStack(this.backMeshes, this.backStack, this.carry, m.raw, g.meat, (i, p) => p.set(0, 0.75 + i * STACK_H, -0.5), 40);
      this.syncStack(this.rawMeshes, this.rawGroup, this.st.raw, m.raw, g.meat, (i, p) => p.set((i % 2) * 0.62, 0.07 + Math.floor(i / 2) * STACK_H, 0));
      this.syncStack(this.cookedMeshes, this.cookedGroup, this.st.cooked, m.cooked, g.meat,
        (i, p) => { const k = i % 8; p.set(k < 4 ? -0.28 : 0.28, 0.07 + Math.floor(i / 8) * STACK_H, -1.2 + (k % 4) * 0.8); });
      this.syncStack(this.cashMeshes, this.cashGroup, this.st.pile.length, m.cash, g.cash,
        (i, p) => { const k = i % 6; p.set(-0.35 + (k % 2) * 0.7, 0.05 + Math.floor(i / 6) * 0.1, -0.45 + Math.floor(k / 2) * 0.45); });
    }

    // ---------------------------------------------------------------- input
    bindInput() {
      const j = (this.joy = { active: false, id: null, sx: 0, sy: 0, x: 0, y: 0 });
      this.keys = new Set();
      const R = 52;
      const setJoy = (x, y) => { this.ui.joy.style.left = x + 'px'; this.ui.joy.style.top = y + 'px'; };
      this.h = {
        down: (e) => {
          if (this.blocked() || e.target.closest('button')) return;
          e.preventDefault();
          const r = this.layer.getBoundingClientRect();
          Object.assign(j, { active: true, id: e.pointerId, sx: e.clientX - r.left, sy: e.clientY - r.top, x: 0, y: 0 });
          setJoy(j.sx, j.sy);
          this.ui.knob.style.transform = '';
          this.ui.joy.classList.remove('idle');
          try { this.layer.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        },
        move: (e) => {
          if (!j.active || e.pointerId !== j.id) return;
          const r = this.layer.getBoundingClientRect();
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
      this.layer.addEventListener('pointerdown', this.h.down);
      this.layer.addEventListener('pointermove', this.h.move);
      this.layer.addEventListener('pointerup', this.h.up);
      this.layer.addEventListener('pointercancel', this.h.up);
      window.addEventListener('keydown', this.h.key);
      window.addEventListener('keyup', this.h.key);
      this.placeIdleJoy();
    }

    placeIdleJoy() {
      if (!this.ui) return;
      const r = this.layer.getBoundingClientRect();
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
      const mag = Math.hypot(x, z);
      if (mag < 0.12) return null;
      const s = Math.min(1, mag) / mag;
      return { x: x * s, z: z * s };
    }

    resize() {
      const r = this.layer.getBoundingClientRect();
      if (!r.width) return;
      this.renderer.setSize(r.width, r.height, false);
      this.renderer.domElement.style.width = '100%';
      this.renderer.domElement.style.height = '100%';
      const aspect = r.width / r.height;
      this.camera.aspect = aspect;
      // keep ~17 world units visible horizontally on portrait phones
      const dist = this.camOffset.length();
      const vfov = 2 * Math.atan(7.5 / dist / aspect) * (180 / Math.PI);
      this.camera.fov = clamp(vfov, 42, 78);
      this.camera.updateProjectionMatrix();
      if (this.joy && !this.joy.active) this.placeIdleJoy();
    }

    // ---------------------------------------------------------------- helpers
    hitsWall(x, z) {
      for (const w of WALLS) if (x > w.x0 - PLAYER_R && x < w.x1 + PLAYER_R && z > w.z0 - PLAYER_R && z < w.z1 + PLAYER_R) return true;
      return false;
    }

    fly(geo, mat, from, toFn, dur, done, arc = 1.4) {
      const mm = new THREE.Mesh(geo, mat);
      mm.position.copy(from);
      this.scene.add(mm);
      this.flyers.push({ mm, from: from.clone(), toFn, t: 0, dur, done, arc });
    }

    backTop(i) { return this.player.localToWorld(new THREE.Vector3(0, 0.75 + i * STACK_H, -0.5)); }

    spawnBeast(anywhere) {
      const p = this.player.position;
      let x, z, tries = 0;
      do {
        x = (Math.random() - 0.5) * 36;
        z = -7 - Math.random() * 22;
        tries++;
      } while (!anywhere && tries < 20 && (x - p.x) ** 2 + (z - p.z) ** 2 < 14 * 14);
      const kind = Math.random() < 0.28 + this.level * 0.03 ? 'bear' : 'wolf';
      const def = BEASTS[kind];
      const grp = beastMesh(kind);
      grp.position.set(x, 0, z);
      grp.rotation.y = Math.random() * 6.28;
      this.scene.add(grp);
      const hp = def.hp * this.hpScale;
      this.beasts.push({ kind, def, grp, hp, max: hp, tx: x, tz: z, wanderT: 0, phase: Math.random() * 6, dead: 0, hitT: 0 });
    }

    damageBeast(b, d) {
      if (b.hp <= 0) return;
      b.hp -= d;
      b.hitT = 0.12;
      if (b.hp <= 0) {
        b.dead = 0.001;
        sfx('pop');
        vibrate(10);
        const { g, m } = assets();
        for (let i = 0; i < b.def.meat; i++) {
          const mm = new THREE.Mesh(g.meat, m.raw);
          mm.castShadow = true;
          mm.position.set(b.grp.position.x, 0.8, b.grp.position.z);
          this.scene.add(mm);
          const a = Math.random() * 6.28, sp = 1.5 + Math.random() * 2;
          this.drops.push({ mm, vx: Math.cos(a) * sp, vy: 5, vz: Math.sin(a) * sp, t: 0 });
        }
      }
    }

    boost() {
      if (this.blocked()) return;
      this.paused = true;
      Monetization.showRewarded('frost_cash_boost').then((ok) => {
        this.paused = false;
        if (ok) { this.boostT = 90; Monetization.resetInterstitialCounter(); UI.toast('💵 ×2 cash for 90s!'); }
      });
    }

    // ---------------------------------------------------------------- update
    update(dt) {
      this.time += dt;
      const T = THREE;
      const P = this.player.position;
      const { g, m } = assets();

      // --- movement
      const v = this.inputVec();
      const moving = !!v;
      if (v) {
        const sp = 6.6 * dt;
        const nx = P.x + v.x * sp, nz = P.z + v.z * sp;
        if (!this.hitsWall(nx, P.z)) P.x = nx;
        if (!this.hitsWall(P.x, nz)) P.z = nz;
        // round obstacles push you out sideways so you slide around them
        const gx = P.x - GRILL.x, gz = P.z - GRILL.z, gd = Math.hypot(gx, gz), GR = 1.5;
        if (gd < GR) { const k = gd > 0.001 ? GR / gd : 0; P.x = GRILL.x + (k ? gx * k : GR); P.z = GRILL.z + gz * k; }
        P.x = clamp(P.x, -34, 34); P.z = clamp(P.z, -46, 22);
        const target = Math.atan2(v.x, v.z);
        let dAng = target - this.player.rotation.y;
        dAng = Math.atan2(Math.sin(dAng), Math.cos(dAng));
        this.player.rotation.y += dAng * Math.min(1, dt * 14);
      }
      animLegs(this.player, this.time * 14, moving);
      this.backStack.position.y = moving ? Math.abs(Math.sin(this.time * 14)) * 0.05 : 0;
      const safe = inCamp(P);

      // --- camera, light, snow
      const camTarget = new T.Vector3(P.x, 0, P.z + 2);
      const want = camTarget.clone().add(this.camOffset);
      this.camera.position.lerp(want, Math.min(1, dt * 6));
      this.camera.lookAt(this.camera.position.clone().sub(this.camOffset));
      this.sun.position.set(P.x + 10, 24, P.z + 8);
      this.sun.target.position.set(P.x, 0, P.z);
      this.snow.position.set(P.x, 0, P.z);
      const sp = this.snow.geometry.attributes.position;
      for (let i = 0; i < sp.count; i++) {
        let y = sp.getY(i) - dt * (2 + (i % 5) * 0.4);
        if (y < 0) y += 20;
        sp.setY(i, y);
      }
      sp.needsUpdate = true;
      const fl = 1 + Math.sin(this.time * 11) * 0.08 + Math.random() * 0.05;
      this.fire.scale.set(fl, fl * (this.st.raw > 0 ? 1.25 : 1), fl);
      this.fireLight.intensity = 5 + fl * 2;

      // --- player health
      this.hurtT = Math.max(0, this.hurtT - dt);
      if (safe) this.hp = Math.min(this.maxHp, this.hp + 30 * dt);
      else if (this.hurtT <= 0) this.hp = Math.min(this.maxHp, this.hp + 3 * dt);
      this.hpBar.visible = this.hp < this.maxHp - 0.5;
      this.hpBar.position.set(P.x, 2.3, P.z);
      this.hpBar.userData.fg.scale.x = 1.2 * Math.max(0, this.hp / this.maxHp);
      this.hpBar.userData.fg.material.color.set(this.hp / this.maxHp > 0.35 ? '#4ade80' : '#ff4d5e');
      this.maxTag.visible = this.carry >= this.cap;
      this.maxTag.position.set(P.x, 2.4 + Math.min(this.carry, 40) * STACK_H * 0.5 + (this.hpBar.visible ? 0.4 : 0), P.z);

      // --- axes
      this.axeRing.visible = !safe;
      this.axeRing.position.set(P.x, 0, P.z);
      this.axeRing.rotation.y -= dt * 7;
      for (const a of this.axeMeshes) a.rotation.x += dt * 20;

      // --- beasts
      const alive = this.beasts.filter((b) => !b.dead).length;
      this.spawnT -= dt;
      if (alive < this.maxBeasts && this.spawnT <= 0) { this.spawnBeast(false); this.spawnT = 2.5; }
      for (const b of this.beasts) {
        const bp = b.grp.position;
        const ud = b.grp.userData;
        if (b.dead) {
          b.dead += dt;
          const k = Math.max(0.01, 1 - b.dead * 2.5);
          b.grp.scale.setScalar(k);
          b.grp.rotation.z = b.dead * 4;
          continue;
        }
        const dx = P.x - bp.x, dz = P.z - bp.z;
        const d = Math.hypot(dx, dz);
        let mx = 0, mz = 0, speed = 0;
        const chasing = !safe && d < 8.5 && P.z < CAMP.z0 + 1;
        if (chasing) {
          if (d > b.def.reach * 0.9) { mx = dx / d; mz = dz / d; speed = b.def.chase; }
          else if (this.hp > 0) { this.hp -= b.def.dps * dt; this.hurtT = 2.5; if (Math.random() < dt * 3) { sfx('hit'); vibrate(15); } }
        } else {
          b.wanderT -= dt;
          if (b.wanderT <= 0) { b.tx = clamp(bp.x + (Math.random() - 0.5) * 12, -22, 22); b.tz = clamp(bp.z + (Math.random() - 0.5) * 12, -32, -6); b.wanderT = 2 + Math.random() * 3; }
          const wx = b.tx - bp.x, wz = b.tz - bp.z, wd = Math.hypot(wx, wz);
          if (wd > 0.3) { mx = wx / wd; mz = wz / wd; speed = b.def.spd; }
        }
        if (speed) {
          bp.x += mx * speed * dt;
          bp.z = Math.min(bp.z + mz * speed * dt, CAMP.z0 - 1.2 - b.def.r);
          const target = Math.atan2(mx, mz);
          let da = target - b.grp.rotation.y;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          b.grp.rotation.y += da * Math.min(1, dt * 8);
          b.phase += dt * speed * 3.5;
        }
        ud.legs.forEach((l, i) => { l.rotation.x = speed ? Math.sin(b.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.5 : 0; });
        // axe damage
        if (!safe && d < 1.7 + 0.5 + b.def.r) {
          this.damageBeast(b, this.axes * 1.4 * this.dmgMult * dt);
          if (Math.random() < dt * 6) sfx('hit');
        }
        if (b.hitT > 0) b.hitT -= dt;
        ud.body.scale.setScalar(b.hitT > 0 ? 1.12 : 1);
        ud.bg.visible = ud.fg.visible = b.hp < b.max;
        ud.fg.scale.x = 1.2 * Math.max(0, b.hp / b.max);
      }
      this.beasts = this.beasts.filter((b) => {
        if (b.dead > 0.45) { this.scene.remove(b.grp); b.grp.userData.mat.dispose(); return false; }
        return true;
      });

      // --- death
      if (this.hp <= 0) {
        this.hp = this.maxHp;
        P.set(0, 0, 11);
        this.camera.position.copy(P).add(this.camOffset);
        const lost = this.carry;
        this.carry = 0;
        this.syncStacks();
        sfx('lose'); vibrate([60, 40, 60]);
        UI.toast(lost ? `You fainted and dropped ${lost} meat!` : 'You fainted! Watch your health.');
      }

      // --- towers
      for (const t of this.towers) {
        t.cd -= dt;
        let best = null, bd = 12 * 12;
        for (const b of this.beasts) { if (b.dead) continue; const d2 = dist2(b.grp.position, t.x, t.z); if (d2 < bd) { bd = d2; best = b; } }
        if (!best) continue;
        t.head.rotation.y = Math.atan2(best.grp.position.x - t.x, best.grp.position.z - t.z);
        if (t.cd <= 0) {
          t.cd = 0.75;
          const bolt = new T.Mesh(g.bolt, m.handle);
          bolt.position.set(t.x, 3.1, t.z);
          this.scene.add(bolt);
          this.bolts.push({ mm: bolt, target: best, t: 0 });
        }
      }
      for (const bo of this.bolts) {
        bo.t += dt;
        const tp = bo.target.grp.position;
        const to = new T.Vector3(tp.x, 0.9, tp.z).sub(bo.mm.position);
        const len = to.length();
        if (len < 0.5 || bo.target.dead || bo.t > 2) {
          if (!bo.target.dead) this.damageBeast(bo.target, 2 * this.dmgMult);
          bo.done = true;
          this.scene.remove(bo.mm);
          continue;
        }
        to.normalize();
        bo.mm.position.addScaledVector(to, Math.min(len, 26 * dt));
        bo.mm.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), to);
      }
      this.bolts = this.bolts.filter((b) => !b.done);

      // --- meat drops
      for (const d of this.drops) {
        d.t += dt;
        if (d.mm.position.y > 0.07 || d.vy > 0) {
          d.vy -= 18 * dt;
          d.mm.position.x += d.vx * dt; d.mm.position.z += d.vz * dt; d.mm.position.y += d.vy * dt;
          if (d.mm.position.y < 0.07) { d.mm.position.y = 0.07; d.vy = 0; d.vx = d.vz = 0; }
          d.mm.rotation.y += dt * 6;
        }
        if (d.t > 0.35 && this.carry < this.cap && dist2(d.mm.position, P.x, P.z) < 2.2 * 2.2) {
          d.taken = true;
          this.scene.remove(d.mm);
          const idx = this.carry++;
          this.fly(g.meat, m.raw, d.mm.position, () => this.backTop(idx), 0.25, () => this.syncStacks(), 1);
          sfx('coin');
        }
      }
      for (const d of this.drops) if (d.t > 60 && !d.taken) { d.taken = true; this.scene.remove(d.mm); } // uncollected meat rots away
      this.drops = this.drops.filter((d) => !d.taken);

      // --- drop meat at grill
      this.dropT -= dt;
      if (this.carry > 0 && dist2(GRILL_IN, P.x, P.z) < 1.4 * 1.4 && this.dropT <= 0) {
        this.dropT = 0.07;
        const from = this.backTop(this.carry - 1);
        this.carry--;
        this.syncStacks();
        const i = this.st.raw;
        this.st.raw++;
        this.rawInFlight = (this.rawInFlight || 0) + 1;
        this.fly(g.meat, m.raw, from, () => this.rawGroup.localToWorld(new T.Vector3((i % 2) * 0.62, 0.07 + Math.floor(i / 2) * STACK_H, 0)), 0.3, () => { this.rawInFlight--; this.syncStacks(); });
        sfx('pop');
      }

      // --- cooking
      const cookedCap = 48;
      if (this.st.raw - (this.rawInFlight || 0) > 0 && this.st.cooked + (this.cookedInFlight || 0) < cookedCap) {
        this.cookT += dt;
        if (this.cookT >= this.cookTime) {
          this.cookT = 0;
          this.st.raw--;
          this.syncStacks();
          const i = this.st.cooked + (this.cookedInFlight || 0);
          this.cookedInFlight = (this.cookedInFlight || 0) + 1;
          const k = i % 8;
          this.fly(g.meat, m.cooked, new T.Vector3(GRILL.x, 2, GRILL.z),
            () => this.cookedGroup.localToWorld(new T.Vector3(k < 4 ? -0.28 : 0.28, 0.07 + Math.floor(i / 8) * STACK_H, -1.2 + (k % 4) * 0.8)),
            0.55, () => { this.cookedInFlight--; this.st.cooked++; this.syncStacks(); }, 2.5);
        }
      }

      // --- customers + their payments flying to the cash pad
      this.updateCustomers(dt);
      for (const b of this.billQueue) {
        b.t -= dt;
        if (b.t > 0) continue;
        b.sent = true;
        this.fly(g.cash, m.cash, new T.Vector3(-9.6, 1.2, 8), () => this.cashGroup.localToWorld(new T.Vector3(0, 0.1 + Math.floor(this.st.pile.length / 6) * 0.1, 0)), 0.35,
          () => { this.st.pile.push(b.price); this.syncStacks(); }, 1.5);
      }
      this.billQueue = this.billQueue.filter((b) => !b.sent);

      // --- collect cash
      this.cashT -= dt;
      if (this.st.pile.length && dist2(CASHPAD, P.x, P.z) < 1.6 * 1.6 && this.cashT <= 0) {
        this.cashT = 0.035;
        const val = this.st.pile.pop();
        const from = this.cashGroup.localToWorld(new T.Vector3(0, 0.1 + Math.floor(this.st.pile.length / 6) * 0.1, 0));
        this.syncStacks();
        this.fly(g.cash, m.cash, from, () => P.clone().setY(1.4), 0.22, () => { this.st.cash += val; }, 1.2);
        sfx('coin');
      }

      // --- build pads
      this.updatePads(dt);

      // --- flyers
      for (const f of this.flyers) {
        f.t += dt / f.dur;
        const k = Math.min(1, f.t);
        const to = f.toFn();
        f.mm.position.lerpVectors(f.from, to, k);
        f.mm.position.y += Math.sin(k * Math.PI) * f.arc;
        f.mm.rotation.y += dt * 10;
        if (f.t >= 1) { this.scene.remove(f.mm); f.gone = true; if (f.done) f.done(); }
      }
      this.flyers = this.flyers.filter((f) => !f.gone);

      // --- HUD
      if (this.boostT > 0) this.boostT -= dt;
      this.ui.boost.hidden = this.boostT <= 0;
      if (this.boostT > 0) this.ui.boost.textContent = `💵×2 · ${Math.ceil(this.boostT)}s`;
      this.cashShown += (this.st.cash - this.cashShown) * Math.min(1, dt * 10);
      if (Math.abs(this.st.cash - this.cashShown) < 0.5) this.cashShown = this.st.cash;
      this.ui.cash.textContent = fmt(Math.round(this.cashShown));
      this.updateGuide();

      this.saveT += dt;
      if (this.saveT > 3) { this.saveT = 0; this.persist(); }
    }

    updateCustomers(dt) {
      const T = THREE;
      const { g, m } = assets();
      this.custT -= dt;
      const waiting = this.customers.filter((c) => c.state !== 'leave');
      if (this.custT <= 0 && waiting.length < 6) {
        this.custT = 3 + Math.random() * 2;
        const grp = person(m.orange, m.orangeDark);
        grp.position.set(-30, 0, 8 + (Math.random() - 0.5) * 3);
        const need = 1 + Math.floor(Math.random() * (2 + Math.min(this.level, 3)));
        const bub = textSprite((c, w, h, t) => bubble(c, w, h, t));
        bub.position.y = 2.25;
        grp.add(bub);
        this.scene.add(grp);
        this.customers.push({ grp, bub, need, got: 0, pending: 0, state: 'walk', slot: waiting.length, phase: 0, shown: '' });
      }
      const P = this.player.position;
      const cashierHere = !!this.worker || dist2(CASHIER, P.x, P.z) < 1.3 * 1.3;
      this.sellT -= dt;
      for (const c of this.customers) {
        const p = c.grp.position;
        let tx, tz;
        if (c.state === 'leave') { tx = -32; tz = 14; } else { tx = QUEUE.x - c.slot * QUEUE.gap; tz = QUEUE.z; }
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
        const moving = d > 0.08;
        if (moving) {
          const s = Math.min(d, 3.2 * dt);
          p.x += (dx / d) * s; p.z += (dz / d) * s;
          c.grp.rotation.y = Math.atan2(dx, dz);
          c.phase += dt * 12;
        } else if (c.state !== 'leave') {
          c.grp.rotation.y = Math.PI / 2; // face the counter
        }
        animLegs(c.grp, c.phase, moving);
        if (c.state === 'walk' && c.slot === 0 && !moving) c.state = 'front';
        // serve the front customer
        if (c.state === 'front' && cashierHere && this.st.cooked > 0 && c.got + c.pending < c.need && this.sellT <= 0) {
          this.sellT = 0.2;
          this.st.cooked--;
          const top = this.cookedMeshes[this.cookedMeshes.length - 1];
          const from = top ? top.getWorldPosition(new T.Vector3()) : new T.Vector3(-10, 1, 8);
          this.syncStacks();
          c.pending++;
          this.fly(g.meat, m.cooked, from, () => p.clone().setY(1.1), 0.25, () => { c.pending--; c.got++; }, 0.8);
          sfx('pop');
        }
        if (c.state === 'front' && c.got >= c.need) {
          c.state = 'leave';
          const price = this.steakPrice * (this.boostT > 0 ? 2 : 1);
          for (let i = 0; i < c.need; i++) this.billQueue.push({ t: i * 0.09, price });
          sfx('coin');
          for (const o of this.customers) if (o !== c && o.state !== 'leave') o.slot = Math.max(0, o.slot - 1);
        }
        const label = c.state === 'leave' ? '😊' : `🥩 ${c.need - c.got}`;
        if (label !== c.shown) { c.shown = label; c.bub.userData.redraw(label); }
      }
      this.customers = this.customers.filter((c) => {
        if (c.state === 'leave' && c.grp.position.x < -31) { this.scene.remove(c.grp); c.bub.material.map.dispose(); c.bub.material.dispose(); return false; }
        return true;
      });
      // queue slots must stay compact and ordered
      const q = this.customers.filter((c) => c.state !== 'leave').sort((a, b) => a.slot - b.slot);
      q.forEach((c, i) => { c.slot = i; if (i === 0 && c.state === 'walk') { /* becomes front on arrival */ } });
    }

    updatePads(dt) {
      const P = this.player.position;
      this.padT -= dt;
      for (const pad of this.pads) {
        const def = pad.def;
        const vis = this.padVisible(def);
        pad.tile.visible = vis;
        if (!vis) continue;
        const cost = this.padCost(def);
        const paid = this.st.paid[def.id] || 0;
        const on = dist2(def, P.x, P.z) < 1.25 * 1.25;
        if (on && this.st.cash > 0 && this.padT <= 0 && paid < cost) {
          this.padT = 0.03;
          const chunk = Math.min(this.st.cash, Math.max(1, Math.ceil(cost / 40)), cost - paid);
          this.st.cash -= chunk;
          this.cashShown = Math.min(this.cashShown, this.st.cash + chunk);
          this.st.paid[def.id] = paid + chunk;
          if (Math.random() < 0.5) {
            const { g, m } = assets();
            this.fly(g.cash, m.cash, P.clone().setY(1.3), () => new THREE.Vector3(def.x, 0.1, def.z), 0.2, null, 0.8);
          }
          if (paid + chunk >= cost) { this.complete(def); continue; }
        }
        const left = cost - (this.st.paid[def.id] || 0);
        const key = `${left}`;
        if (key !== pad.shownKey) {
          pad.shownKey = key;
          const lv = this.lvl(def.id);
          pad.tile.userData.redraw(def.icon, def.max ? `${def.label} ${lv + 1}/${def.max}` : def.label, '$' + fmt(left), 1 - left / cost);
        }
      }
    }

    complete(def) {
      this.st.built[def.id] = this.lvl(def.id) + 1;
      this.st.paid[def.id] = 0;
      this.padT = 0.5;
      sfx('level');
      vibrate([20, 30, 20]);
      Monetization.track('frost_build', { id: def.id, level: this.level });
      if (def.id === 'next') {
        this.persist();
        this.done = true;
        Save.data.frostCamp = null;
        Save.save();
        this.api.win({ coins: 60 + this.level * 25, text: `🏕️ Camp ${this.level} complete!` });
        return;
      }
      UI.toast({ cashier: 'Cashier hired!', axe: `${this.axes + 1} axes!`, pack: 'Bigger backpack!', grill: 'Grill upgraded!', tower1: 'Crossbow built!', tower2: 'Crossbow built!' }[def.id] || 'Built!');
      this.syncStations();
      this.persist();
    }

    updateGuide() {
      const P = this.player.position;
      let target = null, text = '';
      const nearestBeast = () => {
        let best = null, bd = Infinity;
        for (const b of this.beasts) { if (b.dead) continue; const d = dist2(b.grp.position, P.x, P.z); if (d < bd) { bd = d; best = b; } }
        return best && best.grp.position;
      };
      const afford = this.pads.find((p) => p.tile.visible && this.st.cash >= this.padCost(p.def) - (this.st.paid[p.def.id] || 0));
      const front = this.customers.find((c) => c.state === 'front');
      if (this.carry >= this.cap || (this.carry > 0 && inCamp(P))) { target = GRILL_IN; text = 'Drop the meat at the grill 🔥'; }
      else if (this.st.pile.length >= 3) { target = CASHPAD; text = 'Pick up your cash 💵'; }
      else if (!this.worker && front && this.st.cooked > 0) { target = CASHIER; text = 'Stand at the counter to sell steaks'; }
      else if (afford) { target = afford.def; text = `Build: ${afford.def.label}`; }
      else if (this.carry > 0) { target = nearestBeast(); text = `Keep hunting (${this.carry}/${this.cap}) or drop meat at the grill`; }
      else { target = nearestBeast(); text = 'Go hunt beasts outside the gate 🪓'; }
      this.guideTarget = target;
      if (text !== this.goalText) { this.goalText = text; this.ui.goal.textContent = text; }
      const hideNear = target && dist2(target, P.x, P.z) < 2.5 * 2.5;
      this.arrow.visible = !!target && !hideNear;
      if (target) this.arrow.position.set(target.x, 3 + Math.sin(this.time * 5) * 0.35, target.z);
      this.arrow.rotation.y += 0.05;
    }

    draw() {
      if (this.renderer) this.renderer.render(this.scene, this.camera);
    }

    destroy() {
      if (!this.done) this.persist();
      window.removeEventListener('resize', this.resize);
      window.removeEventListener('keydown', this.h.key);
      window.removeEventListener('keyup', this.h.key);
      this.scene.traverse((o) => {
        if (o.geometry && !Object.values(assets().g).includes(o.geometry)) o.geometry.dispose();
        if (o.material && o.material.map) o.material.map.dispose();
      });
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.layer.remove();
      this.hiddenCanvas.style.visibility = '';
      this.scene = null;
    }
  }

  GH.Games.frost = {
    id: 'frost',
    name: 'Frost Survival',
    tagline: 'Hunt beasts, cook, sell, build your camp.',
    icon: '🏕️',
    colors: ['#2a5c8a', '#7fd4ff'],
    create: (opts) => new FrostSurvival(opts),
  };
})();

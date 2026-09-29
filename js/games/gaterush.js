/*
 * GATE RUSH – endless 3D army runner (Last War / Whiteout / Kingshot "math gate" ads).
 * Drag to steer your leader; the army follows him and he alone decides which gate
 * you take. Your squad fires automatically. Shoot enemy waves before they reach
 * you, pick (or shoot up) the right gates, break barrels for upgrades and survive the
 * Ice Giant bosses. Difficulty keeps rising with distance; how far can you get?
 */
(function () {
  'use strict';
  const { Save, UI, sfx, vibrate, fmt, clamp } = GH;

  const ROAD = 5;           // road half width
  const SPAWN_Z = -95;
  const MAX_VIS = 140;      // soldiers drawn (count label shows the real number)
  const MAX_ENEMIES = 220;
  const MAX_BULLETS = 260;
  const BULLET_SPEED = 70;
  const FIRST_BOSS = 450, BOSS_EVERY = 600;
  const MAX_ARMY = 999;

  // enemy kinds: hp and speed get multiplied by the distance scale
  const KINDS = {
    grunt: { hp: 2.5, speed: 2.6, r: 0.45, kills: 1, scale: 1, color: '#d9443a', head: '#8fbf5a', home: 0.8 },
    runner: { hp: 1.4, speed: 6.5, r: 0.4, kills: 1, scale: 0.9, color: '#8e44ad', head: '#8fbf5a', home: 2.2 },
    elite: { hp: 7, speed: 3, r: 0.5, kills: 2, scale: 1.15, color: '#2c2f3a', head: '#c0392b', home: 1.2 },
    brute: { hp: 28, speed: 1.6, r: 1.1, kills: 7, scale: 2.3, color: '#7d3c2a', head: '#6b8e23', home: 0.6, bar: true },
  };

  // soldier formation offsets (sunflower spiral)
  const FORM = [];
  for (let i = 0; i < MAX_VIS; i++) {
    const a = i * 2.39996, r = 0.34 * Math.sqrt(i);
    FORM.push([Math.cos(a) * r, Math.sin(a) * r * 0.8]);
  }

  const gateColor = (g) => (g.kind === 'mul' || (g.kind === 'add' && g.val >= 0) ? '#3a8dff' : '#ff4d5e');
  const gateText = (g) => (g.kind === 'mul' ? `×${g.val}` : g.kind === 'div' ? `÷${g.val}` : (g.val >= 0 ? '+' : '') + g.val);

  class GateRush {
    constructor({ api }) {
      this.api = api;
      this.K = GH.K3;
      this.title = 'Gate Rush';
      this.startN = 5 + GH.Town.bonus.gateStart(); // Barracks
      Save.data.best = Save.data.best || {};
      this.best = Save.data.best.gate || 0;
      this.buildScene();
      this.bindInput();
      this.reset();
      api.setHudButtons([{ label: this.reinforceLabel(), cls: 'gold', onClick: (el) => this.reinforce(el) }]);
      api.setLevelLabel(`Best ${fmt(this.best)} m`);
    }

    // ---------------------------------------------------------------- scene
    buildScene() {
      const T = THREE, K = this.K;
      this.ly = K.layer(`
        <div class="gr-top"><span class="gr-dist">0 m</span><span class="gr-buffs"></span></div>
        <div class="gr-boss" hidden><b>❄️ ICE GIANT</b><div class="bar"><i></i></div></div>
        <div class="gr-count">5</div>
        <div class="gr-ready"><b>Drag to steer</b><span>Shoot the enemies. Shoot red gates to turn them blue!</span><i>👆</i></div>`);
      const el = this.ly.el;
      this.ui = {
        dist: el.querySelector('.gr-dist'), buffs: el.querySelector('.gr-buffs'), boss: el.querySelector('.gr-boss'),
        bossBar: el.querySelector('.gr-boss i'), count: el.querySelector('.gr-count'), ready: el.querySelector('.gr-ready'),
      };
      this.renderer = K.renderer(el);
      const scene = (this.scene = new T.Scene());
      scene.background = new T.Color('#cfe0ef');
      scene.fog = new T.Fog('#cfe0ef', 45, 100);
      this.camera = new T.PerspectiveCamera(55, 1, 0.5, 160);
      scene.add(new T.HemisphereLight('#ffffff', '#a3b4c8', 1.8));
      const sun = new T.DirectionalLight('#fff3e0', 2.2);
      sun.position.set(6, 20, 8);
      sun.target.position.set(0, 0, -10);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 30, bottom: -20, near: 1, far: 60 });
      scene.add(sun, sun.target);

      // snow + road
      const snow = new T.Mesh(new T.PlaneGeometry(200, 260), K.lam('#e3ebf4'));
      snow.rotation.x = -Math.PI / 2; snow.position.z = -60; snow.receiveShadow = true;
      scene.add(snow);
      const rt = K.canvasTex(128, 256);
      rt.ctx.fillStyle = '#56647a'; rt.ctx.fillRect(0, 0, 128, 256);
      rt.ctx.fillStyle = 'rgba(255,255,255,.55)'; rt.ctx.fillRect(61, 0, 6, 120);
      rt.ctx.fillStyle = '#ffffff'; rt.ctx.fillRect(0, 0, 5, 256); rt.ctx.fillRect(123, 0, 5, 256);
      rt.tex.wrapS = rt.tex.wrapT = T.RepeatWrapping;
      rt.tex.repeat.set(1, 20);
      this.roadTex = rt.tex;
      const road = new T.Mesh(new T.PlaneGeometry(ROAD * 2 + 0.6, 200), new T.MeshLambertMaterial({ map: rt.tex }));
      road.rotation.x = -Math.PI / 2; road.position.set(0, 0.01, -80); road.receiveShadow = true;
      scene.add(road);

      // pines that stream past on both sides
      const N = 70;
      this.trees = [];
      const lower = new T.InstancedMesh(new T.ConeGeometry(1.3, 2.6, 7), K.lam('#2f5f86'), N);
      const cap = new T.InstancedMesh(new T.ConeGeometry(0.6, 1, 7), K.lam('#ffffff'), N);
      lower.castShadow = true;
      lower.frustumCulled = cap.frustumCulled = false; // they scroll
      for (let i = 0; i < N; i++) {
        const side = i % 2 ? 1 : -1;
        this.trees.push({ x: side * (7.5 + Math.random() * 9), z: -130 + (i / N) * 150, s: 0.8 + Math.random() * 0.6 });
      }
      this.treeMeshes = [lower, cap];
      scene.add(lower, cap);

      // instanced soldiers
      // frustumCulled off: three.js caches an instanced mesh's bounds from its first frame, so moving crowds would vanish
      const mk = (geo, mat, n) => { const m = new T.InstancedMesh(geo, mat, n); m.castShadow = true; m.count = 0; m.frustumCulled = false; scene.add(m); return m; };
      this.solBody = mk(new T.CapsuleGeometry(0.2, 0.3, 3, 8), K.lam('#3a7bd5'), MAX_VIS);
      this.solHead = mk(new T.SphereGeometry(0.17, 10, 8), K.lam('#ffd2a6'), MAX_VIS);
      this.solHelm = mk(new T.SphereGeometry(0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), K.lam('#24549c'), MAX_VIS);
      this.solGun = mk(new T.BoxGeometry(0.08, 0.08, 0.5), K.lam('#2c2f3a'), MAX_VIS);
      // instanced enemies (per-instance colours)
      this.enBody = mk(new T.CapsuleGeometry(0.28, 0.35, 3, 8), new T.MeshLambertMaterial({ color: '#ffffff' }), MAX_ENEMIES);
      this.enHead = mk(new T.SphereGeometry(0.24, 10, 8), new T.MeshLambertMaterial({ color: '#ffffff' }), MAX_ENEMIES);
      this.bullets3 = mk(new T.BoxGeometry(0.09, 0.09, 0.7), K.basic('#ffd23a'), MAX_BULLETS);
      this.bullets3.castShadow = false;
      this.popMesh = mk(new T.BoxGeometry(0.18, 0.18, 0.18), new T.MeshBasicMaterial({ color: '#ffffff' }), 120);
      this.popMesh.castShadow = false;
      this.dummy = new T.Object3D();
      this.col = new T.Color();

      // the commander walking in front of the army
      const L = (this.leader = K.person('#d4a017', null));
      L.add(K.mesh(K.geo.sphere, K.std('#ffd84a', { metalness: 0.7, roughness: 0.3 }), 0, 1.45, 0, 0.64, 0.5, 0.64));
      L.add(K.box(0.9, 1, 0.06, K.lam('#c0392b'), 0, 0.85, 0.28));
      L.add(K.box(0.05, 2.2, 0.05, K.lam('#6e4424'), 0.42, 1.2, 0.1));
      L.add(K.box(0.7, 0.45, 0.03, K.lam('#3a7bd5'), 0.78, 2.05, 0.1));
      L.scale.setScalar(1.55);
      scene.add(L);
      const chev = new T.Shape();
      chev.moveTo(0, 0.9); chev.lineTo(0.8, -0.3); chev.lineTo(0.3, -0.3); chev.lineTo(0, 0.2); chev.lineTo(-0.3, -0.3); chev.lineTo(-0.8, -0.3); chev.closePath();
      this.chevron = new T.Mesh(new T.ShapeGeometry(chev), new T.MeshBasicMaterial({ color: '#ffd23a', transparent: true, opacity: 0.85, depthWrite: false }));
      this.chevron.rotation.x = -Math.PI / 2;
      scene.add(this.chevron);

      this.boss3 = this.makeBoss();
      this.boss3.visible = false;
      scene.add(this.boss3);

      this.resize = () => K.fit(this.renderer, this.camera, el, 6.3, 18, 45, 80);
      window.addEventListener('resize', this.resize);
      this.resize();
    }

    makeBoss() {
      const K = this.K, g = new THREE.Group();
      const ice = K.lam('#9fcaf0'), iceD = K.lam('#5c8fc4'), white = K.lam('#e8f4ff');
      g.add(K.box(2.6, 2.6, 1.8, ice, 0, 2.6, 0));
      g.add(K.box(1.7, 1.4, 1.5, white, 0, 4.6, 0.1));
      g.add(K.box(0.35, 0.25, 0.1, K.basic('#ff2a4a'), -0.4, 4.75, 0.9), K.box(0.35, 0.25, 0.1, K.basic('#ff2a4a'), 0.4, 4.75, 0.9));
      const armL = K.box(0.8, 2.4, 0.8, iceD, -1.8, 2.6, 0), armR = K.box(0.8, 2.4, 0.8, iceD, 1.8, 2.6, 0);
      g.add(armL, armR);
      g.add(K.box(0.9, 1.4, 0.9, iceD, -0.7, 0.7, 0), K.box(0.9, 1.4, 0.9, iceD, 0.7, 0.7, 0));
      for (let i = -2; i <= 2; i++) g.add(K.mesh(new THREE.ConeGeometry(0.25, 0.8, 5), white, i * 0.5, 5.6, 0));
      g.userData.arms = [armL, armR];
      return g;
    }

    gateMesh(side, g) {
      const K = this.K, grp = new THREE.Group();
      const tx = K.canvasTex(256, 128);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(ROAD - 0.3, 2.6), new THREE.MeshBasicMaterial({ map: tx.tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      panel.position.y = 1.5;
      grp.add(panel);
      grp.add(K.box(0.25, 3, 0.25, K.lam('#dfe6ef'), -(ROAD - 0.3) / 2, 1.5, 0), K.box(0.25, 3, 0.25, K.lam('#dfe6ef'), (ROAD - 0.3) / 2, 1.5, 0));
      grp.position.x = side * ROAD / 2;
      g.tx = tx; g.shown = null;
      this.drawGate(g);
      return grp;
    }

    drawGate(g) {
      const text = gateText(g);
      if (g.shown === text) return;
      g.shown = text;
      const { ctx, tex } = g.tx;
      const c = gateColor(g);
      ctx.clearRect(0, 0, 256, 128);
      const grad = ctx.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, c + '33'); grad.addColorStop(1, c + 'cc');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 128);
      ctx.strokeStyle = c; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 248, 120);
      ctx.font = '900 70px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.strokeText(text, 128, 68);
      ctx.fillStyle = '#fff'; ctx.fillText(text, 128, 68);
      tex.needsUpdate = true;
    }

    barrelMesh(b) {
      const K = this.K, grp = new THREE.Group();
      grp.add(K.mesh(K.geo.cyl, K.lam('#c0392b'), 0, 0.75, 0, 1.3, 1.5, 1.3));
      grp.add(K.mesh(K.geo.cyl, K.lam('#7a1f16'), 0, 0.35, 0, 1.36, 0.12, 1.36), K.mesh(K.geo.cyl, K.lam('#7a1f16'), 0, 1.15, 0, 1.36, 0.12, 1.36));
      const tx = K.canvasTex(256, 128);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx.tex, depthTest: false }));
      sp.scale.set(2.6, 1.3, 1); sp.position.y = 2.4; sp.renderOrder = 5;
      grp.add(sp);
      b.tx = tx; b.shown = '';
      return grp;
    }

    drawBarrel(b) {
      const text = `${b.reward.icon} ${fmt(Math.ceil(b.hp))}`;
      if (b.shown === text) return;
      b.shown = text;
      const { ctx, tex } = b.tx;
      ctx.clearRect(0, 0, 256, 128);
      ctx.fillStyle = 'rgba(20,26,46,.85)';
      GH.roundRect(ctx, 8, 24, 240, 80, 40); ctx.fill();
      ctx.font = '900 52px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff'; ctx.fillText(text, 128, 66);
      tex.needsUpdate = true;
    }

    // ---------------------------------------------------------------- state
    reset() {
      this.state = 'ready';
      this.n = this.startN;
      this.peak = this.n;
      this.shownN = this.n;
      this.x = 0; this.targetX = 0; this.sx = 0; // x = leader, sx = army centre (follows the leader)
      this.dist = 0;
      this.time = 0;
      this.fireT = 0;
      this.fireMult = 1; this.dmgMult = 1;
      this.kills = 0; this.bosses = 0;
      this.enemies = []; this.gates = []; this.barrels = []; this.bullets = []; this.pops = [];
      this.nextRow = 20;
      this.nextBoss = FIRST_BOSS;
      this.boss = null;
      this.revived = false;
      this.rowIndex = 0;
    }

    get scaleHp() { const d = this.dist; return 1 + d / 200 + Math.pow(d / 700, 2); }
    get speed() { return this.boss && this.boss.contact ? 0 : 9 + Math.min(5, this.dist / 300); }
    get squadR() { return 0.45 + 0.34 * Math.sqrt(Math.min(this.n, MAX_VIS)); }
    get leaderZ() { return -(0.27 * Math.sqrt(Math.min(this.n, MAX_VIS)) + 1.3); }

    // ---------------------------------------------------------------- spawning
    spawnRow() {
      const i = this.rowIndex++;
      const D = this.dist / 100;
      if (this.dist >= this.nextBoss && !this.boss) return this.spawnBoss();
      const r = Math.random();
      if (i < 2 || r < 0.34) this.spawnGates();
      else if (r < 0.84) this.spawnWave(D);
      else { this.spawnBarrel(); if (D > 1) this.spawnWave(D * 0.5); }
    }

    spawnGates() {
      const d = this.dist;
      const add = () => ({ kind: 'add', val: Math.round(3 + d / 60 + Math.random() * (4 + d / 80)) });
      const neg = () => ({ kind: 'add', val: -Math.round(4 + d / 40 + Math.random() * (5 + d / 50)) });
      const good = Math.random() < 0.3 ? { kind: 'mul', val: Math.random() < 0.85 ? 2 : 3 } : add();
      const k = Math.random();
      // later on, decoys get meaner and "both bad" rows appear – shoot one up to survive
      const bad = k < 0.5 ? neg() : k < 0.7 ? { kind: 'div', val: 2 } : add();
      const pair = Math.random() < Math.min(0.35, d / 3000) ? [neg(), neg()] : Math.random() < 0.5 ? [good, bad] : [bad, good];
      const row = { z: SPAWN_Z, sides: pair, done: false, prog: [0, 0] };
      row.meshes = pair.map((g, s) => this.gateMesh(s === 0 ? -1 : 1, g));
      row.group = new THREE.Group();
      row.group.add(...row.meshes);
      row.group.position.z = SPAWN_Z;
      this.scene.add(row.group);
      this.gates.push(row);
    }

    spawnWave(D) {
      const count = Math.min(40, Math.round(4 + D * 2.2 + Math.random() * 3));
      const style = Math.random();
      for (let i = 0; i < count; i++) {
        let kind = 'grunt';
        const r = Math.random();
        if (D > 2.5 && r < 0.2 + Math.min(0.2, D * 0.01)) kind = 'runner';
        else if (D > 6 && r > 0.85 - Math.min(0.2, D * 0.01)) kind = 'elite';
        let x;
        if (style < 0.5) x = -ROAD + 0.6 + Math.random() * (ROAD * 2 - 1.2);               // spread
        else x = (style < 0.75 ? -2.5 : 2.5) + (Math.random() - 0.5) * 4;                  // clustered on one side
        this.addEnemy(kind, clamp(x, -ROAD + 0.5, ROAD - 0.5), SPAWN_Z - Math.random() * 14);
      }
      if (D > 4 && Math.random() < Math.min(0.55, 0.12 + D * 0.03)) {
        const nb = D > 12 && Math.random() < 0.4 ? 2 : 1;
        for (let i = 0; i < nb; i++) this.addEnemy('brute', (Math.random() - 0.5) * 6, SPAWN_Z - 6 - i * 4);
      }
    }

    addEnemy(kind, x, z) {
      if (this.enemies.length >= MAX_ENEMIES - 1) return;
      const k = KINDS[kind];
      const hp = k.hp * this.scaleHp;
      const e = { kind, k, x, z, hp, max: hp, phase: Math.random() * 6, hitT: 0 };
      if (k.bar) {
        e.bar = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#ff3b3b', depthTest: false }));
        e.bar.center.set(0, 0.5); e.bar.renderOrder = 6;
        e.barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#222', depthTest: false }));
        e.barBg.renderOrder = 5;
        this.scene.add(e.bar, e.barBg);
      }
      this.enemies.push(e);
    }

    spawnBarrel() {
      const rewards = [
        { icon: '🪖', apply: (s) => { const n = Math.round(4 + s.dist / 50); s.n = Math.min(MAX_ARMY, s.n + n); return `+${n} soldiers`; } },
        { icon: '🔥', apply: (s) => { s.fireMult *= 1.15; return 'Fire rate +15%'; } },
        { icon: '💥', apply: (s) => { s.dmgMult *= 1.2; return 'Damage +20%'; } },
      ];
      const b = { x: (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 2), z: SPAWN_Z, reward: rewards[Math.floor(Math.random() * rewards.length)] };
      b.hp = b.max = Math.round(12 * this.scaleHp * (1 + this.dist / 400));
      b.group = this.barrelMesh(b);
      b.group.position.set(b.x, 0, b.z);
      this.scene.add(b.group);
      this.drawBarrel(b);
      this.barrels.push(b);
    }

    spawnBoss() {
      const hp = 100 * Math.pow(this.scaleHp, 1.2) * (1 + this.bosses * 0.3);
      this.boss = { x: 0, z: SPAWN_Z, hp, max: hp, contact: false, hitT: 0 };
      this.boss3.visible = true;
      this.boss3.scale.setScalar(1 + this.bosses * 0.12);
      this.boss3.position.set(0, 0, SPAWN_Z);
      this.ui.boss.hidden = false;
      this.nextBoss += BOSS_EVERY;
      this.spawnWave(this.dist / 250);
      this.float('⚠️ BOSS!', '#ff4d5e');
      sfx('bad'); vibrate(80);
    }

    // ---------------------------------------------------------------- input
    bindInput() {
      const el = this.ly.el;
      let lastX = null;
      this.h = {
        down: (e) => {
          if (this.blocked() || e.target.closest('button')) return;
          e.preventDefault();
          lastX = e.clientX;
          try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
          if (this.state === 'ready') { this.state = 'run'; this.ui.ready.hidden = true; sfx('tap'); }
        },
        move: (e) => {
          if (lastX == null || this.blocked()) return;
          const w = el.getBoundingClientRect().width || 360;
          this.targetX += ((e.clientX - lastX) / w) * 13;
          lastX = e.clientX;
        },
        up: () => { lastX = null; },
        key: (e) => {
          const k = e.key.toLowerCase();
          if (k === 'a' || k === 'arrowleft') this.keyDir = e.type === 'keydown' ? -1 : 0;
          if (k === 'd' || k === 'arrowright') this.keyDir = e.type === 'keydown' ? 1 : 0;
          if (this.keyDir && this.state === 'ready') { this.state = 'run'; this.ui.ready.hidden = true; }
        },
      };
      el.addEventListener('pointerdown', this.h.down);
      el.addEventListener('pointermove', this.h.move);
      el.addEventListener('pointerup', this.h.up);
      el.addEventListener('pointercancel', this.h.up);
      window.addEventListener('keydown', this.h.key);
      window.addEventListener('keyup', this.h.key);
    }

    blocked() { return this.paused || UI.modalCount > 0 || !!document.querySelector('.ad-player'); }

    reinforceLabel() { return `🛡️ +10 ×${Save.data.items.reinforce || 0}`; }
    reinforce(el) {
      if (this.state === 'over') return;
      if (!Save.useItem('reinforce')) { UI.toast('No Reinforcement cards. Get them from chests!'); return; }
      this.n = Math.min(MAX_ARMY, this.n + 10);
      this.float('+10', '#5dff8f');
      sfx('level');
      if (el) el.innerHTML = this.reinforceLabel();
    }

    float(text, color) {
      const s = document.createElement('div');
      s.className = 'gr-float';
      s.textContent = text;
      s.style.color = color;
      const p = this.K.toScreen(new THREE.Vector3(this.x, 3, this.leaderZ), this.camera, this.ly.el);
      s.style.left = p.x + 'px'; s.style.top = p.y - 40 + 'px';
      this.ly.el.appendChild(s);
      setTimeout(() => s.remove(), 900);
    }

    pop(x, y, z, color, n = 4) {
      for (let i = 0; i < n && this.pops.length < 120; i++) {
        this.pops.push({ x, y, z, vx: (Math.random() - 0.5) * 6, vy: 3 + Math.random() * 4, vz: (Math.random() - 0.5) * 6, t: 0, c: color });
      }
    }

    lose(k) {
      k = Math.min(k, this.n);
      if (k <= 0) return;
      this.n -= k;
      this.pop(this.sx, 0.8, -this.squadR * 0.5, '#3a8dff', Math.min(8, 2 + k));
    }

    // ---------------------------------------------------------------- update
    update(dt) {
      this.time += dt;
      if (this.keyDir) this.targetX += this.keyDir * 12 * dt;
      this.targetX = clamp(this.targetX, -ROAD + 0.7, ROAD - 0.7);
      this.x += (this.targetX - this.x) * Math.min(1, dt * 14);
      // the army trails its leader, staying on the road
      const lim = ROAD - Math.min(this.squadR, 3.2) * 0.9;
      this.sx = clamp(this.sx + (this.x - this.sx) * Math.min(1, dt * 4), -lim, lim);
      this.shownN += (this.n - this.shownN) * Math.min(1, dt * 12);

      const running = this.state === 'run';
      const v = running ? this.speed : 0;
      if (running) {
        this.dist += v * dt;
        this.nextRow -= v * dt;
        if (this.nextRow <= 0) { this.spawnRow(); this.nextRow = Math.max(17, 26 - this.dist / 250); }
        this.fire(dt);
      }

      // world scroll
      this.roadTex.offset.y += (v * dt) / 10;
      for (const t of this.trees) { t.z += v * dt; if (t.z > 25) t.z -= 150; }

      const sr = this.squadR;
      // --- bullets
      for (const b of this.bullets) {
        b.z -= BULLET_SPEED * dt;
        if (b.z < SPAWN_Z - 20) { b.dead = true; continue; }
        // gates absorb bullets and count up ("shoot the gate" mechanic)
        for (const row of this.gates) {
          if (row.done || b.z > row.z + 0.5 || b.z < row.z - 0.6) continue;
          const s = b.x < 0 ? 0 : 1;
          const g = row.sides[s];
          if (g.kind === 'add') {
            row.prog[s] += b.dmg * 0.35;
            if (row.prog[s] >= 1) { const inc = Math.floor(row.prog[s]); row.prog[s] -= inc; g.val += inc; this.drawGate(g); }
          }
          b.dead = true;
        }
        if (b.dead) continue;
        for (const br of this.barrels) {
          if (br.dead || Math.abs(b.x - br.x) > 0.8 || Math.abs(b.z - br.z) > 0.9) continue;
          br.hp -= b.dmg; b.dead = true;
          if (br.hp <= 0) { br.dead = true; const txt = br.reward.apply(this); this.float(txt, '#ffd23a'); sfx('level'); this.pop(br.x, 1, br.z, '#c0392b', 8); }
          else this.drawBarrel(br);
          break;
        }
        if (b.dead) continue;
        if (this.boss && Math.abs(b.x - this.boss.x) < 2.4 * this.boss3.scale.x && Math.abs(b.z - this.boss.z) < 1.4) {
          this.boss.hp -= b.dmg; this.boss.hitT = 0.06; b.dead = true;
          if (this.boss.hp <= 0) this.killBoss();
          continue;
        }
        for (const e of this.enemies) {
          const r = e.k.r;
          if (e.dead || Math.abs(b.x - e.x) > r + 0.1 || Math.abs(b.z - e.z) > r + 0.4) continue;
          e.hp -= b.dmg; e.hitT = 0.06; b.dead = true;
          if (e.hp <= 0) { e.dead = true; this.kills++; this.pop(e.x, 0.8, e.z, e.k.color, e.kind === 'brute' ? 10 : 3); if (Math.random() < 0.3) sfx('pop'); }
          break;
        }
      }
      this.bullets = this.bullets.filter((b) => !b.dead);

      // --- enemies advance and home in on the squad
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.z += (v + (running ? e.k.speed : 0)) * dt;
        if (running && e.z > -30) e.x += clamp(this.sx - e.x, -1, 1) * e.k.home * dt;
        e.phase += dt * 10;
        if (e.hitT > 0) e.hitT -= dt;
        const hitsArmy = e.z > -sr * 0.7 - e.k.r && e.z < 1.5 && Math.abs(e.x - this.sx) < sr + e.k.r;
        const hitsLeader = e.z > this.leaderZ - 0.5 - e.k.r && e.z < 1.5 && Math.abs(e.x - this.x) < 0.5 + e.k.r;
        if (hitsArmy || hitsLeader) {
          e.dead = true;
          this.lose(e.k.kills);
          sfx('hit'); vibrate(e.kind === 'brute' ? 60 : 12);
        } else if (e.z > 4) e.dead = true;
      }
      this.enemies = this.enemies.filter((e) => {
        if (e.dead && e.bar) { this.scene.remove(e.bar, e.barBg); e.bar.material.dispose(); e.barBg.material.dispose(); }
        return !e.dead;
      });

      // --- gates
      for (const row of this.gates) {
        row.z += v * dt;
        row.group.position.z = row.z;
        if (!row.done && row.z > this.leaderZ) { // the leader walks through the gate: his side counts
          row.done = true;
          const s = this.x < 0 ? 0 : 1;
          const g = row.sides[s];
          const before = this.n;
          if (g.kind === 'add') this.n = Math.max(0, this.n + g.val);
          else if (g.kind === 'mul') this.n += Math.min(this.n * (g.val - 1), Math.round(25 + this.dist / 6)); // multipliers can't snowball forever
          else this.n = Math.ceil(this.n / g.val);
          this.n = Math.min(MAX_ARMY, this.n);
          const diff = this.n - before;
          this.float((diff >= 0 ? '+' : '') + fmt(diff), diff >= 0 ? '#5dff8f' : '#ff5a6a');
          if (diff >= 0) { sfx('coin'); vibrate(10); } else { sfx('bad'); vibrate(30); this.pop(this.sx, 0.8, 0, '#3a8dff', 6); }
          row.meshes[1 - s].visible = false;
        }
      }
      this.gates = this.gates.filter((row) => {
        if (row.z > 3) { this.scene.remove(row.group); for (const g of row.sides) g.tx.tex.dispose(); return false; }
        return true;
      });

      // --- barrels
      for (const b of this.barrels) {
        b.z += v * dt;
        b.group.position.z = b.z;
        if (b.z > 4) b.dead = true;
      }
      this.barrels = this.barrels.filter((b) => { if (b.dead) { this.scene.remove(b.group); b.tx.tex.dispose(); } return !b.dead; });

      // --- boss
      if (this.boss) {
        const B = this.boss;
        if (!B.contact) {
          B.z += (v + (running ? 1.4 : 0)) * dt;
          if (B.z > this.leaderZ - 1.6) { B.contact = true; B.z = this.leaderZ - 1.6; }
        } else if (running) {
          B.crush = (B.crush || 0) + dt * (3 + this.bosses * 1.5);
          if (B.crush >= 1) { this.lose(Math.floor(B.crush)); B.crush %= 1; sfx('hit'); vibrate(20); }
        }
        B.x += clamp(this.sx - B.x, -1, 1) * 0.6 * dt;
        if (B.hitT > 0) B.hitT -= dt;
        this.boss3.position.set(B.x + (B.hitT > 0 ? (Math.random() - 0.5) * 0.2 : 0), 0, B.z);
        const sw = Math.sin(this.time * (B.contact ? 10 : 4)) * (B.contact ? 0.9 : 0.3);
        this.boss3.userData.arms[0].rotation.x = sw; this.boss3.userData.arms[1].rotation.x = -sw;
        this.ui.bossBar.style.width = Math.max(0, (B.hp / B.max) * 100) + '%';
      }

      // --- pops
      for (const p of this.pops) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= 18 * dt; }
      this.pops = this.pops.filter((p) => p.t < 0.6);

      if (this.state === 'run' && this.n <= 0) this.over();
      this.draw3D();
    }

    fire(dt) {
      this.fireT -= dt;
      if (this.fireT > 0 || this.n <= 0) return;
      const interval = 0.11 / this.fireMult;
      this.fireT += interval;
      const dps = Math.pow(this.n, 0.75) * 1.3 * this.dmgMult * this.fireMult;
      const shooters = Math.min(this.n, 9, MAX_BULLETS - this.bullets.length);
      if (shooters <= 0) return;
      const dmg = (dps * interval) / shooters;
      const vis = Math.min(this.n, MAX_VIS);
      for (let i = 0; i < shooters; i++) {
        const f = FORM[Math.floor(Math.random() * vis)];
        this.bullets.push({ x: this.sx + f[0] + 0.12, z: f[1] - 0.6, dmg });
      }
      if (Math.random() < 0.25) sfx('tap');
    }

    killBoss() {
      const B = this.boss;
      this.boss = null;
      this.bosses++;
      this.kills += 1;
      this.dmgMult *= 1.25;
      this.boss3.visible = false;
      this.ui.boss.hidden = true;
      this.pop(B.x, 3, B.z, '#bfe4ff', 20);
      this.float('BOSS DOWN! Damage +25%', '#ffd23a');
      sfx('win'); vibrate([40, 30, 80]);
    }

    over() {
      this.state = 'over';
      const d = Math.floor(this.dist);
      const newBest = d > this.best;
      if (newBest) { this.best = d; Save.data.best.gate = d; Save.save(); }
      const coins = Math.round((d / 4 + this.kills * 0.4) * GH.Town.bonus.goldMult());
      const troops = Math.floor(d / 25) + this.bosses * 15;
      const chest = this.bosses >= 2 ? 'gold' : this.bosses === 1 ? 'silver' : d >= 250 ? 'wood' : null;
      this.api.runOver({
        title: newBest ? 'New record!' : 'Run over',
        stats: [['Distance', `${fmt(d)} m`], ['Best', `${fmt(this.best)} m`], ['Enemies', fmt(this.kills)], ['Bosses', this.bosses]],
        rewards: { coins, troops },
        chest,
        canRevive: !this.revived,
      });
    }

    revive() {
      this.revived = true;
      this.n = Math.max(12, Math.ceil(this.peak * 0.35));
      for (const e of this.enemies) if (e.z > -35) e.dead = true;
      if (this.boss) { this.boss.contact = false; this.boss.z = -40; }
      this.state = 'run';
      this.float(`+${this.n}`, '#5dff8f');
      sfx('level');
    }

    // ---------------------------------------------------------------- render
    draw3D() {
      const K = this.K, d = this.dummy;
      this.peak = Math.max(this.peak, this.n);
      // trees
      const [lower, cap] = this.treeMeshes;
      this.trees.forEach((t, i) => {
        d.rotation.set(0, 0, 0);
        d.scale.setScalar(t.s);
        d.position.set(t.x, 1.3 * t.s, t.z); d.updateMatrix(); lower.setMatrixAt(i, d.matrix);
        d.position.set(t.x, 2.5 * t.s, t.z); d.updateMatrix(); cap.setMatrixAt(i, d.matrix);
      });
      lower.instanceMatrix.needsUpdate = cap.instanceMatrix.needsUpdate = true;

      // soldiers
      const vis = Math.min(Math.ceil(this.n), MAX_VIS);
      const run = this.state === 'run';
      for (let i = 0; i < vis; i++) {
        const [ox, oz] = FORM[i];
        const bob = run ? Math.abs(Math.sin(this.time * 14 + i)) * 0.08 : 0;
        const x = this.sx + ox, z = oz + 0.2;
        d.rotation.set(0, 0, 0); d.scale.setScalar(1);
        d.position.set(x, 0.45 + bob, z); d.updateMatrix(); this.solBody.setMatrixAt(i, d.matrix);
        d.position.set(x, 0.92 + bob, z); d.updateMatrix(); this.solHead.setMatrixAt(i, d.matrix);
        d.position.set(x, 0.98 + bob, z); d.updateMatrix(); this.solHelm.setMatrixAt(i, d.matrix);
        d.position.set(x + 0.18, 0.6 + bob, z - 0.25); d.updateMatrix(); this.solGun.setMatrixAt(i, d.matrix);
      }
      for (const m of [this.solBody, this.solHead, this.solHelm, this.solGun]) { m.count = vis; m.instanceMatrix.needsUpdate = true; }

      // enemies
      let n = 0;
      for (const e of this.enemies) {
        const s = e.k.scale;
        const bob = Math.abs(Math.sin(e.phase)) * 0.08 * s;
        d.rotation.set(0, 0, Math.sin(e.phase) * 0.08);
        d.scale.setScalar(s * (e.hitT > 0 ? 1.12 : 1));
        d.position.set(e.x, 0.55 * s + bob, e.z); d.updateMatrix(); this.enBody.setMatrixAt(n, d.matrix);
        this.enBody.setColorAt(n, this.col.set(e.hitT > 0 ? '#ffffff' : e.k.color));
        d.position.set(e.x, 1.08 * s + bob, e.z + 0.05 * s); d.updateMatrix(); this.enHead.setMatrixAt(n, d.matrix);
        this.enHead.setColorAt(n, this.col.set(e.k.head));
        if (e.bar) {
          const w = 1.6;
          e.barBg.position.set(e.x, 2.9, e.z); e.barBg.scale.set(w + 0.1, 0.2, 1);
          e.bar.position.set(e.x - w / 2, 2.9, e.z); e.bar.scale.set(Math.max(0.01, (w * e.hp) / e.max), 0.13, 1);
        }
        n++;
      }
      for (const m of [this.enBody, this.enHead]) {
        m.count = n; m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }

      // bullets
      this.bullets.forEach((b, i) => { d.rotation.set(0, 0, 0); d.scale.setScalar(1); d.position.set(b.x, 0.7, b.z); d.updateMatrix(); this.bullets3.setMatrixAt(i, d.matrix); });
      this.bullets3.count = this.bullets.length; this.bullets3.instanceMatrix.needsUpdate = true;

      // debris
      this.pops.forEach((p, i) => {
        d.rotation.set(p.t * 8, p.t * 6, 0); d.scale.setScalar(1 - p.t);
        d.position.set(p.x, Math.max(0.1, p.y), p.z); d.updateMatrix(); this.popMesh.setMatrixAt(i, d.matrix);
        this.popMesh.setColorAt(i, this.col.set(p.c));
      });
      this.popMesh.count = this.pops.length; this.popMesh.instanceMatrix.needsUpdate = true;
      if (this.popMesh.instanceColor) this.popMesh.instanceColor.needsUpdate = true;

      // camera follows loosely
      const cx = (this.x + this.sx) / 2;
      this.camera.position.set(cx * 0.45, 9.5, 10.5);
      this.camera.lookAt(cx * 0.3, 0, -9);

      // leader, his heading chevron and the gate he is about to take
      const lz = this.leaderZ;
      const lb = run ? Math.abs(Math.sin(this.time * 12)) * 0.1 : 0;
      this.leader.position.set(this.x, lb, lz);
      this.leader.rotation.y = clamp((this.x - this.targetX) * 0.25, -0.5, 0.5); // leans into turns; cape faces the camera
      K.animLegs(this.leader, this.time * 12, run);
      this.leader.visible = this.n > 0;
      this.chevron.position.set(this.x, 0.06, lz - 1.6 - Math.abs(Math.sin(this.time * 4)) * 0.4);
      const next = this.gates.find((r) => !r.done);
      for (const row of this.gates) {
        row.meshes.forEach((m, s) => {
          const chosen = row === next && (this.x < 0 ? 0 : 1) === s;
          m.scale.setScalar(chosen ? 1.06 + Math.sin(this.time * 8) * 0.03 : 1);
          m.children[0].material.opacity = row === next && !chosen ? 0.55 : 1;
        });
      }

      // HUD
      const dist = `${fmt(Math.floor(this.dist))} m`;
      if (dist !== this.uiDist) { this.uiDist = dist; this.ui.dist.textContent = dist; }
      const buffs = `${this.fireMult > 1.01 ? `🔥×${this.fireMult.toFixed(1)} ` : ''}${this.dmgMult > 1.01 ? `💥×${this.dmgMult.toFixed(1)}` : ''}`;
      if (buffs !== this.uiBuffs) { this.uiBuffs = buffs; this.ui.buffs.textContent = buffs; }
      const cnt = fmt(Math.max(0, Math.round(this.shownN)));
      if (cnt !== this.uiCnt) { this.uiCnt = cnt; this.ui.count.textContent = cnt; }
      const p = K.toScreen(new THREE.Vector3(this.x, 3.7, lz), this.camera, this.ly.el); // count rides above the leader
      this.ui.count.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    }

    draw() { this.renderer.render(this.scene, this.camera); }

    destroy() {
      window.removeEventListener('resize', this.resize);
      window.removeEventListener('keydown', this.h.key);
      window.removeEventListener('keyup', this.h.key);
      this.scene.traverse((o) => { if (o.material && o.material.map) o.material.map.dispose(); });
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.ly.destroy();
    }
  }

  GH.Games.gate = {
    id: 'gate',
    name: 'Gate Rush',
    tagline: 'Endless army run. How far can you get?',
    icon: '🪖',
    colors: ['#1c4fa0', '#3a8dff'],
    create: (opts) => new GateRush(opts),
    levelLabel: () => `Best ${fmt((Save.data.best && Save.data.best.gate) || 0)} m`,
  };
})();

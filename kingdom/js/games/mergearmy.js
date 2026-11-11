/*
 * MERGE ARMY – endless 2048 + real-time battle.
 * Bottom: a classic 2048 board of number blocks. Swipe as much as you like.
 * Every merge recruits a soldier who joins your army on the field above: the bigger the
 * merge, the stronger the soldier (4 → Recruit, 8 → Archer, 16 → Knight …).
 * Enemy waves pour out of the forest forever, each one a bit tougher. There is no castle
 * to reach: you play until the board is blocked (or you tap Finish), and your loot,
 * waves and biggest block decide the rewards.
 * Town bonuses: Barracks (+HP), Forge (+damage).
 */
(function () {
  'use strict';
  const { Save, UI, sfx, vibrate, fmt, clamp } = GH;

  const N = 4;
  const LANE_HALF = 3.4, GATE_Z = 12.5, FOREST_Z = -12.5;
  const ARMY_CAP = 48, ROW = 7;
  const NAMES = ['', 'Recruit', 'Archer', 'Knight', 'Ranger', 'Champion', 'Sniper', 'Warlord', 'Marksman', 'Hero', 'Legend', 'King'];
  const roleOf = (lvl) => (lvl % 2 === 1 ? 'sword' : 'bow');
  const STATS = {
    sword: { hp: 30, dmg: 7, range: 1.2, rate: 1, speed: 2.2 },
    bow: { hp: 18, dmg: 6, range: 4.5, rate: 0.8, speed: 1.9 },
  };
  const GROW = 2.1; // each soldier level multiplies HP and damage

  /** One 2048 move: returns the new grid, per-tile moves and the merges that happened. */
  function slide(grid, dir) {
    const out = new Array(N * N).fill(null);
    const moves = [], merges = [];
    for (let k = 0; k < N; k++) {
      const idx = [];
      for (let j = 0; j < N; j++) {
        if (dir === 'left') idx.push(k * N + j);
        else if (dir === 'right') idx.push(k * N + (N - 1 - j));
        else if (dir === 'up') idx.push(j * N + k);
        else idx.push((N - 1 - j) * N + k);
      }
      const tiles = idx.filter((i) => grid[i]).map((i) => ({ ...grid[i], from: i }));
      let w = 0;
      for (let t = 0; t < tiles.length; t++) {
        const a = tiles[t], b = tiles[t + 1], to = idx[w++];
        if (b && b.lvl === a.lvl) {
          out[to] = { id: a.id, lvl: a.lvl + 1 };
          moves.push({ id: a.id, to }, { id: b.id, to, gone: true });
          merges.push({ id: a.id, lvl: a.lvl + 1 });
          t++;
        } else {
          out[to] = { id: a.id, lvl: a.lvl };
          moves.push({ id: a.id, to });
        }
      }
    }
    const moved = merges.length > 0 || moves.some((m) => grid[m.to] === null || grid[m.to].id !== m.id);
    return { grid: out, moves, merges, moved };
  }

  class MergeArmy {
    constructor({ api }) {
      this.api = api;
      this.K = GH.K3;
      this.title = 'Merge Army';
      const lv = GH.Town.lv;
      this.hpMult = 1 + 0.15 * lv('barracks');
      this.dmgMult = GH.Town.bonus.frostDmg();
      Save.data.best = Save.data.best || {};
      this.best = Save.data.best.merge || 0;
      this.grid = new Array(N * N).fill(null);
      this.nextId = 1;
      this.tileEls = new Map();
      this.units = [];
      this.arrows = [];
      this.queue = [];       // soldiers waiting to leave the castle gate
      this.spawnQ = [];      // enemies of the current wave still in the forest
      this.time = 0;
      this.state = 'play';
      this.revived = false;
      this.wave = 0; this.cleared = 0; this.waveT = 5; this.waveAge = 0;
      this.loot = 0; this.kills = 0; this.sent = 0;
      this.gate = { z: GATE_Z, cd: 0 };
      this.buildDom();
      this.buildScene();
      this.addTile(); this.addTile();
      this.renderTiles();
      api.setHudButtons([{ label: '🏁 Finish', cls: 'ghost', onClick: () => this.askFinish() }]);
      api.setLevelLabel(`Best: wave ${this.best}`);
    }

    get maxLvl() { return Math.max(0, ...this.grid.filter(Boolean).map((t) => t.lvl)); }
    get army() { return this.units.filter((u) => !u.enemy && u.hp > 0); }

    // ---------------------------------------------------------------- 2048 board (DOM)
    buildDom() {
      this.ly = this.K.layer(`
        <div class="mg-wrap">
          <div class="mg-field">
            <div class="mg-hud">
              <div class="mg-pill"><small>Wave</small><b class="w">0</b><small class="next"></small></div>
              <div class="mg-pill"><small>Army</small><b class="a">0</b></div>
              <div class="mg-pill gold"><small>Loot</small><b class="l">🪙 0</b></div>
            </div>
          </div>
          <div class="mg-board-wrap">
            <div class="mg-tip">Swipe the blocks. Every merge recruits a soldier!</div>
            <div class="mg-board"><div class="mg-cells"></div><div class="mg-tiles"></div></div>
          </div>
        </div>`);
      const el = this.ly.el;
      this.ui = {
        field: el.querySelector('.mg-field'), board: el.querySelector('.mg-board'), tiles: el.querySelector('.mg-tiles'),
        cells: el.querySelector('.mg-cells'), tip: el.querySelector('.mg-tip'),
        wave: el.querySelector('.mg-pill .w'), next: el.querySelector('.mg-pill .next'), army: el.querySelector('.mg-pill .a'), loot: el.querySelector('.mg-pill .l'),
      };
      for (let i = 0; i < N * N; i++) this.ui.cells.appendChild(document.createElement('div'));

      let start = null;
      this.h = {
        down: (e) => { if (e.target.closest('button')) return; start = { x: e.clientX, y: e.clientY }; try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } },
        up: (e) => {
          if (!start) return;
          const dx = e.clientX - start.x, dy = e.clientY - start.y;
          start = null;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
          this.swipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
        },
        key: (e) => {
          const d = { arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down' }[e.key.toLowerCase()];
          if (d) { e.preventDefault(); this.swipe(d); }
        },
      };
      el.addEventListener('pointerdown', this.h.down);
      el.addEventListener('pointerup', this.h.up);
      el.addEventListener('pointercancel', () => { start = null; });
      window.addEventListener('keydown', this.h.key);
    }

    addTile() {
      const empty = this.grid.map((t, i) => (t ? -1 : i)).filter((i) => i >= 0);
      if (!empty.length) return;
      const i = empty[Math.floor(Math.random() * empty.length)];
      this.grid[i] = { id: this.nextId++, lvl: Math.random() < 0.1 ? 2 : 1, born: true };
    }

    swipe(dir) {
      if (this.state !== 'play' || this.paused || UI.modalCount || document.querySelector('.ad-player')) return;
      const res = slide(this.grid, dir);
      if (!res.moved) { this.ui.board.classList.remove('shake'); void this.ui.board.offsetWidth; this.ui.board.classList.add('shake'); return; }
      this.lastMoves = res.moves;
      this.grid = res.grid;
      for (const m of res.merges) {
        const t = this.grid.find((x) => x && x.id === m.id);
        if (t) t.merged = true;
        this.queue.push({ lvl: m.lvl - 1, delay: this.queue.length * 0.12 }); // 4 → level 1 soldier, 8 → level 2 …
      }
      this.addTile();
      this.renderTiles();
      if (res.merges.length) { sfx(res.merges.length > 1 ? 'level' : 'pop'); vibrate(10); this.ui.tip.hidden = true; } else sfx('tap');
      if (!this.canMove()) this.over(true);
    }

    canMove() { return ['up', 'down', 'left', 'right'].some((d) => slide(this.grid, d).moved); }

    /** Clear the smallest blocks (used by revive and when resuming a blocked board). */
    clearSmallest(kinds) {
      for (let k = 0; k < kinds; k++) {
        const tiles = this.grid.filter(Boolean);
        if (tiles.length < 4) break;
        const min = Math.min(...tiles.map((t) => t.lvl));
        this.grid = this.grid.map((t) => (t && t.lvl === min ? null : t));
      }
      if (this.ui) this.renderTiles();
    }

    renderTiles() {
      const size = this.ui.board.clientWidth;
      const gap = Math.max(6, size * 0.025), cell = (size - gap * (N + 1)) / N;
      this.ui.board.style.setProperty('--cell', cell + 'px');
      this.ui.board.style.setProperty('--gap', gap + 'px');
      const pos = (i) => `translate(${gap + (i % N) * (cell + gap)}px, ${gap + Math.floor(i / N) * (cell + gap)}px)`;
      const alive = new Set();
      this.grid.forEach((t, i) => {
        if (!t) return;
        alive.add(t.id);
        let el = this.tileEls.get(t.id);
        if (!el) {
          el = document.createElement('div');
          el.className = 'mg-tile';
          this.ui.tiles.appendChild(el);
          this.tileEls.set(t.id, el);
        }
        const v = 2 ** t.lvl;
        el.textContent = v;
        el.dataset.v = Math.min(v, 4096);
        el.style.transform = pos(i);
        el.classList.toggle('big', v >= 1024);
        if (t.merged || t.born) { el.classList.remove('pop', 'born'); void el.offsetWidth; el.classList.add(t.merged ? 'pop' : 'born'); }
        delete t.merged; delete t.born;
      });
      // merged-away blocks slide into their partner, then disappear
      for (const [id, el] of this.tileEls) {
        if (alive.has(id)) continue;
        const mv = (this.lastMoves || []).find((m) => m.id === id);
        if (mv) el.style.transform = pos(mv.to);
        el.style.zIndex = 0;
        this.tileEls.delete(id);
        setTimeout(() => el.remove(), 110);
      }
    }

    // ---------------------------------------------------------------- battle lane (3D)
    buildScene() {
      const T = THREE, K = this.K, field = this.ui.field;
      this.renderer = K.renderer(field);
      const scene = (this.scene = new T.Scene());
      scene.background = new T.Color('#8fcbe8');
      this.camera = new T.PerspectiveCamera(45, 1, 0.5, 160);
      this.camPos = new T.Vector3(0, 34, 13);
      scene.add(new T.HemisphereLight('#ffffff', '#6f8f5a', 1.8));
      const sun = new T.DirectionalLight('#fff3dd', 2.2);
      sun.position.set(-8, 22, 6);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
      scene.add(sun);
      const ground = new T.Mesh(new T.PlaneGeometry(60, 60), K.lam('#7cc36a'));
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
      scene.add(ground);
      const lane = new T.Mesh(new T.PlaneGeometry(LANE_HALF * 2 + 1, GATE_Z * 2), K.lam('#e3cf9a'));
      lane.rotation.x = -Math.PI / 2; lane.position.y = 0.01; lane.receiveShadow = true;
      scene.add(lane);
      for (const [z, color] of [[GATE_Z + 1.2, '#3a7bd5']]) {
        const c = new T.Group();
        c.add(K.box(6, 2.6, 2, K.lam('#b9b2a6'), 0, 1.3, 0));
        for (const x of [-3, 3]) { c.add(K.box(1.4, 3.6, 1.4, K.lam('#a79c8e'), x, 1.8, 0)); const r = K.mesh(new T.ConeGeometry(1.1, 1.4, 4), K.lam(color), x, 4.3, 0); r.rotation.y = Math.PI / 4; c.add(r); }
        c.add(K.box(1.4, 1.6, 0.2, K.lam('#6e4424'), 0, 0.8, z > 0 ? -1.05 : 1.05));
        c.add(K.box(0.06, 1.6, 0.06, K.lam('#555'), 0, 3.4, 0), K.box(0.8, 0.5, 0.04, K.lam(color), 0.42, 3.9, 0));
        c.position.z = z;
        scene.add(c);
      }
      // the enemy comes out of a dark forest: you never see where the road ends
      const trunk = K.lam('#5a3d25'), leaves = [K.lam('#2f6b3a'), K.lam('#285c33'), K.lam('#3a7a42')];
      for (let i = 0; i < 46; i++) {
        const x = -11 + (i % 23) * 1.0 + (Math.random() - 0.5) * 0.6, z = FOREST_Z - 1.2 - Math.floor(i / 23) * 1.6 - Math.random() * 0.8;
        if (Math.abs(x) < LANE_HALF + 0.3 && i < 23) continue; // the road opens into the forest
        const h = 2.2 + Math.random() * 1.6;
        scene.add(K.mesh(K.geo.cyl, trunk, x, 0.5, z, 0.3, 1, 0.3));
        scene.add(K.mesh(new T.ConeGeometry(1, h, 7), leaves[i % 3], x, 1 + h / 2, z));
      }
      for (let i = 0; i < 18; i++) {
        const side = i % 2 ? 1 : -1, z = FOREST_Z + 2 + Math.floor(i / 2) * 2.6;
        const h = 1.8 + Math.random();
        scene.add(K.mesh(new T.ConeGeometry(0.8, h, 7), leaves[i % 3], side * (LANE_HALF + 2 + Math.random() * 3), h / 2, z));
      }
      const fog = new T.Mesh(new T.PlaneGeometry(30, 7), new T.MeshBasicMaterial({ color: '#dfe9ef', transparent: true, opacity: 0.55, depthWrite: false }));
      fog.rotation.x = -Math.PI / 2; fog.position.set(0, 2.6, FOREST_Z - 3.5);
      scene.add(fog);
      this.arrowMesh = new T.InstancedMesh(new T.BoxGeometry(0.06, 0.06, 0.6), K.lam('#6e4424'), 200);
      this.arrowMesh.frustumCulled = false; this.arrowMesh.count = 0;
      scene.add(this.arrowMesh);
      this.dummy = new T.Object3D();
      this.badges = {};
      // fit the whole lane (both castles) into the battle view, whatever its shape
      this.onResize = () => {
        const r = field.getBoundingClientRect();
        if (r.width && r.height) {
          this.renderer.setSize(r.width, r.height, false);
          this.renderer.domElement.style.width = '100%';
          this.renderer.domElement.style.height = '100%';
          const aspect = r.width / r.height, dist = this.camPos.length();
          const vNeed = 2 * Math.atan(((GATE_Z + 3.5) * 0.95) / dist); // lane seen from ~70° above
          const hNeed = 2 * Math.atan((LANE_HALF + 3) / dist / aspect);
          this.camera.aspect = aspect;
          this.camera.fov = clamp((Math.max(vNeed, hNeed) * 180) / Math.PI, 30, 85);
          this.camera.updateProjectionMatrix();
        }
        this.renderTiles();
      };
      window.addEventListener('resize', this.onResize);
      this.onResize();
    }

    badge(lvl, enemy) {
      const key = lvl + (enemy ? 'e' : 'p');
      if (this.badges[key]) return this.badges[key];
      const tx = this.K.canvasTex(128, 80);
      tx.ctx.fillStyle = enemy ? '#c0392b' : '#1c4fa0';
      GH.roundRect(tx.ctx, 6, 6, 116, 68, 20); tx.ctx.fill();
      tx.ctx.font = '900 46px system-ui, sans-serif'; tx.ctx.textAlign = 'center'; tx.ctx.textBaseline = 'middle';
      tx.ctx.fillStyle = '#fff'; tx.ctx.fillText(String(lvl), 64, 44);
      return (this.badges[key] = tx.tex);
    }

    spawnUnit(lvl, enemy, o = {}) {
      const K = this.K, T = THREE, role = roleOf(lvl), s = STATS[role], m = Math.pow(GROW, lvl - 1);
      const body = enemy ? (role === 'sword' ? '#c0392b' : '#d35400') : (role === 'sword' ? '#3a7bd5' : '#2f9e5a');
      const g = K.person(body, enemy ? '#5b1a14' : null);
      if (!enemy) g.add(K.mesh(K.geo.sphere, K.std(lvl >= 5 ? '#ffd84a' : lvl >= 3 ? '#c9ced8' : '#8d6e4f', { metalness: lvl >= 3 ? 0.7 : 0.1, roughness: 0.35 }), 0, 1.45, 0, 0.62, 0.5, 0.62));
      if (role === 'sword') g.add(K.box(0.1, 1, 0.05, K.std('#e8eef8', { metalness: 0.8, roughness: 0.2 }), 0.42, 0.9, 0.12));
      else { const bow = K.mesh(new T.TorusGeometry(0.4, 0.04, 6, 12, Math.PI), K.lam('#8a5a32'), 0.4, 0.95, 0.1); bow.rotation.z = -Math.PI / 2; g.add(bow); }
      const sp = new T.Sprite(new T.SpriteMaterial({ map: this.badge(lvl, enemy), depthTest: false }));
      sp.scale.set(0.6, 0.38, 1); sp.position.y = 2.2; sp.renderOrder = 9;
      g.add(sp);
      const bar = new T.Sprite(new T.SpriteMaterial({ color: enemy ? '#ff4d5e' : '#4ade80', depthTest: false }));
      bar.center.set(0, 0.5); bar.renderOrder = 8;
      this.scene.add(bar);
      const sc = (0.95 + lvl * 0.13) * (o.boss ? 1.5 : 1);
      g.scale.setScalar(sc);
      const x = o.x ?? (Math.random() - 0.5) * LANE_HALF * 1.6;
      const z = o.z ?? (enemy ? FOREST_Z : GATE_Z - 1.5);
      g.position.set(x, 0, z);
      this.scene.add(g);
      const max = s.hp * m * (enemy ? this.enemyHpMult * (o.boss ? 4 : 1) : this.hpMult);
      const u = { enemy, lvl, role, mesh: g, bar, x, z, hp: max * (o.hpFrac || 1), max, dmg: s.dmg * m * (enemy ? this.enemyDmgMult * (o.boss ? 1.5 : 1) : this.dmgMult), range: s.range, rate: s.rate, speed: s.speed * (o.boss ? 0.8 : 1), cd: 0.3, phase: 0, sc, boss: !!o.boss };
      this.units.push(u);
      return u;
    }

    removeUnit(u) { this.scene.remove(u.mesh, u.bar); u.bar.material.dispose(); }

    /** A merge recruits a soldier. A full army promotes its weakest soldier instead. */
    recruit(lvl) {
      const army = this.army;
      if (army.length < ARMY_CAP) { this.spawnUnit(lvl, false); return; }
      const weak = army.reduce((a, b) => (b.lvl < a.lvl ? b : a));
      const nl = Math.max(lvl, weak.lvl + 1);
      this.removeUnit(weak);
      this.units.splice(this.units.indexOf(weak), 1);
      this.spawnUnit(nl, false, { x: weak.x, z: weak.z });
    }

    // every wave is a little tougher than the last
    get enemyHpMult() { return Math.pow(1.075, this.wave - 1); }
    get enemyDmgMult() { return Math.pow(1.05, this.wave - 1); }

    startWave() {
      this.wave++;
      this.waveAge = 0;
      const w = this.wave, base = 1 + Math.floor(w / 4);
      const count = Math.min(26, 3 + Math.floor(w * 1.3));
      for (let i = 0; i < count; i++) {
        const lvl = Math.max(1, base + (Math.random() < 0.3 ? 1 : 0) - (Math.random() < 0.3 ? 1 : 0));
        this.spawnQ.push({ lvl, t: i * 0.45 });
      }
      if (w % 5 === 0) { this.spawnQ.push({ lvl: base + 2, t: count * 0.45 * 0.5, boss: true }); UI.toast(`👹 Wave ${w}: a warlord leads the attack!`); }
      else if (w > 1) UI.toast(`⚔️ Wave ${w} is coming!`);
      sfx('bad');
    }

    /** Formation slot for the i-th soldier (strongest in front), in front of your castle. */
    slot(i) {
      const r = Math.floor(i / ROW), c = i % ROW;
      return { x: (c - (ROW - 1) / 2) * 0.9 + (r % 2 ? 0.25 : 0), z: 2.5 + r * 1.05 };
    }

    // ---------------------------------------------------------------- loop
    update(dt) {
      if (this.state !== 'play') return;
      this.time += dt;
      this.waveAge += dt;
      // recruits leave the gate one by one
      for (const q of this.queue) q.delay -= dt;
      while (this.queue.length && this.queue[0].delay <= 0) {
        const q = this.queue.shift();
        this.recruit(q.lvl);
        this.sent++;
      }
      // waves: the next one comes 4s after you clear one, or after 32s regardless
      for (const q of this.spawnQ) q.t -= dt;
      while (this.spawnQ.length && this.spawnQ[0].t <= 0) {
        const q = this.spawnQ.shift();
        this.spawnUnit(q.lvl, true, { boss: q.boss });
      }
      const foes = this.units.some((u) => u.enemy && u.hp > 0) || this.spawnQ.length;
      if (!foes && this.wave > this.cleared) {
        this.cleared = this.wave;
        const bonus = 10 + this.wave * 4;
        this.loot += bonus;
        UI.toast(`✅ Wave ${this.wave} cleared  +${bonus} 🪙`);
        this.waveT = 4;
      }
      this.waveT -= dt;
      if ((!foes && this.waveT <= 0) || this.waveAge > 32) this.startWave();

      // soldiers hold a formation and charge anything that comes close
      const army = this.army.sort((a, b) => b.lvl - a.lvl);
      army.forEach((u, i) => { u.slot = this.slot(i); });
      for (const u of this.units) {
        if (u.hp <= 0) continue;
        let target = null, bd = u.enemy ? 3.5 : 7.5;
        for (const o of this.units) {
          if (o.hp <= 0 || o.enemy === u.enemy) continue;
          const d = Math.hypot(o.x - u.x, o.z - u.z);
          if (d < bd) { bd = d; target = o; }
        }
        u.cd -= dt;
        if (target && bd <= u.range) {
          u.moving = false;
          u.face = Math.atan2(target.x - u.x, target.z - u.z);
          if (u.cd <= 0) { u.cd = 1 / u.rate; u.swing = 0.2; this.hit(u, target); }
        } else if (u.enemy && !target && GATE_Z - 1.6 - u.z <= 0) {
          // raiders that reach your gate grab some loot and run
          const steal = Math.min(this.loot, 3 * u.lvl + this.wave);
          this.loot -= steal;
          if (steal) UI.toast(`💰 Raiders stole ${steal} 🪙`);
          u.hp = 0; u.fled = true;
        } else {
          const tx = target ? target.x : u.enemy ? u.x : u.slot.x, tz = target ? target.z : u.enemy ? GATE_Z : u.slot.z;
          const dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz);
          if (!u.enemy && !target && d < 0.15) { u.moving = false; u.face = Math.PI; }
          else {
            u.moving = true;
            const st = Math.min(d, u.speed * dt);
            u.x = clamp(u.x + (dx / (d || 1)) * st, -LANE_HALF, LANE_HALF);
            u.z += (dz / (d || 1)) * st;
            u.face = Math.atan2(dx, dz);
            u.phase += dt * 12;
          }
        }
        if (u.swing > 0) u.swing -= dt;
      }
      // keep crowds from stacking
      for (let i = 0; i < this.units.length; i++) for (let j = i + 1; j < this.units.length; j++) {
        const a = this.units[i], b = this.units[j];
        if (a.hp <= 0 || b.hp <= 0) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = 0.6;
        if (d < min && d > 0.001) { const k = (min - d) / 2; a.x -= (dx / d) * k; a.z -= (dz / d) * k; b.x += (dx / d) * k; b.z += (dz / d) * k; }
      }
      // your castle towers cover the gate
      const c = this.gate;
      c.cd -= dt;
      if (c.cd <= 0) {
        let target = null, bd = 7;
        for (const u of this.units) {
          if (u.hp <= 0 || !u.enemy) continue;
          const d = Math.abs(u.z - c.z);
          if (d < bd) { bd = d; target = u; }
        }
        if (target) { c.cd = 0.7; this.arrows.push({ x: (Math.random() - 0.5) * 5, z: c.z - 1, target, dmg: 14 * this.dmgMult * (1 + this.wave * 0.08) }); }
      }
      for (const a of this.arrows) {
        const t = a.target, dx = t.x - a.x, dz = t.z - a.z, d = Math.hypot(dx, dz);
        if (d < 0.4 || t.hp <= 0) { a.done = true; if (t.hp > 0) this.damage(t, a.dmg); continue; }
        const st = Math.min(d, 16 * dt);
        a.x += (dx / d) * st; a.z += (dz / d) * st; a.ry = Math.atan2(dx, dz);
      }
      this.arrows = this.arrows.filter((a) => !a.done);
      for (const u of this.units) if (u.hp <= 0 && !u.deadT) u.deadT = 0.001;
      for (const u of this.units) if (u.deadT) u.deadT += dt;
      this.units = this.units.filter((u) => {
        if (u.deadT > 0.6) { this.removeUnit(u); return false; }
        return true;
      });
    }

    damage(t, dmg) {
      const was = t.hp;
      t.hp -= dmg;
      if (t.enemy && was > 0 && t.hp <= 0) { this.kills++; this.loot += 2 * t.lvl + (t.boss ? 40 : 0); }
    }

    hit(u, target) {
      if (u.role === 'bow') this.arrows.push({ x: u.x, z: u.z, target, dmg: u.dmg });
      else { this.damage(target, u.dmg); if (Math.random() < 0.25) sfx('hit'); }
    }

    askFinish() {
      if (this.state !== 'play') return;
      this.paused = true;
      UI.modal({
        title: 'Finish this run?', icon: '🏁', sub: `Wave ${this.wave} · ${this.army.length} soldiers · 🪙 ${fmt(this.loot)} loot. You can also leave any time: the run is saved.`,
        buttons: [
          { label: 'Finish & collect', cls: 'green', onClick: () => { this.paused = false; this.over(false); } },
          { label: 'Keep playing', cls: 'ghost', onClick: () => { this.paused = false; } },
        ],
      });
    }

    /** The run ends when the board is blocked (or the player finishes it). */
    over(blocked) {
      if (this.state !== 'play') return;
      this.state = 'over';
      const cleared = this.cleared, newBest = cleared > this.best;
      if (newBest) { this.best = cleared; Save.data.best.merge = cleared; Save.save(); }
      const big = 2 ** this.maxLvl;
      const chest = cleared >= 15 ? 'gold' : cleared >= 8 ? 'silver' : cleared >= 3 ? 'wood' : null;
      sfx(blocked ? 'lose' : 'win');
      setTimeout(() => this.api.runOver({
        title: newBest ? 'New record!' : blocked ? 'Board full' : 'Run finished',
        stats: [['Waves cleared', cleared], ['Best', this.best], ['Biggest block', fmt(big)], ['Soldiers', fmt(this.sent)], ['Enemies', fmt(this.kills)]],
        rewards: { coins: Math.round((this.loot + big / 4) * GH.Town.bonus.goldMult()), troops: Math.floor(cleared * 2 + this.sent / 4) },
        chest,
        canRevive: blocked && !this.revived,
      }), blocked ? 600 : 100);
    }

    revive() {
      this.revived = true;
      this.clearSmallest(2);
      this.state = 'play';
      UI.toast('Small blocks cleared. Keep merging!');
      sfx('level');
    }

    // ---------------------------------------------------------------- save state
    snapshot() {
      if (this.state !== 'play') return null;
      return {
        grid: this.grid.map((t) => (t ? t.lvl : 0)),
        wave: this.cleared, loot: this.loot, kills: this.kills, sent: this.sent, time: this.time, revived: this.revived,
        army: this.army.map((u) => [u.lvl, Math.round((u.hp / u.max) * 100) / 100]).concat(this.queue.map((q) => [q.lvl, 1])),
        label: `Wave ${this.cleared + 1} · ${this.army.length + this.queue.length} soldiers · 🪙 ${fmt(this.loot)}`,
      };
    }

    restore(s) {
      this.grid = s.grid.map((l) => (l ? { id: this.nextId++, lvl: l } : null));
      for (const el of this.tileEls.values()) el.remove();
      this.tileEls.clear();
      this.wave = this.cleared = s.wave;
      this.loot = s.loot; this.kills = s.kills; this.sent = s.sent; this.time = s.time; this.revived = s.revived;
      s.army.slice(0, ARMY_CAP).forEach(([lvl, f], i) => { const p = this.slot(i); this.spawnUnit(lvl, false, { x: p.x, z: p.z, hpFrac: f }); });
      this.waveT = 4;
      if (!this.canMove()) this.clearSmallest(1);
      this.renderTiles();
      this.ui.tip.hidden = true;
    }

    draw() {
      const d = this.dummy;
      for (const u of this.units) {
        const m = u.mesh;
        if (u.deadT) {
          m.rotation.z = Math.min(1.5, u.deadT * 5);
          m.scale.setScalar(u.sc * Math.max(0.01, 1 - u.deadT));
          u.bar.visible = false;
          continue;
        }
        m.position.set(u.x, 0, u.z);
        m.rotation.y = u.face || 0;
        m.rotation.x = u.swing > 0 ? (u.role === 'sword' ? 0.5 : 0.15) : 0;
        this.K.animLegs(m, u.phase, u.moving);
        const w = 0.5 + u.lvl * 0.12;
        u.bar.position.set(u.x - w / 2, 1.9 * u.sc + 0.9, u.z);
        u.bar.scale.set(Math.max(0.01, (w * u.hp) / u.max), 0.1, 1);
      }
      this.arrows.forEach((a, i) => {
        if (i >= 200) return;
        d.position.set(a.x, 1, a.z); d.rotation.set(0, a.ry || 0, 0); d.updateMatrix();
        this.arrowMesh.setMatrixAt(i, d.matrix);
      });
      this.arrowMesh.count = Math.min(200, this.arrows.length);
      this.arrowMesh.instanceMatrix.needsUpdate = true;
      const foes = this.units.some((u) => u.enemy && u.hp > 0) || this.spawnQ.length;
      this.ui.wave.textContent = Math.max(1, this.wave);
      this.ui.next.textContent = foes ? 'fighting' : `next in ${Math.max(0, Math.ceil(this.waveT))}s`;
      this.ui.army.textContent = this.army.length + this.queue.length;
      this.ui.loot.textContent = `🪙 ${fmt(this.loot)}`;
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(0, 0, 0.8);
      this.renderer.render(this.scene, this.camera);
    }

    destroy() {
      window.removeEventListener('resize', this.onResize);
      window.removeEventListener('keydown', this.h.key);
      for (const t of Object.values(this.badges)) t.dispose();
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.ly.destroy();
      this.ui = null;
    }
  }

  GH.Games.merge = {
    id: 'merge',
    name: 'Merge Army',
    tagline: 'Swipe 2048 blocks to send soldiers into battle.',
    icon: '⚔️',
    colors: ['#7a1f16', '#e0772b'],
    create: (opts) => new MergeArmy(opts),
    levelLabel: () => `Best: wave ${(Save.data.best && Save.data.best.merge) || 0}`,
  };
  GH.Games.merge.slide = slide; // exposed for tests
})();

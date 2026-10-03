/*
 * MERGE ARMY – real-time 2048 + lane battle.
 * Bottom: a classic 2048 board of number blocks. Swipe as much as you like.
 * Every merge sends a soldier into the 3D battle lane above: the bigger the merge,
 * the stronger the soldier (4 → Recruit, 8 → Archer, 16 → Knight …).
 * Enemies march out of their castle on a timer, so keep merging. Destroy the enemy
 * castle to win; lose your own and the level is lost.
 * Town bonuses: Barracks (+HP), Forge (+damage), Walls (+castle HP).
 */
(function () {
  'use strict';
  const { Save, UI, sfx, vibrate, fmt, clamp } = GH;

  const N = 4;
  const LANE_HALF = 3.4, CASTLE_Z = 12.5;
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
    constructor({ api, level }) {
      this.api = api;
      this.K = GH.K3;
      this.level = level;
      this.title = 'Merge Army';
      const lv = GH.Town.lv;
      this.hpMult = 1 + 0.15 * lv('barracks');
      this.dmgMult = GH.Town.bonus.frostDmg();
      this.grid = new Array(N * N).fill(null);
      this.nextId = 1;
      this.tileEls = new Map();
      this.units = [];
      this.arrows = [];
      this.queue = [];       // soldiers waiting to leave the castle gate
      this.time = 0;
      this.state = 'play';
      this.revived = false;
      const castleHp = 400 * (1 + 0.2 * lv('walls'));
      this.castles = {
        me: { hp: castleHp, max: castleHp, z: CASTLE_Z },
        foe: { hp: 1200 + 200 * (level - 1), max: 1200 + 200 * (level - 1), z: -CASTLE_Z },
      };
      this.castles.me.cd = this.castles.foe.cd = 0;
      this.enemyT = 2.5;
      this.bruteT = 30;
      this.buildDom();
      this.buildScene();
      this.addTile(); this.addTile();
      this.renderTiles();
      api.setHudButtons([]);
    }

    // ---------------------------------------------------------------- 2048 board (DOM)
    buildDom() {
      this.ly = this.K.layer(`
        <div class="mg-wrap">
          <div class="mg-field">
            <div class="mg-castles">
              <div class="mg-cbar foe"><span>🏰</span><div><i></i></div></div>
              <div class="mg-cbar me"><span>🏰</span><div><i></i></div></div>
            </div>
            <div class="mg-score"><b>0</b><small>soldiers sent</small></div>
          </div>
          <div class="mg-board-wrap">
            <div class="mg-tip">Swipe the blocks. Every merge sends a soldier!</div>
            <div class="mg-board"><div class="mg-cells"></div><div class="mg-tiles"></div></div>
          </div>
        </div>`);
      const el = this.ly.el;
      this.ui = {
        field: el.querySelector('.mg-field'), board: el.querySelector('.mg-board'), tiles: el.querySelector('.mg-tiles'),
        cells: el.querySelector('.mg-cells'), foe: el.querySelector('.mg-cbar.foe i'), me: el.querySelector('.mg-cbar.me i'),
        sent: el.querySelector('.mg-score b'), tip: el.querySelector('.mg-tip'),
      };
      for (let i = 0; i < N * N; i++) this.ui.cells.appendChild(document.createElement('div'));
      this.sent = 0;

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
      if (!['up', 'down', 'left', 'right'].some((d) => slide(this.grid, d).moved)) this.unjam();
    }

    /** No moves left: clear the smallest blocks so the board keeps flowing. */
    unjam() {
      const min = Math.min(...this.grid.filter(Boolean).map((t) => t.lvl));
      this.grid = this.grid.map((t) => (t && t.lvl === min ? null : t));
      setTimeout(() => { if (this.ui) this.renderTiles(); }, 150);
      UI.toast(`Board jammed: all ${2 ** min}s cleared`);
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
      const lane = new T.Mesh(new T.PlaneGeometry(LANE_HALF * 2 + 1, CASTLE_Z * 2), K.lam('#e3cf9a'));
      lane.rotation.x = -Math.PI / 2; lane.position.y = 0.01; lane.receiveShadow = true;
      scene.add(lane);
      for (const [z, color] of [[CASTLE_Z + 1.2, '#3a7bd5'], [-CASTLE_Z - 1.2, '#c0392b']]) {
        const c = new T.Group();
        c.add(K.box(6, 2.6, 2, K.lam('#b9b2a6'), 0, 1.3, 0));
        for (const x of [-3, 3]) { c.add(K.box(1.4, 3.6, 1.4, K.lam('#a79c8e'), x, 1.8, 0)); const r = K.mesh(new T.ConeGeometry(1.1, 1.4, 4), K.lam(color), x, 4.3, 0); r.rotation.y = Math.PI / 4; c.add(r); }
        c.add(K.box(1.4, 1.6, 0.2, K.lam('#6e4424'), 0, 0.8, z > 0 ? -1.05 : 1.05));
        c.add(K.box(0.06, 1.6, 0.06, K.lam('#555'), 0, 3.4, 0), K.box(0.8, 0.5, 0.04, K.lam(color), 0.42, 3.9, 0));
        c.position.z = z;
        scene.add(c);
      }
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
          const vNeed = 2 * Math.atan(((CASTLE_Z + 3.5) * 0.95) / dist); // lane seen from ~70° above
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

    spawnUnit(lvl, enemy) {
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
      const sc = 0.95 + lvl * 0.13;
      g.scale.setScalar(sc);
      const x = (Math.random() - 0.5) * LANE_HALF * 1.6;
      const z = enemy ? -CASTLE_Z + 1.5 : CASTLE_Z - 1.5;
      g.position.set(x, 0, z);
      this.scene.add(g);
      const hp = s.hp * m * (enemy ? this.enemyHpMult : this.hpMult);
      this.units.push({ enemy, lvl, role, mesh: g, bar, x, z, hp, max: hp, dmg: s.dmg * m * (enemy ? this.enemyDmgMult : this.dmgMult), range: s.range, rate: s.rate, speed: s.speed, cd: 0.3, phase: 0, sc });
    }

    // enemies get smoothly stronger per level, and toughen the longer a battle lasts
    get enemyHpMult() { return Math.pow(1.07, this.level - 1) * (1 + this.time / 200); }
    get enemyDmgMult() { return Math.pow(1.05, this.level - 1); }

    enemyLevel() {
      const base = 1 + Math.floor(this.time / 35);
      return Math.max(1, base + (Math.random() < 0.35 ? 1 : 0) - (Math.random() < 0.3 ? 1 : 0));
    }

    // ---------------------------------------------------------------- loop
    update(dt) {
      if (this.state !== 'play') return;
      this.time += dt;
      // your soldiers leave the gate one by one
      for (const q of this.queue) q.delay -= dt;
      while (this.queue.length && this.queue[0].delay <= 0) {
        const q = this.queue.shift();
        this.spawnUnit(q.lvl, false);
        this.sent++;
        this.ui.sent.textContent = this.sent;
      }
      // enemy waves on a timer, plus a brute every 30s
      this.enemyT -= dt;
      if (this.enemyT <= 0) {
        this.enemyT = Math.max(1.6, 3 - this.time / 90);
        const squad = 2 + Math.floor(this.level / 6) + Math.floor(this.time / 60); // squads grow with level and time
        for (let i = 0; i < squad; i++) this.spawnUnit(this.enemyLevel(), true);
      }
      this.bruteT -= dt;
      if (this.bruteT <= 0) { this.bruteT = 30; this.spawnUnit(this.enemyLevel() + 2, true); UI.toast('👹 A brute is charging!'); }

      for (const u of this.units) {
        if (u.hp <= 0) continue;
        let target = null, bd = 3.5;
        for (const o of this.units) {
          if (o.hp <= 0 || o.enemy === u.enemy) continue;
          const d = Math.hypot(o.x - u.x, o.z - u.z);
          if (d < bd) { bd = d; target = o; }
        }
        const castle = u.enemy ? this.castles.me : this.castles.foe;
        const toCastle = Math.abs(castle.z - u.z) - 1.6;
        u.cd -= dt;
        if (target && bd <= u.range) {
          u.moving = false;
          u.face = Math.atan2(target.x - u.x, target.z - u.z);
          if (u.cd <= 0) { u.cd = 1 / u.rate; u.swing = 0.2; this.hit(u, target); }
        } else if (!target && toCastle <= u.range) {
          u.moving = false;
          u.face = u.enemy ? 0 : Math.PI;
          if (u.cd <= 0) { u.cd = 1 / u.rate; u.swing = 0.2; castle.hp -= u.dmg; castle.hitT = 0.15; if (Math.random() < 0.3) sfx('hit'); }
        } else {
          u.moving = true;
          const tx = target ? target.x : u.x, tz = target ? target.z : castle.z;
          const dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz) || 1;
          u.x = clamp(u.x + (dx / d) * u.speed * dt, -LANE_HALF, LANE_HALF);
          u.z += (dz / d) * u.speed * dt;
          u.face = Math.atan2(dx, dz);
          u.phase += dt * 12;
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
      // castle towers shoot at attackers in range, so every push has to break through
      for (const [key, c] of Object.entries(this.castles)) {
        c.cd -= dt;
        if (c.cd > 0) continue;
        const foe = key === 'me';
        let target = null, bd = 6.5;
        for (const u of this.units) {
          if (u.hp <= 0 || u.enemy !== foe) continue;
          const d = Math.abs(u.z - c.z);
          if (d < bd) { bd = d; target = u; }
        }
        if (!target) continue;
        c.cd = 0.7;
        const dmg = 14 * (key === 'me' ? this.dmgMult : this.enemyDmgMult * (1 + this.level * 0.05));
        this.arrows.push({ x: (Math.random() - 0.5) * 5, z: c.z - Math.sign(c.z) * 1, target, dmg });
      }
      for (const a of this.arrows) {
        const t = a.target, dx = t.x - a.x, dz = t.z - a.z, d = Math.hypot(dx, dz);
        if (d < 0.4 || t.hp <= 0) { a.done = true; if (t.hp > 0) t.hp -= a.dmg; continue; }
        const st = Math.min(d, 16 * dt);
        a.x += (dx / d) * st; a.z += (dz / d) * st; a.ry = Math.atan2(dx, dz);
      }
      this.arrows = this.arrows.filter((a) => !a.done);
      for (const u of this.units) if (u.hp <= 0 && !u.deadT) u.deadT = 0.001;
      for (const u of this.units) if (u.deadT) u.deadT += dt;
      this.units = this.units.filter((u) => {
        if (u.deadT > 0.6) { this.scene.remove(u.mesh, u.bar); u.bar.material.dispose(); return false; }
        return true;
      });

      if (this.castles.foe.hp <= 0) this.end(true);
      else if (this.castles.me.hp <= 0) this.end(false);
    }

    hit(u, target) {
      if (u.role === 'bow') this.arrows.push({ x: u.x, z: u.z, target, dmg: u.dmg });
      else { target.hp -= u.dmg; if (Math.random() < 0.25) sfx('hit'); }
    }

    end(won) {
      this.state = 'done';
      if (won) {
        sfx('win');
        setTimeout(() => this.api.win({ coins: 25 + this.level * 6, troops: this.level * 2, text: `🏰 Enemy castle destroyed · ${this.sent} soldiers sent` }), 700);
      } else {
        setTimeout(() => this.api.lose({ reason: 'Your castle fell. Merge faster and aim for big blocks!', canRevive: !this.revived }), 700);
      }
    }

    revive() {
      this.revived = true;
      this.castles.me.hp = this.castles.me.max * 0.6;
      for (const u of this.units) if (u.enemy && u.z > 0) u.hp = 0;
      this.state = 'play';
      sfx('level');
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
      this.ui.foe.style.width = Math.max(0, (this.castles.foe.hp / this.castles.foe.max) * 100) + '%';
      this.ui.me.style.width = Math.max(0, (this.castles.me.hp / this.castles.me.max) * 100) + '%';
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
  };
  GH.Games.merge.slide = slide; // exposed for tests
})();

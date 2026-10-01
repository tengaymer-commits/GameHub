/*
 * MERGE ARMY – 2048 meets the Top War "merge and battle" ad.
 * Your army stands on a 4x4 board. Swipe and every soldier slides that way; two equal
 * soldiers that collide merge into one of double value (2 → 4 → 8 … → 2048), and a new
 * recruit appears after every swipe. Each level gives a number of swipes. When you are
 * ready (or out of swipes) press FIGHT for an automatic 3D battle. The army carries over.
 * Classes alternate with level: odd levels fight in melee, even levels shoot arrows.
 * When the board jams, Regroup lines the army up biggest-to-smallest so merges open up again.
 * Town bonuses: Barracks (+HP), Forge (+damage), Vault (+swipes per level).
 */
(function () {
  'use strict';
  const { Save, UI, sfx, vibrate, fmt, clamp, rng } = GH;

  const N = 4, CELL = 1.8, MAX_LVL = 11, ENEMY_ROWS = 3;
  const ANIM = 0.12;
  const REGROUP_COST = 3;
  const NAMES = ['', 'Recruit', 'Archer', 'Knight', 'Ranger', 'Champion', 'Sniper', 'Warlord', 'Marksman', 'Hero', 'Legend', 'King'];
  const TILE = ['#cdc1b4', '#eee4da', '#ede0c8', '#f2b179', '#f59563', '#f67c5f', '#f65e3b', '#edcf72', '#edcc61', '#edc850', '#edc53f', '#edc22e'];
  const roleOf = (lvl) => (lvl % 2 === 1 ? 'sword' : 'bow');
  const valueOf = (lvl) => Math.pow(2, lvl);          // what the badge shows, 2048-style
  const cellPos = (i, enemy) => {
    const c = i % N, r = Math.floor(i / N);
    return { x: (c - (N - 1) / 2) * CELL, z: (enemy ? -1 : 1) * (2.2 + r * CELL) };
  };
  const STATS = {
    sword: { hp: 30, dmg: 6, range: 1.3, rate: 1, speed: 2.6 },
    bow: { hp: 18, dmg: 5, range: 6.5, rate: 0.8, speed: 2 },
  };
  // each merge multiplies HP and damage by GROW (> 2), so one big soldier beats the two it came from:
  // that is what makes playing the 2048 board well pay off in battle
  const GROW = 2.4;
  const mult = (lvl) => Math.pow(GROW, lvl - 1);
  const unitPower = (lvl) => { const s = STATS[roleOf(lvl)]; return Math.sqrt(s.hp * s.dmg) * mult(lvl); };

  /** One 2048 move. Returns the new grid, per-tile moves and whether anything changed. */
  function slide(grid, dir) {
    const out = new Array(N * N).fill(null);
    const moves = [];
    let merges = 0;
    for (let k = 0; k < N; k++) {
      const idx = [];
      for (let j = 0; j < N; j++) {
        if (dir === 'left') idx.push(k * N + j);
        else if (dir === 'right') idx.push(k * N + (N - 1 - j));
        else if (dir === 'up') idx.push(j * N + k);          // row 0 = front line, top of the screen
        else idx.push((N - 1 - j) * N + k);
      }
      const tiles = idx.filter((i) => grid[i]).map((i) => ({ ...grid[i], from: i }));
      let w = 0;
      for (let t = 0; t < tiles.length; t++) {
        const a = tiles[t], b = tiles[t + 1], to = idx[w++];
        if (b && b.lvl === a.lvl && a.lvl < MAX_LVL) {
          out[to] = { id: a.id, lvl: a.lvl + 1, merged: true };
          moves.push({ id: a.id, from: a.from, to }, { id: b.id, from: b.from, to, gone: true });
          merges++;
          t++;
        } else {
          out[to] = { id: a.id, lvl: a.lvl };
          moves.push({ id: a.id, from: a.from, to });
        }
      }
    }
    const moved = merges > 0 || moves.some((m) => m.from !== m.to);
    return { grid: out, moves, moved, merges };
  }

  function enemyArmy(L) {
    const r = rng(L * 4099 + 11);
    let target = 50 + 160 * (L - 1) + 14 * Math.pow(L - 1, 2); // total enemy power for this level
    const cells = N * ENEMY_ROWS;
    const lvls = [];
    while (target > 8 && lvls.length < cells) {
      let lvl = 1;
      while (lvl < MAX_LVL && unitPower(lvl + 1) <= target * 0.45) lvl++;
      if (lvl > 1 && r() < 0.4) lvl--;
      lvls.push(lvl);
      target -= unitPower(lvl);
    }
    // melee in front, archers behind
    lvls.sort((a, b) => (roleOf(a) === roleOf(b) ? b - a : roleOf(a) === 'sword' ? -1 : 1));
    const grid = new Array(cells).fill(null);
    lvls.forEach((lvl, i) => { grid[i] = { lvl }; });
    return grid;
  }

  class MergeArmy {
    constructor({ api, level }) {
      this.api = api;
      this.K = GH.K3;
      this.levelNum = level;
      this.title = 'Merge Army';
      const lv = GH.Town.lv;
      this.hpMult = 1 + 0.15 * lv('barracks');
      this.dmgMult = GH.Town.bonus.frostDmg();
      this.st = this.loadState(level);
      this.enemyGrid = enemyArmy(level);
      this.state = 'plan';
      this.time = 0;
      this.meshes = new Map();   // tile id -> mesh
      this.badgeTex = {};
      this.buildScene();
      this.buildEnemies();
      this.syncMeshes();
      api.setHudButtons([]);
    }

    loadState(level) {
      let st = Save.data.merge2;
      if (!st) {
        st = { grid: new Array(N * N).fill(null), nextId: 1, swipes: 0, paidLevel: 0 };
        // carry over the army from the coin-based version, strongest first
        const old = Save.data.merge && Save.data.merge.grid ? Save.data.merge.grid.filter(Boolean).map((u) => u.lvl).sort((a, b) => b - a) : [];
        old.slice(0, N * N).forEach((lvl, i) => { st.grid[i] = { id: st.nextId++, lvl }; });
        Save.data.merge2 = st;
      }
      if (st.paidLevel < level) {
        st.swipes += 8 + Math.floor(level / 2) + GH.Town.lv('vault');
        st.paidLevel = level;
        if (!st.grid.some(Boolean)) { this.spawnTile(st); this.spawnTile(st); }
        Save.save();
      }
      return st;
    }

    spawnTile(st = this.st) {
      const empty = st.grid.map((t, i) => (t ? -1 : i)).filter((i) => i >= 0);
      if (!empty.length) return null;
      const i = empty[Math.floor(Math.random() * empty.length)];
      st.grid[i] = { id: st.nextId++, lvl: Math.random() < 0.1 ? 2 : 1 };
      return st.grid[i].id;
    }

    // ---------------------------------------------------------------- scene
    buildScene() {
      const T = THREE, K = this.K;
      this.ly = K.layer(`
        <div class="ma-top"><div class="ma-power"><span class="you">💪 0</span><small>vs</small><span class="foe">0</span></div>
          <div class="ma-swipes"><span>👆</span><b>0</b><small>swipes</small></div></div>
        <div class="ma-tip">Swipe to move your army. Equal soldiers merge!</div>
        <div class="ma-bar">
          <button class="ma-more"><span>📺</span><b>+5 swipes</b></button>
          <button class="ma-regroup"><span>🔀</span><b>Regroup</b><i>3 swipes</i></button>
          <button class="ma-fight">FIGHT!</button>
        </div>`);
      const el = this.ly.el;
      this.ui = {
        you: el.querySelector('.you'), foe: el.querySelector('.foe'), swipes: el.querySelector('.ma-swipes b'), tip: el.querySelector('.ma-tip'),
        bar: el.querySelector('.ma-bar'), more: el.querySelector('.ma-more'), fight: el.querySelector('.ma-fight'),
        regroup: el.querySelector('.ma-regroup'), regroupCost: el.querySelector('.ma-regroup i'),
      };
      this.ui.more.addEventListener('click', () => this.moreSwipes());
      this.ui.regroup.addEventListener('click', () => this.regroup());
      this.ui.fight.addEventListener('click', () => this.startBattle());
      this.renderer = K.renderer(el);
      const scene = (this.scene = new T.Scene());
      scene.background = new T.Color('#8fcbe8');
      this.camera = new T.PerspectiveCamera(50, 1, 0.5, 120);
      scene.add(new T.HemisphereLight('#ffffff', '#6f8f5a', 1.8));
      const sun = new T.DirectionalLight('#fff3dd', 2.3);
      sun.position.set(-6, 20, 10);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
      scene.add(sun);
      const ground = new T.Mesh(new T.PlaneGeometry(60, 60), K.lam('#7cc36a'));
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
      scene.add(ground);
      const river = new T.Mesh(new T.PlaneGeometry(60, 1.4), K.lam('#4aa3d8'));
      river.rotation.x = -Math.PI / 2; river.position.y = 0.01;
      scene.add(river);
      // the 2048 board under your army
      const board = new T.Mesh(new T.BoxGeometry(N * CELL + 0.3, 0.2, N * CELL + 0.3), K.lam('#bbada0'));
      board.position.set(0, 0.05, 2.2 + ((N - 1) * CELL) / 2);
      board.receiveShadow = true;
      scene.add(board);
      this.tiles = [];
      for (let i = 0; i < N * N; i++) {
        const p = cellPos(i, false);
        const t = new T.Mesh(new T.BoxGeometry(CELL - 0.18, 0.12, CELL - 0.18), new T.MeshLambertMaterial({ color: TILE[0] }));
        t.position.set(p.x, 0.17, p.z);
        t.receiveShadow = true;
        scene.add(t);
        this.tiles.push(t);
      }
      for (let i = 0; i < N * ENEMY_ROWS; i++) {
        const p = cellPos(i, true);
        const t = new T.Mesh(new T.PlaneGeometry(CELL - 0.15, CELL - 0.15), new T.MeshBasicMaterial({ color: '#c96b5a', transparent: true, opacity: 0.35 }));
        t.rotation.x = -Math.PI / 2; t.position.set(p.x, 0.02, p.z);
        scene.add(t);
      }
      this.unitGroup = new T.Group();
      scene.add(this.unitGroup);
      this.arrows = [];
      this.arrowMesh = new T.InstancedMesh(new T.BoxGeometry(0.06, 0.06, 0.6), K.lam('#6e4424'), 120);
      this.arrowMesh.frustumCulled = false; this.arrowMesh.count = 0;
      scene.add(this.arrowMesh);
      this.dummy = new T.Object3D();

      // swipe input (plus arrow keys / WASD on desktop)
      let start = null;
      this.h = {
        down: (e) => {
          if (e.target.closest('button')) return;
          start = { x: e.clientX, y: e.clientY };
          try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        },
        up: (e) => {
          if (!start) return;
          const dx = e.clientX - start.x, dy = e.clientY - start.y;
          start = null;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
          this.swipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
        },
        key: (e) => {
          const k = { arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down' }[e.key.toLowerCase()];
          if (k) { e.preventDefault(); this.swipe(k); }
        },
      };
      el.addEventListener('pointerdown', this.h.down);
      el.addEventListener('pointerup', this.h.up);
      el.addEventListener('pointercancel', () => { start = null; });
      window.addEventListener('keydown', this.h.key);
      this.onResize = () => K.fit(this.renderer, this.camera, el, 5.4, 19, 40, 80);
      window.addEventListener('resize', this.onResize);
      this.onResize();
    }

    blocked() { return this.paused || UI.modalCount > 0 || !!document.querySelector('.ad-player'); }

    badge(lvl, enemy) {
      const key = lvl + (enemy ? 'e' : 'p');
      if (this.badgeTex[key]) return this.badgeTex[key];
      const tx = this.K.canvasTex(160, 96);
      const c = tx.ctx;
      c.fillStyle = enemy ? '#c0392b' : TILE[Math.min(lvl, TILE.length - 1)];
      GH.roundRect(c, 6, 6, 148, 84, 22); c.fill();
      c.lineWidth = 6; c.strokeStyle = enemy ? '#fff' : '#776e65'; c.stroke();
      const v = String(valueOf(lvl));
      c.font = `900 ${v.length > 3 ? 44 : 56}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = enemy || lvl >= 3 ? '#fff' : '#776e65';
      c.fillText(v, 80, 52);
      return (this.badgeTex[key] = tx.tex);
    }

    unitMesh(lvl, enemy) {
      const K = this.K, T = THREE, role = roleOf(lvl);
      const body = enemy ? (role === 'sword' ? '#c0392b' : '#d35400') : (role === 'sword' ? '#3a7bd5' : '#2f9e5a');
      const g = K.person(body, enemy ? '#5b1a14' : null);
      if (!enemy) g.add(K.mesh(K.geo.sphere, K.std(lvl >= 7 ? '#ffd84a' : lvl >= 4 ? '#c9ced8' : '#8d6e4f', { metalness: lvl >= 4 ? 0.7 : 0.1, roughness: 0.35 }), 0, 1.45, 0, 0.62, 0.5, 0.62));
      if (role === 'sword') g.add(K.box(0.1, 1, 0.05, K.std('#e8eef8', { metalness: 0.8, roughness: 0.2 }), 0.42, 0.9, 0.12));
      else { const bow = K.mesh(new T.TorusGeometry(0.4, 0.04, 6, 12, Math.PI), K.lam('#8a5a32'), 0.4, 0.95, 0.1); bow.rotation.z = -Math.PI / 2; g.add(bow); }
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.badge(lvl, enemy), depthTest: false }));
      sp.scale.set(0.8, 0.48, 1); sp.position.y = 2.15; sp.renderOrder = 9;
      g.add(sp);
      g.userData.base = 0.7 + lvl * 0.08;
      g.scale.setScalar(g.userData.base);
      g.rotation.y = enemy ? 0 : Math.PI;
      return g;
    }

    buildEnemies() {
      this.enemyMeshes = [];
      this.enemyGrid.forEach((u, i) => {
        if (!u) return;
        const m = this.unitMesh(u.lvl, true);
        const p = cellPos(i, true);
        m.position.set(p.x, 0, p.z);
        this.unitGroup.add(m);
        this.enemyMeshes.push(m);
      });
    }

    /** Make the meshes match the grid: add new tiles, drop merged-away ones, rebuild upgraded ones. */
    syncMeshes(popIds = []) {
      const alive = new Set();
      this.st.grid.forEach((t, i) => {
        if (!t) return;
        alive.add(t.id);
        let m = this.meshes.get(t.id);
        if (m && m.userData.lvl !== t.lvl) { this.unitGroup.remove(m); m = null; }
        if (!m) {
          m = this.unitMesh(t.lvl, false);
          m.userData.lvl = t.lvl;
          this.unitGroup.add(m);
          this.meshes.set(t.id, m);
        }
        const p = cellPos(i, false);
        m.position.set(p.x, 0.23, p.z);
        m.userData.cell = i;
        if (popIds.includes(t.id)) m.userData.pop = 0.001;
      });
      for (const [id, m] of this.meshes) if (!alive.has(id)) { this.unitGroup.remove(m); this.meshes.delete(id); }
      this.tiles.forEach((tile, i) => tile.material.color.set(this.st.grid[i] ? TILE[Math.min(this.st.grid[i].lvl, TILE.length - 1)] : TILE[0]));
      this.refreshUi();
    }

    power(lvls, bonus) {
      let p = 0;
      for (const lvl of lvls) p += unitPower(lvl) * (bonus ? Math.sqrt(this.hpMult * this.dmgMult) : 1);
      return Math.round(p);
    }

    refreshUi() {
      const mine = this.st.grid.filter(Boolean).map((t) => t.lvl);
      this.ui.you.textContent = `💪 ${fmt(this.power(mine, true))}`;
      this.ui.foe.textContent = `👹 ${fmt(this.power(this.enemyGrid.filter(Boolean).map((u) => u.lvl), false))}`;
      this.ui.swipes.textContent = this.st.swipes;
      this.ui.swipes.parentElement.classList.toggle('out', this.st.swipes <= 0);
      this.ui.fight.disabled = this.state !== 'plan' || !mine.length;
      this.ui.more.disabled = this.state !== 'plan';
      const stuck = this.boardStuck();
      this.ui.regroup.disabled = this.state !== 'plan' || this.st.grid.filter(Boolean).length < 2 || this.st.swipes < REGROUP_COST;
      this.ui.regroup.classList.toggle('ready', stuck && this.st.grid.some(Boolean));
      this.ui.fight.classList.toggle('ready', this.st.swipes <= 0 || this.boardStuck());
    }

    boardStuck() { return ['up', 'down', 'left', 'right'].every((d) => !slide(this.st.grid, d).moved); }

    swipe(dir) {
      if (this.state !== 'plan' || this.anim || this.blocked()) return;
      if (this.st.swipes <= 0) { UI.toast('Out of swipes: FIGHT or watch an ad for more'); return; }
      const res = slide(this.st.grid, dir);
      if (!res.moved) { this.nudge = { dir, t: 0 }; return; }
      this.st.swipes--;
      this.anim = { t: 0, moves: res.moves, next: res.grid };
      sfx(res.merges ? 'level' : 'tap');
      if (res.merges) vibrate(15);
      this.ui.tip.hidden = true;
    }

    /** Line the army up biggest-to-smallest in a snake, so equal soldiers end up side by side. */
    regroup() {
      if (this.state !== 'plan' || this.anim || this.blocked()) return;
      if (this.st.swipes < REGROUP_COST) { UI.toast(`Regroup needs ${REGROUP_COST} swipes`); return; }
      const tiles = this.st.grid.map((t, i) => t && { ...t, from: i }).filter(Boolean).sort((a, b) => b.lvl - a.lvl);
      const snake = [];
      for (let r = N - 1; r >= 0; r--) for (let c = 0; c < N; c++) snake.push(r * N + ((N - 1 - r) % 2 ? N - 1 - c : c));
      const next = new Array(N * N).fill(null);
      const moves = tiles.map((t, k) => { next[snake[k]] = { id: t.id, lvl: t.lvl }; return { id: t.id, from: t.from, to: snake[k] }; });
      this.st.swipes -= REGROUP_COST;
      this.anim = { t: 0, moves, next, noSpawn: true, slow: true };
      sfx('tap');
    }

    finishSwipe() {
      const { next, noSpawn } = this.anim;
      this.anim = null;
      const merged = next.filter((t) => t && t.merged).map((t) => t.id);
      next.forEach((t) => { if (t) delete t.merged; });
      this.st.grid = next;
      const born = noSpawn ? null : this.spawnTile();
      Save.save();
      this.syncMeshes([...merged, born].filter(Boolean));
      if (this.st.swipes <= 0) { this.ui.tip.textContent = 'Out of swipes: time to FIGHT!'; this.ui.tip.hidden = false; }
      else if (this.boardStuck()) { this.ui.tip.textContent = 'Board jammed: 🔀 Regroup, or FIGHT!'; this.ui.tip.hidden = false; }
    }

    async moreSwipes() {
      if (this.state !== 'plan' || this.blocked()) return;
      this.paused = true;
      const ok = await Monetization.showRewarded('merge_swipes');
      this.paused = false;
      if (!ok) return;
      Monetization.resetInterstitialCounter();
      this.st.swipes += 5;
      Save.save();
      this.refreshUi();
      UI.toast('+5 swipes');
    }

    // ---------------------------------------------------------------- battle
    startBattle() {
      if (this.state !== 'plan' || this.anim || this.blocked() || !this.st.grid.some(Boolean)) return;
      this.state = 'battle';
      this.ui.bar.classList.add('fighting');
      this.ui.tip.hidden = true;
      this.fighters = [];
      const add = (lvl, i, enemy, mesh) => {
        const s = STATS[roleOf(lvl)], v = mult(lvl);
        const hp = s.hp * v * (enemy ? 1 : this.hpMult);
        const p = cellPos(i, enemy);
        const bar = new THREE.Sprite(new THREE.SpriteMaterial({ color: enemy ? '#ff4d5e' : '#4ade80', depthTest: false }));
        bar.center.set(0, 0.5); bar.renderOrder = 8;
        this.scene.add(bar);
        this.fighters.push({ lvl, role: roleOf(lvl), enemy, mesh, x: p.x, z: p.z, hp, max: hp, dmg: s.dmg * v * (enemy ? 1 : this.dmgMult), range: s.range, rate: s.rate, speed: s.speed, cd: Math.random() * 0.5, bar, phase: 0 });
      };
      this.st.grid.forEach((t, i) => { if (t) add(t.lvl, i, false, this.meshes.get(t.id)); });
      let k = 0;
      this.enemyGrid.forEach((u, i) => { if (u) add(u.lvl, i, true, this.enemyMeshes[k++]); });
      this.battleT = 0;
      this.refreshUi();
      sfx('bad');
    }

    updateBattle(dt) {
      this.battleT += dt;
      for (const f of this.fighters) {
        if (f.hp <= 0) continue;
        let target = null, bd = Infinity;
        for (const o of this.fighters) {
          if (o.hp <= 0 || o.enemy === f.enemy) continue;
          const d = Math.hypot(o.x - f.x, o.z - f.z);
          if (d < bd) { bd = d; target = o; }
        }
        if (!target) continue;
        f.face = Math.atan2(target.x - f.x, target.z - f.z);
        f.moving = bd > f.range;
        if (f.moving) {
          const st = Math.min(bd - f.range * 0.9, f.speed * dt);
          f.x += ((target.x - f.x) / bd) * st; f.z += ((target.z - f.z) / bd) * st;
          f.phase += dt * 12;
        }
        f.cd -= dt;
        if (!f.moving && f.cd <= 0) {
          f.cd = 1 / f.rate;
          f.swing = 0.2;
          if (f.role === 'bow') this.arrows.push({ x: f.x, z: f.z, target, dmg: f.dmg });
          else { target.hp -= f.dmg; if (Math.random() < 0.3) sfx('hit'); }
        }
        if (f.swing > 0) f.swing -= dt;
      }
      for (let i = 0; i < this.fighters.length; i++) for (let j = i + 1; j < this.fighters.length; j++) {
        const a = this.fighters[i], b = this.fighters[j];
        if (a.hp <= 0 || b.hp <= 0) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = 0.7;
        if (d < min && d > 0.001) { const k = (min - d) / 2; a.x -= (dx / d) * k; a.z -= (dz / d) * k; b.x += (dx / d) * k; b.z += (dz / d) * k; }
      }
      for (const a of this.arrows) {
        const t = a.target, dx = t.x - a.x, dz = t.z - a.z, d = Math.hypot(dx, dz);
        if (d < 0.4 || t.hp <= 0) { a.done = true; if (t.hp > 0) t.hp -= a.dmg; continue; }
        const st = Math.min(d, 14 * dt);
        a.x += (dx / d) * st; a.z += (dz / d) * st; a.ry = Math.atan2(dx, dz);
      }
      this.arrows = this.arrows.filter((a) => !a.done);
      const mine = this.fighters.some((f) => f.hp > 0 && !f.enemy), theirs = this.fighters.some((f) => f.hp > 0 && f.enemy);
      if (!mine || !theirs || this.battleT > 60) this.endBattle(!theirs && mine);
    }

    endBattle(won) {
      this.state = 'done';
      for (const f of this.fighters) { this.scene.remove(f.bar); f.bar.material.dispose(); }
      this.arrows = [];
      if (won) {
        sfx('win');
        const best = Math.max(...this.st.grid.filter(Boolean).map((t) => valueOf(t.lvl)));
        setTimeout(() => this.api.win({ coins: 25 + this.levelNum * 6, troops: this.levelNum * 2, text: `⚔️ Biggest unit: ${fmt(best)} (${NAMES[Math.log2(best)]})` }), 800);
      } else {
        // a few bonus swipes so you can never get stuck on a level
        const bonus = 4 + Math.floor(this.levelNum / 4);
        this.st.swipes += bonus;
        Save.save();
        setTimeout(() => this.api.lose({ reason: `Your army was defeated. +${bonus} swipes: merge bigger soldiers and try again!`, canRevive: false }), 800);
      }
    }

    // ---------------------------------------------------------------- loop
    update(dt) {
      this.time += dt;
      if (this.anim) { this.anim.t += dt; if (this.anim.t >= (this.anim.slow ? ANIM * 3 : ANIM)) this.finishSwipe(); }
      if (this.nudge) { this.nudge.t += dt; if (this.nudge.t > 0.15) this.nudge = null; }
      for (const m of this.meshes.values()) if (m.userData.pop) { m.userData.pop += dt; if (m.userData.pop > 0.3) m.userData.pop = 0; }
      if (this.state === 'battle') this.updateBattle(dt);
    }

    draw() {
      if (this.state === 'plan') {
        const k = this.anim ? Math.min(1, this.anim.t / (this.anim.slow ? ANIM * 3 : ANIM)) : 1;
        const moving = new Map();
        if (this.anim) for (const mv of this.anim.moves) moving.set(mv.id, mv);
        const nd = this.nudge ? Math.sin((this.nudge.t / 0.15) * Math.PI) * 0.15 : 0;
        const ndx = this.nudge ? { left: -nd, right: nd, up: 0, down: 0 }[this.nudge.dir] : 0;
        const ndz = this.nudge ? { up: -nd, down: nd, left: 0, right: 0 }[this.nudge.dir] : 0;
        for (const [id, m] of this.meshes) {
          const mv = moving.get(id);
          let p = cellPos(m.userData.cell, false);
          if (mv) { const a = cellPos(mv.from, false), b = cellPos(mv.to, false); p = { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k }; }
          m.position.set(p.x + ndx, 0.23 + Math.abs(Math.sin(this.time * 2 + id)) * 0.04, p.z + ndz);
          const pop = m.userData.pop ? 1 + Math.sin((m.userData.pop / 0.3) * Math.PI) * 0.45 : 1;
          m.scale.setScalar(m.userData.base * pop);
        }
      }
      if (this.fighters) {
        for (const f of this.fighters) {
          const m = f.mesh;
          if (!m) continue;
          if (f.hp <= 0) {
            m.rotation.z = Math.min(1.5, (m.rotation.z || 0) + 0.15);
            f.bar.visible = false;
            if (m.rotation.z >= 1.5) m.visible = false;
            continue;
          }
          m.position.set(f.x, 0, f.z);
          if (f.face !== undefined) m.rotation.y = f.face;
          this.K.animLegs(m, f.phase, f.moving);
          m.rotation.x = f.swing > 0 ? (f.role === 'sword' ? 0.5 : 0.15) : 0;
          const w = 1.1;
          f.bar.position.set(f.x - w / 2, 2.6 + f.lvl * 0.1, f.z);
          f.bar.scale.set(Math.max(0.01, (w * f.hp) / f.max), 0.12, 1);
        }
        this.arrows.forEach((a, i) => {
          this.dummy.position.set(a.x, 1, a.z); this.dummy.rotation.set(0, a.ry || 0, 0); this.dummy.updateMatrix();
          this.arrowMesh.setMatrixAt(i, this.dummy.matrix);
        });
        this.arrowMesh.count = Math.min(120, this.arrows.length);
        this.arrowMesh.instanceMatrix.needsUpdate = true;
      }
      this.camera.position.set(0, 13.5, 15);
      this.camera.lookAt(0, 0, 1.8);
      this.renderer.render(this.scene, this.camera);
    }

    destroy() {
      window.removeEventListener('resize', this.onResize);
      window.removeEventListener('keydown', this.h.key);
      for (const t of Object.values(this.badgeTex)) t.dispose();
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.ly.destroy();
    }
  }

  GH.Games.merge = {
    id: 'merge',
    name: 'Merge Army',
    tagline: '2048 with soldiers. Swipe, merge, battle.',
    icon: '⚔️',
    colors: ['#7a1f16', '#e0772b'],
    create: (opts) => new MergeArmy(opts),
  };
  // exposed for tests
  GH.Games.merge.enemyArmy = enemyArmy;
  GH.Games.merge.slide = slide;
})();

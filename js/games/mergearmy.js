/*
 * MERGE ARMY – the Top War style "merge and battle" ad.
 * Buy swordsmen and archers, drag two identical units together to merge them into a
 * stronger one, arrange your formation, then press FIGHT for an automatic 3D battle.
 * Your army carries over between levels. Town bonuses: Barracks (+HP), Forge (+damage),
 * Vault (more coins each level).
 */
(function () {
  'use strict';
  const { Save, UI, sfx, vibrate, fmt, clamp, rng } = GH;

  const COLS = 5, ROWS = 3, CELL = 1.8, MAX_LVL = 8;
  const cellPos = (i, enemy) => {
    const c = i % COLS, r = Math.floor(i / COLS);
    return { x: (c - 2) * CELL, z: (enemy ? -1 : 1) * (2.2 + r * CELL) };
  };
  const STATS = {
    sword: { hp: 30, dmg: 6, range: 1.3, rate: 1, speed: 2.6 },
    bow: { hp: 18, dmg: 5, range: 6.5, rate: 0.8, speed: 2 },
  };
  const unitValue = (u) => Math.pow(2, u.lvl - 1);

  function enemyArmy(L) {
    const r = rng(L * 4099 + 11);
    let budget = 3 + 2.4 * (L - 1) + 0.04 * Math.pow(L - 1, 2);
    const units = [];
    let maxL = clamp(1 + Math.floor(Math.log2(Math.max(1, budget / 3))), 1, MAX_LVL);
    while (budget >= 1 && units.length < COLS * ROWS) {
      let lvl = Math.max(1, maxL - (r() < 0.5 ? 1 : 0));
      while (lvl > 1 && Math.pow(2, lvl - 1) > budget) lvl--;
      units.push({ type: r() < 0.6 ? 'sword' : 'bow', lvl });
      budget -= Math.pow(2, lvl - 1);
      if (units.length === COLS * ROWS - 1 && budget > 1) maxL = Math.min(MAX_LVL, maxL + 1); // grid full: go bigger
    }
    // swords in front, archers behind
    const grid = new Array(COLS * ROWS).fill(null);
    const swords = units.filter((u) => u.type === 'sword'), bows = units.filter((u) => u.type === 'bow');
    let i = 0;
    for (const u of swords) grid[i++] = u;
    i = Math.max(i, COLS);
    for (const u of bows) { while (grid[i] && i < grid.length - 1) i++; if (!grid[i]) grid[i] = u; }
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
      const st = (Save.data.merge = Save.data.merge || { grid: new Array(COLS * ROWS).fill(null), coins: 0, buys: { sword: 0, bow: 0 }, paidLevel: 0 });
      this.st = st;
      if (st.paidLevel < level) {
        st.coins += 60 + 20 * level + 15 * lv('vault');
        st.paidLevel = level;
        if (level === 1 && st.grid.every((c) => !c)) { st.grid[1] = { type: 'sword', lvl: 1 }; st.grid[3] = { type: 'sword', lvl: 1 }; }
        Save.save();
      }
      this.enemyGrid = enemyArmy(level);
      this.state = 'plan'; // before rebuildUnits(): it refreshes the buy/fight buttons
      this.buildScene();
      this.rebuildUnits();
      this.time = 0;
      api.setHudButtons([]);
    }

    // ---------------------------------------------------------------- scene
    buildScene() {
      const T = THREE, K = this.K;
      this.ly = K.layer(`
        <div class="ma-top"><div class="ma-power"><span class="you">💪 0</span><small>vs</small><span class="foe">0</span></div>
          <div class="fs-cash"><span>🪙</span><b>0</b></div></div>
        <div class="ma-tip">Drag two identical units together to merge them</div>
        <div class="ma-bar">
          <button class="ma-buy" data-type="sword"><span>⚔️</span><b>Swordsman</b><i></i></button>
          <button class="ma-buy" data-type="bow"><span>🏹</span><b>Archer</b><i></i></button>
          <button class="ma-fight">FIGHT!</button>
        </div>`);
      const el = this.ly.el;
      this.ui = { you: el.querySelector('.you'), foe: el.querySelector('.foe'), coins: el.querySelector('.fs-cash b'), tip: el.querySelector('.ma-tip'),
        bar: el.querySelector('.ma-bar'), buys: [...el.querySelectorAll('.ma-buy')], fight: el.querySelector('.ma-fight') };
      this.ui.buys.forEach((b) => b.addEventListener('click', () => this.buy(b.dataset.type)));
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
      // grid tiles
      this.tiles = [];
      for (const enemy of [false, true]) {
        for (let i = 0; i < COLS * ROWS; i++) {
          const p = cellPos(i, enemy);
          const t = new T.Mesh(new T.PlaneGeometry(CELL - 0.15, CELL - 0.15), new T.MeshBasicMaterial({ color: enemy ? '#c96b5a' : '#5a8fc9', transparent: true, opacity: 0.35 }));
          t.rotation.x = -Math.PI / 2; t.position.set(p.x, 0.02, p.z);
          scene.add(t);
          if (!enemy) this.tiles.push(t);
        }
      }
      this.unitGroup = new T.Group();
      scene.add(this.unitGroup);
      this.arrows = [];
      this.arrowMesh = new T.InstancedMesh(new T.BoxGeometry(0.06, 0.06, 0.6), K.lam('#6e4424'), 120);
      this.arrowMesh.frustumCulled = false; this.arrowMesh.count = 0;
      scene.add(this.arrowMesh);
      this.dummy = new T.Object3D();

      // drag & drop on the ground plane
      const ray = new T.Raycaster(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0), hit = new T.Vector3();
      const toGround = (e) => {
        const r = el.getBoundingClientRect();
        ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
        return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
      };
      const cellAt = (p) => {
        if (!p) return -1;
        const c = Math.round(p.x / CELL + 2), r = Math.round((p.z - 2.2) / CELL);
        return c >= 0 && c < COLS && r >= 0 && r < ROWS ? r * COLS + c : -1;
      };
      this.h = {
        down: (e) => {
          if (this.state !== 'plan' || this.blocked() || e.target.closest('button')) return;
          const i = cellAt(toGround(e));
          if (i < 0 || !this.st.grid[i]) return;
          e.preventDefault();
          this.drag = { i, mesh: this.meshes[i] };
          try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        },
        move: (e) => {
          if (!this.drag) return;
          const p = toGround(e);
          if (p) { this.drag.mesh.position.set(p.x, 0.6, p.z); this.dragOver = cellAt(p); }
        },
        up: (e) => {
          if (!this.drag) return;
          const from = this.drag.i, to = cellAt(toGround(e));
          this.drag = null; this.dragOver = -1;
          this.drop(from, to);
        },
      };
      el.addEventListener('pointerdown', this.h.down);
      el.addEventListener('pointermove', this.h.move);
      el.addEventListener('pointerup', this.h.up);
      el.addEventListener('pointercancel', this.h.up);
      this.onResize = () => { K.fit(this.renderer, this.camera, el, 6.6, 19, 40, 80); };
      window.addEventListener('resize', this.onResize);
      this.onResize();
    }

    blocked() { return this.paused || UI.modalCount > 0 || !!document.querySelector('.ad-player'); }

    unitMesh(u, enemy) {
      const K = this.K, T = THREE;
      const body = enemy ? (u.type === 'sword' ? '#c0392b' : '#d35400') : (u.type === 'sword' ? '#3a7bd5' : '#2f9e5a');
      const g = K.person(body, enemy ? '#5b1a14' : null);
      if (!enemy) g.add(K.mesh(K.geo.sphere, K.std(u.lvl >= 5 ? '#ffd84a' : '#c9ced8', { metalness: 0.7, roughness: 0.3 }), 0, 1.45, 0, 0.62, 0.5, 0.62));
      if (u.type === 'sword') g.add(K.box(0.1, 1, 0.05, K.std('#e8eef8', { metalness: 0.8, roughness: 0.2 }), 0.42, 0.9, 0.12));
      else { const bow = K.mesh(new T.TorusGeometry(0.4, 0.04, 6, 12, Math.PI), K.lam('#8a5a32'), 0.4, 0.95, 0.1); bow.rotation.z = -Math.PI / 2; g.add(bow); }
      g.scale.setScalar(0.75 + u.lvl * 0.12);
      g.rotation.y = enemy ? 0 : Math.PI;
      // level badge
      const tx = K.canvasTex(128, 128);
      tx.ctx.fillStyle = enemy ? '#c0392b' : '#1c4fa0';
      tx.ctx.beginPath(); tx.ctx.arc(64, 64, 54, 0, Math.PI * 2); tx.ctx.fill();
      tx.ctx.lineWidth = 8; tx.ctx.strokeStyle = '#fff'; tx.ctx.stroke();
      tx.ctx.font = '900 64px system-ui, sans-serif'; tx.ctx.textAlign = 'center'; tx.ctx.textBaseline = 'middle';
      tx.ctx.fillStyle = '#fff'; tx.ctx.fillText(String(u.lvl), 64, 68);
      const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx.tex, depthTest: false }));
      badge.scale.set(0.55, 0.55, 1); badge.position.y = 2.1; badge.renderOrder = 9;
      g.add(badge);
      g.userData.badge = badge;
      return g;
    }

    rebuildUnits() {
      this.unitGroup.traverse((o) => { if (o.material && o.material.map) o.material.map.dispose(); });
      this.unitGroup.clear();
      this.meshes = [];
      this.enemyMeshes = [];
      this.st.grid.forEach((u, i) => {
        if (!u) { this.meshes[i] = null; return; }
        const m = this.unitMesh(u, false);
        const p = cellPos(i, false);
        m.position.set(p.x, 0, p.z);
        this.unitGroup.add(m);
        this.meshes[i] = m;
      });
      this.enemyGrid.forEach((u, i) => {
        if (!u) return;
        const m = this.unitMesh(u, true);
        const p = cellPos(i, true);
        m.position.set(p.x, 0, p.z);
        this.unitGroup.add(m);
        this.enemyMeshes.push(m);
      });
      this.refreshUi();
    }

    power(grid, bonus) {
      let p = 0;
      for (const u of grid) if (u) { const s = STATS[u.type]; p += Math.sqrt(s.hp * s.dmg) * unitValue(u) * (bonus ? Math.sqrt(this.hpMult * this.dmgMult) : 1); }
      return Math.round(p);
    }

    cost(type) { return 10 + 6 * this.st.buys[type]; }

    refreshUi() {
      this.ui.coins.textContent = fmt(this.st.coins);
      this.ui.you.textContent = `💪 ${fmt(this.power(this.st.grid, true))}`;
      this.ui.foe.textContent = `👹 ${fmt(this.power(this.enemyGrid, false))}`;
      this.ui.buys.forEach((b) => {
        const c = this.cost(b.dataset.type);
        b.querySelector('i').textContent = `🪙 ${c}`;
        b.disabled = this.st.coins < c || this.state !== 'plan';
      });
      this.ui.fight.disabled = this.state !== 'plan' || !this.st.grid.some(Boolean);
    }

    buy(type) {
      if (this.state !== 'plan' || this.blocked()) return;
      const c = this.cost(type);
      if (this.st.coins < c) return;
      // swordsmen go to the front rows first, archers to the back
      const order = [...Array(COLS * ROWS).keys()];
      if (type === 'bow') order.reverse();
      const i = order.find((k) => !this.st.grid[k]);
      if (i === undefined) { UI.toast('Army full: merge units to make room'); return; }
      this.st.coins -= c;
      this.st.buys[type]++;
      this.st.grid[i] = { type, lvl: 1 };
      Save.save();
      sfx('coin');
      this.rebuildUnits();
      this.spawnPop = { i, t: 0 };
    }

    drop(from, to) {
      const g = this.st.grid;
      if (to < 0 || to === from) { this.rebuildUnits(); return; }
      const a = g[from], b = g[to];
      if (b && a.type === b.type && a.lvl === b.lvl && a.lvl < MAX_LVL) {
        g[to] = { type: a.type, lvl: a.lvl + 1 };
        g[from] = null;
        sfx('level'); vibrate(20);
        this.spawnPop = { i: to, t: 0 };
        this.ui.tip.hidden = true;
      } else {
        g[to] = a; g[from] = b;
        sfx('tap');
      }
      Save.save();
      this.rebuildUnits();
    }

    // ---------------------------------------------------------------- battle
    startBattle() {
      if (this.state !== 'plan' || this.blocked() || !this.st.grid.some(Boolean)) return;
      this.state = 'battle';
      this.ui.bar.classList.add('fighting');
      this.ui.tip.hidden = true;
      this.fighters = [];
      const add = (u, i, enemy, mesh) => {
        const s = STATS[u.type], v = unitValue(u);
        const hp = s.hp * v * (enemy ? 1 : this.hpMult);
        const p = cellPos(i, enemy);
        const bar = new THREE.Sprite(new THREE.SpriteMaterial({ color: enemy ? '#ff4d5e' : '#4ade80', depthTest: false }));
        bar.center.set(0, 0.5); bar.renderOrder = 8;
        this.scene.add(bar);
        this.fighters.push({ u, enemy, mesh, x: p.x, z: p.z, hp, max: hp, dmg: s.dmg * v * (enemy ? 1 : this.dmgMult), range: s.range, rate: s.rate, speed: s.speed, cd: Math.random() * 0.5, bar, phase: 0 });
      };
      this.st.grid.forEach((u, i) => { if (u) add(u, i, false, this.meshes[i]); });
      let k = 0;
      this.enemyGrid.forEach((u, i) => { if (u) add(u, i, true, this.enemyMeshes[k++]); });
      this.battleT = 0;
      this.refreshUi();
      sfx('bad');
    }

    updateBattle(dt) {
      this.battleT += dt;
      const alive = (e) => this.fighters.filter((f) => f.hp > 0 && f.enemy === e);
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
          if (f.u.type === 'bow') this.arrows.push({ x: f.x, z: f.z, y: 1, target, dmg: f.dmg });
          else { target.hp -= f.dmg; target.hitT = 0.1; if (Math.random() < 0.3) sfx('hit'); }
        }
        if (f.swing > 0) f.swing -= dt;
        if (f.hitT > 0) f.hitT -= dt;
      }
      // gentle separation so crowds don't stack on one spot
      for (let i = 0; i < this.fighters.length; i++) for (let j = i + 1; j < this.fighters.length; j++) {
        const a = this.fighters[i], b = this.fighters[j];
        if (a.hp <= 0 || b.hp <= 0) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = 0.7;
        if (d < min && d > 0.001) { const k = (min - d) / 2; a.x -= (dx / d) * k; a.z -= (dz / d) * k; b.x += (dx / d) * k; b.z += (dz / d) * k; }
      }
      for (const a of this.arrows) {
        const t = a.target, dx = t.x - a.x, dz = t.z - a.z, d = Math.hypot(dx, dz);
        if (d < 0.4 || t.hp <= 0) { a.done = true; if (t.hp > 0) { t.hp -= a.dmg; t.hitT = 0.1; } continue; }
        const st = Math.min(d, 14 * dt);
        a.x += (dx / d) * st; a.z += (dz / d) * st; a.ry = Math.atan2(dx, dz);
      }
      this.arrows = this.arrows.filter((a) => !a.done);
      const mine = alive(false).length, theirs = alive(true).length;
      if (!mine || !theirs || this.battleT > 60) this.endBattle(theirs === 0 && mine > 0);
    }

    endBattle(won) {
      this.state = 'done';
      for (const f of this.fighters) { this.scene.remove(f.bar); f.bar.material.dispose(); }
      this.arrows = [];
      if (won) {
        sfx('win');
        setTimeout(() => this.api.win({ coins: 25 + this.levelNum * 6, troops: this.levelNum * 2, text: `⚔️ Enemy army ${fmt(this.power(this.enemyGrid, false))} defeated` }), 800);
      } else {
        // consolation coins so a player can never get stuck on a level
        const bonus = 15 + this.levelNum * 5;
        this.st.coins += bonus;
        Save.save();
        setTimeout(() => this.api.lose({ reason: `Your army was defeated. +${bonus} 🪙 to reinforce: merge stronger units and try again!`, canRevive: false }), 800);
      }
    }

    // ---------------------------------------------------------------- loop
    update(dt) {
      this.time += dt;
      if (this.state === 'battle') this.updateBattle(dt);
      if (this.spawnPop) { this.spawnPop.t += dt; if (this.spawnPop.t > 0.35) this.spawnPop = null; }
    }

    draw() {
      if (this.state === 'plan' || this.state === 'done' && !this.fighters) {
        this.meshes.forEach((m, i) => {
          if (!m || (this.drag && this.drag.i === i)) return;
          const p = cellPos(i, false);
          const pop = this.spawnPop && this.spawnPop.i === i ? 1 + Math.sin((this.spawnPop.t / 0.35) * Math.PI) * 0.4 : 1;
          m.position.set(p.x, Math.abs(Math.sin(this.time * 2 + i)) * 0.05, p.z);
          m.scale.setScalar((0.75 + this.st.grid[i].lvl * 0.12) * pop);
        });
        this.tiles.forEach((t, i) => {
          const a = this.drag && this.dragOver === i;
          const merge = a && this.st.grid[i] && this.st.grid[this.drag.i] && this.st.grid[i].type === this.st.grid[this.drag.i].type && this.st.grid[i].lvl === this.st.grid[this.drag.i].lvl;
          t.material.color.set(merge ? '#ffd23a' : a ? '#8fd0ff' : '#5a8fc9');
          t.material.opacity = a ? 0.7 : 0.35;
        });
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
          const lean = f.swing > 0 ? 0.5 : 0;
          m.rotation.x = lean * (f.u.type === 'sword' ? 1 : 0.3);
          const w = 1.1;
          f.bar.position.set(f.x - w / 2, 2.6 + f.u.lvl * 0.12, f.z);
          f.bar.scale.set(Math.max(0.01, (w * f.hp) / f.max), 0.12, 1);
        }
        this.arrows.forEach((a, i) => {
          this.dummy.position.set(a.x, 1, a.z); this.dummy.rotation.set(0, a.ry || 0, 0); this.dummy.updateMatrix();
          this.arrowMesh.setMatrixAt(i, this.dummy.matrix);
        });
        this.arrowMesh.count = Math.min(120, this.arrows.length);
        this.arrowMesh.instanceMatrix.needsUpdate = true;
      }
      this.camera.position.set(0, 13, 14);
      this.camera.lookAt(0, 0, 1.2);
      this.renderer.render(this.scene, this.camera);
    }

    destroy() {
      window.removeEventListener('resize', this.onResize);
      this.scene.traverse((o) => { if (o.material && o.material.map) o.material.map.dispose(); });
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.ly.destroy();
    }
  }

  GH.Games.merge = {
    id: 'merge',
    name: 'Merge Army',
    tagline: 'Merge troops. Crush the enemy army.',
    icon: '⚔️',
    colors: ['#7a1f16', '#e0772b'],
    create: (opts) => new MergeArmy(opts),
  };
  GH.Games.merge.enemyArmy = enemyArmy; // exposed for tests
})();

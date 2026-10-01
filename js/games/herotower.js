/*
 * HERO TOWER – the "power number" tower ad (Hero Wars / Evony / Tower War).
 * Your hero has a power number. Tap a room in the enemy towers to fight what is inside:
 * a weaker monster is absorbed (its power is added to yours), a stronger one kills you.
 * Potions add power; a ×2 potion doubles it, so save it for the right moment. Spike
 * traps (from level 5) drain power and must be cleared too: take them after the ×2. The boss
 * on the top floor only falls once you have absorbed everything else in a good order. Every level is generated from a solution.
 */
(function () {
  'use strict';
  const { Save, UI, sfx, vibrate, fmt, clamp, rng } = GH;

  const RW = 3.2, RH = 2.7, GAP = 0.7; // room width / height, gap between towers

  function genLevel(L, bonus) {
    const r = rng(L * 7717 + 3);
    const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
    const towers = Math.min(3, 1 + Math.floor((L + 1) / 3));
    const floors = Math.min(5, 2 + Math.floor(L / 2));
    const start = 5 + L * 2 + bonus;
    const rooms = [];
    for (let t = 0; t < towers; t++) for (let f = 0; f < floors; f++) rooms.push({ t, f, kind: 'enemy', val: 0, cleared: false });
    const boss = rooms[rooms.length - 1];
    boss.kind = 'boss';
    const others = rooms.filter((x) => x !== boss);
    for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
    // from level 3 the solution saves a ×2 potion for last: grabbing it early leaves you too weak for the boss
    // from level 5 a spike trap drains power. The solution takes it after the ×2 (it costs half as much there)
    const trap = L >= 5 ? others[others.length - 1] : null;
    const mult = L >= 3 ? others[others.length - (trap ? 2 : 1)] : null;
    const reserved = (mult ? 1 : 0) + (trap ? 1 : 0);
    const potions = L >= 2 ? Math.max(1, Math.floor(others.length / 5)) : 0;
    const potionIdx = new Set();
    while (potionIdx.size < Math.min(potions, others.length - reserved)) potionIdx.add(ri(0, others.length - 1 - reserved));
    // walk the solution order: each enemy is beatable exactly when it is reached
    let P = start;
    others.forEach((room, i) => {
      if (room === mult) { room.kind = 'mult'; room.val = 2; P *= 2; return; }
      if (room === trap) { room.kind = 'trap'; room.val = Math.max(2, Math.round(P * 0.3)); P -= room.val; return; }
      if (potionIdx.has(i)) { room.kind = 'potion'; room.val = ri(Math.ceil(P * 0.2), Math.ceil(P * 0.45)); }
      else room.val = ri(Math.max(1, Math.ceil(P * 0.25)), Math.max(1, Math.min(P - 1, Math.ceil(P * 0.7))));
      P += room.val;
    });
    boss.val = P - ri(1, Math.max(1, Math.floor(P * 0.06)));
    return { towers, floors, start, rooms, order: [...others, boss] };
  }

  class HeroTower {
    constructor({ api, level }) {
      this.api = api;
      this.K = GH.K3;
      this.levelNum = level;
      this.title = 'Hero Tower';
      this.bonus = GH.Town.lv('hall') - 1; // each Town Hall level after 1 = +1 starting power
      this.buildScene();
      this.load();
      api.setHudButtons([
        { label: this.hintLabel(), cls: 'gold' + (Save.data.items.hint ? '' : ' ad'), onClick: (el) => this.hint(el) },
        { label: '↻', cls: 'ghost', onClick: () => this.load() },
      ]);
    }

    buildScene() {
      const T = THREE, K = this.K;
      this.ly = K.layer('<div class="ht-tip">Tap a room with a <b>smaller</b> number to absorb it</div>');
      this.tip = this.ly.el.querySelector('.ht-tip');
      this.renderer = K.renderer(this.ly.el);
      const scene = (this.scene = new T.Scene());
      const sky = K.canvasTex(4, 256);
      const g = sky.ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, '#3b2a6b'); g.addColorStop(1, '#e98a5b');
      sky.ctx.fillStyle = g; sky.ctx.fillRect(0, 0, 4, 256);
      scene.background = sky.tex;
      this.camera = new T.PerspectiveCamera(42, 1, 0.5, 200);
      scene.add(new T.HemisphereLight('#ffe9d0', '#3a2c4a', 1.6));
      const sun = new T.DirectionalLight('#fff0dc', 2.2);
      sun.position.set(-10, 25, 22);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 25, bottom: -5, near: 1, far: 80 });
      scene.add(sun);
      const ground = new T.Mesh(new T.PlaneGeometry(200, 60), K.lam('#5b8f4a'));
      ground.rotation.x = -Math.PI / 2; ground.position.z = -10; ground.receiveShadow = true;
      scene.add(ground);
      this.ray = new T.Raycaster();
      this.onPtr = (e) => {
        if (this.paused || UI.modalCount || this.busy || this.state !== 'play' || e.target.closest('button')) return;
        const r = this.ly.el.getBoundingClientRect();
        this.ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
        const hit = this.ray.intersectObjects(this.hitBoxes)[0];
        if (hit) this.enter(hit.object.userData.room);
      };
      this.ly.el.addEventListener('pointerdown', this.onPtr);
      this.onResize = () => this.fitCamera();
      window.addEventListener('resize', this.onResize);
    }

    roomPos(room) {
      const x = this.x0 + (room.t + 1) * (RW + GAP);
      return { x, y: 0.4 + room.f * RH };
    }

    load() {
      const T = THREE, K = this.K;
      this.lv = genLevel(this.levelNum, Math.max(0, this.bonus));
      this.power = this.lv.start;
      this.state = 'play';
      this.busy = false;
      this.time = 0;
      this.hintRoom = null;
      if (this.world) this.scene.remove(this.world);
      const W = (this.world = new T.Group());
      this.scene.add(W);
      const nT = this.lv.towers;
      this.x0 = -((nT + 1) * (RW + GAP)) / 2 + RW / 2;
      const stone = K.lam('#a79c8e'), stoneD = K.lam('#7d7266'), inner = K.lam('#4a3b36');
      const tower = (x, floors, roofColor) => {
        const h = floors * RH;
        W.add(K.box(RW + 0.6, 0.4, 2.6, stoneD, x, 0.2, 0));
        for (let f = 0; f <= floors; f++) W.add(K.box(RW + 0.5, 0.3, 2.5, stone, x, 0.4 + f * RH, 0));
        W.add(K.box(0.3, h, 2.5, stone, x - RW / 2 - 0.1, 0.4 + h / 2, 0), K.box(0.3, h, 2.5, stone, x + RW / 2 + 0.1, 0.4 + h / 2, 0));
        const back = K.box(RW, h, 0.2, inner, x, 0.4 + h / 2, -1.15);
        back.receiveShadow = true;
        W.add(back);
        const roof = K.mesh(new T.ConeGeometry(RW * 0.85, 2.2, 4), K.lam(roofColor), x, 0.4 + h + 1.3, 0);
        roof.rotation.y = Math.PI / 4;
        W.add(roof);
      };
      tower(this.x0, 1, '#3a7bd5');
      for (let t = 0; t < nT; t++) tower(this.x0 + (t + 1) * (RW + GAP), this.lv.floors, '#c0392b');

      this.hitBoxes = [];
      for (const room of this.lv.rooms) {
        const { x, y } = this.roomPos(room);
        const hb = new T.Mesh(new T.BoxGeometry(RW, RH, 2), new T.MeshBasicMaterial({ visible: false }));
        hb.position.set(x, y + RH / 2, 0);
        hb.userData.room = room;
        W.add(hb);
        this.hitBoxes.push(hb);
        room.grp = this.roomContent(room);
        room.grp.position.set(x, y + 0.15, 0);
        W.add(room.grp);
        const txt = { potion: `+${room.val}`, mult: '×2', trap: `−${fmt(room.val)}` }[room.kind] || fmt(room.val);
        const col = { potion: '#35d07f', mult: '#d4a017', trap: '#8e44ad' }[room.kind] || '#ff4d5e';
        room.label = this.label(txt, col);
        room.label.position.set(x, y + RH - 0.35, 0.6);
        W.add(room.label);
      }
      // hero
      this.hero = K.person('#3a7bd5', null);
      this.hero.add(K.mesh(K.geo.sphere, K.std('#ffd84a', { metalness: 0.7, roughness: 0.3 }), 0, 1.45, 0, 0.62, 0.5, 0.62));
      this.hero.add(K.box(0.1, 1.1, 0.05, K.std('#e8eef8', { metalness: 0.85, roughness: 0.2 }), 0.45, 0.9, 0.15));
      this.hero.scale.setScalar(1.1);
      this.heroPos = { x: this.x0, y: 0.55 };
      this.hero.position.set(this.heroPos.x, this.heroPos.y, 0.2);
      W.add(this.hero);
      this.heroLabel = this.label(fmt(this.power), '#3a8dff');
      W.add(this.heroLabel);
      this.fitCamera();
      this.api.setTitle(`Hero Tower`);
    }

    label(text, color) {
      const tx = this.K.canvasTex(256, 110);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx.tex, depthTest: false }));
      sp.scale.set(1.9, 0.82, 1);
      sp.renderOrder = 10;
      sp.userData = { tx, color };
      this.setLabel(sp, text);
      return sp;
    }
    setLabel(sp, text) {
      const { ctx, tex } = sp.userData.tx;
      ctx.clearRect(0, 0, 256, 110);
      ctx.fillStyle = sp.userData.color;
      GH.roundRect(ctx, 20, 12, 216, 86, 43); ctx.fill();
      ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.font = '900 60px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff'; ctx.fillText(text, 128, 58);
      tex.needsUpdate = true;
    }

    roomContent(room) {
      const K = this.K, T = THREE, g = new T.Group();
      if (room.kind === 'trap') {
        g.add(K.box(2.4, 0.15, 1.4, K.lam('#5a4a5e'), 0, 0.08, 0));
        for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) g.add(K.mesh(new T.ConeGeometry(0.16, 0.7, 6), K.std('#c9ced8', { metalness: 0.8, roughness: 0.3 }), i * 0.45, 0.45, j * 0.4));
        return g;
      }
      if (room.kind === 'potion' || room.kind === 'mult') {
        const c = room.kind === 'mult' ? '#ffc93c' : '#35d07f';
        g.add(K.mesh(K.geo.sphere, K.std(c, { emissive: room.kind === 'mult' ? '#7a5a00' : '#0f7a3a', emissiveIntensity: 0.8, transparent: true, opacity: 0.9 }), 0, 0.45, 0, room.kind === 'mult' ? 1 : 0.8, room.kind === 'mult' ? 1 : 0.8, room.kind === 'mult' ? 1 : 0.8));
        g.add(K.mesh(K.geo.cyl, K.lam('#dfe6ef'), 0, 0.95, 0, 0.25, 0.35, 0.25), K.mesh(K.geo.cyl, K.lam('#8a5a32'), 0, 1.18, 0, 0.2, 0.15, 0.2));
        return g;
      }
      // monsters get bigger with their share of the tower's total power
      const boss = room.kind === 'boss';
      const s = boss ? 1.9 : 0.85 + Math.min(0.7, room.val / (this.lv.start * 6));
      const body = boss ? '#5b1a14' : ['#8e44ad', '#c0392b', '#2e7d32', '#d35400'][(room.t + room.f) % 4];
      const m = K.person(body, null, boss ? '#c9a227' : '#8fbf5a');
      m.add(K.mesh(new T.ConeGeometry(0.08, 0.35, 6), K.lam('#fff'), -0.18, 1.62, 0.05), K.mesh(new T.ConeGeometry(0.08, 0.35, 6), K.lam('#fff'), 0.18, 1.62, 0.05));
      m.add(K.box(0.1, 0.07, 0.03, K.basic('#ff2a2a'), -0.1, 1.38, 0.27), K.box(0.1, 0.07, 0.03, K.basic('#ff2a2a'), 0.1, 1.38, 0.27));
      if (boss) for (let i = -2; i <= 2; i++) m.add(K.mesh(new T.ConeGeometry(0.07, 0.25, 4), K.std('#ffd84a', { metalness: 0.8 }), i * 0.1, 1.75, 0));
      m.scale.setScalar(s);
      g.add(m);
      g.userData.monster = m;
      return g;
    }

    fitCamera() {
      const el = this.ly.el, r = el.getBoundingClientRect();
      if (!r.width || !this.lv) return;
      this.renderer.setSize(r.width, r.height, false);
      this.renderer.domElement.style.width = '100%';
      this.renderer.domElement.style.height = '100%';
      const aspect = r.width / r.height;
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
      const halfW = ((this.lv.towers + 1) * (RW + GAP)) / 2 + 0.6;
      const topY = 0.4 + this.lv.floors * RH + 2.6;
      const halfH = topY / 2 + 1;
      const t = Math.tan((this.camera.fov * Math.PI) / 360);
      const dist = Math.max(halfW / (t * aspect), halfH / t) + 2;
      this.camera.position.set(1.5, topY / 2 + 1.5, dist);
      this.camera.lookAt(0, topY / 2 - 0.3, 0);
    }

    // ---------------------------------------------------------------- play
    beatable(room) { return room.kind === 'potion' || room.kind === 'mult' || this.power > room.val; } // traps also need power > their drain

    enter(room) {
      if (room.cleared) return;
      this.busy = true;
      this.hintRoom = null;
      this.tip.hidden = true;
      const { x, y } = this.roomPos(room);
      this.move = { from: { ...this.heroPos }, to: { x: x - 0.8, y: y + 0.15 }, t: 0, room };
      sfx('tap');
    }

    resolve(room) {
      const m = room.grp;
      if (room.kind === 'potion' || room.kind === 'mult' || this.power > room.val) {
        room.cleared = true;
        this.power = room.kind === 'mult' ? this.power * 2 : room.kind === 'trap' ? this.power - room.val : this.power + room.val;
        this.pop = { grp: m, t: 0 };
        room.label.visible = false;
        this.setLabel(this.heroLabel, fmt(this.power));
        this.heroPulse = 0.4;
        sfx(room.kind === 'enemy' || room.kind === 'boss' ? 'hit' : 'coin'); vibrate(20);
        if (this.lv.rooms.every((x) => x.cleared)) {
          this.state = 'done';
          setTimeout(() => this.api.win({ coins: 30 + this.levelNum * 6, text: `💪 Final power ${fmt(this.power)}` }), 700);
        }
      } else {
        this.state = 'done';
        this.heroDead = 0.001;
        sfx('bad'); vibrate([60, 40, 60]);
        setTimeout(() => this.api.lose({ reason: room.kind === 'trap' ? `The spikes drained all ${fmt(this.power)} power!` : `Power ${fmt(this.power)} vs ${fmt(room.val)}: too strong!`, canRevive: false }), 900);
      }
      this.busy = false;
    }

    hintLabel() { const n = Save.data.items.hint || 0; return n ? `💡 Hint ×${n}` : '💡 Hint'; }
    async hint(el) {
      if (this.state !== 'play' || this.busy) return;
      // follow the generated solution; fall back to any beatable room if the player left it
      let next = this.lv.order.find((x) => !x.cleared);
      if (next && !this.beatable(next)) next = this.lv.rooms.find((x) => !x.cleared && this.beatable(x) && x.kind === 'enemy');
      if (!next) { UI.toast('No safe room left. Restart ↻'); return; }
      if (!Save.useItem('hint')) {
        this.paused = true;
        const ok = await Monetization.showRewarded('tower_hint');
        this.paused = false;
        if (!ok) return;
        Monetization.resetInterstitialCounter();
      }
      this.hintRoom = next;
      if (el) { el.innerHTML = this.hintLabel(); el.classList.toggle('ad', !Save.data.items.hint); }
    }

    update(dt) {
      this.time += dt;
      if (this.move) {
        const mv = this.move;
        mv.t = Math.min(1, mv.t + dt * 1.8);
        const k = mv.t;
        this.heroPos.x = mv.from.x + (mv.to.x - mv.from.x) * k;
        this.heroPos.y = mv.from.y + (mv.to.y - mv.from.y) * k + Math.sin(k * Math.PI) * 1.6;
        if (mv.t >= 1) { this.move = null; this.fight = { room: mv.room, t: 0 }; }
      }
      if (this.fight) {
        this.fight.t += dt;
        if (this.fight.t > 0.55) { const r = this.fight.room; this.fight = null; this.resolve(r); }
      }
      if (this.pop) { this.pop.t += dt; this.pop.grp.scale.setScalar(Math.max(0.001, 1 - this.pop.t * 3)); if (this.pop.t > 0.4) this.pop = null; }
      if (this.heroPulse > 0) this.heroPulse -= dt;
      if (this.heroDead) this.heroDead += dt;
    }

    draw() {
      if (!this.lv) return;
      const h = this.hero;
      const fightShake = this.fight ? Math.sin(this.time * 50) * 0.12 : 0;
      h.position.set(this.heroPos.x + fightShake, this.heroPos.y, 0.2);
      h.rotation.y = 0.5;
      h.rotation.z = this.heroDead ? Math.min(1.5, this.heroDead * 4) : 0;
      h.scale.setScalar(1.1 * (this.heroPulse > 0 ? 1 + this.heroPulse * 0.6 : 1));
      this.K.animLegs(h, this.time * 14, !!this.move);
      this.heroLabel.position.set(this.heroPos.x, this.heroPos.y + 2.4, 0.6);
      for (const room of this.lv.rooms) {
        const mon = room.grp.userData.monster;
        if (mon && !room.cleared) mon.position.y = Math.abs(Math.sin(this.time * 3 + room.f + room.t)) * 0.08;
        if ((room.kind === 'potion' || room.kind === 'mult') && !room.cleared) room.grp.rotation.y = this.time;
        const hinted = room === this.hintRoom;
        room.label.scale.setScalar(hinted ? 1 + Math.abs(Math.sin(this.time * 6)) * 0.35 : 1);
        room.label.scale.x *= 1.9; room.label.scale.y *= 0.82;
      }
      this.renderer.render(this.scene, this.camera);
    }

    destroy() {
      window.removeEventListener('resize', this.onResize);
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.ly.destroy();
    }
  }

  GH.Games.tower = {
    id: 'tower',
    name: 'Hero Tower',
    tagline: 'Absorb weaker foes. Order matters.',
    icon: '🗼',
    colors: ['#3b2a6b', '#e98a5b'],
    skippable: true,
    create: (opts) => new HeroTower(opts),
  };
  GH.Games.tower.genLevel = genLevel; // exposed for tests
})();

/*
 * Town meta-game: the hub every mini-game feeds into.
 *  - Buildings cost Gold / Food / Troops and power up the mini-games.
 *  - Kitchen and Vault produce resources over time (collect by tapping them).
 *  - Winning levels drops chests (4 slots, unlock over time, Clash Royale style).
 *  - Chests hold resources and power-up cards used inside the mini-games.
 */
(function () {
  'use strict';
  const { Save, UI, sfx, vibrate, fmt, clamp } = GH;

  const RES = {
    coins: { icon: '🪙', name: 'Gold' },
    food: { icon: '🥩', name: 'Food' },
    troops: { icon: '🪖', name: 'Troops' },
    gems: { icon: '💎', name: 'Gems' },
  };

  const ITEMS = {
    hint: { icon: '💡', name: 'Hint card', game: 'Pin Rescue', desc: 'Shows the next pin to pull' },
    reinforce: { icon: '🛡️', name: 'Reinforcements', game: 'Gate Rush', desc: '+10 soldiers during a run' },
    hotgrill: { icon: '🔥', name: 'Hot Grill', game: 'Frost Survival', desc: 'Double camp cash for 90s' },
  };

  const lv = (id) => Save.data.town[id] || 0;
  const sq = (n) => n * n;

  // cost(n) = price of reaching level n. Other buildings are capped at the Town Hall level.
  const BUILDINGS = {
    hall: { name: 'Town Hall', icon: '🏰', plot: [0, -0.5], max: 10, color: '#3a7bd5',
      desc: (l) => `Other buildings can reach level ${l}`,
      cost: (n) => ({ coins: 250 * sq(n - 1), food: 80 * sq(n - 1), troops: 40 * sq(n - 1) }) },
    barracks: { name: 'Barracks', icon: '⚔️', plot: [-5.2, 1.2], color: '#d9534f',
      desc: (l) => `Gate Rush: start with +${3 * l} soldiers`,
      cost: (n) => ({ coins: 60 + 90 * sq(n), food: 20 * n }) },
    forge: { name: 'Forge', icon: '🔨', plot: [5.2, 1.2], color: '#e0772b',
      desc: (l) => `Frost Survival: +${20 * l}% axe & crossbow damage`,
      cost: (n) => ({ coins: 80 + 100 * sq(n), troops: 15 * n }) },
    lodge: { name: "Hunter's Lodge", icon: '🏹', plot: [-5.2, -4.6], color: '#6b8e23',
      desc: (l) => `Frost Survival: hunters +${25 * l}% faster, offline hunting up to ${2 + l}h`,
      cost: (n) => ({ coins: 80 + 100 * sq(n), food: 30 * n }) },
    kitchen: { name: 'Kitchen', icon: '🍲', plot: [5.2, -4.6], color: '#c0392b',
      desc: (l) => `Cooks ${30 * l} 🥩/hour. Camp steaks sell for +${10 * l}%`,
      cost: (n) => ({ coins: 50 + 80 * sq(n), troops: 10 * n }), produces: 'food', rate: (l) => 30 * l },
    vault: { name: 'Vault', icon: '💰', plot: [-2.7, 4.8], color: '#d4a017',
      desc: (l) => `Mints ${60 * l} 🪙/hour. +${10 * l}% gold from games`,
      cost: (n) => ({ coins: 70 + 90 * sq(n), food: 25 * n, troops: 10 * n }), produces: 'coins', rate: (l) => 60 * l },
    tower: { name: 'Mage Tower', icon: '🔮', plot: [2.7, 4.8], color: '#8e44ad',
      desc: (l) => `Chests unlock ${15 * l}% faster`,
      cost: (n) => ({ coins: 100 + 110 * sq(n), food: 25 * n, troops: 20 * n }) },
    walls: { name: 'Walls', icon: '🧱', plot: [0, -7.6], color: '#8d909b',
      desc: (l) => `Frost Survival: +${25 * l} max health`,
      cost: (n) => ({ coins: 60 + 80 * sq(n), troops: 20 * n }) },
  };
  const PROD_CAP_H = 4;

  const CHESTS = {
    wood: { name: 'Wooden Chest', icon: '📦', secs: 30, mult: 1, items: 1, color: '#a86f3e' },
    silver: { name: 'Silver Chest', icon: '🎁', secs: 120, mult: 2.5, items: 2, color: '#b8c4d4' },
    gold: { name: 'Golden Chest', icon: '👑', secs: 300, mult: 6, items: 3, color: '#ffc93c' },
  };

  const Town = {
    RES, ITEMS, BUILDINGS, CHESTS, lv,

    bonus: {
      gateStart: () => 3 * lv('barracks'),
      frostDmg: () => 1 + 0.2 * lv('forge'),
      frostHp: () => 25 * lv('walls'),
      hunterSpeed: () => 1 + 0.25 * lv('lodge'),
      offlineHours: () => 2 + lv('lodge'),
      steakMult: () => 1 + 0.1 * lv('kitchen'),
      goldMult: () => 1 + 0.1 * lv('vault'),
      chestTime: () => 1 / (1 + 0.15 * lv('tower')),
    },

    maxLevel(id) { return id === 'hall' ? BUILDINGS.hall.max : lv('hall'); },
    nextCost(id) { return BUILDINGS[id].cost(lv(id) + 1); },

    upgrade(id) {
      const cost = this.nextCost(id);
      if (lv(id) >= this.maxLevel(id)) { UI.toast('Upgrade the Town Hall first 🏰'); return false; }
      if (!Save.canAfford(cost)) { UI.toast('Not enough resources'); return false; }
      // start production timers fresh when a producer is first built
      if (BUILDINGS[id].produces && !lv(id)) Save.data.prod[id] = Date.now();
      else if (BUILDINGS[id].produces) this.collect(id, true);
      for (const [k, v] of Object.entries(cost)) Save.data[k] -= v;
      Save.data.town[id] = lv(id) + 1;
      Save.save();
      sfx('level'); vibrate([20, 30, 20]);
      Monetization.track('town_upgrade', { id, level: lv(id) });
      return true;
    },

    pending(id) {
      const b = BUILDINGS[id];
      if (!b.produces || !lv(id)) return 0;
      const since = Save.data.prod[id] || Date.now();
      const hours = Math.min(PROD_CAP_H, (Date.now() - since) / 3600000);
      return Math.floor(hours * b.rate(lv(id)));
    },

    collect(id, silent) {
      const n = this.pending(id);
      Save.data.prod[id] = Date.now();
      if (n > 0) {
        Save.data[BUILDINGS[id].produces] += n;
        if (!silent) { Save.save(); sfx('coin'); UI.toast(`+${fmt(n)} ${RES[BUILDINGS[id].produces].icon}`); }
      }
      return n;
    },

    // ------------------------------------------------------------ chests
    rollChest(levelNum) {
      if (levelNum % 5 === 0) return 'gold';
      const r = Math.random();
      return r < 0.07 ? 'gold' : r < 0.32 ? 'silver' : 'wood';
    },

    /** Returns the slot index, or -1 when every slot is full. */
    addChest(type) {
      const i = Save.data.chests.findIndex((c) => !c);
      if (i < 0) return -1;
      Save.data.chests[i] = { type, start: null };
      Save.save();
      return i;
    },

    chestSecs(c) { return Math.ceil(CHESTS[c.type].secs * this.bonus.chestTime()); },
    chestLeft(c) {
      if (!c.start) return this.chestSecs(c);
      return Math.max(0, Math.ceil(this.chestSecs(c) - (Date.now() - c.start) / 1000));
    },
    chestState(c) {
      if (!c) return 'empty';
      if (!c.start) return 'locked';
      return this.chestLeft(c) > 0 ? 'unlocking' : 'ready';
    },
    unlocking() { return Save.data.chests.some((c) => this.chestState(c) === 'unlocking'); },
    startUnlock(i) {
      const c = Save.data.chests[i];
      if (!c || c.start) return;
      if (this.unlocking()) { UI.toast('Another chest is already unlocking'); return; }
      c.start = Date.now();
      Save.save();
    },
    gemsToOpen(c) { return Math.max(1, Math.ceil(this.chestLeft(c) / 20)); },

    chestRewards(type) {
      const def = CHESTS[type];
      const h = lv('hall');
      const k = def.mult * (1 + (h - 1) * 0.5) * (0.85 + Math.random() * 0.3);
      const r = {
        coins: Math.round((50 + 25 * h) * k),
        food: Math.round((20 + 10 * h) * k),
        troops: Math.round((10 + 6 * h) * k),
        items: {},
      };
      if (type !== 'wood' || Math.random() < 0.2) r.gems = type === 'gold' ? 8 : type === 'silver' ? 3 : 1;
      const ids = Object.keys(ITEMS);
      for (let i = 0; i < def.items; i++) {
        const id = ids[Math.floor(Math.random() * ids.length)];
        r.items[id] = (r.items[id] || 0) + 1;
      }
      return r;
    },

    openChest(i) {
      const c = Save.data.chests[i];
      if (!c) return;
      const rewards = this.chestRewards(c.type);
      Save.data.chests[i] = null;
      Save.grant(rewards);
      sfx('win'); vibrate([30, 30, 60]);
      Monetization.track('chest_open', { type: c.type });
      const lines = Object.entries(rewards).flatMap(([k, v]) =>
        k === 'items' ? Object.entries(v).map(([id, n]) => `<div class="loot"><span>${ITEMS[id].icon}</span><b>${ITEMS[id].name} ×${n}</b></div>`)
          : [`<div class="loot"><span>${RES[k].icon}</span><b>+${fmt(v)} ${RES[k].name}</b></div>`]).join('');
      UI.modal({ cls: 'win', icon: CHESTS[c.type].icon, title: CHESTS[c.type].name, body: `<div class="loot-list">${lines}</div>`, buttons: [{ label: 'Collect', cls: 'green' }] });
    },

    rewardChips(res) {
      return Object.entries(res).filter(([, v]) => v).map(([k, v]) => `<span class="chip">${RES[k].icon} ${fmt(v)}</span>`).join('');
    },
  };

  // ================================================================ 3D town view
  class TownView {
    constructor(host, onTap) {
      const T = THREE;
      this.host = host;
      this.onTap = onTap;
      this.renderer = new T.WebGLRenderer({ antialias: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = T.PCFSoftShadowMap;
      host.appendChild(this.renderer.domElement);
      const scene = (this.scene = new T.Scene());
      scene.background = new T.Color('#a9cbe8');
      scene.fog = new T.Fog('#a9cbe8', 40, 80);
      this.camera = new T.PerspectiveCamera(40, 1, 0.5, 200);
      this.pan = { x: 0, z: 0 };
      scene.add(new T.HemisphereLight('#ffffff', '#8aa0b8', 1.8));
      const sun = new T.DirectionalLight('#fff1dc', 2.4);
      sun.position.set(10, 22, 12);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
      scene.add(sun);
      this.lam = {};
      this.buildGround();
      this.groups = {};
      this.labels = {};
      this.refresh();
      this.bindInput();
      this.resize = this.resize.bind(this);
      window.addEventListener('resize', this.resize);
      this.resize();
      this.loop = this.loop.bind(this);
      this.t = 0;
    }

    mat(c) { return this.lam[c] || (this.lam[c] = new THREE.MeshLambertMaterial({ color: c })); }

    box(w, h, d, c, x = 0, y = 0, z = 0) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(c));
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      return m;
    }

    roof(w, h, c, x = 0, y = 0, z = 0) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(w, h, 4), this.mat(c));
      m.rotation.y = Math.PI / 4;
      m.position.set(x, y, z);
      m.castShadow = true;
      return m;
    }

    buildGround() {
      const T = THREE;
      const island = new T.Mesh(new T.CylinderGeometry(14, 13, 1.2, 40), this.mat('#e8eff6'));
      island.position.y = -0.6;
      island.receiveShadow = true;
      this.scene.add(island);
      const cliff = new T.Mesh(new T.CylinderGeometry(13, 10, 4, 40), this.mat('#8d9aa8'));
      cliff.position.y = -3.2;
      this.scene.add(cliff);
      // cobblestone paths
      const path = this.mat('#c9b48f');
      for (const [x, z, w, d] of [[0, 1.5, 1.6, 12], [0, 1.2, 12, 1.4], [0, -4.6, 12, 1.4]]) {
        const p = new T.Mesh(new T.BoxGeometry(w, 0.05, d), path);
        p.position.set(x, 0.02, z);
        p.receiveShadow = true;
        this.scene.add(p);
      }
      // pine ring
      const rnd = GH.rng(99);
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2 + rnd() * 0.2;
        const r = 11.2 + rnd() * 1.8;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (z > 8) continue; // keep the camera side open
        const s = 0.7 + rnd() * 0.5;
        const cone = new T.Mesh(new T.ConeGeometry(1.1 * s, 2.6 * s, 7), this.mat('#3f78a3'));
        cone.position.set(x, 1.3 * s, z);
        cone.castShadow = true;
        const cap = new T.Mesh(new T.ConeGeometry(0.5 * s, 0.9 * s, 7), this.mat('#ffffff'));
        cap.position.set(x, 2.3 * s, z);
        this.scene.add(cone, cap);
      }
    }

    model(id, l) {
      const T = THREE;
      const g = new T.Group();
      const b = BUILDINGS[id];
      if (!l) {
        g.add(this.box(2.6, 0.12, 2.6, '#b08a5a', 0, 0.06, 0));
        g.add(this.box(0.12, 1.2, 0.12, '#6e4424', -0.6, 0.6, 0.6));
        g.add(this.box(1.1, 0.6, 0.08, '#e8d9b8', -0.6, 1.2, 0.62));
        g.add(this.box(0.3, 0.3, 0.3, '#a86f3e', 0.6, 0.15, -0.5), this.box(0.3, 0.3, 0.3, '#a86f3e', 0.8, 0.45, -0.5));
        return g;
      }
      const f = 1 + Math.min(l, 10) * 0.07; // buildings grow with level
      const H = 1.2 + Math.min(l, 10) * 0.18;
      switch (id) {
        case 'hall':
          g.add(this.box(3.4 * f, H + 0.6, 2.8 * f, '#d8d0c2', 0, (H + 0.6) / 2, 0));
          g.add(this.roof(2.7 * f, 1.6, b.color, 0, H + 1.4, 0));
          for (const sx of [-1, 1]) {
            g.add(this.box(0.9, H + 1.6, 0.9, '#c9c1b2', sx * 1.9 * f, (H + 1.6) / 2, 1.2 * f));
            g.add(this.roof(0.75, 0.9, b.color, sx * 1.9 * f, H + 2.05, 1.2 * f));
          }
          g.add(this.box(0.9, 1.1, 0.1, '#6e4424', 0, 0.55, 1.42 * f));
          g.add(this.box(0.05, 1.2, 0.05, '#555', 0, H + 2.6, 0), this.box(0.6, 0.35, 0.03, '#ffc93c', 0.3, H + 3.0, 0));
          break;
        case 'barracks':
          g.add(this.box(2.4 * f, H, 1.8 * f, '#e2d6c0', 0, H / 2, 0));
          g.add(this.roof(1.9 * f, 1.1, b.color, 0, H + 0.55, 0));
          g.add(this.box(0.05, 1.4, 0.05, '#555', 1.1 * f, H + 0.2, 0.8 * f), this.box(0.5, 0.3, 0.03, b.color, 1.35 * f, H + 0.7, 0.8 * f));
          break;
        case 'forge':
          g.add(this.box(2.2 * f, H, 1.8 * f, '#7d7068', 0, H / 2, 0));
          g.add(this.roof(1.8 * f, 0.9, '#4a3f38', 0, H + 0.45, 0));
          g.add(this.box(0.5, H + 1.2, 0.5, '#5a504a', 0.6 * f, (H + 1.2) / 2, -0.4));
          g.add(this.box(0.8, 0.5, 0.05, '#ff9a3c', 0, 0.45, 0.92 * f));
          break;
        case 'lodge':
          for (let i = 0; i < 4 + Math.min(l, 6); i++) g.add(this.box(2.4 * f, 0.22, 0.22, '#8a5a32', 0, 0.12 + i * 0.22, 0.8 * f), this.box(2.4 * f, 0.22, 0.22, '#8a5a32', 0, 0.12 + i * 0.22, -0.8 * f));
          g.add(this.box(2.2 * f, (4 + Math.min(l, 6)) * 0.22, 1.5 * f, '#a86f3e', 0, (4 + Math.min(l, 6)) * 0.11, 0));
          g.add(this.roof(1.9 * f, 1, '#556b2f', 0, (4 + Math.min(l, 6)) * 0.22 + 0.5, 0));
          break;
        case 'kitchen':
          g.add(this.box(2.2 * f, H, 1.8 * f, '#efe3cf', 0, H / 2, 0));
          g.add(this.roof(1.8 * f, 1, b.color, 0, H + 0.5, 0));
          g.add(this.box(0.4, H + 1.3, 0.4, '#8d909b', -0.6 * f, (H + 1.3) / 2, -0.3));
          this.smoke = this.smoke || [];
          break;
        case 'vault': {
          g.add(this.box(2 * f, H, 2 * f, '#d8d0c2', 0, H / 2, 0));
          const dome = new T.Mesh(new T.SphereGeometry(1.05 * f, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.mat(b.color));
          dome.position.y = H; dome.castShadow = true;
          g.add(dome);
          break;
        }
        case 'tower': {
          const t = new T.Mesh(new T.CylinderGeometry(0.8 * f, 1 * f, H + 1.8, 10), this.mat('#d0c8e0'));
          t.position.y = (H + 1.8) / 2; t.castShadow = true;
          const c = new T.Mesh(new T.ConeGeometry(1.05 * f, 1.6, 10), this.mat(b.color));
          c.position.y = H + 2.6; c.castShadow = true;
          const orb = new T.Mesh(new T.SphereGeometry(0.25, 10, 8), new T.MeshBasicMaterial({ color: '#d7a8ff' }));
          orb.position.y = H + 3.6;
          g.add(t, c, orb);
          g.userData.orb = orb;
          break;
        }
        case 'walls':
          for (let i = -4; i <= 4; i++) {
            const h = 0.9 + Math.min(l, 10) * 0.08;
            g.add(this.box(0.9, h, 0.7, i % 2 ? '#9a9da8' : '#8d909b', i * 0.92, h / 2, 0));
            if (i % 2 === 0) g.add(this.box(0.5, 0.3, 0.7, '#9a9da8', i * 0.92, h + 0.15, 0));
          }
          break;
      }
      return g;
    }

    label(id) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 96;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
      sp.scale.set(2.4, 0.9, 1);
      sp.renderOrder = 10;
      sp.userData = { c, tex, key: '' };
      return sp;
    }

    drawLabel(sp, id) {
      const l = lv(id);
      const pend = Town.pending(id);
      const canUp = l < Town.maxLevel(id) && Save.canAfford(Town.nextCost(id));
      const key = `${l}|${pend > 0}|${canUp}`;
      if (sp.userData.key === key) return;
      sp.userData.key = key;
      const ctx = sp.userData.c.getContext('2d');
      ctx.clearRect(0, 0, 256, 96);
      const b = BUILDINGS[id];
      const text = l ? `Lv ${l}` : 'Build';
      ctx.font = '900 34px system-ui, sans-serif';
      const w = ctx.measureText(text).width + 36;
      ctx.fillStyle = l ? 'rgba(20,26,46,.82)' : 'rgba(40,120,60,.9)';
      GH.roundRect(ctx, 128 - w / 2, 46, w, 44, 22); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, 128, 69);
      if (pend > 0) {
        ctx.font = '40px system-ui, sans-serif';
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(128, 22, 22, 0, Math.PI * 2); ctx.fill();
        ctx.fillText(RES[b.produces].icon, 128, 24);
      } else if (canUp) {
        ctx.fillStyle = '#35d07f'; ctx.beginPath(); ctx.arc(128 + w / 2, 50, 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#06301a'; ctx.font = '900 24px system-ui'; ctx.fillText('↑', 128 + w / 2, 51);
      }
      sp.userData.tex.needsUpdate = true;
    }

    refresh() {
      for (const id of Object.keys(BUILDINGS)) {
        const l = lv(id);
        const old = this.groups[id];
        if (old && old.userData.level === l) { this.drawLabel(this.labels[id], id); continue; }
        if (old) {
          this.scene.remove(old);
          old.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        }
        const g = this.model(id, l);
        const [x, z] = BUILDINGS[id].plot;
        g.position.set(x, 0, z);
        g.traverse((o) => { o.userData.buildingId = id; });
        g.userData.level = l;
        const box = new THREE.Box3().setFromObject(g);
        const sp = this.labels[id] || this.label(id);
        sp.position.set(0, box.max.y + 0.7, 0);
        g.add(sp);
        this.labels[id] = sp;
        this.drawLabel(sp, id);
        if (old) g.scale.setScalar(0.6); // pop-in when upgraded
        this.scene.add(g);
        this.groups[id] = g;
      }
    }

    bindInput() {
      const el = this.renderer.domElement;
      el.style.touchAction = 'pan-y';
      let down = null;
      el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, px: this.pan.x, pz: this.pan.z, moved: false }; });
      el.addEventListener('pointermove', (e) => {
        if (!down) return;
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (Math.abs(dx) > 6) down.moved = true;
        if (down.moved) this.pan.x = clamp(down.px - dx * 0.03, -5, 5);
      });
      el.addEventListener('pointerup', (e) => {
        if (down && !down.moved && Math.abs(e.clientY - down.y) < 8) this.pick(e);
        down = null;
      });
      el.addEventListener('pointercancel', () => { down = null; });
    }

    pick(e) {
      const r = this.renderer.domElement.getBoundingClientRect();
      const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(v, this.camera);
      const hit = ray.intersectObjects(Object.values(this.groups), true).find((h) => h.object.userData.buildingId);
      if (hit) { sfx('tap'); this.onTap(hit.object.userData.buildingId); }
    }

    resize() {
      const r = this.host.getBoundingClientRect();
      if (!r.width || !r.height) return;
      this.renderer.setSize(r.width, r.height, false);
      this.renderer.domElement.style.width = '100%';
      this.renderer.domElement.style.height = '100%';
      const aspect = r.width / r.height;
      this.camera.aspect = aspect;
      // fit ~20 world units across, whatever the screen shape
      this.camera.fov = clamp((2 * Math.atan(10.5 / 27 / aspect) * 180) / Math.PI, 30, 70);
      this.camera.updateProjectionMatrix();
    }

    setActive(on) {
      if (on && !this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame(this.loop); this.resize(); }
      if (!on) this.running = false;
    }

    loop(now) {
      if (!this.running) return;
      requestAnimationFrame(this.loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.t += dt;
      for (const g of Object.values(this.groups)) {
        if (g.scale.x < 1) g.scale.setScalar(Math.min(1, g.scale.x + dt * 2.5));
        if (g.userData.orb) g.userData.orb.position.y += Math.sin(this.t * 3) * 0.004;
      }
      if (Math.floor(this.t * 2) !== this.labelTick) {
        this.labelTick = Math.floor(this.t * 2);
        for (const id of Object.keys(BUILDINGS)) this.drawLabel(this.labels[id], id);
      }
      const cx = this.pan.x;
      this.camera.position.set(cx, 18, 20);
      this.camera.lookAt(cx, 0, 0.5);
      this.renderer.render(this.scene, this.camera);
    }
  }

  Town.TownView = TownView;
  GH.Town = Town;
})();

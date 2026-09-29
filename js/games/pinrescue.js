/*
 * PIN RESCUE – the classic "pull the pin" ad (Hero Wars / Evony style).
 * Tap pins to release gold, lava and water. Lava kills, water turns lava into stone.
 * Get the gold to the knight and defeat every orc.
 */
(function () {
  'use strict';
  const { sfx, vibrate, clamp } = GH;

  const W = 360, H = 640;
  const R = 5;            // particle radius
  const D = R * 2;        // particle diameter
  const G = 900;          // gravity px/s²
  const SUBSTEPS = 3;
  const MAX_V = 520;
  const CELL = 12;
  const COLS = Math.ceil(W / CELL) + 1, ROWS = Math.ceil(H / CELL) + 1;
  const ENT_W = 28, ENT_H = 40;

  // ------------------------------------------------------------ Levels
  // Rects are [x, y, w, h]. Pins: {x,y,w,h,dir} where dir is the pull direction
  // (the handle sits on that end). Hero/enemies: {x: centerX, y: feetY}.
  const FRAME = [[20, 70, 8, 540], [332, 70, 8, 540], [20, 602, 320, 8]];

  const LEVELS = [
    () => ({
      name: 'Pull the pin!',
      tip: 'Tap the pin to pull it out',
      walls: [...FRAME],
      pins: [{ x: 28, y: 258, w: 326, h: 8, dir: 'right' }],
      fills: [{ type: 'gold', x: 36, y: 176, w: 290, h: 78 }],
      hero: { x: 180, y: 602 },
      enemies: [],
      zone: [28, 268, 304, 334],
      solution: [0],
    }),
    () => ({
      name: 'Hot hot hot',
      tip: 'Lava is deadly. Choose wisely!',
      walls: [...FRAME, [176, 70, 8, 200]],
      pins: [
        { x: 6, y: 270, w: 170, h: 8, dir: 'left' },
        { x: 184, y: 270, w: 170, h: 8, dir: 'right' },
      ],
      fills: [
        { type: 'lava', x: 36, y: 180, w: 136, h: 84 },
        { type: 'gold', x: 192, y: 180, w: 136, h: 84 },
      ],
      hero: { x: 262, y: 602 },
      enemies: [],
      zone: [28, 280, 304, 322],
      solution: [1],
    }),
    () => ({
      name: 'Orc problem',
      tip: 'Defeat the orc before it reaches you',
      walls: [...FRAME, [176, 70, 8, 230]],
      pins: [
        { x: 6, y: 300, w: 170, h: 8, dir: 'left' },
        { x: 184, y: 300, w: 170, h: 8, dir: 'right' },
        { x: 176, y: 308, w: 8, h: 316, dir: 'down' },
      ],
      fills: [
        { type: 'lava', x: 36, y: 200, w: 136, h: 94 },
        { type: 'gold', x: 192, y: 200, w: 136, h: 94 },
      ],
      hero: { x: 262, y: 602 },
      enemies: [{ x: 92, y: 602 }],
      zone: [184, 308, 148, 294],
      solution: [0, 1],
    }),
    () => ({
      name: 'Cool it down',
      tip: 'Water + lava = stone',
      walls: [...FRAME, [176, 70, 8, 160]],
      pins: [
        { x: 6, y: 230, w: 170, h: 8, dir: 'left' },    // 0 water
        { x: 184, y: 230, w: 170, h: 8, dir: 'right' }, // 1 gold
        { x: 28, y: 420, w: 326, h: 8, dir: 'right' },  // 2 lava floor
      ],
      fills: [
        { type: 'water', x: 36, y: 130, w: 136, h: 96 },
        { type: 'gold', x: 192, y: 150, w: 136, h: 76 },
        { type: 'lava', x: 36, y: 364, w: 290, h: 52 },
      ],
      hero: { x: 180, y: 602 },
      enemies: [],
      zone: [28, 428, 304, 174],
      solution: [0, 2, 1],
    }),
    () => ({
      name: 'Trap door',
      tip: 'Not every pin is your friend',
      walls: [...FRAME, [252, 70, 8, 370]],
      pins: [
        { x: 6, y: 240, w: 246, h: 8, dir: 'left' },    // 0 lava floor
        { x: 6, y: 432, w: 246, h: 8, dir: 'left' },    // 1 orc floor (trap)
        { x: 260, y: 250, w: 94, h: 8, dir: 'right' },  // 2 gold
      ],
      fills: [
        { type: 'lava', x: 36, y: 166, w: 210, h: 70 },
        { type: 'gold', x: 266, y: 110, w: 62, h: 136 },
      ],
      hero: { x: 180, y: 602 },
      enemies: [{ x: 130, y: 432 }],
      zone: [28, 440, 304, 162],
      solution: [0, 2],
    }),
    () => ({
      name: 'Hard choices',
      tip: 'Think before you pull',
      walls: [...FRAME, [176, 440, 8, 162], [140, 70, 8, 172]],
      pins: [
        { x: 6, y: 432, w: 170, h: 8, dir: 'left' },    // 0 lava -> orc
        { x: 176, y: 250, w: 8, h: 190, dir: 'up' },    // 1 lava|gold divider (trap)
        { x: 184, y: 432, w: 170, h: 8, dir: 'right' }, // 2 gold -> hero
        { x: 6, y: 242, w: 134, h: 8, dir: 'left' },    // 3 water (trap)
      ],
      fills: [
        { type: 'water', x: 34, y: 150, w: 102, h: 88 },
        { type: 'lava', x: 34, y: 356, w: 138, h: 72 },
        { type: 'gold', x: 192, y: 344, w: 136, h: 84 },
      ],
      hero: { x: 262, y: 602 },
      enemies: [{ x: 96, y: 602 }],
      zone: [184, 440, 148, 162],
      solution: [0, 2],
    }),
  ];

  function mirror(L) {
    const mx = (r) => [W - r[0] - r[2], r[1], r[2], r[3]];
    const flip = { left: 'right', right: 'left', up: 'up', down: 'down' };
    return {
      ...L,
      walls: L.walls.map(mx),
      pins: L.pins.map((p) => ({ ...p, x: W - p.x - p.w, dir: flip[p.dir] })),
      fills: L.fills.map((f) => ({ ...f, x: W - f.x - f.w })),
      hero: { x: W - L.hero.x, y: L.hero.y },
      enemies: L.enemies.map((e) => ({ x: W - e.x, y: e.y })),
      zone: mx(L.zone),
    };
  }

  // ------------------------------------------------------------ Game
  class PinRescue {
    constructor({ stage, api, level }) {
      this.stage = stage;
      this.api = api;
      this.levelNum = level;
      this.grid = new Array(COLS * ROWS);
      this.hintPin = -1;
      this.initView();
      this.load();
      api.setHudButtons([
        { label: this.hintLabel(), cls: 'gold' + (GH.Save.data.items.hint ? '' : ' ad'), onClick: (el) => this.hint(el) },
        { label: '↻', cls: 'ghost', onClick: () => this.load() },
      ]);
    }

    get title() { return this.def.name; }

    load() {
      const idx = (this.levelNum - 1) % LEVELS.length;
      const loop = Math.floor((this.levelNum - 1) / LEVELS.length);
      let def = LEVELS[idx]();
      if (loop % 2 === 1) def = mirror(def);
      this.def = def;
      this.walls = def.walls.map(([x, y, w, h]) => ({ x, y, w, h }));
      this.pins = def.pins.map((p) => ({ ...p, removed: false, off: 0 }));
      this.parts = [];
      for (const f of def.fills) this.fill(f);
      this.hero = this.makeEnt(def.hero, 'hero');
      this.enemies = def.enemies.map((e) => this.makeEnt(e, 'enemy'));
      this.zone = { x: def.zone[0], y: def.zone[1], w: def.zone[2], h: def.zone[3] };
      this.goldTotal = this.parts.filter((p) => p.t === 'gold').length;
      this.goldNeed = Math.ceil(this.goldTotal * 0.5);
      this.collected = 0;
      this.flyers = [];
      this.fx = [];
      this.state = 'play';
      this.timer = 0;
      this.lastPull = 0;
      this.time = 0;
      this.hintPin = -1;
      this.pulled = [];
      this.api.setTitle && this.api.setTitle(this.def.name);
      if (this.scene) this.buildLevelView();
    }

    makeEnt(p, kind) {
      return { kind, x: p.x - ENT_W / 2, y: p.y - ENT_H, w: ENT_W, h: ENT_H, vx: 0, vy: 0, alive: true, face: 1, deadT: 0, attackT: 0 };
    }

    fill({ type, x, y, w, h }) {
      const sp = D + 0.6;
      for (let yy = y + R; yy <= y + h - R; yy += sp) {
        for (let xx = x + R; xx <= x + w - R; xx += sp) {
          this.parts.push({ x: xx + (Math.random() - 0.5) * 0.6, y: yy, vx: 0, vy: 0, t: type, hot: 0, z: (Math.random() - 0.5) * 1.8 }); // z is visual depth only
        }
      }
    }

    // ------------------------------------------------ input
    onDown(p) {
      if (this.state !== 'play') return;
      let best = -1, bestD = 1e9;
      this.pins.forEach((pin, i) => {
        if (pin.removed) return;
        const pad = 14;
        const hx = this.handlePos(pin);
        const inRect = p.x > pin.x - pad && p.x < pin.x + pin.w + pad && p.y > pin.y - pad && p.y < pin.y + pin.h + pad;
        const dh = Math.hypot(p.x - hx.x, p.y - hx.y);
        if (inRect || dh < 26) {
          const cx = clamp(p.x, pin.x, pin.x + pin.w), cy = clamp(p.y, pin.y, pin.y + pin.h);
          const d = Math.min(Math.hypot(p.x - cx, p.y - cy), dh);
          if (d < bestD) { bestD = d; best = i; }
        }
      });
      if (best >= 0) this.pull(best);
    }

    pull(i) {
      const pin = this.pins[i];
      if (!pin || pin.removed) return;
      pin.removed = true;
      this.pulled.push(i);
      this.lastPull = this.time;
      if (this.hintPin === i) this.hintPin = -1;
      sfx('pin');
      vibrate(15);
    }

    hintLabel() { const n = GH.Save.data.items.hint || 0; return n ? `💡 Hint ×${n}` : '💡 Hint'; }

    async hint(el) {
      if (this.state !== 'play') return;
      const next = this.def.solution.find((i) => !this.pins[i].removed);
      if (next === undefined) return;
      // A wrong pin already pulled? Hints can't save you – suggest a restart.
      const wrong = this.pulled.some((i) => !this.def.solution.includes(i));
      if (wrong) { GH.UI.toast('Restart the level first ↻'); return; }
      // Hint cards from chests are spent first; otherwise a rewarded ad pays for it.
      if (GH.Save.useItem('hint')) {
        this.hintPin = next;
      } else {
        this.paused = true;
        const ok = await Monetization.showRewarded('pin_hint');
        this.paused = false;
        if (ok) { this.hintPin = next; Monetization.resetInterstitialCounter(); }
      }
      if (el) { el.innerHTML = this.hintLabel(); el.classList.toggle('ad', !GH.Save.data.items.hint); }
    }

    handlePos(pin) {
      const o = pin.off;
      switch (pin.dir) {
        case 'left': return { x: pin.x - o, y: pin.y + pin.h / 2 };
        case 'right': return { x: pin.x + pin.w + o, y: pin.y + pin.h / 2 };
        case 'up': return { x: pin.x + pin.w / 2, y: pin.y - o };
        default: return { x: pin.x + pin.w / 2, y: pin.y + pin.h + o };
      }
    }

    // ------------------------------------------------ simulation
    solids() {
      const s = this.walls.slice();
      for (const p of this.pins) if (!p.removed) s.push(p);
      return s;
    }

    update(dt) {
      this.time += dt;
      for (const pin of this.pins) if (pin.removed && pin.off < 500) pin.off += dt * 900;

      const solids = this.solids();
      const h = dt / SUBSTEPS;
      for (let s = 0; s < SUBSTEPS; s++) this.step(h, solids);

      // collected gold flying to hero
      for (const f of this.flyers) f.t += dt * 2.5;
      this.flyers = this.flyers.filter((f) => f.t < 1);
      for (const f of this.fx) f.t += dt;
      this.fx = this.fx.filter((f) => f.t < f.life);

      this.checkRules(dt);
    }

    step(h, solids) {
      const parts = this.parts;
      // integrate
      for (const p of parts) {
        p.vy += G * h;
        p.vx *= 0.998;
        p.px = p.x; p.py = p.y;
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > MAX_V) { p.vx *= MAX_V / sp; p.vy *= MAX_V / sp; }
        p.x += p.vx * h;
        p.y += p.vy * h;
        if (p.hot > 0) p.hot -= h;
      }

      // particle-particle via spatial hash
      const grid = this.grid;
      grid.fill(undefined);
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const cx = clamp((p.x / CELL) | 0, 0, COLS - 1), cy = clamp((p.y / CELL) | 0, 0, ROWS - 1);
        const k = cy * COLS + cx;
        (grid[k] || (grid[k] = [])).push(i);
      }
      for (let cy = 0; cy < ROWS; cy++) {
        for (let cx = 0; cx < COLS; cx++) {
          const cell = grid[cy * COLS + cx];
          if (!cell) continue;
          for (let a = 0; a < cell.length; a++) {
            const pa = parts[cell[a]];
            for (let b = a + 1; b < cell.length; b++) this.pair(pa, parts[cell[b]]);
            // forward neighbours
            this.cellPairs(pa, cx + 1, cy);
            this.cellPairs(pa, cx - 1, cy + 1);
            this.cellPairs(pa, cx, cy + 1);
            this.cellPairs(pa, cx + 1, cy + 1);
          }
        }
      }

      // entities
      const ents = [this.hero, ...this.enemies];
      for (const e of ents) this.stepEnt(e, h, solids);

      // particles vs solids / entities
      for (const p of parts) {
        for (const s of solids) this.circleRect(p, s);
        for (const e of ents) {
          if (!e.alive) continue;
          if (this.circleRect(p, e, true)) {
            if (p.t === 'lava') this.kill(e);
          }
        }
        if (p.x < R) { p.x = R; p.vx = Math.abs(p.vx) * 0.2; }
        if (p.x > W - R) { p.x = W - R; p.vx = -Math.abs(p.vx) * 0.2; }
      }

      // gold collection in hero zone
      if (this.hero.alive) {
        const z = this.zone;
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          if (p.t === 'gold' && p.x > z.x && p.x < z.x + z.w && p.y > z.y && p.y < z.y + z.h) {
            parts.splice(i, 1);
            this.collected++;
            this.flyers.push({ x: p.x, y: p.y, t: 0 });
            if (this.collected % 4 === 0) sfx('coin');
          }
        }
      }
      // cull fallen
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].y > H + 20) parts.splice(i, 1);
    }

    cellPairs(pa, cx, cy) {
      if (cx < 0 || cx >= COLS || cy >= ROWS) return;
      const cell = this.grid[cy * COLS + cx];
      if (!cell) return;
      for (let j = 0; j < cell.length; j++) this.pair(pa, this.parts[cell[j]]);
    }

    pair(a, b) {
      let dx = b.x - a.x, dy = b.y - a.y;
      let d2 = dx * dx + dy * dy;
      if (d2 >= D * D) return;
      if (d2 < 1e-6) { dx = Math.random() - 0.5; dy = -0.5; d2 = dx * dx + dy * dy; }
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      const ov = (D - d) * 0.5;
      a.x -= nx * ov; a.y -= ny * ov;
      b.x += nx * ov; b.y += ny * ov;
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn < 0) {
        const j = vn * 0.5;
        a.vx += nx * j; a.vy += ny * j;
        b.vx -= nx * j; b.vy -= ny * j;
      }
      if (a.t !== b.t) this.react(a, b) || this.react(b, a);
    }

    react(a, b) {
      // lava + water -> stone (both). Freshly made "hot" stone keeps converting lava, so a
      // splash of water solidifies the whole connected lava pool – just like in the ads.
      if (a.t === 'lava' && (b.t === 'water' || (b.t === 'stone' && b.hot > 0))) {
        const fromWater = b.t === 'water';
        a.t = 'stone'; a.hot = 0.12;
        if (fromWater) { b.t = 'stone'; b.hot = 0.12; }
        if (Math.random() < 0.08) this.fx.push({ kind: 'steam', x: a.x, y: a.y, t: 0, life: 0.8 });
        return true;
      }
      return false;
    }

    circleRect(p, s, soft) {
      const cx = clamp(p.x, s.x, s.x + s.w), cy = clamp(p.y, s.y, s.y + s.h);
      let dx = p.x - cx, dy = p.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= R * R) return false;
      let nx, ny, push;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        nx = dx / d; ny = dy / d; push = R - d;
      } else {
        // Centre ended up inside a (thin) solid: push back out the side it came from,
        // otherwise pressure from the pile above can squeeze particles through pins.
        const l = p.x - s.x, r = s.x + s.w - p.x, t = p.y - s.y, b = s.y + s.h - p.y;
        let m = Math.min(l, r, t, b);
        if (p.py !== undefined) {
          if (p.py < s.y) m = t; else if (p.py > s.y + s.h) m = b;
          else if (p.px < s.x) m = l; else if (p.px > s.x + s.w) m = r;
        }
        if (m === t) { nx = 0; ny = -1; push = t + R; }
        else if (m === b) { nx = 0; ny = 1; push = b + R; }
        else if (m === l) { nx = -1; ny = 0; push = l + R; }
        else { nx = 1; ny = 0; push = r + R; }
      }
      p.x += nx * push; p.y += ny * push;
      const vn = p.vx * nx + p.vy * ny;
      if (vn < 0) {
        p.vx -= nx * vn * 1.05; p.vy -= ny * vn * 1.05;
        p.vx *= soft ? 0.9 : 0.995;
      }
      return true;
    }

    stepEnt(e, h, solids) {
      if (!e.alive) { e.deadT += h; return; }
      if (e.attackT > 0) e.attackT -= h;
      // enemy AI: walk toward hero when on the same floor
      e.vx = 0;
      if (e.kind === 'enemy' && this.hero.alive && e.onGround &&
          Math.abs((e.y + e.h) - (this.hero.y + this.hero.h)) < 12) {
        e.vx = Math.sign(this.hero.x - e.x) * 60;
        e.face = Math.sign(e.vx) || e.face;
      }
      // horizontal
      if (e.vx) {
        const ox = e.x;
        e.x += e.vx * h;
        for (const s of solids) if (overlap(e, s)) { e.x = ox; break; }
      }
      // vertical
      e.vy = Math.min(e.vy + G * h, MAX_V);
      const oy = e.y;
      e.y += e.vy * h;
      e.onGround = false;
      for (const s of solids) {
        if (!overlap(e, s)) continue;
        if (oy + e.h <= s.y + 1) { e.y = s.y - e.h; e.vy = 0; e.onGround = true; }
        else if (oy >= s.y + s.h - 1) { e.y = s.y + s.h; e.vy = 0; }
      }
      // orc reaches knight
      if (e.kind === 'enemy' && this.hero.alive && overlap(e, this.hero)) {
        e.attackT = 0.3;
        this.kill(this.hero);
      }
    }

    kill(e) {
      if (!e.alive) return;
      e.alive = false;
      e.deadT = 0;
      this.fx.push({ kind: 'poof', x: e.x + e.w / 2, y: e.y + e.h / 2, t: 0, life: 0.6 });
      if (e.kind === 'enemy') { sfx('hit'); vibrate(20); }
      else { sfx('bad'); vibrate([40, 40, 40]); }
    }

    checkRules(dt) {
      if (this.state === 'done') return;
      if (this.state !== 'play') {
        // a pending win can still turn into a loss (e.g. lava arriving right after the gold)
        if (this.state === 'pendingWin' && !this.hero.alive) this.pend('pendingLose', this.heroDeathReason(), 1.1);
        this.timer -= dt;
        if (this.timer <= 0) this.resolve();
        return;
      }
      const enemiesAlive = this.enemies.some((e) => e.alive);
      const lavaLeft = this.parts.some((p) => p.t === 'lava');
      const goldLeft = this.parts.filter((p) => p.t === 'gold').length;

      if (!this.hero.alive) this.pend('pendingLose', this.heroDeathReason(), 1.1);
      else if (!enemiesAlive && this.collected >= this.goldNeed) this.pend('pendingWin', '', 1.2);
      else if (enemiesAlive && !lavaLeft) this.pend('pendingLose', 'Nothing left to defeat the orc!', 1.5);
      else if (goldLeft + this.collected < this.goldNeed) this.pend('pendingLose', 'Not enough gold left', 1.5);
      else if (this.pins.every((p) => p.removed) && this.time - this.lastPull > 5) this.pend('pendingLose', 'Stuck! Try another order.', 0);
    }

    heroDeathReason() {
      return this.enemies.some((e) => e.attackT > 0) ? 'The orc got you!' : 'Burned by lava!';
    }

    pend(state, reason, delay) {
      this.state = state;
      this.reason = reason;
      this.timer = delay;
    }

    resolve() {
      const win = this.state === 'pendingWin';
      this.state = 'done';
      if (win) {
        const bonus = Math.round((this.collected / Math.max(1, this.goldTotal)) * 20);
        this.api.win({ coins: 30 + this.levelNum * 4 + bonus, text: `💰 ${this.collected} gold collected` });
      } else {
        this.api.lose({ reason: this.reason, canRevive: false });
      }
    }

    // ------------------------------------------------ 3D view
    // The puzzle is simulated in 360x640 "level pixels" (y down). The 3D world uses
    // 1 unit = 20 px with y up and the puzzle on the z = 0 plane.
    initView() {
      const T = THREE, K = (this.K = GH.K3);
      this.ly = K.layer(`
        <div class="pr-hud"><span class="pr-gold">💰 0/0</span><span class="pr-orcs"></span></div>
        <div class="pr-tip"></div>`);
      const el = this.ly.el;
      this.ui = { gold: el.querySelector('.pr-gold'), orcs: el.querySelector('.pr-orcs'), tip: el.querySelector('.pr-tip') };
      this.renderer = K.renderer(el);
      const scene = (this.scene = new T.Scene());
      scene.background = new T.Color('#1e1614');
      this.camera = new T.PerspectiveCamera(50, 1, 1, 200);
      this.camera.position.set(3, 17, 38);
      this.camera.lookAt(0, 15.2, 0);
      scene.add(new T.HemisphereLight('#fff4e0', '#3a2c2a', 1.4));
      const sun = new T.DirectionalLight('#ffffff', 2.2);
      sun.position.set(-8, 30, 22);
      sun.target.position.set(0, 14, 0);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 20, bottom: -20, near: 1, far: 80 });
      scene.add(sun, sun.target);
      this.heroLight = new T.PointLight('#ffcf6a', 8, 12);
      scene.add(this.heroLight);

      // dungeon back wall with brick texture
      const bt = K.canvasTex(256, 256);
      const c = bt.ctx;
      c.fillStyle = '#3b2d29'; c.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 32) for (let x = (y / 32) % 2 ? -32 : 0; x < 256; x += 64) {
        c.fillStyle = `hsl(12, 16%, ${17 + ((x * 7 + y * 3) % 7)}%)`;
        c.fillRect(x + 2, y + 2, 60, 28);
      }
      bt.tex.wrapS = bt.tex.wrapT = T.RepeatWrapping;
      bt.tex.repeat.set(4, 6);
      const back = new T.Mesh(new T.PlaneGeometry(40, 50), new T.MeshLambertMaterial({ map: bt.tex }));
      back.position.set(0, 14, -1.4);
      back.receiveShadow = true;
      scene.add(back);

      // materials
      this.mats = {
        wall: K.std('#8a7462', { roughness: 0.9 }),
        wallTop: K.std('#a58b75', { roughness: 0.9 }),
        pin: K.std('#e8bf4a', { metalness: 0.75, roughness: 0.28 }),
        pinHint: K.std('#5dff8f', { emissive: '#1f9d4a', emissiveIntensity: 0.9, metalness: 0.3 }),
        gold: K.std('#ffc83a', { metalness: 0.8, roughness: 0.25, emissive: '#6b4a00', emissiveIntensity: 0.35 }),
        lava: K.std('#ff5a1f', { emissive: '#ff3a00', emissiveIntensity: 1.2, roughness: 0.6 }),
        water: K.std('#39a8ff', { transparent: true, opacity: 0.82, roughness: 0.1 }),
        stone: K.std('#80808c', { roughness: 0.95 }),
        hot: K.std('#c9a08a', { emissive: '#7a2a00', emissiveIntensity: 0.6 }),
      };
      const sph = new T.SphereGeometry(0.31, 10, 8);
      this.partMesh = {};
      for (const t of ['gold', 'lava', 'water', 'stone', 'hot']) {
        const m = new T.InstancedMesh(sph, this.mats[t], 700);
        m.castShadow = t !== 'water';
        m.count = 0;
        scene.add(m);
        this.partMesh[t] = m;
      }
      this.coinPool = [];
      for (let i = 0; i < 40; i++) {
        const m = K.mesh(new T.CylinderGeometry(0.25, 0.25, 0.08, 12), this.mats.gold);
        m.rotation.x = Math.PI / 2; m.visible = false;
        scene.add(m); this.coinPool.push(m);
      }
      this.ringPool = [];
      for (let i = 0; i < 4; i++) {
        const m = new T.Mesh(new T.TorusGeometry(1, 0.12, 8, 24), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true }));
        m.visible = false; scene.add(m); this.ringPool.push(m);
      }
      this.dummy = new T.Object3D();

      this.onResize = () => K.fit(this.renderer, this.camera, el, 10, 38, 44, 80);
      window.addEventListener('resize', this.onResize);
      this.onResize();

      const ray = new T.Raycaster(), plane = new T.Plane(new T.Vector3(0, 0, 1), 0), hit = new T.Vector3();
      this.onPtr = (e) => {
        if (this.paused || GH.UI.modalCount || e.target.closest('button')) return;
        e.preventDefault();
        const r = el.getBoundingClientRect();
        ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
        if (ray.ray.intersectPlane(plane, hit)) this.onDown({ x: hit.x * 20 + 180, y: 640 - hit.y * 20 });
      };
      el.addEventListener('pointerdown', this.onPtr);
    }

    /** Rebuild the static parts of the scene for the current level. */
    buildLevelView() {
      const T = THREE, K = this.K;
      if (this.levelGroup) this.scene.remove(this.levelGroup);
      const g = (this.levelGroup = new T.Group());
      for (const w of this.walls) {
        const m = K.box(w.w / 20, w.h / 20, 2.6, this.mats.wall, (w.x + w.w / 2 - 180) / 20, (640 - w.y - w.h / 2) / 20, 0);
        m.receiveShadow = true;
        g.add(m);
      }
      this.pinMeshes = this.pins.map((pin) => {
        const grp = new T.Group();
        const horiz = pin.dir === 'left' || pin.dir === 'right';
        const len = (horiz ? pin.w : pin.h) / 20;
        const rod = K.mesh(new T.CylinderGeometry(0.22, 0.22, len, 12), this.mats.pin);
        if (horiz) rod.rotation.z = Math.PI / 2;
        const ring = K.mesh(new T.TorusGeometry(0.5, 0.14, 8, 20), this.mats.pin);
        const off = len / 2 + 0.5;
        const dirv = { left: [-1, 0], right: [1, 0], up: [0, 1], down: [0, -1] }[pin.dir];
        ring.position.set(dirv[0] * off, dirv[1] * off, 0);
        grp.add(rod, ring);
        grp.userData = { rod, ring, base: [(pin.x + pin.w / 2 - 180) / 20, (640 - pin.y - pin.h / 2) / 20], dirv };
        g.add(grp);
        return grp;
      });
      this.heroMesh = this.makeKnight();
      this.enemyMeshes = this.enemies.map(() => this.makeOrc());
      g.add(this.heroMesh, ...this.enemyMeshes);
      this.scene.add(g);
      const z = this.zone;
      this.heroLight.position.set((z.x + z.w / 2 - 180) / 20, (640 - z.y - z.h / 2) / 20, 3);
    }

    makeKnight() {
      const K = this.K, g = K.person('#2f6fe0', null);
      g.add(K.mesh(K.geo.sphere, K.std('#c9ced8', { metalness: 0.7, roughness: 0.3 }), 0, 1.42, 0, 0.62, 0.5, 0.62));
      g.add(K.box(0.08, 0.3, 0.08, K.lam('#ff4d5e'), 0, 1.75, 0));
      g.add(K.box(0.1, 0.9, 0.05, K.std('#e8eef8', { metalness: 0.8, roughness: 0.2 }), 0.45, 0.9, 0.15));
      g.add(K.box(0.3, 0.08, 0.08, K.lam('#8a6414'), 0.45, 0.5, 0.15));
      g.scale.setScalar(1.3);
      return g;
    }

    makeOrc() {
      const K = this.K, g = K.person('#4c8a2e', null, '#6fb544');
      g.add(K.mesh(new THREE.ConeGeometry(0.08, 0.3, 6), K.lam('#ffffff'), -0.18, 1.62, 0.05), K.mesh(new THREE.ConeGeometry(0.08, 0.3, 6), K.lam('#ffffff'), 0.18, 1.62, 0.05));
      g.add(K.box(0.1, 0.07, 0.03, K.basic('#ff2a2a'), -0.1, 1.38, 0.26), K.box(0.1, 0.07, 0.03, K.basic('#ff2a2a'), 0.1, 1.38, 0.26));
      const club = K.box(0.16, 0.9, 0.16, K.lam('#7a4a22'), 0.45, 0.95, 0.1);
      club.rotation.z = -0.4;
      g.add(club);
      g.userData.club = club;
      g.scale.setScalar(1.45);
      return g;
    }

    placeEnt(mesh, e, isOrc) {
      const x = (e.x + e.w / 2 - 180) / 20, y = (640 - e.y - e.h) / 20;
      mesh.position.set(x, y, 0.2);
      const walking = isOrc && e.vx && e.alive;
      this.K.animLegs(mesh, this.time * 16, walking);
      if (isOrc) {
        mesh.rotation.y = walking ? e.face * 1.1 : 0;
        if (!e.alive) { const k = Math.max(0, 1 - e.deadT * 1.6); mesh.scale.setScalar(1.45 * k); mesh.visible = k > 0.02; }
        if (e.attackT > 0) mesh.userData.club.rotation.z = -0.4 - Math.sin(this.time * 30) * 0.8;
      } else if (!e.alive) {
        mesh.rotation.z = Math.min(1.5, e.deadT * 4);
      }
    }

    draw() {
      if (!this.scene) return;
      const d = this.dummy;
      // particles
      const n = { gold: 0, lava: 0, water: 0, stone: 0, hot: 0 };
      for (const p of this.parts) {
        const t = p.hot > 0 ? 'hot' : p.t;
        const m = this.partMesh[t];
        if (n[t] >= 700) continue;
        d.position.set((p.x - 180) / 20, (640 - p.y) / 20, p.z || 0);
        d.scale.setScalar(t === 'water' ? 1.1 : 1);
        d.updateMatrix();
        m.setMatrixAt(n[t]++, d.matrix);
      }
      for (const t in n) { this.partMesh[t].count = n[t]; this.partMesh[t].instanceMatrix.needsUpdate = true; }
      // lava glows
      this.mats.lava.emissiveIntensity = 1 + Math.sin(this.time * 4) * 0.2;

      // pins slide out along their direction
      this.pins.forEach((pin, i) => {
        const g = this.pinMeshes[i];
        const { base, dirv, rod, ring } = g.userData;
        g.position.set(base[0] + dirv[0] * pin.off / 20, base[1] + dirv[1] * pin.off / 20, 0);
        g.visible = pin.off < 450;
        const mat = i === this.hintPin ? this.mats.pinHint : this.mats.pin;
        rod.material = ring.material = mat;
      });
      if (this.hintPin >= 0) this.mats.pinHint.emissiveIntensity = 0.6 + Math.sin(this.time * 8) * 0.4;

      // characters
      this.placeEnt(this.heroMesh, this.hero, false);
      this.enemies.forEach((e, i) => this.placeEnt(this.enemyMeshes[i], e, true));

      // collected coins fly to the knight
      const hx = (this.hero.x + this.hero.w / 2 - 180) / 20, hy = (640 - this.hero.y) / 20 + 1;
      this.coinPool.forEach((m, i) => {
        const f = this.flyers[i];
        m.visible = !!f;
        if (!f) return;
        const sx = (f.x - 180) / 20, sy = (640 - f.y) / 20;
        m.position.set(sx + (hx - sx) * f.t, sy + (hy - sy) * f.t + Math.sin(f.t * Math.PI) * 2, 1);
        m.rotation.z = f.t * 12;
      });
      const rings = this.fx.filter((f) => f.kind === 'poof');
      this.ringPool.forEach((m, i) => {
        const f = rings[i];
        m.visible = !!f;
        if (!f) return;
        const k = f.t / f.life;
        m.position.set((f.x - 180) / 20, (640 - f.y) / 20, 0.5);
        m.scale.setScalar(0.5 + k * 2);
        m.material.opacity = 1 - k;
      });
      this.heroLight.intensity = this.collected ? 14 : 8;

      // HUD
      const gold = `💰 ${this.collected}/${this.goldNeed}`;
      if (gold !== this.uiGold) { this.uiGold = gold; this.ui.gold.textContent = gold; }
      const alive = this.enemies.filter((e) => e.alive).length;
      const orcs = this.enemies.length ? `👹 ${alive}` : '';
      if (orcs !== this.uiOrcs) { this.uiOrcs = orcs; this.ui.orcs.textContent = orcs; this.ui.orcs.classList.toggle('done', !alive); }
      const tip = this.levelNum <= LEVELS.length && this.pulled.length === 0 && this.time < 8 ? this.def.tip : '';
      if (tip !== this.uiTip) { this.uiTip = tip; this.ui.tip.textContent = tip; this.ui.tip.hidden = !tip; }

      this.renderer.render(this.scene, this.camera);
    }

    destroy() {
      window.removeEventListener('resize', this.onResize);
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.ly.destroy();
      this.scene = null;
    }
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  GH.Games.pin = {
    id: 'pin',
    name: 'Pin Rescue',
    tagline: 'Pull the pins. Save the knight.',
    icon: '📌',
    colors: ['#b8741a', '#ffcf40'],
    create: (opts) => new PinRescue(opts),
    levelCount: LEVELS.length,
  };
})();

/*
 * PIN RESCUE – the classic "pull the pin" ad (Hero Wars / Evony style).
 * Tap pins to release gold, lava and water. Lava kills, water turns lava into stone.
 * Get the gold to the knight and defeat every orc.
 */
(function () {
  'use strict';
  const { roundRect, outlinedText, sfx, vibrate, clamp } = GH;

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

  const COLORS = { gold: '#ffc83a', lava: '#ff5a1f', water: '#39a8ff', stone: '#80808c' };

  // ------------------------------------------------------------ Game
  class PinRescue {
    constructor({ stage, api, level }) {
      this.stage = stage;
      this.api = api;
      this.levelNum = level;
      this.grid = new Array(COLS * ROWS);
      this.hintPin = -1;
      this.load();
      api.setHudButtons([
        { label: '💡 Hint', cls: 'gold ad', onClick: () => this.hint() },
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
    }

    makeEnt(p, kind) {
      return { kind, x: p.x - ENT_W / 2, y: p.y - ENT_H, w: ENT_W, h: ENT_H, vx: 0, vy: 0, alive: true, face: 1, deadT: 0, attackT: 0 };
    }

    fill({ type, x, y, w, h }) {
      const sp = D + 0.6;
      for (let yy = y + R; yy <= y + h - R; yy += sp) {
        for (let xx = x + R; xx <= x + w - R; xx += sp) {
          this.parts.push({ x: xx + (Math.random() - 0.5) * 0.6, y: yy, vx: 0, vy: 0, t: type, hot: 0 });
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

    async hint() {
      if (this.state !== 'play') return;
      const next = this.def.solution.find((i) => !this.pins[i].removed);
      if (next === undefined) return;
      // A wrong pin already pulled? Hints can't save you – suggest a restart.
      const wrong = this.pulled.some((i) => !this.def.solution.includes(i));
      if (wrong) { GH.UI.toast('Restart the level first ↻'); return; }
      this.paused = true;
      const ok = await Monetization.showRewarded('pin_hint');
      this.paused = false;
      if (ok) { this.hintPin = next; Monetization.resetInterstitialCounter(); }
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

    // ------------------------------------------------ drawing
    draw(ctx) {
      // background
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#3a2c2a'); g.addColorStop(1, '#241a1a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      for (let y = 70; y < 610; y += 24) {
        for (let x = (y / 24) % 2 ? 0 : 20; x < W; x += 40) ctx.fillRect(x + 1, y + 1, 38, 22);
      }
      // hero room glow
      ctx.fillStyle = 'rgba(255,220,120,.05)';
      ctx.fillRect(this.zone.x, this.zone.y, this.zone.w, this.zone.h);

      // particles
      for (const p of this.parts) {
        ctx.fillStyle = p.hot > 0 ? '#c9a08a' : COLORS[p.t];
        ctx.beginPath(); ctx.arc(p.x, p.y, R + 1.2, 0, Math.PI * 2); ctx.fill();
      }
      // lava glow + gold shine
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.parts) {
        if (p.t === 'lava') { ctx.fillStyle = 'rgba(255,120,30,.18)'; ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(255,255,220,.8)';
      for (const p of this.parts) if (p.t === 'gold') ctx.fillRect(p.x - 2.5, p.y - 3, 2, 2);
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      for (const p of this.parts) if (p.t === 'water') ctx.fillRect(p.x - 2, p.y - 3, 2, 2);

      // walls
      for (const w of this.walls) {
        ctx.fillStyle = '#7a6656';
        ctx.fillRect(w.x, w.y, w.w, w.h);
        ctx.fillStyle = 'rgba(255,255,255,.12)';
        ctx.fillRect(w.x, w.y, w.w, 2);
        ctx.strokeStyle = '#3b2f28';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);
      }

      // entities
      this.drawKnight(ctx, this.hero);
      for (const e of this.enemies) this.drawOrc(ctx, e);

      // pins
      this.pins.forEach((pin, i) => this.drawPin(ctx, pin, i === this.hintPin));

      // fx
      for (const f of this.flyers) {
        const t = f.t, hx = this.hero.x + this.hero.w / 2, hy = this.hero.y + 8;
        const x = f.x + (hx - f.x) * t, y = f.y + (hy - f.y) * t - Math.sin(t * Math.PI) * 40;
        ctx.fillStyle = '#ffe070';
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      }
      for (const f of this.fx) {
        const k = f.t / f.life;
        if (f.kind === 'poof') {
          ctx.strokeStyle = `rgba(255,255,255,${1 - k})`;
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(f.x, f.y, 10 + k * 30, 0, Math.PI * 2); ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(230,230,240,${0.5 * (1 - k)})`;
          ctx.beginPath(); ctx.arc(f.x, f.y - k * 30, 6 + k * 8, 0, Math.PI * 2); ctx.fill();
        }
      }

      // top info
      outlinedText(ctx, `💰 ${this.collected}/${this.goldNeed}`, 70, 38, 18, '#ffd84a');
      const alive = this.enemies.filter((e) => e.alive).length;
      if (this.enemies.length) outlinedText(ctx, `👹 ${alive}`, 300, 38, 18, alive ? '#ff8080' : '#80ff9a');
      if (this.levelNum <= LEVELS.length && this.time < 6 && this.pulled.length === 0) {
        ctx.globalAlpha = Math.min(1, (6 - this.time));
        outlinedText(ctx, this.def.tip, W / 2, 38 + (this.enemies.length ? 0 : 0), 14, '#fff');
        ctx.globalAlpha = 1;
      }
    }

    drawPin(ctx, pin, hint) {
      let { x, y, w, h } = pin;
      const o = pin.off;
      if (pin.dir === 'left') x -= o; else if (pin.dir === 'right') x += o; else if (pin.dir === 'up') y -= o; else y += o;
      if (pin.removed && o > 400) return;
      const horiz = pin.dir === 'left' || pin.dir === 'right';
      const grad = horiz ? ctx.createLinearGradient(0, y, 0, y + h) : ctx.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, '#fff6c8'); grad.addColorStop(0.5, '#e0b64a'); grad.addColorStop(1, '#8a6414');
      ctx.fillStyle = grad;
      roundRect(ctx, x, y, w, h, 3);
      ctx.fill();
      ctx.strokeStyle = '#5a3f0a'; ctx.lineWidth = 1; ctx.stroke();
      // handle ring
      const hp = this.handlePos({ ...pin, off: o });
      let hx = hp.x, hy = hp.y;
      if (pin.dir === 'left') hx -= 8; else if (pin.dir === 'right') hx += 8; else if (pin.dir === 'up') hy -= 8; else hy += 8;
      ctx.lineWidth = 5; ctx.strokeStyle = '#8a6414';
      ctx.beginPath(); ctx.arc(hx, hy, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = '#ffd765';
      ctx.beginPath(); ctx.arc(hx, hy, 9, 0, Math.PI * 2); ctx.stroke();
      if (hint) {
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 8);
        ctx.strokeStyle = `rgba(80,255,140,${0.5 + pulse * 0.5})`;
        ctx.lineWidth = 4;
        roundRect(ctx, x - 5, y - 5, w + 10, h + 10, 6); ctx.stroke();
        outlinedText(ctx, '👆', hx, hy + 22 + pulse * 6, 22);
      }
    }

    drawKnight(ctx, e) {
      const cx = e.x + e.w / 2, by = e.y + e.h;
      ctx.save();
      if (!e.alive) { ctx.globalAlpha = Math.max(0.35, 1 - e.deadT); ctx.translate(cx, by); ctx.rotate(-Math.min(1.4, e.deadT * 4)); ctx.translate(-cx, -by); }
      // body
      ctx.fillStyle = '#2f6fe0'; roundRect(ctx, cx - 10, by - 24, 20, 20, 5); ctx.fill();
      ctx.fillStyle = '#1b3f8a'; ctx.fillRect(cx - 8, by - 6, 6, 6); ctx.fillRect(cx + 2, by - 6, 6, 6);
      // head + helmet
      ctx.fillStyle = '#ffd2a6'; ctx.beginPath(); ctx.arc(cx, by - 30, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c9ced8'; ctx.beginPath(); ctx.arc(cx, by - 32, 10, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#ff4d5e'; ctx.fillRect(cx - 1.5, by - 46, 3, 6);
      ctx.fillStyle = '#222'; ctx.fillRect(cx - 4, by - 30, 2, 3); ctx.fillRect(cx + 2, by - 30, 2, 3);
      // sword
      ctx.fillStyle = '#e8eef8'; ctx.fillRect(cx + 11, by - 32, 3, 18);
      ctx.fillStyle = '#8a6414'; ctx.fillRect(cx + 8, by - 16, 9, 3);
      ctx.restore();
      if (!e.alive) outlinedText(ctx, '✖', cx, by - 50, 16, '#ff4d5e');
      else if (this.collected > 0) outlinedText(ctx, '😄', cx, by - 54, 14);
    }

    drawOrc(ctx, e) {
      const cx = e.x + e.w / 2, by = e.y + e.h;
      ctx.save();
      if (!e.alive) {
        ctx.globalAlpha = Math.max(0, 1 - e.deadT * 1.5);
        if (ctx.globalAlpha <= 0) { ctx.restore(); return; }
        ctx.filter = 'grayscale(1)';
      }
      const bob = e.vx ? Math.sin(this.time * 18) * 2 : 0;
      ctx.fillStyle = '#4c8a2e'; roundRect(ctx, cx - 12, by - 26 + bob, 24, 22, 6); ctx.fill();
      ctx.fillStyle = '#5a3a1a'; ctx.fillRect(cx - 12, by - 12 + bob, 24, 5);
      ctx.fillStyle = '#6fb544'; ctx.beginPath(); ctx.arc(cx, by - 32 + bob, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx - 9, by - 42 + bob); ctx.lineTo(cx - 6, by - 50 + bob); ctx.lineTo(cx - 3, by - 42 + bob); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx + 9, by - 42 + bob); ctx.lineTo(cx + 6, by - 50 + bob); ctx.lineTo(cx + 3, by - 42 + bob); ctx.fill();
      ctx.fillStyle = '#ff2a2a'; ctx.fillRect(cx - 6, by - 35 + bob, 4, 3); ctx.fillRect(cx + 2, by - 35 + bob, 4, 3);
      ctx.fillStyle = '#fff'; ctx.fillRect(cx - 5, by - 27 + bob, 2, 3); ctx.fillRect(cx + 3, by - 27 + bob, 2, 3);
      // club
      const sx = cx + (e.face > 0 ? 12 : -16);
      ctx.fillStyle = '#7a4a22'; ctx.fillRect(sx, by - 36 + bob, 5, 22);
      ctx.restore();
    }

    destroy() {}
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

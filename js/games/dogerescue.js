/*
 * DOGE RESCUE – the "draw to save the doge" ad.
 * Draw ONE line with limited ink. When you lift your finger the line becomes a real
 * physics object (it falls, tips and wedges), the hive wakes up and the bees swarm the
 * dog. Keep every bee off the dog for 10 seconds. Less ink = more stars.
 * Physics: Planck.js (Box2D). World units are metres, 30 px per metre, y up.
 */
(function () {
  'use strict';
  const { Save, UI, sfx, vibrate, clamp } = GH;

  const S = 30;                 // px per metre
  const W = 360 / S, H = 640 / S;
  const DOG_R = 0.85, BEE_R = 0.17, LINE_HALF = 0.12;
  const SURVIVE = 10;
  const WAYPOINTS = [[-4, 3], [4, 3], [0, 5], [-4, -3], [4, -3], [-6, 6], [6, 6], [-3, 0], [3, 0], [-6, -1], [6, -1]];
  const toW = (p) => ({ x: p.x / S, y: (640 - p.y) / S });
  const toPx = (x, y) => [x * S, 640 - y * S];

  // Terrain polygons are outlines (any shape). Hives: {x, y}. Solutions are reference strokes
  // (metres) that the test-suite simulates, so every level is known to be beatable.
  const LEVELS = [
    {
      name: 'Open field',
      tip: 'Draw a line to block the bees!',
      terrain: [[[0, 0], [12, 0], [12, 6], [0, 6]]],
      dog: { x: 6, y: 6.86 },
      hives: [{ x: 2.2, y: 17.5 }],
      bees: 9, ink: 10,
      solution: null, // generated: dome around the dog (see domeAround)
    },
    {
      name: 'Plug the hole',
      tip: 'Plug the hole – lean the line inward!',
      terrain: [
        [[0, 21.4], [6.2, 21.4], [6.2, 14.6], [4.6, 14.6], [2.6, 12.4], [0, 12.4]],
        [[0, 0], [6.2, 0], [6.2, 7.6], [4.6, 7.6], [2.6, 9.8], [0, 9.8]],
      ],
      dog: { x: 1.2, y: 10.66 },
      hives: [{ x: 10.4, y: 17.5 }],
      bees: 8, ink: 9,
      solution: [[2.55, 9.95], [2.4, 10.6], [2.35, 11.2], [2.45, 11.9], [2.75, 12.5]],
    },
    {
      name: 'On the pillar',
      tip: 'Cover the dog and the pillar top',
      terrain: [[[0, 0], [12, 0], [12, 3], [7, 3], [7, 9], [5, 9], [5, 3], [0, 3]]],
      dog: { x: 6, y: 9.86 },
      hives: [{ x: 10.5, y: 18 }],
      bees: 10, ink: 11,
      solution: [[4.75, 7.6], [4.7, 9.6], [4.85, 10.6], [5.4, 11.25], [6.0, 11.4], [6.6, 11.25], [7.15, 10.6], [7.3, 9.6], [7.25, 7.6]],
    },
    {
      name: 'Two hives',
      tip: 'Bees from both sides!',
      terrain: [[[0, 0], [12, 0], [12, 5], [0, 5]]],
      dog: { x: 6, y: 5.86 },
      hives: [{ x: 1.6, y: 17 }, { x: 10.4, y: 17 }],
      bees: 12, ink: 10,
      solution: null,
    },
    {
      name: 'The ledge',
      tip: 'They come from below',
      terrain: [
        [[9, 0], [12, 0], [12, 21.4], [9, 21.4]],
        [[5.4, 8], [9.05, 8], [9.05, 9], [5.4, 9]],
        [[0, 0], [9.05, 0], [9.05, 1.2], [0, 1.2]],
      ],
      dog: { x: 7.4, y: 9.86 },
      hives: [{ x: 2.2, y: 3.4 }],
      bees: 10, ink: 9,
      solution: [[5.55, 9.05], [5.6, 10.0], [5.95, 10.8], [6.6, 11.3], [7.4, 11.5], [8.2, 11.3], [8.9, 10.9]],
    },
  ];

  /** Default reference stroke: a dome resting on the ground either side of the dog. */
  function domeAround(dog, groundY) {
    const r = DOG_R + 1.15, pts = [];
    for (let a = 0; a <= 180; a += 15) {
      const t = (a * Math.PI) / 180;
      pts.push([dog.x + Math.cos(t) * r, groundY + 0.05 + Math.sin(t) * (r + 0.35)]);
    }
    return pts;
  }

  function mirrorLevel(L) {
    const mx = (p) => [W - p[0], p[1]];
    return {
      ...L,
      terrain: L.terrain.map((poly) => poly.map(mx).reverse()),
      dog: { x: W - L.dog.x, y: L.dog.y },
      hives: L.hives.map((h) => ({ x: W - h.x, y: h.y })),
      solution: L.solution && L.solution.map(mx),
    };
  }

  function levelDef(n) {
    const idx = (n - 1) % LEVELS.length, loop = Math.floor((n - 1) / LEVELS.length);
    let L = { ...LEVELS[idx] };
    if (!L.solution) L.solution = domeAround(L.dog, L.dog.y - DOG_R - 0.01);
    if (loop % 2 === 1) L = mirrorLevel(L);
    L.bees = Math.min(26, L.bees + loop * 4); // later loops: more bees
    return L;
  }

  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }

  class DogeRescue {
    constructor({ stage, api, level }) {
      this.stage = stage;
      this.api = api;
      this.levelNum = level;
      this.load();
      api.setHudButtons([
        { label: this.hintLabel(), cls: 'gold' + (Save.data.items.hint ? '' : ' ad'), onClick: (el) => this.hint(el) },
        { label: '↻', cls: 'ghost', onClick: () => this.load() },
      ]);
    }

    get title() { return this.def.name; }

    load() {
      const pl = window.planck;
      this.def = levelDef(this.levelNum);
      const world = (this.world = new pl.World({ gravity: { x: 0, y: -10 } }));
      const ground = world.createBody();
      for (const poly of this.def.terrain) ground.createFixture(new pl.Chain(poly.map(([x, y]) => ({ x, y })), true), { friction: 0.8, userData: 'ground' });
      this.dog = world.createBody({ type: 'dynamic', position: { x: this.def.dog.x, y: this.def.dog.y } });
      this.dog.createFixture(new pl.Circle(DOG_R), { density: 2, friction: 0.6, restitution: 0.05, userData: 'dog' });
      this.bees = [];
      this.line = null;
      this.stroke = [];
      this.inkLeft = this.def.ink;
      this.state = 'draw';
      this.timer = SURVIVE;
      this.spawned = 0;
      this.spawnT = 0;
      this.stung = false;
      this.acc = 0;
      this.time = 0;
      this.showHint = false;
      world.on('begin-contact', (c) => {
        const a = c.getFixtureA().getUserData(), b = c.getFixtureB().getUserData();
        if ((a === 'dog' && b === 'bee') || (a === 'bee' && b === 'dog')) this.stung = true;
      });
      this.api.setTitle && this.api.setTitle(this.def.name);
    }

    // ---------------------------------------------------------------- drawing input
    validPoint(p, last) {
      if (p.x < 0.1 || p.x > W - 0.1 || p.y < 0.1 || p.y > H - 0.1) return false;
      for (const poly of this.def.terrain) if (pointInPoly(p.x, p.y, poly)) return false;
      const d = this.dog.getPosition();
      if (Math.hypot(p.x - d.x, p.y - d.y) < DOG_R + 0.25) return false;
      if (last && segDist(d.x, d.y, last.x, last.y, p.x, p.y) < DOG_R + 0.2) return false;
      return true;
    }

    onDown(px) {
      if (this.state !== 'draw') return;
      const p = toW(px);
      this.drawing = true;
      if (this.validPoint(p)) this.stroke.push(p);
    }

    onMove(px) {
      if (!this.drawing || this.state !== 'draw' || this.inkLeft <= 0) return;
      const p = toW(px);
      const last = this.stroke[this.stroke.length - 1];
      if (!last) { if (this.validPoint(p)) this.stroke.push(p); return; }
      const d = Math.hypot(p.x - last.x, p.y - last.y);
      if (d < 0.22 || !this.validPoint(p, last)) return;
      const use = Math.min(d, this.inkLeft);
      const q = { x: last.x + ((p.x - last.x) * use) / d, y: last.y + ((p.y - last.y) * use) / d };
      this.stroke.push(q);
      this.inkLeft -= use;
      if (Math.random() < 0.3) sfx('tap');
    }

    onUp() {
      if (!this.drawing || this.state !== 'draw') return;
      this.drawing = false;
      if (this.stroke.length < 2 || this.def.ink - this.inkLeft < 0.4) { this.stroke = []; this.inkLeft = this.def.ink; return; }
      this.makeLineBody(this.stroke);
      this.state = 'play';
      sfx('pop');
    }

    makeLineBody(pts) {
      const pl = window.planck;
      const o = pts[0];
      const body = this.world.createBody({ type: 'dynamic', position: { x: o.x, y: o.y }, angularDamping: 4 });
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const mx = (a.x + b.x) / 2 - o.x, my = (a.y + b.y) / 2 - o.y, len = Math.hypot(b.x - a.x, b.y - a.y);
        body.createFixture(new pl.Box(len / 2 + 0.04, LINE_HALF, { x: mx, y: my }, Math.atan2(b.y - a.y, b.x - a.x)), { density: 1.5, friction: 1.2, userData: 'line' });
        body.createFixture(new pl.Circle({ x: b.x - o.x, y: b.y - o.y }, LINE_HALF), { density: 1.5, friction: 1.2, userData: 'line' });
      }
      body.createFixture(new pl.Circle({ x: 0, y: 0 }, LINE_HALF), { density: 1.5, friction: 1.2, userData: 'line' });
      this.line = body;
      this.linePts = pts.map((p) => ({ x: p.x - o.x, y: p.y - o.y }));
    }

    /** Test/hint helper: draw a stroke given in metres, exactly as a finger would. */
    drawStroke(pts) {
      const px = pts.map(([x, y]) => ({ x: x * S, y: 640 - y * S }));
      this.onDown(px[0]);
      for (let i = 1; i < px.length; i++) {
        // feed intermediate points so long segments are not skipped
        const a = px[i - 1], b = px[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
        for (let k = 1; k <= n; k++) this.onMove({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
      }
      this.onUp();
    }

    hintLabel() { const n = Save.data.items.hint || 0; return n ? `💡 Hint ×${n}` : '💡 Hint'; }
    async hint(el) {
      if (this.state !== 'draw') { UI.toast('Restart ↻ to see the hint'); return; }
      if (!Save.useItem('hint')) {
        this.paused = true;
        const ok = await Monetization.showRewarded('doge_hint');
        this.paused = false;
        if (!ok) return;
        Monetization.resetInterstitialCounter();
      }
      this.showHint = true;
      if (el) { el.innerHTML = this.hintLabel(); el.classList.toggle('ad', !Save.data.items.hint); }
    }

    // ---------------------------------------------------------------- simulation
    update(dt) {
      this.time += dt;
      if (this.state !== 'play') return;
      this.acc += dt;
      while (this.acc >= 1 / 60) { this.acc -= 1 / 60; this.step(1 / 60); }
    }

    step(h) {
      const pl = window.planck;
      // hive releases its bees over the first ~1.5s
      this.spawnT -= h;
      if (this.spawned < this.def.bees && this.spawnT <= 0) {
        this.spawnT = 0.12;
        const hive = this.def.hives[this.spawned % this.def.hives.length];
        const b = this.world.createBody({ type: 'dynamic', position: { x: hive.x + (Math.random() - 0.5) * 0.6, y: hive.y - 0.6 }, gravityScale: 0, fixedRotation: true, linearDamping: 0.5 });
        b.createFixture(new pl.Circle(BEE_R), { density: 0.4, friction: 0.1, restitution: 0.3, userData: 'bee' });
        b.wig = Math.random() * 6.28;
        b.think = 0;
        this.bees.push(b);
        this.spawned++;
        if (this.spawned === 1) sfx('bad');
      }
      // bees steer for the dog with a little wobble; collisions do the rest
      const d = this.dog.getPosition();
      for (const b of this.bees) {
        const p = b.getPosition(), v = b.getLinearVelocity();
        b.wig += h * 7;
        b.think -= h;
        if (b.think <= 0) { b.think = 0.3; b.goal = this.route(p, d); }
        const goal = b.goal || d;
        if (b.goal && Math.hypot(goal.x - p.x, goal.y - p.y) < 0.8) b.goal = null;
        let dx = goal.x - p.x, dy = goal.y - p.y;
        const dist = Math.hypot(dx, dy) || 1;
        dx /= dist; dy /= dist;
        const sp = 5.5, wob = 0.6;
        const tx = dx * sp - dy * Math.sin(b.wig) * sp * wob, ty = dy * sp + dx * Math.sin(b.wig) * sp * wob;
        b.setLinearVelocity({ x: v.x + (tx - v.x) * 0.08, y: v.y + (ty - v.y) * 0.08 });
      }
      this.world.step(h, 8, 3);
      this.timer -= h;
      if (this.stung) return this.finish(false, 'The dog got stung! 🐝');
      if (d.y < -3 || d.x < -3 || d.x > W + 3) return this.finish(false, 'The dog fell out of the world!');
      if (this.timer <= 0) this.finish(true);
    }

    /** True when the straight path a→b is clear of terrain (drawn lines don't count: bees push on those). */
    clear(a, b) {
      if (Math.hypot(b.x - a.x, b.y - a.y) < 0.05) return true;
      let hit = false;
      this.world.rayCast(a, b, (fx) => { if (fx.getUserData() === 'ground') { hit = true; return 0; } return -1; });
      return !hit;
    }

    /** Bees fly straight at the dog; if rock is in the way they pick a detour point around it. */
    route(p, d) {
      if (this.clear(p, d)) return null;
      let best = null, bestLen = Infinity;
      for (const [ox, oy] of WAYPOINTS) {
        const w = { x: clamp(d.x + ox, 0.4, W - 0.4), y: clamp(d.y + oy, 0.4, H - 0.4) };
        if (this.def.terrain.some((poly) => pointInPoly(w.x, w.y, poly))) continue;
        if (!this.clear(p, w) || !this.clear(w, d)) continue;
        const len = Math.hypot(w.x - p.x, w.y - p.y) + Math.hypot(d.x - w.x, d.y - w.y);
        if (len < bestLen) { bestLen = len; best = w; }
      }
      return best;
    }

    finish(win, reason) {
      if (this.state !== 'play') return;
      this.state = 'done';
      this.won = win;
      if (win) {
        const used = (this.def.ink - this.inkLeft) / this.def.ink;
        const stars = used <= 0.45 ? 3 : used <= 0.75 ? 2 : 1;
        sfx('win');
        setTimeout(() => this.api.win({ coins: 30 + this.levelNum * 5 + stars * 10, text: `${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}  🐶 Doge is safe! Ink used ${Math.round(used * 100)}%` }), 600);
      } else {
        vibrate([60, 40, 60]);
        setTimeout(() => this.api.lose({ reason, canRevive: false }), 900);
      }
    }

    // ---------------------------------------------------------------- rendering
    draw(ctx) {
      // sky
      ctx.fillStyle = '#9fc8e6';
      ctx.fillRect(0, 0, 360, 640);
      // terrain: brown fill, black outline, grass on upward-facing edges
      for (const poly of this.def.terrain) {
        ctx.beginPath();
        poly.forEach(([x, y], i) => { const [px, py] = toPx(x, y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
        ctx.closePath();
        ctx.fillStyle = '#8a5d3b'; ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = '#1b1b1b'; ctx.lineJoin = 'round'; ctx.stroke();
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = '#6aa84f'; ctx.lineWidth = 12;
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i], b = poly[(i + 1) % poly.length];
          if (!this.edgeFacesUp(poly, a, b)) continue;
          const [x1, y1] = toPx(a[0], a[1]), [x2, y2] = toPx(b[0], b[1]);
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        }
        ctx.restore();
        ctx.lineWidth = 4; ctx.strokeStyle = '#1b1b1b'; ctx.stroke();
      }
      for (const h of this.def.hives) this.drawHive(ctx, h);
      // hint ghost
      if (this.showHint && this.state === 'draw') {
        ctx.setLineDash([10, 10]); ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(53, 208, 127, .85)'; ctx.lineCap = 'round';
        ctx.beginPath();
        this.def.solution.forEach(([x, y], i) => { const [px, py] = toPx(x, y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
        ctx.stroke(); ctx.setLineDash([]);
      }
      // the drawn line (live stroke, then the physics body)
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const pts = this.line ? this.linePts.map((p) => { const w = this.line.getWorldPoint(p); return [w.x, w.y]; }) : this.stroke.map((p) => [p.x, p.y]);
      if (pts.length > 1) {
        ctx.beginPath();
        pts.forEach(([x, y], i) => { const [px, py] = toPx(x, y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
        ctx.lineWidth = LINE_HALF * 2 * S + 2; ctx.strokeStyle = '#1b1b1b'; ctx.stroke();
      }
      this.drawDog(ctx);
      for (const b of this.bees) this.drawBee(ctx, b);

      // HUD: ink bar + countdown
      const ink = this.inkLeft / this.def.ink;
      ctx.fillStyle = 'rgba(20,26,46,.65)'; GH.roundRect(ctx, 14, 12, 150, 22, 11); ctx.fill();
      ctx.fillStyle = ink > 0.25 ? '#1b1b1b' : '#ff4d5e'; GH.roundRect(ctx, 18, 16, Math.max(6, 142 * ink), 14, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('✏️ ink', 170, 23);
      if (this.state === 'draw') {
        GH.outlinedText(ctx, this.levelNum <= LEVELS.length ? this.def.tip : 'Draw one line to protect the doge', 180, 64, 17, '#fff', '#1b1b1b');
      } else if (this.state === 'play' || (this.state === 'done' && this.won)) {
        const t = Math.max(0, Math.ceil(this.timer));
        const pulse = 1 + (this.timer % 1) * 0.15;
        GH.outlinedText(ctx, String(t), 180, 90, 64 * pulse, '#ff3b3b', '#fff');
      }
    }

    edgeFacesUp(poly, a, b) {
      // the edge gets grass when the point just above its middle is outside the polygon and the edge is not too steep
      const ex = b[0] - a[0], ey = b[1] - a[1];
      if (Math.abs(ey) > Math.abs(ex) * 1.2) return false;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      return !pointInPoly(mx, my + 0.15, poly);
    }

    drawHive(ctx, h) {
      const [x, y] = toPx(h.x, h.y);
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = '#5a3d25'; ctx.fillRect(-3, -48, 6, 16);
      const rows = [[-26, 26], [-12, 34], [2, 38], [16, 34], [28, 24]];
      for (const [ry, rw] of rows) {
        ctx.beginPath(); ctx.ellipse(0, ry, rw, 10, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#f2c14e'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#a8761c'; ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(-4, 6, 10, 12, 0, 0, Math.PI * 2); ctx.fillStyle = '#4a2c14'; ctx.fill();
      ctx.restore();
    }

    drawDog(ctx) {
      const p = this.dog.getPosition(), a = this.dog.getAngle();
      const [x, y] = toPx(p.x, p.y), r = DOG_R * S;
      ctx.save(); ctx.translate(x, y); ctx.rotate(-a);
      // ears
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(s * r * 0.85, -r * 0.35); ctx.lineTo(s * r * 0.75, -r * 1.12); ctx.lineTo(s * r * 0.25, -r * 0.85); ctx.closePath();
        ctx.fillStyle = '#f2b33d'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#1b1b1b'; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * r * 0.7, -r * 0.5); ctx.lineTo(s * r * 0.66, -r * 0.92); ctx.lineTo(s * r * 0.4, -r * 0.78); ctx.closePath(); ctx.fillStyle = '#f7d27a'; ctx.fill();
      }
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
      g.addColorStop(0, '#ffe08a'); g.addColorStop(1, this.stung ? '#e8a23a' : '#f2b33d');
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#1b1b1b'; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, r * 0.35, r * 0.6, r * 0.42, 0, 0, Math.PI * 2); ctx.fillStyle = '#fff3d6'; ctx.fill();
      ctx.fillStyle = 'rgba(255, 110, 110, .55)';
      ctx.beginPath(); ctx.ellipse(-r * 0.55, r * 0.15, r * 0.17, r * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(r * 0.55, r * 0.15, r * 0.17, r * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#1b1b1b';
      if (this.stung) {
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * r * 0.4 - 5, -r * 0.2 - 5); ctx.lineTo(s * r * 0.4 + 5, -r * 0.2 + 5); ctx.moveTo(s * r * 0.4 + 5, -r * 0.2 - 5); ctx.lineTo(s * r * 0.4 - 5, -r * 0.2 + 5); ctx.stroke(); }
      } else {
        // the classic side-eye
        const look = this.state === 'play' ? 3 : 1.5;
        for (const s of [-1, 1]) {
          ctx.beginPath(); ctx.ellipse(s * r * 0.38, -r * 0.18, r * 0.2, r * 0.13, 0, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.arc(s * r * 0.38 + look, -r * 0.18, r * 0.08, 0, Math.PI * 2); ctx.fillStyle = '#3a2410'; ctx.fill();
        }
      }
      ctx.beginPath(); ctx.ellipse(0, r * 0.18, r * 0.1, r * 0.07, 0, 0, Math.PI * 2); ctx.fillStyle = '#3a2410'; ctx.fill();
      ctx.beginPath();
      if (this.stung) ctx.arc(0, r * 0.55, r * 0.18, Math.PI * 1.1, Math.PI * 1.9);
      else { ctx.moveTo(-r * 0.25, r * 0.38); ctx.quadraticCurveTo(-r * 0.12, r * 0.52, 0, r * 0.38); ctx.quadraticCurveTo(r * 0.12, r * 0.52, r * 0.25, r * 0.38); }
      ctx.stroke();
      ctx.restore();
    }

    drawBee(ctx, b) {
      const p = b.getPosition(), v = b.getLinearVelocity();
      const [x, y] = toPx(p.x, p.y);
      ctx.save(); ctx.translate(x, y); ctx.rotate(-Math.atan2(v.y, v.x));
      const flap = Math.sin(this.time * 60 + b.wig) * 3;
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.ellipse(-1, -6 - flap * 0.3, 4, 6 + flap * 0.3, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-1, -6 + flap * 0.3, 4, 5, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 0, 8, 5.5, 0, 0, Math.PI * 2); ctx.fillStyle = '#ffd23a'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#1b1b1b'; ctx.stroke();
      ctx.fillStyle = '#1b1b1b'; ctx.fillRect(-3, -5, 2.5, 10); ctx.fillRect(1.5, -5, 2.5, 10);
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-11, 0); ctx.stroke();
      ctx.restore();
    }

    destroy() { this.world = null; }
  }

  GH.Games.doge = {
    id: 'doge',
    name: 'Doge Rescue',
    tagline: 'Draw one line. Save the doge from the bees.',
    icon: '🐶',
    colors: ['#6aa84f', '#9fc8e6'],
    skippable: true,
    create: (opts) => new DogeRescue(opts),
  };
  GH.Games.doge.levelDef = levelDef; // exposed for tests
  GH.Games.doge.count = LEVELS.length;
})();

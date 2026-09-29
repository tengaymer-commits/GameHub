/*
 * GATE RUSH – the "math gates" army runner (Last War / Whiteout / Kingshot ads).
 * Drag to steer your squad through +/x gates, dodge saws, crush enemy squads
 * and take down the Ice Giant at the end.
 */
(function () {
  'use strict';
  const { rng, clamp, roundRect, outlinedText, sfx, vibrate, fmt } = GH;

  const W = 360, H = 640;
  const ROAD_L = 40, ROAD_R = 320, MID = (ROAD_L + ROAD_R) / 2;
  const PLAYER_Y = 500;
  const SPEED = 190;
  const ROW_GAP = 300;
  const MAX_DRAWN = 140;

  const applyOp = (n, g) => {
    switch (g.op) {
      case '+': return n + g.v;
      case '-': return Math.max(0, n - g.v);
      case 'x': return n * g.v;
      case '÷': return Math.ceil(n / g.v);
    }
    return n;
  };
  const isGood = (g) => g.op === '+' || g.op === 'x';
  const label = (g) => (g.op === 'x' ? '×' : g.op) + g.v;

  class GateRush {
    constructor({ stage, api, level, save }) {
      this.stage = stage;
      this.api = api;
      this.levelNum = level;
      this.startCount = 3 + (save.upgrades.gateStart || 0) * 2;
      this.revived = false;
      this.title = 'Gate Rush';
      this.generate();
      this.reset();
      api.setHudButtons([]);
    }

    generate() {
      const r = rng(this.levelNum * 7919 + 13);
      const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
      const L = this.levelNum;
      let E = this.startCount; // expected army size if the player plays well
      const rows = [];
      let d = 600;
      const n = Math.min(8 + L, 22);
      for (let i = 0; i < n; i++) {
        d += ROW_GAP;
        const roll = r();
        if (i < 2 || roll < 0.55) {
          // gate pair: one clearly better option + a decoy
          let good;
          if (E >= 6 && r() < 0.35) good = { op: 'x', v: r() < 0.8 ? 2 : 3 };
          else good = { op: '+', v: ri(4, 8 + L * 2) };
          let other;
          const k = r();
          if (k < 0.45) other = { op: '-', v: ri(3, Math.max(4, Math.floor(E * 0.5))) };
          else if (k < 0.65 && E > 6) other = { op: '÷', v: 2 };
          else if (good.op === 'x') other = { op: '+', v: ri(3, 12) };
          else other = { op: '+', v: Math.max(1, Math.floor(good.v * (0.3 + r() * 0.4))) };
          const leftGood = r() < 0.5;
          rows.push({ type: 'gate', d, left: leftGood ? good : other, right: leftGood ? other : good, done: false });
          E = Math.max(applyOp(E, good), applyOp(E, other));
        } else if (roll < 0.82) {
          const m = Math.max(3, Math.floor(E * (0.25 + r() * 0.3)));
          rows.push({ type: 'enemy', d, n: m, max: m, done: false });
          E -= m;
        } else {
          const left = r() < 0.5;
          rows.push({ type: 'saw', d, x0: left ? ROAD_L : MID - 20, x1: left ? MID + 20 : ROAD_R, done: false });
          E = Math.floor(E * 0.92);
        }
        E = Math.max(E, 3);
      }
      this.endD = d + ROW_GAP + 80;
      this.bossHp = Math.max(8, Math.floor(E * 0.7));
      this.rows = rows;
    }

    reset() {
      this.dist = 0;
      this.x = MID;
      this.n = this.startCount;
      this.shownN = this.n;
      this.state = 'ready';
      this.time = 0;
      this.fight = null;
      this.boss = { hp: this.bossHp, max: this.bossHp, hitT: 0 };
      this.floaters = [];
      this.pops = [];
      this.flakes = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: 1 + Math.random() * 2 }));
      this.trees = [];
      for (let y = -2000; y < this.endD + 800; y += 70) {
        this.trees.push({ d: y, x: 8 + Math.random() * 22, s: 0.8 + Math.random() * 0.4 });
        this.trees.push({ d: y + 35, x: W - 8 - Math.random() * 22, s: 0.8 + Math.random() * 0.4 });
      }
    }

    // ------------------------------------------------ input
    onDown(p) {
      this.dragX = p.x;
      if (this.state === 'ready') { this.state = 'run'; sfx('tap'); }
    }
    onMove(p) {
      if (this.dragX == null) return;
      this.x += (p.x - this.dragX) * 1.3;
      this.dragX = p.x;
    }
    onUp() { this.dragX = null; }

    get radius() { return 8 + 3.4 * Math.sqrt(Math.min(this.n, MAX_DRAWN)); }
    screenY(d) { return PLAYER_Y - (d - this.dist); }

    // ------------------------------------------------ update
    update(dt) {
      this.time += dt;
      const rad = this.radius;
      this.x = clamp(this.x, ROAD_L + Math.min(rad, 60), ROAD_R - Math.min(rad, 60));
      this.shownN += (this.n - this.shownN) * Math.min(1, dt * 12);

      for (const f of this.flakes) { f.y += f.s * 40 * dt; f.x += Math.sin(this.time + f.y * 0.02) * 0.3; if (f.y > H) { f.y = -5; f.x = Math.random() * W; } }
      for (const f of this.floaters) f.t += dt;
      this.floaters = this.floaters.filter((f) => f.t < 1);
      for (const p of this.pops) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 400 * dt; }
      this.pops = this.pops.filter((p) => p.t < 0.6);
      if (this.boss.hitT > 0) this.boss.hitT -= dt;

      if (this.state === 'run') {
        this.dist += SPEED * dt;
        for (const row of this.rows) {
          if (row.done) continue;
          if (row.type === 'gate' && this.dist >= row.d) this.passGate(row);
          else if (row.type === 'saw' && this.dist >= row.d) this.passSaw(row);
          else if (row.type === 'enemy' && this.dist >= row.d - rad - 22) { this.state = 'fight'; this.fight = { row, acc: 0 }; }
        }
        if (this.dist >= this.endD - rad - 70) { this.state = 'boss'; this.fight = { acc: 0 }; }
      } else if (this.state === 'fight' || this.state === 'boss') {
        this.fight.acc += dt;
        while (this.fight.acc > 0.035 && (this.state === 'fight' || this.state === 'boss')) {
          this.fight.acc -= 0.035;
          this.fightTick();
        }
      }
    }

    passGate(row) {
      row.done = true;
      const g = this.x < MID ? row.left : row.right;
      row.chosen = g;
      const before = this.n;
      this.n = applyOp(this.n, g);
      const diff = this.n - before;
      this.floaters.push({ text: (diff >= 0 ? '+' : '') + fmt(diff), good: diff >= 0, t: 0 });
      if (diff >= 0) { sfx('coin'); vibrate(10); } else { sfx('bad'); vibrate(30); this.burst(-diff, '#3a8dff'); }
      if (this.n <= 0) this.defeat('Your army was wiped out!');
    }

    passSaw(row) {
      row.done = true;
      const rad = this.radius;
      const ov = Math.max(0, Math.min(this.x + rad, row.x1) - Math.max(this.x - rad, row.x0));
      if (ov <= 0) return;
      const lost = Math.max(1, Math.ceil(this.n * (ov / (2 * rad)) * 0.6));
      this.n = Math.max(0, this.n - lost);
      this.floaters.push({ text: '-' + fmt(lost), good: false, t: 0 });
      this.burst(lost, '#3a8dff');
      sfx('bad'); vibrate(40);
      if (this.n <= 0) this.defeat('Sliced by the saws!');
    }

    fightTick() {
      if (this.state === 'fight') {
        const row = this.fight.row;
        const k = Math.max(1, Math.ceil(Math.min(this.n, row.n) * 0.05));
        const kk = Math.min(k, this.n, row.n);
        this.n -= kk; row.n -= kk;
        this.burst(Math.min(kk, 3), '#3a8dff'); this.burst(Math.min(kk, 3), '#ff4d5e', this.screenY(row.d));
        sfx('hit');
        if (row.n <= 0) { row.done = true; this.state = 'run'; sfx('pop'); }
        if (this.n <= 0) this.defeat('Overrun by the enemy squad!');
      } else {
        const k = Math.max(1, Math.ceil(Math.min(this.n, this.boss.hp) * 0.04));
        const kk = Math.min(k, this.n, this.boss.hp);
        this.n -= kk; this.boss.hp -= kk; this.boss.hitT = 0.08;
        this.burst(Math.min(kk, 3), '#3a8dff');
        sfx('hit');
        if (this.boss.hp <= 0) this.victory();
        else if (this.n <= 0) this.defeat('The Ice Giant was too strong!');
      }
    }

    burst(count, color, y = PLAYER_Y) {
      for (let i = 0; i < Math.min(count, 8); i++) {
        this.pops.push({ x: this.x + (Math.random() - 0.5) * this.radius * 2, y: y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 160, vy: -100 - Math.random() * 120, t: 0, c: color });
      }
    }

    defeat(reason) {
      if (this.state === 'done') return;
      this.deathState = this.state;
      this.state = 'done';
      this.api.lose({ reason, canRevive: !this.revived });
    }

    victory() {
      this.state = 'done';
      this.boss.hp = 0;
      const coins = 25 + this.levelNum * 5 + Math.floor(this.n / 2);
      this.api.win({ coins, text: `🪖 ${fmt(this.n)} soldiers survived` });
    }

    revive() {
      // Rewarded revive is deliberately generous: enough troops to win the current fight.
      this.revived = true;
      const ds = this.deathState;
      if (ds === 'fight' && this.fight.row.n > 0) { this.n = this.fight.row.n + 10; this.state = 'fight'; }
      else if (ds === 'boss') { this.n = Math.ceil(this.boss.hp * 1.1) + 5; this.state = 'boss'; }
      else { this.n = Math.max(15, Math.ceil(this.bossHp * 0.5)); this.state = 'run'; }
      this.floaters.push({ text: '+' + fmt(this.n), good: true, t: 0 });
      sfx('level');
    }

    // ------------------------------------------------ draw
    draw(ctx) {
      // snow field
      ctx.fillStyle = '#dfeaf5';
      ctx.fillRect(0, 0, W, H);
      // road
      ctx.fillStyle = '#56647a';
      ctx.fillRect(ROAD_L, 0, ROAD_R - ROAD_L, H);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ROAD_L - 4, 0, 4, H); ctx.fillRect(ROAD_R, 0, 4, H);
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      const off = this.dist % 60;
      for (let y = -60; y < H; y += 60) ctx.fillRect(MID - 2, y + off, 4, 30);

      // trees
      for (const t of this.trees) {
        const y = this.screenY(t.d);
        if (y < -40 || y > H + 40) continue;
        ctx.fillStyle = '#2f5d4a';
        ctx.beginPath(); ctx.moveTo(t.x, y - 22 * t.s); ctx.lineTo(t.x - 11 * t.s, y + 6); ctx.lineTo(t.x + 11 * t.s, y + 6); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(t.x, y - 22 * t.s); ctx.lineTo(t.x - 5 * t.s, y - 10 * t.s); ctx.lineTo(t.x + 5 * t.s, y - 10 * t.s); ctx.fill();
      }

      // finish line + boss
      const by = this.screenY(this.endD);
      if (by > -120 && by < H + 100) this.drawBoss(ctx, by);
      const fy = this.screenY(this.endD - 160);
      if (fy > -20 && fy < H) {
        for (let x = ROAD_L; x < ROAD_R; x += 14) {
          ctx.fillStyle = ((x - ROAD_L) / 14) % 2 ? '#111' : '#fff';
          ctx.fillRect(x, fy, 14, 7);
          ctx.fillStyle = ((x - ROAD_L) / 14) % 2 ? '#fff' : '#111';
          ctx.fillRect(x, fy + 7, 14, 7);
        }
      }

      // rows (far to near)
      for (let i = this.rows.length - 1; i >= 0; i--) {
        const row = this.rows[i];
        const y = this.screenY(row.d);
        if (y < -80 || y > H + 60) continue;
        if (row.type === 'gate') this.drawGates(ctx, row, y);
        else if (row.type === 'saw') this.drawSaw(ctx, row, y);
        else if (row.type === 'enemy' && row.n > 0) this.drawSquad(ctx, MID, y, row.n, '#e8424f', '#8e1f2a', 1);
      }

      // player army
      if (this.n > 0) this.drawSquad(ctx, this.x, PLAYER_Y, this.n, '#3a8dff', '#1c4fa0', -1);

      for (const p of this.pops) {
        ctx.globalAlpha = 1 - p.t / 0.6;
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // army count bubble
      if (this.n > 0) {
        const ly = PLAYER_Y - this.radius - 22;
        ctx.fillStyle = '#1c4fa0';
        roundRect(ctx, this.x - 26, ly - 13, 52, 26, 13); ctx.fill();
        outlinedText(ctx, fmt(Math.round(this.shownN)), this.x, ly + 1, 17);
      }
      for (const f of this.floaters) {
        ctx.globalAlpha = 1 - f.t;
        outlinedText(ctx, f.text, this.x, PLAYER_Y - this.radius - 50 - f.t * 40, 26, f.good ? '#5dff8f' : '#ff5a6a');
      }
      ctx.globalAlpha = 1;

      // snow
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      for (const f of this.flakes) { ctx.beginPath(); ctx.arc(f.x, f.y, f.s, 0, Math.PI * 2); ctx.fill(); }

      // progress bar
      const prog = clamp(this.dist / this.endD, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; roundRect(ctx, 60, 14, 240, 10, 5); ctx.fill();
      ctx.fillStyle = '#ffc93c'; roundRect(ctx, 60, 14, Math.max(10, 240 * prog), 10, 5); ctx.fill();
      outlinedText(ctx, '🏁', 312, 19, 14);

      if (this.state === 'ready') {
        ctx.fillStyle = 'rgba(10,14,26,.45)';
        ctx.fillRect(0, 0, W, H);
        outlinedText(ctx, 'Drag to steer', W / 2, 250, 30, '#fff');
        outlinedText(ctx, 'Pick the best gates!', W / 2, 290, 18, '#ffc93c');
        const hx = W / 2 + Math.sin(this.time * 3) * 60;
        outlinedText(ctx, '👆', hx, 380, 44);
      }
    }

    drawGates(ctx, row, y) {
      const halves = [[ROAD_L, MID, row.left], [MID, ROAD_R, row.right]];
      for (const [x0, x1, g] of halves) {
        const chosen = row.done && row.chosen === g;
        const good = isGood(g);
        ctx.globalAlpha = row.done && !chosen ? 0.35 : 0.85;
        const grad = ctx.createLinearGradient(0, y - 40, 0, y);
        grad.addColorStop(0, good ? 'rgba(58,141,255,.15)' : 'rgba(255,77,94,.15)');
        grad.addColorStop(1, good ? 'rgba(58,141,255,.75)' : 'rgba(255,77,94,.75)');
        ctx.fillStyle = grad;
        ctx.fillRect(x0 + 4, y - 44, x1 - x0 - 8, 44);
        ctx.fillStyle = good ? '#1c4fa0' : '#8e1f2a';
        ctx.fillRect(x0 + 2, y - 50, 6, 52); ctx.fillRect(x1 - 8, y - 50, 6, 52);
        ctx.globalAlpha = 1;
        outlinedText(ctx, label(g), (x0 + x1) / 2, y - 22, 26, '#fff');
      }
    }

    drawSaw(ctx, row, y) {
      ctx.fillStyle = '#39414f';
      ctx.fillRect(row.x0, y - 5, row.x1 - row.x0, 10);
      const n = Math.max(2, Math.round((row.x1 - row.x0) / 50));
      for (let i = 0; i < n; i++) {
        const cx = row.x0 + ((i + 0.5) * (row.x1 - row.x0)) / n;
        ctx.save();
        ctx.translate(cx, y);
        ctx.rotate(this.time * 10 + i);
        ctx.fillStyle = '#c9d0db';
        ctx.beginPath();
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const rr = k % 2 ? 12 : 18;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.fill();
        ctx.fillStyle = '#e8424f';
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }

    drawSquad(ctx, cx, cy, n, c1, c2, facing) {
      const count = Math.min(Math.ceil(n), MAX_DRAWN);
      const t = this.time;
      for (let i = count - 1; i >= 0; i--) {
        const a = i * 2.39996;
        const r = 3.4 * Math.sqrt(i) * 1.0;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.75 + Math.sin(t * 14 + i) * 1.2;
        ctx.fillStyle = c2;
        ctx.beginPath(); ctx.arc(x, y + 2, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c1;
        ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd7b0';
        ctx.beginPath(); ctx.arc(x, y - 4 * -facing * 0 - 3, 2.4, 0, Math.PI * 2); ctx.fill();
      }
      if (facing > 0) {
        ctx.fillStyle = '#8e1f2a';
        const ly = cy - 8 - 3.4 * Math.sqrt(count) * 0.75 - 16;
        roundRect(ctx, cx - 24, ly - 12, 48, 24, 12); ctx.fill();
        outlinedText(ctx, fmt(n), cx, ly + 1, 16);
      }
    }

    drawBoss(ctx, y) {
      const shake = this.boss.hitT > 0 ? (Math.random() - 0.5) * 6 : 0;
      const x = MID + shake;
      // ice castle backdrop
      ctx.fillStyle = '#a9c6e6';
      ctx.fillRect(ROAD_L, y - 110, ROAD_R - ROAD_L, 40);
      for (let i = ROAD_L; i < ROAD_R; i += 28) ctx.fillRect(i, y - 122, 16, 14);
      // giant
      ctx.fillStyle = '#7fb3e6';
      roundRect(ctx, x - 44, y - 90, 88, 80, 24); ctx.fill();
      ctx.fillStyle = '#b8dcff';
      ctx.beginPath(); ctx.arc(x, y - 100, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff2a4a';
      ctx.fillRect(x - 14, y - 106, 8, 6); ctx.fillRect(x + 6, y - 106, 8, 6);
      ctx.fillStyle = '#fff';
      for (let i = -12; i <= 8; i += 6) { ctx.beginPath(); ctx.moveTo(x + i, y - 88); ctx.lineTo(x + i + 3, y - 80); ctx.lineTo(x + i + 6, y - 88); ctx.fill(); }
      ctx.fillStyle = '#5c8fc4';
      roundRect(ctx, x - 64, y - 80, 20, 54, 10); ctx.fill();
      roundRect(ctx, x + 44, y - 80, 20, 54, 10); ctx.fill();
      // hp bar
      const w = 160;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; roundRect(ctx, MID - w / 2, y - 150, w, 16, 8); ctx.fill();
      ctx.fillStyle = '#ff4d5e'; roundRect(ctx, MID - w / 2, y - 150, Math.max(8, (w * this.boss.hp) / this.boss.max), 16, 8); ctx.fill();
      outlinedText(ctx, `❄️ ${fmt(this.boss.hp)}`, MID, y - 142, 13);
    }

    destroy() {}
  }

  GH.Games.gate = {
    id: 'gate',
    name: 'Gate Rush',
    tagline: 'Pick the right gates. Grow your army.',
    icon: '🪖',
    colors: ['#1c4fa0', '#3a8dff'],
    create: (opts) => new GateRush(opts),
  };
})();

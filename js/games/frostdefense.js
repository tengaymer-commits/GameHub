/*
 * FROST DEFENSE – the "hold the wall" horde ad (Whiteout Survival / Kingshot).
 * Drag to move your archer, arrows fire automatically. Level up, pick upgrades,
 * keep the frost beasts away from the furnace.
 */
(function () {
  'use strict';
  const { clamp, roundRect, outlinedText, sfx, vibrate, UI, fmt } = GH;

  const W = 360, H = 640;
  const WALL_Y = 520;
  const ARCHER_Y = 548;
  const WAVES = 5;

  const TYPES = {
    walker: { hp: 3, spd: 32, r: 12, atk: 3, xp: 1, body: '#8fb3cf', dark: '#5a7a96' },
    runner: { hp: 2, spd: 58, r: 10, atk: 2, xp: 1, body: '#b7a3e0', dark: '#7a64aa' },
    brute:  { hp: 12, spd: 20, r: 18, atk: 8, xp: 4, body: '#6f8fae', dark: '#44607c' },
    boss:   { hp: 140, spd: 13, r: 34, atk: 25, xp: 0, body: '#b8dcff', dark: '#5c8fc4' },
  };

  const UPGRADES = [
    { id: 'multi', icon: '🏹', name: 'Multishot', desc: '+1 arrow per volley', max: 6 },
    { id: 'rate', icon: '⚡', name: 'Rapid Fire', desc: '+25% fire rate', max: 8 },
    { id: 'dmg', icon: '🗡️', name: 'Sharp Tips', desc: '+1 arrow damage', max: 10 },
    { id: 'pierce', icon: '🎯', name: 'Piercing', desc: 'Arrows pierce +1 enemy', max: 4 },
    { id: 'ally', icon: '🧝', name: 'Recruit Archer', desc: 'An ally archer joins the wall', max: 2 },
    { id: 'nova', icon: '❄️', name: 'Frost Nova', desc: 'Freeze all enemies periodically', max: 3 },
    { id: 'repair', icon: '🧱', name: 'Repair Wall', desc: 'Restore 40% of the wall', max: 99 },
  ];

  class FrostDefense {
    constructor({ stage, api, level, save }) {
      this.stage = stage;
      this.api = api;
      this.levelNum = level;
      this.title = 'Frost Defense';
      this.hpMult = 1 + (level - 1) * 0.18;
      this.dmgMult = 1 + (save.upgrades.frostDmg || 0) * 0.2;
      this.baseWall = 100 + (save.upgrades.frostWall || 0) * 25;
      this.revived = false;
      this.reset();
      api.setHudButtons([]);
    }

    reset() {
      this.wall = { hp: this.baseWall, max: this.baseWall, hitT: 0 };
      this.archer = { x: W / 2, cd: 0 };
      this.targetX = W / 2;
      this.stats = { multi: 1, rate: 2.2, dmg: 1, pierce: 0, ally: 0, nova: 0 };
      this.picked = {};
      this.enemies = [];
      this.arrows = [];
      this.fx = [];
      this.allies = [];
      this.xp = 0;
      this.xpNeed = 4;
      this.lvl = 1;
      this.wave = 0;
      this.waveQueue = [];
      this.spawnT = 0;
      this.betweenT = 1.5;
      this.banner = { text: 'Wave 1', t: 0 };
      this.bossSpawned = false;
      this.novaT = 0;
      this.time = 0;
      this.state = 'play';
      this.flakes = Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: 0.8 + Math.random() * 2 }));
    }

    // ------------------------------------------------ waves
    buildWave(i) {
      const L = this.levelNum;
      const count = 6 + i * 4 + L;
      const q = [];
      for (let k = 0; k < count; k++) {
        const r = Math.random();
        let type = 'walker';
        if (i >= 1 && r < 0.25 + i * 0.04) type = 'runner';
        else if (i >= 2 && r > 0.9 - i * 0.02) type = 'brute';
        q.push(type);
      }
      if (i >= 3) q.push('brute', 'brute');
      return q;
    }

    spawn(type) {
      const t = TYPES[type];
      // level scaling ramps in over the waves so early waves stay beatable before upgrades
      const scale = 1 + (this.hpMult - 1) * (0.4 + 0.15 * this.wave);
      const hp = Math.ceil(t.hp * scale * (type === 'boss' ? 1 + (this.levelNum - 1) * 0.1 : 1));
      this.enemies.push({
        type, x: 30 + Math.random() * (W - 60), y: -t.r - 10,
        hp, max: hp, spd: t.spd * (0.9 + Math.random() * 0.2), r: t.r, atk: t.atk,
        frozen: 0, hitT: 0, wob: Math.random() * 6,
      });
    }

    // ------------------------------------------------ input
    onDown(p) { this.dragX = p.x; }
    onMove(p) {
      if (this.dragX == null) return;
      this.targetX += (p.x - this.dragX) * 1.2;
      this.targetX = clamp(this.targetX, 24, W - 24);
      this.dragX = p.x;
    }
    onUp() { this.dragX = null; }

    // ------------------------------------------------ update
    update(dt) {
      this.time += dt;
      for (const f of this.flakes) { f.y += f.s * 30 * dt; f.x += Math.sin(this.time + f.s * 3) * 0.4; if (f.y > H) { f.y = -4; f.x = Math.random() * W; } }
      for (const f of this.fx) f.t += dt;
      this.fx = this.fx.filter((f) => f.t < f.life);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 2) this.banner = null; }
      if (this.state !== 'play') return;

      this.archer.x += (this.targetX - this.archer.x) * Math.min(1, dt * 18);

      // waves: countdown -> spawn queue -> wait for the field to clear -> next countdown
      if (this.waveQueue.length) {
        this.spawnT -= dt;
        if (this.spawnT <= 0) {
          this.spawn(this.waveQueue.shift());
          this.spawnT = Math.max(0.45, 1.2 - this.wave * 0.1 - Math.min(this.levelNum, 12) * 0.025);
        }
      } else if (this.betweenT < 0 && this.enemies.length === 0 && !this.bossSpawned) {
        this.betweenT = 2.2;
        if (this.wave < WAVES) { this.banner = { text: `Wave ${this.wave + 1}`, t: 0 }; sfx('level'); }
      }
      if (this.betweenT >= 0) {
        this.betweenT -= dt;
        if (this.betweenT < 0) {
          if (this.wave < WAVES) {
            this.waveQueue = this.buildWave(this.wave);
            this.wave++;
          } else {
            this.bossSpawned = true;
            this.spawn('boss');
            this.banner = { text: '⚠️ ICE GIANT ⚠️', t: 0, boss: true };
            sfx('bad'); vibrate(80);
          }
        }
      }

      // firing
      this.archer.cd -= dt;
      if (this.archer.cd <= 0) {
        this.archer.cd = 1 / this.stats.rate;
        const n = this.stats.multi;
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.11;
          this.shoot(this.archer.x, ARCHER_Y - 16, a);
        }
      }
      for (const al of this.allies) {
        al.cd -= dt;
        if (al.cd <= 0) {
          const target = this.nearest(al.x, ARCHER_Y);
          if (target) {
            al.cd = 1.1 / (this.stats.rate / 2.2);
            this.shoot(al.x, ARCHER_Y - 16, Math.atan2(target.y - ARCHER_Y, target.x - al.x));
          }
        }
      }

      // frost nova
      if (this.stats.nova > 0) {
        this.novaT += dt;
        const every = 9 - this.stats.nova * 1.5;
        if (this.novaT >= every) {
          this.novaT = 0;
          this.fx.push({ kind: 'nova', x: W / 2, y: WALL_Y, t: 0, life: 0.7 });
          for (const e of this.enemies) { e.frozen = 1.6; this.damage(e, 2 * this.dmgMult); }
          sfx('pop');
        }
      }

      // arrows
      for (const a of this.arrows) {
        a.x += a.vx * dt; a.y += a.vy * dt;
        for (const e of this.enemies) {
          if (e.hp <= 0 || a.hit.has(e)) continue;
          const dx = e.x - a.x, dy = e.y - a.y;
          if (dx * dx + dy * dy < (e.r + 4) * (e.r + 4)) {
            a.hit.add(e);
            this.damage(e, a.dmg);
            if (a.pierce-- <= 0) { a.dead = true; break; }
          }
        }
        if (a.y < -20 || a.x < -20 || a.x > W + 20) a.dead = true;
      }
      this.arrows = this.arrows.filter((a) => !a.dead);

      // enemies
      this.wall.hitT = Math.max(0, this.wall.hitT - dt);
      for (const e of this.enemies) {
        if (e.hitT > 0) e.hitT -= dt;
        if (e.frozen > 0) { e.frozen -= dt; continue; }
        if (e.y < WALL_Y - e.r) {
          e.y += e.spd * dt;
          e.x += Math.sin(this.time * 2 + e.wob) * 8 * dt;
        } else {
          this.wall.hp -= e.atk * dt;
          this.wall.hitT = 0.1;
          if (Math.random() < dt * 2) { sfx('hit'); vibrate(8); }
        }
      }
      this.enemies = this.enemies.filter((e) => e.hp > 0);

      if (this.wall.hp <= 0) {
        this.wall.hp = 0;
        this.state = 'done';
        vibrate([60, 40, 60]);
        this.api.lose({ reason: 'The furnace froze over…', canRevive: !this.revived });
        return;
      }
      if (this.bossSpawned && this.enemies.length === 0 && this.waveQueue.length === 0) {
        this.state = 'done';
        const coins = 40 + this.levelNum * 8;
        this.api.win({ coins, text: `🧱 Wall ${Math.ceil((this.wall.hp / this.wall.max) * 100)}% intact` });
      }
    }

    shoot(x, y, ang) {
      const sp = 560;
      this.arrows.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, dmg: this.stats.dmg * this.dmgMult, pierce: this.stats.pierce, hit: new Set() });
    }

    nearest(x, y) {
      let best = null, bd = Infinity;
      for (const e of this.enemies) {
        if (e.y < 0) continue;
        const d = (e.x - x) ** 2 + (e.y - y) ** 2;
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    damage(e, d) {
      if (e.hp <= 0) return;
      e.hp -= d;
      e.hitT = 0.08;
      this.fx.push({ kind: 'num', x: e.x + (Math.random() - 0.5) * 10, y: e.y - e.r, text: fmt(Math.max(1, Math.round(d))), t: 0, life: 0.5 });
      if (e.hp <= 0) {
        sfx('pop');
        this.fx.push({ kind: 'shatter', x: e.x, y: e.y, r: e.r, t: 0, life: 0.5 });
        this.gainXp(TYPES[e.type].xp);
      }
    }

    gainXp(n) {
      this.xp += n;
      if (this.xp >= this.xpNeed && this.state === 'play') {
        this.xp -= this.xpNeed;
        this.xpNeed = Math.ceil(this.xpNeed * 1.4);
        this.lvl++;
        this.offerUpgrades();
      }
    }

    rollCards() {
      const pool = UPGRADES.filter((u) => (this.picked[u.id] || 0) < u.max && !(u.id === 'repair' && this.wall.hp > this.wall.max * 0.8));
      const out = [];
      while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      return out;
    }

    offerUpgrades(cards) {
      cards = cards || this.rollCards();
      if (!cards.length) return;
      this.paused = true;
      sfx('level');
      const body = '<div class="cards">' + cards.map((c, i) =>
        `<button class="choice" data-i="${i}"><span class="ico">${c.icon}</span><span><h4>${c.name}${this.picked[c.id] ? ` <small>Lv${this.picked[c.id] + 1}</small>` : ''}</h4><p>${c.desc}</p></span></button>`).join('') + '</div>';
      const m = UI.modal({
        title: 'Level up!',
        sub: `Hero level ${this.lvl} · choose an upgrade`,
        body,
        buttons: [{ label: '🎲 Reroll', cls: 'ghost ad', onClick: async () => {
          const ok = await Monetization.showRewarded('frost_reroll');
          if (ok) Monetization.resetInterstitialCounter();
          this.offerUpgrades(ok ? this.rollCards() : cards);
        } }],
      });
      m.el.querySelectorAll('.choice').forEach((btn) => btn.addEventListener('click', () => {
        sfx('tap');
        this.apply(cards[+btn.dataset.i].id);
        m.close();
        this.paused = false;
      }));
    }

    apply(id) {
      this.picked[id] = (this.picked[id] || 0) + 1;
      const s = this.stats;
      switch (id) {
        case 'multi': s.multi++; break;
        case 'rate': s.rate *= 1.25; break;
        case 'dmg': s.dmg++; break;
        case 'pierce': s.pierce++; break;
        case 'nova': s.nova++; break;
        case 'repair': this.wall.hp = Math.min(this.wall.max, this.wall.hp + this.wall.max * 0.4); break;
        case 'ally':
          s.ally++;
          this.allies.push({ x: s.ally === 1 ? 40 : W - 40, cd: 0.5 });
          break;
      }
    }

    revive() {
      this.revived = true;
      this.wall.hp = this.wall.max * 0.6;
      for (const e of this.enemies) if (e.y > WALL_Y - 160 && e.type !== 'boss') { e.hp = 0; this.fx.push({ kind: 'shatter', x: e.x, y: e.y, r: e.r, t: 0, life: 0.5 }); }
      this.enemies = this.enemies.filter((e) => e.hp > 0);
      for (const e of this.enemies) { e.frozen = 2; if (e.type === 'boss') e.y = Math.min(e.y, WALL_Y - 200); }
      this.fx.push({ kind: 'nova', x: W / 2, y: WALL_Y, t: 0, life: 0.7 });
      this.state = 'play';
      sfx('level');
    }

    // ------------------------------------------------ draw
    draw(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#b9cfe4'); g.addColorStop(0.75, '#e6eff8'); g.addColorStop(1, '#cfdceb');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // snow drifts
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse((i * 83 + 20) % W, 120 + i * 70, 50, 12, 0, 0, Math.PI * 2); ctx.fill(); }

      // enemies
      const sorted = this.enemies.slice().sort((a, b) => a.y - b.y);
      for (const e of sorted) this.drawEnemy(ctx, e);

      // arrows
      ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2;
      for (const a of this.arrows) {
        const l = 10 / 560;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x - a.vx * l * 1.4, a.y - a.vy * l * 1.4); ctx.stroke();
        ctx.fillStyle = '#e8eef8'; ctx.beginPath(); ctx.arc(a.x, a.y, 2, 0, Math.PI * 2); ctx.fill();
      }

      // wall
      const shake = this.wall.hitT > 0 ? (Math.random() - 0.5) * 2 : 0;
      ctx.fillStyle = '#6b4a2e';
      ctx.fillRect(0, WALL_Y + shake, W, 22);
      for (let x = 0; x < W; x += 18) {
        ctx.fillStyle = '#8a5f3a';
        ctx.beginPath(); ctx.moveTo(x, WALL_Y + shake); ctx.lineTo(x + 9, WALL_Y - 12 + shake); ctx.lineTo(x + 18, WALL_Y + shake); ctx.fill();
        ctx.fillStyle = '#5a3d25'; ctx.fillRect(x + 8, WALL_Y + shake, 2, 22);
      }
      ctx.fillStyle = '#fff'; ctx.fillRect(0, WALL_Y - 2 + shake, W, 3);

      // camp + furnace
      ctx.fillStyle = '#8a9bb0'; ctx.fillRect(0, WALL_Y + 22, W, H - WALL_Y - 22);
      const fl = 0.8 + Math.sin(this.time * 12) * 0.1 + Math.random() * 0.05;
      const heat = this.wall.hp / this.wall.max;
      const glow = ctx.createRadialGradient(W / 2, 600, 5, W / 2, 600, 110 * fl);
      glow.addColorStop(0, `rgba(255,170,60,${0.8 * heat + 0.1})`); glow.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, WALL_Y + 22, W, H);
      ctx.fillStyle = '#3d3d48'; roundRect(ctx, W / 2 - 26, 578, 52, 44, 8); ctx.fill();
      ctx.fillStyle = heat > 0.3 ? '#ffb03a' : '#7a9ec0';
      ctx.beginPath(); ctx.arc(W / 2, 600, 12 * fl, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2c2c34'; ctx.fillRect(W / 2 - 6, 556, 12, 24);

      // tents
      for (const tx of [60, 300]) {
        ctx.fillStyle = '#c96b3a'; ctx.beginPath(); ctx.moveTo(tx - 26, 620); ctx.lineTo(tx, 580); ctx.lineTo(tx + 26, 620); ctx.fill();
        ctx.fillStyle = '#6b2f14'; ctx.beginPath(); ctx.moveTo(tx - 6, 620); ctx.lineTo(tx, 604); ctx.lineTo(tx + 6, 620); ctx.fill();
      }

      // archers
      for (const al of this.allies) this.drawArcher(ctx, al.x, '#35a36b');
      this.drawArcher(ctx, this.archer.x, '#2f6fe0');

      // fx
      for (const f of this.fx) {
        const k = f.t / f.life;
        if (f.kind === 'num') { ctx.globalAlpha = 1 - k; outlinedText(ctx, f.text, f.x, f.y - k * 24, 12, '#fff'); }
        else if (f.kind === 'shatter') {
          ctx.globalAlpha = 1 - k; ctx.fillStyle = '#e8f4ff';
          for (let i = 0; i < 6; i++) { const a = i * 1.05; ctx.fillRect(f.x + Math.cos(a) * k * f.r * 2, f.y + Math.sin(a) * k * f.r * 2, 4, 4); }
        } else if (f.kind === 'nova') {
          ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#7fd4ff'; ctx.lineWidth = 8;
          ctx.beginPath(); ctx.arc(f.x, f.y, k * 520, Math.PI, 0); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // snow
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      for (const f of this.flakes) { ctx.beginPath(); ctx.arc(f.x, f.y, f.s, 0, Math.PI * 2); ctx.fill(); }

      // HUD: wall hp + xp + wave
      const hpw = 200;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; roundRect(ctx, 80, 10, hpw, 14, 7); ctx.fill();
      ctx.fillStyle = heat > 0.35 ? '#ff9f1c' : '#ff4d5e'; roundRect(ctx, 80, 10, Math.max(8, hpw * heat), 14, 7); ctx.fill();
      outlinedText(ctx, '🔥', 68, 17, 14);
      outlinedText(ctx, `${Math.ceil(this.wall.hp)}`, 80 + hpw / 2, 17, 11);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; roundRect(ctx, 80, 30, hpw, 8, 4); ctx.fill();
      ctx.fillStyle = '#5dd6ff'; roundRect(ctx, 80, 30, Math.max(6, (hpw * this.xp) / this.xpNeed), 8, 4); ctx.fill();
      outlinedText(ctx, `Lv${this.lvl}`, 300, 34, 12, '#5dd6ff');
      outlinedText(ctx, this.bossSpawned ? 'BOSS' : `Wave ${Math.max(1, this.wave)}/${WAVES}`, 318, 17, 12, '#fff');

      if (this.banner) {
        const a = this.banner.t < 0.3 ? this.banner.t / 0.3 : this.banner.t > 1.6 ? (2 - this.banner.t) / 0.4 : 1;
        ctx.globalAlpha = clamp(a, 0, 1);
        outlinedText(ctx, this.banner.text, W / 2, 260, this.banner.boss ? 32 : 40, this.banner.boss ? '#ff4d5e' : '#fff', 'rgba(20,40,80,.8)');
        if (this.wave <= 1 && !this.banner.boss && this.levelNum === 1) outlinedText(ctx, 'Drag to move your archer', W / 2, 305, 16, '#1c4fa0', '#fff');
        ctx.globalAlpha = 1;
      }
    }

    drawArcher(ctx, x, color) {
      const y = ARCHER_Y;
      ctx.fillStyle = color; roundRect(ctx, x - 9, y - 10, 18, 18, 5); ctx.fill();
      ctx.fillStyle = '#ffd2a6'; ctx.beginPath(); ctx.arc(x, y - 16, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a3a2a'; ctx.beginPath(); ctx.arc(x, y - 18, 7.5, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#e8e0d0'; ctx.fillRect(x - 10, y - 20, 20, 3);
      ctx.strokeStyle = '#6b3a1a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + 11, y - 8, 10, -Math.PI * 0.6, Math.PI * 0.1); ctx.stroke();
    }

    drawEnemy(ctx, e) {
      const t = TYPES[e.type];
      const bob = e.frozen > 0 ? 0 : Math.sin(this.time * 10 + e.wob) * 2;
      const x = e.x, y = e.y + bob, r = e.r;
      ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(x, e.y + r * 0.9, r, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = e.hitT > 0 ? '#fff' : e.frozen > 0 ? '#bfe9ff' : t.dark;
      ctx.beginPath(); ctx.arc(x, y + 2, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = e.hitT > 0 ? '#fff' : e.frozen > 0 ? '#dff5ff' : t.body;
      ctx.beginPath(); ctx.arc(x, y, r * 0.92, 0, Math.PI * 2); ctx.fill();
      // eyes + horns
      ctx.fillStyle = '#ff2a4a';
      ctx.fillRect(x - r * 0.45, y + r * 0.05, r * 0.28, r * 0.2); ctx.fillRect(x + r * 0.17, y + r * 0.05, r * 0.28, r * 0.2);
      ctx.fillStyle = '#eef6ff';
      ctx.beginPath(); ctx.moveTo(x - r * 0.7, y - r * 0.5); ctx.lineTo(x - r * 0.9, y - r * 1.2); ctx.lineTo(x - r * 0.3, y - r * 0.75); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + r * 0.7, y - r * 0.5); ctx.lineTo(x + r * 0.9, y - r * 1.2); ctx.lineTo(x + r * 0.3, y - r * 0.75); ctx.fill();
      if (e.hp < e.max || e.type === 'boss') {
        const w = r * 2;
        ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(x - w / 2, y - r - 10, w, 4);
        ctx.fillStyle = '#ff4d5e'; ctx.fillRect(x - w / 2, y - r - 10, (w * Math.max(0, e.hp)) / e.max, 4);
      }
    }

    destroy() {}
  }

  GH.Games.frost = {
    id: 'frost',
    name: 'Frost Defense',
    tagline: 'Hold the wall. Keep the furnace burning.',
    icon: '❄️',
    colors: ['#2a5c8a', '#7fd4ff'],
    create: (opts) => new FrostDefense(opts),
  };
})();

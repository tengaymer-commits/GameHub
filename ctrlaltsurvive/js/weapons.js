/* Ctrl+Alt+Survive — weapon behaviours.
 * Each entry: fire(R, w, s) called when the cooldown is ready, and/or tick(R, w, s, dt) every frame,
 * optional draw(R, w, s, ctx) for weapon-level visuals. s = computed weapon stats. */
(function (C) {
  'use strict';
  const TAU = Math.PI * 2;
  const WB = C.WB = {};
  const rnd = (a, b) => a + Math.random() * (b - a);
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

  function facing(R) { return Math.atan2(R.p.fy, R.p.fx); }
  function segDist2(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    let t = ((px - ax) * dx + (py - ay) * dy) / l2; t = Math.max(0, Math.min(1, t));
    return dist2(px, py, ax + dx * t, ay + dy * t);
  }

  /* ---------- Ping.exe / Ping of Death / DSL: expanding rings ---------- */
  function ring(R, w, s, opts) {
    for (let i = 0; i < s.amount; i++) {
      R.addProj({
        w, delay: i * 0.2, t: 0, T: 0.5, maxR: (opts.radius || 95) * s.area, dmg: s.dmg, kb: s.kb, arc: opts.arc || 0, dir: opts.arc ? facing(R) + (i % 2 ? Math.PI : 0) * (opts.flipEvery ? 1 : 0) : 0, col: opts.col,
        hitCd: Infinity, follow: true, rad: 0,
        upd(p, dt) { p.t += dt; const k = Math.min(1, p.t / p.T); p.rad = p.maxR * (1 - (1 - k) * (1 - k)); p.x = R.p.x; p.y = R.p.y; if (p.t >= p.T + 0.12) p.dead = true; },
        hit(p, e) {
          const d = Math.sqrt(dist2(p.x, p.y, e.x, e.y));
          if (Math.abs(d - p.rad) > e.r + 10) return false;
          if (p.arc) { let a = Math.atan2(e.y - p.y, e.x - p.x) - p.dir; a = Math.atan2(Math.sin(a), Math.cos(a)); if (Math.abs(a) > p.arc) return false; }
          return true;
        },
        draw(p, x) {
          const al = 1 - Math.min(1, p.t / (p.T + 0.12));
          x.globalAlpha = al; x.strokeStyle = p.col || '#2fb84f'; x.lineWidth = 4;
          x.beginPath();
          if (p.arc) x.arc(p.x, p.y, p.rad, p.dir - p.arc, p.dir + p.arc); else x.arc(p.x, p.y, p.rad, 0, TAU);
          x.stroke();
          x.lineWidth = 1.5; x.strokeStyle = '#fff'; x.stroke();
          x.globalAlpha = 1;
        }
      });
    }
    C.Audio.sfx('shoot');
  }
  WB.ping = { fire: (R, w, s) => ring(R, w, s, { radius: 95, col: '#2fb84f' }) };
  WB.pingdeath = { fire: (R, w, s) => ring(R, w, s, { radius: 120, col: '#e11d48' }) };
  WB.dialup = {
    fire(R, w, s) {
      for (let i = 0; i < s.amount; i++) {
        const base = facing(R) + (i % 2 ? Math.PI : 0);
        for (let j = 0; j < 3; j++) {
          R.addProj({
            w, delay: j * 0.08 + Math.floor(i / 2) * 0.25, t: 0, T: 0.42, maxR: 135 * s.area, dmg: s.dmg, kb: s.kb, arc: 0.55, dir: base, hitCd: Infinity, rad: 0, col: '#1a4fd1',
            upd(p, dt) { p.t += dt; p.rad = 14 + (p.maxR - 14) * Math.min(1, p.t / p.T); p.x = R.p.x; p.y = R.p.y; if (p.t >= p.T) p.dead = true; },
            hit(p, e) { const d = Math.sqrt(dist2(p.x, p.y, e.x, e.y)); if (d > p.rad + e.r || d < p.rad - 22 - e.r) return false; let a = Math.atan2(e.y - p.y, e.x - p.x) - p.dir; a = Math.atan2(Math.sin(a), Math.cos(a)); return Math.abs(a) < p.arc + 0.15; },
            draw(p, x) { x.globalAlpha = 1 - p.t / p.T; x.strokeStyle = '#1a4fd1'; x.lineWidth = 3; x.beginPath(); x.arc(p.x, p.y, p.rad, p.dir - p.arc, p.dir + p.arc); x.stroke(); x.globalAlpha = 1; }
          });
        }
      }
      if (Math.random() < 0.3) C.Audio.sfx('zap'); else C.Audio.sfx('shoot');
    }
  };
  WB.dsl = {
    fire(R, w, s) {
      for (let i = 0; i < s.amount; i++) {
        R.addProj({
          w, delay: i * 0.25, t: 0, T: 0.55, maxR: 150 * s.area, dmg: s.dmg, kb: s.kb, hitCd: Infinity, rad: 0,
          upd(p, dt) { p.t += dt; p.rad = p.maxR * Math.min(1, p.t / p.T); p.x = R.p.x; p.y = R.p.y; if (p.t >= p.T) p.dead = true; },
          hit(p, e) { const d = Math.sqrt(dist2(p.x, p.y, e.x, e.y)); return Math.abs(d - p.rad) < e.r + 12; },
          draw(p, x) { x.globalAlpha = 1 - p.t / p.T; for (let k = 0; k < 3; k++) { x.strokeStyle = ['#1a4fd1', '#3b8cff', '#9fe7ff'][k]; x.lineWidth = 3; x.beginPath(); x.arc(p.x, p.y, Math.max(1, p.rad - k * 9), 0, TAU); x.stroke(); } x.globalAlpha = 1; }
        });
      }
      C.Audio.sfx('zap');
    }
  };

  /* ---------- Floppy / Zip Drive: boomerangs ---------- */
  function boomerang(R, w, s, spr, size) {
    const t = R.nearest(R.p.x, R.p.y, 420);
    const base = t ? Math.atan2(t.y - R.p.y, t.x - R.p.x) : facing(R);
    for (let i = 0; i < s.amount; i++) {
      const a = base + (i - (s.amount - 1) / 2) * 0.38;
      const sp = 310 * s.speed;
      R.addProj({
        w, x: R.p.x, y: R.p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: size * s.area, dmg: s.dmg, kb: s.kb, pierce: Infinity, hitCd: 0.35,
        spr, scale: s.area, rot: 0, spin: 14, t: 0, T: 0.5 * s.dur, delay: i * 0.05,
        upd(p, dt) {
          p.t += dt;
          if (p.t > p.T) {
            const dx = R.p.x - p.x, dy = R.p.y - p.y, d = Math.hypot(dx, dy) || 1;
            const want = sp * 1.25;
            p.vx += (dx / d * want - p.vx) * Math.min(1, dt * 5);
            p.vy += (dy / d * want - p.vy) * Math.min(1, dt * 5);
            if (d < 16 || p.t > 4) p.dead = true;
          }
          p.x += p.vx * dt; p.y += p.vy * dt;
        }
      });
    }
    C.Audio.sfx('shoot');
  }
  WB.floppy = { fire: (R, w, s) => boomerang(R, w, s, 'floppy', 8) };
  WB.zipdrive = { fire: (R, w, s) => boomerang(R, w, s, 'zipdisk', 11) };

  /* ---------- CD-ROM / DVD Burner: bouncing discs ---------- */
  function disc(R, w, s, spr, burn) {
    for (let i = 0; i < s.amount; i++) {
      const a = Math.random() * TAU, sp = 250 * s.speed;
      R.addProj({
        w, x: R.p.x, y: R.p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 9 * s.area, dmg: s.dmg, kb: s.kb, pierce: Infinity, hitCd: 0.3,
        spr, scale: s.area, rot: 0, spin: 18, life: 2.6 * s.dur, trailT: 0,
        upd(p, dt) {
          p.x += p.vx * dt; p.y += p.vy * dt;
          const v = R.view;
          if (p.x < v.x0 + p.r && p.vx < 0) p.vx = -p.vx; if (p.x > v.x1 - p.r && p.vx > 0) p.vx = -p.vx;
          if (p.y < v.y0 + p.r && p.vy < 0) p.vy = -p.vy; if (p.y > v.y1 - p.r && p.vy > 0) p.vy = -p.vy;
          if (burn) {
            p.trailT -= dt;
            if (p.trailT <= 0) {
              p.trailT = 0.12;
              R.addProj({ w, x: p.x, y: p.y, r: 11 * s.area, dmg: s.dmg * 0.25, pierce: Infinity, hitCd: 0.5, life: 0.9, ground: true, t: 0,
                upd(q, dt2) { q.t += dt2; },
                draw(q, x) { const k = 1 - q.t / 0.9; x.globalAlpha = 0.55 * k; x.fillStyle = '#ff9d2e'; x.beginPath(); x.arc(q.x, q.y, q.r * (0.6 + 0.4 * k), 0, TAU); x.fill(); x.globalAlpha = 1; } });
            }
          }
        }
      });
    }
    C.Audio.sfx('shoot');
  }
  WB.cd = { fire: (R, w, s) => disc(R, w, s, 'cd', false) };
  WB.dvdburner = { fire: (R, w, s) => disc(R, w, s, 'dvd', true) };

  /* ---------- Desktop Icons / Icon Storm: orbiters ---------- */
  const ORB_SPR = ['ico_folder', 'ico_page', 'ico_exe', 'ico_disc'];
  function orbitTick(R, w, s, dt, permanent) {
    w.ang = (w.ang || 0) + dt * 3.2 * s.speed;
    if (!permanent) {
      w.phase = w.phase == null ? 0 : w.phase;
      w.on = w.on == null ? true : w.on;
      w.phase += dt;
      if (w.on && w.phase >= s.dur) { w.on = false; w.phase = 0; }
      else if (!w.on && w.phase >= s.cd) { w.on = true; w.phase = 0; C.Audio.sfx('open'); }
      if (!w.on) { w.pos = null; return; }
    } else w.on = true;
    const n = s.amount, rad = (permanent ? 70 + Math.sin(R.time * 1.6) * 30 : 64) * s.area;
    w.pos = w.pos || [];
    w.pos.length = n;
    const hitR = 11 * s.area;
    w.hits = w.hits || new Map();
    for (let i = 0; i < n; i++) {
      const a = w.ang + i * TAU / n;
      const x = R.p.x + Math.cos(a) * rad, y = R.p.y + Math.sin(a) * rad;
      w.pos[i] = { x, y, a };
      R.forNear(x, y, hitR + 24, e => {
        if (dist2(x, y, e.x, e.y) > (hitR + e.r) * (hitR + e.r)) return;
        const key = e.id * 16 + i, nt = w.hits.get(key) || 0;
        if (nt > R.time) return;
        w.hits.set(key, R.time + 0.45);
        const d = Math.hypot(e.x - R.p.x, e.y - R.p.y) || 1;
        R.damage(e, s.dmg, w.id, (e.x - R.p.x) / d * s.kb, (e.y - R.p.y) / d * s.kb);
      });
    }
    if (w.hits.size > 600) w.hits.clear();
  }
  function orbitDraw(R, w, s, x) {
    if (!w.pos) return;
    for (let i = 0; i < w.pos.length; i++) {
      const p = w.pos[i]; if (!p) continue;
      const sp = C.SPR.get(ORB_SPR[i % ORB_SPR.length]);
      const k = s.area * 1.1;
      x.drawImage(sp, p.x - sp.w * k / 2, p.y - sp.h * k / 2, sp.w * k, sp.h * k);
    }
  }
  WB.icons = { tick: (R, w, s, dt) => orbitTick(R, w, s, dt, false), draw: orbitDraw };
  WB.iconstorm = { tick: (R, w, s, dt) => orbitTick(R, w, s, dt, true), draw: orbitDraw };

  /* ---------- Firewall / Hardware Firewall: burning tiles ---------- */
  function fireTile(R, w, s, x0, y0) {
    R.addProj({
      w, x: x0, y: y0, r: 24 * s.area, dmg: s.dmg, kb: 0, pierce: Infinity, hitCd: 0.4, life: s.dur, t: 0, ground: true, seed: Math.random() * 10,
      upd(p, dt) { p.t += dt; },
      draw(p, x) {
        const k = Math.min(1, p.t * 6, (p.life) * 3);
        const r = p.r * k;
        x.globalAlpha = 0.85;
        x.fillStyle = '#b5482f'; x.fillRect(p.x - r, p.y - r * 0.55, r * 2, r * 1.1);
        x.strokeStyle = '#f2d1bd'; x.lineWidth = 1;
        for (let i = 0; i < 3; i++) { const yy = p.y - r * 0.55 + i * r * 0.367; x.beginPath(); x.moveTo(p.x - r, yy); x.lineTo(p.x + r, yy); x.stroke(); }
        for (let i = 0; i < 3; i++) {
          const fx = p.x - r * 0.6 + i * r * 0.6, h = r * (0.8 + 0.35 * Math.sin(R.time * 12 + p.seed + i * 2));
          x.fillStyle = i % 2 ? '#ffb02e' : '#ff5a1f';
          x.beginPath(); x.moveTo(fx - r * 0.3, p.y - r * 0.4); x.quadraticCurveTo(fx, p.y - r * 0.4 - h * 1.4, fx + r * 0.3, p.y - r * 0.4); x.fill();
        }
        x.globalAlpha = 1;
      }
    });
  }
  WB.firewall = {
    fire(R, w, s) {
      for (let i = 0; i < s.amount; i++) {
        const a = Math.random() * TAU, d = i === 0 ? 0 : rnd(30, 60);
        fireTile(R, w, s, R.p.x + Math.cos(a) * d, R.p.y + Math.sin(a) * d);
      }
    }
  };
  WB.hwfirewall = {
    fire(R, w, s) {
      const n = s.amount + 3; w.rot = (w.rot || 0) + 0.5;
      for (let i = 0; i < n; i++) { const a = w.rot + i * TAU / n; fireTile(R, w, s, R.p.x + Math.cos(a) * 70 * s.area, R.p.y + Math.sin(a) * 70 * s.area); }
      fireTile(R, w, s, R.p.x, R.p.y);
    }
  };

  /* ---------- Reply All / Mass Mailer: homing mails ---------- */
  function mail(R, w, s, spr, explode) {
    for (let i = 0; i < s.amount; i++) {
      const target = R.randomEnemy(R.p.x, R.p.y, 420);
      const a = target ? Math.atan2(target.y - R.p.y, target.x - R.p.x) + rnd(-0.6, 0.6) : Math.random() * TAU;
      const sp = 220 * s.speed;
      R.addProj({
        w, x: R.p.x, y: R.p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 7, dmg: s.dmg, kb: s.kb, pierce: s.pierce, hitCd: Infinity, life: 3, spr, target, sp, delay: i * 0.06, faceVel: true,
        upd(p, dt) {
          if (!p.target || p.target.dead) p.target = R.nearest(p.x, p.y, 380);
          if (p.target) {
            const dx = p.target.x - p.x, dy = p.target.y - p.y, d = Math.hypot(dx, dy) || 1;
            p.vx += (dx / d * p.sp - p.vx) * Math.min(1, dt * 4.5);
            p.vy += (dy / d * p.sp - p.vy) * Math.min(1, dt * 4.5);
          }
          p.x += p.vx * dt; p.y += p.vy * dt;
        },
        onHit: explode ? (p, e) => { R.blast(e.x, e.y, 42, s.dmg * 0.6, w.id, '#ff6ec7'); } : null
      });
    }
    C.Audio.sfx('shoot');
  }
  WB.email = { fire: (R, w, s) => mail(R, w, s, 'mail', false) };
  WB.massmailer = { fire: (R, w, s) => mail(R, w, s, 'mail2', true) };

  /* ---------- Power Surge / Blackout: lightning ---------- */
  function boltFx(R, x0, y0, x1, y1, col) {
    const pts = [];
    const n = 7;
    for (let i = 0; i <= n; i++) { const k = i / n; pts.push([x0 + (x1 - x0) * k + (i && i < n ? rnd(-14, 14) : 0), y0 + (y1 - y0) * k + (i && i < n ? rnd(-6, 6) : 0)]); }
    R.addFx({ t: 0, life: 0.22, draw(f, x) { x.globalAlpha = 1 - f.t / f.life; x.strokeStyle = col || '#ffe14d'; x.lineWidth = 4; x.shadowColor = '#fff3a0'; x.shadowBlur = 10; x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.stroke(); x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.stroke(); x.shadowBlur = 0; x.globalAlpha = 1; } });
  }
  WB.surge = {
    fire(R, w, s) {
      const used = new Set();
      for (let i = 0; i < s.amount; i++) {
        const e = R.randomVisible(used); if (!e) break; used.add(e);
        boltFx(R, e.x + rnd(-40, 40), R.view.y0 - 20, e.x, e.y);
        R.blast(e.x, e.y, 34 * s.area, s.dmg, w.id, null, s.kb);
      }
      C.Audio.sfx('zap');
    }
  };
  WB.blackout = {
    fire(R, w, s) {
      const used = new Set();
      for (let i = 0; i < s.amount; i++) {
        let e = R.randomVisible(used); if (!e) break; used.add(e);
        boltFx(R, e.x + rnd(-40, 40), R.view.y0 - 20, e.x, e.y, '#9fe7ff');
        R.blast(e.x, e.y, 34 * s.area, s.dmg, w.id, null, s.kb);
        let dmg = s.dmg;
        for (let c = 0; c < 4; c++) {
          let best = null, bd = 140 * 140;
          R.forNear(e.x, e.y, 140, o => { if (used.has(o) || o.prop) return; const d = dist2(e.x, e.y, o.x, o.y); if (d < bd) { bd = d; best = o; } });
          if (!best) break;
          used.add(best); dmg *= 0.85;
          boltFx(R, e.x, e.y, best.x, best.y, '#9fe7ff');
          R.damage(best, dmg, w.id, 0, 0);
          e = best;
        }
      }
      C.Audio.sfx('zap');
    }
  };

  /* ---------- Laser Mouse / Optical Overdrive ---------- */
  function beamHit(R, w, s, a, len, width, x0, y0, once, p) {
    const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
    for (const e of R.enemies) {
      if (e.dead) continue;
      const rr = e.r + width / 2;
      if (segDist2(e.x, e.y, x0, y0, x1, y1) > rr * rr) continue;
      if (once) { if (p.hits.has(e.id)) continue; p.hits.set(e.id, Infinity); }
      else { const key = e.id; const nt = w.hits.get(key) || 0; if (nt > R.time) continue; w.hits.set(key, R.time + 0.25); }
      R.damage(e, s.dmg, w.id, Math.cos(a) * s.kb, Math.sin(a) * s.kb);
    }
  }
  function drawBeam(x, x0, y0, a, len, width, al) {
    x.globalAlpha = al;
    x.strokeStyle = '#ff2b2b'; x.lineWidth = width; x.shadowColor = '#ff2b2b'; x.shadowBlur = 12;
    x.beginPath(); x.moveTo(x0, y0); x.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len); x.stroke();
    x.shadowBlur = 0; x.strokeStyle = '#ffd6d6'; x.lineWidth = width * 0.35; x.stroke();
    x.globalAlpha = 1;
  }
  WB.laser = {
    fire(R, w, s) {
      const base = facing(R);
      for (let i = 0; i < s.amount; i++) {
        const a = base + i * TAU / s.amount;
        R.addProj({
          w, t: 0, T: 0.35 * s.dur, a, len: 250 * s.area, width: 8 * s.area, hitCd: Infinity, noCollide: true,
          upd(p, dt) { p.t += dt; p.x = R.p.x; p.y = R.p.y; beamHit(R, w, s, p.a, p.len, p.width, p.x, p.y, true, p); if (p.t >= p.T) p.dead = true; },
          draw(p, x) { drawBeam(x, p.x, p.y, p.a, p.len, p.width * (1 - p.t / p.T * 0.6), 1 - p.t / p.T * 0.5); }
        });
      }
      C.Audio.sfx('zap');
    }
  };
  WB.optical = {
    tick(R, w, s, dt) {
      w.ang = (w.ang || 0) + dt * 2.0; w.hits = w.hits || new Map();
      for (let i = 0; i < s.amount; i++) beamHit(R, w, s, w.ang + i * TAU / s.amount, 210 * s.area, 9 * s.area, R.p.x, R.p.y, false);
      if (w.hits.size > 800) w.hits.clear();
    },
    draw(R, w, s, x) { for (let i = 0; i < s.amount; i++) drawBeam(x, R.p.x, R.p.y, (w.ang || 0) + i * TAU / s.amount, 210 * s.area, 9 * s.area, 0.9); }
  };

  /* ---------- Recycle Bin / Shift+Delete: pull traps ---------- */
  function bin(R, w, s, hole) {
    for (let i = 0; i < s.amount; i++) {
      const t = R.randomEnemy(R.p.x, R.p.y, 260);
      const x0 = t ? t.x : R.p.x + rnd(-120, 120), y0 = t ? t.y : R.p.y + rnd(-120, 120);
      const pull = (hole ? 120 : 90) * s.area;
      R.addProj({
        w, x: x0, y: y0, r: (hole ? 30 : 22) * s.area, dmg: s.dmg, kb: 0, pierce: Infinity, hitCd: 0.5, life: s.dur, t: 0, ground: true, pull,
        upd(p, dt) {
          p.t += dt;
          R.forNear(p.x, p.y, p.pull, e => {
            if (e.d.boss || e.prop) return;
            const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
            if (d > p.pull) return;
            const f = (hole ? 150 : 95) * dt;
            e.x += dx / d * Math.min(f, d); e.y += dy / d * Math.min(f, d);
            if (hole && d < p.r && e.hp < e.maxHp * 0.15) { R.damage(e, e.hp + 1, w.id, 0, 0, 'DELETED'); }
          });
        },
        onEnd(p) { if (!hole) { R.blast(p.x, p.y, p.pull * 0.75, s.dmg * 6, w.id, '#2aa84a'); C.Audio.sfx('boom'); } },
        draw(p, x) {
          const k = Math.min(1, p.t * 5);
          x.globalAlpha = 0.25; x.strokeStyle = hole ? '#8c3cff' : '#2aa84a'; x.lineWidth = 2; x.setLineDash([4, 4]);
          x.beginPath(); x.arc(p.x, p.y, p.pull * (0.85 + 0.15 * Math.sin(R.time * 6)), 0, TAU); x.stroke(); x.setLineDash([]); x.globalAlpha = 1;
          const sp = C.SPR.get(hole ? 'blackhole' : 'binw');
          const sc = (hole ? 2.2 : 1.3) * s.area * k;
          x.save(); x.translate(p.x, p.y); if (hole) x.rotate(R.time * 4);
          x.drawImage(sp, -sp.w * sc / 2, -sp.h * sc / 2, sp.w * sc, sp.h * sc); x.restore();
        }
      });
    }
    C.Audio.sfx('open');
  }
  WB.recycle = { fire: (R, w, s) => bin(R, w, s, false) };
  WB.shiftdel = { fire: (R, w, s) => bin(R, w, s, true) };

  /* ---------- Paint Bucket / Fill Tool: puddles ---------- */
  const PAINT = ['#ff4fa3', '#33c3ff', '#ffd23f', '#5be36b', '#a66bff', '#ff8a33'];
  function paint(R, w, s) {
    for (let i = 0; i < s.amount; i++) {
      const t = R.randomEnemy(R.p.x, R.p.y, 320);
      const tx = t ? t.x : R.p.x + rnd(-150, 150), ty = t ? t.y : R.p.y + rnd(-150, 150);
      const col = PAINT[(Math.random() * PAINT.length) | 0];
      const sx = R.p.x, sy = R.p.y;
      R.addProj({
        w, x: sx, y: sy, t: 0, T: 0.4, noCollide: true, delay: i * 0.1,
        upd(p, dt) {
          p.t += dt; const k = Math.min(1, p.t / p.T);
          p.x = sx + (tx - sx) * k; p.y = sy + (ty - sy) * k - Math.sin(k * Math.PI) * 60;
          if (k >= 1) {
            p.dead = true;
            const blobs = []; for (let b = 0; b < 6; b++) blobs.push([rnd(-0.5, 0.5), rnd(-0.5, 0.5), rnd(0.35, 0.6)]);
            R.addProj({
              w, x: tx, y: ty, r: 38 * s.area, dmg: s.dmg, kb: 0, pierce: Infinity, hitCd: 0.3, life: s.dur, t: 0, ground: true, slow: true,
              upd(q, dt2) { q.t += dt2; },
              draw(q, x) {
                const g = Math.min(1, q.t * 8), fade = Math.min(1, q.life * 2);
                x.globalAlpha = 0.6 * fade; x.fillStyle = col;
                x.beginPath(); x.arc(q.x, q.y, q.r * 0.75 * g, 0, TAU); x.fill();
                blobs.forEach(b => { x.beginPath(); x.arc(q.x + b[0] * q.r, q.y + b[1] * q.r, q.r * b[2] * g, 0, TAU); x.fill(); });
                x.globalAlpha = 1;
              }
            });
          }
        },
        draw(p, x) { const sp = C.SPR.get('bucket'); x.save(); x.translate(p.x, p.y); x.rotate(p.t * 12); x.drawImage(sp, -7, -7, 14, 14); x.restore(); }
      });
    }
  }
  WB.paint = { fire: paint };
  WB.filltool = { fire: paint };

  /* ---------- Full Scan / Deep Scan: screen sweeps ---------- */
  function scan(R, w, s) {
    for (let i = 0; i < s.amount; i++) {
      const dirIdx = i % 4; // 0 L->R, 1 T->B, 2 R->L, 3 B->T
      R.addProj({
        w, delay: i * 0.28, t: 0, T: 1.1 * s.dur, dmg: s.dmg, kb: s.kb, hitCd: Infinity, pos: 0, dirIdx, noCollide: true,
        upd(p, dt) {
          p.t += dt; const k = Math.min(1, p.t / p.T), v = R.view;
          const vert = p.dirIdx % 2 === 0;
          const a0 = vert ? v.x0 : v.y0, a1 = vert ? v.x1 : v.y1;
          p.pos = p.dirIdx < 2 ? a0 + (a1 - a0) * k : a1 - (a1 - a0) * k;
          for (const e of R.enemies) {
            if (e.dead || p.hits.has(e.id)) continue;
            const c = vert ? e.x : e.y;
            const o = vert ? e.y : e.x;
            if (Math.abs(c - p.pos) < e.r + 6 && o > (vert ? v.y0 : v.x0) - 30 && o < (vert ? v.y1 : v.x1) + 30) {
              p.hits.set(e.id, Infinity);
              const kx = vert ? (p.dirIdx < 2 ? 1 : -1) : 0, ky = vert ? 0 : (p.dirIdx < 2 ? 1 : -1);
              R.damage(e, s.dmg, w.id, kx * s.kb, ky * s.kb);
            }
          }
          if (k >= 1) p.dead = true;
        },
        draw(p, x) {
          const v = R.view, vert = p.dirIdx % 2 === 0, back = p.dirIdx < 2 ? -1 : 1;
          x.globalAlpha = 0.22; x.fillStyle = '#2fb84f';
          if (vert) x.fillRect(Math.min(p.pos, p.pos + back * 50), v.y0, 50, v.y1 - v.y0); else x.fillRect(v.x0, Math.min(p.pos, p.pos + back * 50), v.x1 - v.x0, 50);
          x.globalAlpha = 1; x.strokeStyle = '#2fb84f'; x.lineWidth = 3;
          x.beginPath(); if (vert) { x.moveTo(p.pos, v.y0); x.lineTo(p.pos, v.y1); } else { x.moveTo(v.x0, p.pos); x.lineTo(v.x1, p.pos); } x.stroke();
          x.fillStyle = '#13802a'; x.font = 'bold 11px Tahoma, sans-serif'; x.textAlign = 'center';
          if (vert) x.fillText('Scanning...', p.pos, v.y0 + 16); else x.fillText('Scanning...', v.x0 + 50, p.pos - 6);
        }
      });
    }
    C.Audio.sfx('open');
  }
  WB.scan = { fire: scan };
  WB.deepscan = { fire: scan };

  /* ---------- Keyboard / Turbo Typing: letters ---------- */
  const KEYS = 'QWERTYUIOPASDFGHJKLZXCVBNM0123456789';
  function typing(R, w, s) {
    const t = R.nearest(R.p.x, R.p.y, 330);
    const base = t ? Math.atan2(t.y - R.p.y, t.x - R.p.x) : facing(R);
    for (let i = 0; i < s.amount; i++) {
      const a = base + (i - (s.amount - 1) / 2) * 0.13;
      const sp = 430 * s.speed;
      R.addProj({
        w, x: R.p.x, y: R.p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 6 * s.area, dmg: s.dmg, kb: s.kb, pierce: s.pierce, hitCd: Infinity, life: 1.1, delay: i * 0.03,
        ch: KEYS[(Math.random() * KEYS.length) | 0],
        upd(p, dt) { p.x += p.vx * dt; p.y += p.vy * dt; },
        draw(p, x) {
          x.fillStyle = '#fff'; x.strokeStyle = '#333'; x.lineWidth = 1;
          x.fillRect(p.x - 6, p.y - 6, 12, 12); x.strokeRect(p.x - 6, p.y - 6, 12, 12);
          x.fillStyle = '#1a1a1a'; x.font = 'bold 9px Tahoma, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(p.ch, p.x, p.y + 0.5);
        }
      });
    }
    C.Audio.sfx('click');
  }
  WB.keyboard = { fire: typing };
  WB.turbotype = { fire: typing };
})(window.CAS);

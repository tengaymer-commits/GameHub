/* Ctrl+Alt+Survive — run engine: player, spawner, enemies, projectiles, pickups, rendering, HUD */
(function (C) {
  'use strict';
  const TAU = Math.PI * 2;
  const SPR = C.SPR;
  const MAX_ENEMIES = 360, MAX_GEMS = 380, CELL = 64, CHUNK = 640;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

  let cv, ctx, dpr = 1, W = 0, H = 0, scale = 1;
  let R = null, raf = 0, lastT = 0, hudT = 0;
  const keys = {};
  const joy = { on: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const pauses = new Set();
  let sectorTex = [];

  const G = C.Game = {
    get run() { return R; },
    pauses,
    init,
    start,
    pause(reason) { pauses.add(reason); },
    resume(reason) { pauses.delete(reason); lastT = performance.now(); },
    isPaused: () => pauses.size > 0,
    end,
    chooseLevel, makeChoices, banish,
    wstat, calcStats,
    debugStep: dt => { if (R && !R.over && !pauses.size) update(dt); }
  };

  /* ================= setup ================= */
  function init() {
    cv = document.getElementById('cv');
    ctx = cv.getContext('2d');
    window.addEventListener('resize', resize);
    resize();
    window.addEventListener('keydown', e => {
      keys[e.code] = true;
      if (!R || R.over) return;
      if ((e.code === 'Escape' || e.code === 'KeyP') && !pauses.has('levelup') && !pauses.has('zip')) {
        if (pauses.has('menu')) C.RunUI.closePause(); else C.RunUI.openPause();
      }
      if (/^Arrow|^Space$/.test(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; joy.on = false; });
    const area = document.getElementById('gameArea');
    area.addEventListener('pointerdown', e => {
      if (joy.on) return;
      joy.on = true; joy.id = e.pointerId; const r = cv.getBoundingClientRect();
      joy.ox = joy.x = e.clientX - r.left; joy.oy = joy.y = e.clientY - r.top;
      try { area.setPointerCapture(e.pointerId); } catch (er) { }
      e.preventDefault();
    });
    area.addEventListener('pointermove', e => {
      if (!joy.on || e.pointerId !== joy.id) return;
      const r = cv.getBoundingClientRect(); joy.x = e.clientX - r.left; joy.y = e.clientY - r.top;
    });
    const up = e => { if (e.pointerId === joy.id) { joy.on = false; joy.id = null; } };
    area.addEventListener('pointerup', up); area.addEventListener('pointercancel', up);
    document.addEventListener('visibilitychange', () => { if (document.hidden && R && !R.over && !pauses.size) C.RunUI.openPause(); });
    makeSectorTextures();
  }

  function resize() {
    if (!cv) return;
    const r = cv.parentElement.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    // keep the visible world area roughly constant (about 900 x 520 units)
    scale = clamp(Math.sqrt((W * H) / (900 * 520)), 0.45, 2.2);
  }
  G.resize = resize;

  function makeSectorTextures() {
    sectorTex = [];
    const pal = ['#1b1340', '#2a1f5c', '#120c2b', '#3b2a73', '#0d0a1c', '#4a2f80', '#5a2a5a', '#1e3a5f'];
    const glitch = ['#ff3d6e', '#39ff7a', '#33c3ff', '#ffd23f', '#ffffff'];
    for (let v = 0; v < 4; v++) {
      const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
      const x = c.getContext('2d');
      const cells = 16, cs = S / cells;
      const alive = [];
      for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
        const dx = (i + 0.5) / cells - 0.5, dy = (j + 0.5) / cells - 0.5;
        const d = Math.hypot(dx, dy) + (Math.random() - 0.5) * 0.18;
        if (d < 0.42) alive.push([i, j]);
      }
      for (const [i, j] of alive) {
        for (let px = 0; px < cs; px += 2) for (let py = 0; py < cs; py += 2) {
          if (Math.random() < 0.12) continue;
          x.fillStyle = Math.random() < 0.06 ? glitch[(Math.random() * glitch.length) | 0] : pal[(Math.random() * pal.length) | 0];
          x.fillRect(i * cs + px, j * cs + py, 2, 2);
        }
      }
      // scattered loose pixels around the edge
      for (let k = 0; k < 220; k++) { const a = Math.random() * TAU, d = S * (0.36 + Math.random() * 0.14); x.fillStyle = pal[k % pal.length]; x.fillRect(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 2, 2); }
      sectorTex.push(c);
    }
  }

  /* ================= stats ================= */
  const BASE = { might: 1, armor: 0, maxHp: 100, maxHpMult: 1, recovery: 0, cooldown: 1, area: 1, speed: 1, duration: 1, amount: 0, move: 1, magnet: 1, luck: 1, growth: 1, greed: 1, curse: 1, revival: 0, reroll: 0, skip: 0, banish: 0 };
  function calcStats(run) {
    const S = Object.assign({}, BASE);
    const add = (o, m) => { for (const k in o) S[k] = (S[k] || 0) + o[k] * (m || 1); };
    add(run.meta);
    add(C.CHARS[run.char].bonus);
    for (const id in run.passives) add(C.PASSIVES[id].stat, run.passives[id]);
    S.cooldown = Math.max(0.35, S.cooldown);
    S.maxHpFinal = Math.max(10, Math.round(S.maxHp * S.maxHpMult));
    if (run.hyper) { S.move *= 1.15; S.greed += 0.5; }
    return S;
  }
  function wstat(w) {
    const d = C.WEAPONS[w.id], s = Object.assign({}, d.base);
    for (let i = 0; i < w.lvl - 1; i++) { const b = d.lv[i]; for (const k in b) s[k] += b[k]; }
    const S = R.S;
    return { dmg: s.dmg * S.might, cd: Math.max(0.05, s.cd * S.cooldown), amount: Math.max(1, s.amount + S.amount), area: s.area * S.area, speed: s.speed * S.speed, dur: s.dur * S.duration, pierce: s.pierce, kb: s.kb };
  }
  function refreshStats() {
    const oldMax = R.S ? R.S.maxHpFinal : 0;
    R.S = calcStats(R);
    if (oldMax && R.S.maxHpFinal > oldMax) R.p.hp += R.S.maxHpFinal - oldMax;
    R.p.hp = Math.min(R.p.hp, R.S.maxHpFinal);
    for (const w of R.weapons) w.s = wstat(w);
    R.hudDirty = true;
  }
  const xpFor = L => 5 + L * 6 + Math.max(0, L - 20) * 10 + Math.max(0, L - 40) * 18;

  /* ================= run lifecycle ================= */
  function start(opts) {
    const drive = C.drive(opts.drive);
    R = {
      char: opts.char, drive, hyper: !!opts.hyper, time: 0, level: 1, xp: 0, xpNext: xpFor(1), kills: 0, credits: 0,
      p: { x: 0, y: 0, r: 9, hp: 100, fx: 1, fy: 0, inv: 0, moving: false, hurtT: 0, slowed: false },
      weapons: [], passives: {}, passiveOrder: [], enemies: [], proj: [], ebul: [], gems: [], fx: [], texts: [], parts: [],
      nextId: 1, spawnAcc: 0, pendingLevels: 0, freeze: 0, shake: 0, over: false, won: false,
      grid: new Map(), chunks: new Map(), destroyed: new Set(), banished: new Set(), events: [], bossT: {}, finalBoss: null, boss: null,
      meta: C.Save.metaStats(), st: { dmgBy: {}, killsBy: {}, zips: 0, healed: 0, props: 0, formats: 0, bosses: 0, evolved: [], dmgTaken: 0 },
      view: { x0: 0, y0: 0, x1: 0, y1: 0 }, hudDirty: true, enemyCount: 0, eliteT: 45
    };
    R.S = calcStats(R);
    R.p.hp = R.S.maxHpFinal;
    R.rerolls = R.S.reroll; R.skips = R.S.skip; R.banishes = R.S.banish; R.revivals = R.S.revival;
    const dur = drive.dur;
    const ev = (t, type) => R.events.push({ t, type });
    [0.21, 0.44, 0.69, 0.9].forEach(k => ev(dur * k, 'swarm'));
    [0.33, 0.58, 0.83].forEach(k => ev(dur * k, 'ring'));
    ev(dur * 0.5, 'mid'); ev(dur, 'final');
    R.events.sort((a, b) => a.t - b.t);
    addRunAPI();
    addWeapon(C.CHARS[opts.char].weapon);
    C.Save.data.seen.weapon[C.CHARS[opts.char].weapon] = true;
    pauses.clear();
    resize();
    lastT = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
    C.Audio.music('game');
    updateHud(true);
    window.__run = R;
  }

  function end(reason) {
    if (!R || R.over) return;
    R.over = true;
    cancelAnimationFrame(raf);
    C.Audio.music(null);
    const report = buildReport(reason);
    C.RunUI.report(report);
  }

  function buildReport(reason) {
    const sv = C.Save.data, s = sv.stats, st = R.st;
    const credits = Math.round(R.credits);
    s.runs++; s.kills += R.kills; s.time += R.time; s.bosses += st.bosses; s.zips += st.zips; s.props += st.props;
    s.formats += st.formats; s.healed += st.healed; s.creditsEarned += credits;
    if (reason === 'dead') s.deaths++;
    s.bestLevel = Math.max(s.bestLevel, R.level);
    s.bestTime = Math.max(s.bestTime, R.time);
    s.bestTimes[R.drive.id] = Math.max(s.bestTimes[R.drive.id] || 0, R.time);
    if (reason === 'win') { s.clears[R.drive.id] = (s.clears[R.drive.id] || 0) + 1; if (R.hyper) s.hyperClears++; }
    for (const k in st.killsBy) s.killsBy[k] = (s.killsBy[k] || 0) + st.killsBy[k];
    st.evolved.forEach(id => { s.evolved[id] = true; });
    const maxed = R.weapons.filter(w => C.WEAPONS[w.id].evolved || w.lvl >= C.WEAPONS[w.id].max).length;
    s.maxedWeapons = Math.max(s.maxedWeapons, maxed);
    if (R.time >= 300) s.charSurv5[R.char] = true;
    sv.credits += credits;
    const tasks = C.Save.checkTasks();
    C.Save.save();
    const dmg = R.weapons.map(w => ({ id: w.id, lvl: w.lvl, dmg: Math.round(st.dmgBy[w.id] || 0) }));
    // weapons replaced by evolutions keep their damage line
    for (const id in st.dmgBy) if (!dmg.find(d => d.id === id)) dmg.push({ id, lvl: '-', dmg: Math.round(st.dmgBy[id]) });
    dmg.sort((a, b) => b.dmg - a.dmg);
    return { reason, drive: R.drive, char: R.char, hyper: R.hyper, time: R.time, level: R.level, kills: R.kills, credits, dmg, tasks, bosses: st.bosses, zips: st.zips, passives: R.passiveOrder.map(id => ({ id, lvl: R.passives[id] })) };
  }

  /* ================= loop ================= */
  function loop(t) {
    raf = requestAnimationFrame(loop);
    let dt = (t - lastT) / 1000; lastT = t;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;
    if (!pauses.size && !R.over) {
      // two substeps when the frame is long, keeps fast projectiles from tunnelling
      if (dt > 0.025) { update(dt / 2); if (!pauses.size && !R.over) update(dt / 2); } else update(dt);
    }
    if (R) render();
    hudT -= dt;
    if (hudT <= 0 || R.hudDirty) { hudT = 0.1; updateHud(); }
  }

  /* ================= run API used by weapons ================= */
  function addRunAPI() {
    R.addProj = o => { o.hits = new Map(); if (o.t == null) o.t = 0; R.proj.push(o); return o; };
    R.addFx = o => { if (o.t == null) o.t = 0; R.fx.push(o); return o; };
    R.forNear = forNear;
    R.nearest = (x, y, maxD) => {
      let best = null, bd = maxD * maxD;
      for (const e of R.enemies) { if (e.dead || e.prop || e.link) continue; const d = dist2(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
      return best;
    };
    R.randomEnemy = (x, y, maxD) => {
      const c = []; const m = maxD * maxD;
      for (const e of R.enemies) { if (e.dead || e.prop || e.link) continue; if (dist2(x, y, e.x, e.y) < m) c.push(e); if (c.length > 60) break; }
      return c.length ? c[(Math.random() * c.length) | 0] : null;
    };
    R.randomVisible = (exclude) => {
      const v = R.view, c = [];
      for (const e of R.enemies) { if (e.dead || e.prop || (exclude && exclude.has(e))) continue; if (e.x > v.x0 && e.x < v.x1 && e.y > v.y0 && e.y < v.y1) c.push(e); }
      return c.length ? c[(Math.random() * c.length) | 0] : null;
    };
    R.damage = damage;
    R.blast = (x, y, r, dmg, wid, col, kb) => {
      forNear(x, y, r + 30, e => {
        const d = Math.sqrt(dist2(x, y, e.x, e.y));
        if (d > r + e.r) return;
        const k = kb || 0.6;
        damage(e, dmg, wid, (e.x - x) / (d || 1) * k, (e.y - y) / (d || 1) * k);
      });
      R.addFx({ life: 0.3, draw(f, c) { c.globalAlpha = 0.5 * (1 - f.t / f.life); c.fillStyle = col || '#fff3a0'; c.beginPath(); c.arc(x, y, r * (0.5 + f.t / f.life * 0.6), 0, TAU); c.fill(); c.globalAlpha = 1; } });
    };
  }

  function rebuildGrid() {
    const g = R.grid;
    for (const arr of g.values()) arr.length = 0;
    for (const e of R.enemies) {
      if (e.dead) continue;
      const k = ((Math.floor(e.x / CELL) + 4096) << 13) | (Math.floor(e.y / CELL) + 4096);
      let a = g.get(k); if (!a) { a = []; g.set(k, a); }
      a.push(e);
    }
    if (g.size > 3000) { for (const [k, a] of g) if (!a.length) g.delete(k); }
  }
  function forNear(x, y, r, cb) {
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) {
      const a = R.grid.get(((i + 4096) << 13) | (j + 4096));
      if (!a) continue;
      for (let n = 0; n < a.length; n++) { const e = a[n]; if (!e.dead) cb(e); }
    }
  }

  /* ================= weapons & passives ================= */
  function addWeapon(id) {
    const w = { id, lvl: 1, t: 0.3 };
    w.s = null;
    R.weapons.push(w);
    w.s = wstat(w);
    R.hudDirty = true;
    return w;
  }
  function levelWeapon(id) {
    const w = R.weapons.find(x => x.id === id);
    if (!w) return addWeapon(id);
    w.lvl = Math.min(C.WEAPONS[id].max, w.lvl + 1);
    w.s = wstat(w);
    R.hudDirty = true;
    return w;
  }
  function addPassive(id) {
    if (!R.passives[id]) { R.passives[id] = 0; R.passiveOrder.push(id); C.Save.data.seen.passive[id] = true; }
    R.passives[id] = Math.min(C.PASSIVES[id].max, R.passives[id] + 1);
    refreshStats();
  }
  function evolvable() {
    return R.weapons.filter(w => {
      const d = C.WEAPONS[w.id];
      return !d.evolved && d.into && w.lvl >= d.max && R.passives[d.evo];
    });
  }
  function evolve(w) {
    const d = C.WEAPONS[w.id];
    w.id = d.into; w.lvl = 1; w.t = 0.2; w.pos = null; w.hits = null; w.on = null; w.phase = null;
    w.s = wstat(w);
    R.st.evolved.push(w.id);
    C.Save.data.seen.weapon[w.id] = true;
    R.hudDirty = true;
    return w;
  }

  /* -------- level-up choices -------- */
  function makeChoices() {
    const opts = [];
    const pool = C.Save.data.unlocked.weapon;
    const ownedIds = new Set(R.weapons.map(w => w.id));
    const fromIds = new Set(R.weapons.map(w => C.WEAPONS[w.id].from).filter(Boolean));
    for (const w of R.weapons) { const d = C.WEAPONS[w.id]; if (!d.evolved && w.lvl < d.max) opts.push({ type: 'w', id: w.id, lvl: w.lvl + 1, wt: 1.3 }); }
    for (const id of R.passiveOrder) if (R.passives[id] < C.PASSIVES[id].max) opts.push({ type: 'p', id, lvl: R.passives[id] + 1, wt: 1.1 });
    if (R.weapons.length < 6) for (const id of pool) { if (ownedIds.has(id) || fromIds.has(id) || R.banished.has(id) || !C.WEAPONS[id] || C.WEAPONS[id].evolved) continue; opts.push({ type: 'w', id, lvl: 1, wt: 1, isNew: true }); }
    if (R.passiveOrder.length < 6) for (const id in C.PASSIVES) { if (R.passives[id] || R.banished.has(id)) continue; opts.push({ type: 'p', id, lvl: 1, wt: 0.9, isNew: true }); }
    const n = 3 + (Math.random() < Math.min(0.9, (R.S.luck - 1) * 1.6) ? 1 : 0);
    const out = [];
    while (out.length < n && opts.length) {
      const total = opts.reduce((a, o) => a + o.wt, 0);
      let r = Math.random() * total, i = 0;
      for (; i < opts.length - 1; i++) { r -= opts[i].wt; if (r <= 0) break; }
      out.push(opts.splice(i, 1)[0]);
    }
    if (!out.length) { out.push({ type: 'credits', v: 25 }); out.push({ type: 'heal', v: 30 }); }
    return out;
  }
  function chooseLevel(c) {
    if (c) {
      if (c.type === 'w') { levelWeapon(c.id); C.Save.data.seen.weapon[c.id] = true; }
      else if (c.type === 'p') addPassive(c.id);
      else if (c.type === 'credits') R.credits += c.v * R.S.greed;
      else if (c.type === 'heal') heal(c.v);
    }
    R.pendingLevels = Math.max(0, R.pendingLevels - 1);
    pauses.delete('levelup');
    lastT = performance.now();
  }
  function banish(c) { R.banished.add(c.id); R.banishes--; }

  /* -------- zip archives -------- */
  function openZip(big) {
    R.st.zips++;
    const lr = Math.random(), luck = R.S.luck;
    let count = big ? 3 : 1;
    if (lr < 0.04 * luck) count = 5; else if (lr < 0.18 * luck) count = Math.max(count, 3);
    const items = [];
    for (let i = 0; i < count; i++) {
      const ev = evolvable();
      if (ev.length) { const w = ev[0]; const from = w.id; evolve(w); items.push({ type: 'evo', id: w.id, from }); continue; }
      const ups = [];
      for (const w of R.weapons) { const d = C.WEAPONS[w.id]; if (!d.evolved && w.lvl < d.max) ups.push({ type: 'w', id: w.id }); }
      for (const id of R.passiveOrder) if (R.passives[id] < C.PASSIVES[id].max) ups.push({ type: 'p', id });
      if (!ups.length) { const v = Math.round(rnd(20, 40) * R.S.greed); R.credits += v; items.push({ type: 'credits', v }); continue; }
      const u = ups[(Math.random() * ups.length) | 0];
      if (u.type === 'w') { const w = levelWeapon(u.id); items.push({ type: 'w', id: u.id, lvl: w.lvl }); }
      else { addPassive(u.id); items.push({ type: 'p', id: u.id, lvl: R.passives[u.id] }); }
    }
    const bonus = Math.round(rnd(10, 30) * count * R.S.greed);
    R.credits += bonus;
    pauses.add('zip');
    C.Audio.sfx('zip');
    C.RunUI.zip(items, bonus, () => { pauses.delete('zip'); lastT = performance.now(); });
  }

  /* ================= enemies ================= */
  function spawnPoint(minD) {
    const v = R.view, hw = (v.x1 - v.x0) / 2, hh = (v.y1 - v.y0) / 2;
    const rad = Math.hypot(hw, hh) + 40;
    for (let tries = 0; tries < 8; tries++) {
      let a = Math.random() * TAU;
      // bias spawns slightly toward where the player is heading
      if (R.p.moving && Math.random() < 0.35) a = Math.atan2(R.p.fy, R.p.fx) + rnd(-0.9, 0.9);
      let x = R.p.x + Math.cos(a) * rad, y = R.p.y + Math.sin(a) * rad;
      if (R.drive.bounded) {
        const b = R.drive.bounded / 2 - 20;
        x = clamp(x, -b, b); y = clamp(y, -b, b);
        if (dist2(x, y, R.p.x, R.p.y) < (minD || 260) * (minD || 260)) continue;
      }
      return { x, y };
    }
    const b = R.drive.bounded ? R.drive.bounded / 2 - 20 : 0;
    return b ? { x: R.p.x > 0 ? -b : b, y: R.p.y > 0 ? -b : b } : { x: R.p.x + rad, y: R.p.y };
  }

  function makeEnemy(type, x, y, o) {
    o = o || {};
    const d = C.ENEMIES[type], m = R.time / 60, dr = R.drive, S = R.S;
    const dk = 1 + (dr.diff - 1) * Math.min(1, 0.25 + m / 5);
    let hpMul = (1 + m * 0.45 + m * m * 0.028) * dk * S.curse * (R.hyper ? 1.25 : 1);
    if (d.boss) hpMul = Math.pow(dr.diff, 0.85) * (1 + m * 0.06) * S.curse * (dr.bossMult || 1) * (o.mid ? 0.5 : 1) * (R.hyper ? 1.3 : 1);
    const e = {
      id: R.nextId++, type, d, x, y, hp: d.hp * hpMul, r: d.r, spd: d.spd * (R.hyper ? 1.3 : 1) * (1 + (S.curse - 1) * 0.5) * rnd(0.92, 1.08),
      dmg: d.dmg * (1 + m * 0.14) * Math.pow(dr.diff, 0.6), xp: d.xp, kx: 0, ky: 0, flash: 0, slow: 0, ai: d.ai || 'chase', t: Math.random() * 4,
      spr: SPR.spriteForEnemy(type), sc: 1, kbRes: d.boss ? 0.95 : 0, flip: false, fireT: rnd(1, d.fire || 2), state: 0
    };
    if (o.elite) { e.elite = true; e.hp *= 11; e.r *= 1.6; e.sc = 1.6; e.kbRes = 0.75; e.spd *= 0.95; e.dmg *= 1.5; e.xp *= 8; }
    if (o.vx != null) { e.ai = 'straight'; e.vx = o.vx; e.vy = o.vy; e.life = o.life || 10; }
    if (d.boss) { e.boss = true; e.mid = !!o.mid; }
    e.maxHp = e.hp;
    R.enemies.push(e);
    C.Save.data.seen.enemy[type] = true;
    if (d.ai === 'boss_worm') {
      e.trail = [];
      e.segs = [];
      for (let i = 0; i < d.segs; i++) {
        const s = { id: R.nextId++, type: 'megaseg', d: { name: d.name, xp: 0, boss: true }, link: e, x, y, hp: 1, maxHp: 1, r: 17, spd: 0, dmg: e.dmg * 0.7, xp: 0, kx: 0, ky: 0, flash: 0, slow: 0, ai: 'seg', spr: 'megaseg', sc: 1, kbRes: 1, seg: i };
        e.segs.push(s); R.enemies.push(s);
      }
    }
    return e;
  }

  function pickType() {
    const m = R.time / 60;
    const pool = R.drive.pool.filter(p => p[1] <= m);
    let total = 0;
    const w = pool.map(p => { const wt = p[2] * (m - p[1] > 4 ? 0.55 : 1); total += wt; return wt; });
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i][0]; }
    return pool[0][0];
  }

  function spawner(dt) {
    const m = R.time / 60, dr = R.drive, S = R.S;
    let mul = R.hyper ? 1.3 : 1;
    if (R.finalBoss && !R.finalBoss.dead) mul *= 0.35;
    else if (R.boss && !R.boss.dead) mul *= 0.6;
    const rate = (1.6 + m * 1.4) * Math.sqrt(dr.diff) * S.curse * mul;
    const quota = Math.min(MAX_ENEMIES, (18 + m * 32) * Math.sqrt(dr.diff) * S.curse * mul);
    R.spawnAcc += dt * rate * (R.enemyCount < quota ? 3 : 1);
    while (R.spawnAcc >= 1) {
      R.spawnAcc -= 1;
      if (R.enemyCount >= MAX_ENEMIES) { R.spawnAcc = 0; break; }
      const p = spawnPoint();
      makeEnemy(pickType(), p.x, p.y);
      R.enemyCount++;
    }
    // elites carry .zip archives
    R.eliteT -= dt;
    if (R.eliteT <= 0) {
      R.eliteT = 55;
      const pool = R.drive.pool.filter(p => p[1] <= m);
      const type = pool[pool.length - 1][0];
      const p = spawnPoint();
      makeEnemy(type, p.x, p.y, { elite: true });
    }
    // scripted events
    while (R.events.length && R.events[0].t <= R.time) runEvent(R.events.shift().type);
  }

  function runEvent(type) {
    const P = R.p;
    if (type === 'swarm') {
      const a = Math.random() * TAU, sp = 150 + R.time / 60 * 6;
      const vx = Math.cos(a) * sp, vy = Math.sin(a) * sp;
      const v = R.view, rad = Math.hypot(v.x1 - v.x0, v.y1 - v.y0) / 2 + 30;
      const cx = P.x - Math.cos(a) * rad, cy = P.y - Math.sin(a) * rad;
      const px = -Math.sin(a), py = Math.cos(a);
      const n = 26, kind = R.time > 240 ? 'spam' : 'cookie';
      for (let i = 0; i < n; i++) {
        const off = (i - n / 2) * 18 + rnd(-6, 6), back = rnd(0, 60);
        makeEnemy(kind, cx + px * off - Math.cos(a) * back, cy + py * off - Math.sin(a) * back, { vx, vy, life: (rad * 2 + 120) / sp });
      }
      C.RunUI.banner('Incoming spam wave!');
    } else if (type === 'ring') {
      const n = 30, kind = R.time > 300 ? 'error' : 'cookie', rad = 330;
      for (let i = 0; i < n; i++) { const a = i / n * TAU; makeEnemy(kind, P.x + Math.cos(a) * rad, P.y + Math.sin(a) * rad); }
      C.RunUI.banner('You are surrounded by ' + C.ENEMIES[kind].name + 's!');
    } else if (type === 'mid' || type === 'final') {
      const id = type === 'mid' ? R.drive.mid : R.drive.boss;
      const p = spawnPoint(320);
      const e = makeEnemy(id, p.x, p.y, { mid: type === 'mid' });
      R.boss = e;
      if (type === 'final') R.finalBoss = e;
      C.Audio.sfx('warning'); C.Audio.music('boss');
      C.RunUI.bossWarning(C.ENEMIES[id].name, type === 'final');
    }
  }

  function updateEnemies(dt) {
    const P = R.p;
    const frozen = R.freeze > 0;
    let count = 0;
    const farR = Math.hypot(R.view.x1 - R.view.x0, R.view.y1 - R.view.y0) * 0.5 + 280;
    for (const e of R.enemies) {
      if (e.dead) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.prop) continue;
      if (!e.boss && !e.link) count++;
      if (e.slow > 0) e.slow -= dt;
      const kd = Math.min(1, dt * 9);
      e.x += e.kx * 60 * dt; e.y += e.ky * 60 * dt; e.kx -= e.kx * kd; e.ky -= e.ky * kd;
      if (e.ai === 'seg') continue;
      if (frozen && !e.boss) continue;
      e.t += dt;
      const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1;
      const nx = dx / d, ny = dy / d;
      let sp = e.spd * (e.slow > 0 ? 0.5 : 1) * (frozen ? 0.4 : 1);
      let vx = nx * sp, vy = ny * sp;
      switch (e.ai) {
        case 'worm': { const w = Math.sin(e.t * 5) * 0.8; vx = (nx - ny * w) * sp; vy = (ny + nx * w) * sp; break; }
        case 'straight': vx = e.vx; vy = e.vy; e.life -= dt; if (e.life <= 0) { e.dead = true; continue; } break;
        case 'shooter': {
          if (d < e.d.range) { vx = -ny * sp * 0.5 - nx * sp * 0.2; vy = nx * sp * 0.5 - ny * sp * 0.2; }
          e.fireT -= dt;
          if (e.fireT <= 0 && d < e.d.range + 60) { e.fireT = e.d.fire * rnd(0.8, 1.2); shootBullet(e, Math.atan2(dy, dx), 150, e.dmg * 0.8, 'key'); }
          break;
        }
        case 'dash': {
          const cyc = e.t % 3.2;
          if (cyc < 2.2) { /* chase */ } else if (cyc < 2.65) { vx = vy = 0; e.windup = true; if (!e.lock) e.lock = [nx, ny]; }
          else { e.windup = false; const l = e.lock || [nx, ny]; vx = l[0] * sp * 4.5; vy = l[1] * sp * 4.5; }
          if (cyc < 2.2) e.lock = null;
          break;
        }
        case 'boss_worm': {
          const w = Math.sin(e.t * 2.4) * 0.7;
          const burst = (e.t % 6) > 4.8 ? 2.2 : 1;
          vx = (nx - ny * w) * sp * burst; vy = (ny + nx * w) * sp * burst;
          break;
        }
        case 'boss_summon': {
          e.fireT -= dt;
          if (e.fireT <= 0) {
            e.fireT = 2.6;
            const n = 12, off = e.t;
            for (let i = 0; i < n; i++) shootBullet(e, off + i * TAU / n, 120, e.dmg * 0.5, 'ad');
          }
          e.sumT = (e.sumT || 3) - dt;
          if (e.sumT <= 0) {
            e.sumT = 4.5;
            for (let i = 0; i < 3; i++) { const a = Math.random() * TAU; makeEnemy(Math.random() < 0.5 ? 'adware' : 'popup', e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 60); }
          }
          break;
        }
        case 'boss_dash': {
          const cyc = e.t % 3.0;
          if (cyc < 1.8) { /* stalk */ }
          else if (cyc < 2.4) { vx = vy = 0; e.windup = true; if (!e.lock) e.lock = [nx, ny]; }
          else {
            e.windup = false; const l = e.lock || [nx, ny]; vx = l[0] * 560; vy = l[1] * 560;
            if (!e.dashed) { e.dashed = true; C.Audio.sfx('zap'); }
          }
          if (cyc < 1.8 && e.dashed) {
            e.dashed = false; e.lock = null;
            for (let i = 0; i < 14; i++) shootBullet(e, i * TAU / 14, 110, e.dmg * 0.45, 'bit');
          }
          break;
        }
        case 'boss_hell': {
          const enraged = e.hp < e.maxHp * 0.5;
          sp *= enraged ? 1.4 : 1; vx = nx * sp; vy = ny * sp;
          e.fireT -= dt;
          if (e.fireT <= 0) {
            e.pat = ((e.pat || 0) + 1) % 3;
            e.fireT = enraged ? 1.6 : 2.3;
            if (e.pat === 0) { for (let i = 0; i < 20; i++) shootBullet(e, i * TAU / 20 + e.t, 115, e.dmg * 0.45, 'hex'); }
            else if (e.pat === 1) { e.spiral = 1.2; }
            else { const a = Math.atan2(dy, dx); for (let i = -2; i <= 2; i++) shootBullet(e, a + i * 0.16, 190, e.dmg * 0.5, 'hex'); }
          }
          if (e.spiral > 0) { e.spiral -= dt; e.spT = (e.spT || 0) - dt; if (e.spT <= 0) { e.spT = 0.07; for (let k = 0; k < 3; k++) shootBullet(e, e.t * 5 + k * TAU / 3, 130, e.dmg * 0.4, 'hex'); } }
          break;
        }
      }
      e.x += vx * dt; e.y += vy * dt;
      if (Math.abs(vx) > 1) e.flip = vx < 0;
      if (e.trail) {
        const last = e.trail[0];
        if (!last || dist2(last[0], last[1], e.x, e.y) > 16) { e.trail.unshift([e.x, e.y]); if (e.trail.length > 400) e.trail.pop(); }
        for (const s of e.segs) { const tp = e.trail[Math.min(e.trail.length - 1, (s.seg + 1) * 7)]; if (tp) { s.x = tp[0]; s.y = tp[1]; } }
      }
      // relocate stragglers that fell far behind
      if (!e.boss && !e.elite && e.ai !== 'straight' && d > farR) {
        const p = spawnPoint(); e.x = p.x; e.y = p.y;
      }
      if (R.drive.bounded) { const b = R.drive.bounded / 2 - e.r; e.x = clamp(e.x, -b, b); e.y = clamp(e.y, -b, b); }
    }
    R.enemyCount = count;
  }

  function separate() {
    for (const a of R.grid.values()) {
      for (let i = 0; i < a.length; i++) {
        const e = a[i]; if (e.prop || e.link || e.boss) continue;
        for (let j = i + 1; j < a.length; j++) {
          const o = a[j]; if (o.prop || o.link) continue;
          const dx = o.x - e.x, dy = o.y - e.y, rr = (e.r + o.r) * 0.8, d2 = dx * dx + dy * dy;
          if (d2 > rr * rr || d2 === 0) continue;
          const d = Math.sqrt(d2), push = (rr - d) * 0.35 / d;
          if (o.boss) { e.x -= dx * push * 2; e.y -= dy * push * 2; }
          else { e.x -= dx * push; e.y -= dy * push; o.x += dx * push; o.y += dy * push; }
        }
      }
    }
  }

  function shootBullet(e, a, sp, dmg, kind) {
    if (R.ebul.length > 400) return;
    R.ebul.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: kind === 'ad' ? 7 : 5, dmg, life: 6, kind, ch: kind === 'key' ? 'ASDFJKL;QWERTY'[(Math.random() * 14) | 0] : kind === 'bit' ? (Math.random() < 0.5 ? '0' : '1') : '' });
  }

  function damage(e, amt, wid, kx, ky, label) {
    if (e.dead) return;
    let target = e;
    if (e.link) { target = e.link; amt *= 0.5; if (target.dead) return; e.flash = 0.08; }
    if (target.dead) return;
    target.hp -= amt;
    target.flash = 0.1;
    if (!target.kbRes || target.kbRes < 1) { target.kx += (kx || 0) * (1 - (target.kbRes || 0)); target.ky += (ky || 0) * (1 - (target.kbRes || 0)); }
    R.st.dmgBy[wid] = (R.st.dmgBy[wid] || 0) + amt;
    if (C.Save.data.settings.dmgNums && R.texts.length < 140) R.texts.push({ x: e.x + rnd(-5, 5), y: e.y - e.r, t: 0, s: label || String(Math.round(amt)), big: amt >= 50 || !!label, col: label ? '#8c3cff' : null });
    C.Audio.sfx('hit');
    if (target.hp <= 0) kill(target, wid);
  }

  function kill(e, wid) {
    if (e.dead) return;
    e.dead = true;
    if (e.prop) {
      R.st.props++;
      R.destroyed.add(e.chunkKey);
      dropProp(e.x, e.y);
      burst(e.x, e.y, ['#f3c74b', '#fff', '#4a74d8'], 10);
      C.Audio.sfx('kill');
      return;
    }
    R.kills++;
    R.st.killsBy[e.type] = (R.st.killsBy[e.type] || 0) + 1;
    const pal = { popup: ['#1c3f94', '#fff', '#e11d48'], spam: ['#fff', '#e11d48'], error: ['#e0251b', '#fff'], cookie: ['#c98a4b', '#4a2a10'], worm: ['#4fcf3a', '#1f7a1a'], trojan: ['#e0533f', '#ffd23f'], adware: ['#d6d6d6', '#ffb300'], keylogger: ['#3d4149', '#e11d48'], dialer: ['#a9a69b', '#2fb84f'], bsod: ['#1530b8', '#fff'] }[e.type] || ['#fff', '#1a4fd1', '#2fb84f'];
    burst(e.x, e.y, pal, e.boss ? 60 : e.elite ? 24 : 6);
    C.Audio.sfx('kill');
    // drops
    const m = R.time / 60;
    const xpv = e.xp * (1 + m * 0.12);
    if (!e.boss) dropGem(e.x, e.y, xpv);
    const luck = R.S.luck * (R.drive.loot || 1);
    if (Math.random() < 0.012 * luck) R.gems.push({ x: e.x, y: e.y, kind: 'coin', v: 1 });
    if (Math.random() < 0.0016 * luck) R.gems.push({ x: e.x + 6, y: e.y, kind: ['patch', 'defrag', 'freeze'][(Math.random() * 3) | 0], v: 0 });
    if (e.elite) { R.gems.push({ x: e.x, y: e.y, kind: 'zip', v: 0 }); R.gems.push({ x: e.x + 12, y: e.y + 6, kind: 'bigcoin', v: 10 }); }
    if (e.d.split) for (let i = 0; i < e.d.split[1]; i++) { const a = i * TAU / e.d.split[1]; makeEnemy(e.d.split[0], e.x + Math.cos(a) * 16, e.y + Math.sin(a) * 16); }
    if (e.boss) {
      R.st.bosses++;
      R.shake = 0.6;
      C.Audio.sfx('boom');
      for (let i = 0; i < 14; i++) dropGem(e.x + rnd(-50, 50), e.y + rnd(-50, 50), e.xp * (1 + m * 0.18) / 2);
      R.gems.push({ x: e.x, y: e.y, kind: 'zip', v: 0, big: true });
      for (let i = 0; i < 4; i++) R.gems.push({ x: e.x + rnd(-30, 30), y: e.y + rnd(-30, 30), kind: 'bigcoin', v: 10 });
      if (e.segs) e.segs.forEach(s => { s.dead = true; burst(s.x, s.y, ['#3db82a', '#145c10'], 8); });
      if (R.boss === e) R.boss = null;
      C.Audio.music('game');
      if (e === R.finalBoss) { R.won = true; R.winT = 2.5; C.RunUI.banner('Scan complete: threat removed!', 3); C.Audio.sfx('victory'); }
    }
  }

  function burst(x, y, cols, n) {
    if (R.parts.length > 500) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = rnd(40, 160);
      R.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: rnd(0.3, 0.6), col: cols[i % cols.length], s: rnd(2, 4) });
    }
  }

  /* ================= pickups ================= */
  function gemKind(v) { return v < 3 ? 'gem_b' : v < 12 ? 'gem_g' : 'gem_p'; }
  function dropGem(x, y, v) {
    let n = 0; for (const g of R.gems) if (g.kind === 'xp') n++;
    if (n >= MAX_GEMS) {
      // merge into the farthest gem so the floor doesn't fill up
      let far = null, fd = -1;
      for (const g of R.gems) if (g.kind === 'xp') { const d = dist2(g.x, g.y, R.p.x, R.p.y); if (d > fd) { fd = d; far = g; } }
      if (far) { far.v += v; far.spr = gemKind(far.v); return; }
    }
    R.gems.push({ x, y, kind: 'xp', v, spr: gemKind(v) });
  }
  function dropProp(x, y) {
    const r = Math.random() * 100;
    let kind = 'coin', v = 1;
    if (r < 30) { kind = 'coin'; v = 1; }
    else if (r < 45) { kind = 'bigcoin'; v = 10; }
    else if (r < 70) kind = 'patch';
    else if (r < 80) kind = 'defrag';
    else if (r < 88) kind = 'freeze';
    else if (r < 95) kind = 'format';
    else { kind = 'xp'; v = 8; }
    if (kind === 'xp') dropGem(x, y, v); else R.gems.push({ x, y, kind, v });
  }
  function heal(v) {
    const before = R.p.hp;
    R.p.hp = Math.min(R.S.maxHpFinal, R.p.hp + v);
    R.st.healed += R.p.hp - before;
  }
  function collect(g) {
    const P = R.p;
    switch (g.kind) {
      case 'xp': {
        R.xp += g.v * R.S.growth;
        while (R.xp >= R.xpNext) { R.xp -= R.xpNext; R.level++; R.xpNext = xpFor(R.level); R.pendingLevels++; }
        C.Audio.sfx('xp', { p: Math.min(20, (R.xp / R.xpNext) * 20) });
        break;
      }
      case 'coin': case 'bigcoin': R.credits += g.v * R.S.greed; C.Audio.sfx('coin'); R.texts.push({ x: P.x, y: P.y - 16, t: 0, s: '+' + Math.round(g.v * R.S.greed) + ' cr', col: '#c58a00' }); break;
      case 'patch': heal(30); C.Audio.sfx('heal'); R.texts.push({ x: P.x, y: P.y - 16, t: 0, s: 'Patched +30', col: '#2fb84f' }); break;
      case 'defrag': for (const o of R.gems) if (o.kind === 'xp') o.mag = true; C.Audio.sfx('ding'); C.RunUI.banner('Defragmenting... all data collected'); break;
      case 'freeze': R.freeze = 8; C.Audio.sfx('freeze'); C.RunUI.banner('End Task: threats not responding'); break;
      case 'format': {
        R.st.formats++;
        const v = R.view; R.shake = 0.5;
        for (const e of R.enemies) if (!e.dead && !e.boss && !e.link && !e.prop && e.x > v.x0 - 40 && e.x < v.x1 + 40 && e.y > v.y0 - 40 && e.y < v.y1 + 40) kill(e, 'format');
        R.addFx({ life: 0.5, screen: true, draw(f, x) { x.globalAlpha = 0.8 * (1 - f.t / f.life); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.globalAlpha = 1; } });
        C.Audio.sfx('boom'); C.RunUI.banner('Format complete.');
        break;
      }
      case 'zip': openZip(g.big); break;
    }
  }
  function updatePickups(dt) {
    const P = R.p, magR = 42 * R.S.magnet;
    for (const g of R.gems) {
      if (g.dead) continue;
      const dx = P.x - g.x, dy = P.y - g.y, d = Math.hypot(dx, dy) || 1;
      const magnetic = g.kind === 'xp' || g.kind === 'coin' || g.kind === 'bigcoin';
      if (magnetic && d < magR) g.mag = true;
      if (g.mag) {
        g.sp = Math.min(900, (g.sp || 140) + dt * 900);
        const step = Math.min(d, g.sp * dt);
        g.x += dx / d * step; g.y += dy / d * step;
      }
      if (d < P.r + 10) { g.dead = true; collect(g); if (pauses.has('zip')) break; }
    }
    if (R.gems.some(g => g.dead)) R.gems = R.gems.filter(g => !g.dead);
  }

  /* ================= world chunks: props + corrupted sectors ================= */
  function hash(i, j, s) { let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function updateChunks() {
    const ci = Math.floor(R.p.x / CHUNK), cj = Math.floor(R.p.y / CHUNK);
    const b = R.drive.bounded ? R.drive.bounded / 2 : 0;
    for (let i = ci - 2; i <= ci + 2; i++) for (let j = cj - 2; j <= cj + 2; j++) {
      const key = i + ',' + j;
      if (R.chunks.has(key)) continue;
      if (b && (i * CHUNK > b || (i + 1) * CHUNK < -b || j * CHUNK > b || (j + 1) * CHUNK < -b)) { R.chunks.set(key, { sectors: [], props: [] }); continue; }
      const ch = { sectors: [], props: [] };
      const ns = Math.floor(hash(i, j, 1) * 2.2 * R.drive.sector);
      for (let k = 0; k < ns; k++) {
        const x = (i + 0.15 + hash(i, j, 10 + k) * 0.7) * CHUNK, y = (j + 0.15 + hash(i, j, 20 + k) * 0.7) * CHUNK;
        if (Math.hypot(x, y) < 180) continue;
        if (b && (Math.abs(x) > b - 60 || Math.abs(y) > b - 60)) continue;
        ch.sectors.push({ x, y, r: 55 + hash(i, j, 30 + k) * 70, v: Math.floor(hash(i, j, 40 + k) * 4), rot: Math.floor(hash(i, j, 50 + k) * 4) });
      }
      const np = Math.floor(hash(i, j, 2) * 2.6);
      for (let k = 0; k < np; k++) {
        const pk = key + ':' + k;
        if (R.destroyed.has(pk)) continue;
        const x = (i + hash(i, j, 60 + k)) * CHUNK, y = (j + hash(i, j, 70 + k)) * CHUNK;
        if (b && (Math.abs(x) > b - 30 || Math.abs(y) > b - 30)) continue;
        const e = { id: R.nextId++, type: 'prop', d: C.ENEMIES.prop, prop: true, x, y, hp: 1, maxHp: 1, r: 11, dmg: 0, kx: 0, ky: 0, flash: 0, spr: ['prop_folder', 'prop_page', 'prop_exe'][Math.floor(hash(i, j, 80 + k) * 3)], sc: 1, chunkKey: pk, kbRes: 1 };
        R.enemies.push(e); ch.props.push(e);
      }
      R.chunks.set(key, ch);
    }
    // forget far chunks (props get rebuilt next visit unless destroyed)
    if (R.chunks.size > 60) {
      for (const [key, ch] of R.chunks) {
        const [i, j] = key.split(',').map(Number);
        if (Math.abs(i - ci) > 3 || Math.abs(j - cj) > 3) { ch.props.forEach(p => { p.dead = true; }); R.chunks.delete(key); }
      }
    }
  }
  function inSector(x, y) {
    const ci = Math.floor(x / CHUNK), cj = Math.floor(y / CHUNK);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const ch = R.chunks.get(i + ',' + j); if (!ch) continue;
      for (const s of ch.sectors) if (dist2(x, y, s.x, s.y) < s.r * s.r * 0.6) return true;
    }
    return false;
  }

  /* ================= player ================= */
  function updatePlayer(dt) {
    const P = R.p, S = R.S;
    let mx = 0, my = 0;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    if (keys.KeyW || keys.ArrowUp) my -= 1;
    if (keys.KeyS || keys.ArrowDown) my += 1;
    if (joy.on) {
      const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy);
      if (d > 6) { const k = Math.min(1, d / 46); mx = dx / d * k; my = dy / d * k; }
    }
    if (G.botMove) { mx = G.botMove.x; my = G.botMove.y; }
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    P.moving = ml > 0.05;
    if (P.moving) { const l = Math.hypot(mx, my); P.fx = mx / l; P.fy = my / l; }
    P.slowed = inSector(P.x, P.y);
    const sp = 128 * S.move * (P.slowed ? 0.62 : 1);
    P.x += mx * sp * dt; P.y += my * sp * dt;
    if (R.drive.bounded) { const b = R.drive.bounded / 2 - P.r; P.x = clamp(P.x, -b, b); P.y = clamp(P.y, -b, b); }
    if (P.inv > 0) P.inv -= dt;
    if (P.hurtT > 0) P.hurtT -= dt;
    if (S.recovery > 0 && P.hp < S.maxHpFinal) heal(S.recovery * dt);
  }
  function hurt(dmg) {
    const P = R.p;
    if (P.inv > 0 || R.won) return;
    const d = Math.max(1, dmg - R.S.armor);
    P.hp -= d; P.inv = 0.45; P.hurtT = 0.25;
    R.st.dmgTaken += d;
    if (C.Save.data.settings.shake) R.shake = Math.max(R.shake, 0.18);
    C.Audio.sfx('hurt');
    if (P.hp <= 0) {
      if (R.revivals > 0) {
        R.revivals--;
        P.hp = R.S.maxHpFinal * 0.5; P.inv = 2.5;
        R.blast(P.x, P.y, 160, 9999, 'restore', '#9fe7ff', 6);
        C.RunUI.banner('System Restore: restored to an earlier point', 2.5);
        C.Audio.sfx('evolve');
      } else {
        P.hp = 0;
        C.Audio.sfx('gameover');
        end('dead');
      }
    }
  }

  /* ================= main update ================= */
  function update(dt) {
    R.time += dt;
    if (R.freeze > 0) R.freeze -= dt;
    if (R.shake > 0) R.shake -= dt;
    updatePlayer(dt);
    computeView();
    updateChunks();
    if (!R.won) spawner(dt);
    updateEnemies(dt);
    rebuildGrid();
    separate();
    // weapons
    for (const w of R.weapons) {
      const b = C.WB[w.id]; if (!b) continue;
      if (b.tick) b.tick(R, w, w.s, dt);
      if (b.fire) { w.t -= dt; if (w.t <= 0) { w.t = w.s.cd; b.fire(R, w, w.s); } }
    }
    updateProjectiles(dt);
    // enemy bullets
    const P = R.p;
    for (const b of R.ebul) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0) { b.dead = true; continue; }
      if (dist2(b.x, b.y, P.x, P.y) < (b.r + P.r - 2) * (b.r + P.r - 2)) { b.dead = true; hurt(b.dmg); if (R.over) return; }
    }
    if (R.ebul.length) R.ebul = R.ebul.filter(b => !b.dead);
    // contact damage
    forNear(P.x, P.y, 60, e => {
      if (e.prop || R.over) return;
      const rr = (e.r * 0.85 + P.r);
      if (dist2(e.x, e.y, P.x, P.y) < rr * rr) hurt(e.dmg);
    });
    if (R.over) return;
    updatePickups(dt);
    // fx / particles / texts
    for (const f of R.fx) { f.t += dt; if (f.t >= f.life) f.dead = true; }
    R.fx = R.fx.filter(f => !f.dead);
    for (const p of R.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; }
    R.parts = R.parts.filter(p => p.t < p.life);
    for (const t of R.texts) t.t += dt;
    R.texts = R.texts.filter(t => t.t < 0.7);
    // cleanup
    if (R.enemies.some(e => e.dead)) R.enemies = R.enemies.filter(e => !e.dead);
    // level ups
    if (R.pendingLevels > 0 && !pauses.size) {
      pauses.add('levelup');
      C.Audio.sfx('levelup');
      C.RunUI.levelUp();
    }
    if (R.won) { R.winT -= dt; if (R.winT <= 0) end('win'); }
  }

  function updateProjectiles(dt) {
    for (const p of R.proj) {
      if (p.dead) continue;
      if (p.delay > 0) { p.delay -= dt; if (p.delay <= 0 && p.vx != null) { p.x = R.p.x; p.y = R.p.y; } continue; }
      if (p.upd) p.upd(p, dt, R);
      if (p.spin) p.rot = (p.rot || 0) + p.spin * dt;
      if (p.life != null) { p.life -= dt; if (p.life <= 0) { p.dead = true; } }
      if (!p.dead && !p.noCollide) {
        if (p.hit) {
          for (const e of R.enemies) {
            if (e.dead || p.hits.has(e.id)) continue;
            if (!p.hit(p, e)) continue;
            p.hits.set(e.id, Infinity);
            const d = Math.hypot(e.x - R.p.x, e.y - R.p.y) || 1;
            damage(e, p.dmg, p.w.id, (e.x - R.p.x) / d * (p.kb || 0), (e.y - R.p.y) / d * (p.kb || 0));
          }
        } else if (p.r > 0) {
          forNear(p.x, p.y, p.r + 40, e => {
            if (p.dead) return;
            const rr = p.r + e.r;
            if (dist2(p.x, p.y, e.x, e.y) > rr * rr) return;
            const nt = p.hits.get(e.id);
            if (nt != null && nt > R.time) return;
            p.hits.set(e.id, p.hitCd === Infinity ? Infinity : R.time + (p.hitCd || 0.5));
            let kx = 0, ky = 0;
            if (p.kb) { const vl = Math.hypot(p.vx || 0, p.vy || 0); if (vl > 1) { kx = p.vx / vl * p.kb; ky = p.vy / vl * p.kb; } else { const d = Math.hypot(e.x - p.x, e.y - p.y) || 1; kx = (e.x - p.x) / d * p.kb; ky = (e.y - p.y) / d * p.kb; } }
            if (p.slow) e.slow = 0.3;
            damage(e, p.dmg, p.w.id, kx, ky);
            if (p.onHit) p.onHit(p, e);
            if (p.pierce !== Infinity) { p.pierce--; if (p.pierce < 0) p.dead = true; }
          });
        }
      }
      if (p.dead && p.onEnd) p.onEnd(p);
    }
    if (R.proj.some(p => p.dead)) R.proj = R.proj.filter(p => !p.dead);
  }

  function computeView() {
    const vw = W / scale, vh = H / scale;
    R.view.x0 = R.p.x - vw / 2; R.view.x1 = R.p.x + vw / 2;
    R.view.y0 = R.p.y - vh / 2; R.view.y1 = R.p.y + vh / 2;
  }

  /* ================= render ================= */
  function render() {
    computeView();
    const v = R.view, P = R.p, dr = R.drive;
    let sx = 0, sy = 0;
    if (R.shake > 0 && C.Save.data.settings.shake) { sx = rnd(-4, 4) * R.shake * 4; sy = rnd(-4, 4) * R.shake * 4; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = dr.bounded ? '#3b3b44' : dr.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (W / 2 - (P.x + sx) * scale), dpr * (H / 2 - (P.y + sy) * scale));

    if (dr.bounded) {
      const b = dr.bounded / 2;
      ctx.fillStyle = dr.bg; ctx.fillRect(-b, -b, b * 2, b * 2);
      ctx.strokeStyle = '#1a1a22'; ctx.lineWidth = 6; ctx.strokeRect(-b - 3, -b - 3, b * 2 + 6, b * 2 + 6);
      ctx.fillStyle = '#6a6a74'; ctx.font = 'bold 26px Tahoma, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('1.44 MB', 0, -b - 24);
    }
    // grid
    const gs = 40;
    ctx.fillStyle = dr.grid;
    const gx0 = Math.floor(v.x0 / gs) * gs, gy0 = Math.floor(v.y0 / gs) * gs;
    for (let x = gx0; x < v.x1 + gs; x += gs) for (let y = gy0; y < v.y1 + gs; y += gs) ctx.fillRect(x - 1, y - 1, 2, 2);

    // sectors
    ctx.imageSmoothingEnabled = false;
    for (const ch of R.chunks.values()) for (const s of ch.sectors) {
      if (s.x + s.r < v.x0 || s.x - s.r > v.x1 || s.y + s.r < v.y0 || s.y - s.r > v.y1) continue;
      ctx.drawImage(sectorTex[s.v], s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
    }
    ctx.imageSmoothingEnabled = true;

    // ground projectiles
    for (const p of R.proj) if (p.ground && !(p.delay > 0)) drawProj(p);
    // pickups
    const tt = R.time;
    for (const g of R.gems) {
      if (g.x < v.x0 - 20 || g.x > v.x1 + 20 || g.y < v.y0 - 20 || g.y > v.y1 + 20) continue;
      const sp = SPR.get(g.kind === 'xp' ? g.spr : g.kind);
      const bob = g.kind === 'xp' ? 0 : Math.sin(tt * 4 + g.x) * 1.5;
      const k = g.big ? 1.5 : 1;
      if (g.kind === 'zip') { ctx.globalAlpha = 0.35 + 0.2 * Math.sin(tt * 6); ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(g.x, g.y, 16 * k, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.drawImage(sp, g.x - sp.w * k / 2, g.y - sp.h * k / 2 + bob, sp.w * k, sp.h * k);
    }
    // enemies
    for (const e of R.enemies) {
      if (e.dead) continue;
      const hr = e.r * 2 + 40;
      if (e.x < v.x0 - hr || e.x > v.x1 + hr || e.y < v.y0 - hr || e.y > v.y1 + hr) continue;
      const sp = e.flash > 0 ? SPR.flash(e.spr) : SPR.get(e.spr);
      let k = e.sc;
      if (e.windup) k *= 1 + Math.sin(R.time * 40) * 0.06;
      const w = sp.w * k, h = sp.h * k;
      if (e.elite || e.boss) { ctx.shadowColor = e.boss ? '#ff2b2b' : '#ffd23f'; ctx.shadowBlur = 12; }
      if (R.freeze > 0 && !e.boss && !e.prop) ctx.globalAlpha = 0.65;
      ctx.drawImage(sp, e.x - w / 2, e.y - h / 2, w, h);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      if (e.slow > 0) { ctx.fillStyle = 'rgba(255,79,163,.35)'; ctx.beginPath(); ctx.arc(e.x, e.y + e.r * 0.6, e.r * 0.8, 0, TAU); ctx.fill(); }
      if (e.windup && e.lock) { ctx.strokeStyle = 'rgba(225,29,72,.5)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.lock[0] * (e.boss ? 330 : 120), e.y + e.lock[1] * (e.boss ? 330 : 120)); ctx.stroke(); ctx.setLineDash([]); }
      if (e.elite) { const bw = e.r * 2; ctx.fillStyle = '#000a'; ctx.fillRect(e.x - bw / 2, e.y - h / 2 - 7, bw, 4); ctx.fillStyle = '#ffd23f'; ctx.fillRect(e.x - bw / 2, e.y - h / 2 - 7, bw * Math.max(0, e.hp / e.maxHp), 4); }
    }
    // air projectiles + weapon visuals
    for (const p of R.proj) if (!p.ground && !(p.delay > 0)) drawProj(p);
    for (const w of R.weapons) { const b = C.WB[w.id]; if (b && b.draw) b.draw(R, w, w.s, ctx); }
    // player
    drawPlayer();
    // enemy bullets
    for (const b of R.ebul) {
      if (b.kind === 'key') { ctx.fillStyle = '#23262c'; ctx.fillRect(b.x - 6, b.y - 6, 12, 12); ctx.fillStyle = '#ff6b6b'; ctx.font = 'bold 9px Tahoma'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.ch, b.x, b.y + 0.5); }
      else if (b.kind === 'bit') { ctx.fillStyle = '#1d3a14'; ctx.font = 'bold 13px Courier New, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.ch, b.x, b.y); }
      else if (b.kind === 'ad') { ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#b07b10'; ctx.lineWidth = 1; ctx.fillRect(b.x - 8, b.y - 5, 16, 10); ctx.strokeRect(b.x - 8, b.y - 5, 16, 10); ctx.fillStyle = '#e11d48'; ctx.font = 'bold 7px Tahoma'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('AD', b.x, b.y + 0.5); }
      else { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0c22a8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.stroke(); }
    }
    // particles
    for (const p of R.parts) { ctx.globalAlpha = 1 - p.t / p.life; ctx.fillStyle = p.col; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
    ctx.globalAlpha = 1;
    for (const f of R.fx) if (!f.screen) f.draw(f, ctx);
    // damage numbers
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const t of R.texts) {
      const k = t.t / 0.7;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = 'bold ' + (t.big ? 14 : 11) + 'px Tahoma, Verdana, sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(t.s, t.x, t.y - k * 18);
      ctx.fillStyle = t.col || (t.big ? '#ffe14d' : '#fff'); ctx.fillText(t.s, t.x, t.y - k * 18);
    }
    ctx.globalAlpha = 1;

    // ---- screen space ----
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const f of R.fx) if (f.screen) f.draw(f, ctx);
    // off-screen markers for zips and bosses
    const mark = (x, y, col, label) => {
      const sxp = (x - v.x0) * scale, syp = (y - v.y0) * scale;
      if (sxp > 0 && sxp < W && syp > 0 && syp < H) return;
      const cx = W / 2, cy = H / 2, a = Math.atan2(syp - cy, sxp - cx);
      const ex = clamp(cx + Math.cos(a) * W, 18, W - 18), ey = clamp(cy + Math.sin(a) * H, 18, H - 18);
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
      ctx.fillStyle = col; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      if (label) { ctx.font = 'bold 10px Tahoma'; ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.fillText(label, clamp(ex - Math.cos(a) * 18, 20, W - 20), clamp(ey - Math.sin(a) * 18, 12, H - 8)); }
    };
    for (const g of R.gems) if (g.kind === 'zip') mark(g.x, g.y, '#ffd23f', '.zip');
    for (const e of R.enemies) if ((e.boss && !e.link) || e.elite) mark(e.x, e.y, e.boss ? '#e11d48' : '#ff9f43', e.boss ? 'BOSS' : '');
    // freeze tint
    if (R.freeze > 0) { ctx.fillStyle = 'rgba(120,190,255,0.12)'; ctx.fillRect(0, 0, W, H); }
    // hurt vignette
    if (P.hurtT > 0 || P.hp < R.S.maxHpFinal * 0.25) {
      const a = P.hurtT > 0 ? 0.35 : 0.15 + 0.08 * Math.sin(R.time * 6);
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(225,29,72,0)'); g.addColorStop(1, 'rgba(225,29,72,' + a + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    // joystick
    if (joy.on) {
      ctx.globalAlpha = 0.35; ctx.strokeStyle = '#1c3f94'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 46, 0, TAU); ctx.stroke();
      const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy), k = d > 46 ? 46 / d : 1;
      ctx.fillStyle = '#3b8cff'; ctx.beginPath(); ctx.arc(joy.ox + dx * k, joy.oy + dy * k, 18, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawProj(p) {
    if (p.draw) { p.draw(p, ctx, R); return; }
    if (!p.spr) return;
    const sp = SPR.get(p.spr), k = p.scale || 1, w = sp.w * k, h = sp.h * k;
    ctx.save(); ctx.translate(p.x, p.y);
    if (p.faceVel) ctx.rotate(Math.atan2(p.vy, p.vx)); else if (p.rot) ctx.rotate(p.rot);
    ctx.drawImage(sp, -w / 2, -h / 2, w, h); ctx.restore();
  }

  function drawPlayer() {
    const P = R.p;
    // pickup range hint
    ctx.globalAlpha = 0.08; ctx.fillStyle = '#3b8cff'; ctx.beginPath(); ctx.arc(P.x, P.y, 42 * R.S.magnet, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    if (P.inv > 0 && Math.floor(R.time * 20) % 2 === 0) ctx.globalAlpha = 0.45;
    const sp = SPR.get('cur_' + R.char);
    ctx.drawImage(sp, P.x - sp.w / 2 + 2, P.y - sp.h / 2 + 2, sp.w, sp.h);
    ctx.globalAlpha = 1;
    if (P.slowed) { ctx.font = 'bold 9px Tahoma'; ctx.fillStyle = '#5a2a5a'; ctx.textAlign = 'center'; ctx.fillText('bad sector', P.x, P.y + 22); }
    // facing tick
    ctx.strokeStyle = 'rgba(28,63,148,.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(P.x, P.y, 20, Math.atan2(P.fy, P.fx) - 0.25, Math.atan2(P.fy, P.fx) + 0.25); ctx.stroke();
  }

  /* ================= HUD (DOM) ================= */
  const $ = id => document.getElementById(id);
  function fmtTime(t) { t = Math.max(0, Math.floor(t)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
  G.fmtTime = fmtTime;
  function updateHud(force) {
    if (!R) return;
    const S = R.S;
    $('hTime').textContent = R.time >= R.drive.dur && R.finalBoss && !R.finalBoss.dead ? 'BOSS' : fmtTime(R.time);
    $('hKills').textContent = R.kills.toLocaleString();
    $('hLevel').textContent = R.level;
    $('hXp').style.width = Math.min(100, R.xp / R.xpNext * 100) + '%';
    $('hCred').textContent = Math.floor(R.credits).toLocaleString();
    $('hHp').textContent = Math.ceil(R.p.hp) + '/' + S.maxHpFinal;
    const hpk = R.p.hp / S.maxHpFinal;
    const hb = $('hHpBar'); hb.style.width = Math.max(0, hpk * 100) + '%'; hb.className = 'bar-fill ' + (hpk < 0.3 ? 'red' : hpk < 0.6 ? 'orange' : 'green');
    const bb = $('bossBar');
    const boss = R.boss && !R.boss.dead ? R.boss : null;
    bb.style.display = boss ? '' : 'none';
    if (boss) { $('bossName').textContent = boss.d.name; $('bossFill').style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%'; }
    if (R.hudDirty || force) {
      R.hudDirty = false;
      const ws = $('hWeapons'); ws.innerHTML = '';
      for (let i = 0; i < 6; i++) {
        const w = R.weapons[i];
        const el = document.createElement('div'); el.className = 'slot' + (w ? '' : ' empty');
        if (w) { const d = C.WEAPONS[w.id]; el.title = d.name; el.innerHTML = '<img src="' + SPR.icon('w_' + w.id) + '" alt=""><b>' + (d.evolved ? '★' : w.lvl) + '</b><i class="cd"></i>'; if (d.evolved) el.classList.add('evo'); }
        ws.appendChild(el);
      }
      const ps = $('hPassives'); ps.innerHTML = '';
      for (let i = 0; i < 6; i++) {
        const id = R.passiveOrder[i];
        const el = document.createElement('div'); el.className = 'slot small' + (id ? '' : ' empty');
        if (id) { el.title = C.PASSIVES[id].name; el.innerHTML = '<img src="' + SPR.icon('p_' + id) + '" alt=""><b>' + R.passives[id] + '</b>'; }
        ps.appendChild(el);
      }
    }
    // cooldown underlines
    const slots = $('hWeapons').children;
    for (let i = 0; i < R.weapons.length; i++) {
      const w = R.weapons[i], cd = slots[i] && slots[i].querySelector('.cd');
      if (!cd) continue;
      let k = 1;
      if (C.WB[w.id] && C.WB[w.id].fire && w.s.cd > 0.2) k = 1 - Math.max(0, w.t) / w.s.cd;
      else if (w.on === false) k = (w.phase || 0) / w.s.cd;
      cd.style.width = (k * 100) + '%';
    }
  }
})(window.CAS);

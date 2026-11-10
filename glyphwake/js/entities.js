// Glyphwake: player, enemies, boss, NPCs, projectiles, particles, pickups, telegraphs.
(function () {
  'use strict';
  const GW = window.GW, ID = GW.ID;
  const V3 = THREE.Vector3;
  const TAU = Math.PI * 2;

  function part(parent, geom, mat, x, y, z, rx, ry, rz) {
    const m = new THREE.Mesh(geom, mat); m.position.set(x || 0, y || 0, z || 0);
    if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
    parent.add(m); return m;
  }
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const shadowGeo = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
  const shadowMat = GW.mat({ id: ID.GROUND, color: 0x000000, unlit: true });
  function shadow(scene, r) { const s = new THREE.Mesh(shadowGeo, shadowMat); s.scale.setScalar(r); scene.add(s); return s; }

  // ---------------- particles ----------------
  function Particles(scene, n, id) {
    this.n = n; this.list = []; this.free = [];
    this.im = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.1, 0), GW.mat({ id, color: 0xffffff, unlit: true }), n);
    this.im.frustumCulled = false;
    this.col = new THREE.Color();
    for (let i = 0; i < n; i++) { this.free.push(i); this.im.setColorAt(i, this.col.setRGB(0, 0, 0)); }
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new V3(); this.s = new V3();
    this.hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) this.im.setMatrixAt(i, this.hide);
    scene.add(this.im);
  }
  Particles.prototype.emit = function (x, y, z, vx, vy, vz, life, size, color, grav, drag) {
    if (!this.free.length) return;
    const i = this.free.pop();
    this.list.push({ i, x, y, z, vx, vy, vz, life, max: life, size, grav: grav === undefined ? -9 : grav, drag: drag || 0, c: new THREE.Color(color) });
  };
  Particles.prototype.burst = function (x, y, z, n, speed, color, life, size, grav, up) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, e = (Math.random() - 0.2) * 1.2, s = speed * (0.4 + Math.random() * 0.8);
      this.emit(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + (up || 0), Math.sin(a) * Math.cos(e) * s, life * (0.6 + Math.random() * 0.6), size, color, grav);
    }
  };
  Particles.prototype.update = function (dt) {
    for (let k = this.list.length - 1; k >= 0; k--) {
      const p = this.list[k];
      p.life -= dt;
      if (p.life <= 0) { this.im.setMatrixAt(p.i, this.hide); this.free.push(p.i); this.list.splice(k, 1); continue; }
      p.vy += p.grav * dt; const d = Math.max(0, 1 - p.drag * dt); p.vx *= d; p.vy *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const gy = GW.World.heightAt(p.x, p.z) + 0.05;
      if (p.y < gy) { p.y = gy; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      const f = p.life / p.max;
      this.m.compose(this.v.set(p.x, p.y, p.z), this.q, this.s.setScalar(p.size * (0.3 + 0.7 * f)));
      this.im.setMatrixAt(p.i, this.m);
      this.im.setColorAt(p.i, this.col.copy(p.c).multiplyScalar(0.3 + 0.9 * f));
    }
    this.im.instanceMatrix.needsUpdate = true; if (this.im.instanceColor) this.im.instanceColor.needsUpdate = true;
  };
  GW.Particles = Particles;

  // ---------------- sword trail ----------------
  function Trail(scene, n) {
    this.n = n; this.pts = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3); this.col = new Float32Array(n * 2 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 2 * 3).fill(0).map((v, i) => i % 3 === 1 ? 1 : 0), 3));
    const idx = []; for (let i = 0; i < n - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, GW.mat({ id: ID.FIRE, color: 0xffffff, vertexColors: true, unlit: true, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; scene.add(this.mesh);
    this.color = new THREE.Color(1, 0.6, 0.2);
  }
  Trail.prototype.push = function (a, b, on) {
    this.pts.unshift({ a: a.clone(), b: b.clone(), age: 0, on });
    if (this.pts.length > this.n) this.pts.pop();
  };
  Trail.prototype.update = function (dt) {
    for (const p of this.pts) p.age += dt;
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[Math.min(i, this.pts.length - 1)];
      for (let s = 0; s < 2; s++) {
        const k = (i * 2 + s) * 3;
        if (!p) { this.pos[k] = this.pos[k + 1] = this.pos[k + 2] = 0; this.col[k] = this.col[k + 1] = this.col[k + 2] = 0; continue; }
        const v = s ? p.b : p.a;
        this.pos[k] = v.x; this.pos[k + 1] = v.y; this.pos[k + 2] = v.z;
        const f = p.on ? Math.max(0, 1 - p.age / 0.18) * (1 - i / this.n) : 0;
        this.col[k] = this.color.r * f * (s ? 1.3 : 0.4); this.col[k + 1] = this.color.g * f * (s ? 1.3 : 0.4); this.col[k + 2] = this.color.b * f * (s ? 1.3 : 0.4);
      }
    }
    const g = this.mesh.geometry; g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  };

  // ---------------- telegraphs ----------------
  const teleMat = () => GW.mat({ id: ID.FIRE, color: 0x000000, emissive: 0x6a0e06, unlit: true, side: THREE.DoubleSide });
  function Telegraph(scene, o) {
    this.o = o; this.t = 0; this.dur = o.dur; this.done = false;
    const grp = this.grp = new THREE.Group(); scene.add(grp);
    const y = GW.World.groundY(o.x, o.z) + 0.08;
    grp.position.set(o.x, y, o.z); grp.rotation.y = o.yaw || 0;
    const mOuter = teleMat(); mOuter.uniforms.uEmissive.value.setRGB(0.9, 0.12, 0.05);
    const mFill = teleMat();
    this.mats = [mOuter, mFill];
    if (o.shape === 'circle') {
      part(grp, new THREE.RingGeometry(o.r - 0.18, o.r, 48).rotateX(-Math.PI / 2), mOuter);
      this.fill = part(grp, new THREE.CircleGeometry(o.r, 40).rotateX(-Math.PI / 2), mFill);
    } else if (o.shape === 'cone') {
      const g = new THREE.CircleGeometry(o.r, 24, Math.PI / 2 - o.half, o.half * 2).rotateX(-Math.PI / 2);
      g.scale(1, 1, -1);
      part(grp, new THREE.RingGeometry(o.r - 0.18, o.r, 24, 1, Math.PI / 2 - o.half, o.half * 2).rotateX(-Math.PI / 2).scale(1, 1, -1), mOuter);
      this.fill = part(grp, g, mFill);
    } else if (o.shape === 'line') {
      const g = new THREE.PlaneGeometry(o.w, o.len).rotateX(-Math.PI / 2).translate(0, 0, o.len / 2);
      part(grp, new THREE.PlaneGeometry(o.w + 0.3, o.len).rotateX(-Math.PI / 2).translate(0, -0.01, o.len / 2), mOuter);
      this.mats[0].uniforms.uEmissive.value.setRGB(0.35, 0.05, 0.02);
      this.fill = part(grp, g, mFill);
    }
    this.fill.scale.setScalar(0.01);
  }
  Telegraph.prototype.update = function (dt) {
    this.t += dt;
    const k = Math.min(1, this.t / this.dur);
    if (this.o.shape === 'line') this.fill.scale.set(1, 1, Math.max(0.01, k));
    else this.fill.scale.setScalar(Math.max(0.01, k));
    this.mats[1].uniforms.uEmissive.value.setRGB(0.25 + 0.6 * k * k, 0.04 + 0.1 * k, 0.02);
    if (this.o.follow) { const f = this.o.follow; this.grp.position.set(f.pos.x, GW.World.groundY(f.pos.x, f.pos.z) + 0.08, f.pos.z); if (this.o.followYaw) this.grp.rotation.y = f.yaw; }
    if (this.t >= this.dur + (this.o.linger || 0.08)) { this.done = true; this.grp.parent.remove(this.grp); }
  };
  GW.Telegraph = Telegraph;

  // ======================================================================
  // PLAYER
  // ======================================================================
  const COMBO = [
    { dur: 0.42, h0: 0.09, h1: 0.22, arc: 'h', a0: -1.7, a1: 1.5, dmg: 1.0, range: 2.8, cone: 1.95, step: 2.6, st: 11 },
    { dur: 0.42, h0: 0.09, h1: 0.22, arc: 'h', a0: 1.6, a1: -1.6, dmg: 1.1, range: 2.8, cone: 1.95, step: 2.6, st: 11 },
    { dur: 0.62, h0: 0.22, h1: 0.32, arc: 'v', a0: -1.5, a1: 0.7, dmg: 1.9, range: 3.2, cone: 0.8, step: 4.2, st: 17, heavy: true },
  ];
  const SKILLS = {
    s2: { name: 'Whirl', glyph: '◎', cd: 5, fo: 28, desc: 'spin and strike everything around you, twice' },
    s3: { name: 'Lunge', glyph: '»', cd: 6, fo: 20, desc: 'dash through enemies; invulnerable while dashing' },
    s4: { name: 'Glyphburst', glyph: '✶', cd: 3, fo: 32, desc: 'hurl a burst of rune-fire that explodes on impact' },
  };
  GW.SKILLS = SKILLS;

  function Player(scene) {
    this.scene = scene;
    this.pos = new V3(); this.vel = new V3(); this.yaw = Math.PI; this.visYaw = Math.PI;
    this.level = 1; this.xp = 0;
    this.maxHp = 100; this.hp = 100; this.st = 100; this.fo = 60; this.stDelay = 0;
    this.flasks = 3; this.maxFlasks = 3;
    this.state = 'move'; this.t = 0; this.combo = 0; this.queued = null; this.iframe = 0;
    this.cd = { s2: 0, s3: 0, s4: 0 };
    this.weapon = { metal: 'iron', runes: [null, null, null] };
    this.gear = Object.assign({}, GW.Knight.DEFAULT);
    this.inv = { runes: {}, ingots: {}, armor: { greathelm: 1, knightplate: 1, crimson: 1 } };
    this.hitSet = new Set(); this.walkPhase = 0; this.hurtT = 0; this.healT = 0;
    this.buildModel(scene);
    this.trail = new Trail(scene, 16);
    this.shadow = shadow(scene, 0.5);
    this.light = GW.World.lights.add(0, 2, 0, new THREE.Color(0.95, 0.9, 0.85), 10, 0);
    this.recalc();
  }
  Player.prototype.buildModel = function (scene) {
    const g = this.model = new THREE.Group(); scene.add(g);
    this.body = new THREE.Group(); g.add(this.body);
    this.swordMats = { blade: GW.mat({ id: ID.METAL, color: 0xb8c0cc, rim: 1.0 }), hilt: GW.mat({ id: ID.LEATHER, color: 0x4a3020 }), guard: GW.mat({ id: ID.METAL, color: 0xc8a050, rim: 0.6 }) };
    GW.Knight.dress(this);
  };
  Player.prototype.recalc = function () {
    const s = GW.Forge.weaponStats(this.weapon, this.level);
    this.ws = s;
    const gs = this.gs = GW.Knight.stats(this.gear);
    s.crit += gs.crit; s.focusRegen *= 1 + gs.focus;
    this.moveMul = 1 + gs.move; this.stMul = 1 + gs.stam;
    const vig = (s.vigor || 0) + gs.hp;
    const old = this.maxHp;
    this.maxHp = Math.round(100 + (this.level - 1) * 12 + vig);
    if (this.maxHp > old) this.hp += this.maxHp - old;
    this.hp = Math.min(this.hp, this.maxHp);
    const m = GW.Forge.METALS[this.weapon.metal];
    this.swordMats.blade.uniforms.uColor.value.set(m.color);
    this.swordMats.blade.uniforms.uEmissive.value.set(s.glow).multiplyScalar(0.25);
    this.trail.color.set(s.trail);
  };
  Player.prototype.need = function () { return Math.round(80 * Math.pow(this.level, 1.6)); };
  Player.prototype.place = function (x, z) { this.pos.set(x, GW.World.groundY(x, z), z); this.vel.set(0, 0, 0); };
  Player.prototype.fwd = function () { return new V3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); };

  Player.prototype.update = function (dt, input, G) {
    const W = GW.World;
    this.t += dt;
    for (const k in this.cd) this.cd[k] = Math.max(0, this.cd[k] - dt);
    this.iframe = Math.max(0, this.iframe - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.state === 'dead') { this.animate(dt); return; }
    // regen
    this.stDelay -= dt;
    if (this.stDelay <= 0 && this.state !== 'roll') this.st = Math.min(100, this.st + 38 * (this.stMul || 1) * dt);
    this.fo = Math.min(100, this.fo + dt * 4.5 * (this.ws.focusRegen || 1));
    if (this.healT > 0) { const h = Math.min(this.healT, dt * 1.6) * this.maxHp * 0.45 / 0.6; this.healT -= dt * 1.6; this.hp = Math.min(this.maxHp, this.hp + h); }

    const mv = new V3(input.mx, 0, input.mz);
    const ml = Math.min(1, mv.length()); if (ml > 0.01) mv.normalize();
    this._mv = ml > 0.1 && this.state === 'move';
    const wading = W.inWater(this.pos.x, this.pos.z);
    let speed = 6.2 * (this.moveMul || 1) * (wading ? 0.55 : 1);
    const canAct = this.state === 'move' || (this.state === 'attack' && this.t > this.cur.dur * 0.62) || (this.state === 'skill' && this.t > this.cur.dur * 0.85);

    // buffer inputs
    if (input.attack) this.queued = 'attack';
    if (input.roll) this.queued = 'roll';
    for (const k of ['s2', 's3', 's4']) if (input[k]) this.queued = k;
    if (input.potion) this.queued = 'potion';

    const faceTarget = () => {
      let tgt = null;
      if (input.aim) tgt = Math.atan2(input.aim.x - this.pos.x, input.aim.z - this.pos.z);
      else {
        const pref = ml > 0.1 ? Math.atan2(mv.x, mv.z) : this.yaw;
        let best = null, bd = 1e9;
        for (const e of G.enemies) {
          if (!e.alive) continue;
          const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz);
          if (d > 7.5) continue;
          const a = Math.atan2(dx, dz), ad = Math.abs(GW.angDiff(pref, a));
          const score = d + ad * 2.5;
          if (score < bd && (ml < 0.1 || ad < 1.8)) { bd = score; best = a; }
        }
        tgt = best !== null ? best : pref;
      }
      this.yaw = tgt;
    };

    if (this.queued && canAct) {
      const q = this.queued;
      if (q === 'roll' && this.st >= 15) {
        this.queued = null; this.state = 'roll'; this.t = 0; this.cur = { dur: 0.48 };
        this.rollDir = ml > 0.1 ? Math.atan2(mv.x, mv.z) : this.yaw; this.yaw = this.rollDir;
        this.st -= 24; this.stDelay = 0.7; this.iframe = 0.36; GWAudio.sfx('roll');
        G.parts.dust.burst(this.pos.x, this.pos.y + 0.2, this.pos.z, 8, 2, 0x6a6458, 0.5, 1.2, 0);
      } else if (q === 'attack' && this.st > 4) {
        this.queued = null;
        const next = this.state === 'attack' ? (this.combo + 1) % 3 : 0;
        this.combo = next; this.cur = Object.assign({}, COMBO[next]);
        this.cur.dur /= this.ws.speed; this.cur.h0 /= this.ws.speed; this.cur.h1 /= this.ws.speed;
        this.state = 'attack'; this.t = 0; this.hitSet.clear();
        faceTarget();
        this.st -= this.cur.st; this.stDelay = 0.6;
        GWAudio.sfx(this.cur.heavy ? 'heavy' : 'swing');
      } else if (SKILLS[q]) {
        const sk = SKILLS[q];
        if (this.cd[q] > 0 || this.fo < sk.fo) { this.queued = null; if (this.fo < sk.fo) G.ui.toast('Not enough focus', 0.9); }
        else {
          this.queued = null; this.fo -= sk.fo; this.cd[q] = sk.cd; this.state = 'skill'; this.t = 0; this.hitSet.clear(); this.skill = q;
          faceTarget();
          if (q === 's2') { this.cur = { dur: 0.72 }; GWAudio.sfx('heavy'); }
          if (q === 's3') { this.cur = { dur: 0.34 }; this.iframe = 0.36; GWAudio.sfx('roll'); GWAudio.sfx('swing', 1.4); }
          if (q === 's4') { this.cur = { dur: 0.36 }; this.fired = false; GWAudio.sfx('cast'); }
        }
      } else if (q === 'potion') {
        this.queued = null;
        if (this.flasks > 0 && this.hp < this.maxHp) { this.flasks--; this.state = 'potion'; this.t = 0; this.cur = { dur: 0.7 }; GWAudio.sfx('potion'); }
        else if (this.flasks <= 0) G.ui.toast('Flask is empty: rest at a campfire', 1.4);
      } else if (this.state === 'move') this.queued = null;
    }
    if (this.queued && this.t > 0.6 && this.state === 'move') this.queued = null;

    let vx = 0, vz = 0;
    switch (this.state) {
      case 'move': {
        vx = mv.x * speed * ml; vz = mv.z * speed * ml;
        if (ml > 0.1) {
          if (input.aim && input.aimHeld) this.yaw = Math.atan2(input.aim.x - this.pos.x, input.aim.z - this.pos.z);
          else this.yaw = Math.atan2(mv.x, mv.z);
          this.walkPhase += dt * 9 * ml * (wading ? 0.6 : 1);
          if (Math.floor(this.walkPhase / Math.PI) !== this._lastStep) { this._lastStep = Math.floor(this.walkPhase / Math.PI); GWAudio.sfx('step', wading ? 2.5 : 1); if (wading) G.parts.dust.burst(this.pos.x, this.pos.y + 0.1, this.pos.z, 3, 2, 0x9ab8ff, 0.4, 0.9, -6, 2); }
        }
        break;
      }
      case 'attack': {
        const c = this.cur, k = this.t / c.dur;
        const stepT = Math.max(0, 1 - this.t / (c.dur * 0.45));
        vx = Math.sin(this.yaw) * c.step * stepT * 1.6 + mv.x * speed * 0.15; vz = Math.cos(this.yaw) * c.step * stepT * 1.6 + mv.z * speed * 0.15;
        if (this.t >= c.h0 && this.t <= c.h1) this.meleeHits(G, c.range, c.cone, c.dmg, c.heavy);
        if (this.t >= c.dur) { this.state = 'move'; this.t = 0; }
        break;
      }
      case 'roll': {
        const k = this.t / this.cur.dur, sp = 13 * (1 - k * 0.75) * (wading ? 0.7 : 1);
        vx = Math.sin(this.rollDir) * sp; vz = Math.cos(this.rollDir) * sp;
        if (this.t >= this.cur.dur) { this.state = 'move'; this.t = 0; }
        break;
      }
      case 'skill': {
        const k = this.t / this.cur.dur;
        if (this.skill === 's2') {
          vx = mv.x * speed * 0.45; vz = mv.z * speed * 0.45;
          if ((this.t > 0.16 && this.t < 0.3) || (this.t > 0.44 && this.t < 0.58)) {
            if (this.t > 0.44 && !this._wh2) { this.hitSet.clear(); this._wh2 = true; GWAudio.sfx('swing', 1.3); }
            this.meleeHits(G, 3.6, Math.PI, 1.35, true);
          }
        } else if (this.skill === 's3') {
          const sp = 30 * (1 - k * 0.7);
          vx = Math.sin(this.yaw) * sp; vz = Math.cos(this.yaw) * sp;
          this.meleeHits(G, 2.2, Math.PI, 2.1, true);
          if (Math.random() < 0.8) G.parts.spark.emit(this.pos.x, this.pos.y + 1, this.pos.z, 0, 0.5, 0, 0.3, 1.2, this.trail.color.getHex(), 0);
        } else if (this.skill === 's4') {
          if (this.t > 0.14 && !this.fired) {
            this.fired = true;
            const f = this.fwd();
            G.spawnProjectile({ from: 'player', x: this.pos.x + f.x * 1.1, y: this.pos.y + 1.3, z: this.pos.z + f.z * 1.1, vx: f.x * 19, vz: f.z * 19, r: 0.55, dmg: this.ws.dmg * 2.2, color: this.ws.trail, aoe: 3.0, life: 1.2 });
          }
        }
        if (this.t >= this.cur.dur) { this.state = 'move'; this.t = 0; this._wh2 = false; }
        break;
      }
      case 'potion': {
        vx = mv.x * speed * 0.35; vz = mv.z * speed * 0.35;
        if (this.t > 0.3 && !this._drank) { this._drank = true; this.healT = 0.6; G.parts.spark.burst(this.pos.x, this.pos.y + 1, this.pos.z, 14, 2, 0xff6a5a, 0.8, 1, 1.5, 1); }
        if (this.t >= this.cur.dur) { this.state = 'move'; this.t = 0; this._drank = false; }
        break;
      }
      case 'hurt': {
        vx = this.vel.x; vz = this.vel.z; this.vel.multiplyScalar(Math.max(0, 1 - dt * 8));
        if (this.t > 0.28) { this.state = 'move'; this.t = 0; }
        break;
      }
    }
    // integrate + collide
    this.pos.x += vx * dt; this.pos.z += vz * dt;
    W.collide(this.pos, 0.35);
    for (const e of G.enemies) {
      if (!e.alive) continue;
      const dx = this.pos.x - e.pos.x, dz = this.pos.z - e.pos.z, rr = 0.45 + e.radius, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-5) { const d = Math.sqrt(d2), k = (rr - d) / d * (this.state === 'roll' || this.state === 'skill' ? 0.0 : 0.6); this.pos.x += dx * k; this.pos.z += dz * k; }
    }
    if (G.arenaLock) {
      const A = W.L.arena, dx = this.pos.x - A.x, dz = this.pos.z - A.z, d = Math.hypot(dx, dz);
      if (d > 17.5) { this.pos.x = A.x + dx / d * 17.5; this.pos.z = A.z + dz / d * 17.5; }
    }
    const gy = W.groundY(this.pos.x, this.pos.z);
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 18);
    this.animate(dt);
    // trail
    const tip = new V3(), base = new V3();
    this.tipObj.getWorldPosition(tip); this.baseObj.getWorldPosition(base);
    const on = this.state === 'attack' || (this.state === 'skill' && this.skill !== 's4');
    this.trail.push(base, tip, on);
    this.trail.update(dt);
    if (on && Math.random() < 0.5 && this.ws.trailParticles) G.parts.spark.emit(tip.x, tip.y, tip.z, (Math.random() - 0.5), 1, (Math.random() - 0.5), 0.45, 0.9, this.ws.trail, -1);
    this.light.p.set(this.pos.x, this.pos.y + 2.2, this.pos.z);
    this.shadow.position.set(this.pos.x, gy + 0.03, this.pos.z);
    // grass push
    G.pushGrass(0, this.pos.x, this.pos.z, 1.1);
  };

  Player.prototype.meleeHits = function (G, range, cone, mult, heavy) {
    for (const e of G.enemies) {
      if (!e.alive || this.hitSet.has(e)) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > range + e.radius) continue;
      const a = Math.atan2(dx, dz);
      if (Math.abs(GW.angDiff(this.yaw, a)) > cone && d > e.radius + 0.4) continue;
      this.hitSet.add(e);
      G.hitEnemy(e, this.ws.dmg * mult, { heavy, from: this.pos, melee: true });
    }
  };

  Player.prototype.animate = function (dt) {
    const m = this.model, b = this.body, sw = this.swing;
    m.position.copy(this.pos);
    this.visYaw += GW.angDiff(this.visYaw, this.yaw) * Math.min(1, dt * (this.state === 'move' ? 14 : 30));
    m.rotation.y = this.visYaw;
    b.rotation.set(0, 0, 0); b.position.set(0, 0, 0);
    const walk = Math.sin(this.walkPhase);
    let legA = 0, sx = 0.9, sy = -0.55, sz = 0;
    this.armL.rotation.set(0, 0, 0);
    switch (this.state) {
      case 'move': {
        const mv = this._mv ? 1 : 0;
        legA = walk * 0.6 * mv;
        b.position.y = Math.abs(Math.cos(this.walkPhase)) * 0.06 * mv;
        this.armL.rotation.x = -walk * 0.5 * mv;
        sx = 0.95 + Math.sin(this.t * 2) * 0.03; sy = -0.5;
        break;
      }
      case 'attack': {
        const c = this.cur, k = GW.clamp(this.t / (c.h1 + 0.05), 0, 1), e = 1 - Math.pow(1 - k, 3);
        if (c.arc === 'h') { sx = 0.1; sy = GW.lerp(c.a0, c.a1, e); b.rotation.y = GW.lerp(-0.4, 0.4, e) * Math.sign(c.a1 - c.a0); }
        else { sy = 0; sx = GW.lerp(c.a0, c.a1, e); b.rotation.x = GW.lerp(-0.15, 0.3, e); }
        legA = 0.35;
        break;
      }
      case 'roll': {
        const k = this.t / this.cur.dur;
        b.position.y = 0.8 - Math.abs(Math.cos(k * Math.PI)) * 0.8 + 0.1;
        b.position.y = 0.55 * Math.sin(k * Math.PI);
        b.rotation.x = k * TAU;
        b.position.y += -0.5 * Math.sin(k * Math.PI);
        legA = 0.9; sx = 1.3;
        break;
      }
      case 'skill': {
        if (this.skill === 's2') { const k = this.t / this.cur.dur; b.rotation.y = -E3(k) * TAU * 2; sy = -1.5; sx = 0.05; }
        else if (this.skill === 's3') { sx = 0.0; sy = 0.0; b.rotation.x = 0.35; legA = 0.8; }
        else { sx = -1.2; sy = 0; this.armL.rotation.x = -1.6; }
        break;
      }
      case 'potion': { this.armL.rotation.x = -2.2; this.armL.rotation.z = 0.6; break; }
      case 'hurt': { b.rotation.x = -0.25; break; }
      case 'dead': { b.rotation.x = Math.min(1.5, b.rotation.x + 0) ; b.rotation.x = -1.45; b.position.y = 0.25; break; }
    }
    this.legL.rotation.x = legA; this.legR.rotation.x = -legA;
    this.shinL.rotation.x = Math.max(0, legA) * 1.2 + (this.state === 'roll' ? 1.4 : 0); this.shinR.rotation.x = Math.max(0, -legA) * 1.2 + (this.state === 'roll' ? 1.4 : 0);
    sw.rotation.set(sx, sy, sz, 'YXZ');
    if (this.cloak) this.cloak.rotation.x = -0.12 - Math.min(0.5, Math.abs(walk) * 0.15) - (this.state === 'roll' ? 0.5 : 0) - (this._mv ? 0.12 : 0);
    if (this.plume) this.plume.rotation.x = Math.sin(this.t * 3) * 0.08 - (this._mv ? 0.25 : 0);
    if (this.tabard) this.tabard.rotation.x = -legA * 0.25;
    const fl = this.hurtT > 0 ? this.hurtT * 3 : 0;
    for (const mt of this.mats) mt.uniforms.uFlash.value = fl;
  };
  function E3(k) { return 1 - Math.pow(1 - k, 2.2); }
  GW.Player = Player;

  // ======================================================================
  // ENEMIES
  // ======================================================================
  const TYPES = {};
  function Enemy(scene, type, x, z, home) {
    const T = TYPES[type];
    this.type = type; this.T = T; this.scene = scene;
    this.pos = new V3(x, GW.World.heightAt(x, z), z); this.home = home || { x, z };
    this.spawn = { x, z };
    this.vel = new V3(); this.kb = new V3(); this.yaw = Math.random() * TAU;
    this.maxHp = T.hp; this.hp = T.hp; this.radius = T.radius; this.alive = true;
    this.state = 'idle'; this.t = Math.random() * 2; this.cool = 1 + Math.random();
    this.flash = 0; this.poise = T.poise; this.status = { burn: 0, burnD: 0, poison: 0, poisonD: 0, slow: 0 }; this.tick = 0;
    this.offset = Math.random() * TAU; this.aggro = false; this.lastHit = -10;
    this.mats = []; this.model = new THREE.Group(); scene.add(this.model);
    T.build(this);
    this.shadow = shadow(scene, T.radius * 1.3);
  }
  Enemy.prototype.mat = function (o) { const m = GW.mat(o); this.mats.push(m); return m; };
  Enemy.prototype.distTo = function (p) { return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); };
  Enemy.prototype.face = function (p, dt, rate) { const a = Math.atan2(p.x - this.pos.x, p.z - this.pos.z); this.yaw += GW.angDiff(this.yaw, a) * Math.min(1, dt * (rate || 8)); };
  Enemy.prototype.setState = function (s) { this.state = s; this.t = 0; this.didHit = false; };
  Enemy.prototype.update = function (dt, G) {
    const W = GW.World, P = G.player;
    this.t += dt; this.flash = Math.max(0, this.flash - dt * 5);
    for (const m of this.mats) m.uniforms.uFlash.value = this.flash * 1.4;
    if (!this.alive) {
      this.deadT += dt;
      const k = Math.min(1, this.deadT / 0.8);
      this.model.position.y = this.pos.y - k * 0.8 * this.T.radius;
      this.model.rotation.z = k * 1.2 * this.dieSide;
      if (this.deadT > 1.2 && this.model.visible) { this.model.visible = false; this.shadow.visible = false; }
      return;
    }
    // status effects
    const s = this.status; s.slow = Math.max(0, s.slow - dt);
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.5;
      if (s.burn > 0) { G.hitEnemy(this, s.burnD, { dot: 'burn' }); s.burn -= 0.5; G.parts.spark.burst(this.pos.x, this.pos.y + 1, this.pos.z, 3, 1.5, 0xff7a2a, 0.5, 0.9, 2, 1); }
      if (s.poison > 0 && this.alive) { G.hitEnemy(this, s.poisonD, { dot: 'poison' }); s.poison -= 0.5; G.parts.spark.burst(this.pos.x, this.pos.y + 1, this.pos.z, 2, 1, 0x7aff5a, 0.6, 0.8, 1, 0.5); }
      if (!this.alive) return;
    }
    this.cool -= dt;
    const slow = s.slow > 0 ? 0.6 : 1;
    const dP = this.distTo(P.pos), dH = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
    if (P.state !== 'dead' && !this.aggro && dP < this.T.aggro && this.state !== 'return') {
      this.aggro = true; G.onAggro(this);
    }
    if (this.aggro && (P.state === 'dead' || dH > this.T.leash || dP > this.T.aggro * 2.2)) { if (!this.T.boss) { this.aggro = false; this.setState('return'); } }
    const ctx = { dt, G, P, dP, slow, W };
    this.T.ai(this, ctx);
    // knockback
    this.pos.x += this.kb.x * dt; this.pos.z += this.kb.z * dt; this.kb.multiplyScalar(Math.max(0, 1 - dt * 9));
    // separation
    for (const o of G.enemies) {
      if (o === this || !o.alive) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, rr = this.radius + o.radius, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-5) { const d = Math.sqrt(d2), k = (rr - d) / d * 0.5; this.pos.x += dx * k; this.pos.z += dz * k; }
    }
    if (!this.T.flying) W.collide(this.pos, this.radius * 0.8);
    const gy = W.groundY(this.pos.x, this.pos.z);
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 15);
    this.model.position.copy(this.pos); this.model.rotation.y = this.yaw;
    this.shadow.position.set(this.pos.x, gy + 0.03, this.pos.z);
    if (this.T.anim) this.T.anim(this, dt, ctx);
    G.pushGrass(1 + (G.enemies.indexOf(this) % 5), this.pos.x, this.pos.z, this.radius * 1.4);
  };
  Enemy.prototype.moveTo = function (tx, tz, speed, dt) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return d;
    const a = Math.atan2(dx, dz);
    this.yaw += GW.angDiff(this.yaw, a) * Math.min(1, dt * 9);
    const s = Math.min(speed * dt, d);
    this.pos.x += dx / d * s; this.pos.z += dz / d * s;
    this.moving = true;
    return d;
  };
  Enemy.prototype.wander = function (ctx, speed) {
    if (this.state === 'return') {
      const d = this.moveTo(this.home.x, this.home.z, speed * 1.4, ctx.dt);
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * ctx.dt * 0.4);
      if (d < 1.5) this.setState('idle');
      return;
    }
    if (this.state === 'idle') {
      this.moving = false;
      if (this.t > 2 + Math.random() * 3) { this.setState('wander'); const a = Math.random() * TAU, r = Math.random() * 7; this.wt = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r }; }
    } else if (this.state === 'wander') {
      const d = this.moveTo(this.wt.x, this.wt.z, speed * 0.35, ctx.dt);
      if (d < 0.5 || this.t > 6) this.setState('idle');
    }
  };
  Enemy.prototype.strike = function (G, range, half, dmg, opts) {
    if (this.didHit) return false;
    const P = G.player, dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d > range + 0.45) return false;
    if (half < Math.PI && Math.abs(GW.angDiff(this.yaw, Math.atan2(dx, dz))) > half) return false;
    this.didHit = true;
    G.hurtPlayer(dmg, this.pos, opts);
    return true;
  };
  GW.Enemy = Enemy; GW.ETYPES = TYPES;

  // ---------------- Husk (training) ----------------
  TYPES.husk = {
    name: 'Straw Husk', hp: 28, radius: 0.5, poise: 0, aggro: 5, leash: 12, xp: 6, dmg: 0, speed: 0, kind: 'husk',
    build(e) {
      const straw = e.mat({ id: ID.WOOD, color: 0x9a8040 }), cloth = e.mat({ id: ID.CLOTH, color: 0x5a4a3a });
      part(e.model, new THREE.CylinderGeometry(0.06, 0.06, 2, 5), straw, 0, 1, 0);
      part(e.model, new THREE.CylinderGeometry(0.3, 0.4, 0.9, 7), cloth, 0, 1.3, 0);
      part(e.model, new THREE.SphereGeometry(0.25, 8, 6), straw, 0, 2.0, 0);
      part(e.model, box(1.4, 0.08, 0.08), straw, 0, 1.55, 0);
    },
    ai(e, c) { e.moving = false; },
    anim(e, dt) { e.model.rotation.z = Math.sin(e.t * 9) * e.flash * 0.3; },
  };

  // ---------------- Thornwolf ----------------
  TYPES.wolf = {
    name: 'Thornwolf', hp: 42, radius: 0.6, poise: 10, aggro: 13, leash: 34, xp: 22, dmg: 10, speed: 7.2, kind: 'beast',
    build(e) {
      const fur = e.mat({ id: ID.BODY, color: 0x6a6a74, rim: 0.4 }), thorn = e.mat({ id: ID.BONE, color: 0xd8d0b8 }), eye = e.mat({ id: ID.FIRE, color: 0, emissive: 0xff3020, unlit: true });
      const b = e.body = new THREE.Group(); e.model.add(b);
      part(b, box(0.55, 0.5, 1.3), fur, 0, 0.75, 0);
      e.head = new THREE.Group(); e.head.position.set(0, 0.95, 0.75); b.add(e.head);
      part(e.head, box(0.4, 0.38, 0.45), fur, 0, 0, 0.1);
      part(e.head, box(0.26, 0.22, 0.35), fur, 0, -0.06, 0.45);
      part(e.head, new THREE.ConeGeometry(0.08, 0.22, 4), fur, 0.13, 0.25, 0.0); part(e.head, new THREE.ConeGeometry(0.08, 0.22, 4), fur, -0.13, 0.25, 0.0);
      part(e.head, box(0.07, 0.05, 0.05), eye, 0.12, 0.06, 0.33); part(e.head, box(0.07, 0.05, 0.05), eye, -0.12, 0.06, 0.33);
      for (let k = 0; k < 5; k++) part(b, new THREE.ConeGeometry(0.07, 0.4, 4), thorn, 0, 1.05, 0.45 - k * 0.22, -0.5, 0, 0);
      e.legs = [];
      [[0.2, 0.45], [-0.2, 0.45], [0.2, -0.45], [-0.2, -0.45]].forEach(([x, z]) => { const l = new THREE.Group(); l.position.set(x, 0.55, z); b.add(l); part(l, box(0.13, 0.55, 0.15), fur, 0, -0.27, 0); e.legs.push(l); });
      e.tail = part(b, box(0.1, 0.1, 0.6), fur, 0, 0.9, -0.85, 0.5, 0, 0);
      e.eyeMat = eye;
    },
    ai(e, c) {
      const { dt, G, P, dP, slow } = c;
      if (!e.aggro) { e.wander(c, TYPES.wolf.speed); return; }
      const sp = TYPES.wolf.speed * slow;
      switch (e.state) {
        case 'windup':
          e.face(P.pos, dt, 10); e.moving = false;
          if (e.t > 0.45) { e.setState('lunge'); const a = e.yaw; e.lv = { x: Math.sin(a) * 15, z: Math.cos(a) * 15 }; GWAudio.sfx('swing', 0.8); }
          break;
        case 'lunge':
          e.pos.x += e.lv.x * dt * slow; e.pos.z += e.lv.z * dt * slow;
          e.strike(G, 1.2, Math.PI, TYPES.wolf.dmg, {});
          if (e.t > 0.26) { e.setState('recover'); e.cool = 1.3 + Math.random() * 1.2; }
          break;
        case 'recover': e.moving = false; if (e.t > 0.5) e.setState('chase'); break;
        case 'stagger': e.moving = false; if (e.t > 0.4) e.setState('chase'); break;
        default: {
          // circle the player at a pack offset, then dart in
          const ring = e.cool > 0 ? 4.2 : 2.0;
          const a = Math.atan2(e.pos.x - P.pos.x, e.pos.z - P.pos.z) + dt * 0.8;
          const tx = P.pos.x + Math.sin(a + e.offset * 0.1) * ring, tz = P.pos.z + Math.cos(a + e.offset * 0.1) * ring;
          e.moveTo(tx, tz, sp, dt); e.face(P.pos, dt, 6);
          if (e.state !== 'chase') e.setState('chase');
          if (e.cool <= 0 && dP < 4.6) { e.setState('windup'); G.parts.spark.burst(e.pos.x, e.pos.y + 1.2, e.pos.z, 4, 1, 0xff3020, 0.3, 0.8, 0); }
        }
      }
    },
    anim(e, dt) {
      const run = e.moving ? 1 : 0; e.ph = (e.ph || 0) + dt * (e.state === 'chase' ? 14 : 7) * (run || 0.0);
      const s = Math.sin(e.ph);
      e.legs[0].rotation.x = s * 0.8 * run; e.legs[3].rotation.x = s * 0.8 * run; e.legs[1].rotation.x = -s * 0.8 * run; e.legs[2].rotation.x = -s * 0.8 * run;
      e.body.rotation.x = e.state === 'windup' ? -0.25 : e.state === 'lunge' ? 0.15 : 0;
      e.body.position.y = e.state === 'windup' ? -0.15 : Math.abs(s) * 0.05 * run;
      e.tail.rotation.y = Math.sin(e.t * 6) * 0.4;
      e.eyeMat.uniforms.uEmissive.value.setRGB(e.state === 'windup' ? 2 : 1, 0.15, 0.1);
    },
  };

  // ---------------- Hollow knight ----------------
  TYPES.hollow = {
    name: 'Hollow', hp: 95, radius: 0.6, poise: 28, aggro: 11, leash: 28, xp: 48, dmg: 16, speed: 3.6, kind: 'undead',
    build(e) {
      const bone = e.mat({ id: ID.BONE, color: 0xc8c0a8, rim: 0.4 }), rust = e.mat({ id: ID.METAL, color: 0x6a5a4a, rim: 0.5 }), eye = e.mat({ id: ID.FIRE, color: 0, emissive: 0x40c0ff, unlit: true });
      const b = e.body = new THREE.Group(); e.model.add(b);
      e.legL = new THREE.Group(); e.legL.position.set(0.17, 0.95, 0); b.add(e.legL); part(e.legL, box(0.12, 0.95, 0.12), bone, 0, -0.47, 0);
      e.legR = new THREE.Group(); e.legR.position.set(-0.17, 0.95, 0); b.add(e.legR); part(e.legR, box(0.12, 0.95, 0.12), bone, 0, -0.47, 0);
      part(b, box(0.6, 0.75, 0.36), rust, 0, 1.35, 0);
      for (let k = 0; k < 3; k++) part(b, box(0.5, 0.05, 0.4), bone, 0, 1.1 + k * 0.18, 0);
      part(b, new THREE.SphereGeometry(0.22, 8, 6), bone, 0, 1.95, 0.03);
      part(b, new THREE.CylinderGeometry(0.25, 0.26, 0.25, 8, 1, true), rust, 0, 2.0, 0);
      part(b, box(0.07, 0.04, 0.04), eye, 0.08, 1.95, 0.2); part(b, box(0.07, 0.04, 0.04), eye, -0.08, 1.95, 0.2);
      e.shield = new THREE.Group(); e.shield.position.set(0.48, 1.35, 0.2); b.add(e.shield);
      part(e.shield, box(0.1, 0.9, 0.7), rust, 0, 0, 0, 0, 0.3, 0);
      e.arm = new THREE.Group(); e.arm.position.set(-0.42, 1.55, 0); b.add(e.arm);
      part(e.arm, box(0.12, 0.12, 0.6), bone, 0, 0, 0.3);
      part(e.arm, box(0.07, 0.03, 1.2), rust, 0, 0, 1.15);
      e.eyeMat = eye;
    },
    ai(e, c) {
      const { dt, G, P, dP, slow } = c;
      if (!e.aggro) { e.wander(c, TYPES.hollow.speed); return; }
      const T = TYPES.hollow;
      switch (e.state) {
        case 'windup': e.face(P.pos, dt, 5); e.moving = false; if (e.t > 0.62) { e.setState('slash'); GWAudio.sfx('swing', 1); } break;
        case 'slash':
          e.pos.x += Math.sin(e.yaw) * dt * 3; e.pos.z += Math.cos(e.yaw) * dt * 3;
          if (e.t > 0.08) e.strike(G, 2.5, 1.2, T.dmg, {});
          if (e.t > 0.32) { if (!e.combo2 && Math.random() < 0.5) { e.combo2 = true; e.setState('windup2'); } else { e.combo2 = false; e.setState('recover'); e.cool = 1.8 + Math.random(); } }
          break;
        case 'windup2': e.face(P.pos, dt, 6); if (e.t > 0.35) { e.setState('slash'); GWAudio.sfx('swing', 1); } break;
        case 'recover': e.moving = false; if (e.t > 0.7) e.setState('chase'); break;
        case 'stagger': e.moving = false; if (e.t > 0.7) e.setState('chase'); break;
        case 'block': e.moving = false; e.face(P.pos, dt, 8); if (e.t > 0.5) e.setState('chase'); break;
        default:
          if (e.state !== 'chase') e.setState('chase');
          if (dP > 2.0) e.moveTo(P.pos.x, P.pos.z, T.speed * slow, dt); else { e.moving = false; e.face(P.pos, dt, 6); }
          if (e.cool <= 0 && dP < 2.9) { e.setState('windup'); }
      }
    },
    anim(e, dt) {
      e.ph = (e.ph || 0) + dt * (e.moving ? 7 : 0);
      const s = Math.sin(e.ph);
      e.legL.rotation.x = s * 0.5; e.legR.rotation.x = -s * 0.5;
      let ax = 0.4, ay = 0;
      if (e.state === 'windup' || e.state === 'windup2') { const k = Math.min(1, e.t / 0.4); ax = -1.6 * k; ay = 0.6 * k; }
      if (e.state === 'slash') { const k = Math.min(1, e.t / 0.18); ax = GW.lerp(-1.6, 0.9, k); ay = GW.lerp(0.6, -0.9, k); }
      e.arm.rotation.set(ax, ay, 0, 'YXZ');
      e.shield.rotation.y = e.state === 'block' ? -0.9 : 0; e.shield.position.z = e.state === 'block' ? 0.45 : 0.2;
      e.body.rotation.x = e.state === 'stagger' ? -0.3 : 0;
      e.eyeMat.uniforms.uEmissive.value.setRGB(0.25, 0.75, 1.0).multiplyScalar(e.state.startsWith('windup') ? 2.2 : 1);
    },
  };

  // ---------------- Wisp ----------------
  TYPES.wisp = {
    name: 'Lantern Wisp', hp: 38, radius: 0.5, poise: 5, aggro: 15, leash: 30, xp: 32, dmg: 13, speed: 4.2, kind: 'undead', flying: true,
    build(e) {
      const core = e.mat({ id: ID.FIRE, color: 0, emissive: 0x9a6aff, unlit: true }), shell = e.mat({ id: ID.RUNE, color: 0, emissive: 0x3a2a8a, unlit: true });
      e.core = part(e.model, new THREE.IcosahedronGeometry(0.32, 1), core, 0, 1.6, 0);
      e.shellM = part(e.model, new THREE.IcosahedronGeometry(0.55, 0), shell, 0, 1.6, 0);
      e.coreMat = core;
      e.light = GW.World.lights.add(e.pos.x, 2, e.pos.z, new THREE.Color(0.5, 0.35, 1.0), 7, 0.4);
    },
    ai(e, c) {
      const { dt, G, P, dP, slow } = c;
      e.light.p.set(e.pos.x, e.pos.y + 1.6, e.pos.z);
      if (!e.aggro) { e.wander(c, 3); return; }
      e.face(P.pos, dt, 6);
      switch (e.state) {
        case 'cast':
          e.moving = false;
          if (e.t > 0.65) {
            const a = Math.atan2(P.pos.x - e.pos.x, P.pos.z - e.pos.z);
            G.spawnProjectile({ from: 'enemy', x: e.pos.x, y: e.pos.y + 1.6, z: e.pos.z, vx: Math.sin(a) * 10.5, vz: Math.cos(a) * 10.5, r: 0.45, dmg: TYPES.wisp.dmg, color: 0xa070ff, life: 2.6, homing: 1.2 });
            GWAudio.sfx('cast'); e.setState('chase'); e.cool = 2.4 + Math.random() * 1.2;
          }
          break;
        case 'stagger': if (e.t > 0.3) e.setState('chase'); break;
        default: {
          if (e.state !== 'chase') e.setState('chase');
          const want = 9;
          const a = Math.atan2(e.pos.x - P.pos.x, e.pos.z - P.pos.z) + (e.offset > Math.PI ? 1 : -1) * dt * 0.5;
          e.moveTo(P.pos.x + Math.sin(a) * want, P.pos.z + Math.cos(a) * want, TYPES.wisp.speed * slow * (dP < 4 ? 1.8 : 1), dt);
          if (dP < 3 && (e.blinkCd || 0) <= 0) { // blink away
            const b = a + (Math.random() - 0.5); e.blinkCd = 4;
            G.parts.spark.burst(e.pos.x, e.pos.y + 1.6, e.pos.z, 14, 4, 0xa070ff, 0.5, 1, 0);
            e.pos.x = P.pos.x + Math.sin(b) * 8; e.pos.z = P.pos.z + Math.cos(b) * 8; GW.World.collide(e.pos, 0.6);
            GWAudio.sfx('zap');
          }
          if (e.cool <= 0 && dP < 15) e.setState('cast');
        }
      }
      e.blinkCd = (e.blinkCd || 0) - dt;
    },
    anim(e, dt, c) {
      const bob = Math.sin(e.t * 2.4 + e.offset) * 0.25;
      e.core.position.y = 1.6 + bob; e.shellM.position.y = 1.6 + bob;
      e.shellM.rotation.set(e.t * 1.3, e.t * 0.9, 0);
      const k = e.state === 'cast' ? 1 + e.t * 2.5 : 1;
      e.core.scale.setScalar(k * (0.9 + 0.1 * Math.sin(e.t * 9)));
      e.coreMat.uniforms.uEmissive.value.setRGB(0.6 * k, 0.4 * k, 1.0 * k);
      if (Math.random() < 0.3) c.G.parts.spark.emit(e.pos.x + (Math.random() - 0.5) * 0.4, e.pos.y + 1.4 + bob, e.pos.z + (Math.random() - 0.5) * 0.4, 0, 0.6, 0, 0.7, 0.8, 0x7a5aff, 0.2);
    },
    onDeath(e) { GW.World.lights.remove(e.light); },
    onRespawn(e) { GW.World.lights.list.push(e.light); },
  };

  // ---------------- The Mire Warden (boss) ----------------
  TYPES.warden = {
    name: 'THE MIRE WARDEN', hp: 1500, radius: 1.8, poise: 999, aggro: 16, leash: 999, xp: 700, dmg: 26, speed: 3.1, kind: 'construct', boss: true,
    build(e) {
      const stone = e.mat({ id: ID.STONE, color: 0x7a8090, rim: 0.35 }), moss = e.mat({ id: ID.MOSS, color: 0x4a6a7a }), rune = e.mat({ id: ID.RUNE, color: 0, emissive: 0x30c8ff, unlit: true });
      const b = e.body = new THREE.Group(); e.model.add(b);
      const torso = part(b, new THREE.IcosahedronGeometry(1.5, 1), stone, 0, 3.0, 0); torso.scale.set(1.2, 1.0, 0.9);
      part(b, new THREE.IcosahedronGeometry(1.1, 0), moss, 0, 3.9, -0.4).scale.set(1.3, 0.5, 1);
      e.coreM = part(b, new THREE.IcosahedronGeometry(0.45, 1), rune, 0, 3.0, 1.2);
      e.head = part(b, new THREE.IcosahedronGeometry(0.62, 0), stone, 0, 4.5, 0.6);
      part(e.head, box(0.5, 0.08, 0.1), rune, 0, 0.05, 0.55);
      e.armL = new THREE.Group(); e.armL.position.set(1.85, 3.6, 0); b.add(e.armL);
      e.armR = new THREE.Group(); e.armR.position.set(-1.85, 3.6, 0); b.add(e.armR);
      for (const a of [e.armL, e.armR]) {
        part(a, new THREE.IcosahedronGeometry(0.6, 0), stone, 0, -0.5, 0);
        part(a, new THREE.IcosahedronGeometry(0.55, 0), stone, 0, -1.4, 0.1);
        part(a, new THREE.IcosahedronGeometry(0.85, 0), stone, 0, -2.4, 0.2);
        part(a, box(0.1, 0.1, 0.5), rune, 0, -1.0, 0.45);
      }
      e.legL = new THREE.Group(); e.legL.position.set(0.8, 1.9, 0); b.add(e.legL);
      e.legR = new THREE.Group(); e.legR.position.set(-0.8, 1.9, 0); b.add(e.legR);
      for (const l of [e.legL, e.legR]) { part(l, new THREE.IcosahedronGeometry(0.6, 0), stone, 0, -0.6, 0); part(l, new THREE.IcosahedronGeometry(0.7, 0), stone, 0, -1.5, 0.1); }
      e.runeMat = rune;
      e.light = GW.World.lights.add(e.pos.x, 3, e.pos.z, new THREE.Color(0.2, 0.6, 1.0).multiplyScalar(1.4), 12, 0.2);
      e.phase = 1;
    },
    ai(e, c) {
      const { dt, G, P, dP } = c;
      const T = TYPES.warden;
      e.light.p.set(e.pos.x + Math.sin(e.yaw) * 1.5, e.pos.y + 3, e.pos.z + Math.cos(e.yaw) * 1.5);
      if (!G.bossActive) { e.moving = false; e.face(P.pos, dt, 1); return; }
      const rage = e.hp < e.maxHp * 0.25 ? 1.3 : 1;
      if (e.phase === 1 && e.hp < e.maxHp * 0.5) {
        e.phase = 2; e.setState('roar');
        G.ui.banner('', 'THE WARDEN AWAKENS FULLY'); GWAudio.sfx('roar'); G.shake(0.8);
        for (let k = 0; k < 2; k++) { const a = Math.random() * TAU; G.spawnEnemy('wisp', e.pos.x + Math.cos(a) * 8, e.pos.z + Math.sin(a) * 8, { x: W_.L.arena.x, z: W_.L.arena.z }, true); }
      }
      switch (e.state) {
        case 'roar': e.moving = false; if (e.t > 1.4) { e.setState('chase'); e.cool = 0.4; } break;
        case 'slam':
          e.moving = false;
          if (e.t > 1.05 / rage && !e.didHit) {
            e.didHit = true; GWAudio.sfx('slam'); G.shake(1.0);
            G.parts.dust.burst(e.pos.x, e.pos.y + 0.3, e.pos.z, 40, 9, 0x8890a0, 0.9, 1.6, -4, 2);
            if (dP < 6.2 + 0.45) G.hurtPlayer(T.dmg + 6, e.pos, { heavy: true });
          }
          if (e.t > 1.7 / rage) { e.setState('chase'); e.cool = 1.3; }
          break;
        case 'sweep':
          if (e.t < 0.75 / rage) e.face(P.pos, dt, 2.5);
          if (e.t > 0.75 / rage && !e.didHit) { GWAudio.sfx('heavy'); e.strike(G, 5.8, 1.25, T.dmg, { heavy: true }); e.didHit = true; G.shake(0.4); }
          if (e.t > 1.3 / rage) { e.setState('chase'); e.cool = 1.0; }
          break;
        case 'throw':
          e.face(P.pos, dt, 4); e.moving = false;
          if (e.t > 0.8 / rage && !e.didHit) {
            e.didHit = true; GWAudio.sfx('heavy');
            const n = e.phase === 2 ? 5 : 3;
            for (let k = 0; k < n; k++) {
              const tx = P.pos.x + (k ? (Math.random() - 0.5) * 7 : 0), tz = P.pos.z + (k ? (Math.random() - 0.5) * 7 : 0);
              G.spawnBoulder(e.pos.x, e.pos.y + 4.5, e.pos.z, tx, tz, 1.0 + k * 0.12, T.dmg - 4);
            }
          }
          if (e.t > 1.4 / rage) { e.setState('chase'); e.cool = 1.4; }
          break;
        case 'charge-wind':
          e.face(P.pos, dt, 3); e.moving = false;
          if (e.t > 0.85 / rage) { e.setState('charge'); GWAudio.sfx('roar'); }
          break;
        case 'charge':
          e.pos.x += Math.sin(e.yaw) * 21 * dt; e.pos.z += Math.cos(e.yaw) * 21 * dt; e.moving = true;
          e.strike(G, 2.4, Math.PI, T.dmg + 4, { heavy: true });
          if (Math.random() < 0.5) G.parts.dust.burst(e.pos.x, e.pos.y + 0.2, e.pos.z, 3, 3, 0x8890a0, 0.6, 1.4, -3, 1);
          { const A = GW.World.L.arena; if (e.t > 0.85 || Math.hypot(e.pos.x - A.x, e.pos.z - A.z) > 17) { e.setState('recover'); G.shake(0.6); GWAudio.sfx('slam'); } }
          break;
        case 'recover': e.moving = false; if (e.t > 1.1) { e.setState('chase'); e.cool = 0.5; } break;
        default: {
          if (e.state !== 'chase') e.setState('chase');
          if (dP > 3.6) e.moveTo(P.pos.x, P.pos.z, T.speed * rage, dt); else { e.moving = false; e.face(P.pos, dt, 3); }
          if (e.cool <= 0) {
            const r = Math.random();
            if (dP < 5) {
              if (r < 0.5) { e.setState('slam'); G.telegraph({ shape: 'circle', x: e.pos.x, z: e.pos.z, r: 6.2, dur: 1.05 / rage }); }
              else { e.setState('sweep'); G.telegraph({ shape: 'cone', x: e.pos.x, z: e.pos.z, r: 5.8, half: 1.25, dur: 0.75 / rage, follow: e, followYaw: true, yaw: e.yaw }); }
            } else if (e.phase === 2 && r < 0.45) {
              e.setState('charge-wind'); e.face(P.pos, 1, 1);
              G.telegraph({ shape: 'line', x: e.pos.x, z: e.pos.z, w: 3.4, len: 17, dur: 0.85 / rage, follow: e, followYaw: true, yaw: e.yaw });
            } else if (dP > 7 || r < 0.3) { e.setState('throw'); }
            else e.cool = 0.3;
          }
        }
      }
    },
    anim(e, dt) {
      e.ph = (e.ph || 0) + dt * (e.moving ? (e.state === 'charge' ? 9 : 4) : 0);
      const s = Math.sin(e.ph);
      e.legL.rotation.x = s * 0.4; e.legR.rotation.x = -s * 0.4;
      e.body.position.y = Math.abs(s) * 0.12;
      let la = s * 0.2, ra = -s * 0.2, lz = 0, rz = 0, bx = 0;
      if (e.state === 'slam') { const k = e.t < 1 ? Math.min(1, e.t / 0.9) : 1 - Math.min(1, (e.t - 1) / 0.15); la = ra = -2.6 * k; if (e.t > 1.0 && e.t < 1.4) { la = ra = 0.7; bx = 0.35; } }
      if (e.state === 'sweep') { const k = Math.min(1, e.t / 0.7); rz = e.t < 0.75 ? -1.3 * k : GW.lerp(-1.3, 1.6, Math.min(1, (e.t - 0.75) / 0.15)); ra = -1.2; }
      if (e.state === 'throw') { ra = e.t < 0.8 ? -2.8 * Math.min(1, e.t / 0.6) : 0.5; }
      if (e.state === 'roar') { la = ra = -2.2; bx = -0.3; }
      if (e.state === 'charge-wind' || e.state === 'charge') { bx = 0.4; la = ra = 0.6; }
      e.armL.rotation.set(la, 0, lz); e.armR.rotation.set(ra, rz, 0, 'YXZ'); e.body.rotation.x = bx;
      const pulse = 1 + 0.4 * Math.sin(e.t * 5) + (e.state === 'roar' ? 1.5 : 0) + (e.phase === 2 ? 0.6 : 0);
      e.runeMat.uniforms.uEmissive.value.setRGB(0.2 * pulse, 0.7 * pulse, 1.0 * pulse);
      if (e.phase === 2) e.runeMat.uniforms.uEmissive.value.setRGB(1.0 * pulse * 0.6, 0.35 * pulse, 0.2);
      e.coreM.rotation.y += dt * 2;
    },
    onDeath(e) { GW.World.lights.remove(e.light); },
  };
  const W_ = { get L() { return GW.World.L; } };

  // ======================================================================
  // NPCs
  // ======================================================================
  function NPC(scene, kind, x, z) {
    this.kind = kind; this.pos = new V3(x, GW.World.heightAt(x, z), z); this.yaw = 0; this.t = Math.random() * 5;
    const g = this.model = new THREE.Group(); scene.add(g); g.position.copy(this.pos);
    shadow(scene, 0.7).position.set(x, this.pos.y + 0.03, z);
    if (kind === 'elder') {
      this.name = 'Mara, the Lamplighter';
      const robe = GW.mat({ id: ID.CLOTH, color: 0x3a4a6a, rim: 0.4 }), skin = GW.mat({ id: ID.BODY, color: 0xc8b098 }), wood = GW.mat({ id: ID.WOOD, color: 0x5a3e26 }), lamp = GW.mat({ id: ID.FIRE, color: 0, emissive: 0xffc070, unlit: true });
      part(g, new THREE.ConeGeometry(0.6, 1.7, 10), robe, 0, 0.85, 0);
      part(g, new THREE.SphereGeometry(0.2, 8, 6), skin, 0, 1.85, 0.03);
      part(g, new THREE.ConeGeometry(0.3, 0.5, 10), robe, 0, 2.05, -0.03);
      part(g, new THREE.CylinderGeometry(0.04, 0.05, 2.2, 5), wood, 0.45, 1.1, 0.2);
      this.lamp = part(g, new THREE.OctahedronGeometry(0.16, 0), lamp, 0.45, 2.25, 0.2);
      GW.World.lights.add(x + 0.4, this.pos.y + 2.3, z + 0.2, new THREE.Color(1, 0.75, 0.4), 6, 0.3);
    } else {
      this.name = 'Hesk, the Glyphsmith';
      const apron = GW.mat({ id: ID.CLOTH, color: 0x4a3020, rim: 0.3 }), skin = GW.mat({ id: ID.BODY, color: 0xb89070, rim: 0.3 }), metal = GW.mat({ id: ID.METAL, color: 0x707680, rim: 0.4 });
      part(g, box(0.36, 0.9, 0.3), apron, 0.2, 0.45, 0); part(g, box(0.36, 0.9, 0.3), apron, -0.2, 0.45, 0);
      part(g, box(0.9, 0.9, 0.55), skin, 0, 1.35, 0);
      part(g, box(0.92, 0.9, 0.1), apron, 0, 1.3, 0.25);
      part(g, new THREE.SphereGeometry(0.26, 8, 6), skin, 0, 2.0, 0);
      part(g, box(0.4, 0.3, 0.1), apron, 0, 1.85, 0.2);
      this.arm = new THREE.Group(); this.arm.position.set(-0.55, 1.65, 0); g.add(this.arm);
      part(this.arm, box(0.22, 0.7, 0.22), skin, 0, -0.35, 0);
      part(this.arm, box(0.06, 0.06, 0.6), GW.mat({ id: ID.WOOD, color: 0x5a3e26 }), 0, -0.7, 0.25);
      part(this.arm, box(0.25, 0.2, 0.18), metal, 0, -0.7, 0.55);
    }
    GW.World.addCollider(x, z, 0.6, 'npc');
    GW.World.interact.push({ type: 'npc', npc: this, x, z, r: 3, label: 'Talk to ' + this.name.split(',')[0] });
  }
  NPC.prototype.update = function (dt, G) {
    this.t += dt;
    const P = G.player, d = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    const target = d < 7 ? Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z) : (this.kind === 'smith' ? Math.atan2(GW.World.L.anvil.x - this.pos.x, GW.World.L.anvil.z - this.pos.z) : 0);
    this.yaw += GW.angDiff(this.yaw, target) * Math.min(1, dt * 3);
    this.model.rotation.y = this.yaw;
    if (this.kind === 'smith' && d >= 7) {
      const k = (this.t % 1.2) / 1.2; this.arm.rotation.x = k < 0.7 ? -2.2 * (k / 0.7) : GW.lerp(-2.2, 0.2, (k - 0.7) / 0.3);
      if (k > 0.97 && !this.rang) { this.rang = true; if (d < 26) { GWAudio.sfx('anvil'); const L = GW.World.L.anvil; G.parts.spark.burst(L.x, GW.World.heightAt(L.x, L.z) + 1, L.z, 6, 3, 0xffb050, 0.4, 0.7, -6, 2); } }
      if (k < 0.5) this.rang = false;
    } else if (this.arm) this.arm.rotation.x = 0;
    if (this.lamp) this.lamp.rotation.y += dt;
  };
  GW.NPC = NPC;
})();

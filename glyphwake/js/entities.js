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
  // soft shadow stretched away from the light (light from the upper left, so it falls down-right)
  const shadowGeo = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2).scale(0.85, 1, 2.1).translate(0, 0, 1.05)
    .rotateY(Math.atan2(-0.55, -0.42) + Math.PI);
  const shadowMat = new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 d = (vUv - 0.5) * 2.0; d.y = (d.y + 1.0) * 0.5;   // darker near the feet
        float a = (1.0 - smoothstep(0.15, 1.0, length(vec2(d.x, d.y * 1.3)))) * 0.85;
        if (h(floor(gl_FragCoord.xy)) > a) discard;              // dithered soft edge
        gl_FragColor = vec4(0.004, 0.008, 0.01, (${ID.GROUND}.0 + 0.5) / 32.0);
      }`,
  });
  function shadow(scene, r) { const s = new THREE.Mesh(shadowGeo, shadowMat); s.scale.setScalar(r); s.layers.set(1); scene.add(s); return s; }

  // ---------------- particles ----------------
  function Particles(scene, n, id) {
    this.n = n; this.list = []; this.free = [];
    this.im = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.1, 0), GW.mat({ id, color: 0xffffff, unlit: true }), n);
    this.im.frustumCulled = false; this.im.layers.set(1);
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
    this.mesh.frustumCulled = false; this.mesh.layers.set(1); scene.add(this.mesh);
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
    this.mesh.visible = this.pts.some(p => p.on && p.age < 0.2);
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
    grp.traverse(o => o.layers.set(1));
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
    this.inv = { runes: {}, ingots: {}, kindling: 3, armor: { greathelm: 1, knightplate: 1, crimson: 1 } };
    this.hitSet = new Set(); this.walkPhase = 0; this.hurtT = 0; this.healT = 0;
    this.buildModel(scene);
    this.trail = new Trail(scene, 16);
    this.shadow = shadow(scene, 0.5);
    this.light = GW.World.lights.add(0, 2, 0, new THREE.Color(0.22, 0.25, 0.32), 5.5, 0);
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
  Player.prototype.place = function (x, z) { this.pos.set(x, GW.World.groundY(x, z), z); this.vel.set(0, 0, 0); this.floor = 0; };
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
    this._spd = this.mvel && this.state === 'move' ? Math.hypot(this.mvel.x, this.mvel.z) : 6.2 * (this.moveMul || 1) * ml;
    if (this.state !== 'move' && this.mvel && this.state !== 'roll') this.mvel.multiplyScalar(0.5);
    const wading = W.inWater(this.pos.x, this.pos.z);
    if (this.webbed > 0) this.webbed -= dt;
    let speed = 6.2 * (this.moveMul || 1) * (this.buffMove || 1) * (wading ? 0.55 : 1) * (this.webbed > 0 ? 0.45 : 1);
    // ---- riding: the horse carries you; steer with the move keys, faster on roads ----
    if (this.horse && this.horse.ridden) {
      const H = this.horse, onRoad = W.pathAt(this.pos.x, this.pos.z) < 3;
      const maxS = (onRoad ? 17 : 13) * (wading ? 0.45 : 1) * (this.buffMove || 1);
      const want = ml > 0.1 ? maxS * ml : 0;
      H.speed += (want - H.speed) * Math.min(1, dt * (want > H.speed ? 1.5 : 3.2));
      if (ml > 0.1) H.yaw += GW.angDiff(H.yaw, Math.atan2(mv.x, mv.z)) * Math.min(1, dt * (H.speed > 9 ? 2.4 : 3.6));
      this.state = 'move'; this._mv = false; this._spd = 0; this.queued = null;
      this.pos.x += Math.sin(H.yaw) * H.speed * dt; this.pos.z += Math.cos(H.yaw) * H.speed * dt;
      if (W.collide(this.pos, 0.9, this.floor || 0) && H.speed > 5) H.speed *= 0.6;
      const la = W.levelAt(this.pos.x, this.pos.z, this.floor || 0); this.floor = la.lv;
      this.pos.y += (la.y - this.pos.y) * Math.min(1, dt * 12);
      this.yaw = this.visYaw = H.yaw;
      H.place(this.pos, H.yaw, dt);
      this.animate(dt);
      this.model.position.y += 1.12 + H.bob;           // in the saddle
      this.trail.update(dt);
      this.light.p.set(this.pos.x, this.pos.y + 2.8, this.pos.z);
      this.shadow.visible = false;
      G.pushGrass(0, this.pos.x, this.pos.z, 1.8);
      return;
    }
    this.shadow.visible = true;
    // ---- sprint: hold Shift while moving (costs stamina) ----
    this.sprinting = !!(input.sprint && ml > 0.3 && this.state === 'move' && this.st > 4);
    if (this.sprinting) { speed *= 1.55; this.st -= 16 * dt; this.stDelay = 0.5; }
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
        this.cur.dur /= this.ws.speed; this.cur.hitAt = this.cur.dur * (this.cur.heavy ? 0.5 : 0.42); this.cur.h0 = this.cur.hitAt - 0.06; this.cur.h1 = this.cur.hitAt + 0.07; this.atkN = (this.atkN || 0) + 1;
        this.state = 'attack'; this.t = 0; this.hitSet.clear();
        faceTarget();
        this.st -= this.cur.st; this.stDelay = 0.6;
        GWAudio.sfx(this.cur.heavy ? 'heavy' : 'swing');
      } else if (SKILLS[q]) {
        const sk = SKILLS[q];
        if (this.cd[q] > 0 || this.fo < sk.fo) { this.queued = null; if (this.fo < sk.fo) G.ui.toast('Not enough focus', 0.9); }
        else {
          this.queued = null; this.fo -= sk.fo; this.cd[q] = sk.cd; this.atkN = (this.atkN || 0) + 1; this.state = 'skill'; this.t = 0; this.hitSet.clear(); this.skill = q;
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
        // responsive but not robotic: ~60 ms to full speed, ~50 ms to stop
        const mvel = this.mvel || (this.mvel = new V3());
        const tx = mv.x * speed * ml, tz = mv.z * speed * ml;
        const k = 1 - Math.exp(-dt * (ml > 0.1 ? 26 : 34));
        mvel.x += (tx - mvel.x) * k; mvel.z += (tz - mvel.z) * k;
        vx = mvel.x; vz = mvel.z;
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
        if (this.t >= this.cur.dur) { this.state = 'move'; this.t = 0; if (this.mvel) this.mvel.set(vx * 0.7, 0, vz * 0.7); }
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
    W.collide(this.pos, 0.35, this.floor || 0);
    for (const e of G.enemies) {
      if (!e.alive) continue;
      const dx = this.pos.x - e.pos.x, dz = this.pos.z - e.pos.z, rr = 0.45 + e.radius, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-5) { const d = Math.sqrt(d2), k = (rr - d) / d * (this.state === 'roll' || this.state === 'skill' ? 0.0 : 0.6); this.pos.x += dx * k; this.pos.z += dz * k; }
    }
    if (G.arenaLock) {
      const A = W.L.arena, dx = this.pos.x - A.x, dz = this.pos.z - A.z, d = Math.hypot(dx, dz);
      if (d > 17.5) { this.pos.x = A.x + dx / d * 17.5; this.pos.z = A.z + dz / d * 17.5; }
    }
    const la = W.levelAt(this.pos.x, this.pos.z, this.floor || 0);
    this.floor = la.lv;
    const gy = la.y, falling = gy < this.pos.y - 0.6;
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * (falling ? 6 : 18));
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
    const m = this.model, b = this.body, R = this.rig;
    m.position.copy(this.pos);
    this.visYaw += GW.angDiff(this.visYaw, this.yaw) * Math.min(1, dt * (this.state === 'move' ? 20 : 32));
    m.rotation.y = this.visYaw;
    b.rotation.set(0, 0, 0); b.position.set(0, 0, 0);
    // a new action token restarts its clip
    const tok = this.state + ':' + (this.state === 'attack' ? this.combo + ':' + this.atkN : this.state === 'skill' ? this.skill + ':' + this.atkN : '');
    const fresh = tok !== this._tok; this._tok = tok;
    const slashD = R.dur('Sword_Slash'), pk = this.slashPeak || 0.4;
    switch (this.state) {
      case 'move':
        if (this._mv) {
          const run = this._spd > 3.2;
          R.play(run ? 'Run' : 'Walk', { speed: run ? GW.clamp(this._spd / 5.2, 0.7, 1.4) : GW.clamp(this._spd / 1.6, 0.6, 1.5), fade: 0.18 });
          b.rotation.x = run ? 0.06 : 0;
        } else R.play('Idle_Sword', { fade: 0.25 });
        break;
      case 'attack': {
        const c = this.cur, at = c.heavy ? 0.0 : 0.12;
        const speed = (pk - at) * slashD / Math.max(0.05, c.hitAt);
        if (fresh) R.play('Sword_Slash', { loop: false, restart: true, fade: 0.06, at, speed });
        // vary the three swings: twist the body so arcs come from different sides, lean into the heavy
        const k = GW.clamp(this.t / c.dur, 0, 1), e = Math.sin(k * Math.PI);
        if (this.combo === 0) b.rotation.y = -0.45 * e;
        else if (this.combo === 1) b.rotation.y = 0.55 * e;
        else { b.rotation.x = 0.22 * e; b.position.y = 0.05 * e; }
        break;
      }
      case 'roll':
        if (fresh) R.play('Roll', { loop: false, restart: true, fade: 0.05, speed: R.dur('Roll') / this.cur.dur });
        break;
      case 'skill':
        if (this.skill === 's2') {
          if (fresh) R.play('Sword_Slash', { loop: false, restart: true, fade: 0.05, at: 0.2, speed: 1.6 });
          const k = this.t / this.cur.dur; b.rotation.y = -E3(k) * TAU * 2;
        } else if (this.skill === 's3') {
          if (fresh) R.play('Sword_Slash', { loop: false, restart: true, fade: 0.04, at: Math.max(0, pk - 0.15), speed: 1.1 });
          b.rotation.x = 0.3;
        } else if (fresh) R.play('Punch_Right', { loop: false, restart: true, fade: 0.05, speed: R.dur('Punch_Right') / this.cur.dur * 0.8 });
        break;
      case 'potion': if (fresh) R.play('Interact', { loop: false, restart: true, fade: 0.1, speed: R.dur('Interact') / this.cur.dur * 0.9 }); break;
      case 'hurt': if (fresh) R.play(Math.random() < 0.5 ? 'HitRecieve' : 'HitRecieve_2', { loop: false, restart: true, fade: 0.05, speed: 1.7 }); break;
      case 'dead': if (fresh) R.play('Death', { loop: false, restart: true, fade: 0.1 }); break;
    }
    R.update(dt);
    if (this.cloak) this.cloak.rotation.x = -0.1 - (this._mv ? Math.min(0.55, this._spd * 0.07) : 0) - (this.state === 'roll' ? 0.3 : 0) + Math.sin(this.t * 2.3) * 0.03;
    if (this.plume) this.plume.rotation.x = Math.sin(this.t * 3) * 0.08 - (this._mv ? 0.25 : 0);
    const fl = this.hurtT > 0 ? this.hurtT * 3 : 0;
    for (const mt of this.mats) mt.uniforms.uFlash.value = fl;
  };
  function E3(k) { return 1 - Math.pow(1 - k, 2.2); }
  GW.Player = Player;

  // ---------------- the horse: procedural body, four two-part legs, a walk/gallop gait ----------------
  function Horse(scene) {
    this.scene = scene; this.pos = new V3(); this.yaw = 0; this.speed = 0; this.ph = 0; this.bob = 0; this.ridden = false; this.t = 0;
    const coat = GW.mat({ id: ID.LEATHER, color: 0x7a5638, rim: 0.3 }), dark = GW.mat({ id: ID.CLOTH, color: 0x2a2420, rim: 0.2 }), tack = GW.mat({ id: ID.LEATHER, color: 0x3e2618 }), hoof = GW.mat({ id: ID.METAL, color: 0x2a2a2e });
    const g = this.model = new THREE.Group(); scene.add(g);
    const body = this.body = new THREE.Group(); g.add(body);
    part(body, new THREE.SphereGeometry(1, 14, 10), coat, 0, 1.28, -0.05).scale.set(0.42, 0.46, 1.12);
    part(body, new THREE.SphereGeometry(1, 10, 8), coat, 0, 1.32, 0.72).scale.set(0.4, 0.44, 0.5);   // chest
    part(body, new THREE.SphereGeometry(1, 10, 8), coat, 0, 1.3, -0.8).scale.set(0.42, 0.42, 0.45);   // haunch
    part(body, box(0.5, 0.12, 0.7), tack, 0, 1.76, 0.05);                                             // saddle
    const neck = this.neck = new THREE.Group(); neck.position.set(0, 1.5, 0.95); body.add(neck);
    part(neck, new THREE.CylinderGeometry(0.17, 0.26, 0.9, 8), coat, 0, 0.32, 0.18, 0.62);
    part(neck, box(0.08, 0.5, 0.75), dark, 0, 0.46, 0.08, 0.62);                                       // mane
    const head = this.head = new THREE.Group(); head.position.set(0, 0.7, 0.46); neck.add(head);
    part(head, box(0.24, 0.26, 0.62), coat, 0, -0.04, 0.22, 0.35);
    part(head, box(0.06, 0.16, 0.06), coat, -0.08, 0.16, -0.02); part(head, box(0.06, 0.16, 0.06), coat, 0.08, 0.16, -0.02);   // ears
    const tail = this.tail = new THREE.Group(); tail.position.set(0, 1.45, -1.25); body.add(tail);
    part(tail, box(0.12, 0.75, 0.14), dark, 0, -0.36, -0.12, -0.35);
    this.legs = [[-0.24, 0.78, 0], [0.24, 0.78, Math.PI], [-0.24, -0.82, Math.PI * 0.5], [0.24, -0.82, Math.PI * 1.5]].map(([x, z, off]) => {
      const hip = new THREE.Group(); hip.position.set(x, 1.08, z); body.add(hip);
      part(hip, new THREE.CylinderGeometry(0.1, 0.075, 0.55, 6), coat, 0, -0.27, 0);
      const knee = new THREE.Group(); knee.position.set(0, -0.54, 0); hip.add(knee);
      part(knee, new THREE.CylinderGeometry(0.065, 0.055, 0.5, 6), coat, 0, -0.25, 0);
      part(knee, box(0.12, 0.08, 0.14), hoof, 0, -0.51, 0.02);
      return { hip, knee, off, front: z > 0 };
    });
    this.shadow = shadow(scene, 1.2);
  }
  Horse.prototype.place = function (p, yaw, dt) {
    this.t += dt; this.pos.copy(p); this.yaw = yaw;
    const sp = this.speed, gallop = sp > 9;
    this.ph += dt * (gallop ? 9 + sp * 0.25 : 2 + sp * 1.1);
    this.bob = sp > 0.5 ? Math.abs(Math.sin(this.ph)) * (gallop ? 0.12 : 0.04) : 0;
    this.model.position.set(p.x, p.y, p.z); this.model.rotation.y = yaw;
    this.body.position.y = this.bob; this.body.rotation.x = gallop ? Math.sin(this.ph) * 0.06 : 0;
    const amp = sp > 0.5 ? (gallop ? 0.75 : 0.38) : 0;
    for (const L of this.legs) {
      const a = this.ph + (gallop ? (L.front ? 0 : 0.6) + (L.off > Math.PI ? 0.25 : 0) : L.off);
      L.hip.rotation.x = Math.sin(a) * amp; L.knee.rotation.x = Math.max(0, -Math.cos(a)) * amp * (L.front ? -1.2 : 1.2);
    }
    // grazing when idle; head nods when moving
    const graze = !this.ridden && sp < 0.3 ? (0.6 + 0.4 * Math.sin(this.t * 0.4)) : 0;
    this.neck.rotation.x = graze * 1.1 + (sp > 0.5 ? Math.sin(this.ph * 2) * 0.06 : 0);
    this.tail.rotation.x = -0.2 - (gallop ? 0.5 : 0) + Math.sin(this.t * 3) * 0.08; this.tail.rotation.z = Math.sin(this.t * 1.7) * 0.15;
    this.shadow.position.set(p.x, p.y + 0.03, p.z);
  };
  GW.Horse = Horse;

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
    // faint red ring under an enemy that is hunting you
    this.ring = new THREE.Mesh(new THREE.RingGeometry(T.radius * 1.15, T.radius * 1.3, 28).rotateX(-Math.PI / 2), GW.mat({ id: ID.FIRE, color: 0, emissive: 0x7a1408, unlit: true, side: THREE.DoubleSide }));
    this.ring.layers.set(1); this.ring.visible = false; scene.add(this.ring);
  }
  Enemy.prototype.mat = function (o) { const m = GW.mat(o); this.mats.push(m); return m; };
  Enemy.prototype.distTo = function (p) { return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); };
  Enemy.prototype.face = function (p, dt, rate) { const a = Math.atan2(p.x - this.pos.x, p.z - this.pos.z); this.yaw += GW.angDiff(this.yaw, a) * Math.min(1, dt * (rate || 8)); };
  Enemy.prototype.setState = function (s) { this.state = s; this.t = 0; this.didHit = false; };
  Enemy.prototype.update = function (dt, G) {
    const W = GW.World, P = G.player;
    this.t += dt; this.flash = Math.max(0, this.flash - dt * 5);
    for (const m of this.mats) m.uniforms.uFlash.value = this.flash * 1.4;
    if (!this.alive && this.ring) this.ring.visible = false;
    if (!this.alive && this.rig) {
      this.deadT += dt;
      if (!this._deathPlayed) { this._deathPlayed = true; this.rig.play('Death', { loop: false, restart: true, fade: 0.08 }); }
      this.rig.update(dt);
      if (this.deadT > 2.2) this.model.position.y = this.pos.y - (this.deadT - 2.2) * 0.6;
      if (this.deadT > 3.4 && this.model.visible) { this.model.visible = false; this.shadow.visible = false; }
      return;
    }
    if (!this.alive) {
      this.deadT += dt;
      const k = Math.min(1, this.deadT / 0.8);
      this.model.position.y = this.pos.y - k * 0.8 * this.T.radius;
      this.model.rotation.z = k * 1.2 * this.dieSide;
      if (this.deadT > 1.2 && this.model.visible) { this.model.visible = false; this.shadow.visible = false; }
      if (this.legs) this.legs.forEach(g => g.segs.forEach(m => { m.visible = this.model.visible; }));
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
    const far = dP > 42 && !this.T.boss;   // off-screen: skip skinning and animation work
    this.model.visible = !far; this.shadow.visible = !far;
    this.ring.visible = !far && this.aggro && !this.T.boss && this.type !== 'husk';
    if (this.ring.visible) { this.ring.position.set(this.pos.x, gy + 0.06, this.pos.z); const k = this.state === 'windup' || this.state === 'windup2' ? 2.2 : 1; this.ring.material.uniforms.uEmissive.value.setRGB(0.48 * k, 0.08 * k, 0.03 * k); }
    if (this.T.anim && !far) this.T.anim(this, dt, ctx);
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
    G.hurtPlayer(dmg * (this.dmgMul || 1), this.pos, opts);
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
      e.rig = new GW.Rig('wolf', 0.27, (mn) => mn === 'Eyes_Black' ? { id: ID.FIRE, color: 0, emissive: 0xff3020, unlit: true }
        : mn === 'Nose' ? { id: ID.BODY, color: 0x202024 } : mn === 'Main_Light' ? { id: ID.BODY, color: 0xc0c0c8, rim: 0.6 } : { id: ID.BODY, color: 0x8a8a96, rim: 0.8 });
      e.model.add(e.rig.root); e.mats = e.rig.mats.slice();
      e.eyeMat = e.rig.mats.find(m => m.uniforms.uUnlit.value > 0);
      e.rig.mixer.timeScale = 0.9 + Math.random() * 0.2;
      e.rig.play('Idle', { fade: 0, at: Math.random() });
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
      const R = e.rig, fresh = e._ast !== e.state; e._ast = e.state;
      switch (e.state) {
        case 'windup': if (fresh) R.play('Attack', { loop: false, restart: true, fade: 0.08, speed: R.dur('Attack') / 0.85 }); break;
        case 'lunge': break;
        case 'stagger': if (fresh) R.play(Math.random() < 0.5 ? 'Idle_HitReact_Left' : 'Idle_HitReact_Right', { loop: false, restart: true, fade: 0.05, speed: 1.6 }); break;
        case 'chase': R.play(e.moving ? 'Gallop' : 'Idle', { speed: 1.15, fade: 0.2 }); break;
        case 'wander': case 'return': R.play('Walk', { speed: 1.3, fade: 0.25 }); break;
        default: R.play('Idle', { fade: 0.3 });
      }
      R.update(dt);
      if (e.eyeMat) e.eyeMat.uniforms.uEmissive.value.setRGB(e.state === 'windup' ? 2.2 : 1, 0.15, 0.1);
    },
  };

  // ---------------- Hollow knight ----------------
  TYPES.hollow = {
    name: 'Hollow', hp: 95, radius: 0.6, poise: 28, aggro: 11, leash: 28, xp: 48, dmg: 16, speed: 3.6, kind: 'undead',
    build(e) {
      const R = e.rig = new GW.Rig('monarch', 1.08, (mn, o) => {
        const head = /head/i.test(o.name) || /head/i.test((o.parent && o.parent.name) || '');
        switch (mn) {
          case 'Eye': return { id: ID.FIRE, color: 0, emissive: 0x40c8ff, unlit: true };
          case 'Skin': return { id: ID.BONE, color: 0xa8ac98, rim: 0.4 };
          case 'Hair_White': return null;
          case 'Gold': return head ? { id: ID.METAL, color: 0x6a5a3a, rim: 0.4 } : { id: ID.METAL, color: 0x7a6a4a };
          case 'Metal': return { id: ID.METAL, color: 0x6e6050, rim: 0.6 };
          case 'Metal_Dark': return { id: ID.MAIL, color: 0x4a4a50, rim: 0.4 };
          case 'Blue': return { id: ID.CLOTH, color: 0x2a3434, rim: 0.3 };
          case 'DarkBrown': return { id: ID.LEATHER, color: 0x3a2a1a };
          default: return { id: ID.CLOTH, color: 0x4a4438 };
        }
      });
      e.model.add(R.root);
      GW.Knight.bindPose(R);
      const rust = GW.mat({ id: ID.METAL, color: 0x7a6a5a, rim: 0.6 }), wood = GW.mat({ id: ID.WOOD, color: 0x3a2a1a });
      const sw = GW.Knight.buildSword({ blade: rust, hilt: wood, guard: rust }, 0.95);
      R.attach('Wrist.R', sw.sword, GW.Knight.gripPlace(R, 'R'));
      const sh = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 10), GW.mat({ id: ID.WOOD, color: 0x4a3828, rim: 0.4 }));
      disc.rotation.z = Math.PI / 2; disc.position.x = -0.07; sh.add(disc);
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), rust); boss.position.x = -0.1; sh.add(boss);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 4, 16), rust); rim.rotation.y = Math.PI / 2; rim.position.x = -0.07; sh.add(rim);
      R.attach('Wrist.L', sh, GW.Knight.gripPlace(R, 'L'));
      e.shield = sh;
      e.mats = R.mats.concat([rust, wood, disc.material]);
      e.eyeMat = R.mats.find(m => m.uniforms.uUnlit.value > 0);
      if (TYPES.hollow.pk === undefined) TYPES.hollow.pk = R.peakFraction('Sword_Slash', 'Wrist.R');
      R.mixer.timeScale = 0.92 + Math.random() * 0.16;
      R.play('Idle_Sword', { fade: 0, at: Math.random() });
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
      const R = e.rig, fresh = e._ast !== e.state; e._ast = e.state;
      const pk = TYPES.hollow.pk || 0.45, D = R.dur('Sword_Slash');
      switch (e.state) {
        case 'windup': if (fresh) R.play('Sword_Slash', { loop: false, restart: true, fade: 0.1, speed: pk * D / 0.7 }); break;
        case 'windup2': if (fresh) R.play('Sword_Slash', { loop: false, restart: true, fade: 0.08, at: 0.15, speed: (pk - 0.15) * D / 0.43 }); break;
        case 'slash': break;
        case 'stagger': if (fresh) R.play('HitRecieve', { loop: false, restart: true, fade: 0.05, speed: 1.2 }); break;
        case 'block': if (fresh) R.play('HitRecieve_2', { loop: false, restart: true, fade: 0.05, speed: 1.5 }); break;
        case 'chase': R.play(e.moving ? 'Walk' : 'Idle_Sword', { speed: 1.5, fade: 0.25 }); break;
        case 'wander': case 'return': R.play('Walk', { speed: 1.0, fade: 0.3 }); break;
        default: R.play('Idle_Sword', { fade: 0.3 });
      }
      R.update(dt);
      if (e.eyeMat) e.eyeMat.uniforms.uEmissive.value.setRGB(0.25, 0.8, 1.0).multiplyScalar(e.state.startsWith('windup') ? 2.4 : 1.2);
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

  // ---------------- The Dusk Widow: a giant furry spider (procedural legs, IK walk, three phases) ----------------
  const UPV = new V3(0, 1, 0), _q = new THREE.Quaternion(), _a = new V3(), _b = new V3(), _d = new V3();
  const segGeo = new THREE.CylinderGeometry(1, 1, 1, 9, 3); segGeo.translate(0, 0.5, 0);
  const _sd = new V3();
  function setSeg(m, A, B, r0) {     // stretch a unit segment mesh from A to B (own scratch vector: A/B may be the shared temps)
    _sd.subVectors(B, A); const len = _sd.length(); if (len < 1e-4) return;
    m.position.copy(A); _q.setFromUnitVectors(UPV, _sd.multiplyScalar(1 / len)); m.quaternion.copy(_q); m.scale.set(r0, len, r0);
  }
  // leg i: hip angle around the body (from the front), rest foot distance
  const WLEGS = [0.45, 0.95, 1.55, 2.2].flatMap(a => [a, -a]);
  TYPES.widow = {
    name: 'DUSK WIDOW', hp: 2300, radius: 2.4, poise: 999, aggro: 15, leash: 999, xp: 900, dmg: 22, speed: 5.2, kind: 'beast', boss: true,
    build(e) {
      const fur = e.mat({ id: ID.FLOWER, tex: 9, color: 0x6a5e58, fill: 0.05 }), furDark = e.mat({ id: ID.FLOWER, tex: 9, color: 0x4a4240, fill: 0.04 });
      const eye = e.mat({ id: ID.FIRE, color: 0, emissive: 0xff3020, unlit: true }), fang = e.mat({ id: ID.BONE, color: 0x2a2220 });
      const b = e.body = new THREE.Group(); e.model.add(b);
      const abd = part(b, new THREE.SphereGeometry(1, 28, 20), fur, 0, 2.6, -2.5); abd.scale.set(1.75, 1.45, 2.3); e.abd = abd;
      const pedicel = part(b, new THREE.SphereGeometry(0.5, 10, 8), furDark, 0, 2.15, -0.5);
      const ceph = part(b, new THREE.SphereGeometry(1, 22, 16), fur, 0, 2.0, 0.65); ceph.scale.set(1.15, 0.8, 1.35);
      const head = part(b, new THREE.SphereGeometry(0.62, 16, 12), furDark, 0, 2.05, 1.85); head.scale.set(1, 0.85, 0.9);
      [[-0.18, 0.2], [0.18, 0.2], [-0.32, 0.08], [0.32, 0.08], [-0.1, 0.32], [0.1, 0.32]].forEach(([x, y]) => part(head, new THREE.SphereGeometry(0.07, 6, 5), eye, x, y, 0.5));
      e.fangs = [-0.2, 0.2].map(x => { const f = part(head, new THREE.ConeGeometry(0.11, 0.6, 6), fang, x, -0.45, 0.42); f.rotation.x = Math.PI * 0.85; return f; });
      // legs live in world space (IK), three segments each
      e.legs = WLEGS.map((ang, i) => {
        const g = { ang, side: ang > 0 ? 1 : -1, grp: (i % 2) ^ (Math.floor(i / 2) % 2), foot: new V3(), from: new V3(), to: new V3(), t: 1, segs: [] };
        for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(segGeo, k === 2 ? furDark : fur); m.frustumCulled = false; e.scene.add(m); g.segs.push(m); }
        return g;
      });
      e.eyeMat = eye; e.phase = 1; e._init = false;
      e.light = GW.World.lights.add(e.pos.x, 3, e.pos.z, new THREE.Color(1.0, 0.25, 0.15).multiplyScalar(0.6), 6, 0.2);
    },
    ai(e, c) {
      const { dt, G, P, dP } = c, T = TYPES.widow, L = W_.L.lair;
      e.light.p.set(e.pos.x + Math.sin(e.yaw) * 2, e.pos.y + 2.4, e.pos.z + Math.cos(e.yaw) * 2);
      if (!G.bossActive || G.curBoss !== e) {
        e.moving = false;
        const dh = Math.hypot(e.pos.x - L.x, e.pos.z - L.z);
        if (dh > 1.5) e.moveTo(L.x, L.z, T.speed * 0.6, dt); else e.face(P.pos, dt, 0.5);
        return;
      }
      // you ran away: she goes home and heals
      if (Math.hypot(P.pos.x - L.x, P.pos.z - L.z) > 42) { G.bossActive = false; G.curBoss = null; G.ui.boss(false); e.hp = e.maxHp; e.phase = 1; e.aggro = false; return; }
      const ph = e.hp < e.maxHp / 3 ? 3 : e.hp < e.maxHp * 2 / 3 ? 2 : 1, rage = ph === 3 ? 1.3 : ph === 2 ? 1.12 : 1;
      if (ph > e.phase) {
        e.phase = ph; e.setState('roar'); GWAudio.sfx('roar'); G.shake(0.7);
        G.ui.banner('', ph === 2 ? 'THE WIDOW SPINS HER WEB' : 'THE WIDOW IS FRENZIED', 2.4);
      }
      switch (e.state) {
        case 'roar': e.moving = false; if (e.t > 1.3) { e.setState('chase'); e.cool = 0.4; } break;
        case 'stab':
          e.moving = false; if (e.t < 0.6 / rage) e.face(P.pos, dt, 3);
          if (e.t > 0.7 / rage && !e.didHit) { GWAudio.sfx('heavy'); e.strike(G, 5.0, 0.8, T.dmg, { heavy: true }); e.didHit = true; G.shake(0.35);
            G.parts.dust.burst(e.pos.x + Math.sin(e.yaw) * 4, e.pos.y + 0.2, e.pos.z + Math.cos(e.yaw) * 4, 14, 4, 0x8a8078, 0.7, 1.1, -3, 1); }
          if (e.t > 1.25 / rage) { e.setState('chase'); e.cool = 0.9 / rage; }
          break;
        case 'web':
          e.moving = false; e.face(P.pos, dt, 5);
          if (e.t > 0.75 / rage && !e.didHit) {
            e.didHit = true; GWAudio.sfx('cast');
            const n = ph === 1 ? 1 : 3;
            for (let k = 0; k < n; k++) {
              const a = Math.atan2(P.pos.x - e.pos.x, P.pos.z - e.pos.z) + (k - (n - 1) / 2) * 0.28;
              G.spawnProjectile({ from: 'enemy', x: e.pos.x + Math.sin(e.yaw) * 2.6, y: e.pos.y + 1.6, z: e.pos.z + Math.cos(e.yaw) * 2.6, vx: Math.sin(a) * 15, vz: Math.cos(a) * 15, r: 0.6, dmg: T.dmg - 8, color: 0xd8e4ff, life: 1.6, web: true });
            }
          }
          if (e.t > 1.2 / rage) { e.setState('chase'); e.cool = 1.0 / rage; }
          break;
        case 'pounce-wind':
          e.moving = false; e.face(e.jt, dt, 6);
          if (e.t > 0.8 / rage) { e.setState('pounce'); e.j0 = { x: e.pos.x, z: e.pos.z }; GWAudio.sfx('roar'); }
          break;
        case 'pounce': {
          const k = Math.min(1, e.t / 0.55);
          e.pos.x = GW.lerp(e.j0.x, e.jt.x, k); e.pos.z = GW.lerp(e.j0.z, e.jt.z, k); e.hop = Math.sin(k * Math.PI) * 4.5;
          if (k >= 1) {
            e.hop = 0; GWAudio.sfx('slam'); G.shake(1.0);
            G.parts.dust.burst(e.pos.x, e.pos.y + 0.3, e.pos.z, 40, 8, 0x8a8078, 0.9, 1.5, -4, 2);
            if (Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z) < 4.2) G.hurtPlayer(T.dmg + 8, e.pos, { heavy: true });
            e.setState('recover');
          }
          break;
        }
        case 'rain':
          e.moving = false;
          if (e.t > 0.4 && !e.didHit) {
            e.didHit = true; GWAudio.sfx('cast');
            for (let k = 0; k < 6; k++) {
              const x = P.pos.x + (k ? (Math.random() - 0.5) * 9 : 0), z = P.pos.z + (k ? (Math.random() - 0.5) * 9 : 0);
              G.telegraph({ shape: 'circle', x, z, r: 1.8, dur: 1.0 });
              setTimeout(() => { if (!e.alive) return; G.webBurst(x, z);
                if (Math.hypot(G.player.pos.x - x, G.player.pos.z - z) < 2.1) { G.hurtPlayer(T.dmg - 6, { x, y: 0, z }, {}); G.player.webbed = 2.2; } }, 1000);
            }
          }
          if (e.t > 1.6) { e.setState('chase'); e.cool = 0.8; }
          break;
        case 'recover': e.moving = false; if (e.t > 0.9 / rage) { e.setState('chase'); e.cool = 0.5; } break;
        default: {
          if (e.state !== 'chase') e.setState('chase');
          if (dP > 4.4) e.moveTo(P.pos.x, P.pos.z, T.speed * rage, dt); else { e.moving = false; e.face(P.pos, dt, 3); }
          if (e.cool <= 0) {
            const r = Math.random();
            if (dP < 5.5 && r < 0.6) { e.setState('stab'); G.telegraph({ shape: 'cone', x: e.pos.x, z: e.pos.z, r: 5.0, half: 0.8, dur: 0.7 / rage, follow: e, followYaw: true, yaw: e.yaw }); }
            else if (ph >= 2 && dP > 6 && r < 0.45) { e.jt = { x: P.pos.x, z: P.pos.z }; e.setState('pounce-wind'); G.telegraph({ shape: 'circle', x: P.pos.x, z: P.pos.z, r: 4.2, dur: 0.8 / rage + 0.55 }); }
            else if (ph === 3 && r < 0.7) e.setState('rain');
            else if (dP > 5) e.setState('web');
            else e.cool = 0.3;
          }
        }
      }
    },
    anim(e, dt) {
      const W = GW.World, cy = Math.cos(e.yaw), sy = Math.sin(e.yaw);
      e.ph = (e.ph || 0) + dt * (e.moving ? 7 : 1.5);
      const bob = Math.sin(e.ph * 2) * (e.moving ? 0.08 : 0.03);
      e.body.position.y = (e.hop || 0) + bob;
      let pitch = 0; const st = e.state;
      if (st === 'stab') pitch = e.t < 0.7 ? -0.25 * Math.min(1, e.t / 0.5) : 0.18;
      if (st === 'roar' || st === 'pounce-wind' || st === 'web') pitch = -0.22;
      e.body.rotation.x = GW.lerp(e.body.rotation.x, pitch, Math.min(1, dt * 8));
      e.abd.rotation.x = Math.sin(e.ph * 0.7) * 0.05;
      e.fangs.forEach((f, i) => { f.rotation.z = (i ? -1 : 1) * (0.15 + 0.2 * Math.max(0, Math.sin(e.t * (st === 'roar' ? 18 : 3)))); });
      const pulse = 0.8 + 0.3 * Math.sin(e.t * 4) + (e.phase - 1) * 0.35;
      e.eyeMat.uniforms.uEmissive.value.setRGB(1.0 * pulse, 0.18 * pulse, 0.1 * pulse);
      // ---- legs: tetrapod gait with 2-bone IK (knees high, like a spider) ----
      const bodyY = e.pos.y + 2.0 + (e.hop || 0) + bob;
      const groupStep = Math.floor(e.ph / Math.PI) % 2;
      for (let i = 0; i < 8; i++) {
        const g = e.legs[i], a = g.ang + e.yaw;
        const hx = e.pos.x + Math.sin(e.yaw) * 0.6 + Math.sin(a) * 0.9, hz = e.pos.z + Math.cos(e.yaw) * 0.6 + Math.cos(a) * 0.9;
        _a.set(hx, bodyY + 0.1, hz);                                           // hip
        const reach = 4.6 + (Math.abs(g.ang) > 2 ? 0.3 : 0);
        let rx = e.pos.x + Math.sin(a) * reach, rz = e.pos.z + Math.cos(a) * reach;
        if (st === 'stab' && i < 2) { const k = e.t < 0.7 ? Math.min(1, e.t / 0.5) : 0; rx += sy * 1.5 * (e.t < 0.7 ? 1 : 0.4); rz += cy * 1.5 * (e.t < 0.7 ? 1 : 0.4); g.lift = 2.6 * k; } else g.lift = 0;
        if (!e._init) { g.foot.set(rx, W.groundY(rx, rz), rz); g.t = 1; }
        let off = Math.hypot(g.foot.x - rx, g.foot.z - rz);
        // a foot left far behind (fast moves, knock-back, a pounce) snaps back under the body instead of stretching the leg
        if (off > 4.5 || Math.hypot(g.foot.x - _a.x, g.foot.z - _a.z) > 6.4) { g.foot.set(rx, W.groundY(rx, rz), rz); g.t = 1; off = 0; }
        if (g.t >= 1 && (off > 1.6 || (e.moving && off > 0.7 && g.grp === groupStep)) && !e.hop) { g.from.copy(g.foot); g.to.set(rx, W.groundY(rx, rz), rz); g.t = 0; }
        if (g.t < 1) {
          g.t = Math.min(1, g.t + dt * (e.moving ? 6.5 : 4));
          g.foot.lerpVectors(g.from, g.to, g.t); g.foot.y += Math.sin(g.t * Math.PI) * 0.9;
        }
        if (e.hop) { g.foot.set(GW.lerp(g.foot.x, rx, 0.3), GW.lerp(g.foot.y, bodyY - 1.2, 0.3), GW.lerp(g.foot.z, rz, 0.3)); }
        _b.copy(g.foot); _b.y += g.lift || 0;
        // knee: solve in the vertical plane through hip and foot
        const L1 = 3.0, L2 = 3.3, dx = _b.x - _a.x, dz = _b.z - _a.z, h = Math.hypot(dx, dz), dy = _b.y - _a.y;
        const D = Math.min(L1 + L2 - 0.01, Math.hypot(h, dy));
        const ca = (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), base = Math.atan2(dy, h), ang1 = base + Math.acos(GW.clamp(ca, -1, 1));
        const kx = _a.x + dx / (h || 1) * Math.cos(ang1) * L1, ky = _a.y + Math.sin(ang1) * L1, kz = _a.z + dz / (h || 1) * Math.cos(ang1) * L1;
        _d.set(kx, ky, kz);
        const ankle = new V3().lerpVectors(_d, _b, 0.72); ankle.y += 0.25;
        setSeg(g.segs[0], _a, _d, 0.24); setSeg(g.segs[1], _d, ankle, 0.19); setSeg(g.segs[2], ankle, _b, 0.12);
        g.segs.forEach(m => { m.visible = e.model.visible; });
      }
      e._init = true;
    },
    onDeath(e) { GW.World.lights.remove(e.light); },
  };

  // ======================================================================
  // NPCs
  // ======================================================================
  function NPC(scene, kind, x, z, o) {
    o = o || {}; this.role = o.role; this.region = o.region;
    this.kind = kind; this.pos = new V3(x, GW.World.heightAt(x, z), z); this.yaw = 0; this.t = Math.random() * 5;
    const g = this.model = new THREE.Group(); scene.add(g); g.position.copy(this.pos);
    shadow(scene, 0.7).position.set(x, this.pos.y + 0.03, z);
    if (kind === 'villager') {
      // traders and quest-givers in the region villages: robe, hood, a pack or a staff
      this.name = o.name;
      const robe = GW.mat({ id: ID.CLOTH, color: o.col || 0x5a4a3a, rim: 0.4 }), skin = GW.mat({ id: ID.BODY, color: 0xc0a088 }), wood = GW.mat({ id: ID.WOOD, color: 0x5a3e26 });
      part(g, new THREE.ConeGeometry(0.55, 1.6, 10), robe, 0, 0.8, 0);
      part(g, new THREE.SphereGeometry(0.19, 8, 6), skin, 0, 1.75, 0.03);
      part(g, new THREE.ConeGeometry(0.28, 0.45, 10), robe, 0, 1.95, -0.03);
      if (o.role === 'trader') { part(g, box(0.5, 0.6, 0.3), wood, 0, 1.25, -0.35); }
      else part(g, new THREE.CylinderGeometry(0.04, 0.05, 2.0, 5), wood, -0.42, 1.0, 0.15);
    } else if (kind === 'elder') {
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

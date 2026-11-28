// Glyphwake: abilities. A library of glyph-arts the hero collects (found, bought, crafted or torn from bosses),
// four of which are slotted on keys 1-4. Each ability: start(P,G) when cast, tick(P,G,dt,c) per frame -> {vx,vz},
// anim(P,R,b,fresh,k) for the pose. Effects reuse G.hitEnemy / e.status (burn, poison, slow, root).
(function () {
  'use strict';
  const GW = window.GW, V3 = THREE.Vector3, TAU = Math.PI * 2;
  const near = (G, x, z, r) => G.enemies.filter(e => e.alive && Math.hypot(e.pos.x - x, e.pos.z - z) < r + e.radius);
  const ring = (G, x, y, z, r, n, col, chars, speed) => {
    for (let k = 0; k < n; k++) { const a = k / n * TAU; G.parts.spark.emit(x + Math.cos(a) * r, y + 0.3, z + Math.sin(a) * r, Math.cos(a) * 3, 1.5, Math.sin(a) * 3, 0.6, 1.1, col, -2); }
    G.glyphRing(x, y + 0.6, z, r * 0.6, Math.round(n * 0.6), chars || '*+·', '#' + new THREE.Color(col).getHexString(), speed === undefined ? 7 : speed, 0.5, 16);
  };
  const line = (G, a, b, col) => { for (let k = 0; k <= 10; k++) { const t = k / 10; G.parts.spark.emit(GW.lerp(a.x, b.x, t) + (Math.random() - 0.5) * 0.5, GW.lerp(a.y, b.y, t) + 1.2 + (Math.random() - 0.5) * 0.6, GW.lerp(a.z, b.z, t) + (Math.random() - 0.5) * 0.5, 0, 0, 0, 0.25, 1.1, col, 0); } };
  const slash = (R, fresh, sp, at) => { if (fresh) R.play('Sword_Slash', { loop: false, restart: true, fade: 0.05, at: at || 0, speed: sp || 1.2 }); };
  const cast = (R, fresh, P) => { if (fresh) R.play('Punch_Right', { loop: false, restart: true, fade: 0.05, speed: R.dur('Punch_Right') / P.cur.dur * 0.8 }); };
  const hit = (G, P, e, mult, o) => G.hitEnemy(e, P.ws.dmg * mult, Object.assign({ from: P.pos, melee: true }, o));
  const fwdPos = (P, d) => ({ x: P.pos.x + Math.sin(P.yaw) * d, z: P.pos.z + Math.cos(P.yaw) * d });
  const coneHits = (G, P, range, half, fn) => {
    for (const e of G.enemies) {
      if (!e.alive || P.hitSet.has(e)) continue;
      const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d > range + e.radius) continue;
      if (half < Math.PI && Math.abs(GW.angDiff(P.yaw, Math.atan2(dx, dz))) > half) continue;
      P.hitSet.add(e); fn(e);
    }
  };

  // src: start (known from the beginning) · find (chests, elites, cave floors) · shop (traders; region = where) · craft (anvil recipe) · boss (dropped by that boss)
  const LIST = {
    whirl: { name: 'Whirl', g: '◎', col: '#c8d8ff', cd: 5, fo: 28, dur: 0.72, melee: true, src: 'start', desc: 'Spin and strike everything around you, twice.',
      start(P) { P._wh2 = false; GWAudio.sfx('heavy'); },
      tick(P, G, dt, c) {
        if ((P.t > 0.16 && P.t < 0.3) || (P.t > 0.44 && P.t < 0.58)) {
          if (P.t > 0.44 && !P._wh2) { P.hitSet.clear(); P._wh2 = true; GWAudio.sfx('swing', 1.3); }
          P.meleeHits(G, 3.6, Math.PI, 1.35, true);
        }
        return { vx: c.mv.x * c.speed * 0.45, vz: c.mv.z * c.speed * 0.45 };
      },
      anim(P, R, b, fresh, k) { slash(R, fresh, 1.6, 0.2); b.rotation.y = -(k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2) * TAU * 2; } },
    lunge: { name: 'Lunge', g: '»', col: '#a8f0ff', cd: 6, fo: 20, dur: 0.34, melee: true, src: 'start', desc: 'Dash through enemies, cutting each one. You cannot be hurt during the dash.',
      start(P) { P.iframe = 0.36; GWAudio.sfx('roll'); GWAudio.sfx('swing', 1.4); },
      tick(P, G, dt, c) {
        const sp = 30 * (1 - c.k * 0.7);
        P.meleeHits(G, 2.2, Math.PI, 2.1, true);
        if (Math.random() < 0.8) G.parts.spark.emit(P.pos.x, P.pos.y + 1, P.pos.z, 0, 0.5, 0, 0.3, 1.2, P.trail.color.getHex(), 0);
        return { vx: Math.sin(P.yaw) * sp, vz: Math.cos(P.yaw) * sp };
      },
      anim(P, R, b, fresh) { slash(R, fresh, 1.1); b.rotation.x = 0.3; } },
    burst: { name: 'Glyphburst', g: '✶', col: '#ffb060', cd: 3, fo: 32, dur: 0.36, src: 'start', desc: 'Hurl a ball of rune-fire that explodes on impact.',
      start(P) { P.fired = false; GWAudio.sfx('cast'); },
      tick(P, G) {
        if (P.t > 0.14 && !P.fired) { P.fired = true; const f = P.fwd();
          G.spawnProjectile({ from: 'player', x: P.pos.x + f.x * 1.1, y: P.pos.y + 1.3, z: P.pos.z + f.z * 1.1, vx: f.x * 19, vz: f.z * 19, r: 0.55, dmg: P.ws.dmg * 2.2, color: P.ws.trail, aoe: 3.0, life: 1.2 }); }
      },
      anim(P, R, b, fresh) { cast(R, fresh, P); } },
    ward: { name: 'Ward Sigil', g: '⛨', col: '#7aa8ff', cd: 16, fo: 24, dur: 0.4, src: 'craft', recipe: { runes: { ward: 2 }, ingots: { steel: 1 }, shards: 40 },
      desc: 'A sigil of the wall: for 5 seconds you take 60% less damage and cannot be staggered.',
      start(P, G) { P.wardT = 5; GWAudio.sfx('socket'); ring(G, P.pos.x, P.pos.y + 0.6, P.pos.z, 1.4, 30, 0x7aa8ff, '◇⛨', 4); },
      anim(P, R, b, fresh) { cast(R, fresh, P); } },
    nova: { name: 'Rime Nova', g: '❄', col: '#8ae0ff', cd: 9, fo: 30, dur: 0.45, src: 'craft', region: 'frost', recipe: { runes: { frost: 2 }, ingots: { silver: 1 }, shards: 50 },
      desc: 'Frost bursts out around you: damage, and foes within 5 m are chilled (slowed) for 4 s.',
      start(P) { P.fired = false; GWAudio.sfx('cast'); },
      tick(P, G) {
        if (P.t > 0.2 && !P.fired) { P.fired = true; GWAudio.sfx('zap'); G.shake(0.25);
          ring(G, P.pos.x, P.pos.y, P.pos.z, 2.5, 40, 0x8ae0ff, '*❄·', 9); ring(G, P.pos.x, P.pos.y, P.pos.z, 4.5, 50, 0xd8f4ff, '*·+', 11);
          for (const e of near(G, P.pos.x, P.pos.z, 5)) { e.status.slow = 4; hit(G, P, e, 1.2, { brk: 1.2 }); } }
      },
      anim(P, R, b, fresh) { cast(R, fresh, P); } },
    chain: { name: 'Chain Spark', g: 'ϟ', col: '#c8a0ff', cd: 7, fo: 30, dur: 0.38, src: 'craft', recipe: { runes: { storm: 2 }, ingots: { duskglass: 1 }, shards: 50 },
      desc: 'Lightning leaps from your hand to the nearest foe and on to 3 more.',
      start(P) { P.fired = false; GWAudio.sfx('cast'); },
      tick(P, G) {
        if (P.t > 0.14 && !P.fired) { P.fired = true; GWAudio.sfx('zap');
          // the bolt leaves the casting hand
          const hand = new THREE.Vector3(); (P.sword || P.model).getWorldPosition(hand);
          let from = { x: P.pos.x, y: P.pos.y, z: P.pos.z }, left = 4, first = true; const done = new Set();
          G.parts.spark.burst(hand.x, hand.y, hand.z, 16, 3, 0xd8c0ff, 0.35, 1.2, 0);
          const lt = GW.World.lights.add(hand.x, hand.y, hand.z, new THREE.Color(0.75, 0.6, 1.0).multiplyScalar(2), 7, 0.5); setTimeout(() => GW.World.lights.remove(lt), 200);
          while (left-- > 0) {
            const t = G.enemies.filter(e => e.alive && !done.has(e) && Math.hypot(e.pos.x - from.x, e.pos.z - from.z) < (done.size ? 7 : 11))
              .sort((a, b) => Math.hypot(a.pos.x - from.x, a.pos.z - from.z) - Math.hypot(b.pos.x - from.x, b.pos.z - from.z))[0];
            if (!t) break; done.add(t);
            if (first) { G.bolt({ x: hand.x, y: 0, z: hand.z }, t.pos, '#d8c0ff', { ay: hand.y }); first = false; } else G.bolt(from, t.pos, '#c8a0ff');
            G.hitEnemy(t, P.ws.dmg * 1.5, { chain: true, from: P.pos, brk: 1 }); from = t.pos;
          }
          if (!done.size) {   // nothing in reach: the bolt crackles out and grounds itself
            const f = P.fwd(); G.bolt({ x: hand.x, y: 0, z: hand.z }, { x: P.pos.x + f.x * 6, y: P.pos.y, z: P.pos.z + f.z * 6 }, '#d8c0ff', { ay: hand.y, by: 0.1 });
          }
        }
      },
      anim(P, R, b, fresh) { cast(R, fresh, P); } },
    slam: { name: 'Earthsplitter', g: '▼', col: '#e0c090', cd: 10, fo: 34, dur: 0.72, melee: true, src: 'find',
      desc: 'Leap forward and smash the ground. Huge break damage to everything within 4 m.',
      start(P) { P.fired = false; P.iframe = 0.5; GWAudio.sfx('heavy'); },
      tick(P, G, dt, c) {
        if (P.t > 0.5 && !P.fired) { P.fired = true; GWAudio.sfx('slam'); G.shake(0.6); G.hitstop = 0.08;
          G.parts.dust.burst(P.pos.x, P.pos.y + 0.2, P.pos.z, 30, 6, 0x8a8070, 0.8, 1.4, 0);
          ring(G, P.pos.x, P.pos.y, P.pos.z, 3.5, 40, 0xe0c090, '#/\\%', 8);
          for (const e of near(G, P.pos.x, P.pos.z, 4)) hit(G, P, e, 2.4, { heavy: true, brk: 4 }); }
        return P.t < 0.5 ? { vx: Math.sin(P.yaw) * 11, vz: Math.cos(P.yaw) * 11 } : { vx: 0, vz: 0 };
      },
      anim(P, R, b, fresh, k) { slash(R, fresh, 0.9); b.position.y = Math.sin(Math.min(1, k / 0.7) * Math.PI) * 1.4; } },
    volley: { name: 'Rune Volley', g: '⁂', col: '#ffd890', cd: 6, fo: 30, dur: 0.4, src: 'shop', region: 'vale',
      desc: 'Five rune-bolts in a fan. Good against a crowd at range.',
      start(P) { P.fired = false; GWAudio.sfx('cast'); },
      tick(P, G) {
        if (P.t > 0.15 && !P.fired) { P.fired = true;
          for (let i = -2; i <= 2; i++) { const a = P.yaw + i * 0.2, fx = Math.sin(a), fz = Math.cos(a);
            G.spawnProjectile({ from: 'player', x: P.pos.x + fx, y: P.pos.y + 1.3, z: P.pos.z + fz, vx: fx * 22, vz: fz * 22, r: 0.35, dmg: P.ws.dmg * 0.95, color: 0xffd890, aoe: 0, life: 0.9, direct: true }); } }
      },
      anim(P, R, b, fresh) { cast(R, fresh, P); } },
    blink: { name: 'Inkstep', g: '◌', col: '#9a8aff', cd: 5, fo: 18, dur: 0.22, src: 'find',
      desc: 'Dissolve into ink and reappear up to 9 m ahead. Your next hit is a critical.',
      start(P, G) {
        const W = GW.World; let d = 0;
        while (d < 9) { const p = fwdPos(P, d + 0.5); if (W.blocked(p.x, p.z, 0.4)) break; d += 0.5; }
        const to = fwdPos(P, d); P.blink = { fx: P.pos.x, fz: P.pos.z, tx: to.x, tz: to.z, arrived: false };
        P.iframe = 0.36; P.critNext = true; GWAudio.sfx('roll'); GWAudio.sfx('cast');
        // the body comes apart: ink characters lift off where you stood
        for (let k = 0; k < 34; k++) { const a = Math.random() * TAU, r = Math.random() * 0.5;
          G.hitGlyphs.push({ x: P.pos.x + Math.cos(a) * r, y: P.pos.y + 0.2 + Math.random() * 1.8, z: P.pos.z + Math.sin(a) * r, vx: Math.cos(a) * 1.5, vy: 1.5 + Math.random() * 2.5, vz: Math.sin(a) * 1.5, ng: true, t: 0, life: 0.5 + Math.random() * 0.3,
            ch: '▓▒░%#&'[k % 6], col: k % 3 ? '#9a8aff' : '#3a2a6a', size: 16 }); }
        // the streak along the way
        for (let k = 1; k < 18; k++) { const t = k / 18;
          G.hitGlyphs.push({ x: GW.lerp(P.pos.x, to.x, t), y: P.pos.y + 0.6 + Math.sin(t * Math.PI) * 0.4, z: GW.lerp(P.pos.z, to.z, t), still: true, t: -t * 0.1, life: 0.35, ch: k % 2 ? '≈' : '~', col: '#b8a8ff', size: 15 }); }
      },
      tick(P, G) {
        const B = P.blink; if (!B) return;
        const k = Math.min(1, P.t / 0.12); P.pos.x = GW.lerp(B.fx, B.tx, k); P.pos.z = GW.lerp(B.fz, B.tz, k);
        if (k >= 1 && !B.arrived) { B.arrived = true;   // ink gathers back into a body
          G.glyphRing(P.pos.x, P.pos.y + 1.0, P.pos.z, 1.6, 22, '▓▒░%#', '#9a8aff', -11, 0.15, 16);
          G.parts.spark.burst(P.pos.x, P.pos.y + 1, P.pos.z, 16, 2, 0x9a8aff, 0.5, 1, 0); }
        return { vx: 0, vz: 0 };
      },
      anim(P, R, b) { P.model.visible = P.t > 0.12 || P.state !== 'skill'; b.position.y = -0.3 * (1 - Math.min(1, Math.max(0, P.t - 0.12) / 0.1)); } },
    leech: { name: 'Bloodglyph', g: '♁', col: '#ff5a6a', cd: 9, fo: 30, dur: 0.5, melee: true, src: 'craft', recipe: { runes: { thirst: 2 }, ingots: { gold: 1 }, shards: 60 },
      desc: 'A wide red cut. You heal for 40% of the damage it deals.',
      start() { GWAudio.sfx('swing', 1.2); },
      tick(P, G) {
        if (P.t > 0.16 && P.t < 0.3) coneHits(G, P, 3.4, 1.3, e => { const h0 = e.hp; hit(G, P, e, 1.7, { brk: 1 }); P.hp = Math.min(P.maxHp, P.hp + Math.max(0, h0 - e.hp) * 0.4);
          for (let q = 0; q < 8; q++) G.hitGlyphs.push({ x: e.pos.x, y: e.pos.y + 1.1, z: e.pos.z, vx: (P.pos.x - e.pos.x) * 3 + (Math.random() - 0.5) * 2, vy: 1 + Math.random(), vz: (P.pos.z - e.pos.z) * 3 + (Math.random() - 0.5) * 2, ng: true, t: -q * 0.03, life: 0.4, ch: '♥+*'[q % 3], col: '#ff5a6a', size: 15 });
          G.parts.blood.burst(e.pos.x, e.pos.y + 1, e.pos.z, 8, 3, 0xd02040, 0.6, 1, -6); });
      },
      anim(P, R, b, fresh) { slash(R, fresh, 1.3); } },
    cry: { name: 'War Cry', g: '‼', col: '#ffcf6a', cd: 20, fo: 20, dur: 0.6, src: 'shop', region: 'high',
      desc: '8 s of +25% damage, +50 stamina, and nearby foes reel.',
      start(P, G) { P.mightT = 8; P.st = Math.min(100, P.st + 50); GWAudio.sfx('roar'); G.shake(0.3);
        ring(G, P.pos.x, P.pos.y + 0.5, P.pos.z, 2, 36, 0xffcf6a, '!)(', 10); ring(G, P.pos.x, P.pos.y + 1.2, P.pos.z, 1.2, 24, 0xffe8a0, '!', 6);
        for (const e of near(G, P.pos.x, P.pos.z, 6)) if (!e.T.boss) { e.setState('stagger'); e.aggro = true; } },
      anim(P, R, b, fresh) { if (fresh) R.play('Interact', { loop: false, restart: true, fade: 0.05 }); b.rotation.x = -0.25; } },
    hook: { name: 'Ink Chain', g: '⌐', col: '#a0a8c0', cd: 7, fo: 16, dur: 0.4, src: 'find',
      desc: 'Throw a chain of glyphs. The first foe ahead (up to 12 m) is dragged to you and reels.',
      start(P, G) {
        let best = null, bd = 13;
        for (const e of G.enemies) { if (!e.alive) continue; const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz);
          if (d < bd && Math.abs(GW.angDiff(P.yaw, Math.atan2(dx, dz))) < 0.5) { bd = d; best = e; } }
        GWAudio.sfx('swing', 0.8);
        const miss = fwdPos(P, 12);
        P.hook = { e: best, latched: false, mx: miss.x, mz: miss.z, sx: best ? best.pos.x : 0, sz: best ? best.pos.z : 0 };
      },
      tick(P, G) {
        const H = P.hook; if (!H) return;
        const hand = new THREE.Vector3(); (P.sword || P.model).getWorldPosition(hand);
        const e = H.e && H.e.alive ? H.e : null, T_OUT = 0.13, T_PULL = 0.36;
        let tip;
        if (P.t < T_OUT) {   // the chain flies out
          const k = P.t / T_OUT, tx = e ? e.pos.x : H.mx, tz = e ? e.pos.z : H.mz, ty = e ? e.pos.y + 1.0 : P.pos.y + 1.0;
          tip = { x: GW.lerp(hand.x, tx, k), y: GW.lerp(hand.y, ty, k), z: GW.lerp(hand.z, tz, k) };
        } else if (e) {
          if (!H.latched) { H.latched = true; GWAudio.sfx('block'); hit(G, P, e, 0.8, { brk: 1.5 }); if (!e.T.boss) { e.setState('stagger'); H.sx = e.pos.x; H.sz = e.pos.z; } G.addHitGlyphs(e.pos.x, e.pos.y + 1, e.pos.z, 8, '#c8ccd8'); }
          if (!e.T.boss && P.t < T_PULL) {   // reel it in
            const k = (P.t - T_OUT) / (T_PULL - T_OUT), q = 1 - Math.pow(1 - k, 3), dest = fwdPos(P, 1.8 + e.radius);
            e.pos.x = GW.lerp(H.sx, dest.x, q); e.pos.z = GW.lerp(H.sz, dest.z, q);
            if (Math.random() < 0.6) G.parts.dust.emit(e.pos.x, e.pos.y + 0.1, e.pos.z, 0, 0.5, 0, 0.4, 0.9, 0x8a8070, 0);
          }
          tip = { x: e.pos.x, y: e.pos.y + 1.0, z: e.pos.z };
        } else {   // missed: it snaps back
          const k = Math.min(1, (P.t - T_OUT) / 0.15);
          tip = { x: GW.lerp(H.mx, hand.x, k), y: P.pos.y + 1.0, z: GW.lerp(H.mz, hand.z, k) };
        }
        if (P.t < T_PULL + 0.02 && Math.hypot(tip.x - hand.x, tip.z - hand.z) > 0.4) G.glyphChain(hand, tip, '#d8dce8', '#8a7aff');
        return { vx: 0, vz: 0 };
      },
      anim(P, R, b, fresh) { cast(R, fresh, P); b.rotation.x = P.t > 0.13 ? -0.18 : 0.1; } },
    snare: { name: 'Web Snare', g: '⌗', col: '#e0e8ff', cd: 12, fo: 26, dur: 0.4, src: 'boss', boss: 'widow',
      desc: 'Torn from the Dusk Widow. Sticky silk roots every foe within 6 m for 3 s.',
      start(P, G) { G.webBurst && G.webBurst(P.pos.x, P.pos.z); GWAudio.sfx('cast');
        for (const e of near(G, P.pos.x, P.pos.z, 6)) { e.status.root = e.T.boss ? 1 : 3; e.status.slow = 5; e.aggro = true; } },
      anim(P, R, b, fresh) { cast(R, fresh, P); } },
    quake: { name: 'Colossus Quake', g: '≋', col: '#d8a060', cd: 14, fo: 40, dur: 0.7, src: 'boss', boss: 'colossus',
      desc: 'Torn from the Ash Colossus. Three shockwaves roll out to 8 m; each one breaks guards.',
      start(P) { P.fired = 0; GWAudio.sfx('heavy'); },
      tick(P, G) {
        const want = P.t > 0.55 ? 3 : P.t > 0.4 ? 2 : P.t > 0.25 ? 1 : 0;
        while (P.fired < want) { P.fired++; const r = 2.6 * P.fired; GWAudio.sfx('slam'); G.shake(0.35);
          ring(G, P.pos.x, P.pos.y, P.pos.z, r, 30 + P.fired * 12, 0xd8a060, '≈~#', 6);
          for (const e of near(G, P.pos.x, P.pos.z, r)) if (Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) > r - 2.8 - e.radius) hit(G, P, e, 1.5, { heavy: true, brk: 2.5 }); }
      },
      anim(P, R, b, fresh) { slash(R, fresh, 0.8); b.rotation.x = 0.35; } },
    lance: { name: 'Rime Lance', g: '⇶', col: '#bfefff', cd: 8, fo: 30, dur: 0.42, src: 'boss', boss: 'rimeknight',
      desc: 'Torn from the Rime Knight. A spear of ice that pierces every foe in a line and chills them.',
      start(P) { P.fired = false; GWAudio.sfx('cast'); },
      tick(P, G) {
        if (P.t > 0.16 && !P.fired) { P.fired = true; const f = P.fwd();
          G.spawnProjectile({ from: 'player', x: P.pos.x + f.x, y: P.pos.y + 1.3, z: P.pos.z + f.z, vx: f.x * 30, vz: f.z * 30, r: 0.5, dmg: P.ws.dmg * 2.0, color: 0xbfefff, aoe: 0, life: 0.8, pierce: true, chill: 4 }); }
      },
      anim(P, R, b, fresh) { cast(R, fresh, P); } },
    blight: { name: 'Blight Cloud', g: '☁', col: '#8aff6a', cd: 12, fo: 32, dur: 0.4, src: 'boss', boss: 'mirehag',
      desc: 'Torn from the Mire Hag. A poison cloud 6 m ahead that sickens anything inside for 6 s.',
      start(P, G) { const p = fwdPos(P, 6); GWAudio.sfx('cast'); A.zones.push({ x: p.x, z: p.z, r: 4, t: 6, tick: 0, dmg: P.ws.dmg * 0.35 }); },
      anim(P, R, b, fresh) { cast(R, fresh, P); } },
    skyfall: { name: 'Skyfall', g: '⇓', col: '#ff9050', cd: 15, fo: 42, dur: 0.95, melee: true, src: 'boss', boss: 'cragwarlord',
      desc: 'Torn from the Crag Warlord. Leap high, crash down in fire: 6 m blast that sets foes burning.',
      start(P) { P.fired = false; P.iframe = 0.9; GWAudio.sfx('roar'); },
      tick(P, G) {
        if (P.t > 0.72 && !P.fired) { P.fired = true; GWAudio.sfx('boom'); GWAudio.sfx('slam'); G.shake(0.9); G.hitstop = 0.12;
          G.parts.spark.burst(P.pos.x, P.pos.y + 0.4, P.pos.z, 50, 9, 0xff9050, 0.9, 1.4, -4, 2);
          ring(G, P.pos.x, P.pos.y, P.pos.z, 5, 60, 0xff6a2a, '*#^%', 10);
          for (const e of near(G, P.pos.x, P.pos.z, 6)) { hit(G, P, e, 3.2, { heavy: true, brk: 4 }); if (e.alive) { e.status.burn = 3; e.status.burnD = Math.max(1, P.ws.dmg * 0.3); } } }
        return P.t < 0.72 ? { vx: Math.sin(P.yaw) * 8, vz: Math.cos(P.yaw) * 8 } : { vx: 0, vz: 0 };
      },
      anim(P, R, b, fresh, k) { slash(R, fresh, 0.7); b.position.y = Math.sin(Math.min(1, k / 0.76) * Math.PI) * 3.2; } },
  };
  const A = GW.Abil = { LIST, zones: [], DEFAULT: [null, 'whirl', 'lunge', 'burst'] };
  A.FIND = Object.keys(LIST).filter(k => LIST[k].src === 'find');
  A.BOSS = {}; for (const k in LIST) if (LIST[k].boss) A.BOSS[LIST[k].boss] = k;
  A.where = k => { const a = LIST[k]; return { start: 'known from the start', find: 'found in chests, caves and on elites', shop: 'sold by traders' + (a.region ? ' in ' + (GW.World.REGIONS[a.region] || {}).name : ''),
    craft: 'crafted at an anvil', boss: 'dropped by a boss' }[a.src]; };
  // ensure the save carries a book; migrate old saves
  A.ensure = function (P) {
    const inv = P.inv; if (!inv.abil) inv.abil = { known: {}, slots: A.DEFAULT.slice() };
    for (const k in LIST) if (LIST[k].src === 'start') inv.abil.known[k] = 1;
    inv.abil.slots = (inv.abil.slots || []).slice(0, 4); while (inv.abil.slots.length < 4) inv.abil.slots.push(null);
    inv.abil.slots = inv.abil.slots.map(k => (k && LIST[k] && inv.abil.known[k]) ? k : null);
    return inv.abil;
  };
  A.learn = function (P, k) {
    const b = A.ensure(P); if (b.known[k]) return false; b.known[k] = 1;
    const free = b.slots.indexOf(null); if (free >= 0) b.slots[free] = k;
    return true;
  };
  A.canCraft = function (P, k) {
    const r = LIST[k].recipe, inv = P.inv; if (!r) return false;
    for (const x in r.runes || {}) if ((inv.runes[x] || 0) < r.runes[x]) return false;
    for (const x in r.ingots || {}) if ((inv.ingots[x] || 0) < r.ingots[x]) return false;
    return (inv.shards || 0) >= (r.shards || 0);
  };
  A.craft = function (P, k) {
    if (!A.canCraft(P, k)) return false; const r = LIST[k].recipe, inv = P.inv;
    for (const x in r.runes || {}) inv.runes[x] -= r.runes[x];
    for (const x in r.ingots || {}) inv.ingots[x] -= r.ingots[x];
    inv.shards -= r.shards || 0; return A.learn(P, k);
  };
  A.recipeText = function (k) {
    const r = LIST[k].recipe, F = GW.Forge, out = []; if (!r) return '';
    for (const x in r.runes || {}) out.push(F.RUNES[x].g + ' ' + F.RUNES[x].name + ' rune ×' + r.runes[x]);
    for (const x in r.ingots || {}) out.push(F.METALS[x].name + ' ingot ×' + r.ingots[x]);
    if (r.shards) out.push('◈ ' + r.shards); return out.join(' · ');
  };
  // lingering zones (blight cloud)
  A.update = function (G, dt) {
    A.zones = A.zones.filter(z => {
      z.t -= dt; z.tick -= dt;
      if (Math.random() < 0.9) { const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * z.r, y = GW.World.heightAt(z.x, z.z);
        G.parts.spark.emit(z.x + Math.cos(a) * r, y + 0.3 + Math.random(), z.z + Math.sin(a) * r, 0, 0.6, 0, 1.2, 1.4, 0x7aff5a, 0);
        if (Math.random() < 0.6) G.hitGlyphs.push({ x: z.x + Math.cos(a) * r, y: y + 0.3 + Math.random() * 1.2, z: z.z + Math.sin(a) * r, vx: (Math.random() - 0.5) * 0.6, vy: 0.5, vz: (Math.random() - 0.5) * 0.6, ng: true, t: 0, life: 0.9, ch: '~%;:'[Math.floor(Math.random() * 4)], col: Math.random() < 0.5 ? '#8aff6a' : '#5ab84a', size: 15 }); }
      if (z.tick <= 0) { z.tick = 0.5;
        for (const e of near(G, z.x, z.z, z.r)) { e.status.poison = Math.max(e.status.poison, 2); e.status.poisonD = Math.max(e.status.poisonD || 0, z.dmg); e.aggro = true; } }
      return z.t > 0;
    });
  };
})();

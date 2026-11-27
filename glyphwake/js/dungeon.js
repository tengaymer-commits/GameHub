// Glyphwake: instanced dungeons. Levels are built far outside the world (x >= 20 km) while the
// overworld is hidden, then torn down when you leave.
//
// Seven layouts, each with its own shape and dressing, all sharing one Skyrim-like structure:
//   entry -> a route through rooms (side rooms branch off it) -> a raised reward chamber.
//   Halfway along, a portcullis bars the way; its lever is in a guarded side room.
//   Some dead lie dormant in sarcophagi and niches and rise as you pass. Corridors hide pressure plates.
//   From the reward chamber a sealed passage leads back to the entrance, opened from the far side.
// Every layout varies by seed: size, room count, branches, water, pillars, decor.
(function () {
  'use strict';
  const GW = window.GW, ID = GW.ID;
  const TILE = 2, TN = 80;                       // 80 x 80 tiles of 2 m = 160 m per level
  const X0 = 20000;
  const D = GW.Dungeon = { X0, cur: null };
  const STYLE = {
    cave: { wall: { id: ID.ROCK, tex: 6, color: 0x6a6660, fill: 0.08 }, floor: { id: ID.ROCK, tex: 6, color: 0x4a4744, fill: 0.06 }, trim: { id: ID.ROCK, tex: 6, color: 0x7a7670 }, torch: 1.0,
      layouts: ['cavern', 'mine', 'flooded'] },
    castle: { wall: { id: ID.MASONRY, tex: 8, color: 0x8a8c90, fill: 0.1 }, floor: { id: ID.MASONRY, tex: 8, color: 0x5a5c60, fill: 0.08 }, trim: { id: ID.MASONRY, tex: 8, color: 0x9a9ca0 }, torch: 1.5,
      layouts: ['pillared', 'chapel', 'pillared'] },
    tomb: { wall: { id: ID.MASONRY, tex: 1, color: 0x5e6070, fill: 0.08 }, floor: { id: ID.MASONRY, tex: 8, color: 0x44464e, fill: 0.08 }, trim: { id: ID.MASONRY, tex: 1, color: 0x7a7c88 }, torch: 1.0,
      layouts: ['crypt', 'chapel', 'descent', 'flooded', 'pillared'] },
  };
  D.LAYOUTS = { crypt: 'CRYPT HALLS', flooded: 'THE FLOODED CISTERN', pillared: 'THE PILLARED HALLS', cavern: 'THE WARREN', descent: 'THE DESCENT', mine: 'THE OLD MINE', chapel: 'THE SUNKEN CHAPEL' };

  // ---------------------------------------------------------------- layout on a tile grid
  // floor: 1 walkable; H: tile height; water: tile water surface (or NaN); stair: 1 if the tile is a stair
  function plan(rnd, kind, name) {
    const F = new Uint8Array(TN * TN), H = new Float32Array(TN * TN), WA = new Float32Array(TN * TN).fill(NaN), ST = new Uint8Array(TN * TN);
    const rooms = [], corridors = [], props = [], spawns = [], chests = [], plates = [], gates = [], levers = [];
    const I = (x, z) => z * TN + x, inb = (x, z) => x > 1 && z > 1 && x < TN - 2 && z < TN - 2;
    const carve = (x0, z0, x1, z1, h) => { for (let z = Math.max(2, z0); z <= Math.min(TN - 3, z1); z++) for (let x = Math.max(2, x0); x <= Math.min(TN - 3, x1); x++) { F[I(x, z)] = 1; if (h !== undefined) H[I(x, z)] = h; } };
    const R = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const P = {   // per-layout parameters
      crypt: { main: [4, 5], side: [2, 3], w: [14, 20], h: [5, 6], cw: 3, drop: 0 },
      flooded: { main: [3, 4], side: [1, 2], w: [14, 18], h: [11, 14], cw: 3, drop: 0 },
      pillared: { main: [3, 4], side: [2, 3], w: [12, 16], h: [12, 15], cw: 3, drop: 0 },
      cavern: { main: [4, 6], side: [2, 3], w: [9, 14], h: [9, 13], cw: 3, drop: 0 },
      descent: { main: [4, 5], side: [1, 2], w: [9, 12], h: [9, 12], cw: 3, drop: 1.3 },
      mine: { main: [5, 6], side: [2, 3], w: [7, 10], h: [6, 9], cw: 2, drop: 0.3 },
      chapel: { main: [3, 4], side: [2, 2], w: [18, 22], h: [9, 11], cw: 3, drop: 0 },
    }[name];
    const overlaps = (r, pad) => rooms.some(o => r.x0 - pad < o.x1 && r.x1 + pad > o.x0 && r.z0 - pad < o.z1 && r.z1 + pad > o.z0);
    const tryRoom = (fromRoom, type, w, h) => {
      for (let t = 0; t < 80; t++) {
        let x0, z0;
        if (!fromRoom) { x0 = 3; z0 = Math.floor(TN / 2 - h / 2); }
        else {
          const ang = type === 'main' ? (rnd() - 0.5) * 1.6 : (rnd() < 0.5 ? -1 : 1) * (Math.PI / 2 + (rnd() - 0.5) * 0.8);
          const d = (fromRoom.x1 - fromRoom.x0 + w) / 2 + 4 + rnd() * 5;
          x0 = Math.round(fromRoom.cx + Math.cos(ang) * d - w / 2); z0 = Math.round(fromRoom.cz + Math.sin(ang) * d - h / 2);
        }
        const r = { x0, z0, x1: x0 + w - 1, z1: z0 + h - 1, type };
        if (!inb(r.x0 - 1, r.z0 - 1) || !inb(r.x1 + 1, r.z1 + 1) || overlaps(r, 3)) continue;
        r.cx = Math.floor((r.x0 + r.x1) / 2); r.cz = Math.floor((r.z0 + r.z1) / 2); return r;
      }
      return null;
    };
    // corridor between two rooms (L-shaped), with a height ramp; returns the tiles it laid
    const corridor = (a, b, cw, tag) => {
      const tiles = [], h0 = a.h, h1 = b.h, horizFirst = rnd() < 0.5;
      const lay = (x, z) => { for (let o = -Math.floor((cw - 1) / 2); o <= Math.floor(cw / 2); o++) { const tx = horizFirst ? x : x + o, tz = horizFirst ? z + o : z; } };
      void lay;
      const pts = []; let x = a.cx, z = a.cz;
      const tx = b.cx, tz = b.cz;
      const step = (nx, nz) => { pts.push([nx, nz]); };
      if (horizFirst) { while (x !== tx) { x += Math.sign(tx - x); step(x, z); } while (z !== tz) { z += Math.sign(tz - z); step(x, z); } }
      else { while (z !== tz) { z += Math.sign(tz - z); step(x, z); } while (x !== tx) { x += Math.sign(tx - x); step(x, z); } }
      const n = pts.length;
      pts.forEach(([px, pz], k) => {
        for (let oz = -Math.floor((cw - 1) / 2); oz <= Math.floor(cw / 2); oz++) for (let ox = -Math.floor((cw - 1) / 2); ox <= Math.floor(cw / 2); ox++) {
          const qx = px + ox, qz = pz + oz; if (!inb(qx, qz)) continue;
          const inRoom = rooms.some(r => qx >= r.x0 && qx <= r.x1 && qz >= r.z0 && qz <= r.z1);
          if (!inRoom) { F[I(qx, qz)] = 1; const t = GW.clamp((k - n * 0.25) / (n * 0.5), 0, 1); H[I(qx, qz)] = h0 + (h1 - h0) * t; if (Math.abs(h1 - h0) > 0.2 && t > 0 && t < 1) ST[I(qx, qz)] = 1; tiles.push([qx, qz]); }
        }
      });
      corridors.push({ a, b, tiles, tag });
      return tiles;
    };
    // ---- the route: main rooms, then side rooms branching off
    const nMain = R(P.main[0], P.main[1]);
    let prev = null, h = name === 'flooded' ? 1.8 : 0;
    for (let i = 0; i < nMain + 1; i++) {   // + the reward chamber
      const last = i === nMain, w = last ? R(10, 13) : R(P.w[0], P.w[1]), hh = last ? R(10, 12) : R(P.h[0], P.h[1]);
      const r = tryRoom(prev, 'main', w, hh); if (!r) break;
      r.h = i === 0 ? h : (prev.h - P.drop * (0.6 + rnd() * 0.8)); if (name === 'flooded' && i === 1) r.h = 0;
      r.i = i; if (last) r.type = 'reward';
      rooms.push(r); carve(r.x0, r.z0, r.x1, r.z1, r.h);
      if (prev) corridor(prev, r, P.cw, 'main');
      prev = r;
    }
    if (rooms.length > 1 && rooms[rooms.length - 1].type !== 'reward') rooms[rooms.length - 1].type = 'reward';   // ran out of room: the last one becomes the reward chamber
    rooms[0].type = 'entry';
    const main = rooms.slice();
    const reward = main[main.length - 1];
    // side rooms (one of them holds the lever for the gate)
    const gateAt = Math.max(1, Math.floor(main.length / 2));   // the gate bars the corridor into main[gateAt]
    const nSide = R(P.side[0], P.side[1]); let leverRoom = null;
    for (let k = 0; k < nSide; k++) {
      const host = main[k === 0 ? Math.max(0, gateAt - 1) : R(0, main.length - 2)];
      const r = tryRoom(host, 'side', R(6, 9), R(6, 8)); if (!r) continue;
      r.h = host.h; r.i = rooms.length; rooms.push(r); carve(r.x0, r.z0, r.x1, r.z1, r.h); corridor(host, r, Math.min(P.cw, 3), 'side');
      if (!leverRoom && host.i < gateAt) leverRoom = r;
    }
    // the shortcut: a passage that runs round the outside of everything, from the reward chamber back to the entry
    const short = [];
    { let zmax = 0, zmin = TN; for (const r of rooms) { zmax = Math.max(zmax, r.z1); zmin = Math.min(zmin, r.z0); }
      const down = zmax + 3 < TN - 3, lane = down ? zmax + 3 : zmin - 3, e = rooms[0];
      if (lane > 2 && lane < TN - 3) {
        const lay = (x, z) => { for (let o = 0; o < 2; o++) { const qx = x, qz = z + o; if (!inb(qx, qz) || F[I(qx, qz)]) continue; F[I(qx, qz)] = 1; H[I(qx, qz)] = GW.lerp(reward.h, e.h, GW.clamp((reward.cx - qx) / Math.max(1, reward.cx - e.cx), 0, 1)); short.push([qx, qz]); } };
        const layV = (x, z) => { for (let o = 0; o < 2; o++) { const qx = x + o, qz = z; if (!inb(qx, qz) || F[I(qx, qz)]) continue; F[I(qx, qz)] = 1; H[I(qx, qz)] = qx > (reward.cx + e.cx) / 2 ? reward.h : e.h; short.push([qx, qz]); } };
        for (let z = down ? reward.z1 + 1 : reward.z0 - 1; down ? z <= lane : z >= lane; z += down ? 1 : -1) layV(reward.cx, z);
        for (let x = reward.cx; x >= e.cx; x--) lay(x, lane);
        for (let z = lane; down ? z > e.z1 : z < e.z0; z += down ? -1 : 1) layV(e.cx, z);
        corridors.push({ a: reward, b: e, tiles: short, tag: 'short' });
      } }
    // ---- layout-specific shaping and dressing
    const inR = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
    const at = (tx, tz) => [tx, tz];
    void at;
    for (const r of rooms) {
      const W = r.x1 - r.x0 + 1, Hh = r.z1 - r.z0 + 1;
      if (name === 'crypt' && r.type === 'main') {   // burial niches along both long walls, each with a sarcophagus
        for (let x = r.x0 + 1; x < r.x1; x += 3) for (const side of [-1, 1]) {
          const z = side < 0 ? r.z0 - 1 : r.z1 + 1; if (!inb(x, z)) continue;
          F[I(x, z)] = 1; H[I(x, z)] = r.h; props.push({ t: 'sarco', x, z: z, ry: side < 0 ? 0 : Math.PI, h: r.h });
          if (rnd() < 0.35) spawns.push({ x, z: side < 0 ? z + 1 : z - 1, room: r.i, dormant: true });
        }
      }
      if (name === 'flooded' && r.type !== 'side') {   // a water channel down the middle, walkways along it, bridges across; pillars line it
        const c0 = r.cz - 1, c1 = r.cz + 1;
        for (let x = r.x0; x <= r.x1; x++) for (let z = c0; z <= c1; z++) { if ((x - r.x0) % 6 === 3) continue; H[I(x, z)] = r.h - 1.1; WA[I(x, z)] = r.h - 0.45; }
        for (let x = r.x0 + 2; x <= r.x1 - 1; x += 4) for (const z of [c0 - 2, c1 + 2]) if (inR(r, x, z)) { props.push({ t: 'pillar', x, z, h: r.h, big: true }); F[I(x, z)] = 2; }
      }
      if ((name === 'pillared' || (name === 'chapel' && r.type === 'side')) && W >= 8 && Hh >= 8) {   // a grid of columns
        for (let x = r.x0 + 2; x <= r.x1 - 2; x += 4) for (let z = r.z0 + 2; z <= r.z1 - 2; z += 4) { props.push({ t: 'pillar', x, z, h: r.h, big: W > 12 }); F[I(x, z)] = 2; }
      }
      if (name === 'chapel' && r.type === 'main') {   // a nave of broken pews; an altar at the far end
        for (let x = r.x0 + 3; x <= r.x1 - 4; x += 2) for (const z of [r.cz - 2, r.cz + 2]) if (rnd() < 0.8) props.push({ t: 'pew', x, z, h: r.h, ry: (rnd() - 0.5) * 0.3 });
        props.push({ t: 'altar', x: r.x1 - 2, z: r.cz, h: r.h });
        for (const z of [r.z0 + 1, r.z1 - 1]) for (let x = r.x0 + 2; x <= r.x1 - 2; x += 5) props.push({ t: 'pillar', x, z, h: r.h, big: false });
      }
      if (name === 'cavern') {   // ragged edges, stalagmites, a still pool in some caves
        for (let z = r.z0 - 2; z <= r.z1 + 2; z++) for (let x = r.x0 - 2; x <= r.x1 + 2; x++) { if (!inb(x, z)) continue;
          const dx = (x - r.cx) / (W / 2 + 1), dz = (z - r.cz) / (Hh / 2 + 1), d = dx * dx + dz * dz, wob = 0.75 + 0.35 * Math.sin(x * 1.7 + z * 0.9 + r.i);
          if (d < wob) { F[I(x, z)] = 1; H[I(x, z)] = r.h; } else if (inR(r, x, z) && d > wob + 0.25) F[I(x, z)] = 0; }
        const nS = R(3, 7); for (let k = 0; k < nS; k++) { const x = R(r.x0 + 1, r.x1 - 1), z = R(r.z0 + 1, r.z1 - 1); if (F[I(x, z)] === 1 && Math.hypot(x - r.cx, z - r.cz) > 2) { props.push({ t: 'stalag', x, z, h: r.h, s: 0.5 + rnd() * 0.8 }); F[I(x, z)] = 2; } }
        if (r.type === 'main' && rnd() < 0.5) { const px = r.cx + R(-2, 2), pz = r.cz + R(-2, 2); for (let z = pz - 2; z <= pz + 1; z++) for (let x = px - 2; x <= px + 2; x++) if (F[I(x, z)] === 1) { H[I(x, z)] = r.h - 0.8; WA[I(x, z)] = r.h - 0.35; } }
      }
      if (name === 'mine') {   // timber frames along the tunnels, ore in the walls, an old cart
        if (r.type === 'main' && rnd() < 0.7) props.push({ t: 'cart', x: R(r.x0 + 1, r.x1 - 1), z: r.cz, h: r.h, ry: rnd() * 3 });
        const nV = R(1, 2); for (let k = 0; k < nV; k++) props.push({ t: 'vein', x: rnd() < 0.5 ? r.x0 : r.x1, z: R(r.z0 + 1, r.z1 - 1), h: r.h });
      }
      if (name === 'descent' && r.type === 'main' && r.i > 0) props.push({ t: 'brazier', x: r.cx, z: r.cz, h: r.h });
      // everywhere: rubble and bones in the corners, a brazier or two
      const nR = R(2, 5); for (let k = 0; k < nR; k++) { const x = rnd() < 0.5 ? r.x0 : r.x1, z = R(r.z0, r.z1); if (F[I(x, z)] === 1) props.push({ t: rnd() < 0.5 ? 'rubble' : 'bones', x, z, h: r.h }); }
      if (r.type === 'reward') {   // a raised dais at the far end with stairs up to it
        const dx0 = r.x1 - 4, h2 = r.h + 1.0;
        for (let z = r.z0; z <= r.z1; z++) for (let x = dx0; x <= r.x1; x++) { H[I(x, z)] = h2; if (x === dx0 && Math.abs(z - r.cz) <= 1) ST[I(x, z)] = 1; }
        for (let z = r.z0; z <= r.z1; z++) if (Math.abs(z - r.cz) > 1) props.push({ t: 'ledge', x: dx0, z, h: r.h });
        r.daisX = r.x1 - 2; r.h2 = h2;
        props.push({ t: 'brazier', x: r.x1 - 1, z: r.z0 + 1, h: h2 }, { t: 'brazier', x: r.x1 - 1, z: r.z1 - 1, h: h2 });
        chests.push({ x: r.x1 - 2, z: r.cz, elite: true, h: h2 });
        spawns.push({ x: r.x1 - 5, z: r.cz, room: r.i, boss: true });
      }
      // ordinary guards in each room but the entry (the reward chamber's boss is added above)
      if (r.type === 'main' && r.i > 0) { const n = R(1, 3); for (let k = 0; k < n; k++) spawns.push({ x: R(r.x0 + 1, r.x1 - 1), z: R(r.z0 + 1, r.z1 - 1), room: r.i }); }
      if (r.type === 'side') { spawns.push({ x: r.cx, z: r.cz, room: r.i }); if (r !== leverRoom) chests.push({ x: r.cx + 1, z: r.cz, elite: false, h: r.h }); }
    }
    // the gate across the corridor into main[gateAt]; its lever in the lever room (or the room before the gate)
    const gc = corridors.find(c => c.tag === 'main' && c.b === main[gateAt]);
    if (gc && gc.tiles.length > 4) {
      const mid = gc.tiles[Math.floor(gc.tiles.length * 0.55)], tiles = gc.tiles.filter(t => Math.abs(t[0] - mid[0]) + Math.abs(t[1] - mid[1]) <= 1 && (t[0] === mid[0] || t[1] === mid[1]));
      gates.push({ id: 'mid', tiles: gc.tiles.filter(t => Math.max(Math.abs(t[0] - mid[0]), Math.abs(t[1] - mid[1])) <= 1), h: H[I(mid[0], mid[1])] });
      void tiles;
      const lr = leverRoom || main[Math.max(0, gateAt - 1)];
      levers.push({ x: lr === leverRoom ? lr.cx : lr.x0 + 1, z: lr === leverRoom ? lr.cz : lr.z0 + 1, gate: 'mid', h: lr.h });
    }
    // the shortcut gate sits at the entry end; its lever is in the reward chamber
    if (short.length > 3) {
      const e = short[short.length - 1];
      gates.push({ id: 'short', tiles: short.filter(t => Math.hypot(t[0] - e[0], t[1] - e[1]) <= 1.5), h: H[I(e[0], e[1])], fromFar: true });
      const s0 = short[0]; levers.push({ x: s0[0], z: s0[1], gate: 'short', h: H[I(s0[0], s0[1])], short: true });
    }
    // pressure plates in the main corridors (not mines or caves: those get falling rubble instead... kept simple: plates)
    for (const c of corridors) if (c.tag === 'main' && c.tiles.length > 8 && rnd() < 0.6) { const k = R(3, c.tiles.length - 4), t = c.tiles[k]; if (!ST[I(t[0], t[1])]) plates.push({ x: t[0], z: t[1], h: H[I(t[0], t[1])] }); }
    return { F, H, WA, ST, rooms, corridors, props, spawns, chests, plates, gates, levers, main, reward, name };
  }

  // ---------------------------------------------------------------- is the route sound?
  // With every gate shut the reward must be out of reach while the lever is not; with the middle gate open, the reward must be reachable.
  function sound(pl) {
    const { F } = pl, I = (x, z) => z * TN + x, gateT = id => new Set(pl.gates.filter(g => !id || g.id === id).flatMap(g => g.tiles.map(t => I(t[0], t[1]))));
    const flood = blocked => { const seen = new Uint8Array(TN * TN), s0 = pl.rooms[0], q = [[s0.cx, s0.cz]]; seen[I(s0.cx, s0.cz)] = 1;
      while (q.length) { const [x, z] = q.pop(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = z + dz, k = I(a, b); if (a < 0 || b < 0 || a >= TN || b >= TN || seen[k] || !F[k] || blocked.has(k)) continue; seen[k] = 1; q.push([a, b]); } }
      return seen; };
    const rw = pl.reward, lever = pl.levers.find(l => l.gate === 'mid'); if (!lever || !pl.gates.find(g => g.id === 'mid')) return false;
    const shut = flood(gateT(null)); if (shut[I(rw.cx, rw.cz)] || !shut[I(lever.x, lever.z)]) return false;
    const midOpen = flood(gateT('short')); return !!midOpen[I(rw.cx, rw.cz)];
  }
  // ---------------------------------------------------------------- build the meshes
  D.build = function (scene, seed, kind, slot, layoutName) {
    const W = GW.World, st = STYLE[kind] || STYLE.tomb, rnd = GW.rand(seed);
    const name = layoutName || st.layouts[Math.floor(rnd() * st.layouts.length)];
    let pl = null;
    for (let tries = 0; tries < 10; tries++) {   // regenerate until the gate really guards the way (and the shortcut doesn't slip round it)
      pl = plan(rnd, kind, name);
      if (sound(pl)) break;
      // try the gate on the corridor into the reward chamber instead
      const c2 = pl.corridors.find(c => c.tag === 'main' && c.b === pl.reward), g = pl.gates.find(q => q.id === 'mid');
      if (c2 && g && c2.tiles.length > 3) { const mid = c2.tiles[Math.floor(c2.tiles.length * 0.5)]; g.tiles = c2.tiles.filter(t => Math.max(Math.abs(t[0] - mid[0]), Math.abs(t[1] - mid[1])) <= 1); g.h = pl.H[mid[1] * TN + mid[0]]; if (sound(pl)) break; }
    }
    const { F, H, WA, ST } = pl;
    const ox = X0 + slot * 400, oz = 0, at = (tx, tz) => [ox + tx * TILE + TILE / 2, oz + tz * TILE + TILE / 2];
    const I = (x, z) => z * TN + x, isF = (x, z) => x >= 0 && z >= 0 && x < TN && z < TN && F[I(x, z)] > 0;
    const lv = { kind, name, title: D.LAYOUTS[name], rooms: pl.rooms, meshes: [], cols: [], lights: [], flames: [], inter: [], at, floor: F, gates: [], plates: pl.plates.map(p => ({ x: at(p.x, p.z)[0], z: at(p.x, p.z)[1], y: p.h })) };
    const add = m => { scene.add(m); lv.meshes.push(m); return m; };
    // heights: bilinear over tile centres (walls take the nearest floor's height so edges don't dip)
    const Hf = new Float32Array(TN * TN);
    for (let z = 0; z < TN; z++) for (let x = 0; x < TN; x++) { if (isF(x, z)) { Hf[I(x, z)] = H[I(x, z)]; continue; } let s = 0, n = 0; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (isF(x + dx, z + dz)) { s += H[I(x + dx, z + dz)]; n++; } Hf[I(x, z)] = n ? s / n : 0; }
    const hT = (x, z) => Hf[I(GW.clamp(x, 0, TN - 1), GW.clamp(z, 0, TN - 1))];
    lv.heightAt = (x, z) => { const fx = (x - ox) / TILE - 0.5, fz = (z - oz) / TILE - 0.5, i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
      return GW.lerp(GW.lerp(hT(i, j), hT(i + 1, j), tx), GW.lerp(hT(i, j + 1), hT(i + 1, j + 1), tx), tz); };
    lv.inWater = (x, z) => { const i = Math.floor((x - ox) / TILE), j = Math.floor((z - oz) / TILE); return i >= 0 && j >= 0 && i < TN && j < TN && !isNaN(WA[I(i, j)]); };
    // ---- floor: one quad per walkable tile at its height (corner heights shared, so slopes and stairs join), stair steps drawn on top
    { const Pp = [], U = [], idx = [], cornerH = (cx, cz) => { let s = 0, n = 0; for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const x = cx + dx, z = cz + dz; if (isF(x, z)) { s += H[I(x, z)]; n++; } } return n ? s / n : 0; };
      for (let z = 0; z < TN; z++) for (let x = 0; x < TN; x++) { if (!isF(x, z)) continue; const b = Pp.length / 3;
        for (const [cx, cz] of [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]]) { const sh = ST[I(x, z)] ? cornerH(cx, cz) : H[I(x, z)]; Pp.push(ox + cx * TILE, sh, oz + cz * TILE); U.push(cx * 1.1, cz * 1.1); }
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(idx); g.computeVertexNormals();
      { const na = g.attributes.normal.array; for (let i = 1; i < na.length; i += 3) if (na[i] < 0) { na[i - 1] *= -1; na[i] *= -1; na[i + 1] *= -1; } }
      add(new THREE.Mesh(g, GW.mat(Object.assign({ side: THREE.DoubleSide }, st.floor)))); }
    // stair treads: thin lips across stair tiles so they read as steps
    { const trim = GW.mat(st.trim), tread = new THREE.BoxGeometry(TILE, 0.12, 0.25);
      for (let z = 0; z < TN; z++) for (let x = 0; x < TN; x++) if (ST[I(x, z)] && isF(x, z)) { const [wx, wz] = at(x, z); for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(tread, trim), dz = -0.66 + k * 0.66; m.position.set(wx, lv.heightAt(wx, wz + dz) + 0.05, wz + dz); add(m); } } }
    // ---- water: still teal sheets over the flooded tiles
    { const Pp = [], idx = [];
      for (let z = 0; z < TN; z++) for (let x = 0; x < TN; x++) { const y = WA[I(x, z)]; if (isNaN(y)) continue; const b = Pp.length / 3; Pp.push(ox + x * TILE, y, oz + z * TILE, ox + (x + 1) * TILE, y, oz + z * TILE, ox + x * TILE, y, oz + (z + 1) * TILE, ox + (x + 1) * TILE, y, oz + (z + 1) * TILE); idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
      if (idx.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3)); g.setIndex(idx); g.computeVertexNormals();
        add(new THREE.Mesh(g, GW.mat({ id: ID.WATER, color: 0x1e5a66, emissive: 0x08262c, side: THREE.DoubleSide }))); } }
    // ---- walls: every solid tile touching the floor, tall enough to hide the lowest floor beside it
    { const walls = [];
      for (let z = 0; z < TN; z++) for (let x = 0; x < TN; x++) { if (F[I(x, z)]) continue; let near = false, lo = 99; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (isF(x + dx, z + dz)) { near = true; lo = Math.min(lo, H[I(x + dx, z + dz)]); } if (near) walls.push([x, z, lo]); }
      const wg = new THREE.BoxGeometry(TILE, 1, TILE); wg.translate(0, 0.5, 0);
      const im = new THREE.InstancedMesh(wg, GW.mat(Object.assign({ side: THREE.DoubleSide }, st.wall)), walls.length), m4 = new THREE.Matrix4(), col = new THREE.Color();
      walls.forEach(([x, z, lo], i) => { const [wx, wz] = at(x, z), hgt = 3.4 + rnd() * 1.4; m4.makeScale(1, hgt + 1.5, 1); m4.setPosition(wx, lo - 1.5, wz); im.setMatrixAt(i, m4); im.setColorAt(i, col.setScalar(0.78 + rnd() * 0.35)); lv.cols.push(W.addCollider(wx, wz, 1.25, 'dwall')); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); add(im); W.occluders.push(im); }
    // ---- props
    const trim = GW.mat(st.trim), wood = GW.mat({ id: ID.PLANKS, tex: 2, color: 0x5a4030, fill: 0.06 }), bone = GW.mat({ id: ID.BONE, color: 0xd8d0b8 }), iron = GW.mat({ id: ID.METAL, color: 0x4a4e58, rim: 0.4 });
    const fireM = GW.mat({ id: ID.FIRE, color: 0, emissive: 0xffa040, unlit: true });
    const flame = (x, y, z, s, light) => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.16 * s, 0.55 * s, 5), fireM); f.position.set(x, y, z); add(f); const fe = { m: f, s: rnd() * 10, base: 1 }; W.flames.push(fe); lv.flames.push(fe); if (light !== false) lv.lights.push(W.lights.add(x, y + 0.4, z, new THREE.Color(1.0, 0.55, 0.22), 9, 0.8)); };
    const kitAt = (n, x, y, z, s, ry, tint) => { const g = W.kitGroup(n, s, tint); g.position.set(x, y, z); g.rotation.y = ry || 0; add(g); return g; };
    for (const p of pl.props) {
      const [x, z] = at(p.x, p.z), y = p.h;
      if (p.t === 'pillar') { const r = p.big ? 0.75 : 0.5, c = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, 6, 10), trim); c.position.set(x, y + 3 - 1, z); add(c);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(r * 2.6, 0.4, r * 2.6), trim); cap.position.set(x, y + 0.2, z); add(cap); lv.cols.push(W.addCollider(x, z, r + 0.15, 'dwall')); }
      else if (p.t === 'sarco') { kitAt('kit_crypt', x, y, z, 0.55, p.ry, new THREE.Color(0.7, 0.7, 0.75)); lv.cols.push(W.addCollider(x, z, 0.9, 'dwall')); }
      else if (p.t === 'pew') { const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 3.4), wood); m.position.set(x, y + 0.22, z); m.rotation.y = p.ry; add(m); lv.cols.push(W.addCollider(x, z - 1, 0.4, 'dwall'), W.addCollider(x, z + 1, 0.4, 'dwall')); }
      else if (p.t === 'altar') { const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 3.0), trim); m.position.set(x, y + 0.5, z); add(m); flame(x, y + 1.25, z - 1, 0.5, false); flame(x, y + 1.25, z + 1, 0.5); lv.cols.push(W.addCollider(x, z, 1.1, 'dwall')); }
      else if (p.t === 'stalag') { kitAt('kit_rock_c', x, y - 0.1, z, p.s, rnd() * 6, new THREE.Color(0.75, 0.73, 0.7)); lv.cols.push(W.addCollider(x, z, 0.6 * p.s + 0.3, 'dwall')); }
      else if (p.t === 'cart') { kitAt('kit_cart', x, y, z, 0.9, p.ry); lv.cols.push(W.addCollider(x, z, 1.1, 'dwall')); }
      else if (p.t === 'vein') { const g = new THREE.Group(), cm = GW.mat({ id: ID.RUNE, color: 0, emissive: 0xc89a60, unlit: true }); for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), cm); m.position.set(x + (rnd() - 0.5) * 1.2, y + 0.6 + rnd() * 1.4, z + (rnd() - 0.5) * 1.2); g.add(m); } add(g); }
      else if (p.t === 'rubble') kitAt('kit_rock_a', x, y - 0.05, z, 0.35 + rnd() * 0.3, rnd() * 6, new THREE.Color(0.7, 0.7, 0.72));
      else if (p.t === 'bones') { for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.5 + rnd() * 0.3), bone); m.position.set(x + (rnd() - 0.5) * 0.8, y + 0.04, z + (rnd() - 0.5) * 0.8); m.rotation.y = rnd() * 3; add(m); } const sk = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), bone); sk.position.set(x, y + 0.12, z); add(sk); }
      else if (p.t === 'brazier') { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.32, 0.9, 8), iron); b.position.set(x, y + 0.45, z); add(b); flame(x, y + 1.15, z, 1.3); lv.cols.push(W.addCollider(x, z, 0.55, 'dwall')); }
      else if (p.t === 'ledge') { const m = new THREE.Mesh(new THREE.BoxGeometry(TILE, 1.0, TILE), trim); m.position.set(x, y + 0.5, z); add(m); }
    }
    // mine: timber frames across the tunnels
    if (name === 'mine') for (const c of pl.corridors) for (let k = 2; k < c.tiles.length; k += 6) { const [tx, tz] = c.tiles[k], [x, z] = at(tx, tz), y = H[I(tx, tz)];
      const bm = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.3, 0.3), wood); bm.position.set(x, y + 2.8, z); add(bm); for (const sd of [-1.6, 1.6]) { const po = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.8, 0.28), wood); po.position.set(x + sd, y + 1.4, z); add(po); } }
    // torches on room walls (more in the bigger rooms)
    const pm = GW.mat({ id: ID.WOOD, color: 0x4a3420 });
    for (const r of pl.rooms) {
      const n = Math.max(1, Math.round((r.type === 'side' ? 1 : 2) * st.torch + rnd()));
      for (let k = 0; k < n; k++) {
        const side = Math.floor(rnd() * 4), tx = side < 2 ? r.x0 + 1 + Math.floor(rnd() * Math.max(1, r.x1 - r.x0 - 1)) : (side === 2 ? r.x0 : r.x1), tz = side >= 2 ? r.z0 + 1 + Math.floor(rnd() * Math.max(1, r.z1 - r.z0 - 1)) : (side === 0 ? r.z0 : r.z1);
        const [x, z] = at(tx, tz), y = H[I(tx, tz)] || r.h;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.8, 5), pm); pole.position.set(x, y + 0.9, z); add(pole); flame(x, y + 2.05, z, 1);
      }
    }
    // ---- gates (portcullises) and their levers
    for (const gt of pl.gates) {
      const grp = new THREE.Group(); const ws = gt.tiles.map(t => at(t[0], t[1])); const cx = ws.reduce((s, q) => s + q[0], 0) / ws.length, cz = ws.reduce((s, q) => s + q[1], 0) / ws.length;
      const cols = [];
      for (const [x, z] of ws) { for (let k = 0; k < 3; k++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.2, 0.1), iron); bar.position.set(x - 0.66 + k * 0.66, gt.h + 1.6, z); grp.add(bar); } const cr = new THREE.Mesh(new THREE.BoxGeometry(TILE, 0.12, 0.12), iron); cr.position.set(x, gt.h + 1.2, z); grp.add(cr); cols.push(W.addCollider(x, z, 1.1, 'dgate')); }
      add(grp);
      const g = { id: gt.id, mesh: grp, cols, open: false, x: cx, z: cz, fromFar: gt.fromFar };
      lv.gates.push(g); lv.cols.push(...cols);
      lv.inter.push({ type: 'dgate', gate: g, x: cx, z: cz, r: 2.6, label: gt.fromFar ? 'A gate, barred from the other side' : 'A portcullis bars the way' });
    }
    for (const lvr of pl.levers) if (lvr.gate === 'mid' || pl.gates.some(g => g.id === lvr.gate)) {
      const [x, z] = at(lvr.x, lvr.z), y = lvr.h, base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), trim); base.position.set(x, y + 0.3, z); add(base);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 5), iron); arm.position.set(x, y + 0.85, z); arm.rotation.z = 0.6; add(arm);
      lv.inter.push({ type: 'dlever', gate: lvr.gate, arm, x, z, r: 2.0, label: lvr.short ? 'Pull the lever (a way back to the entrance)' : 'Pull the lever' });
    }
    // ---- what the game places: start, reward, spawns, chests
    const r0 = pl.rooms[0], rw = pl.reward;
    lv.start = at(r0.x0 + 2, r0.cz); lv.startY = r0.h;
    lv.end = at(rw.daisX || rw.cx, rw.cz); lv.endY = rw.h2 !== undefined ? rw.h2 : rw.h;
    lv.spawns = pl.spawns.map(s => ({ x: at(s.x, s.z)[0], z: at(s.x, s.z)[1], room: s.room, dormant: !!s.dormant, boss: !!s.boss }));
    lv.chests = pl.chests.map(c => ({ x: at(c.x, c.z)[0], z: at(c.x, c.z)[1], elite: c.elite, y: c.h }));
    lv.inter.forEach(it => W.interact.push(it));
    D.cur = lv;
    return lv;
  };
  // open a gate: the bars slide up into the ceiling and stop blocking
  D.openGate = function (lv, id) { const g = lv.gates.find(q => q.id === id); if (!g || g.open) return false; g.open = true; g.cols.forEach(GW.World.removeCollider); g.raise = 0; return g; };
  D.update = function (lv, dt) { if (!lv) return; for (const g of lv.gates) if (g.open && g.raise < 3.2) { g.raise = Math.min(3.2, g.raise + dt * 2.4); g.mesh.position.y = g.raise; } };
  D.destroy = function (scene, lv) {
    const W = GW.World;
    lv.meshes.forEach(m => { scene.remove(m); if (m.isInstancedMesh) m.dispose(); const k = W.occluders.indexOf(m); if (k >= 0) W.occluders.splice(k, 1); });
    lv.cols.forEach(W.removeCollider); lv.lights.forEach(l => W.lights.remove(l));
    W.flames = W.flames.filter(f => !lv.flames.includes(f));
    W.interact = W.interact.filter(it => !lv.inter.includes(it));
    if (D.cur === lv) D.cur = null;
  };
  D.TILE = TILE;
})();

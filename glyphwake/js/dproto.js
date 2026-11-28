// Glyphwake: dungeon look prototypes (not loaded by the game). Three variants of organic,
// uneven, Diablo-like dungeon floors on a 1 m grid, used to preview the look before the rework:
//   A 'halls'  : eroded masonry halls, broken walls, rubble spill, alcoves, pillars
//   B 'caverns': carved caves, blob chambers joined by narrow throats, lumpy rock walls, pools
//   C 'abyss'  : ruined platforms over a black void, bridges, chipped edges falling into darkness
(function () {
  'use strict';
  const GW = window.GW, ID = GW.ID;
  const N = 300, X0 = 20000;
  const P = GW.DProto = {};

  // value noise
  function makeNoise(seed) {
    const r = GW.rand(seed), T = new Float32Array(256 * 256); for (let i = 0; i < T.length; i++) T[i] = r();
    const v = (x, z) => T[((x & 255) << 8) | (z & 255)];
    const s = t => t * t * (3 - 2 * t);
    const n = (x, z) => { const i = Math.floor(x), j = Math.floor(z), fx = s(x - i), fz = s(z - j);
      return GW.lerp(GW.lerp(v(i, j), v(i + 1, j), fx), GW.lerp(v(i, j + 1), v(i + 1, j + 1), fx), fz); };
    return (x, z) => n(x, z) * 0.6 + n(x * 2.1 + 17, z * 2.1 + 5) * 0.28 + n(x * 4.3 + 3, z * 4.3 + 41) * 0.12;
  }

  function plan(variant, seed) {
    const rnd = GW.rand(seed), nz = makeNoise(seed + 7), nz2 = makeNoise(seed + 99);
    const PR = new Uint8Array(N * N), F = new Uint8Array(N * N), H = new Float32Array(N * N), WA = new Float32Array(N * N).fill(NaN);
    const I = (x, z) => z * N + x, inb = (x, z) => x > 3 && z > 3 && x < N - 4 && z < N - 4;
    const isF = (x, z) => x >= 0 && z >= 0 && x < N && z < N && F[I(x, z)] > 0;
    const R = (a, b) => a + rnd() * (b - a);
    const props = [], rooms = [];
    const set = (x, z, h) => { if (!inb(x, z)) return; F[I(x, z)] = 1; H[I(x, z)] = h; };
    const disc = (cx, cz, r, h) => { for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) < r) set(x, z, h); };
    const fill = (cx, cz, r) => { for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (x >= 0 && z >= 0 && x < N && z < N && !PR[I(x, z)] && Math.hypot(x + 0.5 - cx, z + 0.5 - cz) < r) F[I(x, z)] = 0; };
    const guard = (cx, cz, r) => { for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (x >= 0 && z >= 0 && x < N && z < N && Math.hypot(x + 0.5 - cx, z + 0.5 - cz) < r) PR[I(x, z)] = 1; };
    // chambers along a winding main route, plus branches
    const nMain = variant === 'caverns' ? 8 : 7;
    let cx = 22, cz = N / 2, h = 0, dir = 0;
    for (let k = 0; k < nMain; k++) {
      const big = k === nMain - 1 || rnd() < 0.35;
      const w = variant === 'caverns' ? R(18, big ? 34 : 26) : R(big ? 26 : 18, big ? 36 : 26), d = variant === 'caverns' ? w * R(0.7, 1.05) : R(15, big ? 28 : 22);
      if (k > 0) { const prev = rooms[rooms.length - 1]; let best = null;
        for (let t = 0; t < 40; t++) { const dd = GW.clamp(dir + R(-1.4, 1.4), -1.6, 1.6), step = (Math.max(prev.w, prev.d) + Math.max(w, d)) / 2 + R(10, 20), nx = prev.x + Math.cos(dd) * step, nzz = prev.z + Math.sin(dd) * step;
          if (nx < w / 2 + 8 || nzz < d / 2 + 8 || nx > N - w / 2 - 8 || nzz > N - d / 2 - 8) continue; if (rooms.some(r => Math.abs(r.x - nx) < (r.w + w) / 2 + 5 && Math.abs(r.z - nzz) < (r.d + d) / 2 + 5)) continue; best = [nx, nzz, dd]; break; }
        if (!best) break; cx = best[0]; cz = best[1]; dir = best[2] * 0.6; h += variant === 'abyss' ? R(-0.6, 0.6) : R(-0.8, 1.0); }
      rooms.push({ x: cx, z: cz, w, d, h, type: k === 0 ? 'entry' : k === nMain - 1 ? 'reward' : 'main' });
    }
    // side chambers off the route
    const nSide = 3;
    for (let s = 0; s < nSide; s++) { const mains = rooms.filter(r => r.type !== 'side'), host = mains[1 + Math.floor(rnd() * Math.max(1, mains.length - 2))];
      for (let t = 0; t < 30; t++) { const a = R(0, Math.PI * 2), w = R(13, 20), d = R(12, 18), dd = (Math.max(host.w, host.d) + w) / 2 + R(8, 14), x = host.x + Math.cos(a) * dd, z = host.z + Math.sin(a) * dd;
        if (x < w / 2 + 6 || z < d / 2 + 6 || x > N - w / 2 - 6 || z > N - d / 2 - 6) continue;
        if (rooms.some(r => Math.abs(r.x - x) < (r.w + w) / 2 + 3 && Math.abs(r.z - z) < (r.d + d) / 2 + 3)) continue;
        rooms.push({ x, z, w, d, h: host.h + R(-0.5, 0.5), type: 'side', host }); break; } }
    const nM = rooms.filter(r => r.type !== 'side').length; rooms[nM - 1].type = 'reward';
    const links = []; for (let k = 1; k < nM; k++) links.push([rooms[k - 1], rooms[k]]); rooms.filter(r => r.type === 'side').forEach(r => links.push([r.host, r]));
    // carve chambers
    for (const r of rooms) {
      guard(r.x, r.z, Math.min(r.w, r.d) * 0.3);
      if (variant === 'caverns') {   // a lumpy blob: radius wobbles with the angle and with noise
        const rr = r.w / 2, ph = R(0, 9);
        for (let z = Math.floor(r.z - rr * 1.5); z <= r.z + rr * 1.5; z++) for (let x = Math.floor(r.x - rr * 1.5); x <= r.x + rr * 1.5; x++) {
          const dx = x + 0.5 - r.x, dz = (z + 0.5 - r.z) * r.w / r.d, a = Math.atan2(dz, dx), lim = rr * (0.95 + 0.14 * Math.sin(a * 3 + ph) + 0.09 * Math.sin(a * 5 + ph * 2)) + (nz(x * 0.15, z * 0.15) - 0.5) * 7;
          if (Math.hypot(dx, dz) < lim) set(x, z, r.h + (nz2(x * 0.08, z * 0.08) - 0.5) * 2.2);
        }
        // side lobes: smaller blobs bulging off the chamber, so it sprawls instead of sitting round
        for (let k = 0; k < 2 + Math.floor(rnd() * 2); k++) { const a = R(0, 6.3), lr = rr * R(0.35, 0.55), lx = r.x + Math.cos(a) * rr * 0.85, lz = r.z + Math.sin(a) * rr * 0.85 * r.d / r.w;
          for (let z = Math.floor(lz - lr * 1.4); z <= lz + lr * 1.4; z++) for (let x = Math.floor(lx - lr * 1.4); x <= lx + lr * 1.4; x++) if (Math.hypot(x + 0.5 - lx, z + 0.5 - lz) < lr + (nz(x * 0.2 + 9, z * 0.2) - 0.5) * 5) set(x, z, r.h + (nz2(x * 0.08, z * 0.08) - 0.5) * 2.2); }
      } else {
        for (let z = Math.floor(r.z - r.d / 2); z <= r.z + r.d / 2; z++) for (let x = Math.floor(r.x - r.w / 2); x <= r.x + r.w / 2; x++) set(x, z, r.h);
      }
    }
    // passages: wobbling tubes whose width breathes (throats and wide stretches)
    const tube = (a, b, w0, w1, wob) => {
      const L = Math.hypot(b.x - a.x, b.z - a.z), mx = (a.x + b.x) / 2 + R(-1, 1) * wob * L * 0.25, mz = (a.z + b.z) / 2 + R(-1, 1) * wob * L * 0.25;
      for (let t = 0; t <= 1; t += 0.25 / L) { const u = 1 - t, x = u * u * a.x + 2 * u * t * mx + t * t * b.x, z = u * u * a.z + 2 * u * t * mz + t * t * b.z;
        const w = GW.lerp(w0, w1, 0.5 + 0.5 * Math.sin(t * 9 + a.x)) + (nz(x * 0.2, z * 0.2) - 0.5) * 2.4 * wob, hh = GW.lerp(a.h, b.h, (t < 0.25 ? 0 : t > 0.75 ? 1 : ((t - 0.25) / 0.5) * ((t - 0.25) / 0.5) * (3 - 2 * (t - 0.25) / 0.5)));
        disc(x, z, Math.max(1.6, w / 2), hh); guard(x, z, 1.7); }
    };
    if (variant === 'caverns') for (const [a, b] of links) tube(a, b, 4, 9, 1);
    else if (variant === 'halls') for (const [a, b] of links) { // straight-ish corridors with an elbow, then erosion breaks the lines
      const corner = { x: b.x, z: a.z, h: (a.h + b.h) / 2 }; tube(a, corner, 5, 8, 0.2); tube(corner, b, 5, 8, 0.2); }
    else for (const [a, b] of links) tube(a, b, 4, 5.5, 0.08);   // abyss: narrow causeways
    // ---- erosion: bite alcoves into the walls and spill rubble into the floor, so no edge stays straight
    const edgeF = [], edgeW = [];
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) { let n = 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) n += F[I(x + dx, z + dz)]; if (F[I(x, z)] && n < 4) edgeF.push([x, z]); else if (!F[I(x, z)] && n > 0) edgeW.push([x, z]); }
    if (variant !== 'caverns') {
      for (const [x, z] of edgeW) if (nz(x * 0.31, z * 0.31) > 0.66 && rnd() < 0.5) { const h0 = H[I(x + (F[I(x + 1, z)] ? 1 : F[I(x - 1, z)] ? -1 : 0), z + (F[I(x, z + 1)] ? 1 : F[I(x, z - 1)] ? -1 : 0))]; disc(x + 0.5, z + 0.5, R(1.2, variant === 'abyss' ? 1.8 : 2.8), h0); }
      for (const [x, z] of edgeF) if (nz2(x * 0.27, z * 0.27) > (variant === 'abyss' ? 0.6 : 0.68) && rnd() < 0.45) { fill(x + 0.5, z + 0.5, R(1.0, variant === 'abyss' ? 2.4 : 1.9)); if (variant === 'halls' && rnd() < 0.7) props.push({ t: 'rubble', x: x + 0.5, z: z + 0.5, s: R(0.5, 1.0) }); }
      // collapsed corners and wall breaches
      for (const r of rooms) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) if (rnd() < 0.7) { const x = r.x + sx * r.w / 2, z = r.z + sz * r.d / 2; if (rnd() < 0.5) fill(x, z, R(2, 4.5)); else disc(x, z, R(1.5, 3), r.h); }
    }
    // cellular smoothing: rounds the caverns, softens the halls' pixel steps
    const passes = variant === 'caverns' ? 3 : 1;
    for (let p = 0; p < passes; p++) { const F2 = F.slice(); for (let z = 2; z < N - 2; z++) for (let x = 2; x < N - 2; x++) { let n = 0; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) n += F[I(x + dx, z + dz)];
      if (n >= 6 && !F[I(x, z)]) { F2[I(x, z)] = 1; let s = 0, c = 0; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (F[I(x + dx, z + dz)]) { s += H[I(x + dx, z + dz)]; c++; } H[I(x, z)] = s / c; } else if (n <= 3) F2[I(x, z)] = 0; }
      F.set(F2); }
    // keep only what joins the entry (erosion can strand islands)
    { const seen = new Uint8Array(N * N), e = rooms[0], st = [[Math.floor(e.x), Math.floor(e.z)]]; seen[I(st[0][0], st[0][1])] = 1;
      while (st.length) { const [x, z] = st.pop(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = z + dz; if (isF(a, b) && !seen[I(a, b)]) { seen[I(a, b)] = 1; st.push([a, b]); } } }
      for (let i = 0; i < N * N; i++) if (F[i] && !seen[i]) F[i] = 0; }
    // smooth heights so slopes read as ramps
    for (let p = 0; p < 3; p++) { const H2 = H.slice(); for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) { if (!F[I(x, z)]) continue; let s = 0, c = 0; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (F[I(x + dx, z + dz)]) { s += H[I(x + dx, z + dz)]; c++; } H2[I(x, z)] = s / c; } H.set(H2); }
    // ---- dressing
    for (const r of rooms) {
      const inR = (x, z) => isF(Math.floor(x), Math.floor(z));
      if (variant === 'halls') {
        if (r.w > 18 && r.type !== 'side') for (let k = -1; k <= 1; k += 2) for (let x = r.x - r.w / 2 + 4; x < r.x + r.w / 2 - 3; x += 5.5) { const z = r.z + k * r.d * 0.28; if (inR(x, z)) props.push({ t: rnd() < 0.2 ? 'brokenpillar' : 'pillar', x, z }); }
        if (r.type === 'side' || rnd() < 0.4) for (let k = 0; k < 3; k++) { const x = r.x + R(-r.w * 0.3, r.w * 0.3), z = r.z + R(-r.d * 0.3, r.d * 0.3); if (inR(x, z)) props.push({ t: 'sarco', x, z, ry: rnd() < 0.5 ? 0 : Math.PI / 2 }); }
        props.push({ t: 'statue', x: r.x, z: r.z - r.d / 2 + 2 });
      } else if (variant === 'caverns') {
        for (let k = 0; k < 4 + Math.floor(rnd() * 4); k++) { const a = R(0, 6.3), d = R(0.2, 0.45) * r.w, x = r.x + Math.cos(a) * d, z = r.z + Math.sin(a) * d; if (inR(x, z)) { const n = 1 + Math.floor(rnd() * 3); for (let q = 0; q < n; q++) props.push({ t: 'stalag', x: x + R(-1.2, 1.2), z: z + R(-1.2, 1.2), s: R(0.5, 1.3) }); } }
        if (r.w > 12 && rnd() < 0.6) { const px = r.x + R(-2, 2), pz = r.z + R(-2, 2), pr = R(2.5, 4.5); for (let z = Math.floor(pz - pr); z <= pz + pr; z++) for (let x = Math.floor(px - pr); x <= px + pr; x++) if (isF(x, z) && Math.hypot(x + 0.5 - px, z + 0.5 - pz) < pr * (0.8 + 0.4 * nz(x * 0.4, z * 0.4))) WA[I(x, z)] = H[I(x, z)] + 0.12; }
        for (let k = 0; k < 3; k++) { const x = r.x + R(-r.w * 0.35, r.w * 0.35), z = r.z + R(-r.d * 0.35, r.d * 0.35); if (inR(x, z)) props.push({ t: rnd() < 0.5 ? 'mushroom' : 'roots', x, z }); }
      } else {
        // ruined wall fragments along the platform rims, broken pillars at the corners
        for (let k = 0; k < 4; k++) { const x = r.x + R(-r.w * 0.42, r.w * 0.42), z = r.z + (rnd() < 0.5 ? -1 : 1) * r.d * 0.42; if (inR(x, z)) props.push({ t: 'wallfrag', x, z, len: R(2, 5), ry: 0 }); }
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const x = r.x + sx * r.w * 0.36, z = r.z + sz * r.d * 0.36; if (inR(x, z)) props.push({ t: rnd() < 0.5 ? 'brokenpillar' : 'pillar', x, z }); }
        if (r.type !== 'entry') props.push({ t: 'statue', x: r.x, z: r.z });
      }
      // shared: bones, urns, braziers by the route
      for (let k = 0; k < 5; k++) { const x = r.x + R(-r.w * 0.4, r.w * 0.4), z = r.z + R(-r.d * 0.4, r.d * 0.4); if (inR(x, z)) props.push({ t: rnd() < 0.5 ? 'bones' : 'urns', x, z }); }
      props.push({ t: 'brazier', x: r.x + R(-2, 2), z: r.z + R(-2, 2) });
    }
    if (variant === 'caverns') for (const [x, z] of edgeF) if (isF(x, z) && rnd() < 0.06) props.push({ t: 'stalag', x: x + 0.5, z: z + 0.5, s: R(0.6, 1.4) });
    return { F, H, WA, rooms, props, isF, I };
  }

  P.build = function (scene, seed, variant) {
    const W = GW.World, pl = plan(variant, seed), { F, H, WA, rooms, isF, I } = pl, rnd = GW.rand(seed + 5);
    const ox = X0, oz = 0;
    const lv = { name: variant === 'caverns' ? 'cavern' : variant === 'abyss' ? 'flooded' : 'crypt', title: { halls: 'THE ERODED HALLS', caverns: 'THE CARVED CAVERNS', abyss: 'RUINS OVER THE ABYSS' }[variant], rooms, meshes: [], cols: [], lights: [], flames: [], inter: [], gates: [], plates: [], floor: F, chests: [], spawns: [], pl };
    const add = m => { scene.add(m); lv.meshes.push(m); return m; };
    const hT = (x, z) => H[I(GW.clamp(x, 0, N - 1), GW.clamp(z, 0, N - 1))];
    lv.heightAt = (x, z) => { const fx = x - ox - 0.5, fz = z - oz - 0.5, i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j; return GW.lerp(GW.lerp(hT(i, j), hT(i + 1, j), tx), GW.lerp(hT(i, j + 1), hT(i + 1, j + 1), tx), tz); };
    lv.inWater = (x, z) => { const i = Math.floor(x - ox), j = Math.floor(z - oz); return i >= 0 && j >= 0 && i < N && j < N && !isNaN(WA[I(i, j)]); };
    const M = {
      halls: { wall: { id: ID.MASONRY, tex: 1, color: 0x646676, fill: 0.08 }, floor: { id: ID.MASONRY, tex: 8, color: 0x666874, fill: 0.08 }, trim: { id: ID.MASONRY, tex: 1, color: 0x80828e } },
      caverns: { wall: { id: ID.ROCK, tex: 6, color: 0x6e6a62, fill: 0.08 }, floor: { id: ID.ROCK, tex: 6, color: 0x67625a, fill: 0.06 }, trim: { id: ID.ROCK, tex: 6, color: 0x7a766e } },
      abyss: { wall: { id: ID.MASONRY, tex: 8, color: 0x70727c, fill: 0.08 }, floor: { id: ID.MASONRY, tex: 8, color: 0x72747e, fill: 0.08 }, trim: { id: ID.MASONRY, tex: 1, color: 0x8a8c98 } },
    }[variant];
    // ---- floor: shared-corner heights so ramps are smooth
    { const Pp = [], U = [], idx = [], ch = (cx, cz) => { let s = 0, n = 0; for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (isF(cx + dx, cz + dz)) { s += H[I(cx + dx, cz + dz)]; n++; } return n ? s / n : 0; };
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { if (!isF(x, z)) continue; const b = Pp.length / 3; for (const [cx, cz] of [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]]) { Pp.push(ox + cx, ch(cx, cz), oz + cz); U.push(cx * 0.55, cz * 0.55); } idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(idx); g.computeVertexNormals();
      { const na = g.attributes.normal.array; for (let i = 1; i < na.length; i += 3) if (na[i] < 0) { na[i - 1] *= -1; na[i] *= -1; na[i + 1] *= -1; } }
      add(new THREE.Mesh(g, GW.mat(Object.assign({ side: THREE.DoubleSide }, M.floor)))); }
    // ---- water
    { const Pp = [], idx = []; for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { const y = WA[I(x, z)]; if (isNaN(y)) continue; const b = Pp.length / 3; Pp.push(ox + x, y, oz + z, ox + x + 1, y, oz + z, ox + x, y, oz + z + 1, ox + x + 1, y, oz + z + 1); idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
      if (idx.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3)); g.setIndex(idx); g.computeVertexNormals(); add(new THREE.Mesh(g, GW.mat({ id: ID.WATER, color: 0x1e5a66, emissive: 0x08262c, side: THREE.DoubleSide }))); } }
    // ---- borders
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();
    const inst = (geo, mat, list) => { const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((o, i) => { e3.set(o.rx || 0, o.ry || 0, o.rz || 0); q.setFromEuler(e3); m4.compose(v3.set(o.x, o.y, o.z), q, s3.set(o.sx, o.sy, o.sz)); im.setMatrixAt(i, m4); im.setColorAt(i, col.setScalar(o.c || 1)); }); im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); add(im); return im; };
    const nearLo = (x, z, r) => { let lo = 99, any = false; for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (isF(x + dx, z + dz)) { any = true; lo = Math.min(lo, H[I(x + dx, z + dz)]); } return any ? lo : null; };
    if (variant !== 'abyss') {
      const blocks = [];
      for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) { if (F[I(x, z)]) continue; const lo1 = nearLo(x, z, 1), lo2 = lo1 === null ? nearLo(x, z, 2) : lo1; if (lo2 === null) continue;
        const ring = lo1 === null ? 2 : 1, wx = ox + x + 0.5, wz = oz + z + 0.5;
        // camera-side walls (floor to the north of them) are cut down low, Diablo-style, so they never hide the hero
        const cut = !isF(x, z + 1) && (isF(x, z - 1) || isF(x - 1, z - 1) || isF(x + 1, z - 1) || (ring === 2 && (isF(x, z - 2) || isF(x - 1, z - 2) || isF(x + 1, z - 2))));
        if (variant === 'halls') {   // dressed blocks, jittered; some courses broken down low
          const broken = ring === 1 && rnd() < 0.12, hh = cut ? 0.5 + rnd() * 0.9 : broken ? 0.8 + rnd() * 1.6 : 3.6 + rnd() * 1.8 + (ring === 2 ? 1 : 0);
          blocks.push({ x: wx + (rnd() - 0.5) * 0.35, y: lo2 - 1.5 + (hh + 1.5) / 2, z: wz + (rnd() - 0.5) * 0.35, sx: 1.05 + rnd() * 0.3, sy: hh + 1.5, sz: 1.05 + rnd() * 0.3, ry: (rnd() - 0.5) * 0.25, c: 0.75 + rnd() * 0.4 });
        } else {   // lumpy rock: big tumbled boulders that overlap into a ragged cave wall
          if (ring === 1 || rnd() < 0.5) { const s = 1.1 + rnd() * 1.1, sy = cut ? s * (0.5 + rnd() * 0.4) : s * (1.4 + rnd() * 1.6); blocks.push({ x: wx + (rnd() - 0.5) * 0.6, y: cut ? lo2 - 0.2 : lo2 + s * (0.6 + rnd()), z: wz + (rnd() - 0.5) * 0.6, sx: s, sy, sz: s, rx: rnd() * 3, ry: rnd() * 3, rz: rnd() * 3, c: 0.7 + rnd() * 0.45 }); }
        }
        lv.cols.push(W.addCollider(wx, wz, 0.75, 'dwall'));
      }
      const geo = variant === 'halls' ? new THREE.BoxGeometry(1, 1, 1) : (() => { const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, r2 = GW.rand(seed); for (let i = 0; i < p.count; i++) { const k = 0.78 + r2() * 0.4; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } g.computeVertexNormals(); return g; })();
      W.occluders.push(inst(geo, GW.mat(Object.assign({ side: THREE.DoubleSide }, M.wall)), blocks));
    } else {
      // abyss: no walls, the floor's rim breaks off into cliffs that fall away into darkness
      const skirt = [];
      for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) { if (!F[I(x, z)]) continue; let edge = false; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!F[I(x + dx, z + dz)]) edge = true; if (!edge) continue;
        const h = H[I(x, z)], dep = 3 + rnd() * 9; skirt.push({ x: ox + x + 0.5 + (rnd() - 0.5) * 0.3, y: h - dep / 2 - 0.02, z: oz + z + 0.5 + (rnd() - 0.5) * 0.3, sx: 1.05, sy: dep, sz: 1.05, ry: (rnd() - 0.5) * 0.3, c: 0.6 + rnd() * 0.35 }); }
      inst(new THREE.BoxGeometry(1, 1, 1), GW.mat(Object.assign({ side: THREE.DoubleSide }, M.wall)), skirt);
      // a lip of low broken stones along the rim (where there are no wall fragments) so the edge reads as a drop
      const lip = []; for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) { if (F[I(x, z)]) continue; let n = 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) n += F[I(x + dx, z + dz)]; if (n && rnd() < 0.18) { const lo = nearLo(x, z, 1); lip.push({ x: ox + x + 0.5, y: lo + 0.15, z: oz + z + 0.5, sx: 0.5 + rnd() * 0.5, sy: 0.3 + rnd() * 0.4, sz: 0.5 + rnd() * 0.5, ry: rnd() * 3, c: 0.8 }); }
        if (n) lv.cols.push(W.addCollider(ox + x + 0.5, oz + z + 0.5, 0.6, 'dwall')); }
      inst(new THREE.BoxGeometry(1, 1, 1), GW.mat(M.trim), lip);
      // far below: the tops of great pillars sinking into the dark, for depth
      const deep = []; for (let k = 0; k < 40; k++) { const x = ox + 10 + rnd() * (N - 20), z = oz + 10 + rnd() * (N - 20); if (isF(Math.floor(x - ox), Math.floor(z - oz))) continue; const r = 1.5 + rnd() * 2.5; deep.push({ x, y: -14 - rnd() * 10, z, sx: r, sy: 18, sz: r, c: 0.35 + rnd() * 0.2 }); }
      inst(new THREE.CylinderGeometry(1, 1.1, 1, 8), GW.mat(M.wall), deep);
    }
    // ---- props
    const trim = GW.mat(M.trim), bone = GW.mat({ id: ID.BONE, color: 0xd8d0b8 }), iron = GW.mat({ id: ID.METAL, color: 0x4a4e58, rim: 0.4 }), clay = GW.mat({ id: ID.MASONRY, tex: 8, color: 0x8a6a4e, fill: 0.05 }), cloth = GW.mat({ id: ID.CLOTH, color: 0x6a2228 });
    const fireM = GW.mat({ id: ID.FIRE, color: 0, emissive: 0xffa040, unlit: true }), shroom = GW.mat({ id: ID.RUNE, color: 0, emissive: 0x58c8a8, unlit: true }), root = GW.mat({ id: ID.WOOD, color: 0x3e3226 });
    const flame = (x, y, z, s, light) => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.16 * s, 0.55 * s, 5), fireM); f.position.set(x, y, z); add(f); const fe = { m: f, s: rnd() * 10, base: 1 }; W.flames.push(fe); lv.flames.push(fe); if (light !== false) lv.lights.push(W.lights.add(x, y + 0.4, z, new THREE.Color(1.0, 0.55, 0.22), 13, 0.8)); };
    const kit = (n, x, y, z, s, ry, tint) => { const g = W.kitGroup(n, s, tint); g.position.set(x, y, z); g.rotation.y = ry || 0; add(g); return g; };
    const box = (w, h, d, mat, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.y = ry || 0; add(m); return m; };
    for (const p of pl.props) {
      const x = ox + p.x, z = oz + p.z, y = lv.heightAt(x, z);
      if (p.t === 'pillar') { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.66, 7, 10), trim); c.position.set(x, y + 2.5, z); add(c); box(1.6, 0.4, 1.6, trim, x, y + 0.2, z); lv.cols.push(W.addCollider(x, z, 0.8, 'dwall')); }
      else if (p.t === 'brokenpillar') { const hh = 1 + rnd() * 2; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.66, hh, 10), trim); c.position.set(x, y + hh / 2, z); c.rotation.z = (rnd() - 0.5) * 0.2; add(c); box(1.6, 0.4, 1.6, trim, x, y + 0.2, z); const dr = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 2.6, 10), trim); dr.rotation.z = Math.PI / 2; dr.rotation.y = rnd() * 6; dr.position.set(x + 1.6, y + 0.55, z + 0.8); add(dr); lv.cols.push(W.addCollider(x, z, 0.8, 'dwall')); }
      else if (p.t === 'sarco') { kit('kit_crypt', x, y, z, 0.55, p.ry, new THREE.Color(0.7, 0.7, 0.75)); lv.cols.push(W.addCollider(x, z, 0.9, 'dwall')); }
      else if (p.t === 'statue') { box(1.6, 1.0, 1.6, trim, x, y + 0.5, z); kit('kit_grave_obelisk', x, y + 1.0, z, 1.1, 0, new THREE.Color(0.8, 0.8, 0.85)); lv.cols.push(W.addCollider(x, z, 1.0, 'dwall')); }
      else if (p.t === 'rubble') { for (let k = 0; k < 3; k++) kit('kit_rock_a', x + (rnd() - 0.5) * 1.4, y - 0.1, z + (rnd() - 0.5) * 1.4, p.s * (0.4 + rnd() * 0.5), rnd() * 6, new THREE.Color(0.7, 0.7, 0.74)); }
      else if (p.t === 'stalag') { const c = new THREE.Mesh(new THREE.ConeGeometry(0.45 * p.s, 2.6 * p.s, 6), trim); c.position.set(x, y + 1.2 * p.s, z); c.rotation.y = rnd() * 6; add(c); lv.cols.push(W.addCollider(x, z, 0.4 * p.s + 0.2, 'dwall')); }
      else if (p.t === 'mushroom') { for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.12 + rnd() * 0.12, 6, 4, 0, 6.3, 0, 1.6), shroom); m.position.set(x + (rnd() - 0.5), y + 0.12, z + (rnd() - 0.5)); add(m); } lv.lights.push(W.lights.add(x, y + 0.6, z, new THREE.Color(0.25, 0.7, 0.6), 5, 0.2)); }
      else if (p.t === 'roots') { for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 2.4, 4), root); m.position.set(x + (rnd() - 0.5) * 1.5, y + 0.2, z + (rnd() - 0.5) * 1.5); m.rotation.set(Math.PI / 2 - 0.15, rnd() * 6, 0); add(m); } }
      else if (p.t === 'bones') { for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.5 + rnd() * 0.3), bone); m.position.set(x + (rnd() - 0.5) * 0.9, y + 0.04, z + (rnd() - 0.5) * 0.9); m.rotation.y = rnd() * 3; add(m); } const sk = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), bone); sk.position.set(x, y + 0.12, z); add(sk); }
      else if (p.t === 'urns') { for (let k = 0; k < 2 + Math.floor(rnd() * 3); k++) { const u = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.6, 7), clay); u.position.set(x + (rnd() - 0.5) * 1.2, y + 0.3, z + (rnd() - 0.5) * 1.2); if (rnd() < 0.25) { u.rotation.z = Math.PI / 2; u.position.y = y + 0.2; } add(u); } }
      else if (p.t === 'brazier') { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.32, 0.9, 8), iron); b.position.set(x, y + 0.45, z); add(b); flame(x, y + 1.15, z, 1.3); lv.cols.push(W.addCollider(x, z, 0.55, 'dwall')); }
      else if (p.t === 'wallfrag') { const n = Math.ceil(p.len); for (let k = 0; k < n; k++) { const hh = 0.6 + rnd() * 2.6; box(1, hh, 0.8, trim, x - n / 2 + k + 0.5, y + hh / 2, z, (rnd() - 0.5) * 0.1); } }
    }
    // torches and banners along the walls: walk the floor rim and drop one every so often
    { let acc = 0; const step = variant === 'abyss' ? 9 : 7;
      for (let z = 2; z < N - 2; z++) for (let x = 2; x < N - 2; x++) { if (!isF(x, z)) continue; let wx = 0, wz = 0, n = 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!isF(x + dx, z + dz)) { wx += dx; wz += dz; n++; } if (n !== 1) continue;
        if (((x * 7 + z * 13) % 97) / 97 > 1 / step * 0.9) continue; acc++;
        const px = ox + x + 0.5 + wx * 0.2, pz = oz + z + 0.5 + wz * 0.2, y = H[I(x, z)];
        if (variant === 'halls' && acc % 3 === 0) { const b = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.2), cloth); b.position.set(px + wx * 0.45, y + 2.6, pz + wz * 0.45); b.rotation.y = Math.atan2(-wx, -wz); b.material.side = THREE.DoubleSide; add(b); continue; }
        if (variant === 'halls' && acc % 5 === 1) { for (let k = 0; k < 2; k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 4), iron); c.position.set(px + wx * 0.4 + (k - 0.5) * 0.6, y + 2.6, pz + wz * 0.4); add(c); } continue; }
        if (acc % 2) continue;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.8, 5), root); pole.position.set(px, y + 0.9, pz); add(pole); flame(px, y + 2.05, pz, 1);
      } }
    const r0 = rooms[0], rw = rooms.find(r => r.type === 'reward');
    lv.start = [ox + r0.x, oz + r0.z]; lv.startY = lv.heightAt(lv.start[0], lv.start[1]); lv.end = [ox + rw.x, oz + rw.z]; lv.endY = lv.heightAt(lv.end[0], lv.end[1]); lv.at = (x, z) => [ox + x, oz + z];
    GW.Dungeon.cur = lv;
    return lv;
  };
  P.N = N; P.plan = plan;
})();

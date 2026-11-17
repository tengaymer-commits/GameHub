// Glyphwake: the Vale. Terrain bake, grass, river, props, colliders, zones.
(function () {
  'use strict';
  const GW = window.GW, ID = GW.ID;
  // 2.6 km world, data maps at 2 m per texel; the old Vale is the centre
  const SIZE = 2600, N = 1300, HALF = SIZE / 2;
  const CORE = 135;   // the hand-made Vale: |x|,|z| < CORE is scattered once at load, the rest streams in chunks

  // ---------- layout ----------
  const L = {
    start: { x: 0, z: 78 },
    village: { x: 0, z: 30 },
    fire: { x: 0, z: 30 },
    anvil: { x: 8.5, z: 25 },
    elder: { x: -5.5, z: 34 },
    smith: { x: 10.5, z: 23.5 },
    bridge: { x: -4, z: -13 },
    meadow: { x: 12, z: -58 },
    ruins: { x: -72, z: 42 },
    grove: { x: 76, z: 36 },
    arena: { x: 2, z: -108 },
    ruinFire: { x: -48, z: 30 },
    meadowFire: { x: -18, z: -42 },
    castle: { x: 55, z: -65 },
    chapel: { x: 18, z: 60 },
    tower: { x: -10, z: -66 },
    lair: { x: -55, z: -70 },
    // ---- beyond the Vale ----
    hearth: { x: 380, z: -380 },      // Hearthwick: the village hub on the crossroads
    cinder: { x: 980, z: 60 },        // Cinder Watch, in the Ashen Barrens (east)
    abbey: { x: -150, z: -980 },      // Rimeglass Abbey, in Frostmere (north)
    frostLake: { x: 90, z: -900 },
  };
  const RIVER_CP = [[-1290, 40], [-1050, -20], [-820, 60], [-600, 20], [-420, -50], [-260, -30], [-140, -2], [-95, -14], [-55, -3], [-22, -6], [-4, -13], [20, -26], [55, -20], [90, -30], [140, -44], [260, -110], [420, -150], [560, -120], [700, -190], [880, -260], [1060, -230], [1290, -300]];
  const PATHS = [
    [[0, 76], [1, 60], [-1, 46], [0, 38]],
    [[0, 18], [-3, 4], [-4, -13], [2, -30], [8, -45], [12, -58], [8, -80], [3, -96], [2, -104]],
    [[-12, 31], [-30, 34], [-48, 30], [-60, 38], [-70, 42]],
    [[12, 31], [32, 27], [52, 33], [70, 36]],
    [[14, -58], [30, -54], [44, -51], [55, -51], [55, -56]],
    // roads beyond the Vale: to Hearthwick, then east to the Barrens and north to Frostmere
    [[55, -56], [110, -120], [190, -190], [280, -290], [380, -370]],
    [[380, -370], [520, -330], [680, -250], [820, -120], [930, 20], [975, 52]],
    [[380, -390], [330, -520], [240, -660], [90, -790], [-40, -900], [-140, -965]],
    [[-70, 42], [-160, 60], [-300, 110], [-480, 90], [-700, 160]],
    [[2, -104], [-20, -200], [-90, -330], [-200, -460], [-300, -620]],
  ];
  const ZONES = [
    { name: 'THE WAKING STONE', sub: 'the vale of ninefold', x: 0, z: 78, r: 14 },
    { name: 'EMBERHOLD', sub: 'last fire of the vale', x: 0, z: 30, r: 17 },
    { name: 'THE GLASS RIVER', sub: 'crossing', x: -4, z: -13, r: 9 },
    { name: 'THORNWOLF MEADOW', sub: 'hunting grounds', x: 12, z: -58, r: 30 },
    { name: 'HOLLOW RUINS', sub: 'the old scriptorium', x: -72, z: 42, r: 26 },
    { name: 'THE PALE CHAPEL', sub: 'its door still stands', x: 18, z: 62, r: 12 },
    { name: 'THE IVY WATCH', sub: 'a tower that still keeps watch', x: -10, z: -66, r: 10 },
    { name: "THE WIDOW'S HOLLOW", sub: 'something vast is breathing', x: -55, z: -70, r: 16 },
    { name: 'GREYMOSS KEEP', sub: 'a castle the vale forgot', x: 55, z: -65, r: 17 },
    { name: 'THE QUIET GRAVES', sub: 'where the vale keeps its dead', x: -36, z: 64, r: 13 },
    { name: 'WISPWOOD', sub: 'where the lanterns drift', x: 76, z: 36, r: 26 },
    { name: 'THE WARDEN CIRCLE', sub: 'stone remembers', x: 2, z: -108, r: 22 },
    { name: 'HEARTHWICK', sub: 'the crossroads village', x: 380, z: -380, r: 30 },
    { name: 'CINDER WATCH', sub: 'it never stopped burning', x: 980, z: 60, r: 24 },
    { name: 'RIMEGLASS ABBEY', sub: 'the bells are frozen', x: -150, z: -980, r: 24 },
    { name: 'THE STILL MERE', sub: 'ice that remembers the sky', x: 90, z: -900, r: 70 },
  ];
  // regions (biomes): name, subtitle, banner colour
  const REGIONS = {
    vale: { name: 'THE VALE OF NINEFOLD', sub: 'green, and still', col: '#9fd0b0' },
    ash: { name: 'THE ASHEN BARRENS', sub: 'the ground is warm', col: '#e0a070' },
    frost: { name: 'FROSTMERE', sub: 'breath turns to glass', col: '#bcd4f0' },
  };

  // ---------- math helpers ----------
  const ss = (a, b, x) => { const t = GW.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function catmull(cp, samples) {
    const out = [];
    for (let i = 0; i < cp.length - 1; i++) {
      const p0 = cp[Math.max(0, i - 1)], p1 = cp[i], p2 = cp[i + 1], p3 = cp[Math.min(cp.length - 1, i + 2)];
      for (let s = 0; s < samples; s++) {
        const t = s / samples, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    out.push(cp[cp.length - 1]);
    return out;
  }
  function polyDist(poly, x, z) {
    let best = 1e9, along = 0, acc = 0, bestAlong = 0;
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i], b = poly[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, len = Math.sqrt(l2);
      let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a[0] + dx * t - x, pz = a[1] + dz * t - z, d = px * px + pz * pz;
      if (d < best) { best = d; bestAlong = acc + t * len; }
      acc += len;
    }
    along = bestAlong;
    return { d: Math.sqrt(best), along };
  }
  const RIVER = catmull(RIVER_CP, 24);
  const PATHP = PATHS.map(p => catmull(p, 8));
  const RIVER_W = 4.2;
  const WATER_Y = -0.55;

  // value noise (JS twin of the shaders' tn)
  const hsh = (i, j) => { const s = Math.sin(i * 41.3 + j * 289.1) * 43758.5453; return s - Math.floor(s); };
  function vnoise(x, z) {
    const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    return GW.lerp(GW.lerp(hsh(i, j), hsh(i + 1, j), u), GW.lerp(hsh(i, j + 1), hsh(i + 1, j + 1), u), v);
  }
  // biome weights (0..1): ash to the east, frost to the north, the Vale elsewhere
  function biomeRaw(x, z) {
    const wob = (vnoise(x * 0.004, z * 0.004) - 0.5) * 160;
    const frost = ss(-430, -640, z + wob);
    const ash = ss(500, 720, x + wob * 0.8) * (1 - frost);
    return [ash, frost];
  }
  function rawHeight(x, z) {
    let h = 0.5 * Math.sin(x * 0.05) * Math.cos(z * 0.045) + 0.35 * Math.sin(x * 0.13 + 1.3) * Math.sin(z * 0.11 + 0.7)
      + 0.12 * Math.sin(x * 0.4 + z * 0.3);
    const r = Math.hypot(x, z);
    h += ss(98, 128, r) * 2.2 * (1 - ss(150, 220, r));   // the old forest rise around the Vale, softened
    // rolling land beyond the Vale; mountains at the world's edge
    const far = ss(150, 340, r);
    h += far * ((vnoise(x * 0.0032, z * 0.0032) - 0.5) * 16 + (vnoise(x * 0.011 + 7, z * 0.011 + 3) - 0.5) * 5);
    h += ss(1120, 1290, Math.max(Math.abs(x), Math.abs(z))) * 45;
    const flatK = (cx, cz, r0, r1, to) => { const d = Math.hypot(x - cx, z - cz); h = GW.lerp(to, h, ss(r0, r1, d)); };
    flatK(L.village.x, L.village.z, 12, 20, 0.15);
    flatK(L.arena.x, L.arena.z, 16, 24, 0.0);
    flatK(L.start.x, L.start.z, 6, 12, 0.3);
    flatK(L.castle.x, L.castle.z, 16, 23, 0.4);
    flatK(L.chapel.x, L.chapel.z - 5, 10, 16, 0.3);
    flatK(L.tower.x, L.tower.z, 6, 11, 0.25);
    flatK(L.lair.x, L.lair.z, 14, 22, 0.1);
    flatK(L.hearth.x, L.hearth.z, 30, 55, h0At(L.hearth));
    flatK(L.cinder.x, L.cinder.z, 22, 40, h0At(L.cinder));
    flatK(L.abbey.x, L.abbey.z, 24, 44, h0At(L.abbey));
    flatK(L.frostLake.x, L.frostLake.z, 75, 110, h0At(L.frostLake) - 0.6);
    return h;
  }

  // base level for flattened hubs (the rolling-land height at their centre, without flattening)
  const _h0 = {};
  function h0At(c) {
    const k = c.x + ',' + c.z; if (_h0[k] !== undefined) return _h0[k];
    const r = Math.hypot(c.x, c.z), far = ss(150, 340, r);
    return (_h0[k] = far * ((vnoise(c.x * 0.0032, c.z * 0.0032) - 0.5) * 16 + (vnoise(c.x * 0.011 + 7, c.z * 0.011 + 3) - 0.5) * 5));
  }

  // ---------- bake ----------
  const H = new Float32Array(N * N), G = new Float32Array(N * N), R = new Float32Array(N * N), P = new Float32Array(N * N);
  const BA = new Float32Array(N * N), BF = new Float32Array(N * N);
  // distance to polylines, rasterised only in a band around each segment (fast at 1300^2)
  function bandDist(out, polys, band) {
    out.fill(band);
    const cellW = SIZE / N;
    for (const poly of polys) for (let s = 0; s < poly.length - 1; s++) {
      const a = poly[s], b = poly[s + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1e-6;
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - band + HALF) / cellW)), i1 = Math.min(N - 1, Math.ceil((Math.max(a[0], b[0]) + band + HALF) / cellW));
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - band + HALF) / cellW)), j1 = Math.min(N - 1, Math.ceil((Math.max(a[1], b[1]) + band + HALF) / cellW));
      for (let j = j0; j <= j1; j++) { const z = (j + 0.5) * cellW - HALF; for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) * cellW - HALF; let t = ((x - a[0]) * dx + (z - a[1]) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = a[0] + dx * t - x, pz = a[1] + dz * t - z, d = Math.sqrt(px * px + pz * pz), k = j * N + i;
        if (d < out[k]) out[k] = d;
      } }
    }
  }
  function bake() {
    bandDist(R, [RIVER], 60); bandDist(P, PATHP, 30);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / N * SIZE - HALF, z = (j + 0.5) / N * SIZE - HALF;
      const k0 = j * N + i, rd = R[k0], pd = P[k0];
      const [ba, bf] = biomeRaw(x, z); BA[k0] = ba; BF[k0] = bf;
      let h = rawHeight(x, z);
      const carve = GW.clamp(1 - rd / (RIVER_W + 1.6), 0, 1);
      h -= 1.9 * Math.pow(carve, 0.8);
      if (pd < 2.2) h -= 0.06 * (1 - pd / 2.2);
      let g = 0.95;
      g *= ss(RIVER_W - 0.15, RIVER_W + 0.25, rd);
      g *= GW.lerp(0.32, 1, ss(0.6, 2.4, pd));
      const vd = Math.hypot(x - L.village.x, z - L.village.z);
      g *= GW.lerp(0.6, 1, ss(6, 14, vd));
      const ad = Math.hypot(x - L.arena.x, z - L.arena.z);
      g *= GW.lerp(0.35, 1, ss(10, 18, ad));
      g *= 0.88 + 0.12 * Math.sin(x * 0.21) * Math.sin(z * 0.17);
      g *= GW.lerp(1, 0.55, ba) * GW.lerp(1, 0.6, bf);                                  // dry, sparse ash grass; thin snow grass
      for (const c of [L.hearth, L.cinder, L.abbey]) g *= GW.lerp(0.5, 1, ss(10, 22, Math.hypot(x - c.x, z - c.z)));
      if (Math.hypot(x - L.frostLake.x, z - L.frostLake.z) < 72) g = 0;               // the frozen mere
      const k = j * N + i;
      H[k] = h; G[k] = GW.clamp(g, 0, 1);
    }
  }
  function sample(arr, x, z) {
    const fx = (x + HALF) / SIZE * N - 0.5, fz = (z + HALF) / SIZE * N - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const at = (a, b) => arr[GW.clamp(b, 0, N - 1) * N + GW.clamp(a, 0, N - 1)];
    return GW.lerp(GW.lerp(at(i, j), at(i + 1, j), tx), GW.lerp(at(i, j + 1), at(i + 1, j + 1), tx), tz);
  }

  // ---------- instanced batches ----------
  function Batch() { this.groups = {}; }
  Batch.prototype.add = function (key, geom, mat, m4, color) {
    let g = this.groups[key]; if (!g) g = this.groups[key] = { geom, mat, items: [] };
    g.items.push({ m: m4.clone(), c: color ? new THREE.Color(color) : new THREE.Color(1, 1, 1) });
  };
  // instances are split into 36 m chunks with real bounds, so off-screen trees/props are skipped
  // by the main, shadow and reflection passes instead of always being drawn
  const it0Scale = m => new THREE.Vector3().setFromMatrixScale(m).y;
  Batch.prototype.build = function (scene, out, chunk) {
    const CH = chunk || 36, _p = new THREE.Vector3();
    Object.entries(this.groups).forEach(([key, g]) => {
      const chunks = new Map();
      for (const it of g.items) { _p.setFromMatrixPosition(it.m); const k = Math.floor(_p.x / CH) + ',' + Math.floor(_p.z / CH); (chunks.get(k) || chunks.set(k, []).get(k)).push(it); }
      if (!g.geom.boundingSphere) g.geom.computeBoundingSphere();
      for (const items of chunks.values()) {
        const im = new THREE.InstancedMesh(g.geom, g.mat, items.length); im.name = key;
        items.forEach((it, i) => { im.setMatrixAt(i, it.m); im.setColorAt(i, it.c); });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere(); im.frustumCulled = true; scene.add(im); if (out) out.push(im);
        if (g.geom.boundingSphere.radius * (it0Scale(items[0].m)) > 0.9) W.occluders.push(im);   // big enough to hide the hero
      }
    });
  };

  // ---------- world object ----------
  const W = GW.World = {
    SIZE, L, ZONES, WATER_Y,
    colliders: [], grid: new Map(), interact: [], spawns: [], flames: [], fires: [], occluders: [], lights: null, fireflies: null,
  };
  W.heightAt = (x, z) => sample(H, x, z);
  W.riverAt = (x, z) => sample(R, x, z);
  W.biomeAt = (x, z) => ({ ash: sample(BA, x, z), frost: sample(BF, x, z) });
  W.regionAt = (x, z) => { const b = W.biomeAt(x, z); return b.frost > 0.5 ? 'frost' : b.ash > 0.5 ? 'ash' : 'vale'; };
  W.REGIONS = REGIONS; W.CORE = CORE;
  W.pathAt = (x, z) => sample(P, x, z);
  W.inWater = (x, z) => sample(R, x, z) < RIVER_W - 0.6 && !W.onBridge(x, z);
  W.onBridge = (x, z) => {
    const b = W.bridge; if (!b) return false;
    const dx = x - b.x, dz = z - b.z;
    const u = dx * b.c + dz * b.s, v = -dx * b.s + dz * b.c;
    return Math.abs(u) < 1.6 && Math.abs(v) < b.len / 2;
  };
  W.groundY = (x, z) => W.onBridge(x, z) ? Math.max(W.heightAt(x, z), 0.35) : W.heightAt(x, z);
  W.riverDist = (x, z) => polyDist(RIVER, x, z).d;
  W.nearestRiver = function (x, z) {
    let best = null, bd = 1e9;
    for (let i = 0; i < RIVER.length - 1; i++) {
      const a = RIVER[i], b = RIVER[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
      const t = GW.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1), px = a[0] + dx * t, pz = a[1] + dz * t, d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < bd) { bd = d; best = [px, pz]; }
    }
    return best;
  };

  const CELL = 8;
  W.addCollider = function (x, z, r, tag, lv) {
    const c = { x, z, r, tag, lv };
    W.colliders.push(c);
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = i * 1000 + j; let a = W.grid.get(k); if (!a) W.grid.set(k, a = []); a.push(c);
    }
    return c;
  };
  W.removeCollider = function (c) {
    const i0 = Math.floor((c.x - c.r) / CELL), i1 = Math.floor((c.x + c.r) / CELL), j0 = Math.floor((c.z - c.r) / CELL), j1 = Math.floor((c.z + c.r) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = W.grid.get(i * 1000 + j); if (a) { const k = a.indexOf(c); if (k >= 0) a.splice(k, 1); } }
    const k = W.colliders.indexOf(c); if (k >= 0) W.colliders.splice(k, 1);
  };
  // push a circle out of colliders; returns true if touched
  W.collide = function (p, r, lv) {
    lv = lv || 0;
    let hit = false;
    const i = Math.floor(p.x / CELL), j = Math.floor(p.z / CELL);
    for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) {
      const arr = W.grid.get(a * 1000 + b); if (!arr) continue;
      for (const c of arr) {
        if (c.lv !== undefined && c.lv !== lv) continue;
        const dx = p.x - c.x, dz = p.z - c.z, rr = r + c.r, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), k = (rr - d) / d; p.x += dx * k; p.z += dz * k; hit = true; }
      }
    }
    const lim = 1250;   // the mountains at the world's edge
    if (Math.abs(p.x) > lim) { p.x = Math.sign(p.x) * lim; hit = true; }
    if (Math.abs(p.z) > lim) { p.z = Math.sign(p.z) * lim; hit = true; }
    return hit;
  };
  W.blocked = function (x, z, r) {
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) {
      const arr = W.grid.get(a * 1000 + b); if (!arr) continue;
      for (const c of arr) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (r + c.r) ** 2) return true;
    }
    return false;
  };

  W.build = function (scene, opts) {
    W.scene = scene;
    bake();
    W.lights = new GW.Lights();
    const rnd = GW.rand(1337);
    const batch = new Batch();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const place = (x, y, z, ry, sx, sy, sz) => { q.setFromAxisAngle(up, ry); m4.compose(v3.set(x, y, z), q, s3.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz)); return m4; };
    _kitBatch = batch; _kitPlace = place; _kitRnd = rnd;

    // ---- data texture for shaders ----
    const half = new Uint16Array(N * N * 4);
    for (let k = 0; k < N * N; k++) {
      half[k * 4] = THREE.DataUtils.toHalfFloat(H[k]);
      half[k * 4 + 1] = THREE.DataUtils.toHalfFloat(G[k]);
      half[k * 4 + 2] = THREE.DataUtils.toHalfFloat(Math.min(R[k], 60));
      half[k * 4 + 3] = THREE.DataUtils.toHalfFloat(Math.min(P[k], 60));
    }
    const tMap = new THREE.DataTexture(half, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
    tMap.minFilter = THREE.LinearFilter; tMap.magFilter = THREE.LinearFilter; tMap.needsUpdate = true;
    W.tMap = tMap; GW.LU.uHeightMap.value = tMap; GW.LU.uWorldSize.value = SIZE;
    // biome map: r = ash, g = frost
    const bio = new Uint8Array(N * N * 4);
    for (let k = 0; k < N * N; k++) { bio[k * 4] = Math.round(BA[k] * 255); bio[k * 4 + 1] = Math.round(BF[k] * 255); bio[k * 4 + 3] = 255; }
    const tBio = new THREE.DataTexture(bio, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    tBio.minFilter = THREE.LinearFilter; tBio.magFilter = THREE.LinearFilter; tBio.needsUpdate = true;
    GW.LU.uBiomeMap.value = tBio;
    // scorch the ground: grass gone (density < 0 marks burnt), terrain turns to ash-dirt
    W.burn = function (x, z, r) {
      const ci = Math.round((x + HALF) / SIZE * N - 0.5), cj = Math.round((z + HALF) / SIZE * N - 0.5), rr = Math.ceil(r / SIZE * N) + 1;
      for (let j = cj - rr; j <= cj + rr; j++) for (let i = ci - rr; i <= ci + rr; i++) {
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const wx = (i + 0.5) / N * SIZE - HALF, wz = (j + 0.5) / N * SIZE - HALF, d = Math.hypot(wx - x, wz - z);
        if (d > r + 0.6) continue;
        const k = j * N + i; G[k] = d < r ? -2 : Math.min(G[k], 0.15);
        half[k * 4 + 1] = THREE.DataUtils.toHalfFloat(G[k]);
      }
      tMap.needsUpdate = true;
      (W.burns = W.burns || []).push([x, z, r]);
      W.terrainRefresh(true);
    };

    // ---- terrain: a 640 m window of 2 m quads that follows you (re-centred on a 32 m grid, so vertices stay put) ----
    const TSPAN = 640, TSEG = 320, tg = new THREE.PlaneGeometry(TSPAN, TSPAN, TSEG, TSEG); tg.rotateX(-Math.PI / 2);
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(tg.attributes.position.count * 3), 3));
    const gridXZ = Float32Array.from({ length: tg.attributes.position.count * 2 }, (_, k) => k % 2 ? tg.attributes.position.getZ(k >> 1) : tg.attributes.position.getX(k >> 1));
    const terrain = new THREE.Mesh(tg, GW.mat({ id: ID.GROUND, vertexColors: true, color: 0xffffff, farGrass: 30 }));
    W.terrainMat = terrain.material; W.terrain = terrain;
    terrain.frustumCulled = false; terrain.layers.set(1); terrain.renderOrder = -6; scene.add(terrain);
    const groundCol = (x, z) => {
      const rd = sample(R, x, z), pd = sample(P, x, z), g = sample(G, x, z), ba = sample(BA, x, z), bf = sample(BF, x, z);
      const n = 0.8 + 0.4 * Math.sin(x * 0.7) * Math.sin(z * 0.9);
      let c = [0.07 * n, 0.12 * n, 0.065 * n];
      const dirt = [0.2, 0.16, 0.11], pf = 1 - ss(0.8, 2.6, pd);
      c = c.map((v, k) => GW.lerp(v, dirt[k], Math.max(pf, (1 - Math.max(0, g)) * 0.6)));
      const ashC = [0.11 * n, 0.095 * n, 0.085 * n], snowC = [0.42 * n, 0.47 * n, 0.55 * n];
      c = c.map((v, k) => GW.lerp(GW.lerp(v, ashC[k], ba * (1 - pf * 0.5)), snowC[k], bf * (1 - pf * 0.6)));
      if (g < -1) c = [0.085, 0.06, 0.045];                                         // scorched by a fire
      if (Math.hypot(x - L.frostLake.x, z - L.frostLake.z) < 74) c = [0.32, 0.42, 0.52]; // the frozen mere
      const bed = [0.06, 0.08, 0.11], bfr = 1 - ss(RIVER_W - 0.5, RIVER_W + 0.8, rd);
      return c.map((v, k) => GW.lerp(v, bed[k], bfr));
    };
    W.terrainRefresh = function (force, px, pz) {
      const cx = px === undefined ? (W._tc || [0, 0])[0] : Math.round(px / 32) * 32, cz = pz === undefined ? (W._tc || [0, 0])[1] : Math.round(pz / 32) * 32;
      if (!force && W._tc && W._tc[0] === cx && W._tc[1] === cz) return;
      W._tc = [cx, cz];
      const pos = tg.attributes.position, col = tg.attributes.color;
      for (let i = 0; i < pos.count; i++) {
        const x = gridXZ[i * 2] + cx, z = gridXZ[i * 2 + 1] + cz;
        pos.setXYZ(i, x, W.heightAt(x, z), z);
        const c = groundCol(x, z); col.setXYZ(i, c[0], c[1], c[2]);
      }
      pos.needsUpdate = true; col.needsUpdate = true; tg.computeVertexNormals();
    };
    W.terrainRefresh(true, L.start.x, L.start.z);

    // ---- water ----
    W.waterMat = buildWater(scene);

    // ---- grass ----
    W.grass = buildGrass(scene, tMap, opts.grassCount || 26000);

    // ---- bridge ----
    {
      const b = L.bridge;
      const i = RIVER.reduce((bi, p, k) => (Math.hypot(p[0] - b.x, p[1] - b.z) < Math.hypot(RIVER[bi][0] - b.x, RIVER[bi][1] - b.z) ? k : bi), 0);
      const t0 = RIVER[Math.max(0, i - 1)], t1 = RIVER[Math.min(RIVER.length - 1, i + 1)];
      const ang = Math.atan2(t1[1] - t0[1], t1[0] - t0[0]); // river direction
      W.bridge = { x: RIVER[i][0], z: RIVER[i][1], c: Math.cos(ang), s: Math.sin(ang), len: RIVER_W * 2 + 4 };
      const wood = GW.mat({ id: ID.WOOD, color: 0x6a4a2c });
      const plank = new THREE.BoxGeometry(0.5, 0.12, 3.2);
      const grp = new THREE.Group();
      for (let k = -9; k <= 9; k++) {
        const m = new THREE.Mesh(plank, wood);
        const arch = 0.35 + 0.35 * (1 - (k / 9) ** 2);
        m.position.set(0, arch, k * 0.62); m.rotation.y = (rnd() - 0.5) * 0.08; grp.add(m);
        if (k % 3 === 0) {
          for (const sd of [-1.5, 1.5]) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.1, 0.16), wood); post.position.set(sd, arch + 0.5, k * 0.62); grp.add(post);
          }
        }
      }
      for (const sd of [-1.5, 1.5]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 11.6), wood); rail.position.set(sd, 1.25, 0); grp.add(rail); }
      grp.position.set(W.bridge.x, 0, W.bridge.z);
      grp.rotation.y = -ang; // local z axis perpendicular to river
      scene.add(grp);
      // let the bridge's local axes drive onBridge: u across river, v along bridge
      W.bridge.c = Math.cos(ang); W.bridge.s = Math.sin(ang);
      // recompute in terms of bridge length axis (perpendicular to river)
      const bc = Math.cos(ang + Math.PI / 2), bs = Math.sin(ang + Math.PI / 2);
      W.onBridge = (x, z) => {
        const dx = x - W.bridge.x, dz = z - W.bridge.z;
        const along = dx * bc + dz * bs, across = -dx * bs + dz * bc;
        return Math.abs(across) < 1.5 && Math.abs(along) < 6.2;
      };
      W.groundY = (x, z) => {
        if (!W.onBridge(x, z)) return W.heightAt(x, z);
        const dx = x - W.bridge.x, dz = z - W.bridge.z, along = (dx * bc + dz * bs) / 0.62;
        return Math.max(W.heightAt(x, z), 0.4 + 0.35 * (1 - Math.min(1, (along / 9) ** 2)));
      };
    }

    // ---- geometries & materials for props ----
    const rockGeos = [0, 1, 2].map(k => { const g = new THREE.IcosahedronGeometry(1, 1); const p = g.attributes.position; const r2 = GW.rand(77 + k);
      for (let i = 0; i < p.count; i++) { const f = 0.78 + r2() * 0.4; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f); }
      g.computeVertexNormals(); return g; });
    // icosahedron vertices are duplicated per face: jitter per vertex keeps facets (stylised look)
    const stoneM = GW.mat({ id: ID.ROCK, tex: 6, color: 0x8a8b8e });
    const ruinM = GW.mat({ id: ID.MASONRY, tex: 1, color: 0x8c94aa });
    const woodM = GW.mat({ id: ID.PLANKS, tex: 2, color: 0x7a5a3e, fill: 0.12 });
    const leafM = GW.mat({ id: ID.LEAF, tex: 5, color: 0x3e7a62, fill: 0.08 });
    const deadM = GW.mat({ id: ID.BARK, tex: 3, color: 0x8a8478 });
    const mossM = GW.mat({ id: ID.MOSS, color: 0x6a7aa8 });
    const flowerM = GW.mat({ id: ID.FLOWER, color: 0xffffff, emissive: 0x2a2a30 });
    const trunkG = new THREE.CylinderGeometry(0.16, 0.3, 2.4, 6); trunkG.translate(0, 1.2, 0);
    const coneG = new THREE.ConeGeometry(1.5, 2.4, 7); coneG.translate(0, 1.2, 0);
    const pillarG = new THREE.CylinderGeometry(0.55, 0.65, 1, 8); pillarG.translate(0, 0.5, 0);
    const boxG = new THREE.BoxGeometry(1, 1, 1); const boxG0 = boxG.clone(); boxG0.translate(0, 0.5, 0);
    const discG = new THREE.SphereGeometry(1, 8, 4);
    const flowerG = new THREE.OctahedronGeometry(0.11, 0);

    const rock = (x, z, s, flatK) => {
      const y = W.heightAt(x, z);
      batch.add('rock' + (Math.floor(rnd() * 3)), rockGeos[Math.floor(rnd() * 3)], stoneM, place(x, y + s * 0.15, z, rnd() * 6.28, s, s * (flatK || (0.55 + rnd() * 0.35)), s * (0.8 + rnd() * 0.4)), new THREE.Color().setHSL(0.6, 0.02, 0.38 + rnd() * 0.18));
      W.addCollider(x, z, s * 0.85, 'rock');
    };
    const tree = (x, z, s, dark) => {
      const y = W.heightAt(x, z);
      batch.add('trunk', trunkG, woodM, place(x, y, z, rnd() * 6, s, s, s));
      const tint = new THREE.Color().setHSL(0.42 + rnd() * 0.06, 0.4, (dark ? 0.12 : 0.18) + rnd() * 0.08);
      for (let k = 0; k < 3; k++) batch.add('cone', coneG, leafM, place(x, y + s * (1.6 + k * 1.05), z, rnd() * 6, s * (1.05 - k * 0.24)), tint);
      W.addCollider(x, z, 0.55 * s, 'tree');
    };
    const deadTree = (x, z, s) => {
      const y = W.heightAt(x, z);
      batch.add('dtrunk', trunkG, deadM, place(x, y, z, rnd() * 6, s * 0.8, s * 1.5, s * 0.8));
      for (let k = 0; k < 3; k++) {
        const a = rnd() * 6.28; q.setFromEuler(new THREE.Euler(0.9 + rnd() * 0.4, a, 0, 'YXZ'));
        m4.compose(v3.set(x, y + s * (2 + k * 0.6), z), q, s3.set(s * 0.35, s * 0.7, s * 0.35)); batch.add('dtrunk', trunkG, deadM, m4);
      }
      W.addCollider(x, z, 0.5 * s, 'tree');
    };
    const pillar = (x, z, h, r) => {
      const y = W.heightAt(x, z);
      batch.add('pillar', pillarG, ruinM, place(x, y - 0.2, z, rnd() * 6, r || 1, h, r || 1), new THREE.Color().setHSL(0.62, 0.15, 0.55 + rnd() * 0.15));
      if (h > 0.6) { batch.add('box', boxG0, ruinM, place(x, y + h - 0.2, z, rnd() * 6, 1.6 * (r || 1), 0.35, 1.6 * (r || 1))); }
      W.addCollider(x, z, 0.75 * (r || 1), 'ruin');
    };
    const wallSeg = (x0, z0, x1, z1, h) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0), n = Math.max(1, Math.round(len / 1.2));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, x = GW.lerp(x0, x1, t), z = GW.lerp(z0, z1, t), y = W.heightAt(x, z);
        const hh = h * (0.4 + 0.6 * rnd());
        batch.add('box', boxG0, ruinM, place(x, y - 0.1, z, -ang, len / n * 0.98, hh, 0.9), new THREE.Color().setHSL(0.6, 0.12, 0.5 + rnd() * 0.15));
        W.addCollider(x, z, 0.7, 'ruin');
      }
    };
    const moss = (x, z, s) => { batch.add('moss', discG, mossM, place(x, W.heightAt(x, z) + 0.02, z, rnd() * 6, s * (0.8 + rnd() * 0.6), 0.06, s * (0.6 + rnd() * 0.5)), new THREE.Color().setHSL(0.6 + rnd() * 0.05, 0.25, 0.4 + rnd() * 0.25)); };
    const flower = (x, z) => {
      const y = W.heightAt(x, z) + 0.25, a = rnd() * 6;
      const c = new THREE.Color().setHSL(rnd() < 0.8 ? 0.6 : 0.12, 0.3, 0.8);
      for (let k = -1; k <= 1; k++) batch.add('flower', flowerG, flowerM, place(x + Math.cos(a) * k * 0.28, y + (k === 0 ? 0.06 : 0), z + Math.sin(a) * k * 0.28, rnd() * 3, k === 0 ? 1.4 : 1), c);
    };
    const free = (x, z, r) => {
      if (W.riverAt(x, z) < RIVER_W + 1.5 + r) return false;
      if (W.pathAt(x, z) < 2.5 + r) return false;
      for (const k of ['village', 'start', 'arena', 'castle', 'chapel', 'tower', 'lair']) if (Math.hypot(x - L[k].x, z - L[k].z) < (k === 'arena' ? 21 : k === 'castle' ? 20 : k === 'chapel' ? 13 : k === 'tower' ? 8 : k === 'lair' ? 17 : 18) + r) return false;
      return !W.blocked(x, z, r + 0.6);
    };

    // forest ring
    for (let k = 0; k < 520; k++) {
      const a = rnd() * Math.PI * 2, r = 96 + rnd() * 30;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (free(x, z, 1)) kitTree(['kit_pine_a', 'kit_pine_b', 'kit_pine_c'][Math.floor(rnd() * 3)], x, z, 0.9 + rnd() * 0.5);
    }
    // scattered trees
    for (let k = 0; k < 140; k++) {
      const x = (rnd() - 0.5) * 190, z = (rnd() - 0.5) * 190;
      if (Math.hypot(x - L.meadow.x, z - L.meadow.z) < 26) continue;
      if (Math.hypot(x - L.ruins.x, z - L.ruins.z) < 20) continue;
      if (free(x, z, 1)) kitTree(rnd() < 0.5 ? 'kit_oak_a' : 'kit_pine_a', x, z, 0.75 + rnd() * 0.4);
    }
    // wispwood: dead trees + some pines
    for (let k = 0; k < 70; k++) {
      const a = rnd() * 6.28, r = 6 + rnd() * 24, x = L.grove.x + Math.cos(a) * r, z = L.grove.z + Math.sin(a) * r;
      if (free(x, z, 0.8)) { if (rnd() < 0.65) deadTree(x, z, 1 + rnd() * 0.6); else kitTree('kit_pine_c', x, z, 0.8 + rnd() * 0.3); }
    }
    // rocks
    for (let k = 0; k < 160; k++) {
      const x = (rnd() - 0.5) * 210, z = (rnd() - 0.5) * 210, s = 0.5 + rnd() * rnd() * 2.2;
      if (k % 2 || [L.fire, L.ruinFire, L.meadowFire, L.start, L.village].some(c => Math.hypot(x - c.x, z - c.z) < 30)) continue;   // fewer, and none around camps
      if (free(x, z, 1.5)) rock(x, z, s);
    }
    // river stones along banks
    for (let k = 0; k < RIVER.length; k += 3) {
      const p = RIVER[k], a = rnd() * 6.28, d = RIVER_W + 0.4 + rnd() * 1.2;
      const x = p[0] + Math.cos(a) * d, z = p[1] + Math.sin(a) * d;
      if (!W.onBridge(x, z) && Math.hypot(x - L.bridge.x, z - L.bridge.z) > 7) rock(x, z, 0.35 + rnd() * 0.6, 0.5);
    }
    // ruins (west)
    {
      const cx = L.ruins.x, cz = L.ruins.z;
      wallSeg(cx - 14, cz - 10, cx + 6, cz - 13, 3.2);
      wallSeg(cx - 16, cz - 6, cx - 15, cz + 12, 2.6);
      wallSeg(cx + 10, cz + 6, cx + 12, cz + 16, 2.2);
      wallSeg(cx - 8, cz + 16, cx + 4, cz + 17, 1.8);
      for (let k = 0; k < 14; k++) { const a = k / 14 * 6.28, r = 9 + (k % 2) * 1.5; pillar(cx + Math.cos(a) * r, cz + Math.sin(a) * r, k % 3 === 0 ? 0.8 + rnd() : 2.5 + rnd() * 2.5); }
      for (let k = 0; k < 26; k++) { const x = cx + (rnd() - 0.5) * 34, z = cz + (rnd() - 0.5) * 34; if (!W.blocked(x, z, 0.6)) batch.add('box', boxG0, ruinM, place(x, W.heightAt(x, z) - 0.1, z, rnd() * 6, 0.5 + rnd() * 0.9, 0.3 + rnd() * 0.5, 0.5 + rnd() * 0.9)); }
      // ruin campfire (rest point)
      campfire(scene, L.ruinFire.x, L.ruinFire.z, 'Ruin-edge fire');
    }
    // meadow: flowers + moss
    for (let k = 0; k < 420; k++) {
      const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 40, x = L.meadow.x + Math.cos(a) * r, z = L.meadow.z + Math.sin(a) * r;
      if (W.riverAt(x, z) > RIVER_W + 1) flower(x, z);
    }
    for (let k = 0; k < 900; k++) {
      const x = (rnd() - 0.5) * 220, z = (rnd() - 0.5) * 220;
      if (Math.hypot(x, z) < 105 && W.riverAt(x, z) > RIVER_W + 0.5) { flower(x, z); }
    }
    campfire(scene, L.meadowFire.x, L.meadowFire.z, 'Meadow watchfire');

    // village
    buildVillage(scene, batch, place, rnd, boxG0, woodM);
    // start shrine
    buildShrine(scene, L.start.x, L.start.z - 4, 1.2, true);
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28 + 0.3; pillar(L.start.x + Math.cos(a) * 9, L.start.z + Math.sin(a) * 9, k % 2 ? 0.7 : 1.8 + rnd()); }
    // boss arena: ring of standing stones
    W.arenaStones = [];
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * 6.28, x = L.arena.x + Math.cos(a) * 19, z = L.arena.z + Math.sin(a) * 19;
      W.arenaStones.push(buildShrine(scene, x, z, 0.8 + (k % 3) * 0.2, false));
    }

    buildChapel(scene);
    buildTower(scene);
    buildHubs(scene);
    natureScatter(batch, place, rnd, free);
    kitScatter(scene, batch, place, rnd, free);
    buildCastle(scene);
    batch.build(scene);
    buildFireflies(scene);
    buildSky(scene);
    W.zonesDone = {};
  };

  // ----- CC0 nature models (Kenney Nature Kit via the asset pack), instanced per material -----
  const NAT_MAT = {
    leafsDark: { id: ID.LEAF, tex: 5, color: 0x3c7a60, fill: 0.08 }, leafsGreen: { id: ID.LEAF, tex: 5, color: 0x4a8a5c, fill: 0.08 },
    leafsFall: { id: ID.LEAF, tex: 5, color: 0xc06a28 }, grass: { id: ID.LEAF, tex: 5, color: 0x2c5a2e },
    woodBark: { id: ID.BARK, tex: 3, color: 0x8a6646, fill: 0.12 }, woodBarkDark: { id: ID.BARK, tex: 3, color: 0x6a5038, fill: 0.12 }, woodBirch: { id: ID.BARK, tex: 3, color: 0xd6d0c2 },
    woodInner: { id: ID.PLANKS, tex: 2, color: 0xb88e5c }, dirt: { id: ID.ROCK, tex: 6, color: 0x77787b }, stone: { id: ID.ROCK, tex: 6, color: 0x88898c },
    colorRed: { id: ID.FLOWER, color: 0xc02424, emissive: 0x200404 }, _defaultMat: { id: ID.STONE, color: 0xd0c8b8 },
  };
  const natCache = {}, natMats = {};
  function natParts(name) {
    if (natCache[name]) return natCache[name];
    const g = GW.Assets.gltf['nat_' + name]; if (!g) return (natCache[name] = []);
    g.scene.updateMatrixWorld(true);
    const parts = [];
    g.scene.traverse(o => { if (o.isMesh) { const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); if (!geo.attributes.normal) geo.computeVertexNormals(); parts.push({ geo, mn: o.material.name }); } });
    return (natCache[name] = parts);
  }
  function natMat(mn, glow) {
    const k = mn + (glow ? '+glow' : '');
    if (!natMats[k]) natMats[k] = GW.mat(Object.assign({}, NAT_MAT[mn] || { id: ID.STONE, color: 0x888888 }, glow ? { emissive: 0x0a3a40 } : {}));
    return natMats[k];
  }
  function natureScatter(batch, place, rnd, free) {
    const put = (name, x, z, s, opts) => {
      opts = opts || {};
      const y = W.heightAt(x, z) - 0.05 * s, ry = rnd() * 6.28;
      natParts(name).forEach((p, i) => {
        const tint = new THREE.Color(1, 1, 1).multiplyScalar(0.85 + rnd() * 0.3);
        batch.add('nat_' + name + i + (opts.glow ? 'g' : ''), p.geo, natMat(p.mn, opts.glow), place(x, y, z, ry, s * (opts.sx || 1), s, s * (opts.sx || 1)), tint);
      });
      if (opts.col) W.addCollider(x, z, opts.col, opts.tag || 'tree');
    };
    // conifers thicken the forest ring
    for (let k = 0; k < 260; k++) {
      const a = rnd() * Math.PI * 2, r = 92 + rnd() * 30, x = Math.cos(a) * r, z = Math.sin(a) * r, s = 3.2 + rnd() * 2.2;
      if (free(x, z, 1)) kitTree(['kit_pine_a', 'kit_pine_b', 'kit_pine_c'][Math.floor(rnd() * 3)], x, z, 0.85 + rnd() * 0.45);
    }
    // broadleaf trees: oaks in the open, birches with autumn leaves around the village and the ruins
    for (let k = 0; k < 120; k++) {
      const x = (rnd() - 0.5) * 190, z = (rnd() - 0.5) * 190, s = 3 + rnd() * 2;
      if (Math.hypot(x - L.meadow.x, z - L.meadow.z) < 24) continue;
      const nearVillage = Math.hypot(x - L.village.x, z - L.village.z) < 45 || Math.hypot(x - L.ruins.x, z - L.ruins.z) < 40;
      if (free(x, z, 1.2)) kitTree(rnd() < 0.55 ? ['kit_oak_a', 'kit_oak_b'][Math.floor(rnd() * 2)] : ['kit_pine_a', 'kit_pine_c'][Math.floor(rnd() * 2)], x, z, 0.8 + rnd() * 0.4);
    }
    // Wispwood: dark trees and faintly glowing mushrooms
    for (let k = 0; k < 40; k++) {
      const a = rnd() * 6.28, r = 5 + rnd() * 26, x = L.grove.x + Math.cos(a) * r, z = L.grove.z + Math.sin(a) * r;
      if (free(x, z, 1)) kitTree('kit_pine_c', x, z, 0.8 + rnd() * 0.4);
    }
    for (let k = 0; k < 90; k++) {
      const a = rnd() * 6.28, r = rnd() * 30, x = L.grove.x + Math.cos(a) * r, z = L.grove.z + Math.sin(a) * r;
      if (free(x, z, 0.2)) for (let m = 0; m < 3; m++) put('mushroom_red', x + (rnd() - 0.5) * 0.8, z + (rnd() - 0.5) * 0.8, 2 + rnd() * 2, { glow: true });
    }
    // logs, stumps, boulders, bushes
    for (let k = 0; k < 70; k++) {
      const x = (rnd() - 0.5) * 200, z = (rnd() - 0.5) * 200;
      if (!free(x, z, 1.5)) continue;
      const r = rnd();
      if (r < 0.3) put('log', x, z, 2.6 + rnd(), { col: 0.9, tag: 'log' });
      else if (r < 0.55) put('stump', x, z, 3 + rnd() * 1.5, { col: 0.45, tag: 'stump' });
      else if ([L.fire, L.ruinFire, L.meadowFire, L.start, L.village].some(c => Math.hypot(x - c.x, z - c.z) < 26)) continue;   // keep campsites clear of boulders
      else if (r < 0.8) put('rock_tall', x, z, 1.4 + rnd() * 1.4, { col: 0.8, tag: 'rock' });
      else put('rock_large', x, z, 1.8 + rnd() * 1.6, { col: 1.0, tag: 'rock' });
    }
    for (let k = 0; k < 60; k++) {
      const x = (rnd() - 0.5) * 210, z = (rnd() - 0.5) * 210;
      if (Math.hypot(x, z) < 108 && Math.hypot(x, z) > 70 && free(x, z, 0.4)) put('bush_large', x, z, 2 + rnd() * 2);
    }
  }

  // ----- Blender-built environment kit (tools/blender/build_kit.py) -----
  const KIT_MAT = {
    stone: { id: ID.MASONRY, tex: 8, color: 0x9a9b9e, fill: 0.08 }, stoneDark: { id: ID.MASONRY, tex: 8, color: 0x6c6d70, fill: 0.06 },
    moss: { id: ID.MOSS, tex: 5, color: 0x3e5a36 }, wood: { id: ID.PLANKS, tex: 2, color: 0x8e6a48, fill: 0.08 }, woodDark: { id: ID.PLANKS, tex: 2, color: 0x6a4e38, fill: 0.08 },
    bark: { id: ID.BARK, tex: 3, color: 0x86766a, fill: 0.1 }, thatch: { id: ID.THATCH, tex: 4, color: 0x8a7650, fill: 0.05 }, iron: { id: ID.METAL, tex: 7, color: 0x5a5e66 },
    cloth: { id: ID.PLANKS, color: 0xb8a882 }, lantern: { id: ID.FIRE, color: 0, emissive: 0xffb050, unlit: true }, void: { id: ID.VOID, color: 0, unlit: true },
    needle: { id: ID.LEAF, tex: 5, color: 0x44866a, fill: 0.1 }, foliage: { id: ID.LEAF, tex: 5, color: 0x538c60, fill: 0.1 },
    rock: { id: ID.ROCK, tex: 6, color: 0x9a9ea8, fill: 0.06 },
  };
  const kitCache = {}, kitMats = {};
  function kitParts(name) {
    if (kitCache[name]) return kitCache[name];
    const g = GW.Assets.gltf.kit; const root = g && g.scene.getObjectByName(name);
    if (!root) return (kitCache[name] = []);
    g.scene.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert(), parts = [];
    root.traverse(o => { if (o.isMesh) { const geo = o.geometry.clone(); geo.applyMatrix4(inv.clone().multiply(o.matrixWorld)); if (!geo.attributes.normal) geo.computeVertexNormals(); parts.push({ geo, mn: /kit_rock/.test(name) && o.material.name === 'stone' ? 'rock' : o.material.name }); } });
    return (kitCache[name] = parts);
  }
  let _kitBatch = null, _kitPlace = null, _kitRnd = null;
  function kitTree(name, x, z, s) {
    if (!_kitBatch) return;
    const y = W.heightAt(x, z) - 0.05, ry = _kitRnd() * 6.28;
    kitParts(name).forEach((p, i) => _kitBatch.add('kit_' + name + i, p.geo, kitMat(p.mn), _kitPlace(x, y, z, ry, s), new THREE.Color(1, 1, 1).multiplyScalar(0.82 + _kitRnd() * 0.3)));
    W.addCollider(x, z, 0.4 * s, 'tree');
  }
  function kitMat(mn) { return kitMats[mn] || (kitMats[mn] = GW.mat(Object.assign({ side: THREE.DoubleSide }, KIT_MAT[mn] || { id: ID.STONE, color: 0x888888 }))); }
  function kitScatter(scene, batch, place, rnd, free) {
    const put = (name, x, z, s, ry, col, tint) => {
      const y = W.heightAt(x, z) - 0.04;
      kitParts(name).forEach((p, i) => batch.add('kit_' + name + i, p.geo, kitMat(p.mn), place(x, y, z, ry, s), tint || new THREE.Color(1, 1, 1).multiplyScalar(0.88 + rnd() * 0.24)));
      if (col) W.addCollider(x, z, col * s, 'kit');
    };
    const lantern = (x, z, ry) => {
      put('kit_lantern', x, z, 1, ry, 0.2);
      const c = Math.cos(ry), sn = Math.sin(ry), lx = x + 0.58 * c, lz = z - 0.58 * sn;
      W.lights.add(lx, W.heightAt(x, z) + 1.9, lz, new THREE.Color(1.0, 0.62, 0.28), 8, 0.5);
    };
    // ruins: arches, pillars, rubble around the old scriptorium
    const R = L.ruins;
    [[-6, -11, 0.2], [9, -4, 1.8], [-12, 7, 1.2], [4, 13, 2.9]].forEach(([dx, dz, a]) => put('kit_arch', R.x + dx, R.z + dz, 1.15, a, 1.6));
    for (let k = 0; k < 10; k++) { const a = rnd() * 6.28, r = 5 + rnd() * 13, x = R.x + Math.cos(a) * r, z = R.z + Math.sin(a) * r; if (!W.blocked(x, z, 0.8)) put(rnd() < 0.5 ? 'kit_pillar_a' : 'kit_pillar_b', x, z, 0.9 + rnd() * 0.3, rnd() * 6.28, 0.6); }
    // the quiet graves: crypt, rows of graves, shrine, dead trees, lanterns, fence
    const GX = -36, GZ = 64;
    put('kit_crypt', GX, GZ - 6, 1.1, 0, 2.0);
    put('kit_shrine', GX + 6, GZ - 4, 1, 0.3, 0.7);
    const graves = ['kit_grave_round', 'kit_grave_cross', 'kit_grave_slab', 'kit_grave_obelisk'];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) {
      const x = GX - 7.5 + i * 3 + (rnd() - 0.5) * 0.8, z = GZ + row * 3.2 + (rnd() - 0.5) * 0.6;
      if (rnd() < 0.85) put(graves[Math.floor(rnd() * 4)], x, z, 1.05 + rnd() * 0.2, Math.PI + (rnd() - 0.5) * 0.4, 0.35);
    }
    put('kit_deadtree_a', GX - 10, GZ - 3, 1, rnd() * 6.28, 0.35); put('kit_deadtree_c', GX + 10, GZ + 7, 1, rnd() * 6.28, 0.35);
    lantern(GX - 3, GZ - 2.5, 0.4); lantern(GX + 3.5, GZ + 9.5, 2.6);
    for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28 + 0.2; if (Math.abs(GW.angDiff(a, Math.PI / 2)) < 0.4) continue; put('kit_fence', GX + Math.cos(a) * 12, GZ + 2 + Math.sin(a) * 11, 1, -a + Math.PI / 2, 0); }
    // Emberhold: huts, well, lanterns, cart, barrels, crates
    const V = L.village;
    put('kit_hut', V.x - 9, V.z - 8, 1.25, 0.9, 1.9); put('kit_hut', V.x + 9, V.z + 8, 1.25, -2.3, 1.9);
    put('kit_well', V.x - 5.5, V.z - 3.5, 1.1, 0.4, 1.0);
    lantern(V.x + 4, V.z - 10, 0.0); lantern(V.x - 4, V.z + 10, 3.1); lantern(V.x + 11, V.z + 1, 1.5);
    put('kit_cart', V.x + 11, V.z + 4, 1.1, 2.0, 1.1);
    [[12, -3], [12.6, -2.2], [11.6, -1.8]].forEach(([dx, dz]) => put('kit_barrel', V.x + dx, V.z + dz, 1, rnd() * 6, 0.35));
    [[-11, 3], [-11.8, 3.6], [-11.3, 4.4]].forEach(([dx, dz], i) => put('kit_crate', V.x + dx, V.z + dz, 1 - i * 0.12, rnd() * 6, 0.45));
    // dead trees in Wispwood and across the vale, rocks everywhere
    const trees = ['kit_deadtree_a', 'kit_deadtree_b', 'kit_deadtree_c'];
    for (let k = 0; k < 18; k++) { const a = rnd() * 6.28, r = 4 + rnd() * 26, x = L.grove.x + Math.cos(a) * r, z = L.grove.z + Math.sin(a) * r; if (free(x, z, 1)) put(trees[k % 3], x, z, 0.9 + rnd() * 0.4, rnd() * 6.28, 0.4); }
    for (let k = 0; k < 22; k++) { const x = (rnd() - 0.5) * 200, z = (rnd() - 0.5) * 200; if (Math.hypot(x, z) < 100 && free(x, z, 1.2)) put(trees[k % 3], x, z, 0.8 + rnd() * 0.5, rnd() * 6.28, 0.4); }
    // the Widow's hollow: a ring of dead trees strung with glowing webs
    { const C = L.lair, anchors = [];
      for (let k = 0; k < 9; k++) {
        const a = k / 9 * Math.PI * 2 + 0.2, r = 14 + rnd() * 3, x = C.x + Math.cos(a) * r, z = C.z + Math.sin(a) * r;
        put(trees[k % 3], x, z, 1.2 + rnd() * 0.4, rnd() * 6.28, 0.5); anchors.push([x, W.heightAt(x, z), z]);
      }
      W.lairWebs = buildWebs(scene, C, anchors, rnd);
    }
    // ---- Hearthwick: the crossroads village ----
    { const V = L.hearth;
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2 + 0.3, r = 15 + (k % 2) * 4; if (Math.abs(GW.angDiff(a, -Math.PI * 0.75)) < 0.35 || Math.abs(GW.angDiff(a, Math.PI * 0.15)) < 0.3) continue;
        put('kit_hut', V.x + Math.cos(a) * r, V.z + Math.sin(a) * r, 1.2 + rnd() * 0.15, -a - Math.PI / 2, 1.9); }
      put('kit_well', V.x + 6, V.z + 5, 1.1, 0.4, 1.0);
      [[-5, 7, 0.3], [7, -6, 2.0], [-9, -4, 4.2]].forEach(([dx, dz, a]) => lantern(V.x + dx, V.z + dz, a));
      put('kit_cart', V.x - 11, V.z + 9, 1.1, 2.4, 1.1);
      [[10, 9], [10.6, 9.8], [11.4, 9.1]].forEach(([dx, dz]) => put('kit_barrel', V.x + dx, V.z + dz, 1, rnd() * 6, 0.35));
      [[-12, -9], [-12.8, -8.4]].forEach(([dx, dz]) => put('kit_crate', V.x + dx, V.z + dz, 1, rnd() * 6, 0.45));
      for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2; if (k % 6 === 0) continue; put('kit_fence', V.x + Math.cos(a) * 27, V.z + Math.sin(a) * 27, 1, -a + Math.PI / 2, 0); }
    }
    // ---- Cinder Watch: burnt huts and dead trees around the burning tower ----
    { const C = L.cinder;
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + 0.6, r = 13 + rnd() * 5; put('kit_hut', C.x + Math.cos(a) * r, C.z + Math.sin(a) * r, 1.1, rnd() * 6, 1.8, new THREE.Color(0.55, 0.47, 0.42)); }
      for (let k = 0; k < 12; k++) { const a = rnd() * 6.28, r = 20 + rnd() * 14; put(trees[k % 3], C.x + Math.cos(a) * r, C.z + Math.sin(a) * r, 1 + rnd() * 0.5, rnd() * 6.28, 0.4, new THREE.Color(0.35, 0.3, 0.28)); }
    }
    // ---- Rimeglass Abbey: lanterns along the frozen approach ----
    { const A = L.abbey; [[-4, 14, 0], [4, 14, 3.1], [-4, 22, 0], [4, 22, 3.1]].forEach(([dx, dz, a]) => lantern(A.x + dx, A.z + dz, a)); }
    const nearCamp = (x, z) => [L.fire, L.ruinFire, L.meadowFire, L.start, L.village].some(c => Math.hypot(x - c.x, z - c.z) < 26);
    for (let k = 0; k < 40; k++) { const x = (rnd() - 0.5) * 210, z = (rnd() - 0.5) * 210, s = 0.4 + rnd() * 0.45; if (Math.hypot(x, z) < 104 && !nearCamp(x, z) && free(x, z, 1.4)) put(['kit_rock_a', 'kit_rock_b', 'kit_rock_c'][k % 3], x, z, s, rnd() * 6.28, 0.85); }
  }

  // glowing dotted spider webs (thin ribbons drawn with the twinkling star glyphs)
  function buildWebs(scene, C, anchors, rnd) {
    const pos = [];
    const strand = (a, b, w) => {          // flat ribbon from a to b, widened sideways in the horizontal plane + up
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz) || 1;
      let sx = -dz / len, sz = dx / len, sy = 0; const sl = Math.hypot(sx, sz); if (sl < 0.2) { sx = 1; sz = 0; } else { sx /= sl; sz /= sl; }
      const hw = w / 2, o = [sx * hw, 0.35 * hw, sz * hw];
      const p0 = [a[0] - o[0], a[1] - o[1], a[2] - o[2]], p1 = [a[0] + o[0], a[1] + o[1], a[2] + o[2]], p2 = [b[0] + o[0], b[1] + o[1], b[2] + o[2]], p3 = [b[0] - o[0], b[1] - o[1], b[2] - o[2]];
      pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
    };
    const radial = (c, u, v, R, spokes, rings) => {   // web in the plane spanned by u, v
      const pt = (ang, r) => [c[0] + (u[0] * Math.cos(ang) + v[0] * Math.sin(ang)) * r, c[1] + (u[1] * Math.cos(ang) + v[1] * Math.sin(ang)) * r, c[2] + (u[2] * Math.cos(ang) + v[2] * Math.sin(ang)) * r];
      const angs = Array.from({ length: spokes }, (_, k) => k / spokes * Math.PI * 2 + (rnd() - 0.5) * 0.3);
      angs.forEach(a => strand(c, pt(a, R * (0.85 + rnd() * 0.3)), 0.08));
      for (let r = 1; r <= rings; r++) { const rr = R * r / (rings + 0.5); for (let k = 0; k < spokes; k++) strand(pt(angs[k], rr * (0.9 + rnd() * 0.15)), pt(angs[(k + 1) % spokes] + (k + 1 === spokes ? Math.PI * 2 : 0), rr * (0.9 + rnd() * 0.15)), 0.06); }
    };
    // vertical webs strung between neighbouring dead trees
    for (let k = 0; k < anchors.length; k++) {
      if (k % 3 === 2) continue;
      const A = anchors[k], B = anchors[(k + 1) % anchors.length];
      const c = [(A[0] + B[0]) / 2, Math.max(A[1], B[1]) + 3.2, (A[2] + B[2]) / 2];
      const ux = B[0] - A[0], uz = B[2] - A[2], ul = Math.hypot(ux, uz) || 1;
      radial(c, [ux / ul, 0, uz / ul], [0, 1, 0], Math.min(3.4, ul * 0.5), 9, 5);
      strand([A[0], A[1] + 4.5, A[2]], c, 0.07); strand([B[0], B[1] + 4.5, B[2]], c, 0.07);
    }
    // webs over the ground and long guy-lines toward the centre
    for (let k = 0; k < 6; k++) {
      const a = rnd() * Math.PI * 2, r = 3 + rnd() * 8, x = C.x + Math.cos(a) * r, z = C.z + Math.sin(a) * r;
      radial([x, W.heightAt(x, z) + 0.06, z], [1, 0, 0], [0, 0, 1], 1.6 + rnd() * 1.6, 8, 3);
    }
    anchors.forEach(A => { if (rnd() < 0.6) strand([A[0], A[1] + 3.5, A[2]], [C.x + (rnd() - 0.5) * 6, W.heightAt(C.x, C.z) + 0.05, C.z + (rnd() - 0.5) * 6], 0.05); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, GW.mat({ id: ID.STAR, color: 0, emissive: 0xb8c8f0, unlit: true, side: THREE.DoubleSide }));
    m.frustumCulled = false; scene.add(m);
    W.lights.add(C.x, W.heightAt(C.x, C.z) + 4, C.z, new THREE.Color(0.4, 0.45, 0.65), 16, 0.3);
    return m;
  }

  // ----- hubs & landmarks beyond the Vale: reuse the chapel/tower models with region palettes -----
  function buildHubs(scene) {
    campfire(scene, L.hearth.x, L.hearth.z, 'Hearthwick');
    // Cinder Watch: the watchtower model, charred, with fires
    const tg = GW.Assets.gltf.tower;
    if (tg) {
      const C = L.cinder, base = W.heightAt(C.x, C.z) - 0.05;
      mergeByMat(tg, {
        cobble: GW.mat({ id: ID.MASONRY, tex: 8, color: 0x6a625c, fill: 0.08 }), cobbleDark: GW.mat({ id: ID.MASONRY, tex: 8, color: 0x3a3532, fill: 0.06 }),
        moss: GW.mat({ id: ID.FIRE, color: 0, emissive: 0x7a2a08, unlit: true }), wood: GW.mat({ id: ID.PLANKS, tex: 2, color: 0x3a2a20 }),
        woodDark: GW.mat({ id: ID.PLANKS, tex: 2, color: 0x2a2018 }), iron: GW.mat({ id: ID.STONE, color: 0x3a3a40 }),
        gold: GW.mat({ id: ID.RUNE, color: 0, emissive: 0xd8a040, unlit: true }), void: GW.mat({ id: ID.VOID, color: 0, unlit: true }),
      }, null, C.x, base, C.z, scene);
      W.addCollider(C.x, C.z, 3.6, 'tower');
      campfire(scene, C.x + 7, C.z + 7, 'Cinder Watch');
      torch(scene, C.x - 2.2, C.z + 4.2, 2.2); torch(scene, C.x + 2.2, C.z + 4.2, 2.2);
    }
    // Rimeglass Abbey: the chapel model in frost-pale stone, by the frozen mere
    const cg = GW.Assets.gltf.chapel;
    if (cg) {
      const A = L.abbey, base = W.heightAt(A.x, A.z) - 0.05;
      mergeByMat(cg, {
        cobble: GW.mat({ id: ID.MASONRY, tex: 8, color: 0xa8b4c4, fill: 0.14 }), cobbleDark: GW.mat({ id: ID.MASONRY, tex: 8, color: 0x6a7686, fill: 0.08 }),
        moss: GW.mat({ id: ID.MOSS, tex: 5, color: 0xc8d8e8, fill: 0.12 }), iron: GW.mat({ id: ID.STONE, color: 0x3a3a40 }),
      }, null, A.x, base, A.z, scene);
      const tw = (lx, ly) => [A.x + lx, A.z - ly];
      const seg = (x0, y0, x1, y1, r) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (r * 1.1)));
        for (let i = 0; i <= n; i++) { const t = i / n; W.addCollider(...tw(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t), r, 'chapel'); } };
      seg(-6.3, 0.55, -1.6, 0.55, 0.6); seg(1.6, 0.55, 6.3, 0.55, 0.6);
      [-6.35, -2.1, 2.1, 6.35].forEach(x => W.addCollider(...tw(x, -0.4), 0.55, 'chapel'));
      seg(-5.45, 1.2, -5.45, 12.6, 0.55); seg(5.45, 1.2, 5.45, 12.6, 0.55); seg(-5.45, 12.65, 5.45, 12.65, 0.55);
      campfire(scene, A.x + 3, A.z + 12, 'Rimeglass Abbey');
    }
    // the frozen mere: a sheet of dark ice
    { const F = L.frostLake, y = W.heightAt(F.x, F.z) + 0.04;
      const ice = new THREE.Mesh(new THREE.CircleGeometry(73, 64).rotateX(-Math.PI / 2), GW.mat({ id: ID.WATER, color: 0x5a7088, rim: 0.3 }));
      ice.position.set(F.x, y, F.z); ice.layers.set(1); ice.renderOrder = -5.9; scene.add(ice); }
  }

  // ----- the wilderness beyond the Vale: generated per 96 m chunk as you approach, dropped when far -----
  const CHK = 96, LOAD_R = 230, DROP_R = 330, chunks = new Map();
  const BIO_MAT = {
    frost: { needle: 0xb4c4d0, foliage: 0xbcc8d0, bark: 0x5a5550, rock: 0xb8c0cc, stone: 0xb0b8c4 },
    ash: { needle: 0x4a4038, foliage: 0x4a4038, bark: 0x2e2a28, rock: 0x55524f, stone: 0x5a5654 },
  };
  const bioMats = {};
  function kitMatB(mn, bio) {
    const over = BIO_MAT[bio] && BIO_MAT[bio][mn]; if (!over) return kitMat(mn);
    const k = mn + '@' + bio; return bioMats[k] || (bioMats[k] = GW.mat(Object.assign({ side: THREE.DoubleSide }, KIT_MAT[mn], { color: over })));
  }
  function chunkFree(x, z, r) {
    if (Math.abs(x) < CORE + 4 && Math.abs(z) < CORE + 4) return false;
    if (Math.max(Math.abs(x), Math.abs(z)) > 1230) return false;
    if (sample(R, x, z) < RIVER_W + 1.5 + r || sample(P, x, z) < 3.2 + r) return false;
    for (const c of [L.hearth, L.cinder, L.abbey]) if (Math.hypot(x - c.x, z - c.z) < 36 + r) return false;
    if (Math.hypot(x - L.frostLake.x, z - L.frostLake.z) < 80 + r) return false;
    return !W.blocked(x, z, r + 0.6);
  }
  function genChunk(ci, cj, scene) {
    const rnd = GW.rand(((ci * 7919 + cj * 104729) >>> 0) % 2147483646 + 1);
    const batch = new Batch(), cols = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const place = (x, y, z, ry, s) => { q.setFromAxisAngle(up, ry); m4.compose(v3.set(x, y, z), q, s3.set(s, s, s)); return m4; };
    const kit = (name, x, z, s, col, bio, tint) => {
      const y = W.heightAt(x, z) - 0.05, ry = rnd() * 6.28;
      kitParts(name).forEach((p, i) => batch.add(name + i + bio, p.geo, kitMatB(p.mn, bio), place(x, y, z, ry, s), tint || new THREE.Color(1, 1, 1).multiplyScalar(0.82 + rnd() * 0.3)));
      if (col) cols.push(W.addCollider(x, z, col * s, 'tree'));
    };
    const nat = (name, x, z, s, col) => {
      const y = W.heightAt(x, z) - 0.05 * s, ry = rnd() * 6.28;
      natParts(name).forEach((p, i) => batch.add('nat_' + name + i, p.geo, natMat(p.mn), place(x, y, z, ry, s), new THREE.Color(1, 1, 1).multiplyScalar(0.85 + rnd() * 0.3)));
      if (col) cols.push(W.addCollider(x, z, col, 'rock'));
    };
    const x0 = ci * CHK, z0 = cj * CHK;
    for (let k = 0; k < 90; k++) {
      const x = x0 + rnd() * CHK, z = z0 + rnd() * CHK;
      const forest = vnoise(x * 0.011, z * 0.011), bio = W.regionAt(x, z), roll = rnd();
      if (bio === 'ash') {
        if (roll < 0.1) { if (chunkFree(x, z, 1)) kit(['kit_deadtree_a', 'kit_deadtree_b', 'kit_deadtree_c'][k % 3], x, z, 0.8 + rnd() * 0.6, 0.4, 'ash', new THREE.Color(0.4, 0.35, 0.32)); }
        else if (roll < 0.16) { if (chunkFree(x, z, 1.2)) kit(['kit_rock_a', 'kit_rock_b', 'kit_rock_c'][k % 3], x, z, 0.5 + rnd() * 0.9, 0.85, 'ash'); }
      } else if (bio === 'frost') {
        if (roll < (forest > 0.58 ? 0.75 : 0.05)) { if (chunkFree(x, z, 1)) kit(['kit_pine_a', 'kit_pine_b', 'kit_pine_c'][k % 3], x, z, 0.85 + rnd() * 0.5, 0.4, 'frost'); }
        else if (roll < 0.85 && roll > 0.8) { if (chunkFree(x, z, 1.2)) kit(['kit_rock_a', 'kit_rock_b', 'kit_rock_c'][k % 3], x, z, 0.5 + rnd() * 0.8, 0.85, 'frost'); }
      } else {
        if (roll < (forest > 0.6 ? 0.8 : forest > 0.45 ? 0.12 : 0.03)) { if (chunkFree(x, z, 1)) kit(rnd() < 0.4 ? ['kit_oak_a', 'kit_oak_b'][k % 2] : ['kit_pine_a', 'kit_pine_b', 'kit_pine_c'][k % 3], x, z, 0.8 + rnd() * 0.5, 0.4, 'vale'); }
        else if (roll > 0.97) { if (chunkFree(x, z, 1.5)) { const r2 = rnd(); if (r2 < 0.4) nat('log', x, z, 2.6 + rnd(), 0.9); else if (r2 < 0.7) nat('stump', x, z, 3 + rnd(), 0.45); else nat('bush_large', x, z, 2 + rnd() * 2, 0); } }
        else if (roll > 0.955) { if (chunkFree(x, z, 1.2)) kit(['kit_rock_a', 'kit_rock_b', 'kit_rock_c'][k % 3], x, z, 0.45 + rnd() * 0.6, 0.85, 'vale'); }
      }
    }
    const meshes = []; batch.build(scene, meshes, 1e6);   // one mesh per kind per chunk
    return { meshes, cols };
  }
  W.stream = function (px, pz, scene, budget) {
    const ci0 = Math.floor(px / CHK), cj0 = Math.floor(pz / CHK), n = Math.ceil(LOAD_R / CHK);
    let made = 0;
    for (let dj = -n; dj <= n && made < (budget || 1); dj++) for (let di = -n; di <= n && made < (budget || 1); di++) {
      const ci = ci0 + di, cj = cj0 + dj, key = ci + ',' + cj;
      if (chunks.has(key)) continue;
      const cx = (ci + 0.5) * CHK, cz = (cj + 0.5) * CHK;
      if (Math.hypot(cx - px, cz - pz) > LOAD_R + CHK * 0.7) continue;
      if (Math.abs(cx) < CORE - CHK / 2 && Math.abs(cz) < CORE - CHK / 2) { chunks.set(key, null); continue; }   // fully inside the hand-made Vale
      chunks.set(key, genChunk(ci, cj, scene)); made++;
    }
    for (const [key, c] of chunks) {
      const [ci, cj] = key.split(',').map(Number), cx = (ci + 0.5) * CHK, cz = (cj + 0.5) * CHK;
      if (Math.hypot(cx - px, cz - pz) < DROP_R) continue;
      if (c) { c.meshes.forEach(m => { scene.remove(m); m.dispose(); const k = W.occluders.indexOf(m); if (k >= 0) W.occluders.splice(k, 1); }); c.cols.forEach(W.removeCollider); }
      chunks.delete(key);
    }
  };

  // ----- Greymoss Keep (tools/blender/build_castle.py). Local coords: lx east, ly north (= game -z). -----
  const CL = { u: 1.0, floorY: 3.4 };
  const toW = (lx, ly) => [L.castle.x + lx, L.castle.z - ly];
  W.castleLocal = (x, z) => [x - L.castle.x, -(z - L.castle.z)];
  function buildCastle(scene) {
    const g = GW.Assets.gltf.castle; if (!g) return;
    const base = W.heightAt(L.castle.x, L.castle.z) - 0.05;
    const cmat = {
      cobble: GW.mat({ id: ID.MASONRY, tex: 8, color: 0x88898c, fill: 0.08 }), cobbleDark: GW.mat({ id: ID.MASONRY, tex: 8, color: 0x5e5f62, fill: 0.06 }),
      moss: GW.mat({ id: ID.MOSS, tex: 5, color: 0x3e5a36 }), wood: GW.mat({ id: ID.PLANKS, tex: 2, color: 0x7a5a3e, fill: 0.06 }),
      woodDark: GW.mat({ id: ID.PLANKS, tex: 2, color: 0x5a4030, fill: 0.06 }), void: GW.mat({ id: ID.VOID, color: 0, unlit: true }),
    };
    g.scene.updateMatrixWorld(true);
    const byMat = {};
    g.scene.traverse(o => { if (o.isMesh) { const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); (byMat[o.material.name] = byMat[o.material.name] || []).push(geo); } });
    for (const mn in byMat) {
      // merge per material into one mesh (few draw calls)
      const geos = byMat[mn], merged = new THREE.BufferGeometry();
      let n = 0; geos.forEach(gg => { n += (gg.index ? gg.index.count : gg.attributes.position.count); });
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let k = 0;
      geos.forEach(gg => { const ng = gg.index ? gg.toNonIndexed() : gg; const pa = ng.attributes.position.array, na = ng.attributes.normal.array; pos.set(pa, k); nor.set(na, k); k += pa.length; });
      merged.setAttribute('position', new THREE.BufferAttribute(pos, 3)); merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      const m = new THREE.Mesh(merged, cmat[mn] || cmat.cobble); m.position.set(L.castle.x, base, L.castle.z); m.frustumCulled = false; scene.add(m);
      if (mn !== 'void') { merged.computeBoundingSphere(); m.updateMatrixWorld(); W.occluders.push(m); }
    }
    CL.base = base;
    // ---- colliders (level 0 = ground, 1 = upper floor; undefined = both) ----
    const seg = (x0, y0, x1, y1, r, lv, skip) => {
      const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(len / (r * 1.1)));
      for (let i = 0; i <= n; i++) { const t = i / n, lx = x0 + (x1 - x0) * t, ly = y0 + (y1 - y0) * t; if (skip && skip(lx, ly)) continue; const [x, z] = toW(lx, ly); W.addCollider(x, z, r, 'castle', lv); }
    };
    const R = 11;
    seg(-R, -R, R, -R, 0.7, undefined, (lx) => Math.abs(lx) < 1.6);                 // south wall, gate
    seg(-R, -R, -R, R, 0.7, undefined, (lx, ly) => ly > -6 && ly < -1.5);         // west wall, breach (climb over rubble)
    seg(-R, R, R, R, 0.7); seg(R, -R, R, R, 0.7);
    [[-R, -R], [R, -R], [-R, R], [R, R]].forEach(([lx, ly]) => { const [x, z] = toW(lx, ly); W.addCollider(x, z, 2.7, 'castle'); });
    // keep: outer face x -6..6, y 2..10
    seg(-6, 2, -1.1, 2, 0.55); seg(1.1, 2, 6, 2, 0.55); seg(-1.1, 2, 1.1, 2, 0.55, 1);   // door only open on the ground
    seg(-6, 2, -6, 10, 0.55); seg(-6, 10, 6, 10, 0.55);
    seg(6, 2, 6, 7.1, 0.55); seg(6, 7.1, 6, 9.2, 0.55, 0); seg(6, 9.2, 6, 10, 0.55); // east face: stair gap on the upper floor
    seg(8.0, 0.2, 8.0, 8.4, 0.35);                                                 // stair's outer wall
    seg(6.2, 8.6, 7.8, 8.6, 0.35, 0);                                              // the stair's back (can't walk under it)
    seg(6.0, 9.4, 8.0, 9.4, 0.35, 1); seg(8.0, 8.4, 8.0, 9.4, 0.35, 1);              // landing walls at the top
    W.addCollider(...toW(-5, -5), 1.0, 'castle');                                  // well
  }
  // ----- The Pale Chapel (tools/blender/build_chapel.py): gothic facade with the arched black doorway -----
  function mergeByMat(g, mats, fallback, x, y, z, scene) {
    g.scene.updateMatrixWorld(true);
    const byMat = {};
    g.scene.traverse(o => { if (o.isMesh) { const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); (byMat[o.material.name] = byMat[o.material.name] || []).push(geo); } });
    for (const mn in byMat) {
      const geos = byMat[mn], merged = new THREE.BufferGeometry();
      let n = 0; geos.forEach(gg => { n += (gg.index ? gg.index.count : gg.attributes.position.count); });
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let k = 0;
      geos.forEach(gg => { const ng = gg.index ? gg.toNonIndexed() : gg; const pa = ng.attributes.position.array, na = ng.attributes.normal.array; pos.set(pa, k); nor.set(na, k); k += pa.length; });
      merged.setAttribute('position', new THREE.BufferAttribute(pos, 3)); merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      const m = new THREE.Mesh(merged, mats[mn] || fallback || Object.values(mats)[0]); m.position.set(x, y, z); m.frustumCulled = false; scene.add(m);
      if (mn !== 'void') { merged.computeBoundingSphere(); m.updateMatrixWorld(); W.occluders.push(m); }
    }
  }
  function buildChapel(scene) {
    const g = GW.Assets.gltf.chapel; if (!g) return;
    const C = L.chapel, base = W.heightAt(C.x, C.z) - 0.05;
    const mats = {
      cobble: GW.mat({ id: ID.MASONRY, tex: 8, color: 0x929396, fill: 0.12 }), cobbleDark: GW.mat({ id: ID.MASONRY, tex: 8, color: 0x58595c, fill: 0.08 }),
      moss: GW.mat({ id: ID.MOSS, tex: 5, color: 0x3e5a36 }), iron: GW.mat({ id: ID.STONE, color: 0x3a3a40 }),
    };
    mergeByMat(g, mats, mats.cobble, C.x, base, C.z, scene);
    const tw = (lx, ly) => [C.x + lx, C.z - ly];
    const seg = (x0, y0, x1, y1, r) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (r * 1.1)));
      for (let i = 0; i <= n; i++) { const t = i / n; W.addCollider(...tw(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t), r, 'chapel'); } };
    seg(-6.3, 0.55, -1.6, 0.55, 0.6); seg(1.6, 0.55, 6.3, 0.55, 0.6);          // facade, door open
    [-6.35, -2.1, 2.1, 6.35].forEach(x => W.addCollider(...tw(x, -0.4), 0.55, 'chapel'));   // buttresses
    seg(-5.45, 1.2, -5.45, 12.6, 0.55); seg(5.45, 1.2, 5.45, 12.6, 0.55); seg(-5.45, 12.65, 5.45, 12.65, 0.55);
    // the torch on the east door buttress
    const [fx, fz] = tw(2.1, -1.45), fy = base + 3.55;
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.5, 5), GW.mat({ id: ID.FIRE, color: 0, emissive: 0xffa040, unlit: true }));
    f.position.set(fx, fy, fz); scene.add(f); W.flames.push({ m: f, s: 3.3, base: 1 });
    W.lights.add(fx, fy + 0.3, fz - 0.6, new THREE.Color(1.0, 0.56, 0.24), 9.5, 0.9);
  }

  // ----- The Ivy Watch (tools/blender/build_tower.py): walk in the door, come out on the roof -----
  const TW = { top: 13.1, r: 3.3 };
  W.tower = TW;
  function buildTower(scene) {
    const g = GW.Assets.gltf.tower; if (!g) return;
    const T = L.tower, base = W.heightAt(T.x, T.z) - 0.05;
    TW.base = base; TW.x = T.x; TW.z = T.z; TW.topY = base + TW.top;
    const mats = {
      cobble: GW.mat({ id: ID.MASONRY, tex: 8, color: 0x8e8f92, fill: 0.12 }), cobbleDark: GW.mat({ id: ID.MASONRY, tex: 8, color: 0x5c5d60, fill: 0.08 }),
      moss: GW.mat({ id: ID.MOSS, tex: 5, color: 0x6a9a4a, fill: 0.12 }), wood: GW.mat({ id: ID.PLANKS, tex: 2, color: 0x8a6440, fill: 0.1 }),
      woodDark: GW.mat({ id: ID.PLANKS, tex: 2, color: 0x5a4030, fill: 0.06 }), iron: GW.mat({ id: ID.STONE, color: 0x3a3a40 }),
      gold: GW.mat({ id: ID.RUNE, color: 0, emissive: 0xd8a040, unlit: true }), void: GW.mat({ id: ID.VOID, color: 0, unlit: true }),
    };
    mergeByMat(g, mats, mats.cobble, T.x, base, T.z, scene);
    W.addCollider(T.x, T.z, 3.6, 'tower', 0);                         // the tower body (ground level only)
    for (let k = 0; k < 28; k++) {                                     // the parapet on the roof, broken on the west
      const a = k / 28 * Math.PI * 2; if (a > 2.7 && a < 3.5) continue;
      W.addCollider(T.x + Math.cos(a) * 3.35, T.z - Math.sin(a) * 3.35, 0.4, 'tower', 2);
    }
    TW.door = { x: T.x, z: T.z + 4.0 };
    TW.chest = { x: T.x - 0.6, z: T.z - 1.2 };
    W.interact.push({ type: 'hatch', x: T.x + 1.6, z: T.z + 0.4, r: 1.3, label: 'Climb down', floor: 2 });
    W.interact.push({ type: 'chest', x: TW.chest.x, z: TW.chest.z, r: 1.6, label: 'Open the chest', floor: 2, id: 'tower' });
    W.lights.add(T.x, TW.topY + 2.5, T.z, new THREE.Color(0.35, 0.42, 0.6), 7, 0.4);   // moonlit roof
  }

  // walkable height for a position at a given level; returns { y, lv }
  W.levelAt = function (x, z, lv) {
    if (lv === 2) {
      if (TW.base !== undefined && Math.hypot(x - TW.x, z - TW.z) < 3.25) return { y: TW.topY, lv: 2 };
      return { y: W.groundY(x, z), lv: 0 };               // stepped through the broken parapet: drop
    }
    if (CL.base === undefined) return { y: W.groundY(x, z), lv: 0 };
    const [lx, ly] = W.castleLocal(x, z);
    const onStair = lx > 6.15 && lx < 7.85 && ly > -0.3 && ly < 8.6;
    const stairY = CL.base + CL.floorY * GW.clamp((ly - 0.2) / 7.8, 0, 1);
    const inFloor = lx > -5.1 && lx < 7.85 && ly > 2.9 && ly < 9.1;
    const inHole = lx > 1.5 && lx < 4.0 && ly > 4.0 && ly < 6.5;
    if (lv === 1) {
      if (onStair && ly < 7.2) return { y: stairY, lv: ly < 0.4 ? 0 : 1 };
      if (inFloor && !inHole) return { y: CL.base + CL.floorY, lv: 1 };
      return { y: W.groundY(x, z), lv: 0 };          // stepped off an edge or into the hole: fall
    }
    if (onStair) return { y: stairY, lv: ly > 6.8 ? 1 : 0 };
    return { y: W.groundY(x, z), lv: 0 };
  };

  // ----- night sky: gradient dome, stars, a low moon, distant mountains (follows the camera) -----
  function buildSky(scene) {
    const g = W.sky = new THREE.Group(); scene.add(g);
    const moonVis = new THREE.Vector3(-0.18, 0.86, -0.48).normalize();
    W.moonVis = moonVis;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(330, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uMoon: { value: moonVis }, uTime: GW.LU.uTime, uDay: { value: 0 }, uDusk: { value: 0 } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vDir; uniform vec3 uMoon; uniform float uTime;
        float ch(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        float cn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(ch(i), ch(i + vec2(1.0, 0.0)), f.x), mix(ch(i + vec2(0.0, 1.0)), ch(i + vec2(1.0, 1.0)), f.x), f.y); }
        uniform float uDay; uniform float uDusk;
        void main(){
          float y = vDir.y;
          vec3 hor = mix(vec3(0.07, 0.09, 0.15), vec3(0.55, 0.68, 0.82), uDay), zen = mix(vec3(0.006, 0.01, 0.025), vec3(0.18, 0.34, 0.62), uDay);
          hor = mix(hor, vec3(0.75, 0.42, 0.25), uDusk * 0.8);
          vec3 col = mix(hor, zen, smoothstep(-0.02, 0.55, y));
          float m = max(dot(vDir, uMoon), 0.0);
          col += vec3(0.45, 0.52, 0.7) * (pow(m, 90.0) * 0.5 + pow(m, 12.0) * 0.08);
          // drifting clouds, lit around the moon
          vec2 cp = vDir.xz / (abs(y) + 0.25) * 2.2 + vec2(uTime * 0.012, uTime * 0.004);
          float cl = cn(cp) * 0.6 + cn(cp * 2.3 + 4.0) * 0.3 + cn(cp * 5.1 + 9.0) * 0.1;
          float cm = smoothstep(0.52, 0.78, cl) * smoothstep(0.02, 0.25, y);
          col = mix(col, vec3(0.16, 0.17, 0.21) + vec3(0.45, 0.48, 0.55) * pow(m, 6.0), cm * 0.85);
          if (y < 0.0) col = mix(col, vec3(0.022, 0.032, 0.058), smoothstep(0.0, -0.08, y));
          gl_FragColor = vec4(col, (${ID.SKY}.0 + 0.5) / 32.0);
        }`,
    }));
    dome.frustumCulled = false; dome.renderOrder = -10; g.add(dome); W.skyDome = dome;
    // stars
    const n = 900, r = GW.rand(42);
    const stars = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), GW.mat({ id: ID.STAR, color: 0xffffff, unlit: true, noFog: true }), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2, y = 0.04 + Math.pow(r(), 0.7) * 0.96, rr = Math.sqrt(1 - y * y);
      v.set(Math.cos(a) * rr, y, Math.sin(a) * rr).multiplyScalar(300);
      const big = r(); m4.compose(v, q, sc.setScalar(big < 0.92 ? 0.7 + r() * 0.8 : 1.8 + r() * 1.2));
      stars.setMatrixAt(i, m4); stars.setColorAt(i, c.setHSL(0.58 + (r() - 0.5) * 0.15, 0.3, 0.55 + r() * 0.4));
    }
    stars.frustumCulled = false; g.add(stars); W.stars = stars;
    // the moon, low on the horizon
    const moon = new THREE.Mesh(new THREE.SphereGeometry(46, 32, 20), new THREE.ShaderMaterial({
      uniforms: { uMoon: { value: moonVis } },
      vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normal); vP = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vN; varying vec3 vP; uniform vec3 uMoon;
        float mh(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float mn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(mh(i), mh(i + vec3(1,0,0)), f.x), mix(mh(i + vec3(0,1,0)), mh(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(mh(i + vec3(0,0,1)), mh(i + vec3(1,0,1)), f.x), mix(mh(i + vec3(0,1,1)), mh(i + vec3(1,1,1)), f.x), f.y), f.z); }
        void main(){
          vec3 q = vP / 46.0;
          float maria = smoothstep(0.45, 0.7, mn(q * 2.2 + 3.0)) * 0.45;
          float craters = smoothstep(0.62, 0.8, mn(q * 7.0)) * 0.25 + smoothstep(0.7, 0.85, mn(q * 15.0 + 2.0)) * 0.15;
          float limb = 0.55 + 0.45 * pow(max(dot(normalize(vN), -uMoon), 0.0), 0.4);
          vec3 col = vec3(0.86, 0.88, 0.94) * (1.0 - maria - craters) * limb;
          gl_FragColor = vec4(col, (${ID.MOON}.0 + 0.5) / 32.0);
        }`,
    }));
    moon.position.copy(moonVis).multiplyScalar(285); g.add(moon); W.moonMesh = moon;
    // distant mountains: a jagged ring that the night haze turns into silhouettes
    const N = 160, pos = [], idx = [], rm = GW.rand(7);
    for (let i = 0; i <= N; i++) {
      const a = i / N * Math.PI * 2, R = 250 + rm() * 20;
      const h = 14 + 26 * Math.pow(Math.abs(Math.sin(a * 3.1) * Math.cos(a * 1.7 + 1)), 0.7) + rm() * 8;
      pos.push(Math.cos(a) * R, -8, Math.sin(a) * R, Math.cos(a) * R, h, Math.sin(a) * R);
      if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); mg.setIndex(idx); mg.computeVertexNormals();
    const mtn = new THREE.Mesh(mg, GW.mat({ id: ID.STONE, color: 0x1a2030, side: THREE.DoubleSide }));
    mtn.frustumCulled = false; g.add(mtn);
    g.traverse(o => o.layers.set(2));   // sky layer: seen by the camera and the water's reflection, never casts shadows
  }
  W.updateSky = function (cam) { if (W.sky) { W.sky.position.set(cam.position.x, 0, cam.position.z); W.sky.scale.setScalar(Math.max(1, cam.far / 400 * 0.95)); } };

  // ----- pieces -----
  function campfire(scene, x, z, label, own) {
    const y = W.heightAt(x, z);
    const g = new THREE.Group(); g.position.set(x, y, z); scene.add(g);
    const wood = GW.mat({ id: ID.WOOD, color: 0x4a3020 }), stone = GW.mat({ id: ID.STONE, color: 0x707480 });
    for (let k = 0; k < 4; k++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.4, 5), wood); l.rotation.z = Math.PI / 2; l.rotation.y = k * Math.PI / 4; l.position.y = 0.12; g.add(l); }
    for (let k = 0; k < 9; k++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), stone); const a = k / 9 * 6.28; s.position.set(Math.cos(a) * 0.95, 0.08, Math.sin(a) * 0.95); g.add(s); }
    const flames = [];
    const fm = GW.mat({ id: ID.FIRE, color: 0x000000, emissive: 0xff8a2a, unlit: true });
    const fm2 = GW.mat({ id: ID.FIRE, color: 0x000000, emissive: 0xffd070, unlit: true });
    for (let k = 0; k < 5; k++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.28 - k * 0.03, 1.1, 5), k % 2 ? fm2 : fm);
      f.position.set((Math.random() - 0.5) * 0.4, 0.55, (Math.random() - 0.5) * 0.4); g.add(f); flames.push({ m: f, s: Math.random() * 10, base: 0.9 + Math.random() * 0.5 });
    }
    W.flames.push(...flames);
    const light = W.lights.add(x, y + 1.6, z, new THREE.Color(1.0, 0.5, 0.18).multiplyScalar(1.6), 15, 1);
    W.addCollider(x, z, 1.0, 'fire');
    const rest = { type: 'rest', x, z, r: 2.8, label: 'Rest at ' + label, name: label, own: !!own };
    W.interact.push(rest);
    const fire = { x, z, g, light, flames, rest, out: false };
    W.fires.push(fire);
    return fire;
  }
  W.campfire = campfire;

  function torch(scene, x, z, h) {
    const y = W.heightAt(x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, h, 5), GW.mat({ id: ID.WOOD, color: 0x5a3e26 }));
    pole.position.set(x, y + h / 2, z); scene.add(pole);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 5), GW.mat({ id: ID.FIRE, color: 0, emissive: 0xffa040, unlit: true }));
    f.position.set(x, y + h + 0.25, z); scene.add(f);
    W.flames.push({ m: f, s: Math.random() * 10, base: 1 });
    W.lights.add(x, y + h + 0.4, z, new THREE.Color(1.0, 0.55, 0.22), 8.5, 0.8);
    W.addCollider(x, z, 0.25, 'torch');
  }

  function buildShrine(scene, x, z, s, glow) {
    const y = W.heightAt(x, z);
    const g = new THREE.Group(); g.position.set(x, y, z); scene.add(g);
    const st = new THREE.Mesh(new THREE.BoxGeometry(1.2 * s, 4.2 * s, 0.8 * s), GW.mat({ id: ID.STONE, color: 0x8890a4, rim: 0.25 }));
    st.position.y = 2.0 * s; st.rotation.y = Math.atan2(x, z); st.rotation.z = (Math.random() - 0.5) * 0.12; g.add(st);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.25 * s, 1.6 * s, 0.84 * s), GW.mat({ id: ID.RUNE, color: 0, emissive: glow ? 0x4fb8ff : 0x203040, unlit: true }));
    band.position.y = 2.5 * s; st.add(band); band.position.set(0, 0.5 * s, 0);
    W.addCollider(x, z, 0.9 * s, 'stone');
    const light = glow ? W.lights.add(x, y + 2.5, z, new THREE.Color(0.25, 0.6, 1.0), 10, 0.15) : null;
    return { g, band, light };
  }

  function buildVillage(scene, batch, place, rnd, boxG0, woodM) {
    const { x: vx, z: vz } = L.village;
    campfire(scene, L.fire.x, L.fire.z, 'Emberhold');
    // fence ring with gaps N and S and E/W path gaps
    const postG = new THREE.CylinderGeometry(0.09, 0.11, 1.5, 5); postG.translate(0, 0.75, 0);
    for (let k = 0; k < 64; k++) {
      const a = k / 64 * Math.PI * 2;
      const gapAng = [Math.PI / 2, -Math.PI / 2, 0, Math.PI];
      if (gapAng.some(g => Math.abs(GW.angDiff(a, g)) < 0.16)) continue;
      const x = vx + Math.cos(a) * 15.5, z = vz + Math.sin(a) * 15.5;
      batch.add('post', postG, woodM, place(x, W.heightAt(x, z), z, 0, 1.6, 0.7 + rnd() * 0.5, 1.6), 0xb89a78);
      W.addCollider(x, z, 0.35, 'fence');
    }
    // tents
    const tentG = new THREE.ConeGeometry(2.0, 2.6, 4); tentG.translate(0, 1.3, 0);
    const tents = [[-10, 37, 0x9a8460], [-2, 42, 0x8a8a70]];
    tents.forEach(([dx, dz, c]) => {
      const m = new THREE.Mesh(tentG, GW.mat({ id: ID.WOOD, color: c, rim: 0.2 })); const x = vx + dx, z = vz + dz - 30 + 30;
      m.position.set(dx, W.heightAt(dx, dz), dz); m.rotation.y = rnd() * 3; scene.add(m);
      W.addCollider(dx, dz, 1.6, 'tent');
    });
    // crates & barrels
    for (let k = 0; k < 8; k++) {
      const a = rnd() * 6.28, r = 9 + rnd() * 4, x = vx + Math.cos(a) * r, z = vz + Math.sin(a) * r;
      if (W.blocked(x, z, 0.8) || Math.abs(x) < 3) continue;
      batch.add('crate', boxG0, woodM, place(x, W.heightAt(x, z), z, rnd() * 3, 0.8, 0.8, 0.8));
      W.addCollider(x, z, 0.6, 'crate');
    }
    // torches at gates
    [[-2.4, 14.2], [2.4, 14.2], [-2.4, 45.8], [2.4, 45.8], [14.4, 27.5], [-14.4, 27.5]].forEach(([x, z]) => torch(scene, x, z, 2.2));
    // anvil + brazier
    const ax = L.anvil.x, az = L.anvil.z, ay = W.heightAt(ax, az);
    const metal = GW.mat({ id: ID.METAL, color: 0x555a66, rim: 0.4 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.5), GW.mat({ id: ID.WOOD, color: 0x3a2818 })); base.position.set(ax, ay + 0.3, az); scene.add(base);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.55), metal); top.position.set(ax, ay + 0.78, az); scene.add(top);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 6), metal); horn.rotation.z = Math.PI / 2; horn.position.set(ax - 0.85, ay + 0.8, az); scene.add(horn);
    W.addCollider(ax, az, 0.8, 'anvil');
    W.interact.push({ type: 'forge', x: ax, z: az, r: 2.6, label: 'Use the anvil' });
    // forge brazier
    const bx = ax + 2.4, bz = az - 1.2, by = W.heightAt(bx, bz);
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.6, 0.9, 8), GW.mat({ id: ID.STONE, color: 0x5a5a62 })); br.position.set(bx, by + 0.45, bz); scene.add(br);
    const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.1, 8), GW.mat({ id: ID.FIRE, color: 0, emissive: 0xff5a1a, unlit: true })); coals.position.set(bx, by + 0.92, bz); scene.add(coals);
    W.flames.push({ m: coals, s: 3, base: 1, flat: true });
    W.lights.add(bx, by + 1.6, bz, new THREE.Color(1.0, 0.38, 0.1).multiplyScalar(1.3), 9, 0.5);
    W.addCollider(bx, bz, 0.9, 'brazier');
  }

  function buildWater(scene) {
    const pts = RIVER, n = pts.length, w = RIVER_W + 1.2;
    const posA = new Float32Array(n * 2 * 3), uvA = new Float32Array(n * 2 * 2), idx = [];
    let along = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      if (i > 0) along += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      for (let s = 0; s < 2; s++) {
        const sg = s ? 1 : -1, k = i * 2 + s;
        posA[k * 3] = pts[i][0] - dz * w * sg; posA[k * 3 + 1] = WATER_Y; posA[k * 3 + 2] = pts[i][1] + dx * w * sg;
        uvA[k * 2] = s; uvA[k * 2 + 1] = along;
      }
      if (i < n - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(posA, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvA, 2)); g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uMoonVis: { value: new THREE.Vector3(-0.18, 0.86, -0.48).normalize() }, uMoonSpot: { value: new THREE.Vector2(0, 999) } }, GW.LU),
      side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `varying vec2 vUv; varying vec3 vW; ${GW.LIGHT_GLSL}
        float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        uniform vec3 uMoonVis; uniform vec2 uMoonSpot; uniform sampler2D uRefl; uniform mat4 uReflMat; uniform float uReflOn;
        void main(){
          float e = min(vUv.x, 1.0 - vUv.x);
          // current: long streaks running downstream, faster in the middle of the channel
          float mid = 1.0 - abs(vUv.x - 0.5) * 2.0;
          float flow = 0.0;   // still water: easier to read the reflection
          float streak = smoothstep(0.55, 0.9, n2(vec2(vUv.y * 0.22 - flow * 0.55, vUv.x * 11.0)) * n2(vec2(vUv.y * 0.9 - flow * 1.1, vUv.x * 4.0 + 7.0)) * 1.9);
          float foam = smoothstep(0.22, 0.06, e) * (0.55 + 0.45 * n2(vec2(vUv.y * 1.1 - flow * 1.4, vUv.x * 14.0)));
          // ripple normal
          vec2 rp = vec2(vUv.y * 2.2 - flow * 1.6, vUv.x * 12.0);
          vec3 wn = normalize(vec3((n2(rp) - 0.5) * 0.12 + (n2(rp * 2.3 + 5.1) - 0.5) * 0.06, 1.0, (n2(rp + 13.7) - 0.5) * 0.12));
          vec3 L = lightAt(vW, vec3(0.0, 1.0, 0.0));
          vec3 V = normalize(uCam - vW);
          // reflection: sky colour by Fresnel, the moon and nearby fires as shimmering streaks
          float fres = 0.04 + 0.96 * pow(1.0 - max(dot(wn, V), 0.0), 5.0);
          vec3 R = reflect(-V, wn);
          vec3 skyR = mix(vec3(0.07, 0.09, 0.15), vec3(0.01, 0.015, 0.035), smoothstep(0.0, 0.6, R.y));
          float mr = max(dot(R, uMoonVis), 0.0);
          vec3 moonR = vec3(0.85, 0.9, 1.0) * (pow(mr, 160.0) * 2.5 + pow(mr, 18.0) * 0.18);
          vec3 body = vec3(0.004, 0.01, 0.025) + L * vec3(0.01, 0.02, 0.04);
          vec3 col;
          if (uReflOn > 0.5) {
            // dark mirror: the mirrored scene, wobbling with the ripples
            vec4 rq = uReflMat * vec4(vW + vec3(wn.x, 0.0, wn.z) * 0.6, 1.0);
            vec3 refl = texture2D(uRefl, rq.xy / rq.w).rgb;
            col = body + refl * (0.5 + 0.2 * fres);
          } else col = mix(body, skyR * 1.2, fres) + moonR * gShadow;
          col += specAt(vW, wn, V, 60.0) * 1.1;
          col += vec3(0.42, 0.56, 0.8) * (streak * 0.08 + foam * 0.25) * (0.35 + L * 1.2);
          col = applyFog(col, vW);
          gl_FragColor = vec4(col, (${ID.WATER}.0 + 0.5) / 32.0);
        }`,
    });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.layers.set(1); scene.add(mesh);
    return m;
  }

  function buildGrass(scene, tMap, count) {
    const S = 50;
    const r = GW.rand(99);
    const aOff = new Float32Array(count * 5 * 3), aV = new Float32Array(count * 5 * 2), pos = new Float32Array(count * 5 * 3), idx = [];
    const shape = [[-1, 0], [1, 0], [-0.6, 0.5], [0.6, 0.5], [0, 1]];
    for (let b = 0; b < count; b++) {
      const ox = r() * S, oz = r() * S, sd = r();
      for (let v = 0; v < 5; v++) { const k = b * 5 + v; aOff[k * 3] = ox; aOff[k * 3 + 1] = oz; aOff[k * 3 + 2] = sd; aV[k * 2] = shape[v][0]; aV[k * 2 + 1] = shape[v][1]; }
      const o = b * 5; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2, o + 2, o + 3, o + 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aOff', new THREE.BufferAttribute(aOff, 3));
    g.setAttribute('aV', new THREE.BufferAttribute(aV, 2));
    g.setIndex(idx);
    const push = Array.from({ length: 6 }, () => new THREE.Vector3(0, 0, 0));
    const m = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uCenter: { value: new THREE.Vector2() }, uSize: { value: S }, tMap: { value: tMap }, uWorld: { value: SIZE }, uPush: { value: push }, uScale: { value: 1.0 }, uWidth: { value: 1.0 }, uPx: { value: new THREE.Vector2(0.002, 0.003) }, uLineW: { value: 1.0 }, uLen: { value: 20 }, uTurf: { value: 0 }, uShift: { value: new THREE.Vector2(0, 0) }, uFlowers: { value: 0.5 }, uFlowerK: { value: 1 } }, GW.LU),
      side: THREE.DoubleSide,
      vertexShader: `attribute vec3 aOff; attribute vec2 aV;
        uniform vec2 uCenter; uniform float uSize; uniform sampler2D tMap; uniform float uWorld; uniform vec3 uPush[6]; uniform float uScale; uniform float uTime; uniform float uWidth; uniform vec2 uPx; uniform float uLineW; uniform float uLen; uniform float uTurf; uniform vec2 uShift; uniform float uFlowers; uniform float uGroundO; uniform float uSwirl; uniform float uFlowerK; uniform sampler2D uBiomeMap;
        varying vec3 vW; varying vec3 vCol; varying float vT; varying float vSpeck; varying float vAc; varying vec2 vGl;
        float gh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(gh(i), gh(i + vec2(1.0, 0.0)), f.x), mix(gh(i + vec2(0.0, 1.0)), gh(i + vec2(1.0, 1.0)), f.x), f.y); }
        void main(){
          vec2 base = uCenter - uSize * 0.5;
          vec2 wp = base + mod((aOff.xy + uShift) * (uSize / 50.0) - base, uSize);
          vec4 m = texture2D(tMap, wp / uWorld + 0.5);
          float sd = fract(aOff.z + uShift.x * 0.0137);
          float ed = max(abs(wp.x - uCenter.x), abs(wp.y - uCenter.y)) / uSize;
          float edgeF = 1.0 - smoothstep(0.34, 0.5, ed);
          float vis = step(fract(sd * 7.31), min(1.0, m.g * 1.35));
          float fA = vn(wp * 0.035), fB = vn(wp * 0.11 + 7.0);
          // mostly short turf; tall grass only in scattered patches
          float tall = smoothstep(0.66, 0.82, vn(wp * 0.04 + 11.3)) * smoothstep(0.3, 0.6, vn(wp * 0.13 + 2.7));
          float h = (0.42 + 0.3 * fract(sd * 3.7)) * mix(1.0, 2.2, tall) * uScale * vis * edgeF * (0.8 + 0.4 * fB);
          if (fract(sd * 97.13) < 0.03) h = 0.1 * vis * edgeF;
          // ---- reference-style straws: flatK-coloured straight dashes of constant on-screen size ----
          vec3 root = vec3(wp.x, m.r, wp.y);
          // clumps: low-frequency density field leaves organic dark gaps (about a third of the ground covered)
          float clump = vn(wp * 1.1 + 3.7) * 0.55 + vn(wp * 2.9 + 9.1) * 0.45;
          float keep = uTurf > 0.5 ? edgeF * step(fract(sd * 7.31), min(0.75, m.g * 4.0 + 0.5)) * step(4.4, m.b) : step(0.12, clump) * vis * edgeF;
          keep *= step(-0.3, m.g);   // burnt ground: no grass
          // dark earth patches (matching the ground shader's o 0 8 letters): only a few straws survive there
          float thr = 1.0 - 0.32 * uGroundO, pv = vn(wp * 0.11 + 5.0) * 0.7 + vn(wp * 0.37 + 1.7) * 0.3;
          float patchK = smoothstep(thr - 0.05, thr + 0.03, pv) * step(0.01, uGroundO);
          if (uTurf < 1.5) keep *= step(patchK * 0.88, fract(sd * 13.77));
          // lean is shared by neighbours (/ and \ groups), plus a little per-straw jitter and wind
          float lean = (vn(wp * 0.7 + 1.3) - 0.5) * 0.55 + (fract(sd * 5.3) - 0.5) * 0.6
                     + sin(uTime * 1.3 + wp.x * 0.3 + wp.y * 0.2) * 0.06;
          float lenPx = uLen * (0.6 + 0.8 * fract(sd * 3.7)) * (uTurf > 0.5 ? 1.0 : mix(1.0, 1.5, tall)) * keep;
          // the player and enemies flatten what they walk through
          float flatK = 0.0; vec2 pushW = vec2(0.0);
          for (int i = 0; i < 6; i++) {
            vec2 d = wp - uPush[i].xy; float dd = length(d);
            float f = clamp(1.0 - dd / max(uPush[i].z, 0.001), 0.0, 1.0);
            flatK = max(flatK, f); pushW += d / max(dd, 0.05) * f;
          }
          mat4 VP = projectionMatrix * viewMatrix;
          vec4 cr = VP * vec4(root, 1.0);
          vec4 cu = VP * vec4(root + vec3(0.0, 0.5, 0.0), 1.0);
          vec4 cpw = VP * vec4(root + vec3(pushW.x, 0.0, pushW.y), 1.0);
          // lying flat: angle from the screen's horizontal, mostly within about ±45 degrees
          float ang2 = 1.5708 + (vn(wp * 0.7 + 1.3) - 0.5) * 1.3 + (fract(sd * 5.3) - 0.5) * 1.9 + sin(uTime * 1.1 + wp.x * 0.3 + wp.y * 0.2) * 0.04;
          // swirl: a large combed flow field, like brushed hair (reference look)
          float flow = 1.5708 + (vn(wp * 0.055 + 2.1) - 0.5) * 6.5 + (vn(wp * 0.21 + 8.3) - 0.5) * 1.8 + (fract(sd * 5.3) - 0.5) * 0.7;
          ang2 = mix(ang2, flow, uSwirl);
          vec2 dir = vec2(cos(ang2), sin(ang2));
          // footsteps: straws splay outward from the walker
          vec2 pd = (cpw.xy / cpw.w - cr.xy / cr.w) / uPx;
          if (flatK > 0.01 && length(pd) > 0.001) dir = normalize(mix(dir, normalize(pd), flatK * 0.85));
          vec2 nrm = vec2(-dir.y, dir.x);
          float t = aV.y;
          bool speck = uTurf > 1.5 && vis * edgeF > 0.5 && fract(sd * 97.13) < uFlowers * uFlowerK * (0.045 + 0.17 * smoothstep(0.5, 0.85, vn(wp * 0.18 + 21.0)));
          float L2 = speck ? uLineW * 11.5 : lenPx;
          float wpx = speck ? uLineW * 3.9 : uLineW;
          if (speck) dir = vec2(0.0, 1.0);
          vec4 cp = cr;
          float sx = aV.x, st = t;
          if (speck) { st = min(t * 2.0, 1.0); sx = t > 0.75 ? 0.0 : aV.x / (t > 0.25 ? 0.6 : 1.0); }   // blade -> rectangle
          cp.xy += (dir * (speck ? st - 0.5 : t) * L2 + nrm * sx * wpx * (speck ? 1.0 : (1.0 - 0.25 * t))) * uPx * cr.w;
          vW = root; vT = speck ? min(t * 2.0, 1.0) : t; vAc = speck ? -(t > 0.75 ? 0.0 : aV.x / (t > 0.25 ? 0.6 : 1.0)) : aV.x;
          float tone = fract(sd * 17.0);
          vec3 sea = mix(vec3(0.1, 0.31, 0.25), vec3(0.17, 0.43, 0.35), tone);
          sea = mix(sea, vec3(0.2, 0.42, 0.24), smoothstep(0.6, 0.9, fA) * 0.35);   // a few warmer patches
          vec4 bmg = texture2D(uBiomeMap, wp / uWorld + 0.5);
          sea = mix(sea, mix(vec3(0.3, 0.27, 0.2), vec3(0.4, 0.33, 0.22), tone), bmg.r);    // ash: dry, straw-coloured
          sea = mix(sea, mix(vec3(0.5, 0.58, 0.66), vec3(0.66, 0.72, 0.8), tone), bmg.g);   // frost: frozen, pale
          vCol = sea * (0.85 + 0.15 * t) * (1.0 - 0.3 * flatK) * (uTurf > 0.5 ? 0.55 : 1.0);
          if (uPush[0].z > 0.0) vCol *= 1.0 - 0.38 * (1.0 - smoothstep(0.7, 2.6, length(wp - uPush[0].xy)));   // soft halo so the hero reads
          vSpeck = 0.0; vGl = vec2(4.0, 9.0);
          if (speck) {
            vSpeck = 1.0;
            float kind = fract(sd * 31.7);
            vGl = kind < 0.45 ? vec2(4.0, 9.0) : kind < 0.65 ? vec2(12.0, 9.0) : kind < 0.85 ? vec2(6.0, 9.0) : vec2(5.0, 15.0);   // o O * +
            vCol = mix(vec3(0.88, 0.92, 0.9), vec3(0.95, 0.92, 0.7), step(0.85, fract(sd * 51.0))) * (0.85 + 0.15 * fract(sd * 13.0));
          }
          if (uTurf > 1.5 && !speck) cp = vec4(9.0, 9.0, 9.0, 1.0);   // flower pass: only flowers
          if (cr.w < 1.0 || cr.z > cr.w) cp = vec4(9.0, 9.0, 9.0, 1.0);   // behind the camera or past the far plane: drop
          gl_Position = cp;
        }`,
      fragmentShader: `varying vec3 vW; varying vec3 vCol; varying float vT; varying float vSpeck; varying float vAc; varying vec2 vGl; uniform sampler2D uAtlas; ${GW.LIGHT_GLSL}
        void main(){
          if (vSpeck > 0.5) {
            // a real 'o' glyph from the font atlas (row 9, column 4)
            float gm = texture2D(uAtlas, vec2((vGl.x + vAc * 0.5 + 0.5) / 16.0, (32.0 - vGl.y + vT) / 33.0)).r;
            if (gm < 0.35) discard;
          }
          vec3 L = lightAt(vW, normalize(vec3(0.2, 1.0, 0.3)));
          vec3 warm = max(L - uAmb - uMoonCol, vec3(0.0));
          vec3 col = vSpeck > 0.5 ? vCol * (0.85 + 0.15 * gShadow) : vCol * (0.6 + 0.4 * gShadow) + vCol * warm * 1.2;
          col = applyFog(col, vW);
          gl_FragColor = vec4(col, (vSpeck > 0.5 ? 26.5 : ${ID.GRASS}.0 + 0.5) / 32.0);
        }`,
    });
    m.depthTest = false; m.depthWrite = false;
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.layers.set(1); mesh.renderOrder = -5; scene.add(mesh);
    // turf: a second pass of short, dim straws that carpets all the ground under the main grass.
    // It shares every uniform with the main grass (same camera, wind, footsteps), except uTurf.
    const tu = Object.assign({}, m.uniforms, { uTurf: { value: 1 } });
    const tm = new THREE.ShaderMaterial({ uniforms: tu, vertexShader: m.vertexShader, fragmentShader: m.fragmentShader, side: m.side, depthTest: false, depthWrite: false });
    const turf = new THREE.Mesh(g, tm); turf.frustumCulled = false; turf.layers.set(1); turf.renderOrder = -5.5; scene.add(turf);
    // a second carpet at shifted positions doubles the coverage
    const tu2 = Object.assign({}, m.uniforms, { uTurf: { value: 1 }, uShift: { value: new THREE.Vector2(17.31, 29.77) } });
    const tm2 = new THREE.ShaderMaterial({ uniforms: tu2, vertexShader: m.vertexShader, fragmentShader: m.fragmentShader, side: m.side, depthTest: false, depthWrite: false });
    const turf2 = new THREE.Mesh(g, tm2); turf2.frustumCulled = false; turf2.layers.set(1); turf2.renderOrder = -5.6; scene.add(turf2);
    // dandelions in their own pass, drawn after all grass so straws never cover them
    // (only a fifth of the blades run this pass, each 5x as likely to be a flower: same look, far less vertex work)
    const fu = Object.assign({}, m.uniforms, { uTurf: { value: 2 }, uFlowerK: { value: 5 } });
    const fm = new THREE.ShaderMaterial({ uniforms: fu, vertexShader: m.vertexShader, fragmentShader: m.fragmentShader, side: m.side, depthTest: false, depthWrite: false });
    const gf = new THREE.BufferGeometry(); for (const k in g.attributes) gf.setAttribute(k, g.attributes[k]); gf.setIndex(g.index);
    gf.setDrawRange(0, Math.floor(count / 5) * 9);
    const flowers = new THREE.Mesh(gf, fm); flowers.frustumCulled = false; flowers.layers.set(1); flowers.renderOrder = -4.9; scene.add(flowers);
    return { mesh, mat: m, push, turf };
  }

  function buildFireflies(scene) {
    const n = 140;
    const im = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.06, 0), GW.mat({ id: ID.FIRE, color: 0, emissive: 0xd8ff8a, unlit: true }), n);
    im.frustumCulled = false; im.layers.set(1); scene.add(im);
    const r = GW.rand(5);
    const flies = [];
    const homes = [L.grove, L.meadow, L.village, L.bridge, L.ruins, L.start];
    for (let i = 0; i < n; i++) {
      const h = homes[i % homes.length], a = r() * 6.28, d = r() * 22;
      flies.push({ x: h.x + Math.cos(a) * d, z: h.z + Math.sin(a) * d, y: 0.6 + r() * 1.8, s: r() * 100 });
    }
    W.fireflies = { im, flies };
  }

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
  W.update = function (dt, t, px, pz) {
    for (const f of W.flames) {
      const k = 0.8 + 0.3 * Math.sin(t * 11 + f.s) + 0.15 * Math.sin(t * 23 + f.s * 2);
      if (f.flatK) f.m.material.uniforms.uEmissive.value.setRGB(1.0 * k, 0.35 * k, 0.1 * k);
      else { f.m.scale.set(1, f.base * k, 1); f.m.rotation.y = t * 2 + f.s; }
    }
    const ff = W.fireflies;
    if (ff) {
      ff.flies.forEach((f, i) => {
        const x = f.x + Math.sin(t * 0.3 + f.s) * 2.5, z = f.z + Math.cos(t * 0.23 + f.s * 1.3) * 2.5;
        const y = W.heightAt(x, z) + f.y + Math.sin(t * 1.1 + f.s) * 0.4;
        const blink = Math.max(0, Math.sin(t * 1.7 + f.s * 7)) * 1.4;
        _m.compose(_v.set(x, y, z), _q, _s.setScalar(blink));
        ff.im.setMatrixAt(i, _m);
      });
      ff.im.instanceMatrix.needsUpdate = true;
    }
    W.grass.mat.uniforms.uCenter.value.set(px, pz);
    if (Math.abs(px - W._tc[0]) > 96 || Math.abs(pz - W._tc[1]) > 96) W.terrainRefresh(false, px, pz);
    W.stream(px, pz, W.scene, W._streamBudget || 1); W._streamBudget = 1;
  };

  // ---------- minimap ----------
  W.mapCanvas = function () {
    const S = 2048, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    g.font = '6px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const step = 4;
    for (let y = 0; y < S; y += step) for (let x = 0; x < S; x += step) {
      const wx = x / S * SIZE - HALF, wz = y / S * SIZE - HALF;
      const rd = W.riverAt(wx, wz), pd = W.pathAt(wx, wz), ba = sample(BA, wx, wz), bf = sample(BF, wx, wz), h = W.heightAt(wx, wz);
      const edge = Math.max(Math.abs(wx), Math.abs(wz)) > 1140;
      let ch = '.', col = bf > 0.5 ? '#6a7a8a' : ba > 0.5 ? '#4a3a30' : '#1d3a22';
      if (rd < RIVER_W) { ch = '~'; col = '#4a7ad0'; }
      else if (Math.hypot(wx - L.frostLake.x, wz - L.frostLake.z) < 72) { ch = '~'; col = '#9ab4d0'; }
      else if (pd < 1.8) { ch = ':'; col = '#8a6a44'; }
      else if (edge || h > 9) { ch = '^'; col = bf > 0.5 ? '#8a98a8' : '#3a4a3e'; }
      else if (Math.abs(wx) < CORE && Math.abs(wz) < CORE && W.blocked(wx, wz, 0.2)) { ch = '#'; col = '#3e5a4a'; }
      else if (((x * 7 + y * 13) % 5) !== 0) continue;
      g.fillStyle = col; g.fillText(ch, x + 2, y + 2);
    }
    return c;
  };
})();

// Glyphwake: the Vale. Terrain bake, grass, river, props, colliders, zones.
(function () {
  'use strict';
  const GW = window.GW, ID = GW.ID;
  const SIZE = 260, N = 256, HALF = SIZE / 2;

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
  };
  const RIVER_CP = [[-140, -2], [-95, -14], [-55, -3], [-22, -6], [-4, -13], [20, -26], [55, -20], [90, -30], [140, -44]];
  const PATHS = [
    [[0, 76], [1, 60], [-1, 46], [0, 38]],
    [[0, 18], [-3, 4], [-4, -13], [2, -30], [8, -45], [12, -58], [8, -80], [3, -96], [2, -104]],
    [[-12, 31], [-30, 34], [-48, 30], [-60, 38], [-70, 42]],
    [[12, 31], [32, 27], [52, 33], [70, 36]],
  ];
  const ZONES = [
    { name: 'THE WAKING STONE', sub: 'the vale of ninefold', x: 0, z: 78, r: 14 },
    { name: 'EMBERHOLD', sub: 'last fire of the vale', x: 0, z: 30, r: 17 },
    { name: 'THE GLASS RIVER', sub: 'crossing', x: -4, z: -13, r: 9 },
    { name: 'THORNWOLF MEADOW', sub: 'hunting grounds', x: 12, z: -58, r: 30 },
    { name: 'HOLLOW RUINS', sub: 'the old scriptorium', x: -72, z: 42, r: 26 },
    { name: 'WISPWOOD', sub: 'where the lanterns drift', x: 76, z: 36, r: 26 },
    { name: 'THE WARDEN CIRCLE', sub: 'stone remembers', x: 2, z: -108, r: 22 },
  ];

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

  function rawHeight(x, z) {
    let h = 0.5 * Math.sin(x * 0.05) * Math.cos(z * 0.045) + 0.35 * Math.sin(x * 0.13 + 1.3) * Math.sin(z * 0.11 + 0.7)
      + 0.12 * Math.sin(x * 0.4 + z * 0.3);
    const r = Math.hypot(x, z);
    h += ss(98, 128, r) * 5;
    const flat = (cx, cz, r0, r1, to) => { const d = Math.hypot(x - cx, z - cz); h = GW.lerp(to, h, ss(r0, r1, d)); };
    flat(L.village.x, L.village.z, 12, 20, 0.15);
    flat(L.arena.x, L.arena.z, 16, 24, 0.0);
    flat(L.start.x, L.start.z, 6, 12, 0.3);
    return h;
  }

  // ---------- bake ----------
  const H = new Float32Array(N * N), G = new Float32Array(N * N), R = new Float32Array(N * N), P = new Float32Array(N * N);
  function bake() {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / N * SIZE - HALF, z = (j + 0.5) / N * SIZE - HALF;
      const rd = polyDist(RIVER, x, z).d;
      let pd = 1e9; for (const p of PATHP) pd = Math.min(pd, polyDist(p, x, z).d);
      let h = rawHeight(x, z);
      const carve = GW.clamp(1 - rd / (RIVER_W + 1.6), 0, 1);
      h -= 1.9 * Math.pow(carve, 0.8);
      if (pd < 2.2) h -= 0.06 * (1 - pd / 2.2);
      let g = 0.95;
      g *= ss(RIVER_W - 0.3, RIVER_W + 1.2, rd);
      g *= GW.lerp(0.32, 1, ss(0.6, 2.4, pd));
      const vd = Math.hypot(x - L.village.x, z - L.village.z);
      g *= GW.lerp(0.25, 1, ss(6, 14, vd));
      const ad = Math.hypot(x - L.arena.x, z - L.arena.z);
      g *= GW.lerp(0.35, 1, ss(10, 18, ad));
      g *= 0.88 + 0.12 * Math.sin(x * 0.21) * Math.sin(z * 0.17);
      const k = j * N + i;
      H[k] = h; G[k] = GW.clamp(g, 0, 1); R[k] = rd; P[k] = pd;
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
  Batch.prototype.build = function (scene) {
    Object.values(this.groups).forEach(g => {
      const im = new THREE.InstancedMesh(g.geom, g.mat, g.items.length);
      g.items.forEach((it, i) => { im.setMatrixAt(i, it.m); im.setColorAt(i, it.c); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false; scene.add(im);
    });
  };

  // ---------- world object ----------
  const W = GW.World = {
    SIZE, L, ZONES, WATER_Y,
    colliders: [], grid: new Map(), interact: [], spawns: [], flames: [], lights: null, fireflies: null,
  };
  W.heightAt = (x, z) => sample(H, x, z);
  W.riverAt = (x, z) => sample(R, x, z);
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

  const CELL = 8;
  W.addCollider = function (x, z, r, tag) {
    const c = { x, z, r, tag };
    W.colliders.push(c);
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = i * 1000 + j; let a = W.grid.get(k); if (!a) W.grid.set(k, a = []); a.push(c);
    }
    return c;
  };
  // push a circle out of colliders; returns true if touched
  W.collide = function (p, r) {
    let hit = false;
    const i = Math.floor(p.x / CELL), j = Math.floor(p.z / CELL);
    for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) {
      const arr = W.grid.get(a * 1000 + b); if (!arr) continue;
      for (const c of arr) {
        const dx = p.x - c.x, dz = p.z - c.z, rr = r + c.r, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), k = (rr - d) / d; p.x += dx * k; p.z += dz * k; hit = true; }
      }
    }
    const d = Math.hypot(p.x, p.z), lim = 112;
    if (d > lim) { p.x *= lim / d; p.z *= lim / d; hit = true; }
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
    bake();
    W.lights = new GW.Lights();
    const rnd = GW.rand(1337);
    const batch = new Batch();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const place = (x, y, z, ry, sx, sy, sz) => { q.setFromAxisAngle(up, ry); m4.compose(v3.set(x, y, z), q, s3.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz)); return m4; };

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
    W.tMap = tMap;

    // ---- terrain ----
    const SEG = 180;
    const tg = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); tg.rotateX(-Math.PI / 2);
    const pos = tg.attributes.position, cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, W.heightAt(x, z));
      const rd = W.riverAt(x, z), pd = W.pathAt(x, z), g = sample(G, x, z);
      let c = [0.07, 0.12, 0.065];
      const n = 0.8 + 0.4 * Math.sin(x * 0.7) * Math.sin(z * 0.9);
      c = c.map(v => v * n);
      const dirt = [0.2, 0.16, 0.11];
      const pf = 1 - ss(0.8, 2.6, pd);
      c = c.map((v, k) => GW.lerp(v, dirt[k], Math.max(pf, (1 - g) * 0.6)));
      const bed = [0.06, 0.08, 0.11];
      const bf = 1 - ss(RIVER_W - 0.5, RIVER_W + 0.8, rd);
      c = c.map((v, k) => GW.lerp(v, bed[k], bf));
      cols[i * 3] = c[0]; cols[i * 3 + 1] = c[1]; cols[i * 3 + 2] = c[2];
    }
    tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    tg.computeVertexNormals();
    const terrain = new THREE.Mesh(tg, GW.mat({ id: ID.GROUND, vertexColors: true, color: 0xffffff, farGrass: 30 }));
    W.terrainMat = terrain.material;
    terrain.frustumCulled = false; terrain.layers.set(1); scene.add(terrain);

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
    const stoneM = GW.mat({ id: ID.STONE, color: 0x8a90a0, rim: 0.2 });
    const ruinM = GW.mat({ id: ID.RUIN, color: 0x7c88a8, rim: 0.3 });
    const woodM = GW.mat({ id: ID.WOOD, color: 0x5a3e26 });
    const leafM = GW.mat({ id: ID.LEAF, color: 0x2a5a48, rim: 0.15 });
    const deadM = GW.mat({ id: ID.BONE, color: 0x8a8478 });
    const mossM = GW.mat({ id: ID.MOSS, color: 0x6a7aa8 });
    const flowerM = GW.mat({ id: ID.FLOWER, color: 0xffffff, emissive: 0x2a2a30 });
    const trunkG = new THREE.CylinderGeometry(0.16, 0.3, 2.4, 6); trunkG.translate(0, 1.2, 0);
    const coneG = new THREE.ConeGeometry(1.5, 2.4, 7); coneG.translate(0, 1.2, 0);
    const pillarG = new THREE.CylinderGeometry(0.55, 0.65, 1, 8); pillarG.translate(0, 0.5, 0);
    const boxG = new THREE.BoxGeometry(1, 1, 1); const boxG0 = boxG.clone(); boxG0.translate(0, 0.5, 0);
    const discG = new THREE.SphereGeometry(1, 8, 4);
    const flowerG = new THREE.OctahedronGeometry(0.11, 0);

    const rock = (x, z, s, flat) => {
      const y = W.heightAt(x, z);
      batch.add('rock' + (Math.floor(rnd() * 3)), rockGeos[Math.floor(rnd() * 3)], stoneM, place(x, y + s * 0.15, z, rnd() * 6.28, s, s * (flat || (0.55 + rnd() * 0.35)), s * (0.8 + rnd() * 0.4)), new THREE.Color().setHSL(0.62, 0.08, 0.45 + rnd() * 0.2));
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
      for (const k of ['village', 'start', 'arena']) if (Math.hypot(x - L[k].x, z - L[k].z) < (k === 'arena' ? 21 : 18) + r) return false;
      return !W.blocked(x, z, r + 0.6);
    };

    // forest ring
    for (let k = 0; k < 520; k++) {
      const a = rnd() * Math.PI * 2, r = 96 + rnd() * 30;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (free(x, z, 1)) tree(x, z, 1.1 + rnd() * 0.9, true);
    }
    // scattered trees
    for (let k = 0; k < 140; k++) {
      const x = (rnd() - 0.5) * 190, z = (rnd() - 0.5) * 190;
      if (Math.hypot(x - L.meadow.x, z - L.meadow.z) < 26) continue;
      if (Math.hypot(x - L.ruins.x, z - L.ruins.z) < 20) continue;
      if (free(x, z, 1)) tree(x, z, 0.9 + rnd() * 0.7, false);
    }
    // wispwood: dead trees + some pines
    for (let k = 0; k < 70; k++) {
      const a = rnd() * 6.28, r = 6 + rnd() * 24, x = L.grove.x + Math.cos(a) * r, z = L.grove.z + Math.sin(a) * r;
      if (free(x, z, 0.8)) (rnd() < 0.65 ? deadTree : tree)(x, z, 1 + rnd() * 0.6, true);
    }
    // rocks
    for (let k = 0; k < 160; k++) {
      const x = (rnd() - 0.5) * 210, z = (rnd() - 0.5) * 210;
      if (free(x, z, 1.5)) rock(x, z, 0.5 + rnd() * rnd() * 2.2);
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
      if (Math.hypot(x, z) < 105 && W.riverAt(x, z) > RIVER_W + 0.5) { if (rnd() < 0.55) moss(x, z, 0.8 + rnd() * 1.6); else flower(x, z); }
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

    natureScatter(batch, place, rnd, free);
    batch.build(scene);
    buildFireflies(scene);
    buildSky(scene);
    W.zonesDone = {};
  };

  // ----- CC0 nature models (Kenney Nature Kit via the asset pack), instanced per material -----
  const NAT_MAT = {
    leafsDark: { id: ID.LEAF, color: 0x24503e, rim: 0.15 }, leafsGreen: { id: ID.LEAF, color: 0x355f34, rim: 0.15 },
    leafsFall: { id: ID.LEAF, color: 0xc06a28, rim: 0.2 }, grass: { id: ID.LEAF, color: 0x2c5a2e, rim: 0.1 },
    woodBark: { id: ID.WOOD, color: 0x5a3e26 }, woodBarkDark: { id: ID.WOOD, color: 0x3c2a1c }, woodBirch: { id: ID.WOOD, color: 0xd6d0c2, rim: 0.2 },
    woodInner: { id: ID.WOOD, color: 0xb88e5c }, dirt: { id: ID.STONE, color: 0x7a7e88, rim: 0.2 }, stone: { id: ID.STONE, color: 0x8a8e98, rim: 0.2 },
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
      if (free(x, z, 1)) put(rnd() < 0.55 ? 'tree_pine_tall' : 'tree_dark', x, z, s, { col: 0.12 * s });
    }
    // broadleaf trees: oaks in the open, birches with autumn leaves around the village and the ruins
    for (let k = 0; k < 120; k++) {
      const x = (rnd() - 0.5) * 190, z = (rnd() - 0.5) * 190, s = 3 + rnd() * 2;
      if (Math.hypot(x - L.meadow.x, z - L.meadow.z) < 24) continue;
      const nearVillage = Math.hypot(x - L.village.x, z - L.village.z) < 45 || Math.hypot(x - L.ruins.x, z - L.ruins.z) < 40;
      if (free(x, z, 1.2)) put(nearVillage && rnd() < 0.7 ? 'tree_autumn' : rnd() < 0.6 ? 'tree_oak' : 'tree_fat', x, z, s, { col: 0.12 * s });
    }
    // Wispwood: dark trees and faintly glowing mushrooms
    for (let k = 0; k < 40; k++) {
      const a = rnd() * 6.28, r = 5 + rnd() * 26, x = L.grove.x + Math.cos(a) * r, z = L.grove.z + Math.sin(a) * r;
      if (free(x, z, 1)) put('tree_dark', x, z, 3.4 + rnd() * 2, { col: 0.45 });
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
      else if (r < 0.8) put('rock_tall', x, z, 2.2 + rnd() * 2.5, { col: 1.1, tag: 'rock' });
      else put('rock_large', x, z, 3 + rnd() * 3, { col: 1.4, tag: 'rock' });
    }
    for (let k = 0; k < 260; k++) {
      const x = (rnd() - 0.5) * 210, z = (rnd() - 0.5) * 210;
      if (Math.hypot(x, z) < 108 && free(x, z, 0.4)) put('bush_large', x, z, 3 + rnd() * 3);
    }
  }

  // ----- night sky: gradient dome, stars, a low moon, distant mountains (follows the camera) -----
  function buildSky(scene) {
    const g = W.sky = new THREE.Group(); scene.add(g);
    const moonVis = new THREE.Vector3(-0.18, 0.86, -0.48).normalize();
    W.moonVis = moonVis;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(330, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uMoon: { value: moonVis }, uTime: GW.LU.uTime },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vDir; uniform vec3 uMoon; uniform float uTime;
        float ch(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        float cn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(ch(i), ch(i + vec2(1.0, 0.0)), f.x), mix(ch(i + vec2(0.0, 1.0)), ch(i + vec2(1.0, 1.0)), f.x), f.y); }
        void main(){
          float y = vDir.y;
          vec3 hor = vec3(0.07, 0.09, 0.15), zen = vec3(0.006, 0.01, 0.025);
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
    dome.frustumCulled = false; dome.renderOrder = -10; g.add(dome);
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
    stars.frustumCulled = false; g.add(stars);
    // the moon, low on the horizon
    const moon = new THREE.Mesh(new THREE.SphereGeometry(34, 32, 20), new THREE.ShaderMaterial({
      uniforms: { uMoon: { value: moonVis } },
      vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normal); vP = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vN; varying vec3 vP; uniform vec3 uMoon;
        float mh(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float mn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(mh(i), mh(i + vec3(1,0,0)), f.x), mix(mh(i + vec3(0,1,0)), mh(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(mh(i + vec3(0,0,1)), mh(i + vec3(1,0,1)), f.x), mix(mh(i + vec3(0,1,1)), mh(i + vec3(1,1,1)), f.x), f.y), f.z); }
        void main(){
          vec3 q = vP / 34.0;
          float maria = smoothstep(0.45, 0.7, mn(q * 2.2 + 3.0)) * 0.45;
          float craters = smoothstep(0.62, 0.8, mn(q * 7.0)) * 0.25 + smoothstep(0.7, 0.85, mn(q * 15.0 + 2.0)) * 0.15;
          float limb = 0.55 + 0.45 * pow(max(dot(normalize(vN), -uMoon), 0.0), 0.4);
          vec3 col = vec3(0.86, 0.88, 0.94) * (1.0 - maria - craters) * limb;
          gl_FragColor = vec4(col, (${ID.MOON}.0 + 0.5) / 32.0);
        }`,
    }));
    moon.position.copy(moonVis).multiplyScalar(285); g.add(moon);
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
  W.updateSky = function (cam) { if (W.sky) W.sky.position.set(cam.position.x, 0, cam.position.z); };

  // ----- pieces -----
  function campfire(scene, x, z, label) {
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
    W.interact.push({ type: 'rest', x, z, r: 2.8, label: 'Rest at ' + label, name: label });
    return { g, light };
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
      batch.add('post', postG, woodM, place(x, W.heightAt(x, z), z, 0, 1, 0.7 + rnd() * 0.5, 1));
      W.addCollider(x, z, 0.35, 'fence');
    }
    // tents
    const tentG = new THREE.ConeGeometry(2.0, 2.6, 4); tentG.translate(0, 1.3, 0);
    const tents = [[-9, 22, 0x6a3a28], [-10, 37, 0x5a4a30], [9, 38, 0x7a3030], [-2, 42, 0x4a4a38]];
    tents.forEach(([dx, dz, c]) => {
      const m = new THREE.Mesh(tentG, GW.mat({ id: ID.CLOTH, color: c })); const x = vx + dx, z = vz + dz - 30 + 30;
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
      uniforms: Object.assign({ uMoonVis: { value: new THREE.Vector3(-0.18, 0.86, -0.48).normalize() } }, GW.LU),
      side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `varying vec2 vUv; varying vec3 vW; ${GW.LIGHT_GLSL}
        float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        uniform vec3 uMoonVis; uniform sampler2D uRefl; uniform mat4 uReflMat; uniform float uReflOn;
        void main(){
          float e = min(vUv.x, 1.0 - vUv.x);
          // current: long streaks running downstream, faster in the middle of the channel
          float mid = 1.0 - abs(vUv.x - 0.5) * 2.0;
          float flow = uTime * (1.0 + 0.8 * mid);
          float streak = smoothstep(0.55, 0.9, n2(vec2(vUv.y * 0.22 - flow * 0.55, vUv.x * 11.0)) * n2(vec2(vUv.y * 0.9 - flow * 1.1, vUv.x * 4.0 + 7.0)) * 1.9);
          float foam = smoothstep(0.22, 0.06, e) * (0.55 + 0.45 * n2(vec2(vUv.y * 1.1 - flow * 1.4, vUv.x * 14.0)));
          // ripple normal
          vec2 rp = vec2(vUv.y * 2.2 - flow * 1.6, vUv.x * 12.0);
          vec3 wn = normalize(vec3((n2(rp) - 0.5) * 0.5 + (n2(rp * 2.3 + 5.1) - 0.5) * 0.25, 1.0, (n2(rp + 13.7) - 0.5) * 0.5));
          vec3 L = lightAt(vW, vec3(0.0, 1.0, 0.0));
          vec3 V = normalize(uCam - vW);
          // reflection: sky colour by Fresnel, the moon and nearby fires as shimmering streaks
          float fres = 0.04 + 0.96 * pow(1.0 - max(dot(wn, V), 0.0), 5.0);
          vec3 R = reflect(-V, wn);
          vec3 skyR = mix(vec3(0.07, 0.09, 0.15), vec3(0.01, 0.015, 0.035), smoothstep(0.0, 0.6, R.y));
          float mr = max(dot(R, uMoonVis), 0.0);
          vec3 moonR = vec3(0.85, 0.9, 1.0) * (pow(mr, 160.0) * 2.5 + pow(mr, 18.0) * 0.18);
          vec3 body = vec3(0.012, 0.025, 0.06) + L * vec3(0.03, 0.06, 0.11);
          vec3 col;
          if (uReflOn > 0.5) {
            // dark mirror: the mirrored scene, wobbling with the ripples
            vec4 rq = uReflMat * vec4(vW + vec3(wn.x, 0.0, wn.z) * 0.9, 1.0);
            vec3 refl = texture2D(uRefl, rq.xy / rq.w).rgb;
            col = body + refl * (0.7 + 0.3 * fres);
          } else col = mix(body, skyR * 1.2, fres) + moonR * gShadow;
          col += specAt(vW, wn, V, 60.0) * 1.1;
          col += vec3(0.42, 0.56, 0.8) * (streak * 0.2 + foam * 0.45) * (0.35 + L * 1.2);
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
      uniforms: Object.assign({ uCenter: { value: new THREE.Vector2() }, uSize: { value: S }, tMap: { value: tMap }, uWorld: { value: SIZE }, uPush: { value: push }, uScale: { value: 1.0 }, uWidth: { value: 1.0 } }, GW.LU),
      side: THREE.DoubleSide,
      vertexShader: `attribute vec3 aOff; attribute vec2 aV;
        uniform vec2 uCenter; uniform float uSize; uniform sampler2D tMap; uniform float uWorld; uniform vec3 uPush[6]; uniform float uScale; uniform float uTime; uniform float uWidth;
        varying vec3 vW; varying vec3 vCol; varying float vT;
        float gh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(gh(i), gh(i + vec2(1.0, 0.0)), f.x), mix(gh(i + vec2(0.0, 1.0)), gh(i + vec2(1.0, 1.0)), f.x), f.y); }
        void main(){
          vec2 base = uCenter - uSize * 0.5;
          vec2 wp = base + mod(aOff.xy * (uSize / 50.0) - base, uSize);
          vec4 m = texture2D(tMap, wp / uWorld + 0.5);
          float sd = aOff.z;
          float ed = max(abs(wp.x - uCenter.x), abs(wp.y - uCenter.y)) / uSize;
          float edgeF = 1.0 - smoothstep(0.34, 0.5, ed);
          float vis = step(fract(sd * 7.31), m.g);
          float fA = vn(wp * 0.035), fB = vn(wp * 0.11 + 7.0);
          // mostly short turf; tall grass only in scattered patches
          float tall = smoothstep(0.66, 0.82, vn(wp * 0.04 + 11.3)) * smoothstep(0.3, 0.6, vn(wp * 0.13 + 2.7));
          float h = (0.2 + 0.28 * fract(sd * 3.7)) * mix(1.0, 3.4, tall) * uScale * vis * edgeF * (0.8 + 0.4 * fB);
          float ang = sd * 6.2831 * 13.0;
          vec2 dir = vec2(cos(ang), sin(ang));
          float t = aV.y;
          vec2 bend = vec2(cos(ang * 1.7), sin(ang * 1.7)) * (0.15 + 0.35 * fract(sd * 11.0));
          float wind = sin(uTime * 1.4 + wp.x * 0.25 + wp.y * 0.18) * 0.28 + sin(uTime * 3.3 + wp.x * 1.1 + wp.y) * 0.07;
          bend += vec2(wind, wind * 0.35);
          // gusts: broad waves rolling across the meadow
          float gust = smoothstep(0.55, 1.0, sin(dot(wp, vec2(0.8, 0.6)) * 0.085 - uTime * 1.15 + fA * 2.5) * 0.5 + 0.5);
          bend += vec2(0.8, 0.6) * gust * 0.85;
          for (int i = 0; i < 6; i++) {
            vec2 d = wp - uPush[i].xy; float dd = length(d);
            float f = clamp(1.0 - dd / max(uPush[i].z, 0.001), 0.0, 1.0);
            bend += d / max(dd, 0.05) * f * 1.3;
          }
          vec3 p = vec3(wp.x, m.r, wp.y);
          p.xz += dir * aV.x * 0.032 * uWidth * (1.0 - t * 0.9) + bend * t * t * h;
          p.y += t * h * (1.0 - 0.25 * min(length(bend), 1.5) * t);
          vW = p; vT = t;
          float tone = fract(sd * 17.0);
          vec3 lush = mix(vec3(0.13, 0.3, 0.18), vec3(0.19, 0.36, 0.23), tone);
          vec3 dry = vec3(0.26, 0.31, 0.17), cool = vec3(0.12, 0.28, 0.22);
          vec3 tip = mix(mix(lush, dry, smoothstep(0.55, 0.85, fA) * 0.75), cool, smoothstep(0.6, 0.9, fB) * 0.6);
          tip *= 1.0 + gust * 0.35 * t;
          vCol = mix(vec3(0.02, 0.045, 0.025), tip, t);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `varying vec3 vW; varying vec3 vCol; varying float vT; ${GW.LIGHT_GLSL}
        void main(){
          vec3 L = lightAt(vW, normalize(vec3(0.2, 1.0, 0.3)));
          vec3 col = vCol * (L * 2.8 + 0.22 * (0.7 + 0.3 * gShadow));
          col = applyFog(col, vW);
          gl_FragColor = vec4(col, (${ID.GRASS}.0 + 0.5) / 32.0);
        }`,
    });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.layers.set(1); scene.add(mesh);
    return { mesh, mat: m, push };
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
      if (f.flat) f.m.material.uniforms.uEmissive.value.setRGB(1.0 * k, 0.35 * k, 0.1 * k);
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
  };

  // ---------- minimap ----------
  W.mapCanvas = function () {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
    g.font = '7px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const step = 4;
    for (let y = 0; y < 512; y += step) for (let x = 0; x < 512; x += step) {
      const wx = x / 512 * SIZE - HALF, wz = y / 512 * SIZE - HALF;
      if (Math.hypot(wx, wz) > 118) continue;
      const rd = W.riverAt(wx, wz), pd = W.pathAt(wx, wz);
      let ch = '.', col = '#1d3a22';
      if (rd < RIVER_W) { ch = '~'; col = '#4a7ad0'; }
      else if (pd < 1.6) { ch = ':'; col = '#7a6040'; }
      else if (W.blocked(wx, wz, 0.2)) { ch = '#'; col = '#3e5a4a'; }
      else if (Math.hypot(wx, wz) > 100) { ch = '^'; col = '#24382c'; }
      else if (((x * 7 + y * 13) % 5) !== 0) continue;
      g.fillStyle = col; g.fillText(ch, x + 2, y + 2);
    }
    return c;
  };
})();

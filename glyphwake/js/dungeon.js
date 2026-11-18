// Glyphwake: instanced dungeons. Caves and castle floors are built far outside the 8 km world
// (x >= 20 km) while the overworld is hidden, then torn down when you leave.
(function () {
  'use strict';
  const GW = window.GW, ID = GW.ID;
  const TILE = 2, TN = 72;                       // 72 x 72 tiles of 2 m = 144 m per level
  const X0 = 20000;                              // where levels are built
  const D = GW.Dungeon = { X0 };
  const STYLE = {
    cave: { wall: { id: ID.ROCK, tex: 6, color: 0x6a6660, fill: 0.08 }, floor: { id: ID.STONE, tex: 8, color: 0x2e2c2a }, rooms: [6, 8], size: [6, 11], torch: 0.6 },
    castle: { wall: { id: ID.MASONRY, tex: 8, color: 0x8a8c90, fill: 0.1 }, floor: { id: ID.STONE, tex: 8, color: 0x46484c }, rooms: [5, 7], size: [7, 12], torch: 1.0 },
  };
  // carve rooms joined by corridors on a tile grid
  function layout(rnd, st) {
    const floor = new Uint8Array(TN * TN), rooms = [];
    const nRooms = st.rooms[0] + Math.floor(rnd() * (st.rooms[1] - st.rooms[0] + 1));
    const carve = (x0, z0, x1, z1) => { for (let z = Math.max(1, z0); z <= Math.min(TN - 2, z1); z++) for (let x = Math.max(1, x0); x <= Math.min(TN - 2, x1); x++) floor[z * TN + x] = 1; };
    const overlaps = r => rooms.some(o => r.x0 - 2 < o.x1 && r.x1 + 2 > o.x0 && r.z0 - 2 < o.z1 && r.z1 + 2 > o.z0);
    let cx = 10, cz = TN / 2;
    for (let i = 0; i < nRooms; i++) {
      let r = null;
      for (let tries = 0; tries < 60 && !r; tries++) {
        const w = st.size[0] + Math.floor(rnd() * (st.size[1] - st.size[0])), h = st.size[0] + Math.floor(rnd() * (st.size[1] - st.size[0]));
        let x0, z0;
        if (!rooms.length) { x0 = 3; z0 = Math.floor(TN / 2 - h / 2); }
        else { const a = (rnd() - 0.5) * Math.PI * 1.3, d = 14 + rnd() * 8; x0 = Math.round(cx + Math.cos(a) * d - w / 2); z0 = Math.round(cz + Math.sin(a) * d - h / 2); }
        const c = { x0, z0, x1: x0 + w, z1: z0 + h };
        if (c.x0 < 2 || c.z0 < 2 || c.x1 > TN - 3 || c.z1 > TN - 3 || overlaps(c)) continue;
        r = c;
      }
      if (!r) break;
      r.cx = Math.floor((r.x0 + r.x1) / 2); r.cz = Math.floor((r.z0 + r.z1) / 2);
      carve(r.x0, r.z0, r.x1, r.z1);
      if (rooms.length) {   // L-shaped corridor, 3 tiles wide, from the previous room
        const p = rooms[rooms.length - 1];
        if (rnd() < 0.5) { carve(Math.min(p.cx, r.cx), p.cz - 1, Math.max(p.cx, r.cx), p.cz + 1); carve(r.cx - 1, Math.min(p.cz, r.cz), r.cx + 1, Math.max(p.cz, r.cz)); }
        else { carve(p.cx - 1, Math.min(p.cz, r.cz), p.cx + 1, Math.max(p.cz, r.cz)); carve(Math.min(p.cx, r.cx), r.cz - 1, Math.max(p.cx, r.cx), r.cz + 1); }
      }
      rooms.push(r); cx = r.cx; cz = r.cz;
    }
    return { floor, rooms };
  }
  // build one level: walls (letters), floor, torches. Returns everything needed to tear it down.
  D.build = function (scene, seed, kind, slot) {
    const W = GW.World, st = STYLE[kind], rnd = GW.rand(seed), { floor, rooms } = layout(rnd, st);
    const ox = X0 + slot * 400, oz = 0, at = (tx, tz) => [ox + tx * TILE + TILE / 2, oz + tz * TILE + TILE / 2];
    const lv = { kind, rooms, meshes: [], cols: [], lights: [], flames: [], inter: [], at, floor };
    const isF = (x, z) => x >= 0 && z >= 0 && x < TN && z < TN && floor[z * TN + x];
    // walls: every solid tile touching the floor becomes a block
    const walls = [];
    for (let z = 0; z < TN; z++) for (let x = 0; x < TN; x++) {
      if (floor[z * TN + x]) continue;
      let near = false; for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1; dx++) if (isF(x + dx, z + dz)) { near = true; break; }
      if (near) walls.push([x, z]);
    }
    const wg = new THREE.BoxGeometry(TILE, 3.6, TILE); wg.translate(0, 1.8, 0);
    const wm = GW.mat(Object.assign({ side: THREE.DoubleSide }, st.wall));
    const im = new THREE.InstancedMesh(wg, wm, walls.length), m4 = new THREE.Matrix4(), col = new THREE.Color();
    walls.forEach(([x, z], i) => { const [wx, wz] = at(x, z), hgt = 0.85 + 0.3 * rnd(); m4.makeScale(1, hgt, 1); m4.setPosition(wx, 0, wz); im.setMatrixAt(i, m4); im.setColorAt(i, col.setScalar(0.8 + rnd() * 0.35)); lv.cols.push(W.addCollider(wx, wz, 1.25, 'dwall')); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); scene.add(im); lv.meshes.push(im); W.occluders.push(im);
    // floor
    const fg = new THREE.PlaneGeometry(TN * TILE, TN * TILE, 1, 1); fg.rotateX(-Math.PI / 2); fg.translate(ox + TN * TILE / 2, 0, oz + TN * TILE / 2);
    const fl = new THREE.Mesh(fg, GW.mat(st.floor)); scene.add(fl); lv.meshes.push(fl);
    // torches on room walls
    const fm = GW.mat({ id: ID.FIRE, color: 0, emissive: 0xffa040, unlit: true }), pm = GW.mat({ id: ID.WOOD, color: 0x4a3420 });
    for (const r of rooms) {
      const n = Math.max(1, Math.round(2 * st.torch + rnd()));
      for (let k = 0; k < n; k++) {
        const side = Math.floor(rnd() * 4), tx = side < 2 ? r.x0 + 1 + Math.floor(rnd() * (r.x1 - r.x0 - 1)) : (side === 2 ? r.x0 : r.x1), tz = side >= 2 ? r.z0 + 1 + Math.floor(rnd() * (r.z1 - r.z0 - 1)) : (side === 0 ? r.z0 : r.z1);
        const [x, z] = at(tx, tz);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.8, 5), pm); pole.position.set(x, 0.9, z); scene.add(pole); lv.meshes.push(pole);
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.5, 5), fm); f.position.set(x, 2.05, z); scene.add(f); lv.meshes.push(f);
        const fe = { m: f, s: rnd() * 10, base: 1 }; W.flames.push(fe); lv.flames.push(fe);
        lv.lights.push(W.lights.add(x, 2.3, z, new THREE.Color(1.0, 0.55, 0.22), 9, 0.8));
      }
    }
    lv.start = at(rooms[0].cx, rooms[0].cz); lv.end = at(rooms[rooms.length - 1].cx, rooms[rooms.length - 1].cz);
    return lv;
  };
  D.destroy = function (scene, lv) {
    const W = GW.World;
    lv.meshes.forEach(m => { scene.remove(m); if (m.isInstancedMesh) m.dispose(); const k = W.occluders.indexOf(m); if (k >= 0) W.occluders.splice(k, 1); });
    lv.cols.forEach(W.removeCollider); lv.lights.forEach(l => W.lights.remove(l));
    W.flames = W.flames.filter(f => !lv.flames.includes(f));
    W.interact = W.interact.filter(it => !lv.inter.includes(it));
  };
  D.TILE = TILE;
})();

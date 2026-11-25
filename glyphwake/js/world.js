// Glyphwake: the Vale. Terrain bake, grass, river, props, colliders, zones.
(function () {
  'use strict';
  const GW = window.GW, ID = GW.ID;
  // 8 km world. Terrain data (2 m per texel) is computed per 128 m chunk on demand and cached;
  // the GPU gets a 1 km window around the hero. The old Vale is the centre.
  // WS: the whole world's scale (regions, roads, river, rim). The Vale grows by VS; the world around it grows by WS.
  const WS = 3, LVLD = 280 * WS;   // one enemy level per LVLD metres from the centre
  const SIZE = 8000 * WS, HALF = SIZE / 2, CELLM = 2, DCH = 128, DN = DCH / CELLM, WIN = 1024, WN = WIN / CELLM;
  const CORE = 300;   // the hand-made Vale: |x|,|z| < CORE is scattered once at load, the rest streams in chunks

  // ---------- layout ----------
  // the hand-made Vale is laid out at VS× its original spacing (structures keep their size): more room to learn the basics
  const VS = 4.4;    // site spacing
  const VSC = 2.2;
  const BS = 1.6;    // enterable buildings (keeps, chapels, towers) at a believable size next to the hero; colliders and floors follow   // the densely hand-scattered heart of the Vale (beyond it the streamed countryside takes over)
  const L = {
    start: { x: 0.0, z: 343.2 },
    village: { x: 0.0, z: 132.0 },
    fire: { x: 0, z: 132 },
    anvil: { x: 8.5, z: 127 },
    elder: { x: -5.5, z: 136 },
    smith: { x: 10.5, z: 125.5 },
    bridge: { x: -17.6, z: -57.2 },
    meadow: { x: 52.8, z: -255.2 },
    ruins: { x: -316.8, z: 184.8 },
    grove: { x: 334.4, z: 158.4 },
    arena: { x: 8.8, z: -475.2 },
    ruinFire: { x: -211.2, z: 132.0 },
    meadowFire: { x: -79.2, z: -184.8 },
    castle: { x: 242.0, z: -286.0 },
    chapel: { x: 79.2, z: 264.0 },
    tower: { x: -44.0, z: -290.4 },
    lair: { x: -242.0, z: -308.0 },
    // ---- beyond the Vale ----
    hearth: { x: 1500, z: -1500 },      // Hearthwick: the village hub on the crossroads
    // six regions in a ring around the Vale (from ~4 km out): hubs at r ~7.8 km
    abbey: { x: -450, z: -7800 },     // N  Frostmere: Rimeglass Abbey
    frostLake: { x: 360, z: -7410 },
    high: { x: 6750, z: -3900 },      // NE the Highlands
    cinder: { x: 6750, z: 3900 },     // SE the Ashen Barrens: Cinder Watch
    salt: { x: 0, z: 7800 },          // S  the Salt Wastes
    mire: { x: -6750, z: 3900 },      // SW the Mire
    dusk: { x: -6750, z: -3900 },     // NW Duskwood
    dunmaer: { x: 7860, z: -5280 },   // Castle Dunmaer, the great Highland ruin (three floors inside)
    vfrost: { x: -450, z: -7752 },    // villages beside the two landmark hubs
    vash: { x: 6750, z: 3948 },
  };
  // region boss arenas (flattened, kept clear of points of interest and trees). The Rime Knight duels on the frozen mere;
  // the Colossus stands out in the open Barrens, well away from Cinder Watch and Emberfall.
  const ARENAS = [{ key: 'colossus', x: 7800, z: 4500 }, { key: 'rimeknight', x: 360, z: -7410 }, { key: 'mirehag', x: -6150, z: 4680 }, { key: 'cragwarlord', x: 7410, z: -4560 }];
  // one village per region (plus Hearthwick at the crossroads)
  const HUBS = [
    { id: 'vale', name: 'Hearthwick', at: 'hearth' },
    { id: 'frost', name: 'Rimehold', at: 'vfrost' },
    { id: 'high', name: 'Cragmoor', at: 'high' },
    { id: 'ash', name: 'Emberfall', at: 'vash' },
    { id: 'salt', name: 'Saltreach', at: 'salt' },
    { id: 'mire', name: 'Bogwater', at: 'mire' },
    { id: 'dusk', name: 'Dimmering', at: 'dusk' },
  ];
  const RIVER_CP = [[-11850, 780], [-10200, 360], [-8400, 660], [-6600, 180], [-4800, 360], [-3300, -60], [-1716, -198], [-616, -8.8], [-418, -61.6], [-242, -13.2], [-96.8, -26.4], [-17.6, -57.2], [88, -114.4], [242, -88], [396, -132], [616, -193.6], [1716, -726], [3300, -780], [4800, -540], [6300, -1260], [8100, -1140], [9900, -1680], [11850, -1500]];
  // ---- waters: everything runs downhill from the rim and the Highlands into the Glass River, or pools in the low Mire ----
  // w = half-width of the water. Tributaries end on the Glass River; the Sallow ends in Bogwater Mere.
  const RIVER_DEFS = [
    { name: 'THE GLASS RIVER', w: 4.2, cp: RIVER_CP },
    { name: 'THE RIMERUN', w: 3.0, cp: [[-1800, -11650], [-1550, -10500], [-1350, -9300], [-1250, -8250], [-1450, -7000], [-1950, -5600], [-2450, -4200], [-2850, -2800], [-3150, -1500], [-3300, -400], [-3300, -60]] },
    { name: 'CRAGWATER', w: 3.2, cp: [[9800, -10600], [8700, -9200], [7600, -8100], [6350, -6900], [5450, -5600], [4800, -4300], [4250, -3150], [3750, -2000], [3400, -1200], [3300, -780]] },
    { name: 'THE DIMWATER', w: 2.6, cp: [[-10600, -9700], [-9700, -8300], [-8800, -6900], [-7900, -5500], [-7300, -4500], [-7250, -3200], [-7500, -2000], [-7900, -800], [-8300, 200], [-8400, 660]] },
    { name: 'CINDERBROOK', w: 2.0, cp: [[11600, 2300], [10500, 1900], [9500, 1300], [8700, 500], [8300, -300], [8100, -1140]] },
    { name: 'THE SALLOW', w: 2.4, cp: [[-5000, 11650], [-5300, 10300], [-5750, 8900], [-6150, 7500], [-6250, 6300], [-6150, 5480]] },
  ];
  // lakes and ponds (a point with a radius: the same water rules as the rivers)
  const LAKES = [
    { name: 'BOGWATER MERE', x: -6150, z: 5300, r: 170 },
    { name: 'THE HIGH TARN', x: 8700, z: -7000, r: 95 },
    { name: 'DIMMERING POOL', x: -5200, z: -6300, r: 85 },
    { name: 'THE ASH POOL', x: 9300, z: 3300, r: 60 },
    { name: 'SALT SPRING', x: 1400, z: 9300, r: 42 },
    { name: 'THE OASIS', x: -2300, z: 8700, r: 36 },
    { name: 'MILLPOND', x: 2000, z: -1150, r: 40 },
    { name: 'REEDWATER', x: -2400, z: 2700, r: 55 },
    { name: 'STILLWATER', x: 2700, z: 2300, r: 48 },
    { name: 'GREYPOOL', x: -1900, z: -3400, r: 50 },
    { name: 'FROSTGLASS TARN', x: -3600, z: -9300, r: 70 },
    { name: 'THE SUNK POND', x: 4200, z: 6200, r: 45 },
  ];
  // road kinds: 2 = the King's roads (wide, cobbled, stone bridges), 1 = roads (packed dirt, timber bridges), 0 = paths
  const ROAD_W = [0, 1.6, 3.0];   // extra half-width over a footpath
  const PATHS = [
    [[0, 343.2], [4.4, 264], [-4.4, 202.4], [0, 149]],
    [[0, 115], [-13.2, 17.6], [-17.6, -57.2], [8.8, -132], [35.2, -198], [52.8, -255.2], [35.2, -352], [13.2, -422.4], [8.8, -457.6]],
    [[-17, 132], [-132, 149.6], [-211.2, 132], [-264, 167.2], [-316.8, 184.8]],
    [[17, 132], [140.8, 118.8], [228.8, 145.2], [334.4, 158.4]],
    [[61.6, -255.2], [132, -237.6], [193.6, -224.4], [242, -224.4], [242, -246.4]],
    // roads beyond the Vale: to Hearthwick, then east to the Barrens and north to Frostmere
    [[242, -246.4], [750, -780], [1140, -1155], [1500, -1477.5]],
    // Hearthwick to the Highlands, the Barrens and Frostmere
    [[1500, -1477.5], [2400, -1950], [3450, -2325], [4500, -2775], [5700, -3375], [6720, -3870]],
    [[1500, -1477.5], [2100, -750], [2850, 300], [3900, 1350], [5100, 2550], [6720, 3855]],
    [[1500, -1522.5], [1050, -2400], [600, -3450], [360, -4500], [120, -5700], [-180, -6900], [-435, -7740]],
    // the Vale to the Mire and Duskwood (west) and the Salt Wastes (south)
    [[-316.8, 184.8], [-1050, 495], [-2100, 1050], [-3600, 1800], [-5100, 2850], [-6720, 3870]],
    [[8.8, -457.6], [-400, -560], [-1500, -1200], [-3000, -1950], [-4500, -2700], [-5400, -3240], [-6720, -3885]],
    [[0, 334.4], [40, 640], [-30, 1800], [180, 3600], [-90, 5400], [0, 7755]],
    // the old ring road between the region hubs
    [[-435, -7740], [2100, -6900], [4800, -5550], [6720, -3870], [7800, -900], [7800, 1200], [6720, 3855], [4500, 5850], [2100, 7200], [0, 7755],
     [-2100, 7200], [-4500, 5850], [-6720, 3870], [-7800, 1200], [-7800, -900], [-6720, -3885], [-4800, -5550], [-2400, -7050], [-435, -7740]],
    // the castle road: from Cragmoor up to Dunmaer's gate, swinging west of the Warlord's field
    [[6720, -3870], [6800, -4500], [7300, -5000], [7840, -5230]],
    // trails from the hubs to the guardians' grounds and the water
    [[-400, -7700], [0, -7560], [280, -7450]],
    [[6800, 3950], [7300, 4250], [7660, 4420]],
    [[-6700, 3960], [-6420, 4300], [-6250, 4560]],
    [[6780, -3950], [7080, -4240], [7300, -4460]],
    [[60, 7820], [700, 8500], [1340, 9240]],
    [[1500, -1477.5], [1760, -1300], [1960, -1185]],
  ];
  const PATH_KIND = [0, 1, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0];
  const ZONES = [
    { name: 'THE WAKING STONE', sub: 'the vale of ninefold', x: 0, z: 343.2, r: 14 },
    { name: 'EMBERHOLD', sub: 'last fire of the vale', x: 0, z: 132, r: 17 },
    { name: 'THE GLASS RIVER', sub: 'crossing', x: -17.6, z: -57.2, r: 9 },
    { name: 'THORNWOLF MEADOW', sub: 'hunting grounds', x: 52.8, z: -255.2, r: 42 },
    { name: 'HOLLOW RUINS', sub: 'the old scriptorium', x: -316.8, z: 184.8, r: 30 },
    { name: 'THE PALE CHAPEL', sub: 'its door still stands', x: 79.2, z: 272.8, r: 12 },
    { name: 'THE IVY WATCH', sub: 'a tower that still keeps watch', x: -44, z: -290.4, r: 10 },
    { name: "THE WIDOW'S HOLLOW", sub: 'something vast is breathing', x: -242, z: -308, r: 16 },
    { name: 'GREYMOSS KEEP', sub: 'a castle the vale forgot', x: 242, z: -286, r: 17 },
    { name: 'THE QUIET GRAVES', sub: 'where the vale keeps its dead', x: -158.4, z: 281.6, r: 13 },
    { name: 'WISPWOOD', sub: 'where the lanterns drift', x: 334.4, z: 158.4, r: 38 },
    { name: 'THE WARDEN CIRCLE', sub: 'stone remembers', x: 8.8, z: -475.2, r: 22 },
    { name: 'HEARTHWICK', sub: 'the crossroads village', x: 1500, z: -1500, r: 30 },
    { name: 'CINDER WATCH', sub: 'it never stopped burning', x: 6750, z: 3900, r: 24 },
    { name: 'RIMEGLASS ABBEY', sub: 'the bells are frozen', x: -450, z: -7800, r: 24 },
    { name: 'THE STILL MERE', sub: 'ice that remembers the sky', x: 360, z: -7410, r: 70 },
    { name: 'RIMEHOLD', sub: 'warm hearths under the snow', x: -450, z: -7728, r: 30 },
    { name: 'CASTLE DUNMAER', sub: 'three floors of old crowns and older ghosts', x: 7860, z: -5280, r: 26 },
    { name: 'THE CINDER FIELD', sub: 'where the Colossus walks', x: 7800, z: 4500, r: 26 },
    { name: 'THE FROZEN MERE', sub: 'a knight keeps vigil on the ice', x: 360, z: -7410, r: 40 },
    { name: "THE HAG'S POOL", sub: 'green light under the water', x: -6150, z: 4680, r: 22 },
    { name: 'THE WARLORD\'S CROWN', sub: 'he never stopped ruling', x: 7410, z: -4560, r: 22 },
    { name: 'CRAGMOOR', sub: 'the last village before the crowns', x: 6750, z: -3900, r: 30 },
    { name: 'EMBERFALL', sub: 'they rebuild between the fires', x: 6750, z: 3972, r: 30 },
    { name: 'SALTREACH', sub: 'water is worth more than gold', x: 0, z: 7800, r: 30 },
    { name: 'BOGWATER', sub: 'houses on stilts, people on edge', x: -6750, z: 3900, r: 30 },
    { name: 'DIMMERING', sub: 'lamps lit at noon', x: -6750, z: -3900, r: 30 },
  ];
  // regions (biomes): name, subtitle, banner colour
  const REGIONS = {
    vale: { name: 'THE VALE OF NINEFOLD', sub: 'green, and still', col: '#9fd0b0' },
    ash: { name: 'THE ASHEN BARRENS', sub: 'the ground is warm', col: '#e0a070' },
    frost: { name: 'FROSTMERE', sub: 'breath turns to glass', col: '#bcd4f0' },
    high: { name: 'THE HIGHLANDS', sub: 'stone, wind, and old crowns', col: '#b8c4a0' },
    salt: { name: 'THE SALT WASTES', sub: 'white as bone, and as dry', col: '#e8dcb8' },
    mire: { name: 'THE MIRE', sub: 'the ground drinks your steps', col: '#9aa070' },
    dusk: { name: 'DUSKWOOD', sub: 'the trees lean in to listen', col: '#80b0b8' },
  };
  const BIOMES = ['frost', 'high', 'ash', 'salt', 'mire', 'dusk'];   // sector order, clockwise from north

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
  const RIVERS = RIVER_DEFS.map(d => Object.assign({}, d, { pts: catmull(d.cp, 24) }));
  const RIVER_W = 4.2;
  const WATER_Y = -0.55;

  // value noise (JS twin of the shaders' tn)
  const hsh = (i, j) => { const s = Math.sin(i * 41.3 + j * 289.1) * 43758.5453; return s - Math.floor(s); };
  function vnoise(x, z) {
    const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    return GW.lerp(GW.lerp(hsh(i, j), hsh(i + 1, j), u), GW.lerp(hsh(i, j + 1), hsh(i + 1, j + 1), u), v);
  }
  // biome weights: the Vale inside r ~1.4 km, then six sectors clockwise from north (frost, high, ash, salt, mire, dusk)
  function biomeW(x, z) {
    const r = Math.hypot(x, z), wob = (vnoise(x * 0.0015 / WS, z * 0.0015 / WS) - 0.5) * 520 * WS;
    const outer = ss(1250 * WS, 1650 * WS, r + wob);
    const out = [0, 0, 0, 0, 0, 0]; if (outer <= 0) return out;
    const a = Math.atan2(x, -z) + (vnoise(x * 0.0011 + 9, z * 0.0011 - 4) - 0.5) * 0.7;
    let sum = 0;
    for (let k = 0; k < 6; k++) { const d = Math.abs(GW.angDiff(a, k * Math.PI / 3)); out[k] = Math.max(0, 1 - d / (Math.PI / 3 * 0.8)); out[k] = out[k] * out[k] * (3 - 2 * out[k]); sum += out[k]; }
    for (let k = 0; k < 6; k++) out[k] = out[k] / (sum || 1) * outer;
    return out;
  }
  function rawHeight(x, z, bw) {
    let h = rawHeight0(x, z, bw);
    const flatK = (cx, cz, r0, r1, to) => { const d = Math.hypot(x - cx, z - cz); h = GW.lerp(to, h, ss(r0, r1, d)); };
    flatK(L.village.x, L.village.z, 12, 20, 0.15);
    flatK(L.arena.x, L.arena.z, 16, 24, 0.0);
    flatK(L.start.x, L.start.z, 6, 12, 0.3);
    flatK(L.castle.x, L.castle.z, 16 * BS, 23 * BS, 0.4);
    flatK(L.chapel.x, L.chapel.z - 5 * BS, 10 * BS, 16 * BS, 0.3);
    flatK(L.tower.x, L.tower.z, 6 * BS, 11 * BS, 0.25);
    flatK(L.lair.x, L.lair.z, 14, 22, 0.1);
    // twin sites (a village beside its landmark) share one ground height, so the land between them doesn't ramp
    const TWIN = { vfrost: 'abbey', vash: 'cinder' };
    for (const k of ['hearth', 'cinder', 'abbey', 'high', 'salt', 'mire', 'dusk', 'vfrost', 'vash', 'dunmaer']) flatK(L[k].x, L[k].z, 30, 60, h0At(L[TWIN[k] || k]));
    for (const a of ARENAS) if (a.key !== 'rimeknight') flatK(a.x, a.z, 22, 38, h0At(a));
    flatK(L.frostLake.x, L.frostLake.z, 75, 110, h0At(L.frostLake) - 0.6);
    return h;
  }
  // terrain before hubs are flattened: the Vale's gentle waves, rolling land, region character, edge mountains
  function rawHeight0(x, z, bw) {
    let h = 0.5 * Math.sin(x * 0.05) * Math.cos(z * 0.045) + 0.35 * Math.sin(x * 0.13 + 1.3) * Math.sin(z * 0.11 + 0.7)
      + 0.12 * Math.sin(x * 0.4 + z * 0.3);
    const r = Math.hypot(x, z);
    h += ss(98 * VS, 128 * VS, r) * 2.2 * (1 - ss(150 * VS, 220 * VS, r));   // the old forest rise around the Vale, softened
    const far = ss(150 * VS, 340 * VS, r);
    h += far * ((vnoise(x * 0.0032, z * 0.0032) - 0.5) * 16 + (vnoise(x * 0.011 + 7, z * 0.011 + 3) - 0.5) * 5);
    const b = bw || biomeW(x, z);
    if (b[1] > 0) { const rg = 1 - Math.abs(2 * vnoise(x * 0.0042 + 3, z * 0.0042 + 8) - 1); h += b[1] * (rg * rg * 38 + vnoise(x * 0.02, z * 0.02) * 6); }   // highlands: ridges
    if (b[0] > 0) h += b[0] * (vnoise(x * 0.006 + 1, z * 0.006) - 0.3) * 12;                                                  // frost: soft drifts
    if (b[2] > 0) h += b[2] * (vnoise(x * 0.012, z * 0.012 + 5) - 0.5) * 10;                                                   // ash: broken ground
    if (b[3] > 0) h = GW.lerp(h, h * 0.15 + 0.3, b[3]);                                                                         // salt: flat pans
    if (b[4] > 0) h = GW.lerp(h, -0.15 + vnoise(x * 0.025, z * 0.025) * 0.9, b[4] * 0.9);                                     // mire: low and wet
    if (b[5] > 0) h += b[5] * (vnoise(x * 0.007 + 2, z * 0.007 - 6) - 0.4) * 14;                                              // duskwood: hills
    h += ss(HALF - 350, HALF - 50, Math.max(Math.abs(x), Math.abs(z))) * 60;                                                                // the world's rim
    return h;
  }

  // base level for flattened hubs (the rolling-land height at their centre, without flattening)
  const _h0 = {};
  function h0At(c) {
    const k = c.x + ',' + c.z; if (_h0[k] !== undefined) return _h0[k];
    return (_h0[k] = rawHeight0(c.x, c.z));
  }

  // ---------- terrain data: computed per 128 m chunk, cached ----------
  // river surface height follows the land: each river vertex gets a smoothed ground height
  const smoothY = pts => { const raw = pts.map(p => rawHeight0(p[0], p[1]) - 0.55); return raw.map((_, i) => { let s = 0, n = 0; for (let k = -6; k <= 6; k++) { s += raw[Math.max(0, Math.min(raw.length - 1, i + k))]; n++; } return s / n; }); };
  const RIVER_Y = (() => { const raw = RIVER.map(p => rawHeight0(p[0], p[1]) - 0.55); return raw.map((_, i) => { let s = 0, n = 0; for (let k = -6; k <= 6; k++) { const v = raw[Math.max(0, Math.min(raw.length - 1, i + k))]; s += v; n++; } return Math.min(s / n, raw[i] + 0.2); }); })();
  // segment index (256 m cells) so each chunk only measures nearby river/road segments
  const SEGC = 256;
  function segIndex(polys, band, ys, wos, extra, kinds) {
    const idx = new Map();
    band += extra || 0;
    polys.forEach((poly, pi) => { const Y = ys ? ys[pi] : null; for (let s = 0; s < poly.length - 1; s++) {
      const a = poly[s], b = poly[s + 1], seg = { ax: a[0], az: a[1], dx: b[0] - a[0], dz: b[1] - a[1], ya: Y ? Y[s] : 0, yb: Y ? Y[s + 1] : 0, wo: wos ? wos[pi] : 0, k: kinds ? kinds[pi] : 0 };
      seg.l2 = seg.dx * seg.dx + seg.dz * seg.dz || 1e-6;
      const i0 = Math.floor((Math.min(a[0], b[0]) - band) / SEGC), i1 = Math.floor((Math.max(a[0], b[0]) + band) / SEGC);
      const j0 = Math.floor((Math.min(a[1], b[1]) - band) / SEGC), j1 = Math.floor((Math.max(a[1], b[1]) + band) / SEGC);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = i * 4096 + j; let l = idx.get(k); if (!l) idx.set(k, l = []); l.push(seg); }
    } });
    return idx;
  }
  RIVERS[0].ys = RIVER_Y;
  for (let r = 1; r < RIVERS.length; r++) {
    const R = RIVERS[r], ys = smoothY(R.pts);
    for (let i = 1; i < ys.length; i++) ys[i] = Math.min(ys[i], ys[i - 1]);   // water only runs downhill
    const end = R.pts[R.pts.length - 1];
    let joinY = null;
    if (r !== 5) { let bd = 1e9; RIVER.forEach((p, i) => { const d = Math.hypot(p[0] - end[0], p[1] - end[1]); if (d < bd) { bd = d; joinY = RIVER_Y[i]; } }); }
    const lake = LAKES[0]; if (r === 5) joinY = null;
    if (joinY !== null) { const n = Math.min(40, ys.length); for (let i = 0; i < n; i++) { const k = ys.length - n + i, t = i / (n - 1); ys[k] = Math.max(joinY, GW.lerp(ys[k], joinY, t * t)); } }
    R.ys = ys;
  }
  // lakes sit level, a little under the lowest ground around them
  LAKES.forEach(Lk => { let m = 1e9; for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; m = Math.min(m, rawHeight0(Lk.x + Math.cos(a) * Lk.r * 1.15, Lk.z + Math.sin(a) * Lk.r * 1.15)); } Lk.y = Math.min(m, rawHeight0(Lk.x, Lk.z)) - 0.6; });
  // the Sallow pours into Bogwater Mere: meet the lake's level
  { const R = RIVERS[5], n = Math.min(30, R.ys.length); for (let i = 0; i < n; i++) { const k = R.ys.length - n + i, t = i / (n - 1); R.ys[k] = Math.max(LAKES[0].y, GW.lerp(R.ys[k], LAKES[0].y, t * t)); } }

  // ---- placeholder (bridges are found once the roads exist) ----
  // ---- roads bend around steep ground and keep out of lakes; the Vale's paths stay as laid out ----
  function relaxRoad(poly) {
    const out = [poly[0]];
    for (let i = 0; i < poly.length - 1; i++) { const a = poly[i], b = poly[i + 1], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 110)); for (let s = 1; s <= n; s++) out.push([GW.lerp(a[0], b[0], s / n), GW.lerp(a[1], b[1], s / n)]); }
    const H = (x, z) => rawHeight0(x, z), orig = out.map(p => p.slice());
    const cost = (x, z, pv, nx, o) => {
      let c = (Math.abs(H(x, z) - H(pv[0], pv[1])) + Math.abs(H(nx[0], nx[1]) - H(x, z))) * 4;
      c += Math.hypot(x - (pv[0] + nx[0]) / 2, z - (pv[1] + nx[1]) / 2) * 0.12 + Math.hypot(x - o[0], z - o[1]) * 0.03;
      for (const Lk of LAKES) { const d = Math.hypot(x - Lk.x, z - Lk.z) - Lk.r; if (d < 40) c += (40 - d) * 20; }
      if (Math.hypot(x - L.frostLake.x, z - L.frostLake.z) < 130) c += 600;
      for (const a of ARENAS) if (Math.hypot(x - a.x, z - a.z) < 150) c += 300;
      return c;
    };
    for (let it = 0; it < 3; it++) for (let i = 1; i < out.length - 1; i++) {
      const p = out[i]; if (Math.hypot(p[0], p[1]) < 760) continue;
      const pv = out[i - 1], nx = out[i + 1]; let dx = nx[0] - pv[0], dz = nx[1] - pv[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      let best = p, bc = cost(p[0], p[1], pv, nx, orig[i]);
      for (let o = -60; o <= 60; o += 15) { if (!o) continue; const x = p[0] - dz * o, z = p[1] + dx * o, c = cost(x, z, pv, nx, orig[i]); if (c < bc) { bc = c; best = [x, z]; } }
      out[i] = best;
    }
    return out;
  }
  const PATHP = PATHS.map((p, i) => catmull(PATH_KIND[i] ? relaxRoad(p) : p, PATH_KIND[i] ? 3 : 8));

  // rivers and lakes share one index: each segment knows its water level and how much wider (or narrower) than the Glass River it is
  const waterPolys = RIVERS.map(R => R.pts).concat(LAKES.map(Lk => [[Lk.x, Lk.z], [Lk.x + 0.01, Lk.z]]));
  const waterYs = RIVERS.map(R => R.ys).concat(LAKES.map(Lk => [Lk.y, Lk.y]));
  const waterWo = RIVERS.map(R => R.w - RIVER_W).concat(LAKES.map(Lk => Lk.r - RIVER_W));
  const RIDX_ = null;
  const RIDX = segIndex(waterPolys, 64, waterYs, waterWo, LAKES.reduce((m, Lk) => Math.max(m, Lk.r), 0)), PIDX = segIndex(PATHP, 32, null, PATHP.map((_, i) => ROAD_W[PATH_KIND[i]]), 4, PATHP.map((_, i) => PATH_KIND[i]));
  const EMPTY = [];
  // bridges: every crossing of a road or path with a river; the King's roads get stone, the rest timber
  const BRIDGES = [];
  function findBridges() {
    const HW = [1.7, 2.4, 3.3];
    PATHP.forEach((poly, pi) => { const kind = PATH_KIND[pi];
      for (let s = 0; s < poly.length - 1; s++) {
        const a = poly[s], b = poly[s + 1];
        for (const r of segsNear(RIDX, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]))) {
          if (r.l2 < 1) continue;   // a lake, not a river
          const ex = b[0] - a[0], ez = b[1] - a[1], den = ex * r.dz - ez * r.dx; if (Math.abs(den) < 1e-9) continue;
          const t = ((r.ax - a[0]) * r.dz - (r.az - a[1]) * r.dx) / den, u = ((r.ax - a[0]) * ez - (r.az - a[1]) * ex) / den;
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          const x = a[0] + ex * t, z = a[1] + ez * t;
          if (Math.hypot(x - L.bridge.x, z - L.bridge.z) < 40 || BRIDGES.some(q => Math.hypot(q.x - x, q.z - z) < 30)) continue;
          const l = Math.hypot(ex, ez), wr = RIVER_W + r.wo;
          BRIDGES.push({ x, z, dx: ex / l, dz: ez / l, y: r.ya + (r.yb - r.ya) * u, len: 2 * (wr + 3.2), half: HW[kind], kind });
        }
      }
    });
  }
  function bridgeAt(x, z) {
    for (const b of BRIDGES) {
      const px = x - b.x, pz = z - b.z; if (px * px + pz * pz > (b.len * b.len) / 4 + b.half * b.half + 1) continue;
      const along = px * b.dx + pz * b.dz, across = -px * b.dz + pz * b.dx;
      if (Math.abs(along) < b.len / 2 && Math.abs(across) < b.half) return { b, along };
    }
    return null;
  }
  const bridgeDeckY = (b, along) => b.y + 0.8 + 0.4 * (1 - Math.min(1, (along / (b.len / 2)) ** 2));
  function segsNear(idx, x0, z0, x1, z1) {
    const ia = Math.floor(x0 / SEGC), ib = Math.floor(x1 / SEGC), ja = Math.floor(z0 / SEGC), jb = Math.floor(z1 / SEGC);
    if (ia === ib && ja === jb) return idx.get(ia * 4096 + ja) || EMPTY;   // single cell: no copy
    const out = new Set();
    for (let i = Math.floor(x0 / SEGC); i <= Math.floor(x1 / SEGC); i++) for (let j = Math.floor(z0 / SEGC); j <= Math.floor(z1 / SEGC); j++) { const l = idx.get(i * 4096 + j); if (l) l.forEach(s => out.add(s)); }
    return [...out];
  }
  // distance to the nearest segment's edge, measured as if it were a Glass-River-wide river / a footpath (so one set of thresholds fits all)
  let _nk = 0;
  function nearest(segs, x, z, cap) {
    let best = cap, y = 0; _nk = 0;
    for (const s of segs) {
      let t = ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = s.ax + s.dx * t - x, pz = s.az + s.dz * t - z, d = Math.max(0, Math.sqrt(px * px + pz * pz) - s.wo);
      if (d < best) { best = d; y = s.ya + (s.yb - s.ya) * t; _nk = s.k; }
    }
    return [best, y];
  }
  // every field for one point (used by chunks and the world map)
  function fieldsAt(x, z, rsegs, psegs, out) {
    const [rd, ry] = nearest(rsegs, x, z, 60);
    let pd = nearest(psegs, x, z, 30)[0], pk = _nk;
    if (out.fsegs && out.fsegs.length) { const fd = nearest(out.fsegs, x, z, 30)[0]; if (fd < pd) { pd = fd; pk = 0; } }
    const bw = biomeW(x, z);
    let h = rawHeight(x, z, bw);
    const carve = GW.clamp(1 - rd / (RIVER_W + 1.6), 0, 1);
    if (rd < 60) h = Math.min(h, GW.lerp(h, ry - 1.35, Math.pow(carve, 0.8)) + Math.max(0, rd - RIVER_W - 1.6) * 0.0);
    if (rd < 60 && h > ry + 0.2) h = GW.lerp(ry + 0.2, h, ss(RIVER_W + 1.2, RIVER_W + 9, rd));   // banks slope down to the water
    if (pd < 2.2) h -= 0.06 * (1 - pd / 2.2);
    let g = 0.95;
    g *= ss(RIVER_W - 0.15, RIVER_W + 0.25, rd);
    g *= GW.lerp(pk === 2 ? 0.04 : pk === 1 ? 0.14 : 0.32, 1, ss(0.6, 2.4, pd));
    g *= GW.lerp(0.6, 1, ss(6, 14, Math.hypot(x - L.village.x, z - L.village.z)));
    g *= GW.lerp(0.35, 1, ss(10, 18, Math.hypot(x - L.arena.x, z - L.arena.z)));
    g *= 0.88 + 0.12 * Math.sin(x * 0.21) * Math.sin(z * 0.17);
    g *= GW.lerp(1, 0.6, bw[0]) * GW.lerp(1, 0.75, bw[1]) * GW.lerp(1, 0.55, bw[2]) * GW.lerp(1, 0.25, bw[3]);   // frost, high, ash, salt: sparser
    for (const k of ['hearth', 'cinder', 'abbey', 'high', 'salt', 'mire', 'dusk']) g *= GW.lerp(0.5, 1, ss(10, 22, Math.hypot(x - L[k].x, z - L[k].z)));
    if (Math.hypot(x - L.frostLake.x, z - L.frostLake.z) < 72) g = 0;
    for (const b of (W.burns || [])) if (Math.hypot(x - b[0], z - b[1]) < b[2]) g = -2;
    out.h = h; out.g = GW.clamp(g, -2, 1); out.rd = rd; out.ry = ry; out.pd = pd; out.pk = pk; out.bw = bw;
    return out;
  }
  // footpaths: a worn trail from a find to the nearest road, if one passes within 380 m and no river is in the way (made on demand, then kept)
  const FOOT_TYPES = { camp: 1, ruin: 1, cave: 1, shrine: 1, waystone: 1, vista: 1, wanderer: 1, puzzle: 1, elite: 1 };
  const footCache = new Map(), FIDX = new Map();
  function footFor(p) {
    if (footCache.has(p.id)) return footCache.get(p.id);
    let path = null;
    if (FOOT_TYPES[p.type] && !p.vale) {
      const segs = segsNear(PIDX, p.x - 380, p.z - 380, p.x + 380, p.z + 380); let bd = 380, bp = null;
      for (const sg of segs) { if (sg.k === 0) continue; let t = ((p.x - sg.ax) * sg.dx + (p.z - sg.az) * sg.dz) / sg.l2; t = t < 0 ? 0 : t > 1 ? 1 : t; const qx = sg.ax + sg.dx * t, qz = sg.az + sg.dz * t, d = Math.hypot(qx - p.x, qz - p.z); if (d < bd) { bd = d; bp = [qx, qz]; } }
      if (bp && bd > 30) {
        const dx = (bp[0] - p.x) / bd, dz = (bp[1] - p.z) / bd, bend = (hsh(p.x * 0.01, p.z * 0.01) - 0.5) * 0.35 * bd;
        const a = [p.x + dx * 9, p.z + dz * 9], m = [p.x + dx * bd * 0.5 - dz * bend, p.z + dz * bd * 0.5 + dx * bend];
        const pts = catmull([a, m, bp], 6);
        let wet = false; for (const q of pts) if (nearest(segsNear(RIDX, q[0] - 1, q[1] - 1, q[0] + 1, q[1] + 1), q[0], q[1], 60)[0] < RIVER_W + 2) { wet = true; break; }
        if (!wet) path = pts;
      }
    }
    footCache.set(p.id, path);
    if (path) for (let s = 0; s < path.length - 1; s++) {
      const a = path[s], b = path[s + 1], seg = { ax: a[0], az: a[1], dx: b[0] - a[0], dz: b[1] - a[1], ya: 0, yb: 0, wo: -0.3, k: 0 }; seg.l2 = seg.dx * seg.dx + seg.dz * seg.dz || 1e-6;
      const i0 = Math.floor((Math.min(a[0], b[0]) - 32) / SEGC), i1 = Math.floor((Math.max(a[0], b[0]) + 32) / SEGC), j0 = Math.floor((Math.min(a[1], b[1]) - 32) / SEGC), j1 = Math.floor((Math.max(a[1], b[1]) + 32) / SEGC);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = i * 4096 + j; let l = FIDX.get(k); if (!l) FIDX.set(k, l = []); l.push(seg); }
    }
    return path;
  }
  function footSegs(x0, z0, x1, z1) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (Math.hypot(cx, cz) < 600) return EMPTY;
    for (const p of W.poisNear(cx, cz, 480)) footFor(p);
    return segsNear(FIDX, x0, z0, x1, z1);
  }
  const dcache = new Map(); let _lk = null, _lc = null;
  function computeChunk(ci, cj) {
    const n = DN * DN, c = { K: new Uint8Array(n), H: new Float32Array(n), G: new Float32Array(n), R: new Float32Array(n), P: new Float32Array(n), RY: new Float32Array(n), B: new Uint8Array(n * 6) };
    const x0 = ci * DCH, z0 = cj * DCH;
    const rs = segsNear(RIDX, x0 - 64, z0 - 64, x0 + DCH + 64, z0 + DCH + 64), ps = segsNear(PIDX, x0 - 32, z0 - 32, x0 + DCH + 32, z0 + DCH + 32);
    const f = { fsegs: footSegs(x0 - 32, z0 - 32, x0 + DCH + 32, z0 + DCH + 32) };
    for (let j = 0; j < DN; j++) for (let i = 0; i < DN; i++) {
      fieldsAt(x0 + (i + 0.5) * CELLM, z0 + (j + 0.5) * CELLM, rs, ps, f);
      const k = j * DN + i; c.H[k] = f.h; c.G[k] = f.g; c.R[k] = f.rd; c.P[k] = f.pd; c.RY[k] = f.ry; c.K[k] = f.pk;
      for (let b = 0; b < 6; b++) c.B[k * 6 + b] = Math.round(f.bw[b] * 255);
    }
    return c;
  }
  function chunkAt(ci, cj) {
    const key = ci * 4096 + cj; if (key === _lk) return _lc;
    let c = dcache.get(key);
    if (!c) { c = computeChunk(ci, cj); dcache.set(key, c); if (dcache.size > 420) { const old = dcache.keys().next().value; dcache.delete(old); } }
    _lk = key; _lc = c; return c;
  }
  function tex(field, i, j) {
    const ci = Math.floor(i / DN), cj = Math.floor(j / DN), c = chunkAt(ci, cj);
    return c[field][(j - cj * DN) * DN + (i - ci * DN)];
  }
  function sample(field, x, z) {
    const fx = x / CELLM - 0.5, fz = z / CELLM - 0.5, i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    return GW.lerp(GW.lerp(tex(field, i, j), tex(field, i + 1, j), tx), GW.lerp(tex(field, i, j + 1), tex(field, i + 1, j + 1), tx), tz);
  }
  function biomeSample(x, z) {
    const i = Math.round(x / CELLM - 0.5), j = Math.round(z / CELLM - 0.5), ci = Math.floor(i / DN), cj = Math.floor(j / DN), c = chunkAt(ci, cj), k = ((j - cj * DN) * DN + (i - ci * DN)) * 6;
    return [c.B[k] / 255, c.B[k + 1] / 255, c.B[k + 2] / 255, c.B[k + 3] / 255, c.B[k + 4] / 255, c.B[k + 5] / 255];
  }
  // compute one missing data chunk near the hero per frame, so re-centring the window never stalls
  function prefetch(px, pz) {
    const R = WIN / 2 + 320, ci0 = Math.floor(px / DCH), cj0 = Math.floor(pz / DCH), n = Math.ceil(R / DCH);
    let best = null, bd = 1e9;
    for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
      const ci = ci0 + di, cj = cj0 + dj; if (dcache.has(ci * 4096 + cj)) continue;
      const d = Math.hypot((ci + 0.5) * DCH - px, (cj + 0.5) * DCH - pz); if (d < R && d < bd) { bd = d; best = [ci, cj]; }
    }
    if (best) chunkAt(best[0], best[1]);
  }
  // burns change grass: drop the cached chunks under them so they are recomputed
  function invalidate(x, z, r) { for (let ci = Math.floor((x - r) / DCH); ci <= Math.floor((x + r) / DCH); ci++) for (let cj = Math.floor((z - r) / DCH); cj <= Math.floor((z + r) / DCH); cj++) dcache.delete(ci * 4096 + cj); _lk = null; }

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
    SIZE, L, ZONES, WATER_Y, BIOMES, HUBS,
    colliders: [], grid: new Map(), interact: [], spawns: [], flames: [], fires: [], occluders: [], lights: null, fireflies: null,
  };
  W.heightAt = (x, z) => x > 9000 ? 0 : sample('H', x, z);
  W.riverAt = (x, z) => sample('R', x, z);
  W.waterYAt = (x, z) => sample('RY', x, z);
  W.biomeAt = (x, z) => { if (x > 9000) return { vale: 1, frost: 0, high: 0, ash: 0, salt: 0, mire: 0, dusk: 0 }; const b = biomeSample(x, z), o = { vale: 1 }; BIOMES.forEach((n, k) => { o[n] = b[k]; o.vale -= b[k]; }); return o; };
  W.regionAt = (x, z) => { if (x > 9000) return 'vale'; const b = biomeSample(x, z); let best = 'vale', bv = 0.5; b.forEach((v, k) => { if (v > bv) { bv = v; best = BIOMES[k]; } }); return best; };
  W.REGIONS = REGIONS; W.CORE = CORE;
  W.pathAt = (x, z) => x > 9000 ? 99 : sample('P', x, z);
  W.inWater = (x, z) => x < 9000 && sample('R', x, z) < RIVER_W - 0.6 && !W.onBridge(x, z);
  W.onBridge = (x, z) => {
    if (bridgeAt(x, z)) return true;
    const b = W.bridge; if (!b) return false;
    const dx = x - b.x, dz = z - b.z;
    const u = dx * b.c + dz * b.s, v = -dx * b.s + dz * b.c;
    return Math.abs(u) < 1.6 && Math.abs(v) < b.len / 2;
  };
  W.groundY = (x, z) => { const q = bridgeAt(x, z); if (q) return Math.max(W.heightAt(x, z), bridgeDeckY(q.b, q.along)); return W.onBridge(x, z) ? Math.max(W.heightAt(x, z), 0.35) : W.heightAt(x, z); };
  W.riverDist = (x, z) => x > 9000 ? 99 : nearest(segsNear(RIDX, x - 1, z - 1, x + 1, z + 1), x, z, 60)[0];
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
      const k = i * 4096 + j; let a = W.grid.get(k); if (!a) W.grid.set(k, a = []); a.push(c);
    }
    return c;
  };
  W.removeCollider = function (c) {
    const i0 = Math.floor((c.x - c.r) / CELL), i1 = Math.floor((c.x + c.r) / CELL), j0 = Math.floor((c.z - c.r) / CELL), j1 = Math.floor((c.z + c.r) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = W.grid.get(i * 4096 + j); if (a) { const k = a.indexOf(c); if (k >= 0) a.splice(k, 1); } }
    const k = W.colliders.indexOf(c); if (k >= 0) W.colliders.splice(k, 1);
  };
  // push a circle out of colliders; returns true if touched
  W.collide = function (p, r, lv) {
    lv = lv || 0;
    let hit = false;
    const i = Math.floor(p.x / CELL), j = Math.floor(p.z / CELL);
    for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) {
      const arr = W.grid.get(a * 4096 + b); if (!arr) continue;
      for (const c of arr) {
        if (c.lv !== undefined && c.lv !== lv) continue;
        const dx = p.x - c.x, dz = p.z - c.z, rr = r + c.r, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), k = (rr - d) / d; p.x += dx * k; p.z += dz * k; hit = true; }
      }
    }
    const lim = HALF - 120;   // the mountains at the world's edge
    if (p.x > 9000) return hit;   // inside a dungeon level
    if (Math.abs(p.x) > lim) { p.x = Math.sign(p.x) * lim; hit = true; }
    if (Math.abs(p.z) > lim) { p.z = Math.sign(p.z) * lim; hit = true; }
    return hit;
  };
  W.blocked = function (x, z, r) {
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) {
      const arr = W.grid.get(a * 4096 + b); if (!arr) continue;
      for (const c of arr) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (r + c.r) ** 2) return true;
    }
    return false;
  };

  W.build = function (scene, opts) {
    W.scene = scene;
    W.lights = new GW.Lights();
    const rnd = GW.rand(1337);
    const batch = new Batch();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const place = (x, y, z, ry, sx, sy, sz) => { q.setFromAxisAngle(up, ry); m4.compose(v3.set(x, y, z), q, s3.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz)); return m4; };
    _kitBatch = batch; _kitPlace = place; _kitRnd = rnd;

    // ---- GPU data window: 1 km around the hero (height/grass/river/path + region weights), re-centred as you travel ----
    const half = new Uint16Array(WN * WN * 4), bio1 = new Uint8Array(WN * WN * 4), bio2 = new Uint8Array(WN * WN * 4);
    const tMap = new THREE.DataTexture(half, WN, WN, THREE.RGBAFormat, THREE.HalfFloatType);
    const tBio = new THREE.DataTexture(bio1, WN, WN, THREE.RGBAFormat, THREE.UnsignedByteType), tBio2 = new THREE.DataTexture(bio2, WN, WN, THREE.RGBAFormat, THREE.UnsignedByteType);
    [tMap, tBio, tBio2].forEach(t => { t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; });
    W.tMap = tMap; GW.LU.uHeightMap.value = tMap; GW.LU.uWorldSize.value = 1; GW.LU.uBiomeMap.value = tBio; GW.LU.uBiomeMap2.value = tBio2;
    const toH = THREE.DataUtils.toHalfFloat;
    W.dataWindow = function (px, pz, force) {
      const cx = Math.round(px / DCH) * DCH, cz = Math.round(pz / DCH) * DCH;
      if (!force && W._dc && Math.abs(px - W._dc[0]) < 192 && Math.abs(pz - W._dc[1]) < 192) return;
      W._dc = [cx, cz];
      const i0 = (cx - WIN / 2) / CELLM, j0 = (cz - WIN / 2) / CELLM;
      for (let j = 0; j < WN; j++) for (let i = 0; i < WN; i++) {
        const gi = i0 + i, gj = j0 + j, ci = Math.floor(gi / DN), cj = Math.floor(gj / DN), c = chunkAt(ci, cj), k = (gj - cj * DN) * DN + (gi - ci * DN), o = (j * WN + i) * 4;
        half[o] = toH(c.H[k]); half[o + 1] = toH(c.G[k]); half[o + 2] = toH(Math.min(c.R[k], 60)); half[o + 3] = toH(Math.min(c.P[k], 30));
        // bio1 = (ash, frost, salt, high)  bio2 = (mire, dusk)
        bio1[o] = c.B[k * 6 + 2]; bio1[o + 1] = c.B[k * 6]; bio1[o + 2] = c.B[k * 6 + 3]; bio1[o + 3] = c.B[k * 6 + 1];
        bio2[o] = c.B[k * 6 + 4]; bio2[o + 1] = c.B[k * 6 + 5]; bio2[o + 3] = 255;
      }
      tMap.needsUpdate = tBio.needsUpdate = tBio2.needsUpdate = true;
      GW.LU.uMapC.value.set(cx, cz);
      W.localMap = null;   // rebuilt on demand for the minimap
    };
    W.dataWindow(L.start.x, L.start.z, true);
    // scorch the ground: grass gone (density < 0 marks burnt), terrain turns to ash-dirt
    W.burn = function (x, z, r) {
      (W.burns = W.burns || []).push([x, z, r]);
      invalidate(x, z, r + 2);
      W.dataWindow(W._dc[0], W._dc[1], true);
      W.terrainRefresh(true);
    };
    // minimap source: the data window drawn as a 512 px picture (2 m per pixel)
    W.getLocalMap = function () {
      if (W.localMap) return W.localMap;
      const cv = document.createElement('canvas'); cv.width = cv.height = WN; const g = cv.getContext('2d'), img = g.createImageData(WN, WN), d = img.data;
      const x0 = W._dc[0] - WIN / 2, z0 = W._dc[1] - WIN / 2;
      const bb = [0, 0, 0, 0, 0, 0], gi0 = x0 / CELLM, gj0 = z0 / CELLM;
      for (let j = 0; j < WN; j++) for (let i = 0; i < WN; i++) {
        const x = x0 + (i + 0.5) * CELLM, z = z0 + (j + 0.5) * CELLM, o = (j * WN + i) * 4;
        const gi = gi0 + i, gj = gj0 + j, ci = Math.floor(gi / DN), cj = Math.floor(gj / DN), ch = chunkAt(ci, cj), k = (gj - cj * DN) * DN + (gi - ci * DN);
        for (let q = 0; q < 6; q++) bb[q] = ch.B[k * 6 + q] / 255;
        const rd = ch.R[k], pd = ch.P[k];
        let c = mapColour(bb, rd, pd, x, z, ch.H[k]);
        if (((i * 7 + j * 13) % 3) !== 0 && rd >= RIVER_W && pd >= 1.8) c = c.map(v => v * 0.55);
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      return (W.localMap = { canvas: cv, x0, z0, mpp: CELLM });
    };

    // ---- terrain: a 640 m window of 2 m quads that follows you (re-centred on a 32 m grid, so vertices stay put) ----
    const TSPAN = 640, TSEG = 320, tg = new THREE.PlaneGeometry(TSPAN, TSPAN, TSEG, TSEG); tg.rotateX(-Math.PI / 2);
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(tg.attributes.position.count * 3), 3));
    const gridXZ = Float32Array.from({ length: tg.attributes.position.count * 2 }, (_, k) => k % 2 ? tg.attributes.position.getZ(k >> 1) : tg.attributes.position.getX(k >> 1));
    const terrain = new THREE.Mesh(tg, GW.mat({ id: ID.GROUND, vertexColors: true, color: 0xffffff, farGrass: 30 }));
    W.terrainMat = terrain.material; W.terrain = terrain;
    terrain.frustumCulled = false; terrain.layers.set(1); terrain.renderOrder = -6; scene.add(terrain);
    const BIO_GROUND = [[0.42, 0.47, 0.55], [0.12, 0.14, 0.12], [0.11, 0.095, 0.085], [0.36, 0.32, 0.24], [0.06, 0.07, 0.04], [0.03, 0.06, 0.06]];
    // ground colour from one data texel (the terrain vertices sit exactly on texel centres)
    const bwT = [0, 0, 0, 0, 0, 0];
    const groundColT = (ch, k, x, z) => {
      const rd = ch.R[k], pd = ch.P[k], g = ch.G[k];
      for (let q = 0; q < 6; q++) bwT[q] = ch.B[k * 6 + q] / 255;
      const n = 0.8 + 0.4 * Math.sin(x * 0.7) * Math.sin(z * 0.9);
      let c0 = 0.07 * n, c1 = 0.12 * n, c2 = 0.065 * n;
      const pf = 1 - ss(0.8, 2.6, pd), dm = Math.max(pf, (1 - Math.max(0, g)) * 0.6), kd = ch.K ? ch.K[k] : 0;
      if (kd === 2 && pf > 0.05) {   // the King's roads: grey cobbles
        const cb = 0.78 + 0.22 * ((Math.floor(x * 1.3) + Math.floor(z * 1.3)) & 1) * (0.7 + 0.3 * Math.sin(x * 3.1 + z * 2.3));
        c0 = GW.lerp(c0, 0.46 * cb, pf); c1 = GW.lerp(c1, 0.44 * cb, pf); c2 = GW.lerp(c2, 0.41 * cb, pf);
      } else { const t = kd === 1 ? [0.42, 0.33, 0.22] : [0.36, 0.29, 0.19], k2 = pf > 0.05 ? pf : dm; c0 = GW.lerp(c0, t[0], k2); c1 = GW.lerp(c1, t[1], k2); c2 = GW.lerp(c2, t[2], k2); }
      for (let q = 0; q < 6; q++) if (bwT[q] > 0.01) { const w = bwT[q] * (1 - pf * 0.5), B = BIO_GROUND[q]; c0 = GW.lerp(c0, B[0] * n, w); c1 = GW.lerp(c1, B[1] * n, w); c2 = GW.lerp(c2, B[2] * n, w); }
      if (g < -1) { c0 = 0.085; c1 = 0.06; c2 = 0.045; }
      if (Math.abs(x - L.frostLake.x) < 80 && Math.hypot(x - L.frostLake.x, z - L.frostLake.z) < 74) { c0 = 0.32; c1 = 0.42; c2 = 0.52; }
      const bfr = 1 - ss(RIVER_W - 0.5, RIVER_W + 0.8, rd);
      _gc[0] = GW.lerp(c0, 0.06, bfr); _gc[1] = GW.lerp(c1, 0.08, bfr); _gc[2] = GW.lerp(c2, 0.11, bfr); return _gc;
    };
    const _gc = [0, 0, 0];
    W.terrainRefresh = function (force, px, pz) {
      const cx = px === undefined ? (W._tc || [0, 0])[0] : Math.round(px / 32) * 32, cz = pz === undefined ? (W._tc || [0, 0])[1] : Math.round(pz / 32) * 32;
      if (!force && W._tc && W._tc[0] === cx && W._tc[1] === cz) return;
      W._tc = [cx, cz];
      const pos = tg.attributes.position, col = tg.attributes.color;
      for (let i = 0; i < pos.count; i++) {
        const x = gridXZ[i * 2] + cx + 1, z = gridXZ[i * 2 + 1] + cz + 1;   // +1 m: on a texel centre
        const gi = (x - 1) / CELLM, gj = (z - 1) / CELLM, ci = Math.floor(gi / DN), cj = Math.floor(gj / DN), ch = chunkAt(ci, cj), k = (gj - cj * DN) * DN + (gi - ci * DN);
        pos.setXYZ(i, x, ch.H[k], z);
        const c = groundColT(ch, k, x, z); col.setXYZ(i, c[0], c[1], c[2]);
      }
      // normals straight from the height grid (much faster than computeVertexNormals on 200k triangles)
      const nrm = tg.attributes.normal, V = TSEG + 1, pa = pos.array, na = nrm.array;
      for (let r = 0; r < V; r++) for (let q = 0; q < V; q++) {
        const i = r * V + q, l = r * V + Math.max(0, q - 1), rr = r * V + Math.min(V - 1, q + 1), u = Math.max(0, r - 1) * V + q, d = Math.min(V - 1, r + 1) * V + q;
        const dx = (pa[rr * 3 + 1] - pa[l * 3 + 1]) / (pa[rr * 3] - pa[l * 3] || 1), dz = (pa[d * 3 + 1] - pa[u * 3 + 1]) / (pa[d * 3 + 2] - pa[u * 3 + 2] || 1);
        const il = 1 / Math.sqrt(dx * dx + 1 + dz * dz); na[i * 3] = -dx * il; na[i * 3 + 1] = il; na[i * 3 + 2] = -dz * il;
      }
      pos.needsUpdate = true; col.needsUpdate = true; nrm.needsUpdate = true;
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
      const wood = GW.mat({ id: ID.PLANKS, tex: 2, color: 0x7a5a3e, fill: 0.1 });
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
      const valeOn = (x, z) => {
        const dx = x - W.bridge.x, dz = z - W.bridge.z;
        const along = dx * bc + dz * bs, across = -dx * bs + dz * bc;
        return Math.abs(across) < 1.5 && Math.abs(along) < 6.2;
      };
      W.onBridge = (x, z) => valeOn(x, z) || !!bridgeAt(x, z);
      W.groundY = (x, z) => {
        const q = bridgeAt(x, z); if (q) return Math.max(W.heightAt(x, z), bridgeDeckY(q.b, q.along));
        if (!valeOn(x, z)) return W.heightAt(x, z);
        const dx = x - W.bridge.x, dz = z - W.bridge.z, along = (dx * bc + dz * bs) / 0.62;
        return Math.max(W.heightAt(x, z), 0.4 + 0.35 * (1 - Math.min(1, (along / 9) ** 2)));
      };
    }

    // ---- bridges over the other rivers: stone on the King's roads, timber elsewhere ----
    {
      const wood = GW.mat({ id: ID.PLANKS, tex: 2, color: 0x7a5a3e, fill: 0.1 }), stone = GW.mat({ id: ID.MASONRY, tex: 8, color: 0x8a8a8e, fill: 0.08 }), stoneD = GW.mat({ id: ID.MASONRY, tex: 8, color: 0x606064, fill: 0.06 });
      for (const b of BRIDGES) {
        const grp = new THREE.Group(); grp.position.set(b.x, 0, b.z); grp.rotation.y = Math.atan2(b.dx, b.dz);
        const n = Math.ceil(b.len / 0.62), w = b.half * 2;
        if (b.kind === 2) {
          for (let k = 0; k < n; k++) { const al = -b.len / 2 + (k + 0.5) * b.len / n, y = bridgeDeckY(b, al);
            const sl = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, b.len / n + 0.05), stone); sl.position.set(0, y - 0.25, al); grp.add(sl);
            for (const sd of [-1, 1]) { const pa = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, b.len / n + 0.05), stoneD); pa.position.set(sd * (b.half - 0.2), y + 0.35, al); grp.add(pa); } }
          for (const sd of [-1, 1]) { const pier = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 2.2, 1.2), stoneD); pier.position.set(0, b.y - 0.2, sd * b.len * 0.22); grp.add(pier); }
        } else {
          for (let k = 0; k < n; k++) { const al = -b.len / 2 + (k + 0.5) * b.len / n, y = bridgeDeckY(b, al);
            const pl = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.5), wood); pl.position.set(0, y - 0.06, al); pl.rotation.y = (rnd() - 0.5) * 0.06; grp.add(pl);
            if (k % 3 === 0) for (const sd of [-1, 1]) { const po = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.1, 0.16), wood); po.position.set(sd * (b.half - 0.1), y + 0.45, al); grp.add(po); } }
          for (const sd of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, b.len), wood); rail.position.set(sd * (b.half - 0.1), bridgeDeckY(b, 0) + 0.95, 0); grp.add(rail); }
          for (const al of [-b.len * 0.25, b.len * 0.25]) for (const sd of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), wood); st.position.set(sd * (b.half - 0.3), b.y - 0.4, al); grp.add(st); }
        }
        scene.add(grp);
      }
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
      const k = ['kit_rock_a', 'kit_rock_b', 'kit_rock_c'][Math.floor(rnd() * 3)], f = flatK || (0.6 + rnd() * 0.35);
      kitAt(k, x, z, s * 0.75, s * 0.75 * f, s * 0.75);
      W.addCollider(x, z, s * 0.85, 'rock');
    };
    const tree = (x, z, s) => kitTree(rnd() < 0.5 ? 'kit_pine_a' : 'kit_pine_b', x, z, s * 0.9);
    const deadTree = (x, z, s) => {
      kitAt('kit_deadtree_' + 'abc'[Math.floor(rnd() * 3)], x, z, s * 0.85, s * 0.85, s * 0.85, undefined, new THREE.Color(0.8, 0.76, 0.72).multiplyScalar(0.85 + rnd() * 0.3));
      W.addCollider(x, z, 0.5 * s, 'tree');
    };
    const pillar = (x, z, h, r) => {   // a broken kit pillar, stretched to the wanted height
      const R2 = r || 1;
      kitAt(h > 2.2 ? 'kit_pillar_a' : 'kit_pillar_b', x, z, 0.75 * R2, Math.max(0.35, h / 2.6), 0.75 * R2, undefined, new THREE.Color().setHSL(0.62, 0.1, 0.62 + rnd() * 0.15));
      W.addCollider(x, z, 0.75 * R2, 'ruin');
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
      for (const q of W.valePois()) if (Math.hypot(x - q.x, z - q.z) < (q.type === 'camp' || q.type === 'elite' || q.type === 'cave' ? 22 : 15) + r) return false;
      for (const k of ['village', 'start', 'arena', 'castle', 'chapel', 'tower', 'lair']) if (Math.hypot(x - L[k].x, z - L[k].z) < (k === 'arena' ? 21 : k === 'castle' ? 20 * BS : k === 'chapel' ? 13 * BS : k === 'tower' ? 8 * BS : k === 'lair' ? 17 : 18) + r) return false;
      return !W.blocked(x, z, r + 0.6);
    };

    // forest ring
    for (let k = 0; k < 1700; k++) {
      const a = rnd() * Math.PI * 2, r = (96 + rnd() * 30) * VS;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (free(x, z, 1)) kitTree(['kit_pine_a', 'kit_pine_b', 'kit_pine_c'][Math.floor(rnd() * 3)], x, z, 0.9 + rnd() * 0.5);
    }
    // scattered trees
    for (let k = 0; k < 560; k++) {
      const x = (rnd() - 0.5) * 190 * VSC, z = (rnd() - 0.5) * 190 * VSC;
      if (Math.hypot(x - L.meadow.x, z - L.meadow.z) < 40) continue;
      if (Math.hypot(x - L.ruins.x, z - L.ruins.z) < 44) continue;
      if (free(x, z, 1)) kitTree(rnd() < 0.5 ? 'kit_oak_a' : 'kit_pine_a', x, z, 0.75 + rnd() * 0.4);
    }
    // wispwood: dead trees + some pines
    for (let k = 0; k < 110; k++) {
      const a = rnd() * 6.28, r = 6 + rnd() * 34, x = L.grove.x + Math.cos(a) * r, z = L.grove.z + Math.sin(a) * r;
      if (free(x, z, 0.8)) { if (rnd() < 0.65) deadTree(x, z, 1 + rnd() * 0.6); else kitTree('kit_pine_c', x, z, 0.8 + rnd() * 0.3); }
    }
    // rocks
    for (let k = 0; k < 600; k++) {
      const x = (rnd() - 0.5) * 210 * VSC, z = (rnd() - 0.5) * 210 * VSC, s = 0.5 + rnd() * rnd() * 2.2;
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
      const RS = 1.7;   // the old scriptorium, at the size of a place worth fighting through
      wallSeg(cx - 14 * RS, cz - 10 * RS, cx + 6 * RS, cz - 13 * RS, 4.0);
      wallSeg(cx - 16 * RS, cz - 6 * RS, cx - 15 * RS, cz + 12 * RS, 3.3);
      wallSeg(cx + 10 * RS, cz + 6 * RS, cx + 12 * RS, cz + 16 * RS, 2.8);
      wallSeg(cx - 8 * RS, cz + 16 * RS, cx + 4 * RS, cz + 17 * RS, 2.3);
      wallSeg(cx + 14 * RS, cz - 8 * RS, cx + 16 * RS, cz + 2 * RS, 3.0);
      for (let k = 0; k < 20; k++) { const a = k / 20 * 6.28, r = (9 + (k % 2) * 1.5) * RS; pillar(cx + Math.cos(a) * r, cz + Math.sin(a) * r, k % 3 === 0 ? 0.8 + rnd() : 2.5 + rnd() * 2.5); }
      for (let k = 0; k < 50; k++) { const x = cx + (rnd() - 0.5) * 34 * RS, z = cz + (rnd() - 0.5) * 34 * RS; if (!W.blocked(x, z, 0.6)) batch.add('box', boxG0, ruinM, place(x, W.heightAt(x, z) - 0.1, z, rnd() * 6, 0.5 + rnd() * 0.9, 0.3 + rnd() * 0.5, 0.5 + rnd() * 0.9)); }
      // ruin campfire (rest point)
      campfire(scene, L.ruinFire.x, L.ruinFire.z, 'Ruin-edge fire');
    }
    // meadow: flowers + moss
    for (let k = 0; k < 800; k++) {
      const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 60, x = L.meadow.x + Math.cos(a) * r, z = L.meadow.z + Math.sin(a) * r;
      if (W.riverAt(x, z) > RIVER_W + 1) flower(x, z);
    }
    for (let k = 0; k < 2600; k++) {
      const x = (rnd() - 0.5) * 220 * VSC, z = (rnd() - 0.5) * 220 * VSC;
      if (Math.hypot(x, z) < 105 * VSC && W.riverAt(x, z) > RIVER_W + 0.5) { flower(x, z); }
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
    for (let k = 0; k < 900; k++) {
      const a = rnd() * Math.PI * 2, r = (92 + rnd() * 30) * VS, x = Math.cos(a) * r, z = Math.sin(a) * r, s = 3.2 + rnd() * 2.2;
      if (free(x, z, 1)) kitTree(['kit_pine_a', 'kit_pine_b', 'kit_pine_c'][Math.floor(rnd() * 3)], x, z, 0.85 + rnd() * 0.45);
    }
    // broadleaf trees: oaks in the open, birches with autumn leaves around the village and the ruins
    for (let k = 0; k < 460; k++) {
      const x = (rnd() - 0.5) * 190 * VSC, z = (rnd() - 0.5) * 190 * VSC, s = 3 + rnd() * 2;
      if (Math.hypot(x - L.meadow.x, z - L.meadow.z) < 40) continue;
      const nearVillage = Math.hypot(x - L.village.x, z - L.village.z) < 45 || Math.hypot(x - L.ruins.x, z - L.ruins.z) < 40;
      if (free(x, z, 1.2)) kitTree(rnd() < 0.55 ? ['kit_oak_a', 'kit_oak_b'][Math.floor(rnd() * 2)] : ['kit_pine_a', 'kit_pine_c'][Math.floor(rnd() * 2)], x, z, 0.8 + rnd() * 0.4);
    }
    // Wispwood: dark trees and faintly glowing mushrooms
    for (let k = 0; k < 70; k++) {
      const a = rnd() * 6.28, r = 5 + rnd() * 36, x = L.grove.x + Math.cos(a) * r, z = L.grove.z + Math.sin(a) * r;
      if (free(x, z, 1)) kitTree('kit_pine_c', x, z, 0.8 + rnd() * 0.4);
    }
    for (let k = 0; k < 140; k++) {
      const a = rnd() * 6.28, r = rnd() * 40, x = L.grove.x + Math.cos(a) * r, z = L.grove.z + Math.sin(a) * r;
      if (free(x, z, 0.2)) for (let m = 0; m < 3; m++) put('mushroom_red', x + (rnd() - 0.5) * 0.8, z + (rnd() - 0.5) * 0.8, 2 + rnd() * 2, { glow: true });
    }
    // logs, stumps, boulders, bushes
    for (let k = 0; k < 260; k++) {
      const x = (rnd() - 0.5) * 200 * VSC, z = (rnd() - 0.5) * 200 * VSC;
      if (!free(x, z, 1.5)) continue;
      const r = rnd();
      if (r < 0.3) put('log', x, z, 2.6 + rnd(), { col: 0.9, tag: 'log' });
      else if (r < 0.55) put('stump', x, z, 3 + rnd() * 1.5, { col: 0.45, tag: 'stump' });
      else if ([L.fire, L.ruinFire, L.meadowFire, L.start, L.village].some(c => Math.hypot(x - c.x, z - c.z) < 26)) continue;   // keep campsites clear of boulders
      else if (r < 0.8) put('rock_tall', x, z, 1.4 + rnd() * 1.4, { col: 0.8, tag: 'rock' });
      else put('rock_large', x, z, 1.8 + rnd() * 1.6, { col: 1.0, tag: 'rock' });
    }
    for (let k = 0; k < 220; k++) {
      const x = (rnd() - 0.5) * 210 * VSC, z = (rnd() - 0.5) * 210 * VSC;
      if (Math.hypot(x, z) < 108 * VSC && Math.hypot(x, z) > 70 * VSC && free(x, z, 0.4)) put('bush_large', x, z, 2 + rnd() * 2);
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
  function kitAt(name, x, z, sx, sy, sz, ry, tint) {
    if (!_kitBatch) return;
    const y = W.heightAt(x, z) - 0.05;
    kitParts(name).forEach((p, i) => _kitBatch.add('kit_' + name + i, p.geo, kitMat(p.mn), _kitPlace(x, y, z, ry === undefined ? _kitRnd() * 6.28 : ry, sx, sy, sz), tint || new THREE.Color(1, 1, 1).multiplyScalar(0.82 + _kitRnd() * 0.3)));
  }
  function kitGroup(name, s, tint) {
    const g = new THREE.Group();
    kitParts(name).forEach(p => { const m = new THREE.Mesh(p.geo, kitMat(p.mn)); m.scale.setScalar(s); g.add(m); });
    return g;
  }
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
    [[-6, -11, 0.2], [9, -4, 1.8], [-12, 7, 1.2], [4, 13, 2.9], [14, 9, 0.8], [-15, -4, 2.4]].forEach(([dx, dz, a]) => put('kit_arch', R.x + dx * 1.7, R.z + dz * 1.7, 1.45, a, 1.6));
    for (let k = 0; k < 18; k++) { const a = rnd() * 6.28, r = 8 + rnd() * 22, x = R.x + Math.cos(a) * r, z = R.z + Math.sin(a) * r; if (!W.blocked(x, z, 0.8)) put(rnd() < 0.5 ? 'kit_pillar_a' : 'kit_pillar_b', x, z, 0.9 + rnd() * 0.3, rnd() * 6.28, 0.6); }
    // the tombs around the old scriptorium: three crypts that go underground; the Scribe's holds the quest's seal
    W.tombs = [];
    [[-46, -22, 'THE NAMELESS TOMB', 1, false], [-52, 24, "THE SCRIBE'S TOMB", 2, true], [-14, 50, "THE SEXTON'S TOMB", 1, false]].forEach(([dx, dz, name, floors, quest], i) => {
      const x = R.x + dx, z = R.z + dz, ry = Math.atan2(R.x - x, R.z - z), fx = x + Math.sin(ry) * 4.2, fz = z + Math.cos(ry) * 4.2;
      put('kit_crypt', x, z, 1.6, ry, 1.9);
      lantern(fx + Math.cos(ry) * 2.2, fz - Math.sin(ry) * 2.2, ry); lantern(fx - Math.cos(ry) * 2.2, fz + Math.sin(ry) * 2.2, ry + Math.PI);
      const t = { type: 'tomb', id: 'tomb' + i, x: fx, z: fz, r: 2.8, label: 'Descend into ' + name.toLowerCase().replace(/^the /, 'the '), name, floors, quest };
      W.interact.push(t); W.tombs.push(t); if (quest) L.tombQ = { x: fx, z: fz };
    });
    // the Vale's tutorial finds (see VALE_PLAN)
    for (const p of W.valePois()) {
      if (p.type === 'vein') {
        const F = GW.Forge, ore = 'iron_ore', id = 'v:vale', y = W.heightAt(p.x, p.z), g = new THREE.Group(), cm = crystalMat(F.ORES[ore].color);
        put('kit_rock_b', p.x, p.z, 0.85, rnd() * 6.28, 1.1, new THREE.Color(0.8, 0.8, 0.82)); put('kit_rock_c', p.x + 3, p.z - 1.5, 0.6, rnd() * 6.28, 0.8); put('kit_rock_a', p.x - 2.6, p.z + 1.2, 0.5, rnd() * 6.28, 0.6);
        for (let q = 0; q < 6; q++) { const a = q / 6 * Math.PI * 2 + rnd(), r = 0.5 + rnd() * 0.9, m = new THREE.Mesh(CRYSTAL_G, cm);
          m.position.set(p.x + Math.cos(a) * r, y + 0.6 + rnd() * 0.9, p.z + Math.sin(a) * r); m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); m.scale.set(0.8 + rnd() * 0.6, 1.3 + rnd() * 1.2, 0.8 + rnd() * 0.6); g.add(m); }
        scene.add(g); W.interact.push({ type: 'vein', id, ore, x: p.x, z: p.z, r: 2.8, label: 'Mine the ' + F.ORES[ore].name.toLowerCase(), crystals: g, lvl: 1 });
        continue;
      }
      const inter = []; buildPOI(p, (n, x, z, s, col, bio, tint) => put(n, x, z, s, rnd() * 6.28, col, tint), [], inter); inter.forEach(it => W.interact.push(it));
    }
    // the quiet graves: crypt, rows of graves, shrine, dead trees, lanterns, fence
    const GX = -36 * VS, GZ = 64 * VS;
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
    for (let k = 0; k < 80; k++) { const x = (rnd() - 0.5) * 200 * VSC, z = (rnd() - 0.5) * 200 * VSC; if (Math.hypot(x, z) < 100 * VSC && free(x, z, 1.2)) put(trees[k % 3], x, z, 0.8 + rnd() * 0.5, rnd() * 6.28, 0.4); }
    // the Widow's hollow: a ring of dead trees strung with glowing webs
    { const C = L.lair, anchors = [];
      for (let k = 0; k < 9; k++) {
        const a = k / 9 * Math.PI * 2 + 0.2, r = 14 + rnd() * 3, x = C.x + Math.cos(a) * r, z = C.z + Math.sin(a) * r;
        put(trees[k % 3], x, z, 1.2 + rnd() * 0.4, rnd() * 6.28, 0.5); anchors.push([x, W.heightAt(x, z), z]);
      }
      W.lairWebs = buildWebs(scene, C, anchors, rnd);
    }
    // ---- villages: huts in a ring, well, lanterns, carts and fence, tinted per region ----
    const HUT_TINT = { vale: [1, 1, 1], frost: [0.95, 1.0, 1.1], high: [0.85, 0.9, 0.85], ash: [0.75, 0.62, 0.55], salt: [1.15, 1.08, 0.95], mire: [0.6, 0.65, 0.5], dusk: [0.55, 0.65, 0.75] };
    for (const h of HUBS) {
      const V = L[h.at], t = HUT_TINT[h.id], tint = () => new THREE.Color(t[0], t[1], t[2]).multiplyScalar(0.88 + rnd() * 0.24);
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2 + 0.3, r = 15 + (k % 2) * 4; if (Math.abs(GW.angDiff(a, -Math.PI * 0.75)) < 0.35 || Math.abs(GW.angDiff(a, Math.PI * 0.15)) < 0.3) continue;
        put('kit_hut', V.x + Math.cos(a) * r, V.z + Math.sin(a) * r, 1.2 + rnd() * 0.15, -a - Math.PI / 2, 1.9, tint()); }
      put('kit_well', V.x - 6, V.z + 5, 1.1, 0.4, 1.0);
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
    for (let k = 0; k < 150; k++) { const x = (rnd() - 0.5) * 210 * VSC, z = (rnd() - 0.5) * 210 * VSC, s = 0.4 + rnd() * 0.45; if (Math.hypot(x, z) < 104 * VSC && !nearCamp(x, z) && free(x, z, 1.4)) put(['kit_rock_a', 'kit_rock_b', 'kit_rock_c'][k % 3], x, z, s, rnd() * 6.28, 0.85); }
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
  function buildDunmaer(scene) {
    const g = GW.Assets.gltf.castle; if (!g) return;
    const C = L.dunmaer, base = W.heightAt(C.x, C.z) - 0.05;
    mergeByMat(g, {
      cobble: GW.mat({ id: ID.MASONRY, tex: 8, color: 0x8a8a84, fill: 0.1 }), cobbleDark: GW.mat({ id: ID.MASONRY, tex: 8, color: 0x5e5e5a, fill: 0.08 }),
      moss: GW.mat({ id: ID.MOSS, tex: 5, color: 0x7a8a5a, fill: 0.1 }), wood: GW.mat({ id: ID.PLANKS, tex: 2, color: 0x6a5a44 }),
      woodDark: GW.mat({ id: ID.PLANKS, tex: 2, color: 0x4a3e30 }), void: GW.mat({ id: ID.VOID, color: 0, unlit: true }),
    }, null, C.x, base, C.z, scene, BS);
    const tw = (lx, ly) => [C.x + lx * BS, C.z - ly * BS], R = 11;
    const seg = (x0, y0, x1, y1, r, skip) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (r * 1.1)));
      for (let i = 0; i <= n; i++) { const t = i / n, lx = x0 + (x1 - x0) * t, ly = y0 + (y1 - y0) * t; if (skip && skip(lx, ly)) continue; W.addCollider(...tw(lx, ly), r * BS, 'castle'); } };
    seg(-R, -R, R, -R, 0.7, lx => Math.abs(lx) < 1.6); seg(-R, -R, -R, R, 0.7); seg(-R, R, R, R, 0.7); seg(R, -R, R, R, 0.7);
    [[-R, -R], [R, -R], [-R, R], [R, R]].forEach(([lx, ly]) => W.addCollider(...tw(lx, ly), 2.7 * BS, 'castle'));
    seg(-6, 2, 6, 2, 0.55); seg(-6, 2, -6, 10, 0.55); seg(-6, 10, 6, 10, 0.55); seg(6, 2, 6, 10, 0.55);   // the keep: entered through its door
    W.interact.push({ type: 'castle', x: C.x, z: C.z - 1.2 * BS, r: 2.8, label: 'Enter Castle Dunmaer' });
    campfire(scene, C.x - 8, C.z + 24, 'Dunmaer Gate');
  }
  function buildHubs(scene) {
    buildDunmaer(scene);
    for (const h of HUBS) {
      const c = L[h.at]; campfire(scene, c.x, c.z, h.name);
      // a smith's anvil in every village
      anvil(scene, c.x + 7, c.z + 6);
    }
    // Cinder Watch: the watchtower model, charred, with fires
    const tg = GW.Assets.gltf.tower;
    if (tg) {
      const C = L.cinder, base = W.heightAt(C.x, C.z) - 0.05;
      mergeByMat(tg, {
        cobble: GW.mat({ id: ID.MASONRY, tex: 8, color: 0x6a625c, fill: 0.08 }), cobbleDark: GW.mat({ id: ID.MASONRY, tex: 8, color: 0x3a3532, fill: 0.06 }),
        moss: GW.mat({ id: ID.FIRE, color: 0, emissive: 0x7a2a08, unlit: true }), wood: GW.mat({ id: ID.PLANKS, tex: 2, color: 0x3a2a20 }),
        woodDark: GW.mat({ id: ID.PLANKS, tex: 2, color: 0x2a2018 }), iron: GW.mat({ id: ID.METAL, color: 0x4a4e58, rim: 0.35 }),
        gold: GW.mat({ id: ID.RUNE, color: 0, emissive: 0xd8a040, unlit: true }), void: GW.mat({ id: ID.VOID, color: 0, unlit: true }),
      }, null, C.x, base, C.z, scene, BS);
      W.addCollider(C.x, C.z, 3.6 * BS, 'tower');
      campfire(scene, C.x - 11, C.z + 4, 'Cinder Watch');
      torch(scene, C.x - 2.2 * BS, C.z + 4.2 * BS, 2.4); torch(scene, C.x + 2.2 * BS, C.z + 4.2 * BS, 2.4);
    }
    // Rimeglass Abbey: the chapel model in frost-pale stone, by the frozen mere
    const cg = GW.Assets.gltf.chapel;
    if (cg) {
      const A = L.abbey, base = W.heightAt(A.x, A.z) - 0.05;
      mergeByMat(cg, {
        cobble: GW.mat({ id: ID.MASONRY, tex: 8, color: 0xa8b4c4, fill: 0.14 }), cobbleDark: GW.mat({ id: ID.MASONRY, tex: 8, color: 0x6a7686, fill: 0.08 }),
        moss: GW.mat({ id: ID.MOSS, tex: 5, color: 0xc8d8e8, fill: 0.12 }), iron: GW.mat({ id: ID.METAL, color: 0x4a4e58, rim: 0.35 }),
      }, null, A.x, base, A.z, scene, BS);
      const tw = (lx, ly) => [A.x + lx * BS, A.z - ly * BS];
      const seg = (x0, y0, x1, y1, r) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (r * 1.1)));
        for (let i = 0; i <= n; i++) { const t = i / n; W.addCollider(...tw(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t), r * BS, 'chapel'); } };
      seg(-6.3, 0.55, -1.6, 0.55, 0.6); seg(1.6, 0.55, 6.3, 0.55, 0.6);
      [-6.35, -2.1, 2.1, 6.35].forEach(x => W.addCollider(...tw(x, -0.4), 0.55 * BS, 'chapel'));
      seg(-5.45, 1.2, -5.45, 12.6, 0.55); seg(5.45, 1.2, 5.45, 12.6, 0.55); seg(-5.45, 12.65, 5.45, 12.65, 0.55);
      campfire(scene, A.x - 16, A.z + 14, 'Rimeglass Abbey');
    }
    // the frozen mere: a sheet of dark ice
    { const F = L.frostLake, y = W.heightAt(F.x, F.z) + 0.04;
      const ice = new THREE.Mesh(new THREE.CircleGeometry(73, 64).rotateX(-Math.PI / 2), GW.mat({ id: ID.WATER, color: 0x5a7088, rim: 0.3 }));
      ice.position.set(F.x, y, F.z); ice.layers.set(1); ice.renderOrder = -5.9; scene.add(ice); }
  }

  // ----- the wilderness beyond the Vale: generated per 96 m chunk as you approach, dropped when far -----
  const CHK = 96, chunks = new Map();
  let LOAD_R = 230, DROP_R = 330;
  W.setViewDistance = function (k) { LOAD_R = 230 * k; DROP_R = 330 * k + 40; };
  const BIO_MAT = {
    frost: { needle: 0xb4c4d0, foliage: 0xbcc8d0, bark: 0x5a5550, rock: 0xb8c0cc, stone: 0xb0b8c4 },
    ash: { needle: 0x4a4038, foliage: 0x4a4038, bark: 0x2e2a28, rock: 0x55524f, stone: 0x5a5654 },
    high: { needle: 0x5a7a5a, foliage: 0x6a7a50, rock: 0x8a8e88, stone: 0x8a8e88 },
    salt: { bark: 0x9a8e7a, rock: 0xd0c8b0, stone: 0xd0c8b0 },
    mire: { needle: 0x3a4a2a, foliage: 0x4a5a30, bark: 0x3a3228, rock: 0x4a4a3e },
    dusk: { needle: 0x1e4a50, foliage: 0x2a5560, bark: 0x2a2e30, rock: 0x3a4448 },
  };
  const bioMats = {};
  function kitMatB(mn, bio) {
    const over = BIO_MAT[bio] && BIO_MAT[bio][mn]; if (!over) return kitMat(mn);
    const k = mn + '@' + bio; return bioMats[k] || (bioMats[k] = GW.mat(Object.assign({ side: THREE.DoubleSide }, KIT_MAT[mn], { color: over })));
  }
  const VALE_CLEAR = [['start', 24], ['village', 30], ['meadow', 48], ['ruins', 52], ['arena', 32], ['castle', 40], ['chapel', 28], ['tower', 22], ['lair', 26], ['ruinFire', 14], ['meadowFire', 14]];
  function chunkFree(x, z, r) {
    if (Math.abs(x) < CORE + 4 && Math.abs(z) < CORE + 4) return false;
    if (Math.max(Math.abs(x), Math.abs(z)) > HALF - 200) return false;
    if (sample('R', x, z) < RIVER_W + 1.5 + r || sample('P', x, z) < 3.2 + r) return false;
    for (const c of [L.hearth, L.cinder, L.abbey, L.high, L.salt, L.mire, L.dusk, L.vfrost, L.vash, L.dunmaer]) if (Math.hypot(x - c.x, z - c.z) < 36 + r) return false;
    if (W.poisNear(x, z, 22 + r).length) return false;
    for (const [k, rr] of VALE_CLEAR) if (Math.hypot(x - L[k].x, z - L[k].z) < rr + r) return false;
    for (const a of ARENAS) if (Math.hypot(x - a.x, z - a.z) < 34 + r) return false;
    if (Math.hypot(x - L.frostLake.x, z - L.frostLake.z) < 80 + r) return false;
    return !W.blocked(x, z, r + 0.6);
  }
  // ---------- points of interest: one per 150 m cell (most cells), seeded, typed by region ----------
  const POI_CELL = 75 * WS, poiCache = new Map();
  const POI_W = {
    vale: { puzzle: 0.1, cave: 0.05, camp: 0.15, ruin: 0.14, chest: 0.1, shrine: 0.1, waystone: 0.07, vista: 0.07, wanderer: 0.06, ambush: 0.08, elite: 0.08},
    frost: { puzzle: 0.1, cave: 0.05, camp: 0.19, ruin: 0.12, chest: 0.08, shrine: 0.1, waystone: 0.07, vista: 0.08, wanderer: 0.04, ambush: 0.08, elite: 0.09},
    high: { puzzle: 0.1, cave: 0.06, camp: 0.12, ruin: 0.2, chest: 0.08, shrine: 0.08, waystone: 0.07, vista: 0.12, wanderer: 0.04, ambush: 0.05, elite: 0.08},
    ash: { puzzle: 0.1, cave: 0.05, camp: 0.21, ruin: 0.16, chest: 0.06, shrine: 0.08, waystone: 0.07, vista: 0.06, wanderer: 0.03, ambush: 0.08, elite: 0.1},
    salt: { puzzle: 0.1, cave: 0.05, camp: 0.11, ruin: 0.18, chest: 0.12, shrine: 0.1, waystone: 0.08, vista: 0.08, wanderer: 0.06, ambush: 0.06, elite: 0.06},
    mire: { puzzle: 0.1, cave: 0.05, camp: 0.17, ruin: 0.14, chest: 0.08, shrine: 0.1, waystone: 0.07, vista: 0.05, wanderer: 0.04, ambush: 0.12, elite: 0.08},
    dusk: { puzzle: 0.1, cave: 0.06, camp: 0.14, ruin: 0.16, chest: 0.08, shrine: 0.12, waystone: 0.07, vista: 0.05, wanderer: 0.04, ambush: 0.1, elite: 0.08},
  };
  W.poiAt = function (i, j) {
    const key = i + ',' + j; if (poiCache.has(key)) return poiCache.get(key);
    let p = null;
    const r0 = hsh(i * 3.1 + 0.7, j * 1.7 - 2.3);
    let x = (i + 0.5) * POI_CELL + (hsh(i + 11.3, j - 4.1) - 0.5) * POI_CELL * 0.45, z = (j + 0.5) * POI_CELL + (hsh(i - 7.7, j + 9.9) - 0.5) * POI_CELL * 0.45;
    // steep ground: slide to the flattest spot within 40 m (props on a slope float on one side and sink on the other)
    const hh = (a, b) => rawHeight(a, b, biomeW(a, b)), slopeAt = (a, b) => { const h0 = hh(a, b); let m = 0; for (let k = 0; k < 6; k++) { const t = k / 6 * Math.PI * 2; m = Math.max(m, Math.abs(hh(a + Math.cos(t) * 10, b + Math.sin(t) * 10) - h0)); } return m; };
    let slope = slopeAt(x, z);
    if (slope > 1.9) {
      // neighbours' un-nudged spots: a slid point must not crowd them
      const nb = []; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (di || dj) { const a2 = i + di, b2 = j + dj; nb.push([(a2 + 0.5) * POI_CELL + (hsh(a2 + 11.3, b2 - 4.1) - 0.5) * POI_CELL * 0.45, (b2 + 0.5) * POI_CELL + (hsh(a2 - 7.7, b2 + 9.9) - 0.5) * POI_CELL * 0.45]); }
      const x1 = x, z1 = z;
      for (let k = 0; k < 8; k++) { const t = k / 8 * Math.PI * 2 + hsh(i, j), cx = x1 + Math.cos(t) * 55, cz = z1 + Math.sin(t) * 55;
        if (nb.some(q => Math.hypot(q[0] - cx, q[1] - cz) < 120)) continue;
        const s2 = slopeAt(cx, cz); if (s2 < slope) { slope = s2; x = cx; z = cz; } }
    }
    const ok = r0 < 0.84 && Math.hypot(x, z) > 640 && Math.max(Math.abs(x), Math.abs(z)) < HALF - 350
      && !HUBS.some(h => Math.hypot(x - L[h.at].x, z - L[h.at].z) < 95) && Math.hypot(x - L.cinder.x, z - L.cinder.z) > 60 && Math.hypot(x - L.abbey.x, z - L.abbey.z) > 60
      && Math.hypot(x - L.frostLake.x, z - L.frostLake.z) > 100 && Math.hypot(x - L.dunmaer.x, z - L.dunmaer.z) > 80 && !ARENAS.some(a => Math.hypot(x - a.x, z - a.z) < 140)
      && nearest(segsNear(RIDX, x - 1, z - 1, x + 1, z + 1), x, z, 60)[0] > 18 && nearest(segsNear(PIDX, x - 1, z - 1, x + 1, z + 1), x, z, 30)[0] > 16;   // exact distances: no chunk needs computing   // exact distances: no chunk needs computing
    if (ok) {
      const bwp = biomeW(x, z); let region = 'vale', rbv = 0.5; bwp.forEach((v, q) => { if (v > rbv) { rbv = v; region = BIOMES[q]; } });   // straight from the formula: no data chunk needed
      const w = POI_W[region] || POI_W.vale; let roll = hsh(i * 1.3 + 5.5, j * 2.9 + 1.1), type = 'camp';
      for (const k in w) { if (roll < w[k]) { type = k; break; } roll -= w[k]; }
      if (slope > 2.4 && type !== 'ambush') type = 'vista';   // still a crag after the nudge: make it a lookout
      const lvl = 1 + Math.floor(Math.hypot(x, z) / LVLD);
      p = { id: key, i, j, x, z, type, region, lvl, seed: Math.floor(hsh(i + 0.3, j + 0.9) * 1e6) };
      if (type === 'puzzle') p.pz = ['runes', 'lanterns', 'plates', 'bells'][Math.floor(hsh(i * 2.7 - 1.1, j * 0.9 + 4.4) * 4)];
      if (type === 'vista' && hsh(i + 5.5, j - 3.3) < 0.45) p.cache = true;
    }
    poiCache.set(key, p); return p;
  };
  W.poisNear = function (x, z, r) {
    const out = [];
    for (let i = Math.floor((x - r) / POI_CELL) - 1; i <= Math.floor((x + r) / POI_CELL) + 1; i++) for (let j = Math.floor((z - r) / POI_CELL) - 1; j <= Math.floor((z + r) / POI_CELL) + 1; j++) {
      const p = W.poiAt(i, j); if (p && Math.hypot(p.x - x, p.z - z) < r) out.push(p);
    }
    if (Math.hypot(x, z) < 700 + r) for (const p of W.valePois()) if (p.type !== 'vein' && Math.hypot(p.x - x, p.z - z) < r) out.push(p);
    return out;
  };
  W.POI_CELL = POI_CELL;
  // props + interactables for one point of interest (built with the chunk that contains it)

  // ---------- the Vale as a quiet tutorial: one of everything the world holds, laid along the roads and the river ----------
  // easy finds near Emberhold and the Waking Stone, harder ones (ambush, elite, cave) out toward the Vale's edges.
  // Each spot is nudged to flat, dry ground clear of roads, the river, the hand-made sites and each other.
  const VALE_PLAN = [
    ['shrine', -95, 262], ['waystone', 36, 18], ['chest', 168, 150], ['puzzle', -330, 340, 'runes'], ['vein', -430, 40],
    ['camp', 440, 300], ['puzzle', 290, 350, 'lanterns'], ['vista', 190, 450], ['wanderer', 372, -372], ['ambush', -165, -95],
    ['puzzle', -395, -170, 'plates'], ['puzzle', 175, -135, 'bells'], ['elite', 395, -125], ['cave', -440, -440],
  ];
  let VALE_POIS = null;
  W.valePois = function () {
    if (VALE_POIS) return VALE_POIS;
    VALE_POIS = [];
    const hh = (a, b) => rawHeight(a, b, biomeW(a, b));
    const slope = (a, b) => { const h0 = hh(a, b); let m = 0; for (let k = 0; k < 6; k++) { const t = k / 6 * Math.PI * 2; m = Math.max(m, Math.abs(hh(a + Math.cos(t) * 9, b + Math.sin(t) * 9) - h0)); } return m; };
    const SITE_R = { village: 70, start: 45, ruins: 120, arena: 70, castle: 75, chapel: 55, tower: 50, lair: 60, meadow: 70, grove: 70, bridge: 40, ruinFire: 35, meadowFire: 35 };
    const sites = Object.keys(SITE_R).map(k => [L[k].x, L[k].z, SITE_R[k]]).concat([[-36 * VS, 64 * VS, 45]]);   // + the quiet graves
    const bad = (x, z, minD) => {
      let pen = 0;
      const rv = nearest(segsNear(RIDX, x - 1, z - 1, x + 1, z + 1), x, z, 60)[0], pa = nearest(segsNear(PIDX, x - 1, z - 1, x + 1, z + 1), x, z, 30)[0];
      if (rv < 30) pen += 30 - rv; if (pa < 15) pen += 15 - pa;
      for (const [sx, sz, r] of sites) { const d = Math.hypot(x - sx, z - sz); if (d < r) pen += r - d; }
      for (const q of VALE_POIS) { const d = Math.hypot(x - q.x, z - q.z); if (d < minD) pen += minD - d; }
      const sl = slope(x, z); if (sl > 1.6) pen += (sl - 1.6) * 8;
      if (Math.hypot(x, z) > 560) pen += Math.hypot(x, z) - 560;
      return pen;
    };
    VALE_PLAN.forEach(([type, x0, z0, pz], k) => {
      let best = [x0, z0], bp = bad(x0, z0, 85);
      for (let r = 6; r <= 72 && bp > 0; r += 6) for (let q = 0; q < 12; q++) { const a = q / 12 * Math.PI * 2 + r, x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r, pn = bad(x, z, 85); if (pn < bp) { bp = pn; best = [x, z]; } }
      const p = { id: 'vale' + k, vale: true, x: best[0], z: best[1], type, region: 'vale', lvl: type === 'elite' || type === 'cave' ? 2 : 1, seed: 4100 + k * 977 };
      if (pz) p.pz = pz; if (type === 'vista') p.cache = true;
      VALE_POIS.push(p);
    });
    return VALE_POIS;
  };
  // ---------- puzzles: one shared layout so the world (props) and the game (logic) agree ----------
  W.puzzleLayout = function (p) {
    const R = GW.rand(p.seed + 77), o = { kind: p.pz || (p.cache ? 'dig' : null) };
    if (p.pz === 'runes') { o.vault = { x: p.x, z: p.z - 5.5 }; o.tablet = { x: p.x + 6, z: p.z + 3.5 };
      o.stones = [0, 1, 2, 3].map(k => { const a = k / 4 * Math.PI * 2 + 0.4; return { x: p.x + Math.cos(a) * 7.5, z: p.z + Math.sin(a) * 7.5 }; }); }
    if (p.pz === 'lanterns') { o.vault = { x: p.x, z: p.z + 1.8 };
      o.lanterns = [0, 1, 2].map(k => { const a = k / 3 * Math.PI * 2 + 0.3; return { x: p.x + Math.cos(a) * 7, z: p.z + Math.sin(a) * 7 }; }); }
    if (p.pz === 'plates') { o.vault = { x: p.x, z: p.z - 6.5 }; o.tablet = { x: p.x - 6, z: p.z + 2 };
      o.plates = []; for (let k = 0; k < 9; k++) o.plates.push({ x: p.x + (k % 3 - 1) * 2.4, z: p.z + (Math.floor(k / 3) - 1) * 2.4 }); }
    if (p.pz === 'bells') { o.vault = { x: p.x, z: p.z - 3 }; o.tablet = { x: p.x, z: p.z + 1.5 };
      o.bells = [0, 1, 2, 3].map(k => { const a = k / 4 * Math.PI * 2 + Math.PI / 4; return { x: p.x + Math.cos(a) * 6.5, z: p.z + Math.sin(a) * 6.5 }; }); }
    if (p.cache) { const a = R() * Math.PI * 2, d = 45 + R() * 35; o.dig = { x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d }; }
    return o;
  };
  function buildPOI(p, kit, cols, inter) {
    const R = GW.rand(p.seed + 1), bio = p.region, ring = (n, r, fn) => { for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 + R() * 0.5; fn(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, a); } };
    const chest = (x, z) => { kit('kit_crate', x, z, 0.9, 0.5, bio, new THREE.Color(0.9, 0.7, 0.4)); inter.push({ type: 'chest', x, z, r: 1.8, label: 'Open the chest', id: 'poi:' + p.id, poi: p }); };
    switch (p.type) {
      case 'camp': ring(4, 11, (x, z) => kit('kit_hut', x, z, 1.05, 1.0, bio, new THREE.Color(0.8, 0.72, 0.6))); kit('kit_barrel', p.x + 2, p.z - 1, 1, 0.3, bio); kit('kit_barrel', p.x + 2.8, p.z - 0.2, 1, 0.3, bio); kit('kit_crate', p.x - 2, p.z + 1.5, 1, 0.4, bio); kit('kit_cart', p.x - 4, p.z - 3.5, 1, 1.0, bio); break;
      case 'ruin': ring(6 + Math.floor(R() * 3), 9 + R() * 4, (x, z) => kit(R() < 0.5 ? 'kit_arch' : (R() < 0.5 ? 'kit_pillar_a' : 'kit_pillar_b'), x, z, 1.1 + R() * 0.4, 0.6, bio)); chest(p.x, p.z); break;
      case 'chest': ring(3, 2.4, (x, z) => kit('kit_rock_a', x, z, 0.35 + R() * 0.2, 0.6, bio)); chest(p.x, p.z); break;
      case 'shrine': kit('kit_shrine', p.x, p.z, 1, 0.7, bio); inter.push({ type: 'shrine', x: p.x, z: p.z + 1.6, r: 2.4, label: 'Pray at the shrine', poi: p }); break;
      case 'waystone': kit('kit_pillar_a', p.x, p.z, 1.35, 0.6, bio, new THREE.Color(0.75, 0.85, 1.0)); inter.push({ type: 'waystone', x: p.x, z: p.z + 1.4, r: 2.6, label: 'Touch the waystone', poi: p }); break;
      case 'vista': ring(5, 3, (x, z) => kit('kit_rock_b', x, z, 0.8 + R() * 0.5, 0.8, bio)); kit('kit_pillar_a', p.x, p.z, 1.2, 0.6, bio); inter.push({ type: 'vista', x: p.x, z: p.z + 2, r: 2.6, label: 'Look out over the land', poi: p });
        if (p.cache) { const D = W.puzzleLayout(p).dig;   // a buried cache somewhere in view: three small stones mark it
          for (let k = 0; k < 3; k++) kit('kit_rock_a', D.x + (k - 1) * 0.6, D.z + (k % 2) * 0.5, 0.28, 0, bio);
          inter.push({ type: 'pz', role: 'dig', x: D.x, z: D.z, r: 2.4, label: 'Dig', poi: p }); }
        break;
      case 'puzzle': {
        const Z = W.puzzleLayout(p), tint = new THREE.Color(0.75, 0.82, 1.0);
        const toward = v => { const dx = p.x - v.x, dz = p.z - v.z, L = Math.hypot(dx, dz) || 1, k = Math.min(2.2, L) / L; return { x: v.x + dx * k, z: v.z + dz * k }; };
        const push = (role, at, label, idx) => inter.push({ type: 'pz', role, idx, x: at.x, z: at.z, r: 2.4, label, poi: p });
        if (p.pz === 'runes') { kit('kit_crypt', Z.vault.x, Z.vault.z, 1.3, 1.6, bio); kit('kit_shrine', Z.tablet.x, Z.tablet.z, 0.8, 0.5, bio);
          Z.stones.forEach((st, k) => { kit('kit_pillar_a', st.x, st.z, 0.55, 0.45, bio, tint); push('stone', st, 'Touch the rune stone', k); });
          push('tablet', Z.tablet, 'Read the tablet'); push('vault', toward(Z.vault), 'A sealed vault'); }
        if (p.pz === 'lanterns') { kit('kit_shrine', p.x, p.z, 1.0, 0.6, bio); kit('kit_crate', Z.vault.x, Z.vault.z, 1.0, 0.4, bio, new THREE.Color(0.9, 0.75, 0.45));
          Z.lanterns.forEach((l, k) => { kit('kit_lantern', l.x, l.z, 1.4, 0, bio); push('lantern', l, 'Turn the lantern', k); });
          push('vault', toward(Z.vault), 'A sealed chest'); }
        if (p.pz === 'plates') { kit('kit_crypt', Z.vault.x, Z.vault.z, 1.2, 1.5, bio); kit('kit_grave_obelisk', Z.tablet.x, Z.tablet.z, 1.1, 0.4, bio);
          // the nine slabs themselves are drawn by the game (they light up when pressed)
          push('tablet', Z.tablet, 'Study the worn mosaic'); push('vault', toward(Z.vault), 'A sealed crypt'); }
        if (p.pz === 'bells') { kit('kit_grave_obelisk', Z.tablet.x, Z.tablet.z, 1.2, 0.4, bio, tint); kit('kit_crate', Z.vault.x, Z.vault.z, 1.0, 0.4, bio, new THREE.Color(0.9, 0.75, 0.45));
          Z.bells.forEach((bl, k) => { kit('kit_pillar_b', bl.x, bl.z, 0.5, 0.45, bio); kit('kit_lantern', bl.x, bl.z, 0.9, 0, bio); push('bell', bl, 'Strike the bell', k); });
          push('tablet', Z.tablet, 'Listen to the humming stone'); push('vault', toward(Z.vault), 'A sealed chest'); }
        break;
      }
      case 'wanderer': kit('kit_cart', p.x + 2.5, p.z, 1, 1.0, bio); kit('kit_lantern', p.x - 1.5, p.z + 1, 1, 0.2, bio); inter.push({ type: 'shop', x: p.x, z: p.z + 1, r: 2.6, label: 'Trade with the wanderer', poi: p }); break;
      case 'elite': ring(6, 9, (x, z) => kit('kit_deadtree_' + 'abc'[Math.floor(R() * 3)], x, z, 0.9 + R() * 0.4, 0.4, bio, new THREE.Color(0.6, 0.5, 0.5))); chest(p.x, p.z + 1.5); break;
      case 'cave':     // a rock mound with a black mouth: walk in to go underground
        ring(9, 5.2, (x, z, a) => { if (Math.abs(GW.angDiff(a, Math.PI / 2)) > 0.42) kit('kit_rock_' + 'abc'[Math.floor(R() * 3)], x, z, 1.3 + R() * 0.8, 1.1, bio); });
        kit('kit_rock_b', p.x, p.z - 1.5, 1.8, 1.6, bio);
        kit('kit_arch', p.x, p.z + 4.0, 1.45, 0, bio, new THREE.Color(0.55, 0.52, 0.5));
        inter.push({ type: 'cave', x: p.x, z: p.z + 5.2, r: 3.0, label: 'Enter the cave', poi: p }); break;
      default: break;   // ambush: nothing to see until it is too late
    }
  }
  const CRYSTAL_G = new THREE.OctahedronGeometry(0.22, 0), crystalMats = {};
  const crystalMat = c => crystalMats[c] || (crystalMats[c] = GW.mat({ id: ID.RUNE, color: 0, emissive: c, unlit: true }));
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
    const x0 = ci * CHK, z0 = cj * CHK, inter = [];
    // points of interest whose centre lies in this chunk
    for (const p of W.poisNear(x0 + CHK / 2, z0 + CHK / 2, CHK)) if (!p.vale && p.x >= x0 && p.x < x0 + CHK && p.z >= z0 && p.z < z0 + CHK) buildPOI(p, (n, x, z, s, col, bio, tint) => kit(n, x, z, s, col, bio, tint), cols, inter);
    // ore veins: a boulder studded with glowing crystals in the ore's colour (own RNG, so the scatter below is unchanged)
    const veinGroups = [];
    { const vr = GW.rand(((ci * 3571 + cj * 92821) >>> 0) % 2147483646 + 7), F = GW.Forge;
      for (let k = 0; k < 2; k++) {
        const x = x0 + 8 + vr() * (CHK - 16), z = z0 + 8 + vr() * (CHK - 16), bio = W.regionAt(x, z), roll = vr(), pick = vr();
        if (roll > (bio === 'high' || bio === 'ash' ? 0.6 : 0.42) || !chunkFree(x, z, 2.6)) continue;
        let ore = 'iron_ore', acc = 0; for (const [o, wgt] of Object.entries(F.VEINS[bio] || F.VEINS.vale)) { acc += wgt; if (pick < acc) { ore = o; break; } }
        if (Math.hypot(x, z) > 2400 * WS && vr() < 0.05) ore = 'star';
        const id = 'v:' + ci + ',' + cj + ',' + k, col = F.ORES[ore].color;
        kit('kit_rock_b', x, z, 0.85, 1.1, bio, new THREE.Color(0.8, 0.8, 0.82));
        const g = new THREE.Group(), y = W.heightAt(x, z), cm = crystalMat(col);
        for (let q = 0; q < 6; q++) { const a = q / 6 * Math.PI * 2 + vr(), r = 0.5 + vr() * 0.9, m = new THREE.Mesh(CRYSTAL_G, cm);
          m.position.set(x + Math.cos(a) * r, y + 0.6 + vr() * 0.9, z + Math.sin(a) * r); m.rotation.set(vr() * 3, vr() * 3, vr() * 3); m.scale.set(0.8 + vr() * 0.6, 1.3 + vr() * 1.2, 0.8 + vr() * 0.6); g.add(m); }
        g.visible = !(W.isMined && W.isMined(id)); scene.add(g); veinGroups.push(g);
        inter.push({ type: 'vein', id, ore, x, z, r: 2.8, label: 'Mine the ' + F.ORES[ore].name.toLowerCase(), crystals: g, lvl: 1 + Math.floor(Math.hypot(x, z) / LVLD) });
      } }
    inter.forEach(it => W.interact.push(it));
    for (let k = 0; k < 90; k++) {
      const x = x0 + rnd() * CHK, z = z0 + rnd() * CHK;
      const forest = vnoise(x * 0.011, z * 0.011), bio = W.regionAt(x, z), roll = rnd();
      if (bio === 'ash') {
        if (roll < 0.1) { if (chunkFree(x, z, 1)) kit(['kit_deadtree_a', 'kit_deadtree_b', 'kit_deadtree_c'][k % 3], x, z, 0.8 + rnd() * 0.6, 0.4, 'ash', new THREE.Color(0.4, 0.35, 0.32)); }
        else if (roll < 0.16) { if (chunkFree(x, z, 1.2)) kit(['kit_rock_a', 'kit_rock_b', 'kit_rock_c'][k % 3], x, z, 0.5 + rnd() * 0.9, 0.85, 'ash'); }
      } else if (bio === 'high') {
        if (roll < (forest > 0.62 ? 0.35 : 0.02)) { if (chunkFree(x, z, 1)) kit(['kit_pine_a', 'kit_pine_b', 'kit_pine_c'][k % 3], x, z, 0.8 + rnd() * 0.4, 0.4, 'high'); }
        else if (roll > 0.86) { if (chunkFree(x, z, 1.4)) kit(['kit_rock_a', 'kit_rock_b', 'kit_rock_c'][k % 3], x, z, 0.6 + rnd() * 1.2, 0.85, 'high'); }
      } else if (bio === 'salt') {
        if (roll < 0.02) { if (chunkFree(x, z, 1)) kit(['kit_deadtree_a', 'kit_deadtree_b', 'kit_deadtree_c'][k % 3], x, z, 0.7 + rnd() * 0.4, 0.4, 'salt', new THREE.Color(0.9, 0.86, 0.8)); }
        else if (roll > 0.95) { if (chunkFree(x, z, 1.2)) kit(['kit_rock_a', 'kit_rock_b', 'kit_rock_c'][k % 3], x, z, 0.4 + rnd() * 0.7, 0.85, 'salt'); }
      } else if (bio === 'mire') {
        if (roll < (forest > 0.55 ? 0.3 : 0.04)) { if (chunkFree(x, z, 1)) kit(rnd() < 0.5 ? ['kit_deadtree_a', 'kit_deadtree_b'][k % 2] : 'kit_pine_c', x, z, 0.8 + rnd() * 0.5, 0.4, 'mire', new THREE.Color(0.7, 0.72, 0.6)); }
        else if (roll > 0.975) { if (chunkFree(x, z, 1.5)) nat(rnd() < 0.6 ? 'log' : 'stump', x, z, 2.6 + rnd(), 0.8); }
      } else if (bio === 'dusk') {
        if (roll < (forest > 0.4 ? 0.85 : 0.15)) { if (chunkFree(x, z, 1)) kit(['kit_pine_a', 'kit_pine_b', 'kit_pine_c', 'kit_oak_b'][k % 4], x, z, 0.9 + rnd() * 0.6, 0.4, 'dusk'); }
      } else if (bio === 'frost') {
        if (roll < (forest > 0.58 ? 0.75 : 0.05)) { if (chunkFree(x, z, 1)) kit(['kit_pine_a', 'kit_pine_b', 'kit_pine_c'][k % 3], x, z, 0.85 + rnd() * 0.5, 0.4, 'frost'); }
        else if (roll < 0.85 && roll > 0.8) { if (chunkFree(x, z, 1.2)) kit(['kit_rock_a', 'kit_rock_b', 'kit_rock_c'][k % 3], x, z, 0.5 + rnd() * 0.8, 0.85, 'frost'); }
      } else {
        if (roll < (forest > 0.6 ? 0.8 : forest > 0.45 ? 0.12 : 0.03)) { if (chunkFree(x, z, 1)) kit(rnd() < 0.4 ? ['kit_oak_a', 'kit_oak_b'][k % 2] : ['kit_pine_a', 'kit_pine_b', 'kit_pine_c'][k % 3], x, z, 0.8 + rnd() * 0.5, 0.4, 'vale'); }
        else if (roll > 0.97) { if (chunkFree(x, z, 1.5)) { const r2 = rnd(); if (r2 < 0.4) nat('log', x, z, 2.6 + rnd(), 0.9); else if (r2 < 0.7) nat('stump', x, z, 3 + rnd(), 0.45); else nat('bush_large', x, z, 2 + rnd() * 2, 0); } }
        else if (roll > 0.955) { if (chunkFree(x, z, 1.2)) kit(['kit_rock_a', 'kit_rock_b', 'kit_rock_c'][k % 3], x, z, 0.45 + rnd() * 0.6, 0.85, 'vale'); }
      }
    }
    const meshes = veinGroups.slice(); batch.build(scene, meshes, 1e6);   // one mesh per kind per chunk
    return { meshes, cols, inter };
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
      if (c) { c.meshes.forEach(m => { scene.remove(m); if (m.dispose) m.dispose(); const k = W.occluders.indexOf(m); if (k >= 0) W.occluders.splice(k, 1); }); c.cols.forEach(W.removeCollider);
        if (c.inter && c.inter.length) W.interact = W.interact.filter(it => !c.inter.includes(it)); }
      chunks.delete(key);
    }
  };

  // ----- Greymoss Keep (tools/blender/build_castle.py). Local coords: lx east, ly north (= game -z). -----
  const CL = { u: 1.0, floorY: 3.4 * BS };
  const toW = (lx, ly) => [L.castle.x + lx * BS, L.castle.z - ly * BS];
  W.castleLocal = (x, z) => [(x - L.castle.x) / BS, -(z - L.castle.z) / BS];
  W.BS = BS;
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
      const m = new THREE.Mesh(merged, cmat[mn] || cmat.cobble); m.position.set(L.castle.x, base, L.castle.z); m.scale.setScalar(BS); m.frustumCulled = false; scene.add(m);
      if (mn !== 'void') { merged.computeBoundingSphere(); m.updateMatrixWorld(); W.occluders.push(m); }
    }
    CL.base = base;
    // ---- colliders (level 0 = ground, 1 = upper floor; undefined = both) ----
    const seg = (x0, y0, x1, y1, r, lv, skip) => {
      const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(len / (r * 1.1)));
      for (let i = 0; i <= n; i++) { const t = i / n, lx = x0 + (x1 - x0) * t, ly = y0 + (y1 - y0) * t; if (skip && skip(lx, ly)) continue; const [x, z] = toW(lx, ly); W.addCollider(x, z, r * BS, 'castle', lv); }
    };
    const R = 11;
    seg(-R, -R, R, -R, 0.7, undefined, (lx) => Math.abs(lx) < 1.6);                 // south wall, gate
    seg(-R, -R, -R, R, 0.7, undefined, (lx, ly) => ly > -6 && ly < -1.5);         // west wall, breach (climb over rubble)
    seg(-R, R, R, R, 0.7); seg(R, -R, R, R, 0.7);
    [[-R, -R], [R, -R], [-R, R], [R, R]].forEach(([lx, ly]) => { const [x, z] = toW(lx, ly); W.addCollider(x, z, 2.7 * BS, 'castle'); });
    // keep: outer face x -6..6, y 2..10
    seg(-6, 2, -1.1, 2, 0.55); seg(1.1, 2, 6, 2, 0.55); seg(-1.1, 2, 1.1, 2, 0.55, 1);   // door only open on the ground
    seg(-6, 2, -6, 10, 0.55); seg(-6, 10, 6, 10, 0.55);
    seg(6, 2, 6, 7.1, 0.55); seg(6, 7.1, 6, 9.2, 0.55, 0); seg(6, 9.2, 6, 10, 0.55); // east face: stair gap on the upper floor
    seg(8.0, 0.2, 8.0, 8.4, 0.35);                                                 // stair's outer wall
    seg(6.2, 8.6, 7.8, 8.6, 0.35, 0);                                              // the stair's back (can't walk under it)
    seg(6.0, 9.4, 8.0, 9.4, 0.35, 1); seg(8.0, 8.4, 8.0, 9.4, 0.35, 1);              // landing walls at the top
    W.addCollider(...toW(-5, -5), 1.0 * BS, 'castle');                                  // well
  }
  // ----- The Pale Chapel (tools/blender/build_chapel.py): gothic facade with the arched black doorway -----
  function mergeByMat(g, mats, fallback, x, y, z, scene, sc) {
    g.scene.updateMatrixWorld(true);
    const byMat = {};
    g.scene.traverse(o => { if (o.isMesh) { const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); (byMat[o.material.name] = byMat[o.material.name] || []).push(geo); } });
    for (const mn in byMat) {
      const geos = byMat[mn], merged = new THREE.BufferGeometry();
      let n = 0; geos.forEach(gg => { n += (gg.index ? gg.index.count : gg.attributes.position.count); });
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let k = 0;
      geos.forEach(gg => { const ng = gg.index ? gg.toNonIndexed() : gg; const pa = ng.attributes.position.array, na = ng.attributes.normal.array; pos.set(pa, k); nor.set(na, k); k += pa.length; });
      merged.setAttribute('position', new THREE.BufferAttribute(pos, 3)); merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      const m = new THREE.Mesh(merged, mats[mn] || fallback || Object.values(mats)[0]); m.position.set(x, y, z); if (sc) m.scale.setScalar(sc); m.frustumCulled = false; scene.add(m);
      if (mn !== 'void') { merged.computeBoundingSphere(); m.updateMatrixWorld(); W.occluders.push(m); }
    }
  }
  function buildChapel(scene) {
    const g = GW.Assets.gltf.chapel; if (!g) return;
    const C = L.chapel, base = W.heightAt(C.x, C.z) - 0.05;
    const mats = {
      cobble: GW.mat({ id: ID.MASONRY, tex: 8, color: 0x929396, fill: 0.12 }), cobbleDark: GW.mat({ id: ID.MASONRY, tex: 8, color: 0x58595c, fill: 0.08 }),
      moss: GW.mat({ id: ID.MOSS, tex: 5, color: 0x3e5a36 }), iron: GW.mat({ id: ID.METAL, color: 0x4a4e58, rim: 0.35 }),
    };
    mergeByMat(g, mats, mats.cobble, C.x, base, C.z, scene, BS);
    const tw = (lx, ly) => [C.x + lx * BS, C.z - ly * BS];
    const seg = (x0, y0, x1, y1, r) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (r * 1.1)));
      for (let i = 0; i <= n; i++) { const t = i / n; W.addCollider(...tw(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t), r * BS, 'chapel'); } };
    seg(-6.3, 0.55, -1.6, 0.55, 0.6); seg(1.6, 0.55, 6.3, 0.55, 0.6);          // facade, door open
    [-6.35, -2.1, 2.1, 6.35].forEach(x => W.addCollider(...tw(x, -0.4), 0.55 * BS, 'chapel'));   // buttresses
    seg(-5.45, 1.2, -5.45, 12.6, 0.55); seg(5.45, 1.2, 5.45, 12.6, 0.55); seg(-5.45, 12.65, 5.45, 12.65, 0.55);
    // the torch on the east door buttress
    const [fx, fz] = tw(2.1, -1.45), fy = base + 3.55 * BS;
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.5, 5), GW.mat({ id: ID.FIRE, color: 0, emissive: 0xffa040, unlit: true }));
    f.position.set(fx, fy, fz); scene.add(f); W.flames.push({ m: f, s: 3.3, base: 1 });
    W.lights.add(fx, fy + 0.3, fz - 0.6, new THREE.Color(1.0, 0.56, 0.24), 9.5, 0.9);
    // the churchyard: lanterns at the steps, a few old graves and fallen stones (kit pieces, same look as the rest of the vale)
    const yard = [['kit_lantern', -2.6, -3.2, 1.1, 0], ['kit_lantern', 2.6, -3.2, 1.1, Math.PI], ['kit_grave_cross', -8.5, 2, 1.05, 0.2], ['kit_grave_round', -8.8, 5, 1, -0.1],
      ['kit_grave_slab', -8.4, 8, 1, 0.1], ['kit_grave_obelisk', 8.6, 3, 1.05, 0], ['kit_grave_cross', 8.8, 6.5, 1, -0.2], ['kit_pillar_b', 7.8, -4.5, 0.7, 1.2], ['kit_rock_a', -7.2, -4.8, 0.45, 2]];
    for (const [n, lx, ly, sc, ry] of yard) { const [x, z] = tw(lx, ly); kitAt(n, x, z, sc, sc, sc, ry); W.addCollider(x, z, 0.35 * sc, 'kit'); }
    { const [lx, lz] = tw(-2.6, -3.2), [rx, rz] = tw(2.6, -3.2); [[lx, lz], [rx, rz]].forEach(([x, z]) => W.lights.add(x, W.heightAt(x, z) + 1.9, z, new THREE.Color(1.0, 0.62, 0.28), 7, 0.5)); }
  }

  // ----- The Ivy Watch (tools/blender/build_tower.py): walk in the door, come out on the roof -----
  const TW = { top: 13.1 * BS, r: 3.3 * BS };
  W.tower = TW;
  function buildTower(scene) {
    const g = GW.Assets.gltf.tower; if (!g) return;
    const T = L.tower, base = W.heightAt(T.x, T.z) - 0.05;
    TW.base = base; TW.x = T.x; TW.z = T.z; TW.topY = base + TW.top;
    const mats = {
      cobble: GW.mat({ id: ID.MASONRY, tex: 8, color: 0x8e8f92, fill: 0.12 }), cobbleDark: GW.mat({ id: ID.MASONRY, tex: 8, color: 0x5c5d60, fill: 0.08 }),
      moss: GW.mat({ id: ID.MOSS, tex: 5, color: 0x6a9a4a, fill: 0.12 }), wood: GW.mat({ id: ID.PLANKS, tex: 2, color: 0x8a6440, fill: 0.1 }),
      woodDark: GW.mat({ id: ID.PLANKS, tex: 2, color: 0x5a4030, fill: 0.06 }), iron: GW.mat({ id: ID.METAL, color: 0x4a4e58, rim: 0.35 }),
      gold: GW.mat({ id: ID.RUNE, color: 0, emissive: 0xd8a040, unlit: true }), void: GW.mat({ id: ID.VOID, color: 0, unlit: true }),
    };
    mergeByMat(g, mats, mats.cobble, T.x, base, T.z, scene, BS);
    W.addCollider(T.x, T.z, 3.6 * BS, 'tower', 0);                         // the tower body (ground level only)
    for (let k = 0; k < 28; k++) {                                     // the parapet on the roof, broken on the west
      const a = k / 28 * Math.PI * 2; if (a > 2.7 && a < 3.5) continue;
      W.addCollider(T.x + Math.cos(a) * 3.35 * BS, T.z - Math.sin(a) * 3.35 * BS, 0.4, 'tower', 2);
    }
    TW.door = { x: T.x, z: T.z + 4.0 * BS };
    TW.chest = { x: T.x - 0.6 * BS, z: T.z - 1.2 * BS };
    W.interact.push({ type: 'hatch', x: T.x + 1.6 * BS, z: T.z + 0.4 * BS, r: 1.3, label: 'Climb down', floor: 2 });
    W.interact.push({ type: 'chest', x: TW.chest.x, z: TW.chest.z, r: 1.6, label: 'Open the chest', floor: 2, id: 'tower' });
    W.lights.add(T.x, TW.topY + 2.5, T.z, new THREE.Color(0.35, 0.42, 0.6), 7, 0.4);   // moonlit roof
  }

  // walkable height for a position at a given level; returns { y, lv }
  W.levelAt = function (x, z, lv) {
    if (lv === 2) {
      if (TW.base !== undefined && Math.hypot(x - TW.x, z - TW.z) < 3.25 * BS) return { y: TW.topY, lv: 2 };
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
    const wood = GW.mat({ id: ID.BARK, tex: 3, color: 0x7a5636 }), stone = GW.mat({ id: ID.ROCK, tex: 6, color: 0x84868c });
    for (let k = 0; k < 4; k++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.4, 5), wood); l.rotation.z = Math.PI / 2; l.rotation.y = k * Math.PI / 4; l.position.y = 0.12; g.add(l); }
    for (let k = 0; k < 9; k++) { const s = kitGroup(['kit_rock_a', 'kit_rock_c'][k % 2], 0.16 + (k % 3) * 0.03); const a = k / 9 * 6.28; s.position.set(Math.cos(a) * 1.0, -0.02, Math.sin(a) * 1.0); s.rotation.y = a * 3.1; g.add(s); }
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
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, h, 6), GW.mat({ id: ID.BARK, tex: 3, color: 0x6e4e30 }));
    pole.position.set(x, y + h / 2, z); scene.add(pole);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.1, 0.28, 6, 1, true), GW.mat({ id: ID.METAL, color: 0x4a4e58, rim: 0.4, side: THREE.DoubleSide })); cup.position.set(x, y + h + 0.02, z); scene.add(cup);
    [0, 2.1, 4.2].forEach(a => { const st = kitGroup('kit_rock_a', 0.14); st.position.set(x + Math.cos(a) * 0.28, y - 0.03, z + Math.sin(a) * 0.28); st.rotation.y = a; scene.add(st); });
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 5), GW.mat({ id: ID.FIRE, color: 0, emissive: 0xffa040, unlit: true }));
    f.position.set(x, y + h + 0.25, z); scene.add(f);
    W.flames.push({ m: f, s: Math.random() * 10, base: 1 });
    W.lights.add(x, y + h + 0.4, z, new THREE.Color(1.0, 0.55, 0.22), 8.5, 0.8);
    W.addCollider(x, z, 0.25, 'torch');
  }

  function buildShrine(scene, x, z, s, glow) {
    const y = W.heightAt(x, z);
    const g = new THREE.Group(); g.position.set(x, y - 0.05, z); scene.add(g);
    const st = kitGroup('kit_pillar_a', 1, null); st.scale.set(0.9 * s, 1.45 * s, 0.9 * s); st.rotation.y = Math.atan2(x, z); st.rotation.z = (Math.random() - 0.5) * 0.08; g.add(st);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.5 * s, 0.38 * s, 1.0 * s), GW.mat({ id: ID.RUNE, color: 0, emissive: glow ? 0x4fb8ff : 0x2a4a70, unlit: true }));
    band.position.y = 2.2 * s; band.rotation.y = st.rotation.y; g.add(band);
    W.addCollider(x, z, 0.9 * s, 'stone');
    const light = glow ? W.lights.add(x, y + 2.5, z, new THREE.Color(0.25, 0.6, 1.0), 10, 0.15) : null;
    return { g, band, light };
  }

  function buildVillage(scene, batch, place, rnd, boxG0, woodM) {
    const { x: vx, z: vz } = L.village;
    campfire(scene, L.fire.x, L.fire.z, 'Emberhold');
    // built from the same kit as every other village (glyph-textured masonry, thatch and planks)
    const put = (name, x, z, s, ry, col) => { const y = W.heightAt(x, z) - 0.04;
      kitParts(name).forEach((p, i) => batch.add('kit_' + name + i, p.geo, kitMat(p.mn), place(x, y, z, ry, s, s, s), new THREE.Color(1, 1, 1).multiplyScalar(0.88 + rnd() * 0.24)));
      if (col) W.addCollider(x, z, col * s, 'kit'); };
    // fence ring (gates N, S, E, W where the paths come in)
    for (let k = 0; k < 30; k++) {
      const a = (k + 0.5) / 30 * Math.PI * 2;
      if ([Math.PI / 2, -Math.PI / 2, 0, Math.PI].some(g => Math.abs(GW.angDiff(a, g)) < 0.2)) continue;
      const x = vx + Math.cos(a) * 15.5, z = vz + Math.sin(a) * 15.5;
      put('kit_fence', x, z, 1, -a + Math.PI / 2, 0); W.addCollider(x, z, 0.6, 'fence');
    }
    // two more houses where the old tents stood, facing the square
    [[-10, 7], [-2, 12]].forEach(([dx, dz]) => { const x = vx + dx, z = vz + dz; put('kit_hut', x, z, 1.2, Math.atan2(vx - x, vz - z), 1.9); });
    // crates
    for (let k = 0; k < 6; k++) {
      const a = rnd() * 6.28, r = 9 + rnd() * 4, x = vx + Math.cos(a) * r, z = vz + Math.sin(a) * r;
      if (W.blocked(x, z, 0.9) || Math.abs(x) < 3) continue;
      put('kit_crate', x, z, 1, rnd() * 3, 0.5);
    }
    // torches at gates
    [[-2.4, -15.8], [2.4, -15.8], [-2.4, 15.8], [2.4, 15.8], [14.4, -2.5], [-14.4, -2.5]].forEach(([dx, dz]) => torch(scene, vx + dx, vz + dz, 2.2));
    // anvil + brazier
    const ax = L.anvil.x, az = L.anvil.z; anvil(scene, ax, az);
    // forge brazier
    const bx = ax + 2.4, bz = az - 1.2, by = W.heightAt(bx, bz);
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.6, 0.9, 8, 2), GW.mat({ id: ID.MASONRY, tex: 8, color: 0x7a7b80, fill: 0.08 })); br.position.set(bx, by + 0.45, bz); scene.add(br);
    const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.1, 8), GW.mat({ id: ID.FIRE, color: 0, emissive: 0xff5a1a, unlit: true })); coals.position.set(bx, by + 0.92, bz); scene.add(coals);
    W.flames.push({ m: coals, s: 3, base: 1, flat: true });
    W.lights.add(bx, by + 1.6, bz, new THREE.Color(1.0, 0.38, 0.1).multiplyScalar(1.3), 9, 0.5);
    W.addCollider(bx, bz, 0.9, 'brazier');
  }

  function anvil(scene, ax, az) {
    const ay = W.heightAt(ax, az), metal = GW.mat({ id: ID.METAL, color: 0x555a66, rim: 0.4 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.62, 7), GW.mat({ id: ID.BARK, tex: 3, color: 0x6a4a30 })); base.position.set(ax, ay + 0.31, az); scene.add(base);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.55), metal); top.position.set(ax, ay + 0.78, az); scene.add(top);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 6), metal); horn.rotation.z = Math.PI / 2; horn.position.set(ax - 0.85, ay + 0.8, az); scene.add(horn);
    W.addCollider(ax, az, 0.8, 'anvil'); W.interact.push({ type: 'forge', x: ax, z: az, r: 2.6, label: 'Use the anvil' });
  }

  function buildWater(scene) {
    const P = [], U = [], idx = [];
    for (const R of RIVERS) {
      const pts = R.pts, n = pts.length, w = R.w + (R.w > 3 ? 1.2 : 0.9), base = P.length / 3;
      let along = 0;
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        if (i > 0) along += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        for (let s = 0; s < 2; s++) { const sg = s ? 1 : -1; P.push(pts[i][0] - dz * w * sg, R.ys[i], pts[i][1] + dx * w * sg); U.push(s, along); }
        if (i < n - 1) { const k = base + i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      }
    }
    for (const Lk of LAKES) {   // a fan: centre in the middle of the "channel" (uv.x 0.5), the shore at its edge (uv.x 0)
      const base = P.length / 3, N = 48, rr = Lk.r + 1.2; P.push(Lk.x, Lk.y, Lk.z); U.push(0.5, 0);
      for (let k = 0; k <= N; k++) { const a = k / N * Math.PI * 2; P.push(Lk.x + Math.cos(a) * rr, Lk.y, Lk.z + Math.sin(a) * rr); U.push(0, a * rr); }
      for (let k = 0; k < N; k++) idx.push(base, base + 1 + k, base + 2 + k);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(U), 2)); g.setIndex(idx);
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
        uniform vec2 uCenter; uniform float uSize; uniform sampler2D tMap; uniform float uWorld; uniform vec3 uPush[6]; uniform float uScale; uniform float uTime; uniform float uWidth; uniform vec2 uPx; uniform float uLineW; uniform float uLen; uniform float uTurf; uniform vec2 uShift; uniform float uFlowers; uniform float uGroundO; uniform float uSwirl; uniform float uFlowerK; uniform sampler2D uBiomeMap; uniform sampler2D uBiomeMap2; uniform vec2 uMapC; uniform float uMapSpan;
        varying vec3 vW; varying vec3 vCol; varying float vT; varying float vSpeck; varying float vAc; varying vec2 vGl;
        float gh(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(gh(i), gh(i + vec2(1.0, 0.0)), f.x), mix(gh(i + vec2(0.0, 1.0)), gh(i + vec2(1.0, 1.0)), f.x), f.y); }
        void main(){
          vec2 base = uCenter - uSize * 0.5;
          vec2 wp = base + mod((aOff.xy + uShift) * (uSize / 50.0) - base, uSize);
          vec4 m = texture2D(tMap, (wp - uMapC) / uMapSpan + 0.5);
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
          keep *= max(smoothstep(0.9, 2.2, m.a) > fract(sd * 2.9) ? 1.0 : 0.0, step(0.93, fract(sd * 3.7)));   // roads and paths: worn bare, a few stray blades
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
          vec4 bmg = texture2D(uBiomeMap, (wp - uMapC) / uMapSpan + 0.5), bmg2 = texture2D(uBiomeMap2, (wp - uMapC) / uMapSpan + 0.5);
          sea = mix(sea, mix(vec3(0.3, 0.27, 0.2), vec3(0.4, 0.33, 0.22), tone), bmg.r);    // ash: dry, straw-coloured
          sea = mix(sea, mix(vec3(0.5, 0.58, 0.66), vec3(0.66, 0.72, 0.8), tone), bmg.g);   // frost: frozen, pale
          sea = mix(sea, mix(vec3(0.52, 0.48, 0.36), vec3(0.62, 0.58, 0.44), tone), bmg.b); // salt: bleached
          sea = mix(sea, mix(vec3(0.26, 0.34, 0.24), vec3(0.36, 0.42, 0.3), tone), bmg.a);  // highlands: olive and grey
          sea = mix(sea, mix(vec3(0.17, 0.21, 0.1), vec3(0.26, 0.28, 0.14), tone), bmg2.r); // mire: olive-brown reeds
          sea = mix(sea, mix(vec3(0.05, 0.17, 0.2), vec3(0.08, 0.24, 0.27), tone), bmg2.g); // duskwood: deep teal
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
    if (px > 9000) return;   // in a dungeon: the overworld sleeps
    prefetch(px, pz);
    W.dataWindow(px, pz);
    if (Math.abs(px - W._tc[0]) > 96 || Math.abs(pz - W._tc[1]) > 96) W.terrainRefresh(false, px, pz);
    W.stream(px, pz, W.scene, W._streamBudget || 1); W._streamBudget = 1;
  };

  // ---------- minimap ----------
  // map colours per region
  const MAP_BIO = [[106, 122, 138], [92, 104, 80], [80, 62, 50], [150, 138, 104], [70, 78, 46], [36, 70, 76]];
  function mapColour(b, rd, pd, x, z, h) {
    if (rd < RIVER_W) return [74, 122, 208];
    if (Math.hypot(x - L.frostLake.x, z - L.frostLake.z) < 72) return [154, 180, 208];
    if (pd < 1.8) return [138, 106, 68];
    let c = [29, 58, 34];
    for (let k = 0; k < 6; k++) if (b[k] > 0.01) c = c.map((v, i) => GW.lerp(v, MAP_BIO[k][i], b[k]));
    if (h > 14 || Math.max(Math.abs(x), Math.abs(z)) > HALF - 300) c = c.map(v => Math.min(255, v * 1.35 + 18));
    return c;
  }
  // ---------- data for the glyph world map: a 512² grid of the world's fields ----------
  W.kitParts = n => kitParts(n);   // for audits / tools
  W.enemyLevelAt = (x, z) => 1 + Math.floor(Math.hypot(x, z) / LVLD);
  W.regionLevels = key => { const D = W.mapData(), i = key === 'vale' ? 0 : BIOMES.indexOf(key) + 1; return D.levels[i] || [1, 1]; };
  // how dangerous a level is for the hero: green (easy) → gold → orange → red (deadly)
  W.dangerCol = (lvl, me) => { const d = lvl - me; return d <= 0 ? '#8ad08a' : d <= 2 ? '#e8d070' : d <= 4 ? '#ff9a50' : '#ff5040'; };
  W.ARENAS = ARENAS; W.VS = VS; W.WS = WS; W.LVLD = LVLD; W.HALF = HALF;
  findBridges();
  W.lakeAt = (x, z) => LAKES.find(Lk => Math.hypot(x - Lk.x, z - Lk.z) < Lk.r + 4) || null; W.footFor = footFor;
  W.RIVER_LINE = RIVER; W.RIVER_LINES = RIVERS; W.LAKES = LAKES; W.BRIDGES = BRIDGES; W.ROAD_KINDS = PATH_KIND; W.ROAD_LINES = PATHP; W.HUBS = HUBS; W.POI_CELL = POI_CELL; W.BIOMES = BIOMES; W.RIVER_W = RIVER_W;
  let MAPD = null;
  W.mapData = function () {
    if (MAPD) return MAPD;
    const N = 1024, cell = SIZE / N, n = N * N, f = {};
    const H = new Float32Array(n), R = new Float32Array(n), Pd = new Float32Array(n), Gr = new Float32Array(n), B = new Uint8Array(n), BW = new Float32Array(n), Lk = new Uint8Array(n);
    const cen = BIOMES.map(() => [0, 0, 0]).concat([[0, 0, 0]]), lh = BIOMES.map(() => new Uint32Array(64)).concat([new Uint32Array(64)]);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * cell - HALF, z = (j + 0.5) * cell - HALF, k = j * N + i;
      fieldsAt(x, z, segsNear(RIDX, x - 1, z - 1, x + 1, z + 1), segsNear(PIDX, x - 1, z - 1, x + 1, z + 1), f);
      H[k] = f.h; R[k] = f.rd; Pd[k] = f.pd; Gr[k] = f.g;
      let bi = 0, bv = 0.5; for (let q = 0; q < 6; q++) if (f.bw[q] > bv) { bv = f.bw[q]; bi = q + 1; }
      B[k] = bi; BW[k] = bi ? bv : 1 - Math.max(...f.bw);
      Lk[k] = Math.hypot(x - L.frostLake.x, z - L.frostLake.z) < 72 ? 1 : 0;
      if (Math.max(Math.abs(x), Math.abs(z)) < HALF - 200) { const c = cen[bi]; c[0] += x; c[1] += z; c[2]++; lh[bi][Math.min(63, W.enemyLevelAt(x, z))]++; }
    }
    const centroids = cen.map(c => c[2] ? { x: c[0] / c[2], z: c[1] / c[2] } : null);
    // each region's level band: the 5th to 95th percentile of the land it covers
    const levels = lh.map(hst => { const tot = hst.reduce((a, b) => a + b, 0); if (!tot) return null; let acc = 0, lo = 1, hi = 1;
      for (let l = 0; l < 64; l++) { acc += hst[l]; if (acc < tot * 0.05) lo = l + 1; if (acc <= tot * 0.95) hi = l + 1; } return [Math.max(1, lo), Math.max(lo, hi)]; });
    MAPD = { N, cell, H, R, Pd, Gr, B, BW, Lk, centroids, levels };
    return MAPD;
  };
  W.mapCanvas = function () {
    const S = 2048, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    g.font = '6px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const step = 4, f = {}, B = S / step, base = document.createElement('canvas'); base.width = base.height = B;
    const bg = base.getContext('2d'), bimg = bg.createImageData(B, B), glyphs = [];
    for (let y = 0; y < S; y += step) for (let x = 0; x < S; x += step) {
      const wx = (x + 2) / S * SIZE - HALF, wz = (y + 2) / S * SIZE - HALF;
      fieldsAt(wx, wz, segsNear(RIDX, wx - 1, wz - 1, wx + 1, wz + 1), segsNear(PIDX, wx - 1, wz - 1, wx + 1, wz + 1), f);
      const col = mapColour(f.bw, f.rd, f.pd, wx, wz, f.h), o = ((y / step) * B + x / step) * 4;
      bimg.data[o] = col[0] * 0.42; bimg.data[o + 1] = col[1] * 0.42; bimg.data[o + 2] = col[2] * 0.42; bimg.data[o + 3] = 255;   // tinted base
      let ch = '.';
      if (f.rd < RIVER_W + 3 || Math.hypot(wx - L.frostLake.x, wz - L.frostLake.z) < 72) ch = '~';
      else if (f.pd < 4) ch = ':';
      else if (f.h > 14 || Math.max(Math.abs(wx), Math.abs(wz)) > HALF - 300) ch = '^';
      else if (((x * 7 + y * 13) % 5) !== 0) continue;
      glyphs.push([ch, x + 2, y + 2, col]);
    }
    bg.putImageData(bimg, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(base, 0, 0, S, S);
    for (const [ch, x, y, col] of glyphs) { g.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`; g.fillText(ch, x, y); }
    return c;
  };
})();

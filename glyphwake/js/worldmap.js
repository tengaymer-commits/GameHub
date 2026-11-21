// Glyphwake: the world map (M). A live glyph cartography: every screen cell is a character chosen from the
// terrain under it (region glyph sets, mountains, water), lit by a hillshade, so the map gets more detailed as
// you zoom and matches the game's look. Rivers and roads are drawn as ink lines, places are labelled like an
// old chart, and the whole thing sits in a box-drawn frame with a grid, compass rose and scale bar.
// Click to drop a waypoint (shown on the compass and minimap); hover for names and distances.
(function () {
  'use strict';
  const GW = window.GW, UI = GW.UI, $ = id => document.getElementById(id);
  const WM = { open: false, zoom: 1, cx: 0, cz: 0, drag: null, moved: false, mouse: null, key: '', layer: null, hover: null };
  UI.mapOpen = () => WM.open;
  UI.mapView = WM;

  // ---------- terrain glyph sets per region (index: 0 vale, then frost, high, ash, salt, mire, dusk) ----------
  const SETS = [
    { ch: '"\',.;"\'`', col: [112, 190, 118] },        // the vale: grass and meadow
    { ch: '*·\'˙*.:', col: [178, 206, 236] },        // frostmere: snow and rime
    { ch: '∩ⁿ^.:\'"', col: [152, 166, 122] },        // highlands: heather and crag
    { ch: '∴:.`·;,', col: [200, 118, 74] },          // ashen barrens
    { ch: '·.-_·. ', col: [226, 210, 160] },         // salt wastes
    { ch: '„"ˬ~,\'"', col: [150, 160, 84] },         // the mire
    { ch: '♠♣↑♠"♣\'', col: [86, 152, 158] },         // duskwood
  ];
  const MOUNT = '▲^∧▲^', WATER = '≈~≈~', EDGE = '░';
  const hash = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const POI_ICON = { camp: ['x', '#e07a64', 'bandit camp'], ruin: ['#', '#b4b8c4', 'ruin'], chest: ['■', '#ffd860', 'cache'], shrine: ['†', '#9fd8ff', 'shrine'], waystone: ['◊', '#9fd8ff', 'waystone'],
    vista: ['^', '#ece4cc', 'vista'], wanderer: ['@', '#e0c080', 'wanderer'], elite: ['!', '#ffb040', 'elite'], cave: ['◘', '#c8b08a', 'cave'], puzzle: ['?', '#c8a0ff', 'puzzle'] };

  const LANDMARK = { elite: 1, cave: 1, waystone: 1, vista: 1 };
  // ---------- map styles: V cycles them on the map ----------
  const STYLES = ['tour', 'ascii', 'ink', 'mosaic'];
  const STYLE_NAME = { tour: 'Touring map', ascii: 'ASCII relief', ink: "Explorer's ink", mosaic: 'Glyph mosaic' };
  const RAMP = ' .:-=+*#%@';
  const style = () => STYLES.includes(UI.settings.mapStyle) ? UI.settings.mapStyle : 'tour';
  UI.MAP_STYLES = STYLES; UI.MAP_STYLE_NAME = STYLE_NAME;
  const pxPerM = (w, h) => Math.min(w, h) * 0.9 / GW.World.SIZE * WM.zoom;
  const reveal = () => UI.settings.revealMap !== false;
  function seenFn(G) {
    const S = GW.World.SIZE;
    if (reveal() || !G.fog) return () => true;
    return (x, z) => !!G.fog[Math.floor((z + S / 2) / G.FOG_CELL) * G.FOG_N + Math.floor((x + S / 2) / G.FOG_CELL)];
  }

  // ---------- relief: a coloured terrain picture like a touring map (region tints, elevation, hillshade, contours) ----------
  const TINT = [[62, 104, 56], [142, 164, 186], [108, 112, 82], [128, 74, 46], [178, 160, 116], [80, 88, 48], [40, 82, 86]];
  let RELIEF = null;
  function relief() {
    if (RELIEF) return RELIEF;
    const W = GW.World, D = W.mapData(), N = D.N, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const g = cv.getContext('2d'), img = g.createImageData(N, N), half = W.SIZE / 2;
    const at = (i, j) => D.H[GW.clamp(j, 0, N - 1) * N + GW.clamp(i, 0, N - 1)];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, h = D.H[k], x = (i + 0.5) * D.cell - half, z = (j + 0.5) * D.cell - half, edge = Math.max(Math.abs(x), Math.abs(z));
      let c;
      if (D.Lk[k] || D.R[k] < W.RIVER_W * 1.4) c = [44, 84, 140];
      else {
        const t = TINT[D.B[k]], v = TINT[0], m = D.B[k] ? GW.clamp((D.BW[k] - 0.5) * 2.2, 0, 1) : 1;
        c = [GW.lerp(v[0], t[0], m), GW.lerp(v[1], t[1], m), GW.lerp(v[2], t[2], m)];
        const hn = GW.clamp(h / 45, 0, 1); c = c.map((q, n) => GW.lerp(q, [196, 186, 160][n], hn * 0.45));      // lowlands to uplands
        if (h > 14 || edge > half - 280) { const r = GW.clamp((Math.max(h, (edge - (half - 280)) / 6) - 14) / 30, 0, 1); c = c.map((q, n) => GW.lerp(GW.lerp(q, [122, 116, 106][n], 0.7), [228, 232, 238][n], r * r)); }   // rock, then snow
        if (D.R[k] < W.RIVER_W * 4) c = c.map((q, n) => GW.lerp(q, [70, 110, 120][n], 0.25));   // wet banks
        if (D.Pd[k] < 6) c = c.map((q, n) => GW.lerp(q, [150, 120, 80][n], 0.35));
      }
      // hillshade (light from the north-west) and contour lines every 6 m (every 30 m a bolder one)
      const dhx = at(i + 1, j) - at(i - 1, j), dhz = at(i, j + 1) - at(i, j - 1);
      const sh = GW.clamp(1 - (dhx + dhz) * 0.045, 0.5, 1.5);
      const q0 = Math.floor(h / 6), cont = q0 !== Math.floor(at(i + 1, j) / 6) || q0 !== Math.floor(at(i, j + 1) / 6);
      const ck = cont ? (q0 % 5 === 0 ? 0.62 : 0.8) : 1;
      const fade = edge > half - 50 ? 0.35 : 1, o = k * 4;
      img.data[o] = Math.min(255, c[0] * sh * ck * fade); img.data[o + 1] = Math.min(255, c[1] * sh * ck * fade); img.data[o + 2] = Math.min(255, c[2] * sh * ck * fade); img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0); RELIEF = cv; RELIEF.px = img.data; return cv;
  }
  // ---------- the terrain layer (cached; only redrawn when the view changes) ----------
  function terrainLayer(G, w, h, dpr) {
    const W = GW.World, D = W.mapData(), S = W.SIZE, half = S / 2, px = pxPerM(w, h);
    const ST = style(), key = [ST, WM.cx | 0, WM.cz | 0, WM.zoom.toFixed(3), w, h, dpr, reveal(), G.fogVer || 0].join(':');
    if (WM.layer && WM.key === key) return WM.layer;
    WM.key = key;
    const cv = WM.layer || (WM.layer = document.createElement('canvas'));
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = ST === 'ink' ? '#cdbb90' : ST === 'ascii' ? '#030405' : '#05070a'; g.fillRect(0, 0, w, h);
    const RL = relief(), RP = RL.px;
    { const [ox, oy] = [w / 2 + (-half - WM.cx) * px, h / 2 + (-half - WM.cz) * px];   // the coloured relief underneath
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      if (ST === 'tour') { g.globalAlpha = GW.clamp(0.95 - (WM.zoom - 4) * 0.025, 0.5, 0.92); g.drawImage(RL, ox, oy, S * px, S * px); }
      if (ST === 'ink') { g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.3; g.drawImage(RL, ox, oy, S * px, S * px); g.globalCompositeOperation = 'source-over'; }
      g.globalAlpha = 1;
      if (!reveal() && G.fog) { const FN = G.FOG_N; if (!WM.fogCv || WM.fogCv.width !== FN) { WM.fogCv = document.createElement('canvas'); WM.fogCv.width = WM.fogCv.height = FN; }
        const fg = WM.fogCv.getContext('2d'), im = fg.createImageData(FN, FN); for (let q = 0; q < FN * FN; q++) { im.data[q * 4] = 6; im.data[q * 4 + 1] = 7; im.data[q * 4 + 2] = 10; im.data[q * 4 + 3] = G.fog[q] ? 0 : 245; }
        fg.putImageData(im, 0, 0); g.drawImage(WM.fogCv, ox, oy, S * px, S * px); } }
    const CS = ST === 'ascii' ? 10 : 11, cw = CS / px;                                   // screen cell (px) and its size in metres
    const x0 = Math.floor((WM.cx - w / 2 / px) / cw), z0 = Math.floor((WM.cz - h / 2 / px) / cw);
    const nx = Math.ceil(w / CS) + 2, nz = Math.ceil(h / CS) + 2;
    const N = D.N, idx = (x, z) => { const i = Math.floor((x + half) / D.cell), j = Math.floor((z + half) / D.cell); return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i; };
    const seen = seenFn(G);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `${CS + 1}px ui-monospace, Menlo, monospace`;
    const colCache = new Map(), rgb = (r, gg, b) => { const k = ((r >> 3) << 10) | ((gg >> 3) << 5) | (b >> 3); let s = colCache.get(k); if (!s) { s = `rgb(${r & 248},${gg & 248},${b & 248})`; colCache.set(k, s); } return s; };
    const step = Math.max(D.cell, cw);
    for (let jz = 0; jz < nz; jz++) for (let ix = 0; ix < nx; ix++) {
      const ci = x0 + ix, cj = z0 + jz, x = (ci + 0.5) * cw, z = (cj + 0.5) * cw;
      const sx = w / 2 + (x - WM.cx) * px, sy = h / 2 + (z - WM.cz) * px;
      const k = idx(x, z);
      if (k < 0) { if (ST !== 'ink' && hash(ci, cj) < 0.35) { g.fillStyle = '#121820'; g.fillText(EDGE, sx, sy); } continue; }
      if (ST === 'ascii' || ST === 'mosaic') {   // the glyph-heavy styles read the relief colour straight
        if (!seen(x, z)) { if (hash(ci, cj) < 0.12) { g.fillStyle = '#1a1e26'; g.fillText('·', sx, sy); } continue; }
        const o = k * 4, r = RP[o], gg = RP[o + 1], bb = RP[o + 2], L = (0.3 * r + 0.59 * gg + 0.11 * bb) / 255, wet = D.Lk[k] || D.R[k] < W.RIVER_W * 1.4;
        if (ST === 'ascii') {
          const Ln = GW.clamp((L - 0.1) / 0.42, 0, 1), ch = wet ? '≈~'[(ci + cj) & 1] : RAMP[Math.min(9, 1 + Math.floor(Ln * 9))];
          const k2 = 1.55 + 0.9 * Ln; g.fillStyle = rgb(Math.min(255, r * k2) | 0, Math.min(255, gg * k2) | 0, Math.min(255, bb * k2) | 0); g.fillText(ch, sx, sy);
        } else {
          const q = v => Math.min(255, (v * 1.05) & 0xe0) | 0;
          g.fillStyle = rgb(q(r), q(gg), q(bb)); g.fillRect(sx - CS / 2, sy - CS / 2, CS + 0.5, CS + 0.5);
          const hgt = D.H[k], bi = D.B[k], r0 = hash(ci, cj);
          let ch = null, col = 'rgba(0,0,0,.35)';
          if (wet) { ch = '≈'; col = 'rgba(190,220,255,.55)'; }
          else if (hgt > 14 || Math.max(Math.abs(x), Math.abs(z)) > half - 280) { ch = hgt > 30 ? '▲' : '^'; col = 'rgba(255,255,255,.55)'; }
          else if (r0 < 0.3) { ch = SETS[bi].ch[Math.floor(hash(cj, ci) * SETS[bi].ch.length)]; col = 'rgba(0,0,0,.35)'; }
          else if (r0 < 0.42) { ch = L > 0.45 ? '░' : L > 0.3 ? '▒' : '▓'; col = 'rgba(0,0,0,.22)'; }
          if (ch) { g.fillStyle = col; g.fillText(ch, sx, sy); }
        }
        continue;
      }
      if (!seen(x, z)) { if (hash(ci, cj) < 0.12) { g.fillStyle = '#1a1e26'; g.fillText('·', sx, sy); } continue; }
      const hgt = D.H[k], rd = D.R[k], bi = D.B[k], r0 = hash(ci, cj);
      // hillshade from the height grid (light from the north-west)
      const kx = idx(x + step, z), kz = idx(x, z + step);
      const dhx = kx >= 0 ? D.H[kx] - hgt : 0, dhz = kz >= 0 ? D.H[kz] - hgt : 0;
      const shade = GW.clamp(0.85 - (dhx + dhz) * 0.9 / Math.max(1, step / 16), 0.4, 1.3);
      let ch, c;
      if (D.Lk[k] || rd < W.RIVER_W * 0.8) { ch = WATER[Math.floor(r0 * WATER.length)]; c = [86, 146, 228]; }
      else if (hgt > 14 || Math.max(Math.abs(x), Math.abs(z)) > half - 280) {
        ch = MOUNT[Math.floor(r0 * MOUNT.length)]; const t = GW.clamp((hgt - 10) / 30, 0, 1); c = [150 + 80 * t, 150 + 80 * t, 160 + 70 * t];
      } else {
        const set = SETS[bi]; const dense = D.Gr[k];
        if (r0 > (bi === 0 ? 0.5 : 0.25) + 0.6 * GW.clamp(dense, 0, 1) && bi !== 6) { if (r0 > 0.93) { ch = '.'; } else continue; }   // open ground breathes
        else ch = set.ch[Math.floor(hash(cj, ci) * set.ch.length)];
        c = set.col; if (D.BW[k] < 0.75) { const v = SETS[0].col, t = 1 - D.BW[k]; c = [GW.lerp(c[0], v[0], t * 0.5), GW.lerp(c[1], v[1], t * 0.5), GW.lerp(c[2], v[2], t * 0.5)]; }
      }
      if (ST === 'ink') {   // dark ink on parchment; shaded slopes get a hatch stroke
        const mount = MOUNT.includes(ch), water = WATER.includes(ch);
        g.globalAlpha = water ? 0.7 : mount ? 0.85 : 0.5; g.fillStyle = water ? '#2a4e72' : mount ? '#2a1c10' : '#3e3020'; g.fillText(ch, sx, sy);
        if (shade < 0.75 && !water) { g.globalAlpha = 0.35; g.fillStyle = '#2a1c10'; g.fillText('/', sx + CS * 0.45, sy); }
        g.globalAlpha = 1;
      } else {
        const b = shade * (1.05 + 0.25 * r0);
        g.globalAlpha = 0.78;
        g.fillStyle = rgb(Math.min(255, c[0] * b) | 0, Math.min(255, c[1] * b) | 0, Math.min(255, c[2] * b) | 0); g.fillText(ch, sx, sy);
        g.globalAlpha = 1;
      }
      // region borders: a faint dotted seam where the dominant land changes
      const kr = idx(x + cw, z), kd = idx(x, z + cw);
      if (((kr >= 0 && D.B[kr] !== bi) || (kd >= 0 && D.B[kd] !== bi)) && (ci + cj) % 2 === 0) { g.fillStyle = ST === 'ink' ? 'rgba(130,40,20,.55)' : 'rgba(230,220,190,.35)'; g.fillText(ST === 'ink' ? '-' : '·', sx + CS / 2, sy + CS / 2); }
    }
    // rivers and roads as ink lines
    const to = (x, z) => [w / 2 + (x - WM.cx) * px, h / 2 + (z - WM.cz) * px];
    const poly = (pts, style, width, dash) => { g.strokeStyle = style; g.lineWidth = width; g.setLineDash(dash || []); g.beginPath(); pts.forEach((p, i) => { const [a, b] = to(p[0], p[1]); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); };
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (ST === 'ink') {
      for (const r of W.ROAD_LINES) { if (!r.some(p => seen(p[0], p[1]))) continue; poly(r, 'rgba(90,50,24,.8)', Math.max(1.2, 1.6 * px), [6, 3, 1, 3]); }
      poly(W.RIVER_LINE, 'rgba(42,78,114,.85)', Math.max(2, W.RIVER_W * 1.6 * px), []); poly(W.RIVER_LINE, 'rgba(205,187,144,.9)', Math.max(0.6, W.RIVER_W * 0.5 * px), []);
    } else {
      for (const r of W.ROAD_LINES) { if (!r.some(p => seen(p[0], p[1]))) continue; poly(r, 'rgba(20,14,8,.8)', Math.max(3, 4.5 * px), []); poly(r, ST === 'ascii' ? 'rgba(255,200,120,.9)' : 'rgba(226,182,112,.85)', Math.max(1.2, 1.6 * px), ST === 'ascii' ? [1, 4] : [5, 4]); }
      poly(W.RIVER_LINE, 'rgba(10,24,48,.9)', Math.max(4, W.RIVER_W * 2.6 * px), []);
      poly(W.RIVER_LINE, 'rgba(96,160,240,.95)', Math.max(2, W.RIVER_W * 1.7 * px), []);
      poly(W.RIVER_LINE, 'rgba(200,228,255,.55)', 1, [2, 6]);
    }
    g.setLineDash([]);
    // the old-chart grid: 1 km squares, lettered and numbered at the frame
    g.strokeStyle = ST === 'ink' ? 'rgba(60,40,20,.18)' : 'rgba(220,210,180,.07)'; g.lineWidth = 1;
    for (let k = -4; k <= 4; k++) { const [gx] = to(k * S / 8, 0), [, gy] = to(0, k * S / 8); g.beginPath(); g.moveTo(gx, 0); g.lineTo(gx, h); g.moveTo(0, gy); g.lineTo(w, gy); g.stroke(); }
    return cv;
  }

  // ---------- labels, icons, frame (redrawn every time) ----------
  function halo(g, text, x, y, fill, lw) {
    const ink = style() === 'ink' && !halo.keep;
    g.lineWidth = lw || 4; g.strokeStyle = ink ? 'rgba(222,206,166,.92)' : 'rgba(4,5,8,.85)'; g.strokeText(text, x, y); g.fillStyle = ink ? '#2a1a0e' : fill; g.fillText(text, x, y);
  }
  function spaced(s, n) { return s.split('').join(' '.repeat(n || 1)); }
  UI.drawWorldMap = function (G) {
    if (!WM.open) return;
    const c = $('wm'), dpr = Math.min(2, devicePixelRatio || 1), w = innerWidth, h = innerHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(terrainLayer(G, w, h, dpr), 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = GW.World, D = W.mapData(), S = W.SIZE, px = pxPerM(w, h), P = G.player, seen = seenFn(G), t = performance.now() / 1000;
    const to = (x, z) => [w / 2 + (x - WM.cx) * px, h / 2 + (z - WM.cz) * px];
    const onScreen = (x, y, m) => x > -m && y > -m && x < w + m && y < h + m;
    const feats = [];   // hover targets: {x, y, name, sub}
    const placed = [], free = (x, y, w2, h2) => { if (placed.some(r => Math.abs(r[0] - x) < (r[2] + w2) / 2 && Math.abs(r[1] - y) < (r[3] + h2) / 2)) return false; placed.push([x, y, w2, h2]); return true; };
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    // vignette
    const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, style() === 'ink' ? 'rgba(70,44,20,.55)' : 'rgba(0,0,0,.6)'); g.fillStyle = vg; g.fillRect(0, 0, w, h);
    // region titles (fade out as you zoom in)
    const ta = GW.clamp((7 - WM.zoom) / 4, 0, 1);
    if (ta > 0.02) {
      const keys = ['vale'].concat(W.BIOMES);
      keys.forEach((k, i) => { const cen = i === 0 ? { x: 0, z: 260 } : D.centroids[i]; if (!cen || !seen(cen.x, cen.z)) return; const R = W.REGIONS[k];
        let [x, y] = to(cen.x, cen.z); if (!onScreen(x, y, 200)) return;
        if (i > 0) { const hb = W.HUBS.find(q => q.id === k); if (hb) { const [, hy] = to(W.L[hb.at].x, W.L[hb.at].z); if (Math.abs(y - hy) < 56) y = hy + (y >= hy ? 56 : -50); } }
        g.globalAlpha = ta; g.font = `600 ${Math.round(GW.clamp(15 + WM.zoom * 4, 16, 30))}px ui-monospace, Menlo, monospace`;
        halo(g, spaced(R.name.replace(/^THE /, '')), x, y, R.col, 6);
        g.font = `italic ${Math.round(GW.clamp(10 + WM.zoom, 11, 14))}px Georgia, serif`; halo(g, '— ' + R.sub + ' —', x, y + 22, 'rgba(230,224,206,.75)', 4);
        g.globalAlpha = 1; });
    }
    // named places (zones) and villages
    for (const z of W.ZONES) {
      if (!seen(z.x, z.z)) continue; const [x, y] = to(z.x, z.z); if (!onScreen(x, y, 60)) continue;
      const hub = W.HUBS.find(hb => Math.hypot(W.L[hb.at].x - z.x, W.L[hb.at].z - z.z) < 60);
      if (!hub && WM.zoom < 3.2 && z.r < 80) continue;
      if (hub) {
        const label = '⌂ ' + spaced(hub.name.toUpperCase());
        g.font = `bold ${Math.round(GW.clamp(10 + WM.zoom * 0.9, 11, 15))}px ui-monospace, Menlo, monospace`;
        const tw = g.measureText(label).width + 14; free(x, y - 12, tw, 20);
        g.fillStyle = 'rgba(8,8,10,.82)'; g.fillRect(x - tw / 2, y - 21, tw, 18); g.strokeStyle = 'rgba(232,190,110,.8)'; g.lineWidth = 1; g.strokeRect(x - tw / 2 + 0.5, y - 20.5, tw - 1, 17);
        g.fillStyle = '#f0c878'; g.fillText(label, x, y - 12);
        g.fillStyle = '#ffd890'; g.font = 'bold 14px ui-monospace, Menlo, monospace'; g.fillText('⌂', x, y + 2);
        feats.push({ x, y, name: hub.name, sub: 'village · trader, bounties, a fire to rest', wx: z.x, wz: z.z });
      } else {
        g.font = `${Math.round(GW.clamp(9 + WM.zoom * 0.6, 10, 13))}px ui-monospace, Menlo, monospace`;
        const lw3 = g.measureText('◇ ' + z.name).width + 6;
        if (free(x, y - 10, lw3, 15)) halo(g, '◇ ' + z.name, x, y - 10, 'rgba(214,218,230,.9)', 3); else { g.fillStyle = 'rgba(214,218,230,.9)'; g.fillText('◇', x, y - 10); }
        feats.push({ x, y: y - 10, name: z.name, sub: 'landmark', wx: z.x, wz: z.z });
      }
    }
    // points of interest
    if (WM.zoom > 2.4) {
      const PC = W.POI_CELL, pxPad = 16, i0 = Math.floor((WM.cx - w / 2 / px) / PC) - 1, i1 = Math.ceil((WM.cx + w / 2 / px) / PC) + 1, j0 = Math.floor((WM.cz - h / 2 / px) / PC) - 1, j1 = Math.ceil((WM.cz + h / 2 / px) / PC) + 1;
      const big = WM.zoom > 6;
      g.font = `bold ${big ? 14 : 12}px ui-monospace, Menlo, monospace`;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const p = W.poiAt(i, j); if (!p || !POI_ICON[p.type]) continue;
        if (WM.zoom < 5 && !LANDMARK[p.type]) continue;
        if (!reveal() && !(G.poiSeen && G.poiSeen[p.id])) continue;
        const [x, y] = to(p.x, p.z); if (!onScreen(x, y, pxPad)) continue;
        const ic = POI_ICON[p.type], done = (G.cleared && G.cleared[p.id]) || (G.opened && G.opened['poi:' + p.id]);
        g.globalAlpha = done ? 0.4 : 1;
        g.fillStyle = 'rgba(6,7,10,.75)'; g.beginPath(); g.arc(x, y, big ? 9 : 7.5, 0, Math.PI * 2); g.fill();
        g.strokeStyle = ic[1]; g.lineWidth = 1; g.globalAlpha *= 0.6; g.stroke(); g.globalAlpha = done ? 0.4 : 1;
        g.fillStyle = ic[1]; g.fillText(ic[0], x, y + 0.5);
        if (big) { g.font = '10px ui-monospace, Menlo, monospace'; halo(g, 'lv ' + p.lvl, x, y + 15, 'rgba(200,200,210,.8)', 3); g.font = 'bold 14px ui-monospace, Menlo, monospace'; }
        g.globalAlpha = 1;
        feats.push({ x, y, name: ic[2].replace(/^./, s => s.toUpperCase()) + (p.name ? ': ' + p.name : ''), sub: (W.REGIONS[p.region] || {}).name.toLowerCase() + ' · level ' + p.lvl + (done ? ' · cleared' : ''), wx: p.x, wz: p.z });
      }
    }
    // fires, forges, chests from the hand-placed world
    g.font = 'bold 14px ui-monospace, Menlo, monospace';
    for (const f of W.fires) { if (!seen(f.x, f.z)) continue; const [x, y] = to(f.x, f.z); if (!onScreen(x, y, 10)) continue;
      g.fillStyle = f.out ? '#6a4a34' : '#ff9a40'; g.shadowColor = '#ff7020'; g.shadowBlur = f.out ? 0 : 6; g.fillText(f.out ? '△' : '▲', x, y); g.shadowBlur = 0;
      feats.push({ x, y, name: (f.rest && f.rest.name) || 'Campfire', sub: f.out ? 'burnt out' : 'fire · rest and travel', wx: f.x, wz: f.z }); }
    for (const it of W.interact) { if (it.type === 'forge') { const [x, y] = to(it.x, it.z); if (onScreen(x, y, 10)) { g.fillStyle = '#ffcf6a'; g.fillText('π', x, y); feats.push({ x, y, name: 'Anvil', sub: 'forge · craft abilities', wx: it.x, wz: it.z }); } } }
    // bosses
    for (const e of G.enemies) if (e.alive && e.T.boss && seen(e.pos.x, e.pos.z)) { const [x, y] = to(e.pos.x, e.pos.z); if (!onScreen(x, y, 10)) continue;
      g.font = 'bold 18px ui-monospace, Menlo, monospace'; g.fillStyle = '#ff4a3a'; g.shadowColor = '#ff2010'; g.shadowBlur = 8 + 4 * Math.sin(t * 3); g.fillText('Ω', x, y); g.shadowBlur = 0;
      feats.push({ x, y, name: e.T.name, sub: 'boss · level ' + (e.lvl || 1), wx: e.pos.x, wz: e.pos.z }); }
    // objective, waypoint, player
    g.font = 'bold 16px ui-monospace, Menlo, monospace';
    const obj = G.objective && G.objective(); if (obj) { const [x, y] = to(obj.x, obj.z); g.fillStyle = '#ffd860'; g.shadowColor = '#ffb020'; g.shadowBlur = 10; g.fillText('◆', x, y); g.shadowBlur = 0;
      g.strokeStyle = 'rgba(255,216,96,.5)'; g.beginPath(); g.arc(x, y, 10 + 4 * ((t * 1.5) % 1), 0, Math.PI * 2); g.stroke(); feats.push({ x, y, name: 'Objective', sub: 'quest', wx: obj.x, wz: obj.z }); }
    if (G.waypoint) { const [x, y] = to(G.waypoint.x, G.waypoint.z); g.fillStyle = '#6ae8ff'; g.shadowColor = '#40c0ff'; g.shadowBlur = 8; g.fillText('✚', x, y); g.shadowBlur = 0; feats.push({ x, y, name: 'Your mark', sub: 'click it again to remove', wx: G.waypoint.x, wz: G.waypoint.z }); }
    { const [x, y] = to(P.pos.x, P.pos.z);
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 9 + 5 * ((t * 1.2) % 1), 0, Math.PI * 2); g.stroke();
      g.save(); g.translate(x, y); g.rotate(-P.visYaw + Math.PI); g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 8; g.font = 'bold 16px ui-monospace, Menlo, monospace'; g.fillText('▲', 0, 0); g.restore();
      feats.push({ x, y, name: 'You', sub: (W.REGIONS[W.regionAt(P.pos.x, P.pos.z)] || {}).name.toLowerCase(), wx: P.pos.x, wz: P.pos.z }); }

    // ---------- the frame: double rule, grid letters, cartouche, compass rose, scale bar ----------
    const M = 18, ink = 'rgba(214,196,150,.75)';
    g.strokeStyle = ink; g.lineWidth = 1; g.strokeRect(M + 0.5, M + 0.5, w - 2 * M - 1, h - 2 * M - 1); g.strokeStyle = 'rgba(214,196,150,.35)'; g.strokeRect(M + 4.5, M + 4.5, w - 2 * M - 9, h - 2 * M - 9);
    g.font = 'bold 13px ui-monospace, Menlo, monospace'; g.fillStyle = ink; ['◈', '◈', '◈', '◈'].forEach((s, i) => g.fillText(s, i % 2 ? w - M : M, i < 2 ? M : h - M));
    g.font = '10px ui-monospace, Menlo, monospace'; g.fillStyle = 'rgba(214,196,150,.8)';
    for (let k = 0; k < 8; k++) { const [gx] = to(-S / 2 + (k + 0.5) * S / 8, 0), [, gy] = to(0, -S / 2 + (k + 0.5) * S / 8);
      if (gx > M + 10 && gx < w - M - 10) { g.fillText('ABCDEFGH'[k], gx, M + 12); g.fillText('ABCDEFGH'[k], gx, h - M - 12); }
      if (gy > M + 10 && gy < h - M - 10) { g.fillText(String(k + 1), M + 12, gy); g.fillText(String(k + 1), w - M - 12, gy); } }
    // cartouche
    { const title = '══ ◈  ' + spaced('THE NINEFOLD', 1) + '  ◈ ══'; g.font = 'bold 15px ui-monospace, Menlo, monospace'; const tw = g.measureText(title).width + 24;
      g.fillStyle = 'rgba(6,6,8,.88)'; g.fillRect(w / 2 - tw / 2, M + 18, tw, 28); g.strokeStyle = ink; g.strokeRect(w / 2 - tw / 2 + 0.5, M + 18.5, tw - 1, 27);
      g.fillStyle = '#e8d8a8'; g.fillText(title, w / 2, M + 32);
      const here = W.REGIONS[W.regionAt(WM.cx, WM.cz)]; if (here) { g.font = 'italic 12px Georgia, serif'; halo(g, here.name.toLowerCase() + '  ·  ' + STYLE_NAME[style()].toLowerCase() + ' (V)', w / 2, M + 58, here.col, 3); } }
    // compass rose
    { const cx = w - M - 58, cy = M + 64, col = 'rgba(232,216,170,.85)'; g.font = 'bold 13px ui-monospace, Menlo, monospace';
      g.fillStyle = 'rgba(6,6,8,.7)'; g.beginPath(); g.arc(cx, cy, 34, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(214,196,150,.5)'; g.stroke();
      g.fillStyle = '#ffcf6a'; g.fillText('N', cx, cy - 25); g.fillStyle = col; g.fillText('S', cx, cy + 25); g.fillText('W', cx - 25, cy); g.fillText('E', cx + 25, cy);
      g.fillStyle = '#ffcf6a'; g.fillText('▲', cx, cy - 12); g.fillStyle = col; g.fillText('▼', cx, cy + 12); g.fillText('◄', cx - 12, cy); g.fillText('►', cx + 12, cy); g.fillText('✦', cx, cy); }
    // scale bar
    { const nice = [25, 50, 100, 250, 500, 1000, 2000, 4000]; let m = nice[0]; for (const n of nice) if (n * px <= 150) m = n;
      const bx = M + 24, by = h - M - 30, L = m * px; g.strokeStyle = ink; g.lineWidth = 2; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + L, by); g.moveTo(bx, by - 5); g.lineTo(bx, by + 5); g.moveTo(bx + L, by - 5); g.lineTo(bx + L, by + 5); g.moveTo(bx + L / 2, by - 3); g.lineTo(bx + L / 2, by + 3); g.stroke();
      g.font = '11px ui-monospace, Menlo, monospace'; g.textAlign = 'left'; halo(g, (m >= 1000 ? m / 1000 + ' km' : m + ' m'), bx + L + 8, by, 'rgba(232,216,170,.9)', 3); g.textAlign = 'center'; }
    // legend
    if (w > 760) {
      const items = [['▲', '#ff9a40', 'fire'], ['⌂', '#ffd890', 'village'], ['Ω', '#ff4a3a', 'boss'], ['◆', '#ffd860', 'objective'], ['✚', '#6ae8ff', 'your mark'], ['π', '#ffcf6a', 'anvil']]
        .concat(Object.values(POI_ICON).map(v => [v[0], v[1], v[2]]));
      const lx = w - M - 186, ly = h - M - 22 - Math.ceil(items.length / 2) * 17, lw2 = 176;
      g.fillStyle = 'rgba(6,6,8,.8)'; g.fillRect(lx - 10, ly - 22, lw2 + 14, Math.ceil(items.length / 2) * 17 + 30); g.strokeStyle = 'rgba(214,196,150,.4)'; g.strokeRect(lx - 9.5, ly - 21.5, lw2 + 13, Math.ceil(items.length / 2) * 17 + 29);
      g.font = '10px ui-monospace, Menlo, monospace'; g.fillStyle = 'rgba(214,196,150,.8)'; g.textAlign = 'left'; g.fillText(spaced('LEGEND'), lx, ly - 10);
      items.forEach((it, i) => { const x = lx + (i % 2) * 92, y = ly + 6 + Math.floor(i / 2) * 17; g.font = 'bold 12px ui-monospace, Menlo, monospace'; g.fillStyle = it[1]; g.fillText(it[0], x, y);
        g.font = '10px ui-monospace, Menlo, monospace'; g.fillStyle = 'rgba(210,210,220,.8)'; g.fillText(it[2], x + 14, y); });
      g.textAlign = 'center';
    }
    if (!reveal() && G.fog) { g.font = 'italic 11px Georgia, serif'; halo(g, 'unexplored land stays uncharted', w / 2, h - M - 14, 'rgba(200,200,210,.6)', 3); }
    // hover tooltip
    WM.hover = null;
    if (WM.mouse && !WM.drag) {
      let best = null, bd = 16; for (const f of feats) { const d = Math.hypot(f.x - WM.mouse.x, f.y - WM.mouse.y); if (d < bd) { bd = d; best = f; } }
      if (best) {
        WM.hover = best; const dist = Math.round(Math.hypot(best.wx - P.pos.x, best.wz - P.pos.z));
        const l1 = best.name, l2 = best.sub + (best.name === 'You' ? '' : ' · ' + (dist >= 1000 ? (dist / 1000).toFixed(1) + ' km' : dist + ' m'));
        g.font = 'bold 12px ui-monospace, Menlo, monospace'; const w1 = g.measureText(l1).width; g.font = '11px ui-monospace, Menlo, monospace'; const w2 = g.measureText(l2).width;
        const bw = Math.max(w1, w2) + 18, bx = GW.clamp(best.x + 14, 4, w - bw - 4), by = GW.clamp(best.y - 44, 4, h - 44);
        g.fillStyle = 'rgba(8,8,12,.92)'; g.fillRect(bx, by, bw, 38); g.strokeStyle = 'rgba(232,200,130,.7)'; g.strokeRect(bx + 0.5, by + 0.5, bw - 1, 37);
        g.textAlign = 'left'; g.font = 'bold 12px ui-monospace, Menlo, monospace'; g.fillStyle = '#f0e0b8'; g.fillText(l1, bx + 9, by + 12);
        g.font = '11px ui-monospace, Menlo, monospace'; g.fillStyle = '#a8acb8'; g.fillText(l2, bx + 9, by + 27); g.textAlign = 'center';
      }
    }
  };
  UI.toggleMap = function (G, on) {
    if (G.dungeon && on !== false) { UI.toast('No map down here.', 1.5); return; }
    WM.open = on === undefined ? !WM.open : on;
    $('worldmap').classList.toggle('hidden', !WM.open);
    if (WM.open) {
      if (!GW.World._mapReady) { UI.toast('Charting the land…', 1.2); }
      WM.cx = G.player.pos.x; WM.cz = G.player.pos.z; WM.zoom = WM.zoom > 1.01 ? WM.zoom : 5; if (UI.mapStyleLabel) UI.mapStyleLabel();
      setTimeout(() => { GW.World.mapData(); GW.World._mapReady = true; UI.drawWorldMap(G); }, 20);
    }
  };
  (function mapInput() {
    const c = $('wm'); if (!c) return;
    const redraw = () => UI.drawWorldMap(GW.G);
    const btn = $('wm-style'), label = () => { if (btn) btn.textContent = '◈ ' + STYLE_NAME[style()] + '  (V)'; };
    function cycle() { const i = STYLES.indexOf(style()); UI.settings.mapStyle = STYLES[(i + 1) % STYLES.length]; UI.saveSettings && UI.saveSettings(); UI.toast(STYLE_NAME[UI.settings.mapStyle], 1.2); label(); const ms = $('o-mapstyle'); if (ms) ms.value = UI.settings.mapStyle; redraw(); }
    if (btn) { btn.addEventListener('pointerdown', e => e.stopPropagation()); btn.addEventListener('click', e => { e.stopPropagation(); cycle(); }); }
    UI.mapStyleLabel = label;
    c.addEventListener('wheel', e => {
      const w = innerWidth, h = innerHeight, px0 = pxPerM(w, h), mx = e.clientX, my = e.clientY;
      const wx = WM.cx + (mx - w / 2) / px0, wz = WM.cz + (my - h / 2) / px0;   // zoom about the cursor
      WM.zoom = GW.clamp(WM.zoom * (e.deltaY < 0 ? 1.18 : 1 / 1.18), 0.9, 48);
      const px1 = pxPerM(w, h); WM.cx = wx - (mx - w / 2) / px1; WM.cz = wz - (my - h / 2) / px1; redraw(); e.preventDefault();
    }, { passive: false });
    c.addEventListener('pointerdown', e => { WM.drag = { x: e.clientX, y: e.clientY, cx: WM.cx, cz: WM.cz }; WM.moved = false; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', e => {
      WM.mouse = { x: e.clientX, y: e.clientY };
      if (WM.drag) { const px = pxPerM(innerWidth, innerHeight), dx = e.clientX - WM.drag.x, dy = e.clientY - WM.drag.y; if (Math.hypot(dx, dy) > 4) WM.moved = true;
        WM.cx = WM.drag.cx - dx / px; WM.cz = WM.drag.cz - dy / px; }
      redraw();
    });
    c.addEventListener('pointerleave', () => { WM.mouse = null; redraw(); });
    c.addEventListener('pointerup', e => {
      const was = WM.drag; WM.drag = null;
      if (was && !WM.moved && e.button === 0) {   // a click: drop or lift your mark
        const G = GW.G, px = pxPerM(innerWidth, innerHeight), x = WM.cx + (e.clientX - innerWidth / 2) / px, z = WM.cz + (e.clientY - innerHeight / 2) / px;
        if (G.waypoint && WM.hover && WM.hover.name === 'Your mark') { G.waypoint = null; GWAudio.sfx('ui'); }
        else { G.waypoint = WM.hover && WM.hover.name !== 'You' ? { x: WM.hover.wx, z: WM.hover.wz } : { x, z }; GWAudio.sfx('socket'); }
      }
      redraw();
    });
    addEventListener('keydown', e => { if (!WM.open) return;
      if (e.code === 'Equal' || e.code === 'NumpadAdd') { WM.zoom = GW.clamp(WM.zoom * 1.25, 0.9, 48); redraw(); }
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') { WM.zoom = GW.clamp(WM.zoom / 1.25, 0.9, 48); redraw(); }
      if (e.code === 'KeyV') cycle();
      if (e.code === 'Space') { WM.cx = GW.G.player.pos.x; WM.cz = GW.G.player.pos.z; redraw(); e.preventDefault(); } });
  })();
})();

/* Ctrl+Alt+Survive — every sprite and icon is drawn procedurally onto canvases at startup */
(function (C) {
  'use strict';
  const RES = 2;
  const cache = {}, flashCache = {}, iconCache = {};

  function mk(w, h, fn) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * RES); c.height = Math.ceil(h * RES);
    const x = c.getContext('2d');
    x.scale(RES, RES);
    x.lineJoin = 'round'; x.lineCap = 'round';
    fn(x, w, h);
    c.w = w; c.h = h;
    return c;
  }
  function rr(x, X, Y, W, H, R) {
    x.beginPath();
    x.moveTo(X + R, Y); x.lineTo(X + W - R, Y); x.quadraticCurveTo(X + W, Y, X + W, Y + R);
    x.lineTo(X + W, Y + H - R); x.quadraticCurveTo(X + W, Y + H, X + W - R, Y + H);
    x.lineTo(X + R, Y + H); x.quadraticCurveTo(X, Y + H, X, Y + H - R);
    x.lineTo(X, Y + R); x.quadraticCurveTo(X, Y, X + R, Y); x.closePath();
  }
  function lg(x, x0, y0, x1, y1, stops) { const g = x.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; }
  function rg(x, cx, cy, r, stops) { const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; }
  function circ(x, cx, cy, r, fill, stroke, lw) { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); if (fill) { x.fillStyle = fill; x.fill(); } if (stroke) { x.lineWidth = lw || 1; x.strokeStyle = stroke; x.stroke(); } }
  function poly(x, pts) { x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); x.closePath(); }
  function txt(x, s, X, Y, size, col, weight, font) { x.font = (weight || 'bold') + ' ' + size + 'px ' + (font || 'Tahoma, Verdana, sans-serif'); x.fillStyle = col; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s, X, Y); }
  function shortcut(x, X, Y) { x.fillStyle = '#fff'; x.fillRect(X, Y, 7, 7); x.strokeStyle = '#555'; x.lineWidth = 0.7; x.strokeRect(X, Y, 7, 7); x.strokeStyle = '#1a4fd1'; x.lineWidth = 1.3; x.beginPath(); x.moveTo(X + 1.8, Y + 5.5); x.quadraticCurveTo(X + 2, Y + 2.5, X + 5, Y + 2.2); x.stroke(); poly(x, [X + 4, Y + 0.8, X + 6.2, Y + 2.2, X + 4, Y + 3.8]); x.fillStyle = '#1a4fd1'; x.fill(); }

  /* -------- primitives shared by sprites and icons -------- */
  const P = {
    folder(x, X, Y, W, H, col) {
      col = col || ['#fff3b0', '#f3c74b', '#c8901c'];
      x.fillStyle = col[2]; rr(x, X, Y, W * 0.45, H * 0.3, 1.5); x.fill();
      x.fillStyle = lg(x, 0, Y, 0, Y + H, [col[0], col[1]]); rr(x, X, Y + H * 0.16, W, H * 0.84, 1.5); x.fill();
      x.strokeStyle = col[2]; x.lineWidth = 0.8; x.stroke();
    },
    page(x, X, Y, W, H) {
      x.fillStyle = '#fff'; poly(x, [X, Y, X + W * 0.72, Y, X + W, Y + H * 0.22, X + W, Y + H, X, Y + H]); x.fill();
      x.strokeStyle = '#7d8aa5'; x.lineWidth = 0.8; x.stroke();
      x.fillStyle = '#4a74d8'; x.fillRect(X + 1.5, Y + 1.5, W * 0.55, H * 0.12);
      x.fillStyle = '#9fb0cf'; for (let i = 0; i < 4; i++) x.fillRect(X + 2, Y + H * (0.35 + i * 0.15), W - 4, 0.9);
    },
    floppy(x, X, Y, S, body) {
      x.fillStyle = body || '#2b4fae'; rr(x, X, Y, S, S, S * 0.08); x.fill();
      x.strokeStyle = '#0d1f55'; x.lineWidth = S * 0.05; x.stroke();
      x.fillStyle = '#c9ced8'; x.fillRect(X + S * 0.25, Y, S * 0.5, S * 0.32);
      x.fillStyle = '#3a3f4a'; x.fillRect(X + S * 0.52, Y + S * 0.05, S * 0.1, S * 0.22);
      x.fillStyle = '#fff'; x.fillRect(X + S * 0.15, Y + S * 0.5, S * 0.7, S * 0.42);
      x.fillStyle = '#e64a3b'; x.fillRect(X + S * 0.15, Y + S * 0.5, S * 0.7, S * 0.08);
    },
    disc(x, cx, cy, r, gold) {
      const g = x.createConicGradient ? x.createConicGradient(0, cx, cy) : null;
      if (g) {
        const cs = gold ? ['#ffe38a', '#ffb347', '#fff2c4', '#ffcf5a', '#ffe38a'] : ['#e8f4ff', '#ffc6f2', '#c8ffe1', '#c9d6ff', '#fff6b8', '#e8f4ff'];
        cs.forEach((c, i) => g.addColorStop(i / (cs.length - 1), c));
        x.fillStyle = g;
      } else x.fillStyle = gold ? '#ffcf5a' : '#dde6f5';
      circ(x, cx, cy, r); x.fill();
      x.strokeStyle = gold ? '#a56a00' : '#7c8798'; x.lineWidth = r * 0.08; x.stroke();
      circ(x, cx, cy, r * 0.36, 'rgba(255,255,255,0.7)', gold ? '#a56a00' : '#8a94a6', r * 0.05);
      circ(x, cx, cy, r * 0.16, '#ffffff00', '#666', r * 0.05);
      x.globalCompositeOperation = 'destination-out'; circ(x, cx, cy, r * 0.14, '#000'); x.globalCompositeOperation = 'source-over';
    },
    envelope(x, X, Y, W, H) {
      x.fillStyle = '#fbfbfb'; rr(x, X, Y, W, H, 1); x.fill(); x.strokeStyle = '#6f7787'; x.lineWidth = 0.9; x.stroke();
      x.beginPath(); x.moveTo(X + 0.5, Y + 0.8); x.lineTo(X + W / 2, Y + H * 0.58); x.lineTo(X + W - 0.5, Y + 0.8); x.stroke();
    },
    bin(x, X, Y, W, H) {
      x.fillStyle = lg(x, X, 0, X + W, 0, ['#9aa3ad', '#e9eef2', '#9aa3ad']);
      poly(x, [X, Y + H * 0.12, X + W, Y + H * 0.12, X + W * 0.86, Y + H, X + W * 0.14, Y + H]); x.fill();
      x.strokeStyle = '#5b636c'; x.lineWidth = 0.8; x.stroke();
      x.fillStyle = '#c9d0d6'; rr(x, X - 1, Y, W + 2, H * 0.14, 1.5); x.fill(); x.stroke();
      // green recycle arrows (simple triangle of arrows)
      x.strokeStyle = '#2aa84a'; x.lineWidth = W * 0.09;
      const cx = X + W / 2, cy = Y + H * 0.58, r = W * 0.22;
      for (let i = 0; i < 3; i++) { const a = i * 2.094 - 1.57; x.beginPath(); x.arc(cx, cy, r, a + 0.3, a + 1.75); x.stroke(); }
    },
    bucket(x, X, Y, S) {
      x.fillStyle = lg(x, X, 0, X + S, 0, ['#8a96a8', '#dfe6ef', '#8a96a8']);
      poly(x, [X + S * 0.12, Y + S * 0.3, X + S * 0.82, Y + S * 0.3, X + S * 0.74, Y + S, X + S * 0.2, Y + S]); x.fill();
      x.strokeStyle = '#4c5563'; x.lineWidth = S * 0.06; x.stroke();
      x.beginPath(); x.ellipse(X + S * 0.47, Y + S * 0.3, S * 0.35, S * 0.1, 0, 0, Math.PI * 2); x.fillStyle = '#e8416b'; x.fill(); x.stroke();
      x.beginPath(); x.arc(X + S * 0.47, Y + S * 0.3, S * 0.32, Math.PI, 0); x.stroke();
      x.fillStyle = '#e8416b'; x.beginPath(); x.ellipse(X + S * 0.88, Y + S * 0.5, S * 0.08, S * 0.18, 0, 0, Math.PI * 2); x.fill();
    },
    monitor(x, X, Y, W, H, screen) {
      x.fillStyle = lg(x, 0, Y, 0, Y + H, ['#f1efe6', '#c9c5b8']); rr(x, X, Y, W, H * 0.8, W * 0.06); x.fill();
      x.strokeStyle = '#6d6a60'; x.lineWidth = W * 0.03; x.stroke();
      x.fillStyle = screen || lg(x, 0, Y, 0, Y + H * 0.7, ['#6fb0ff', '#1d5fd1']); x.fillRect(X + W * 0.1, Y + H * 0.08, W * 0.8, H * 0.6);
      x.fillStyle = '#a8a497'; x.fillRect(X + W * 0.4, Y + H * 0.8, W * 0.2, H * 0.1);
      x.fillStyle = '#d6d2c6'; rr(x, X + W * 0.22, Y + H * 0.88, W * 0.56, H * 0.12, 1); x.fill(); x.stroke();
    },
    shield(x, X, Y, W, H, col) {
      x.fillStyle = lg(x, X, Y, X + W, Y + H, col || ['#7fb6ff', '#1a4fd1']);
      x.beginPath(); x.moveTo(X + W / 2, Y); x.lineTo(X + W, Y + H * 0.18); x.quadraticCurveTo(X + W, Y + H * 0.75, X + W / 2, Y + H);
      x.quadraticCurveTo(X, Y + H * 0.75, X, Y + H * 0.18); x.closePath(); x.fill();
      x.strokeStyle = '#0d2a7a'; x.lineWidth = W * 0.06; x.stroke();
    },
    bolt(x, X, Y, S, col) {
      poly(x, [X + S * 0.58, Y, X + S * 0.15, Y + S * 0.58, X + S * 0.45, Y + S * 0.58, X + S * 0.32, Y + S, X + S * 0.85, Y + S * 0.38, X + S * 0.55, Y + S * 0.38, X + S * 0.7, Y]);
      x.fillStyle = col || '#ffd23f'; x.fill(); x.strokeStyle = '#8a5a00'; x.lineWidth = S * 0.05; x.stroke();
    },
    chip(x, X, Y, S, col) {
      x.strokeStyle = '#b8b8b8'; x.lineWidth = S * 0.05;
      for (let i = 0; i < 4; i++) { const o = S * (0.28 + i * 0.15); [[X + o, Y + S * 0.05, X + o, Y + S * 0.2], [X + o, Y + S * 0.8, X + o, Y + S * 0.95], [X + S * 0.05, Y + o, X + S * 0.2, Y + o], [X + S * 0.8, Y + o, X + S * 0.95, Y + o]].forEach(l => { x.beginPath(); x.moveTo(l[0], l[1]); x.lineTo(l[2], l[3]); x.stroke(); }); }
      x.fillStyle = col || '#2c2f36'; rr(x, X + S * 0.18, Y + S * 0.18, S * 0.64, S * 0.64, S * 0.06); x.fill();
      x.fillStyle = '#c9a24a'; x.fillRect(X + S * 0.38, Y + S * 0.38, S * 0.24, S * 0.24);
    },
    magnifier(x, X, Y, S) {
      x.strokeStyle = '#5d4a2c'; x.lineWidth = S * 0.14; x.beginPath(); x.moveTo(X + S * 0.62, Y + S * 0.62); x.lineTo(X + S * 0.92, Y + S * 0.92); x.stroke();
      circ(x, X + S * 0.4, Y + S * 0.4, S * 0.3, 'rgba(190,230,255,0.75)', '#3c4a5c', S * 0.08);
    },
    coin(x, cx, cy, r) {
      circ(x, cx, cy, r, rg(x, cx, cy, r, ['#fff6b0', '#ffcc33', '#c58a00']), '#8a5a00', r * 0.14);
      txt(x, '$', cx, cy + r * 0.05, r * 1.3, '#8a5a00');
    },
    arrowCursor(x, X, Y, S, fill) {
      const p = [0, 0, 0, 16, 4, 12.5, 6.8, 19, 9.2, 18, 6.5, 11.8, 11.5, 11.8];
      x.beginPath(); for (let i = 0; i < p.length; i += 2) { const px = X + p[i] * S, py = Y + p[i + 1] * S; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath();
      x.fillStyle = fill; x.fill(); x.strokeStyle = '#000'; x.lineWidth = 1.3 * S; x.stroke();
    },
    hand(x, X, Y, S, fill) {
      const shapes = [[5, 0, 3.4, 11, 1.7], [8.2, 6, 3, 7, 1.5], [11, 7, 3, 6.5, 1.5], [13.6, 8.4, 2.8, 5.5, 1.4], [3.2, 8, 13, 11.5, 3], [0.4, 10.2, 4.6, 3, 1.5]];
      x.strokeStyle = '#000'; x.lineWidth = 2.4 * S;
      shapes.forEach(s => { rr(x, X + s[0] * S, Y + s[1] * S, s[2] * S, s[3] * S, s[4] * S); x.stroke(); });
      x.fillStyle = fill;
      shapes.forEach(s => { rr(x, X + s[0] * S, Y + s[1] * S, s[2] * S, s[3] * S, s[4] * S); x.fill(); });
      x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 0.8 * S;
      [8.3, 11.1, 13.7].forEach(v => { x.beginPath(); x.moveTo(X + v * S, Y + 9 * S); x.lineTo(X + v * S, Y + 12 * S); x.stroke(); });
    },
    cross(x, cx, cy, S, fill) {
      x.strokeStyle = '#000'; x.lineWidth = 4 * S;
      x.beginPath(); x.arc(cx, cy, 7 * S, 0, 6.29); x.moveTo(cx - 11 * S, cy); x.lineTo(cx + 11 * S, cy); x.moveTo(cx, cy - 11 * S); x.lineTo(cx, cy + 11 * S); x.stroke();
      x.strokeStyle = fill; x.lineWidth = 2 * S; x.stroke();
      circ(x, cx, cy, 1.6 * S, fill, '#000', 0.8 * S);
    },
    crown(x, X, Y, S) {
      poly(x, [X, Y + 5 * S, X + 1.5 * S, Y, X + 3.5 * S, Y + 3 * S, X + 5 * S, Y - 0.5 * S, X + 6.5 * S, Y + 3 * S, X + 8.5 * S, Y, X + 10 * S, Y + 5 * S]);
      x.fillStyle = '#ffd23f'; x.fill(); x.strokeStyle = '#8a5a00'; x.lineWidth = 0.8 * S; x.stroke();
    }
  };

  /* -------- world sprites: [w, h, draw] -------- */
  const DEF = {
    gem_b: [8, 11, x => { poly(x, [4, 0.5, 7.5, 5, 4, 10.5, 0.5, 5]); x.fillStyle = lg(x, 0, 0, 8, 11, ['#bfe3ff', '#3b8cff', '#1a4fd1']); x.fill(); x.strokeStyle = '#0d2a7a'; x.lineWidth = 0.8; x.stroke(); x.fillStyle = 'rgba(255,255,255,.8)'; poly(x, [4, 1.5, 5.5, 5, 4, 4.5]); x.fill(); }],
    gem_g: [9, 12, x => { poly(x, [4.5, 0.5, 8.5, 5.5, 4.5, 11.5, 0.5, 5.5]); x.fillStyle = lg(x, 0, 0, 9, 12, ['#d6ffd1', '#3ccf4e', '#13802a']); x.fill(); x.strokeStyle = '#0b4d18'; x.lineWidth = 0.8; x.stroke(); x.fillStyle = 'rgba(255,255,255,.8)'; poly(x, [4.5, 1.5, 6, 5.5, 4.5, 5]); x.fill(); }],
    gem_p: [11, 14, x => { poly(x, [5.5, 0.5, 10.5, 6.5, 5.5, 13.5, 0.5, 6.5]); x.fillStyle = lg(x, 0, 0, 11, 14, ['#ffd1f1', '#e03aa8', '#7a0f5a']); x.fill(); x.strokeStyle = '#4d0838'; x.lineWidth = 0.8; x.stroke(); x.fillStyle = 'rgba(255,255,255,.8)'; poly(x, [5.5, 1.5, 7.3, 6.5, 5.5, 6]); x.fill(); }],
    coin: [12, 12, x => P.coin(x, 6, 6, 5.4)],
    bigcoin: [18, 18, x => { P.coin(x, 7, 10, 6); P.coin(x, 11, 7, 6); }],
    patch: [16, 16, x => { x.fillStyle = '#fff'; rr(x, 1, 2, 14, 12, 2); x.fill(); x.strokeStyle = '#2b8a3e'; x.lineWidth = 1; x.stroke(); x.fillStyle = '#2fb84f'; x.fillRect(6.3, 4, 3.4, 8); x.fillRect(4, 6.3, 8, 3.4); }],
    defrag: [16, 16, x => { const c = ['#1a4fd1', '#e64a3b', '#ffffff', '#2fb84f']; x.fillStyle = '#222'; x.fillRect(1, 1, 14, 14); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = c[(i * 3 + j * 2 + (i > 1 ? 1 : 0)) % 4]; x.fillRect(2 + i * 3.2, 2 + j * 3.2, 2.7, 2.7); } }],
    format: [16, 16, x => { P.floppy(x, 1, 1, 14, '#222'); txt(x, 'FMT', 8, 11.8, 4, '#e64a3b'); }],
    freeze: [14, 16, x => { x.fillStyle = '#8a5a2b'; x.fillRect(1, 0.5, 12, 2); x.fillRect(1, 13.5, 12, 2); x.fillStyle = 'rgba(200,235,255,.9)'; poly(x, [2.5, 2.5, 11.5, 2.5, 7, 8, 11.5, 13.5, 2.5, 13.5, 7, 8]); x.fill(); x.strokeStyle = '#3a6fa8'; x.lineWidth = 0.8; x.stroke(); x.fillStyle = '#f3c74b'; poly(x, [4, 13.5, 10, 13.5, 7, 10]); x.fill(); }],
    zip: [22, 18, x => { P.folder(x, 1, 1, 20, 16, ['#fff7c8', '#f0c23a', '#b07b10']); x.fillStyle = '#555'; for (let i = 0; i < 6; i++) x.fillRect(i % 2 ? 10.6 : 9, 5 + i * 1.9, 2.4, 1.2); x.fillStyle = '#ccc'; x.fillRect(9.4, 15, 3, 1.8); }],
    // weapons
    floppy: [14, 14, x => P.floppy(x, 0.5, 0.5, 13)],
    zipdisk: [20, 20, x => { P.floppy(x, 0.5, 0.5, 19, '#1e88c9'); txt(x, 'ZIP', 10, 15.5, 5, '#1e88c9'); }],
    cd: [18, 18, x => P.disc(x, 9, 9, 8.5)],
    dvd: [20, 20, x => P.disc(x, 10, 10, 9.5, true)],
    mail: [14, 10, x => P.envelope(x, 0.5, 0.5, 13, 9)],
    mail2: [16, 11, x => { P.envelope(x, 0.5, 0.5, 15, 10); circ(x, 12.5, 2.5, 2.4, '#e64a3b'); }],
    bucket: [14, 14, x => P.bucket(x, 0, 0, 14)],
    binw: [22, 26, x => P.bin(x, 2, 1, 18, 24)],
    blackhole: [30, 30, x => { const g = x.createRadialGradient(15, 15, 2, 15, 15, 15); g.addColorStop(0, '#000'); g.addColorStop(0.55, '#1b0a33'); g.addColorStop(0.8, 'rgba(140,60,255,.6)'); g.addColorStop(1, 'rgba(140,60,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 30, 30); }],
    ico_folder: [20, 18, x => P.folder(x, 1, 1, 18, 16)],
    ico_page: [16, 20, x => P.page(x, 1, 1, 14, 18)],
    ico_exe: [20, 18, x => { x.fillStyle = '#fff'; rr(x, 1, 1, 18, 16, 1.5); x.fill(); x.strokeStyle = '#1c3f94'; x.lineWidth = 0.9; x.stroke(); x.fillStyle = lg(x, 0, 1, 0, 5, ['#4f86ea', '#1c3f94']); x.fillRect(1.5, 1.5, 17, 3.5); }],
    ico_disc: [18, 18, x => P.disc(x, 9, 9, 8.5)],
    // props (breakable shortcuts)
    prop_folder: [26, 24, x => { P.folder(x, 2, 2, 22, 18); shortcut(x, 1, 16); }],
    prop_page: [22, 26, x => { P.page(x, 3, 1, 17, 22); shortcut(x, 1, 18); }],
    prop_exe: [26, 24, x => { x.fillStyle = '#fff'; rr(x, 2, 2, 22, 18, 1.5); x.fill(); x.strokeStyle = '#1c3f94'; x.lineWidth = 0.9; x.stroke(); x.fillStyle = lg(x, 0, 2, 0, 7, ['#4f86ea', '#1c3f94']); x.fillRect(2.5, 2.5, 21, 4.5); txt(x, '?', 13, 13.5, 8, '#1c3f94'); shortcut(x, 1, 16); }],
    // enemies
    popup: [26, 21, x => {
      x.fillStyle = '#fff'; rr(x, 1, 1, 24, 19, 2); x.fill(); x.strokeStyle = '#1c3f94'; x.lineWidth = 1; x.stroke();
      x.fillStyle = lg(x, 0, 1, 0, 6, ['#4f86ea', '#1c3f94']); x.fillRect(1.5, 1.5, 23, 4.5);
      x.fillStyle = '#d9442f'; x.fillRect(20, 2.2, 3.6, 3); x.strokeStyle = '#fff'; x.lineWidth = 0.6; x.beginPath(); x.moveTo(20.7, 2.8); x.lineTo(22.9, 4.6); x.moveTo(22.9, 2.8); x.lineTo(20.7, 4.6); x.stroke();
      txt(x, 'WIN!', 13, 11.3, 7, '#e11d48'); x.fillStyle = '#ffd23f'; x.fillRect(5, 15, 16, 3); x.strokeStyle = '#b07b10'; x.lineWidth = 0.5; x.strokeRect(5, 15, 16, 3);
    }],
    spam: [20, 15, x => { P.envelope(x, 1, 1, 18, 13); circ(x, 14.5, 9.5, 4, '#e11d48', '#7a0b22', 0.6); txt(x, '@', 14.5, 9.6, 6, '#fff'); }],
    error: [22, 22, x => { circ(x, 11, 11, 10, rg(x, 11, 11, 10, ['#ff9b8c', '#e0251b', '#8c0d08']), '#5a0602', 1); x.strokeStyle = '#fff'; x.lineWidth = 2.6; x.beginPath(); x.moveTo(7.3, 7.3); x.lineTo(14.7, 14.7); x.moveTo(14.7, 7.3); x.lineTo(7.3, 14.7); x.stroke(); }],
    cookie: [15, 15, x => { circ(x, 7.5, 7.5, 6.8, rg(x, 7.5, 7.5, 6.8, ['#f0c27a', '#c98a4b', '#9a6230']), '#6a3f18', 0.9); [[5, 5], [9.5, 4.5], [8, 9], [4.5, 9.5], [10.5, 8.5]].forEach(p => circ(x, p[0], p[1], 1.1, '#4a2a10')); }],
    worm: [20, 20, x => { circ(x, 10, 10, 9.2, rg(x, 10, 10, 9.2, ['#c8ff9a', '#4fcf3a', '#1f7a1a']), '#0f4d0d', 1); circ(x, 7, 8, 2.6, '#fff', '#0f4d0d', 0.5); circ(x, 13, 8, 2.6, '#fff', '#0f4d0d', 0.5); circ(x, 7.6, 8.4, 1.2, '#000'); circ(x, 13.6, 8.4, 1.2, '#000'); x.strokeStyle = '#0f4d0d'; x.lineWidth = 0.9; x.beginPath(); x.arc(10, 12, 3, 0.3, 2.8); x.stroke(); }],
    wormseg: [18, 18, x => { circ(x, 9, 9, 8.2, rg(x, 9, 9, 8.2, ['#a9ef7c', '#3fb52d', '#1a6616']), '#0f4d0d', 1); x.strokeStyle = 'rgba(15,77,13,.6)'; x.lineWidth = 1.4; x.beginPath(); x.arc(9, 9, 5, 0, 6.29); x.stroke(); }],
    trojan: [30, 30, x => {
      x.fillStyle = lg(x, 0, 9, 0, 29, ['#e0533f', '#9a1f12']); rr(x, 3, 11, 24, 17, 1.5); x.fill(); x.strokeStyle = '#5a0e06'; x.lineWidth = 1; x.stroke();
      x.fillStyle = lg(x, 0, 7, 0, 13, ['#f06a55', '#b8301e']); rr(x, 1, 7.5, 28, 5.5, 1.5); x.fill(); x.stroke();
      x.fillStyle = '#ffd23f'; x.fillRect(13, 7.5, 4, 20.5); x.fillRect(3, 17, 24, 3.4);
      x.strokeStyle = '#ffd23f'; x.lineWidth = 2.2; x.beginPath(); x.ellipse(11, 4.8, 4, 2.6, -0.4, 0, 6.29); x.ellipse(19, 4.8, 4, 2.6, 0.4, 0, 6.29); x.stroke();
      txt(x, '.exe', 22.5, 24.5, 4.6, '#fff');
    }],
    adware: [44, 18, x => {
      x.fillStyle = lg(x, 0, 1, 0, 17, ['#fbfbfb', '#d6d6d6', '#b9b9b9']); rr(x, 1, 1, 42, 16, 3); x.fill(); x.strokeStyle = '#6b6b6b'; x.lineWidth = 1; x.stroke();
      circ(x, 8, 9, 5, rg(x, 8, 9, 5, ['#fff6a0', '#ffb300', '#c76e00']), '#8a4a00', 0.6); txt(x, '★', 8, 9.3, 6, '#fff');
      x.fillStyle = '#fff'; x.fillRect(15, 5, 17, 8); x.strokeStyle = '#7f9db9'; x.lineWidth = 0.7; x.strokeRect(15, 5, 17, 8);
      txt(x, 'search', 22, 9.2, 4.2, '#aaa', 'normal'); ['#2fb84f', '#1a4fd1'].forEach((c, i) => { x.fillStyle = c; rr(x, 34 + i * 4.3, 6, 3.5, 6, 0.8); x.fill(); });
    }],
    keylogger: [22, 22, x => {
      x.fillStyle = lg(x, 0, 1, 0, 21, ['#5b5f68', '#23262c']); rr(x, 1, 1, 20, 20, 3); x.fill(); x.strokeStyle = '#0d0e10'; x.lineWidth = 1; x.stroke();
      x.fillStyle = lg(x, 0, 3, 0, 15, ['#6c717b', '#3d4149']); rr(x, 3.5, 2.5, 15, 14, 2); x.fill();
      x.beginPath(); x.ellipse(11, 9.5, 6, 3.6, 0, 0, 6.29); x.fillStyle = '#fff'; x.fill(); circ(x, 11, 9.5, 2.6, '#e11d48'); circ(x, 11, 9.5, 1.1, '#000');
    }],
    dialer: [28, 18, x => {
      x.fillStyle = lg(x, 0, 3, 0, 17, ['#f0efe9', '#a9a69b']); rr(x, 1, 4, 26, 13, 2.5); x.fill(); x.strokeStyle = '#5e5b52'; x.lineWidth = 1; x.stroke();
      ['#2fb84f', '#2fb84f', '#e64a3b', '#ffd23f', '#2fb84f'].forEach((c, i) => circ(x, 6 + i * 4, 10.5, 1.3, c, '#333', 0.4));
      x.strokeStyle = '#5e5b52'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(23, 4); x.lineTo(25, 0.5); x.stroke();
    }],
    bsod: [40, 36, x => {
      x.fillStyle = lg(x, 0, 1, 0, 28, ['#f1efe6', '#c9c5b8']); rr(x, 1, 1, 38, 28, 2.5); x.fill(); x.strokeStyle = '#6d6a60'; x.lineWidth = 1; x.stroke();
      x.fillStyle = '#1530b8'; x.fillRect(4, 4, 32, 21);
      x.fillStyle = '#fff'; x.fillRect(14, 6.5, 12, 2.4); for (let i = 0; i < 4; i++) x.fillRect(7, 11 + i * 3, 26 - (i % 2) * 8, 1.4);
      x.fillStyle = '#a8a497'; x.fillRect(16, 29, 8, 3); x.fillStyle = '#d6d2c6'; rr(x, 10, 31.5, 20, 3.5, 1); x.fill(); x.stroke();
    }],
    megaworm: [50, 50, x => {
      circ(x, 25, 25, 23, rg(x, 25, 25, 23, ['#d9ffa8', '#56d43c', '#176b12']), '#0a3d08', 1.5);
      x.fillStyle = '#0a3d08'; poly(x, [10, 13, 22, 18, 21, 21, 9, 16]); x.fill(); poly(x, [40, 13, 28, 18, 29, 21, 41, 16]); x.fill();
      circ(x, 16, 22, 4.2, '#fff', '#0a3d08', 0.8); circ(x, 34, 22, 4.2, '#fff', '#0a3d08', 0.8); circ(x, 16.5, 23, 2.1, '#e11d48'); circ(x, 33.5, 23, 2.1, '#e11d48');
      x.fillStyle = '#3a0a0a'; rr(x, 14, 30, 22, 8, 3); x.fill(); x.fillStyle = '#fff'; for (let i = 0; i < 5; i++) poly(x, [15 + i * 4.2, 30, 19 + i * 4.2, 30, 17 + i * 4.2, 33.5]); x.fill();
      txt(x, '.VBS', 25, 44, 6, '#0a3d08');
    }],
    megaseg: [40, 40, x => { circ(x, 20, 20, 18.5, rg(x, 20, 20, 18.5, ['#b9f58c', '#3db82a', '#145c10']), '#0a3d08', 1.4); x.strokeStyle = 'rgba(10,61,8,.55)'; x.lineWidth = 2.2; x.beginPath(); x.arc(20, 20, 11, 0, 6.29); x.stroke(); txt(x, '{ }', 20, 20.5, 9, 'rgba(10,61,8,.7)'); }],
    overlord: [112, 46, x => {
      x.fillStyle = lg(x, 0, 2, 0, 44, ['#fdfdfd', '#d9d9d9', '#a9a9a9']); rr(x, 2, 2, 108, 42, 7); x.fill(); x.strokeStyle = '#4a4a4a'; x.lineWidth = 1.6; x.stroke();
      circ(x, 22, 23, 15, rg(x, 22, 23, 15, ['#fff6a0', '#ffb300', '#c76e00']), '#8a4a00', 1);
      x.fillStyle = '#3a1a00'; poly(x, [12, 15, 21, 20, 20, 22, 11, 17]); x.fill(); poly(x, [32, 15, 23, 20, 24, 22, 33, 17]); x.fill();
      circ(x, 17, 23, 2.6, '#e11d48'); circ(x, 27, 23, 2.6, '#e11d48'); x.strokeStyle = '#3a1a00'; x.lineWidth = 1.6; x.beginPath(); x.arc(22, 33, 5, 3.6, 5.8); x.stroke();
      x.fillStyle = '#fff'; x.fillRect(42, 14, 44, 18); x.strokeStyle = '#7f9db9'; x.lineWidth = 1; x.strokeRect(42, 14, 44, 18);
      txt(x, 'SEARCH THE WEB', 64, 23.5, 5.2, '#8a8a8a');
      ['#2fb84f', '#1a4fd1', '#e64a3b'].forEach((c, i) => { x.fillStyle = c; rr(x, 89 + i * 6.5, 15, 5, 16, 1.5); x.fill(); });
    }],
    y2k: [66, 60, x => {
      x.strokeStyle = '#1a1a1a'; x.lineWidth = 3;
      for (let i = 0; i < 3; i++) { const y = 24 + i * 11; x.beginPath(); x.moveTo(20, y); x.lineTo(6, y - 6 + i * 6); x.lineTo(2, y + 2 + i * 4); x.moveTo(46, y); x.lineTo(60, y - 6 + i * 6); x.lineTo(64, y + 2 + i * 4); x.stroke(); }
      x.beginPath(); x.moveTo(27, 9); x.quadraticCurveTo(22, 1, 15, 3); x.moveTo(39, 9); x.quadraticCurveTo(44, 1, 51, 3); x.stroke();
      circ(x, 33, 12, 9, '#3a1010', '#000', 1.2); circ(x, 29, 11, 2.2, '#ffd23f'); circ(x, 37, 11, 2.2, '#ffd23f');
      x.beginPath(); x.ellipse(33, 36, 20, 22, 0, 0, 6.29); x.fillStyle = rg(x, 33, 36, 22, ['#ff7a6a', '#b0302a', '#5e0f0c']); x.fill(); x.strokeStyle = '#2a0504'; x.lineWidth = 1.5; x.stroke();
      x.strokeStyle = 'rgba(0,0,0,.5)'; x.beginPath(); x.moveTo(33, 15); x.lineTo(33, 58); x.stroke();
      x.fillStyle = '#9bd28a'; rr(x, 19, 30, 28, 11, 2); x.fill(); x.strokeStyle = '#2a4a20'; x.lineWidth = 1; x.stroke();
      txt(x, '00:00', 33, 35.8, 8, '#1d3a14', 'bold', 'Courier New, monospace');
    }],
    fatal: [96, 84, x => {
      x.fillStyle = lg(x, 0, 2, 0, 66, ['#f1efe6', '#bdb8aa']); rr(x, 2, 2, 92, 66, 6); x.fill(); x.strokeStyle = '#4d4a42'; x.lineWidth = 2; x.stroke();
      x.fillStyle = '#0c22a8'; x.fillRect(9, 8, 78, 52);
      x.fillStyle = '#c7c7c7'; x.fillRect(32, 12, 32, 7); txt(x, 'FATAL', 48, 15.8, 6.5, '#0c22a8');
      x.fillStyle = '#fff'; poly(x, [20, 27, 40, 31, 40, 37, 22, 35]); x.fill(); poly(x, [76, 27, 56, 31, 56, 37, 74, 35]); x.fill();
      circ(x, 33, 33, 2.6, '#e11d48'); circ(x, 63, 33, 2.6, '#e11d48');
      x.fillStyle = '#fff'; for (let i = 0; i < 3; i++) x.fillRect(18, 44 + i * 4.5, 60 - i * 12, 1.8);
      x.fillStyle = '#a8a497'; x.fillRect(38, 68, 20, 7); x.fillStyle = '#d6d2c6'; rr(x, 24, 74, 48, 8, 2); x.fill(); x.strokeStyle = '#4d4a42'; x.lineWidth = 1.5; x.stroke();
    }]
  };
  // cursors for every user account
  for (const id in C.CHARS) {
    const cu = C.CHARS[id].cursor;
    DEF['cur_' + id] = [24, 26, x => {
      if (cu.type === 'arrow') P.arrowCursor(x, 6, 3, 1.05, cu.fill);
      else if (cu.type === 'hand') P.hand(x, 3, 3, 1.05, cu.fill);
      else P.cross(x, 12, 13, 0.95, cu.fill);
      if (cu.crown) P.crown(x, 9, 0.5, 0.9);
    }];
  }

  /* -------- UI icons (32x32 design units) -------- */
  function fit(name, pad) {
    return x => { const s = get(name); const p = pad == null ? 3 : pad; const k = Math.min((32 - p * 2) / s.w, (32 - p * 2) / s.h); const w = s.w * k, h = s.h * k; x.drawImage(s, (32 - w) / 2, (32 - h) / 2, w, h); };
  }
  const IC = {
    w_ping: x => { circ(x, 7, 25, 3, '#2fb84f', '#0b4d18', 1); x.lineWidth = 2.6; ['#2fb84f', '#3b8cff', '#1a4fd1'].forEach((c, i) => { x.strokeStyle = c; x.beginPath(); x.arc(7, 25, 8 + i * 7, -1.45, -0.1); x.stroke(); }); },
    w_floppy: fit('floppy', 3),
    w_cd: fit('cd', 3),
    w_icons: x => { x.drawImage(get('ico_folder'), 1, 2, 15, 13.5); x.drawImage(get('ico_page'), 18, 1, 12, 15); x.drawImage(get('ico_exe'), 8, 16, 16, 14.4); },
    w_firewall: x => { x.fillStyle = '#b5482f'; x.fillRect(2, 16, 28, 14); x.strokeStyle = '#e9d8c8'; x.lineWidth = 1; for (let r = 0; r < 3; r++) { x.beginPath(); x.moveTo(2, 16 + r * 4.7); x.lineTo(30, 16 + r * 4.7); x.stroke(); for (let c = 0; c < 4; c++) { const X = 2 + c * 7 + (r % 2) * 3.5; x.beginPath(); x.moveTo(X, 16 + r * 4.7); x.lineTo(X, 20.7 + r * 4.7); x.stroke(); } } x.fillStyle = lg(x, 0, 2, 0, 18, ['#ffe066', '#ff7a1a', '#e0251b']); x.beginPath(); x.moveTo(6, 17); x.quadraticCurveTo(4, 8, 11, 4); x.quadraticCurveTo(10, 10, 14, 11); x.quadraticCurveTo(14, 4, 19, 1); x.quadraticCurveTo(19, 8, 23, 9); x.quadraticCurveTo(27, 11, 26, 17); x.closePath(); x.fill(); },
    w_email: x => { P.envelope(x, 2, 7, 24, 17); x.fillStyle = '#2fb84f'; poly(x, [20, 18, 30, 23, 20, 28]); x.fill(); x.fillRect(14, 21, 7, 4); },
    w_surge: x => P.bolt(x, 4, 2, 28),
    w_laser: x => { x.strokeStyle = '#ff2b2b'; x.lineWidth = 3; x.shadowColor = '#ff2b2b'; x.shadowBlur = 4; x.beginPath(); x.moveTo(15, 12); x.lineTo(30, 2); x.stroke(); x.shadowBlur = 0; x.fillStyle = lg(x, 4, 0, 20, 0, ['#e8eaee', '#9aa1ad']); rr(x, 4, 10, 15, 21, 7); x.fill(); x.strokeStyle = '#4c5563'; x.lineWidth = 1.2; x.stroke(); x.beginPath(); x.moveTo(11.5, 10); x.lineTo(11.5, 18); x.moveTo(4, 18); x.lineTo(19, 18); x.stroke(); circ(x, 11.5, 31, 1.6, '#ff2b2b'); },
    w_recycle: x => P.bin(x, 6, 3, 20, 27),
    w_paint: x => P.bucket(x, 2, 3, 27),
    w_scan: x => { x.fillStyle = '#e8f7ea'; x.fillRect(2, 2, 28, 28); x.strokeStyle = '#2fb84f'; x.lineWidth = 2; x.beginPath(); x.moveTo(17, 2); x.lineTo(17, 30); x.stroke(); x.fillStyle = 'rgba(47,184,79,.25)'; x.fillRect(2, 2, 15, 28); P.magnifier(x, 6, 6, 24); },
    w_dialup: x => { x.drawImage(get('dialer'), 1, 13, 21, 13.5); x.strokeStyle = '#1a4fd1'; x.lineWidth = 2; for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(18, 18, 6 + i * 5, -0.9, 0.5); x.stroke(); } },
    w_keyboard: x => { x.fillStyle = lg(x, 0, 9, 0, 25, ['#f4f2ea', '#c9c5b8']); rr(x, 1, 9, 30, 16, 2); x.fill(); x.strokeStyle = '#6d6a60'; x.lineWidth = 1; x.stroke(); x.fillStyle = '#fff'; for (let r = 0; r < 3; r++) for (let c = 0; c < 7 - (r === 2 ? 2 : 0); c++) { rr(x, 3 + c * 3.8 + (r === 2 ? 5 : r * 1), 11 + r * 4.3, 3, 3.4, 0.6); x.fill(); x.stroke(); } },
    p_ram: x => { x.fillStyle = '#1f7a3a'; x.fillRect(1, 9, 30, 13); x.fillStyle = '#c9a24a'; for (let i = 0; i < 12; i++) x.fillRect(2.5 + i * 2.4, 22, 1.4, 4); x.fillStyle = '#111'; for (let i = 0; i < 4; i++) x.fillRect(3 + i * 7, 11, 5.5, 8); x.fillStyle = '#1f7a3a'; x.fillRect(14.5, 22, 2.5, 4); },
    p_cpu: x => P.chip(x, 2, 2, 28),
    p_gpu: x => { x.fillStyle = '#1b2a4a'; rr(x, 1, 7, 30, 17, 2); x.fill(); x.fillStyle = '#c9a24a'; x.fillRect(5, 24, 18, 3); circ(x, 12, 15.5, 6.5, '#2d3e63', '#8fa3c8', 1); x.strokeStyle = '#8fa3c8'; x.lineWidth = 1.5; for (let i = 0; i < 5; i++) { const a = i * 1.256; x.beginPath(); x.moveTo(12, 15.5); x.lineTo(12 + Math.cos(a) * 6, 15.5 + Math.sin(a) * 6); x.stroke(); } x.fillStyle = '#e64a3b'; x.fillRect(22, 11, 6, 3); x.fillRect(22, 16, 6, 3); },
    p_psu: x => { x.fillStyle = lg(x, 0, 5, 0, 28, ['#c9ced8', '#7f8796']); rr(x, 2, 5, 28, 22, 2); x.fill(); x.strokeStyle = '#3d4350'; x.lineWidth = 1; x.stroke(); P.bolt(x, 9, 7, 17); },
    p_fan: x => { x.fillStyle = '#333'; rr(x, 2, 2, 28, 28, 4); x.fill(); circ(x, 16, 16, 12, '#555'); x.fillStyle = '#b9c2cf'; for (let i = 0; i < 5; i++) { x.save(); x.translate(16, 16); x.rotate(i * 1.256); x.beginPath(); x.ellipse(0, -6.5, 3.4, 6.5, 0.5, 0, 6.29); x.fill(); x.restore(); } circ(x, 16, 16, 3, '#222', '#999', 1); },
    p_usb: x => { x.strokeStyle = '#1a1a1a'; x.lineWidth = 2.4; x.beginPath(); x.moveTo(16, 4); x.lineTo(16, 27); x.moveTo(16, 20); x.lineTo(8, 14); x.lineTo(8, 10); x.moveTo(16, 23); x.lineTo(24, 16); x.lineTo(24, 12); x.stroke(); poly(x, [16, 1, 12, 7, 20, 7]); x.fillStyle = '#1a1a1a'; x.fill(); circ(x, 8, 9, 2.4, '#1a1a1a'); x.fillRect(21.5, 9, 5, 5); circ(x, 16, 28, 3.2, '#1a1a1a'); },
    p_mousepad: x => { x.fillStyle = '#2d5bd1'; rr(x, 1, 13, 30, 17, 3); x.fill(); x.fillStyle = lg(x, 8, 0, 22, 0, ['#f4f4f4', '#b9b9b9']); rr(x, 9, 2, 14, 21, 7); x.fill(); x.strokeStyle = '#555'; x.lineWidth = 1; x.stroke(); x.beginPath(); x.moveTo(16, 2); x.lineTo(16, 10); x.moveTo(9, 10); x.lineTo(23, 10); x.stroke(); },
    p_cache: x => { x.lineWidth = 7; x.strokeStyle = '#e0251b'; x.beginPath(); x.arc(16, 14, 9, Math.PI, 0); x.stroke(); x.fillStyle = '#e0251b'; x.fillRect(3.5, 14, 7, 9); x.fillRect(21.5, 14, 7, 9); x.fillStyle = '#d9dde3'; x.fillRect(3.5, 22, 7, 6); x.fillRect(21.5, 22, 7, 6); },
    p_antivirus: x => { P.shield(x, 4, 2, 24, 28); x.strokeStyle = '#fff'; x.lineWidth = 3.4; x.beginPath(); x.moveTo(10, 16); x.lineTo(14.5, 21); x.lineTo(22, 10); x.stroke(); },
    p_surgeprot: x => { x.fillStyle = '#f4f2ea'; rr(x, 1, 11, 30, 11, 3); x.fill(); x.strokeStyle = '#6d6a60'; x.lineWidth = 1; x.stroke(); for (let i = 0; i < 3; i++) { x.fillStyle = '#333'; x.fillRect(4 + i * 7, 14.5, 1.3, 3); x.fillRect(7 + i * 7, 14.5, 1.3, 3); } circ(x, 27, 16.5, 2, '#e0251b'); x.strokeStyle = '#333'; x.lineWidth = 1.8; x.beginPath(); x.moveTo(1, 16.5); x.quadraticCurveTo(-2, 28, 10, 29); x.stroke(); },
    p_lucky: x => { x.fillStyle = '#2fb84f'; for (let i = 0; i < 4; i++) { x.save(); x.translate(16, 14); x.rotate(i * 1.5708 + 0.785); x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(-9, -6, -5, -14, 0, -8); x.bezierCurveTo(5, -14, 9, -6, 0, 0); x.fill(); x.strokeStyle = '#13802a'; x.lineWidth = 0.8; x.stroke(); x.restore(); } x.strokeStyle = '#13802a'; x.lineWidth = 2; x.beginPath(); x.moveTo(16, 15); x.quadraticCurveTo(18, 24, 23, 30); x.stroke(); },
    p_modem: fit('dialer', 2),
    p_broadband: x => { circ(x, 16, 16, 13, rg(x, 16, 16, 13, ['#bfe3ff', '#3b8cff', '#1a4fd1']), '#0d2a7a', 1); x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 1; x.beginPath(); x.ellipse(16, 16, 5.5, 13, 0, 0, 6.29); x.moveTo(3, 16); x.lineTo(29, 16); x.moveTo(5, 9.5); x.lineTo(27, 9.5); x.moveTo(5, 22.5); x.lineTo(27, 22.5); x.stroke(); x.fillStyle = '#2fb84f'; poly(x, [24, 1, 31, 7, 26, 8, 22, 13, 20, 11, 24, 6, 21, 4]); x.fill(); },
    u_wrench: x => { x.save(); x.translate(16, 16); x.rotate(0.785); x.fillStyle = '#9aa3ad'; x.fillRect(-2.6, -4, 5.2, 18); circ(x, 0, -8, 7, '#9aa3ad'); x.fillStyle = '#fff0'; x.globalCompositeOperation = 'destination-out'; x.fillRect(-2.5, -16, 5, 8); x.globalCompositeOperation = 'source-over'; x.restore(); x.strokeStyle = '#4c5563'; },
    u_coin: x => { P.coin(x, 12, 18, 9); P.coin(x, 20, 13, 9); },
    u_curse: x => { x.drawImage(get('popup'), 2, 4, 26, 21); x.drawImage(get('popup'), 6, 9, 26, 21); },
    u_restore: x => { x.strokeStyle = '#2fb84f'; x.lineWidth = 4; x.beginPath(); x.arc(16, 16, 10, -0.6, 4.2); x.stroke(); x.fillStyle = '#2fb84f'; poly(x, [21, 1, 29, 8, 19, 11]); x.fill(); x.fillStyle = '#1a4fd1'; x.fillRect(14.5, 9, 3, 8); x.fillRect(14.5, 15, 7, 3); },
    u_refresh: x => { x.strokeStyle = '#1a4fd1'; x.lineWidth = 3.4; x.beginPath(); x.arc(16, 16, 10, 3.6, 5.9); x.stroke(); x.beginPath(); x.arc(16, 16, 10, 0.45, 2.7); x.stroke(); x.fillStyle = '#1a4fd1'; poly(x, [26, 5, 28, 14, 20, 12]); x.fill(); poly(x, [6, 27, 4, 18, 12, 20]); x.fill(); },
    u_skip: x => { x.fillStyle = '#1a4fd1'; poly(x, [4, 6, 16, 16, 4, 26]); x.fill(); poly(x, [15, 6, 27, 16, 15, 26]); x.fill(); x.fillRect(26, 6, 3, 20); },
    u_banish: x => { P.bin(x, 7, 4, 18, 25); x.strokeStyle = '#e0251b'; x.lineWidth = 4; x.beginPath(); x.moveTo(5, 5); x.lineTo(27, 27); x.moveTo(27, 5); x.lineTo(5, 27); x.stroke(); },
    // desktop
    i_computer: x => { P.monitor(x, 1, 2, 22, 22); x.fillStyle = lg(x, 21, 0, 31, 0, ['#f1efe6', '#bdb8aa']); rr(x, 22, 6, 9, 24, 1.5); x.fill(); x.strokeStyle = '#6d6a60'; x.lineWidth = 0.8; x.stroke(); x.fillStyle = '#555'; x.fillRect(24, 10, 5, 1.4); x.fillRect(24, 13, 5, 1.4); circ(x, 26.5, 25, 1.4, '#2fb84f'); },
    i_scan: x => { P.shield(x, 3, 2, 22, 26, ['#8ff0a0', '#13802a']); P.magnifier(x, 12, 12, 19); },
    i_control: x => { x.fillStyle = '#fff'; rr(x, 2, 3, 28, 25, 2); x.fill(); x.strokeStyle = '#1c3f94'; x.lineWidth = 1; x.stroke(); x.fillStyle = lg(x, 0, 3, 0, 8, ['#4f86ea', '#1c3f94']); x.fillRect(2.5, 3.5, 27, 4.5); [[8, 0.3, '#e64a3b'], [14, 0.7, '#2fb84f'], [20, 0.45, '#ffb300']].forEach(r => { x.fillStyle = '#c0c6d0'; x.fillRect(6, r[0] + 3, 20, 2); x.fillStyle = r[2]; rr(x, 6 + r[1] * 17, r[0] + 1, 4, 6, 1); x.fill(); }); },
    i_users: x => { [[11, '#3b8cff'], [21, '#2fb84f']].forEach(p => { circ(x, p[0], 10, 5.5, '#ffd9b3', '#7a5030', 0.8); x.fillStyle = p[1]; x.beginPath(); x.ellipse(p[0], 25, 8, 7, 0, Math.PI, 0); x.fill(); x.fillRect(p[0] - 8, 25, 16, 4); }); },
    i_tasks: x => { x.fillStyle = '#fff'; x.fillRect(3, 2, 26, 28); x.strokeStyle = '#13802a'; x.lineWidth = 1.2; x.strokeRect(3, 2, 26, 28); x.fillStyle = '#1f9a43'; x.fillRect(3, 2, 26, 6); x.strokeStyle = '#9ac7a8'; x.lineWidth = 0.8; for (let i = 1; i < 5; i++) { x.beginPath(); x.moveTo(3, 8 + i * 4.5); x.lineTo(29, 8 + i * 4.5); x.stroke(); } x.beginPath(); x.moveTo(12, 8); x.lineTo(12, 30); x.stroke(); txt(x, 'X', 9, 5.2, 5, '#fff'); x.strokeStyle = '#2fb84f'; x.lineWidth = 2; x.beginPath(); x.moveTo(15, 14); x.lineTo(17, 16); x.lineTo(21, 11); x.stroke(); },
    i_display: x => { P.monitor(x, 2, 2, 28, 28, lg(x, 0, 4, 0, 20, ['#ff6ec7', '#ffd23f', '#3ccf4e'])); },
    i_events: x => { x.fillStyle = '#7a4b20'; rr(x, 4, 2, 22, 28, 2); x.fill(); x.fillStyle = '#fff'; x.fillRect(7, 4, 18, 24); x.fillStyle = '#9fb0cf'; for (let i = 0; i < 5; i++) x.fillRect(9, 7 + i * 4, 13, 1.2); poly(x, [22, 15, 30, 29, 14, 29]); x.fillStyle = '#ffd23f'; x.fill(); x.strokeStyle = '#8a5a00'; x.lineWidth = 1; x.stroke(); txt(x, '!', 22, 24, 8, '#000'); },
    i_readme: fit('ico_page', 3),
    i_bin: x => P.bin(x, 6, 3, 20, 27),
    i_folder: x => P.folder(x, 2, 4, 28, 24),
    i_globe: x => IC.p_broadband(x),
    i_shutdown: x => { circ(x, 16, 16, 13, rg(x, 16, 16, 13, ['#ffb38a', '#e0461b', '#8a1f05']), '#5a1000', 1); x.strokeStyle = '#fff'; x.lineWidth = 2.6; x.beginPath(); x.arc(16, 17, 7, -1.1, 4.25); x.moveTo(16, 7); x.lineTo(16, 16); x.stroke(); },
    i_logoff: x => { x.fillStyle = '#ffb300'; rr(x, 3, 3, 26, 26, 4); x.fill(); x.strokeStyle = '#8a5a00'; x.lineWidth = 1; x.stroke(); x.fillStyle = '#fff'; x.fillRect(9, 8, 10, 16); x.fillStyle = '#2fb84f'; poly(x, [17, 11, 27, 16, 17, 21]); x.fill(); },
    i_lock: x => { x.strokeStyle = '#6b6b6b'; x.lineWidth = 3; x.beginPath(); x.arc(16, 13, 6.5, Math.PI, 0); x.stroke(); x.fillStyle = lg(x, 0, 13, 0, 29, ['#ffd86b', '#c88a00']); rr(x, 6, 13, 20, 16, 2); x.fill(); x.strokeStyle = '#7a5200'; x.lineWidth = 1; x.stroke(); circ(x, 16, 20, 2.2, '#5a3a00'); },
    d_hdd: x => { x.fillStyle = lg(x, 0, 8, 0, 26, ['#e7e9ee', '#9aa1ad']); rr(x, 1, 9, 30, 15, 2); x.fill(); x.strokeStyle = '#4c5563'; x.lineWidth = 1; x.stroke(); x.fillStyle = '#4c5563'; x.fillRect(4, 19, 14, 1.4); circ(x, 26, 19.5, 1.6, '#2fb84f'); P.page(x, 19, 1, 9, 11); },
    d_dl: x => { P.folder(x, 2, 6, 28, 22); x.fillStyle = '#2fb84f'; x.strokeStyle = '#13802a'; x.lineWidth = 1; poly(x, [12, 8, 20, 8, 20, 16, 25, 16, 16, 25, 7, 16, 12, 16]); x.fill(); x.stroke(); },
    d_floppy: x => { x.fillStyle = lg(x, 0, 12, 0, 28, ['#f1efe6', '#bdb8aa']); rr(x, 1, 16, 30, 12, 2); x.fill(); x.strokeStyle = '#6d6a60'; x.lineWidth = 1; x.stroke(); x.fillStyle = '#333'; x.fillRect(5, 20, 18, 2); circ(x, 27, 21, 1.4, '#2fb84f'); P.floppy(x, 8, 1, 16); },
    d_net: x => { IC.p_broadband(x); x.drawImage(get('bsod'), 0, 17, 15, 13.5); x.drawImage(get('bsod'), 17, 17, 15, 13.5); },
    d_bin: x => P.bin(x, 6, 3, 20, 27),
    k_patch: fit('patch'), k_defrag: fit('defrag'), k_format: fit('format'), k_freeze: fit('freeze'), k_zip: fit('zip', 2), k_coin: fit('coin', 6)
  };
  for (const id in C.ENEMIES) { const sp = spriteForEnemy(id); IC['e_' + id] = fit(sp, 2); }
  for (const id in C.CHARS) IC['c_' + id] = fit('cur_' + id, 2);
  for (const id in C.WEAPONS) {
    const w = C.WEAPONS[id];
    if (!w.evolved) continue;
    IC['w_' + id] = x => {
      const g = x.createRadialGradient(16, 16, 4, 16, 16, 18); g.addColorStop(0, 'rgba(255,220,80,.9)'); g.addColorStop(1, 'rgba(255,160,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, 32, 32);
      x.save(); x.translate(2, 2); x.scale(0.875, 0.875); IC['w_' + w.from](x); x.restore();
      x.fillStyle = '#ffd23f'; x.strokeStyle = '#8a5a00'; x.lineWidth = 0.8;
      x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.4 : 6; x.lineTo(25 + Math.cos(a) * r, 7 + Math.sin(a) * r); } x.closePath(); x.fill(); x.stroke();
    };
  }

  function spriteForEnemy(id) { return id === 'prop' ? 'prop_folder' : id; }
  function get(name) {
    let c = cache[name];
    if (!c) { const d = DEF[name]; if (!d) { console.warn('missing sprite', name); return get('error'); } c = cache[name] = mk(d[0], d[1], d[2]); }
    return c;
  }
  function flash(name) {
    let f = flashCache[name];
    if (!f) {
      const src = get(name);
      f = document.createElement('canvas'); f.width = src.width; f.height = src.height;
      const x = f.getContext('2d'); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = '#fff'; x.fillRect(0, 0, f.width, f.height);
      f.w = src.w; f.h = src.h; flashCache[name] = f;
    }
    return f;
  }
  function icon(name) {
    if (iconCache[name]) return iconCache[name];
    const fn = IC[name] || IC['w_' + name] || IC['p_' + name];
    const c = mk(32, 32, (x) => { if (fn) fn(x); else { x.fillStyle = '#ccc'; x.fillRect(4, 4, 24, 24); } });
    return (iconCache[name] = c.toDataURL());
  }
  C.SPR = { get, flash, icon, P, spriteForEnemy, has: n => !!DEF[n] };
})(window.CAS);

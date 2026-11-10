// Glyphwake: input, HUD, floaters, dialogue, menus.
(function () {
  'use strict';
  const GW = window.GW;
  const $ = id => document.getElementById(id);
  const UI = GW.UI = {};

  // ---------------- input ----------------
  const I = GW.Input = {
    keys: {}, pressed: {}, mouse: { x: 0, y: 0, ndcX: 0, ndcY: 0, down: false, right: false, used: false },
    stick: { x: 0, y: 0, id: null, ox: 0, oy: 0 }, touch: false, holdAttack: false, lastAttackRepeat: 0,
  };
  const KEYMAP = { Space: 'roll', ShiftLeft: 'roll', Digit2: 's2', Digit3: 's3', Digit4: 's4', KeyQ: 'potion', KeyE: 'interact', KeyF: 'interact', KeyR: 'potion', Digit1: 'attack', KeyJ: 'attack', KeyK: 'roll', KeyC: 'gear', KeyI: 'gear' };
  I.press = function (a) { I.pressed[a] = true; };
  I.consume = function () { const p = I.pressed; I.pressed = {}; return p; };
  UI.initInput = function (game) {
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      I.keys[e.code] = true;
      if (KEYMAP[e.code]) { I.press(KEYMAP[e.code]); e.preventDefault(); }
      if (e.code === 'Escape' || e.code === 'Tab' || e.code === 'KeyP') { I.press('menu'); e.preventDefault(); }
      I.touch = false; UI.showTouch(false);
      GWAudio.init();
    });
    window.addEventListener('keyup', e => { I.keys[e.code] = false; });
    const cv = $('gl');
    cv.addEventListener('mousemove', e => { I.mouse.x = e.clientX; I.mouse.y = e.clientY; I.mouse.used = true; });
    cv.addEventListener('mousedown', e => {
      GWAudio.init();
      if (e.button === 0) { I.mouse.down = true; I.press('click'); }
      if (e.button === 2) { I.mouse.right = true; I.press('roll'); }
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) I.mouse.down = false; if (e.button === 2) I.mouse.right = false; });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    // touch stick
    const stick = $('stick'), knob = $('stick-knob');
    const setKnob = () => { knob.style.transform = `translate(${I.stick.x * 40}px, ${I.stick.y * 40}px)`; };
    const onStart = (e) => {
      for (const t of e.changedTouches) {
        if (I.stick.id !== null) continue;
        if (t.clientX > window.innerWidth * 0.5) continue;
        const r = stick.getBoundingClientRect();
        I.stick.id = t.identifier; I.stick.ox = r.left + r.width / 2; I.stick.oy = r.top + r.height / 2;
        if (Math.hypot(t.clientX - I.stick.ox, t.clientY - I.stick.oy) > 80) { // float the stick to the thumb
          stick.style.left = (t.clientX - 60) + 'px'; stick.style.bottom = (window.innerHeight - t.clientY - 60) + 'px';
          I.stick.ox = t.clientX; I.stick.oy = t.clientY;
        }
        onMove(e);
      }
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) if (t.identifier === I.stick.id) {
        let dx = (t.clientX - I.stick.ox) / 50, dy = (t.clientY - I.stick.oy) / 50; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
        I.stick.x = dx; I.stick.y = dy; setKnob();
      }
    };
    const onEnd = (e) => { for (const t of e.changedTouches) if (t.identifier === I.stick.id) { I.stick.id = null; I.stick.x = I.stick.y = 0; setKnob(); stick.style.left = ''; stick.style.bottom = ''; } };
    document.addEventListener('touchstart', e => {
      I.touch = true; UI.showTouch(game.state === 'play'); GWAudio.init();
      if (game.state !== 'play' || e.target.closest('button,#dialog,#forge,.panel')) return;
      onStart(e);
    }, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd); document.addEventListener('touchcancel', onEnd);
    document.querySelectorAll('.tb').forEach(b => {
      const act = b.dataset.act;
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); I.press(act); b.classList.add('down'); if (act === 'attack') { I.holdAttack = true; I.lastAttackRepeat = performance.now(); } navigator.vibrate && navigator.vibrate(8); });
      const up = () => { b.classList.remove('down'); if (act === 'attack') I.holdAttack = false; };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
    });
    if (matchMedia('(pointer: coarse)').matches) I.touch = true;
  };
  UI.showTouch = function (on) { $('touch').classList.toggle('hidden', !(on && I.touch)); document.body.classList.toggle('touch', !!I.touch); };
  // per-frame movement vector
  I.move = function () {
    let x = 0, z = 0;
    if (I.keys.KeyW || I.keys.ArrowUp) z -= 1; if (I.keys.KeyS || I.keys.ArrowDown) z += 1;
    if (I.keys.KeyA || I.keys.ArrowLeft) x -= 1; if (I.keys.KeyD || I.keys.ArrowRight) x += 1;
    const l = Math.hypot(x, z); if (l > 0) { x /= l; z /= l; }
    if (I.stick.id !== null) { x = I.stick.x; z = I.stick.y; }
    return { x, z };
  };

  // ---------------- HUD ----------------
  const bar = (v, max, n) => { const f = Math.round(GW.clamp(v / max, 0, 1) * n); return '[' + '|'.repeat(f) + '·'.repeat(n - f) + ']'; };
  UI.buildHotbar = function () {
    const hb = $('hotbar'); hb.innerHTML = '';
    const slots = [
      { k: 'LMB', g: '⚔', id: 'attack' }, { k: 'SPC', g: '⟲', id: 'roll' },
      { k: '2', g: GW.SKILLS.s2.glyph, id: 's2' }, { k: '3', g: GW.SKILLS.s3.glyph, id: 's3' }, { k: '4', g: GW.SKILLS.s4.glyph, id: 's4' },
      { k: 'Q', g: '♥', id: 'potion' },
    ];
    UI.hs = {};
    slots.forEach(s => {
      const d = document.createElement('div'); d.className = 'hs';
      d.innerHTML = `<span class="k">${s.k}</span><span class="g">${s.g}</span><span class="cd" style="height:0"></span><span class="c"></span>`;
      hb.appendChild(d); UI.hs[s.id] = d;
    });
    UI.hs.potion.querySelector('.g').style.color = '#e0484a';
  };
  let hudCache = {};
  const setText = (id, t) => { if (hudCache[id] !== t) { hudCache[id] = t; $(id).textContent = t; } };
  UI.updateHUD = function (P) {
    const n = window.innerWidth < 640 ? 18 : 26;
    setText('hp-bar', bar(P.hp, P.maxHp, n)); setText('hp-num', Math.ceil(P.hp) + '/' + P.maxHp);
    setText('st-bar', bar(P.st, 100, Math.round(n * 0.75)));
    setText('fo-bar', bar(P.fo, 100, Math.round(n * 0.75)));
    const need = P.need();
    $('xp-fill').style.width = (P.xp / need * 100).toFixed(1) + '%';
    setText('xp-text', `LV ${P.level} · ${Math.floor(P.xp)} / ${need} XP`);
    for (const k of ['s2', 's3', 's4']) {
      const sk = GW.SKILLS[k], el = UI.hs[k];
      const f = P.cd[k] / sk.cd;
      el.querySelector('.cd').style.height = (f * 100) + '%';
      el.querySelector('.c').textContent = P.cd[k] > 0 ? Math.ceil(P.cd[k]) : '';
      el.classList.toggle('lack', P.fo < sk.fo);
      const tb = document.querySelector(`.tb[data-act=${k}] i`); if (tb) tb.style.height = (f * 100) + '%';
    }
    UI.hs.potion.querySelector('.c').textContent = P.flasks + '/' + P.maxFlasks;
    setText('t-pots', String(P.flasks));
  };

  // ---------------- floaters ----------------
  const pool = [];
  const active = [];
  UI.float = function (text, pos, o) {
    o = o || {};
    const el = pool.pop() || document.createElement('div');
    el.className = 'fl' + (o.cls ? ' ' + o.cls : '');
    el.textContent = text; el.style.color = o.color || '#fff'; el.style.fontSize = (o.size || 13) + 'px'; el.style.opacity = 1;
    $('floaters').appendChild(el);
    active.push({ el, p: pos.clone(), life: o.life || 0.9, max: o.life || 0.9, rise: o.rise === undefined ? 1.6 : o.rise, dx: (Math.random() - 0.5) * 30, y0: o.y || 2.2 });
  };
  const labels = new Map();
  UI.label = function (key, text, pos, cls, color) {
    let L = labels.get(key);
    if (!L) { const el = document.createElement('div'); el.className = 'fl ' + (cls || 'name'); $('floaters').appendChild(el); L = { el, t: '' }; labels.set(key, L); }
    if (L.t !== text) { L.t = text; L.el.textContent = text; }
    if (color) L.el.style.color = color;
    L.pos = pos; L.seen = true;
  };
  const _v = new THREE.Vector3();
  UI.project = function (camera, p, out) {
    _v.copy(p).project(camera);
    out.x = (_v.x * 0.5 + 0.5) * window.innerWidth; out.y = (-_v.y * 0.5 + 0.5) * window.innerHeight; out.z = _v.z;
    return out;
  };
  UI.updateFloaters = function (dt, camera) {
    const o = {};
    for (let i = active.length - 1; i >= 0; i--) {
      const f = active[i]; f.life -= dt;
      if (f.life <= 0) { f.el.remove(); pool.push(f.el); active.splice(i, 1); continue; }
      const k = 1 - f.life / f.max;
      _v.copy(f.p); _v.y += f.y0 + f.rise * (1 - Math.pow(1 - k, 2));
      UI.project(camera, _v, o);
      f.el.style.transform = `translate(${o.x + f.dx * k - 10}px, ${o.y}px) scale(${k < 0.12 ? 1 + (0.12 - k) * 6 : 1})`;
      f.el.style.opacity = k > 0.65 ? (1 - k) / 0.35 : 1;
    }
    labels.forEach((L, key) => {
      if (!L.seen) { L.el.remove(); labels.delete(key); return; }
      L.seen = false;
      UI.project(camera, L.pos, o);
      const w = L.el.offsetWidth;
      L.el.style.transform = `translate(${o.x - w / 2}px, ${o.y}px)`;
      L.el.style.display = o.z > 1 ? 'none' : '';
    });
  };

  // ---------------- messages ----------------
  let hintT = 0;
  UI.hint = function (text, dur) { $('hint').innerHTML = text; $('hint').classList.add('on'); hintT = dur || 5; };
  UI.clearHint = function () { $('hint').classList.remove('on'); hintT = 0; };
  let bannerT = 0;
  UI.banner = function (small, big, dur) { $('zb-small').textContent = small; $('zb-big').textContent = big; $('zone-banner').classList.add('on'); bannerT = dur || 3.2; };
  UI.toast = function (text, dur) {
    const d = document.createElement('div'); d.innerHTML = text; $('toast').appendChild(d);
    setTimeout(() => d.remove(), (dur || 2) * 1000);
    while ($('toast').children.length > 4) $('toast').firstChild.remove();
  };
  UI.tick = function (dt) {
    if (hintT > 0) { hintT -= dt; if (hintT <= 0) $('hint').classList.remove('on'); }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('zone-banner').classList.remove('on'); }
    if (dlg.active) dlgTick(dt);
  };
  UI.quest = function (title, text) { $('q-title').textContent = title; $('q-text').textContent = text; };
  UI.boss = function (on, name, hp, max) {
    $('boss-bar').classList.toggle('hidden', !on); if (!on) return;
    $('boss-name').textContent = name;
    const p = GW.clamp(hp / max, 0, 1) * 100 + '%';
    $('boss-hp').querySelector('i').style.width = p; $('boss-hp').querySelector('b').style.width = p;
  };
  UI.interact = function (text) {
    const el = $('interact');
    if (!text) { el.classList.add('hidden'); $('t-interact').style.visibility = 'hidden'; return; }
    el.innerHTML = (I.touch ? '' : '<span class="kbd">E</span> ') + text; el.classList.remove('hidden');
    $('t-interact').style.visibility = 'visible';
  };
  UI.arrow = function (on, x, y, ang, dist) {
    const el = $('obj-arrow'); el.classList.toggle('on', on);
    if (!on) return;
    el.style.transform = `translate(${x - 8}px, ${y - 10}px) rotate(${ang}rad)`;
    $('obj-dist').textContent = Math.round(dist) + 'm';
  };

  // ---------------- dialogue ----------------
  const dlg = { active: false, lines: [], i: 0, shown: 0, done: null, typeT: 0 };
  UI.dialog = function (lines, done) {
    dlg.active = true; dlg.lines = lines; dlg.i = 0; dlg.shown = 0; dlg.done = done;
    $('dialog').classList.remove('hidden'); renderLine();
  };
  function renderLine() { const L = dlg.lines[dlg.i]; $('d-who').textContent = L.who || ''; $('d-text').textContent = ''; dlg.shown = 0; }
  function dlgTick(dt) {
    const L = dlg.lines[dlg.i]; if (!L) return;
    if (dlg.shown < L.text.length) {
      const before = Math.floor(dlg.shown);
      dlg.shown = Math.min(L.text.length, dlg.shown + dt * 55);
      if (Math.floor(dlg.shown) !== before && Math.floor(dlg.shown) % 2 === 0) GWAudio.sfx('type');
      $('d-text').textContent = L.text.slice(0, Math.floor(dlg.shown));
    }
  }
  UI.dialogAdvance = function () {
    if (!dlg.active) return false;
    const L = dlg.lines[dlg.i];
    if (dlg.shown < L.text.length) { dlg.shown = L.text.length; $('d-text').textContent = L.text; return true; }
    dlg.i++;
    if (dlg.i >= dlg.lines.length) { dlg.active = false; $('dialog').classList.add('hidden'); const d = dlg.done; dlg.done = null; if (d) d(); return true; }
    renderLine(); GWAudio.sfx('ui'); return true;
  };
  UI.inDialog = () => dlg.active;
  $('dialog').addEventListener('pointerdown', e => { e.stopPropagation(); UI.dialogAdvance(); });

  // ---------------- minimap ----------------
  let mapImg = null;
  UI.initMinimap = function () { mapImg = GW.World.mapCanvas(); };
  UI.drawMinimap = function (G) {
    const c = $('minimap'), g = c.getContext('2d'), P = G.player;
    const S = GW.World.SIZE, scale = 512 / S, span = 64; // world units shown
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
    const sx = (P.pos.x + S / 2) * scale - span * scale / 2, sz = (P.pos.z + S / 2) * scale - span * scale / 2;
    g.drawImage(mapImg, sx, sz, span * scale, span * scale, 0, 0, 128, 128);
    const to = (x, z) => [(x - P.pos.x) / span * 128 + 64, (z - P.pos.z) / span * 128 + 64];
    g.font = 'bold 10px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const it of GW.World.interact) { const [x, y] = to(it.x, it.z); if (x < 0 || y < 0 || x > 128 || y > 128) continue; g.fillStyle = it.type === 'rest' ? '#ff9a40' : '#ffcf6a'; g.fillText(it.type === 'rest' ? '▲' : it.type === 'forge' ? 'π' : '!', x, y); }
    for (const e of G.enemies) { if (!e.alive) continue; const [x, y] = to(e.pos.x, e.pos.z); if (x < 0 || y < 0 || x > 128 || y > 128) continue; g.fillStyle = e.T.boss ? '#ff4040' : '#d04040'; g.fillText(e.T.boss ? 'Ω' : '·', x, y); }
    const obj = G.objective();
    if (obj) { let [x, y] = to(obj.x, obj.z); const dx = x - 64, dy = y - 64, d = Math.hypot(dx, dy); if (d > 56) { x = 64 + dx / d * 56; y = 64 + dy / d * 56; } g.fillStyle = '#ffd860'; g.fillText('◆', x, y); }
    g.save(); g.translate(64, 64); g.rotate(-P.visYaw + Math.PI); g.fillStyle = '#fff'; g.fillText('▲', 0, 0); g.restore();
  };

  // ---------------- title logo ----------------
  UI.makeLogo = function (word) {
    const c = document.createElement('canvas'), w = 120, h = 20; c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.font = 'bold 17px Georgia, "Times New Roman", serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillText(word, w / 2, h / 2 + 1);
    const d = g.getImageData(0, 0, w, h).data, ramp = ' .:-=+*#%@';
    let out = '';
    for (let y = 0; y < h; y++) {
      let row = '';
      for (let x = 0; x < w; x++) { const v = d[(y * w + x) * 4] / 255; row += ramp[Math.min(ramp.length - 1, Math.floor(v * ramp.length))]; }
      if (row.trim()) out += row.replace(/\s+$/, '') + '\n';
    }
    return out;
  };

  // ---------------- settings ----------------
  const DEF = { glyph: 9, quality: 2, vol: 0.8, mus: 0.5, shake: true, pure: false };
  UI.settings = Object.assign({}, DEF);
  try { Object.assign(UI.settings, JSON.parse(localStorage.getItem('glyphwake.settings') || '{}')); } catch (e) { /* storage blocked */ }
  if (matchMedia('(pointer: coarse)').matches && !localStorage.getItem('glyphwake.settings')) { UI.settings.quality = 1; UI.settings.glyph = 8; }
  if (!UI.settings.v2) { UI.settings.v2 = true; UI.settings.glyph = matchMedia('(pointer: coarse)').matches ? 7 : 8; }
  UI.saveSettings = function () { try { localStorage.setItem('glyphwake.settings', JSON.stringify(UI.settings)); } catch (e) { /* ignore */ } };
  UI.initSettings = function (apply) {
    const S = UI.settings;
    const gl = $('o-glyph'), q = $('o-quality'), v = $('o-vol'), m = $('o-mus'), sh = $('o-shake'), pu = $('o-pure');
    gl.value = S.glyph; $('o-glyph-v').textContent = S.glyph + 'px'; q.value = S.quality; v.value = S.vol; m.value = S.mus; sh.checked = S.shake; pu.checked = S.pure;
    gl.oninput = () => { S.glyph = +gl.value; $('o-glyph-v').textContent = S.glyph + 'px'; apply(); UI.saveSettings(); };
    q.onchange = () => { S.quality = +q.value; apply(); UI.saveSettings(); };
    v.oninput = () => { S.vol = +v.value; apply(); UI.saveSettings(); };
    m.oninput = () => { S.mus = +m.value; apply(); UI.saveSettings(); };
    sh.onchange = () => { S.shake = sh.checked; UI.saveSettings(); };
    pu.onchange = () => { S.pure = pu.checked; apply(); UI.saveSettings(); };
  };
})();

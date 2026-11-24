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
  const KEYMAP = { Space: 'roll', KeyH: 'horse', Digit1: 'a1', Digit2: 'a2', Digit3: 'a3', Digit4: 'a4', KeyB: 'book', KeyX: 'swap', KeyQ: 'potion', KeyE: 'interact', KeyF: 'fire', KeyR: 'potion', KeyJ: 'attack', KeyK: 'roll', KeyC: 'gear', KeyI: 'inv', KeyM: 'map' };
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
    // hold the middle button and drag: orbit (left/right) and tilt (up/down) the camera
    let orbit = null, lastMid = 0;
    cv.addEventListener('mousedown', e => {
      if (e.button !== 1 || game.state !== 'play') return;
      e.preventDefault();
      const now = performance.now();
      if (now - lastMid < 320) { UI.settings.camYaw = 0; UI.settings.camPitch = 0.98; UI.saveSettings(); UI.toast('Camera reset', 0.8); }
      lastMid = now;
      orbit = { x: e.clientX, y: e.clientY }; UI.orbiting = true; cv.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', e => {
      if (!orbit) return;
      const S = UI.settings;
      S.camYaw = ((S.camYaw || 0) - (e.clientX - orbit.x) * 0.006) % (Math.PI * 2);
      S.camPitch = GW.clamp((S.camPitch || 0.98) + (e.clientY - orbit.y) * 0.004, 0.16, 1.45);
      orbit = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mouseup', e => { if (e.button === 1 && orbit) { orbit = null; UI.orbiting = false; cv.style.cursor = ''; UI.saveSettings(); } });
    cv.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
    cv.addEventListener('mousedown', e => {
      GWAudio.init();
      if (e.button === 0) { I.mouse.down = true; I.press('click'); }
      if (e.button === 2) { I.mouse.right = true; }
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) I.mouse.down = false; if (e.button === 2) I.mouse.right = false; });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => {
      if (game.state !== 'play') return;
      e.preventDefault();
      UI.setZoom((UI.settings.zoom || 1.3) * Math.exp(e.deltaY * 0.0012));
    }, { passive: false });
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
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); I.press(act); b.classList.add('down'); if (act === 'attack') { I.holdAttack = true; I.lastAttackRepeat = performance.now(); } if (act === 'block') I.holdBlock = true; navigator.vibrate && navigator.vibrate(8); });
      const up = () => { b.classList.remove('down'); if (act === 'attack') I.holdAttack = false; if (act === 'block') I.holdBlock = false; };
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
      { k: '1', g: '·', id: 'a1' }, { k: '2', g: '·', id: 'a2' }, { k: '3', g: '·', id: 'a3' }, { k: '4', g: '·', id: 'a4' },
      { k: 'Q', g: '♥', id: 'potion' },
    ];
    UI.hs = {};
    slots.forEach(s => {
      const d = document.createElement('div'); d.className = 'hs';
      d.innerHTML = `<span class="k">${s.k}</span><span class="g">${s.g}</span><span class="cd" style="height:0"></span><span class="c"></span>`;
      hb.appendChild(d); UI.hs[s.id] = d;
    });
    UI.hs.potion.querySelector('.g').style.color = '#e0484a';
    UI.refreshAbil(); UI.refreshArms();
  };
  UI.refreshArms = function () {
    const G = GW.G, P = G && G.player; if (!P || !P.inv || !UI.hs || !UI.hs.attack) return;
    const c = GW.Arms.cur(P), a = GW.Arms.ensure(P), o = a.set[1 - a.act] && GW.Arms.CLS[a.set[1 - a.act]];
    const g = UI.hs.attack.querySelector('.g'); g.textContent = c.g; g.style.color = c.col;
    UI.hs.attack.title = c.name + (o ? ' · X: ' + o.name : '');
  };
  // slot glyphs on the hotbar and touch buttons follow the loadout
  UI.refreshAbil = function () {
    const G = GW.G, P = G && G.player; if (!P || !P.inv || !UI.hs) return;
    const b = GW.Abil.ensure(P);
    for (let i = 0; i < 4; i++) {
      const a = b.slots[i] && GW.Abil.LIST[b.slots[i]], el = UI.hs['a' + (i + 1)]; if (!el) continue;
      const g = el.querySelector('.g'); g.textContent = a ? a.g : '·'; g.style.color = a ? a.col : '#555a66'; el.title = a ? a.name : 'empty: B';
      const tb = document.querySelector(`.tb[data-act=a${i + 1}] b`); if (tb) { tb.textContent = a ? a.g : '·'; tb.style.color = a ? a.col : ''; }
    }
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
    const slots = GW.Abil.ensure(P).slots;
    for (let i = 0; i < 4; i++) {
      const k = 'a' + (i + 1), id = slots[i], sk = id && GW.Abil.LIST[id], el = UI.hs[k]; if (!el) continue;
      const cd = sk ? (P.cd[id] || 0) : 0, f = sk ? cd / sk.cd : 0;
      el.querySelector('.cd').style.height = (f * 100) + '%';
      el.querySelector('.c').textContent = cd > 0 ? Math.ceil(cd) : '';
      const fz = P.fuseT > (GW.G ? GW.G.t : 0);
      el.classList.toggle('lack', !sk || (!fz && P.fo < sk.fo));
      el.classList.toggle('fuse', !!(sk && fz)); if (fz) el.style.setProperty('--fz', (GW.G.FUSE[P.fuseEl] || {}).col || '#ffd860');
      const tb = document.querySelector(`.tb[data-act=${k}] i`); if (tb) tb.style.height = (f * 100) + '%';
    }
    UI.hs.potion.querySelector('.c').textContent = P.flasks + '/' + P.maxFlasks;
    setText('t-pots', String(P.flasks)); setText('t-kind', String((P.inv && P.inv.kindling) || 0));
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
  UI.banner = function (small, big, dur, col) { $('zb-small').textContent = small; $('zb-big').textContent = big; $('zb-big').style.color = col || ''; $('zb-small').style.color = col || ''; $('zone-banner').classList.add('on'); bannerT = dur || 3.2; };
  // travel panel: list of discovered fires
  UI.showTravel = function (list, pick) {
    const el = $('travel-list'); el.innerHTML = '';
    list.forEach(f => { const b = document.createElement('button'); b.className = 'btn'; b.innerHTML = `▲ ${f.name} <span style="opacity:.55">· ${f.dist} m</span>`; b.onclick = () => { $('travel').classList.add('hidden'); pick(f); }; el.appendChild(b); });
    $('travel-stay').onclick = () => { $('travel').classList.add('hidden'); pick(null); };
    $('travel').classList.remove('hidden');
  };
  UI.showShop = function (who, shards, items, buy, close) {
    $('shop-who').textContent = who.toUpperCase();
    const draw = sh => { $('shop-shards').textContent = sh; const el = $('shop-list'); el.innerHTML = '';
      items.forEach(it => { const b = document.createElement('button'); const can = sh >= it.cost && (!it.ok || it.ok());
        b.className = 'btn' + (can ? '' : ' off'); b.innerHTML = `<span>${it.label}</span><span style="color:#9fd8ff">${it.cost} ◈</span>`;
        b.onclick = () => { const r = buy(it); if (r !== false) draw(r); }; el.appendChild(b); }); };
    draw(shards);
    $('shop-close').onclick = () => { $('shop').classList.add('hidden'); close(); };
    $('shop').classList.remove('hidden');
  };
  UI.shopOpen = () => !$('shop').classList.contains('hidden');
  UI.invOpen = () => !$('inv').classList.contains('hidden');
  UI.toggleInv = function (G, on) {
    const open = on === undefined ? !UI.invOpen() : on; $('inv').classList.toggle('hidden', !open); if (!open) return;
    const P = G.player, F = GW.Forge, K = GW.Knight, inv = P.inv, hex = c => '#' + c.toString(16).padStart(6, '0');
    const row = (l, r) => `<div class="row"><span>${l}</span><span>${r}</span></div>`;
    let h = '<div class="sec">CARRIED</div>' + row('<span style="color:#9fd8ff">◈</span> Shards', inv.shards || 0) + row('♥ Flasks', P.flasks + ' / ' + P.maxFlasks) + row('<span style="color:#e09040">♨</span> Kindling', inv.kindling || 0) + row('⚔ Blade', F.weaponName(P.weapon));
    const runes = Object.entries(inv.runes).filter(([, n]) => n > 0);
    h += '<div class="sec">RUNES</div>' + (runes.length ? runes.map(([k, n]) => row(`<span style="color:${hex(F.RUNES[k].color)}">${F.RUNES[k].g}</span> ${F.RUNES[k].name}`, '×' + n)).join('') : row('·', ''));
    const ing = Object.entries(inv.ingots).filter(([, n]) => n > 0);
    const ore = Object.entries(inv.ores || {}).filter(([, n]) => n > 0);
    h += '<div class="sec">ORE & FUEL (smelt at an anvil)</div>' + (ore.length ? ore.map(([k, n]) => row(`<span style="color:${hex(F.ORES[k].color)}">${F.ORES[k].g}</span> ${F.ORES[k].name}`, '×' + n)).join('') : row('·', ''));
    h += '<div class="sec">INGOTS</div>' + (ing.length ? ing.map(([k, n]) => row(`<span style="color:${hex(F.METALS[k].color)}">${F.METALS[k].glyph}</span> ${F.METALS[k].name}`, '×' + n)).join('') : row('·', ''));
    const arm = Object.keys(inv.armor || {}).map(k => { const sl = K.SLOTS.find(s => K.GEAR[s][k]); return sl ? K.GEAR[sl][k] : null; }).filter(Boolean);
    h += '<div class="sec">ARMOUR (wear it in Gear · C)</div>' + arm.map(it => row(`<span style="color:${hex(it.color)}">${K.pattern(it.set)}</span> ${it.name}`, '')).join('');
    $('inv-body').innerHTML = h;
    $('inv-close').onclick = () => UI.toggleInv(G, false);
  };
  // ---------------- Book of Glyphs: the ability loadout (B) ----------------
  UI.bookOpen = () => !$('book').classList.contains('hidden');
  let bookSel = 0;
  UI.toggleBook = function (G, on) {
    const open = on === undefined ? !UI.bookOpen() : on; $('book').classList.toggle('hidden', !open);
    if (open) UI.renderBook(G); else UI.refreshAbil();
  };
  UI.bookPick = function (G, i) { bookSel = i; UI.renderBook(G); };
  UI.renderBook = function (G) {
    const tab = UI._bookTab || 'load', pts = GW.Skills.points(G.player);
    $('bt-pts').textContent = pts ? '(' + pts + ')' : '';
    document.querySelectorAll('#book-tabs .bt').forEach(b => { b.classList.toggle('on', b.dataset.tab === tab); b.onclick = () => { UI._bookTab = b.dataset.tab; GWAudio.sfx('ui'); UI.renderBook(G); }; });
    $('book-arms').style.display = tab === 'load' ? '' : 'none'; $('book-slots').style.display = tab === 'load' ? '' : 'none';
    $('book-close').onclick = () => UI.toggleBook(G, false);
    $('book-body').classList.toggle('skills', tab === 'skills');
    if (tab === 'skills') { GW.Skills.render(G, $('book-body')); return; }
    const P = G.player, A = GW.Abil, b = A.ensure(P), atStation = G.craftStation && G.craftStation();
    // weapons: two carried, X swaps between them
    const AR = GW.Arms, ar = AR.ensure(P);
    let wh = '<div class="sec2">WEAPONS · carry two, <b>X</b> swaps · click a carried slot, then a form</div><div class="wrow">';
    wh += ar.set.map((k, i) => { const c = k && AR.CLS[k]; return `<div class="bs w${UI._armSel === i ? ' sel' : ''}${ar.act === i ? ' act' : ''}" data-w="${i}"><span class="k">${i ? 'II' : 'I'}</span><span class="g" style="color:${c ? c.col : '#555a66'}">${c ? c.g : '·'}</span><span class="n">${c ? c.name : 'empty'}${ar.act === i ? ' · in hand' : ''}</span></div>`; }).join('') + '</div><div class="wlist">';
    for (const k in AR.CLS) { const c = AR.CLS[k], own = !!ar.owned[k];
      wh += `<div class="wf${own ? '' : ' unk'}" data-f="${k}" title="${c.desc}${own ? '' : ' · ' + AR.where(k)}"><span class="g" style="color:${own ? c.col : '#4a4e5a'}">${c.g}</span> ${c.name}${own ? '' : ' <span class="dim">· ' + AR.where(k) + '</span>'}</div>`; }
    $('book-arms').innerHTML = wh + '</div>';
    if (UI._armSel === undefined) UI._armSel = 1;
    $('book-arms').querySelectorAll('[data-w]').forEach(el => el.onclick = () => { UI._armSel = +el.dataset.w; UI.renderBook(G); });
    $('book-arms').querySelectorAll('[data-f]').forEach(el => el.onclick = () => {
      const k = el.dataset.f; if (!ar.owned[k]) return; const i = UI._armSel, j = ar.set.indexOf(k);
      if (j >= 0 && j !== i) ar.set[j] = ar.set[i]; ar.set[i] = k; if (!ar.set[ar.act]) ar.act = i;
      GW.Knight.dress(P); P.recalc(); GWAudio.sfx('socket'); UI.refreshArms(); G.save(); UI.renderBook(G);
    });
    $('book-slots').innerHTML = b.slots.map((k, i) => { const a = k && A.LIST[k];
      return `<div class="bs${i === bookSel ? ' sel' : ''}" data-i="${i}"><span class="k">${i + 1}</span><span class="g" style="color:${a ? a.col : '#555a66'}">${a ? a.g : '·'}</span><span class="n">${a ? a.name : 'empty'}</span></div>`; }).join('');
    const order = Object.keys(A.LIST).sort((x, y) => (b.known[y] ? 1 : 0) - (b.known[x] ? 1 : 0));
    let h = `<div class="s-note">Pick a slot above, then an ability below. Right-click a slot to empty it. ${atStation ? '<span style="color:#ffcf6a">You can craft here.</span>' : 'Craft at a fire or an anvil.'}</div>`;
    for (const k of order) {
      const a = A.LIST[k], known = !!b.known[k], inSlot = b.slots.indexOf(k);
      let right = '';
      if (known) right = inSlot >= 0 ? `<span class="tag">slot ${inSlot + 1}</span>` : '<span class="tag dim">click to slot</span>';
      else if (a.recipe) right = `<button class="btn sm${atStation && A.canCraft(P, k) ? '' : ' off'}" data-craft="${k}">Craft</button>`;
      else right = '<span class="tag dim">not found</span>';
      h += `<div class="ab${known ? '' : ' unk'}" data-k="${k}"><span class="g" style="color:${known ? a.col : '#4a4e5a'}">${a.g}</span>
        <div class="t"><b>${a.name}</b> <span class="dim">· ${a.fo} focus · ${a.cd}s</span><br><span class="d">${a.desc}</span>
        ${known ? '' : `<br><span class="w">${a.recipe ? A.recipeText(k) : A.where(k)}</span>`}</div>${right}</div>`;
    }
    $('book-body').innerHTML = h;
    $('book-slots').querySelectorAll('.bs').forEach(el => {
      el.onclick = () => UI.bookPick(G, +el.dataset.i);
      el.oncontextmenu = ev => { ev.preventDefault(); b.slots[+el.dataset.i] = null; GWAudio.sfx('ui'); UI.renderBook(G); };
    });
    $('book-body').querySelectorAll('.ab').forEach(el => el.onclick = ev => {
      const k = el.dataset.k;
      if (ev.target.dataset.craft) {
        if (!atStation) { UI.toast('Craft at a fire or an anvil', 1.6); return; }
        if (!A.canCraft(P, k)) { UI.toast('Missing: ' + A.recipeText(k), 2.2); GWAudio.sfx('ui'); return; }
        A.craft(P, k); GWAudio.sfx('anvil'); UI.toast(`<span style="color:${A.LIST[k].col}">${A.LIST[k].g}</span> Crafted <b>${A.LIST[k].name}</b>`, 3); G.save(); UI.renderBook(G); return;
      }
      if (!b.known[k]) return;
      const old = b.slots.indexOf(k); if (old >= 0) b.slots[old] = b.slots[bookSel];
      b.slots[bookSel] = k; GWAudio.sfx('socket'); bookSel = (bookSel + 1) % 4; G.save(); UI.renderBook(G);
    });
    $('book-close').onclick = () => UI.toggleBook(G, false);
  };
  UI.travelOpen = () => !$('travel').classList.contains('hidden');
  // compass strip: cardinal points and nearby places, relative to where the camera looks
  UI.drawCompass = function (G) {
    const c = $('compass'); if (!c) return; const g = c.getContext('2d'), w = c.width, h = c.height;
    g.clearRect(0, 0, w, h);
    const yaw = UI.settings.camYaw || 0, P = G.player, FOV = Math.PI * 0.55;
    const toX = b => { const rel = Math.atan2(Math.sin(b + yaw), Math.cos(b + yaw)); return Math.abs(rel) > FOV ? null : w / 2 + rel / FOV * (w / 2 - 14); };
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 10, w, 24);
    g.strokeStyle = 'rgba(200,205,220,.25)'; g.beginPath(); g.moveTo(0, 34); g.lineTo(w, 34); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 18px ui-monospace, Menlo, monospace';
    [['N', 0], ['E', Math.PI / 2], ['S', Math.PI], ['W', -Math.PI / 2]].forEach(([s, b]) => { const x = toX(b); if (x !== null) { g.fillStyle = s === 'N' ? '#ffcf6a' : '#c8ccd8'; g.fillText(s, x, 22); } });
    for (let k = 0; k < 24; k++) { const x = toX(k / 24 * Math.PI * 2); if (x !== null && k % 6) { g.fillStyle = 'rgba(200,205,220,.4)'; g.fillRect(x, 28, 1.5, 5); } }
    const pois = G.compassPOIs ? G.compassPOIs() : [];
    g.font = '15px ui-monospace, Menlo, monospace';
    for (const p of pois) {
      const dx = p.x - P.pos.x, dz = p.z - P.pos.z, d = Math.hypot(dx, dz); if (d < 6 || d > p.range) continue;
      const x = toX(Math.atan2(dx, -dz)); if (x === null) continue;
      g.globalAlpha = GW.clamp(1.2 - d / p.range, 0.35, 1); g.fillStyle = p.col; g.fillText(p.g, x, 22);
    }
    g.globalAlpha = 1;
  };
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
  UI.initMinimap = function () { /* the world map is drawn the first time it is opened */ };
  UI.drawMinimap = function (G) {
    const c = $('minimap'), g = c.getContext('2d'), P = G.player;
    const span = 80; // world units shown
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
    if (G.dungeon) { g.fillStyle = '#5a6070'; g.font = '10px monospace'; g.textAlign = 'center'; g.fillText('underground', 64, 64); return; }
    const LM = GW.World.getLocalMap(); g.imageSmoothingEnabled = false;
    g.drawImage(LM.canvas, (P.pos.x - span / 2 - LM.x0) / LM.mpp, (P.pos.z - span / 2 - LM.z0) / LM.mpp, span / LM.mpp, span / LM.mpp, 0, 0, 128, 128);
    const to = (x, z) => [(x - P.pos.x) / span * 128 + 64, (z - P.pos.z) / span * 128 + 64];
    g.font = 'bold 10px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const it of GW.World.interact) { const [x, y] = to(it.x, it.z); if (x < 0 || y < 0 || x > 128 || y > 128) continue; g.fillStyle = it.type === 'rest' ? '#ff9a40' : '#ffcf6a'; g.fillText(it.type === 'rest' ? '▲' : it.type === 'forge' ? 'π' : '!', x, y); }
    for (const e of G.enemies) { if (!e.alive) continue; const [x, y] = to(e.pos.x, e.pos.z); if (x < 0 || y < 0 || x > 128 || y > 128) continue; g.fillStyle = e.T.boss ? '#ff4040' : '#d04040'; g.fillText(e.T.boss ? 'Ω' : '·', x, y); }
    if (G.waypoint) { let [x, y] = to(G.waypoint.x, G.waypoint.z); const dx = x - 64, dy = y - 64, d = Math.hypot(dx, dy); if (d > 56) { x = 64 + dx / d * 56; y = 64 + dy / d * 56; } g.fillStyle = '#6ae8ff'; g.fillText('✚', x, y); }
    const obj = G.objective();
    if (obj) { let [x, y] = to(obj.x, obj.z); const dx = x - 64, dy = y - 64, d = Math.hypot(dx, dy); if (d > 56) { x = 64 + dx / d * 56; y = 64 + dy / d * 56; } g.fillStyle = '#ffd860'; g.fillText('◆', x, y); }
    g.save(); g.translate(64, 64); g.rotate(-P.visYaw + Math.PI); g.fillStyle = '#fff'; g.fillText('▲', 0, 0); g.restore();
  };

  // the world map (M) lives in worldmap.js

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
  if (!UI.settings.zoom) UI.settings.zoom = 1.3;
  if (UI.settings.follow === undefined) { UI.settings.follow = true; UI.settings.camPitch = 0.74; }
  // v3: much denser glyphs, separate densities, free-aim controls by default
  if (!UI.settings.v3) {
    Object.assign(UI.settings, { v3: true, glyph: 5, glyphA: 6, glyphS: 5, control: 'free', follow: false, camYaw: 0, camPitch: 0.95, zoom: 1.1 });
  }
  if (!UI.settings.v4) Object.assign(UI.settings, { v4: true, glyph: 3.5, glyphA: 4, glyphS: 3.5 });
  if (!UI.settings.v5) Object.assign(UI.settings, { v5: true, lens: 'flat', hud: 'min' });
  if (!UI.settings.v6) Object.assign(UI.settings, { v6: true, pure: false });
  if (!UI.settings.v7) Object.assign(UI.settings, { v7: true, grassBlend: true });   // ASCII grass read as scanlines
  if (!UI.settings.v8) Object.assign(UI.settings, { v8: true, glyphT: 10, respawn: false });
  UI.settings.follow = UI.settings.control === 'follow';
  let zoomSaveT = null;
  UI.setZoom = function (z) {
    UI.settings.zoom = GW.clamp(z, 0.35, 2.2);
    const el = document.getElementById('o-zoom'); if (el) { el.value = UI.settings.zoom; document.getElementById('o-zoom-v').textContent = Math.round(UI.settings.zoom * 100) + '%'; }
    clearTimeout(zoomSaveT); zoomSaveT = setTimeout(UI.saveSettings, 400);
  };
  UI.applyControl = function () { document.body.classList.toggle('aim', UI.settings.control !== 'follow' && !I.touch); };
  UI.saveSettings = function () { try { localStorage.setItem('glyphwake.settings', JSON.stringify(UI.settings)); } catch (e) { /* ignore */ } };
  // "Source look": matches the reference clips on a 1080p+ PC screen
  UI.SOURCE_LOOK = { lens: 'flat', camPitch: 0.96, camYaw: 0, zoom: 1.1, glyphA: 4.5, glyph: 6.5, glyphS: 5, glyphT: 12, grassBlend: true, grassAscii: 0.3,
    grassSize: 0.8, flowers: 0.7, swirl: 0.85, heroPop: 0.85, dark: 0.4, groundO: 0.9, farBlend: 0.15, pure: false, control: 'free', follow: false, hud: 'min', res: 'auto' };
  UI.initSettings = function (apply) {
    const S = UI.settings;
    UI._apply = apply;
    const pct = (id, def) => { const el = $('o-' + id), txt = () => { $('o-' + id + '-v').textContent = Math.round((S[id] !== undefined ? S[id] : def) * 100) + '%'; };
      el.value = S[id] !== undefined ? S[id] : def; txt(); el.oninput = () => { S[id] = +el.value; txt(); UI.saveSettings(); }; };
    const see = $('o-see'); see.value = String(S.seeMode !== undefined ? S.seeMode : 2); see.onchange = () => { S.seeMode = +see.value; UI.saveSettings(); };
    const wx = $('o-weather'); wx.checked = S.weather !== false; wx.onchange = () => { S.weather = wx.checked; UI.saveSettings(); };
    const vd = $('o-viewdist'); vd.value = String(S.viewDist || 1); vd.onchange = () => { S.viewDist = +vd.value; UI.saveSettings(); };
    const fpsEl = $('o-fps'); fpsEl.checked = S.showFps !== false; fpsEl.onchange = () => { S.showFps = fpsEl.checked; UI.saveSettings(); };
    const ms = $('o-mapstyle'); if (ms) { ms.value = S.mapStyle || 'tour'; ms.onchange = () => { S.mapStyle = ms.value; UI.saveSettings(); }; }
    const cs = $('o-copysave'); if (cs) cs.onclick = () => {
      let txt = ''; try { txt = localStorage.getItem('glyphwake.save.v1') || ''; } catch (e) { /* storage blocked */ }
      if (!txt) { UI.toast('No save found', 2); return; }
      const done = () => UI.toast('Save copied: paste it into the chat', 3);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, () => { prompt('Copy your save:', txt); });
      else prompt('Copy your save:', txt);
    };
    const rv = $('o-reveal'); if (rv) { rv.checked = S.revealMap !== false; rv.onchange = () => { S.revealMap = rv.checked; UI.saveSettings(); }; }
    const rsp = $('o-respawn'), hun = $('o-hunts');
    rsp.checked = !!S.respawn; rsp.onchange = () => { S.respawn = rsp.checked; UI.saveSettings(); };
    hun.checked = S.nightHunts !== false; hun.onchange = () => { S.nightHunts = hun.checked; UI.saveSettings(); };
    pct('heroPop', 0.3); pct('dark', 0); pct('swirl', 0.25); pct('grassAscii', 0); pct('groundO', 0.4);
    $('o-source').onclick = () => {
      Object.assign(S, UI.SOURCE_LOOK); UI.saveSettings(); UI.applyControl(); apply(); UI.initSettings(apply);
      if (UI.toast) UI.toast('Source look applied');
    };
    const gl = $('o-glyph'), q = $('o-quality'), v = $('o-vol'), m = $('o-mus'), sh = $('o-shake'), pu = $('o-pure');
    const ti = $('o-tilt'), ctl = $('o-control');
    const ctlNote = () => { $('o-control-note').textContent = S.control === 'follow'
      ? 'The camera swings behind the knight as he runs. Hold middle mouse to look around.'
      : 'Move with WASD or the stick: the knight faces where he walks. The camera stays put. Attacks and skills go toward the mouse cursor.'; };
    ctl.value = S.control || 'free'; ctlNote();
    ctl.onchange = () => { S.control = ctl.value; S.follow = S.control === 'follow'; if (!S.follow) S.camYaw = 0; ctlNote(); UI.saveSettings(); UI.applyControl(); };
    const tiltTxt = () => { $('o-tilt-v').textContent = Math.round((S.camPitch || 0.98) * 57.3) + '°'; };
    ti.value = S.camPitch || 0.98; tiltTxt(); ti.oninput = () => { S.camPitch = +ti.value; tiltTxt(); UI.saveSettings(); };
    const zm = $('o-zoom'); zm.value = S.zoom; $('o-zoom-v').textContent = Math.round(S.zoom * 100) + '%';
    zm.oninput = () => UI.setZoom(+zm.value);
    const gr = $('o-grass'), grTxt = () => { $('o-grass-v').textContent = Math.round((S.grassSize || 1) * 100) + '%'; };
    gr.value = S.grassSize || 1; grTxt(); gr.oninput = () => { S.grassSize = +gr.value; grTxt(); UI.saveSettings(); };
    const fl = $('o-flowers'), flTxt = () => { $('o-flowers-v').textContent = Math.round((S.flowers !== undefined ? S.flowers : 0.5) * 100) + '%'; };
    fl.value = S.flowers !== undefined ? S.flowers : 0.5; flTxt(); fl.oninput = () => { S.flowers = +fl.value; flTxt(); UI.saveSettings(); };
    const tm = $('o-time'), dl = $('o-daylen'), dlTxt = () => { $('o-daylen-v').textContent = (S.dayLen || 16) + ' min'; };
    tm.value = S.time || 'cycle'; tm.onchange = () => { S.time = tm.value; UI.saveSettings(); };
    dl.value = S.dayLen || 16; dlTxt(); dl.oninput = () => { S.dayLen = +dl.value; dlTxt(); UI.saveSettings(); };
    const shd = $('o-shadows'); shd.value = S.shadows || 'soft'; shd.onchange = () => { S.shadows = shd.value; apply(); UI.saveSettings(); };
    const fb = $('o-farblend'), fbTxt = () => { $('o-farblend-v').textContent = Math.round((S.farBlend !== undefined ? S.farBlend : 0.7) * 100) + '%'; };
    fb.value = S.farBlend !== undefined ? S.farBlend : 0.7; fbTxt(); fb.oninput = () => { S.farBlend = +fb.value; fbTxt(); UI.saveSettings(); };
    const gb = $('o-gblend'); gb.checked = S.grassBlend !== false; gb.onchange = () => { S.grassBlend = gb.checked; UI.saveSettings(); };
    const ln = $('o-lens'), hd = $('o-hud');
    ln.value = S.lens || 'flat'; ln.onchange = () => { S.lens = ln.value; UI.saveSettings(); };
    hd.value = S.hud || 'min'; hd.onchange = () => { S.hud = hd.value; UI.saveSettings(); };
    const ga = $('o-glyphA'), gs = $('o-glyphS');
    ga.value = S.glyphA; $('o-glyphA-v').textContent = S.glyphA + 'px'; gs.value = S.glyphS; $('o-glyphS-v').textContent = S.glyphS + 'px';
    const gt = $('o-glyphT'); gt.value = S.glyphT || 10; $('o-glyphT-v').textContent = (S.glyphT || 10) + 'px';
    gt.oninput = () => { S.glyphT = +gt.value; $('o-glyphT-v').textContent = S.glyphT + 'px'; apply(); UI.saveSettings(); };
    ga.oninput = () => { S.glyphA = +ga.value; $('o-glyphA-v').textContent = S.glyphA + 'px'; apply(); UI.saveSettings(); };
    gs.oninput = () => { S.glyphS = +gs.value; $('o-glyphS-v').textContent = S.glyphS + 'px'; apply(); UI.saveSettings(); };
    gl.value = S.glyph; $('o-glyph-v').textContent = S.glyph + 'px'; q.value = S.quality; v.value = S.vol; m.value = S.mus; sh.checked = S.shake; pu.checked = S.pure;
    gl.oninput = () => { S.glyph = +gl.value; $('o-glyph-v').textContent = S.glyph + 'px'; apply(); UI.saveSettings(); };
    const rs = $('o-res'), resNote = () => { const R = GW.G && GW.G.R; $('o-res-note').textContent = R ? 'Rendering at ' + R.dpr.toFixed(2) + '× (' + R.W + '×' + R.H + ' px), then scaled to your screen.' : ''; };
    rs.value = S.res || 'auto'; rs.onchange = () => { S.res = rs.value; apply(); UI.saveSettings(); resNote(); };
    UI.resNote = resNote;
    q.onchange = () => { S.quality = +q.value; apply(); UI.saveSettings(); resNote(); };
    v.oninput = () => { S.vol = +v.value; apply(); UI.saveSettings(); };
    m.oninput = () => { S.mus = +m.value; apply(); UI.saveSettings(); };
    sh.onchange = () => { S.shake = sh.checked; UI.saveSettings(); };
    pu.onchange = () => { S.pure = pu.checked; apply(); UI.saveSettings(); };
  };
})();
